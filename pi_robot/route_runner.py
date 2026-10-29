"""
route_runner.py — State Machine and Step-by-Step Route Execution
================================================================
Handles parsing, sanity validation, sequential step execution, and
progress tracking for NAV-BOT JSON route transcripts.
"""

import time
import logging
import threading
from datetime import datetime
import config

logger = logging.getLogger("navbot.runner")


def normalize_angle_deg(deg):
    """Normalizes angle difference to [-180, +180] degrees."""
    d = deg % 360.0
    if d > 180.0:
        d -= 360.0
    if d < -180.0:
        d += 360.0
    return d


class RouteRunner:
    """
    Executes a multi-step navigation route transcript on the robot chassis.
    Runs asynchronously in a dedicated worker thread.
    """

    STATE_IDLE = "IDLE"
    STATE_RUNNING = "RUNNING"
    STATE_PAUSED = "PAUSED"
    STATE_ARRIVED = "ARRIVED"
    STATE_CANCELLED = "CANCELLED"
    STATE_ERROR = "ERROR"

    def __init__(self, motor_driver):
        self.motor = motor_driver
        self._lock = threading.Lock()
        
        # State tracking
        self.state = self.STATE_IDLE
        self.is_driving = False
        self.current_route_id = None
        self.total_steps = 0
        self.current_step_index = 0
        self.current_step_data = None
        self.last_error = None
        self.started_at = None
        self.completed_at = None
        
        # Safety & Watchdog
        self._cancel_requested = False
        self._last_heartbeat_time = time.time()
        self._execution_thread = None
        
        # Odometry / Heading estimate
        self.current_heading_deg = 0.0
        self.step_history = []

    def update_heartbeat(self):
        """Refreshes supervisor watchdog timestamp."""
        with self._lock:
            self._last_heartbeat_time = time.time()

    def get_status(self):
        """Returns JSON-serializable status snapshot for GET /status."""
        with self._lock:
            elapsed = (time.time() - self.started_at) if self.started_at and self.is_driving else 0.0
            return {
                "state": self.state,
                "is_driving": self.is_driving,
                "route_id": self.current_route_id,
                "current_step_index": self.current_step_index,
                "total_steps": self.total_steps,
                "progress_percent": round((self.current_step_index / max(1, self.total_steps)) * 100, 1),
                "current_step": self.current_step_data,
                "current_heading_deg": round(self.current_heading_deg, 1),
                "last_error": self.last_error,
                "elapsed_time_sec": round(elapsed, 1),
                "history_count": len(self.step_history),
            }

    def validate_transcript(self, data):
        """
        Performs strict sanity checks on input transcript JSON.
        Returns (is_valid: bool, error_msg: str)
        """
        if not isinstance(data, dict):
            return False, "Payload must be a JSON object"

        if "steps" not in data or not isinstance(data["steps"], list) or len(data["steps"]) == 0:
            return False, "Transcript missing non-empty 'steps' list"

        if "destination" not in data:
            return False, "Transcript missing 'destination' field"

        # Check total distance sanity
        total_dist = data.get("total_distance_m", 0.0)
        if total_dist < 0 or total_dist > config.MAX_TOTAL_ROUTE_DISTANCE_M:
            return False, f"Total distance {total_dist}m exceeds sane limit (0 - {config.MAX_TOTAL_ROUTE_DISTANCE_M}m)"

        # Check individual steps
        for idx, step in enumerate(data["steps"]):
            if not isinstance(step, dict):
                return False, f"Step {idx+1} is not a valid JSON object"

            action = step.get("action", "").lower()
            if not action:
                return False, f"Step {idx+1} missing 'action'"

            leg_dist = float(step.get("leg_distance_m", 0.0))
            if leg_dist < config.MIN_SINGLE_LEG_DISTANCE_M or leg_dist > config.MAX_SINGLE_LEG_DISTANCE_M:
                return False, f"Step {idx+1} leg distance {leg_dist}m out of bounds (0 - {config.MAX_SINGLE_LEG_DISTANCE_M}m)"

            heading = step.get("heading_deg")
            if heading is not None and not (-360.0 <= float(heading) <= 360.0):
                return False, f"Step {idx+1} has invalid heading: {heading}"

        return True, ""

    def start_route(self, transcript):
        """
        Initiates route execution. Rejects if already running.
        Returns (success: bool, message: str)
        """
        with self._lock:
            is_live = bool(transcript.get("is_live_step", False))
            if self.is_driving or self.state == self.STATE_RUNNING:
                if is_live:
                    logger.info("⚡ Live step update received while running; preempting previous move for new instruction.")
                    self._cancel_requested = True
                    self.motor.stop()
                    self.is_driving = False
                else:
                    return False, "Robot is already executing a route. Send POST /stop first to cancel."

            is_valid, err = self.validate_transcript(transcript)
            if not is_valid:
                return False, f"Invalid transcript: {err}"

            self.state = self.STATE_RUNNING
            self.is_driving = True
            self._cancel_requested = False
            self.last_error = None
            self.started_at = time.time()
            self.completed_at = None
            self.current_route_id = transcript.get("route_id", f"route_{int(time.time())}")
            self.total_steps = len(transcript["steps"])
            self.current_step_index = 0
            self.current_step_data = None
            self.step_history = []
            self._last_heartbeat_time = time.time()

            # Spawn worker thread
            self._execution_thread = threading.Thread(
                target=self._run_worker,
                args=(transcript,),
                daemon=True,
                name="RouteRunnerWorker"
            )
            self._execution_thread.start()

            logger.info(f"Route '{self.current_route_id}' started with {self.total_steps} steps.")
            return True, f"Route '{self.current_route_id}' started."

    def stop(self, reason="User cancelled"):
        """Immediately halts robot and cancels active route."""
        with self._lock:
            self._cancel_requested = True
            self.motor.stop()
            self.is_driving = False
            self.state = self.STATE_CANCELLED
            self.last_error = reason
            logger.warning(f"Route runner stopped: {reason}")

    def _run_worker(self, transcript):
        """Background worker executing each step in the transcript."""
        steps = transcript.get("steps", [])
        
        # Initialize initial heading if given in step 0
        if steps and "heading_deg" in steps[0] and steps[0]["heading_deg"] is not None:
            self.current_heading_deg = float(steps[0]["heading_deg"])

        try:
            for idx, step in enumerate(steps):
                with self._lock:
                    if self._cancel_requested:
                        logger.info("Worker detected cancel request. Exiting.")
                        self.state = self.STATE_CANCELLED
                        self.is_driving = False
                        return

                    self.current_step_index = idx + 1
                    self.current_step_data = step

                action = step.get("action", "forward").lower()
                leg_dist_m = float(step.get("leg_distance_m", 0.0))
                target_heading_deg = step.get("heading_deg")
                instruction = step.get("instruction", f"Step {idx+1}")

                logger.info(f"==> STEP [{idx+1}/{len(steps)}]: {action.upper()} | {instruction}")

                # 1. Heartbeat Check
                if config.ENABLE_HEARTBEAT_WATCHDOG:
                    if time.time() - self._last_heartbeat_time > config.HEARTBEAT_TIMEOUT_SEC:
                        raise RuntimeError(f"Heartbeat watchdog timed out (> {config.HEARTBEAT_TIMEOUT_SEC}s without ping)")

                # 2. Check Arrival Action
                if action == "arrive" or idx == len(steps) - 1 and leg_dist_m == 0:
                    self.motor.stop()
                    logger.info("🎉 DESTINATION REACHED: %s", transcript.get("destination", {}).get("label", "Destination"))
                    break

                # 3. Handle Turn / Heading Adjustment
                if target_heading_deg is not None:
                    target_h = float(target_heading_deg)
                    delta_angle = normalize_angle_deg(target_h - self.current_heading_deg)

                    # Only rotate if delta is significant (> 8 degrees)
                    if abs(delta_angle) >= 8.0:
                        logger.info(f"Turning {delta_angle:.1f}° from {self.current_heading_deg:.1f}° to target {target_h:.1f}°")
                        ok = self.motor.rotate_angle(
                            delta_angle,
                            cancel_token=lambda: self._cancel_requested
                        )
                        if not ok or self._cancel_requested:
                            logger.warning("Rotation aborted.")
                            return
                        
                        self.current_heading_deg = target_h
                        time.sleep(config.STEP_SETTLE_DELAY_SEC)

                # 4. Handle Forward or Backward Drive for this leg
                if leg_dist_m > 0.01:
                    if action in ("step_backward", "backward"):
                        ok = self.motor.drive_backward(
                            leg_dist_m,
                            cancel_token=lambda: self._cancel_requested
                        )
                    else:
                        ok = self.motor.drive_distance(
                            leg_dist_m,
                            cancel_token=lambda: self._cancel_requested
                        )
                    if not ok or self._cancel_requested:
                        logger.warning("Drive aborted.")
                        return

                # 5. Log Step Completion
                step_record = {
                    "seq": step.get("seq", idx + 1),
                    "action": action,
                    "leg_distance_m": leg_dist_m,
                    "to_node_label": step.get("to_node_label", "node"),
                    "completed_at": datetime.utcnow().isoformat() + "Z"
                }
                with self._lock:
                    self.step_history.append(step_record)

                # Short settle pause between moves
                time.sleep(config.STEP_SETTLE_DELAY_SEC)

            # Route Complete!
            with self._lock:
                self.state = self.STATE_ARRIVED
                self.is_driving = False
                self.completed_at = time.time()
                self.current_step_data = {"action": "arrive", "instruction": "Arrived at destination."}
                logger.info(f"✅ Route '{self.current_route_id}' finished successfully.")

        except Exception as e:
            logger.exception(f"Error during route execution: {e}")
            with self._lock:
                self.state = self.STATE_ERROR
                self.is_driving = False
                self.last_error = str(e)
            self.motor.stop()
