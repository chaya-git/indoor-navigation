#!/usr/bin/env python3
"""
=============================================================================
NAV-BOT RASPBERRY PI REAL-TIME INDOOR NAVIGATION RECEIVER
=============================================================================
Runs on your Raspberry Pi to receive real-time step-by-step navigation
telemetry from the NAV-BOT smartphone web app and drive motors accordingly.

Features:
- Listens on 0.0.0.0:5000 (POST /navigate, GET /status, POST /stop, GET /)
- Handles real-time per-step updates (STEP_DETECTED, is_live_step: True)
- Controls L298N / TB6612FNG / L9110S differential drive motors via GPIO
- Automatic Fallback: If run on a PC/Mac or without GPIO, runs in Simulation Mode
- Audio Voice Feedback: Automatically speaks turn instructions via espeak if installed
- Thread-safe non-blocking execution with preemption for live steps

Quick Start on Raspberry Pi:
  1. pip3 install flask
  2. python3 standalone_receiver.py
=============================================================================
"""

import os
import sys
import time
import json
import logging
import threading
import subprocess
from datetime import datetime
from flask import Flask, request, jsonify

# Ensure safe console printing on Windows and Linux
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ---------------------------------------------------------------------------
# HARDWARE CONFIGURATION (BCM GPIO Numbering)
# ---------------------------------------------------------------------------
HOST = "0.0.0.0"
PORT = 5000

# Left Motor Pins (H-Bridge)
LEFT_IN1 = 17   # Direction Pin 1 (BCM 17 / Physical Pin 11)
LEFT_IN2 = 27   # Direction Pin 2 (BCM 27 / Physical Pin 13)
LEFT_PWM = 22   # Speed/Enable (BCM 22 / Physical Pin 15)

# Right Motor Pins (H-Bridge)
RIGHT_IN3 = 23  # Direction Pin 3 (BCM 23 / Physical Pin 16)
RIGHT_IN4 = 24  # Direction Pin 4 (BCM 24 / Physical Pin 18)
RIGHT_PWM = 25  # Speed/Enable (BCM 25 / Physical Pin 22)

# Speed & Timing Calibration
PWM_FREQ = 1000          # 1 kHz PWM
CRUISE_SPEED_PWM = 70.0  # 0 - 100% duty cycle
TURN_SPEED_PWM = 65.0    # 0 - 100% duty cycle
METERS_PER_SECOND = 0.35 # Approx speed of chassis (m/s)
DEG_PER_SECOND = 100.0   # Approx turn speed (deg/s)

# Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("NavPi")

# ---------------------------------------------------------------------------
# HARDWARE / SIMULATION GPIO ABSTRACTION
# ---------------------------------------------------------------------------
# Optional: FAULT/DIAG output pin from a stepper driver (A4988, DRV8825,
# TB6600, etc.) or any other "something went wrong" signal wired back from
# the motor controller. Most stepper driver FAULT pins are active-LOW
# (pulled LOW when a stall/overcurrent/thermal fault occurs).
ENABLE_MOTOR_FAULT_PIN = False   # Set True once MOTOR_FAULT_PIN is wired up
MOTOR_FAULT_PIN = 26             # BCM GPIO 26 (Physical Pin 37) - change to match your wiring
MOTOR_FAULT_ACTIVE_LOW = True    # Most stepper driver FAULT pins pull LOW on fault

HAS_GPIO = False
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(LEFT_IN1, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(LEFT_IN2, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(LEFT_PWM, GPIO.OUT)
    GPIO.setup(RIGHT_IN3, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(RIGHT_IN4, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(RIGHT_PWM, GPIO.OUT)

    if ENABLE_MOTOR_FAULT_PIN:
        GPIO.setup(MOTOR_FAULT_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    pwm_left = GPIO.PWM(LEFT_PWM, PWM_FREQ)
    pwm_right = GPIO.PWM(RIGHT_PWM, PWM_FREQ)
    pwm_left.start(0)
    pwm_right.start(0)
    HAS_GPIO = True
    logger.info("[GPIO] Hardware GPIO initialized successfully. Ready to drive motors.")
except Exception as e:
    logger.warning("[SIMULATION] RPi.GPIO not available (%s). Running in SIMULATION MODE (Terminal logging only).", e)
    pwm_left = None
    pwm_right = None

def set_motors(left_dir, left_speed, right_dir, right_speed):
    """left_dir/right_dir: 1=fwd, -1=back, 0=stop. speed: 0-100%"""
    if not HAS_GPIO:
        return
    # Left motor
    if left_dir > 0:
        GPIO.output(LEFT_IN1, GPIO.HIGH)
        GPIO.output(LEFT_IN2, GPIO.LOW)
    elif left_dir < 0:
        GPIO.output(LEFT_IN1, GPIO.LOW)
        GPIO.output(LEFT_IN2, GPIO.HIGH)
    else:
        GPIO.output(LEFT_IN1, GPIO.LOW)
        GPIO.output(LEFT_IN2, GPIO.LOW)

    # Right motor
    if right_dir > 0:
        GPIO.output(RIGHT_IN3, GPIO.HIGH)
        GPIO.output(RIGHT_IN4, GPIO.LOW)
    elif right_dir < 0:
        GPIO.output(RIGHT_IN3, GPIO.LOW)
        GPIO.output(RIGHT_IN4, GPIO.HIGH)
    else:
        GPIO.output(RIGHT_IN3, GPIO.LOW)
        GPIO.output(RIGHT_IN4, GPIO.LOW)

    if pwm_left:
        pwm_left.ChangeDutyCycle(max(0.0, min(100.0, float(left_speed))))
    if pwm_right:
        pwm_right.ChangeDutyCycle(max(0.0, min(100.0, float(right_speed))))

def halt_motors():
    set_motors(0, 0, 0, 0)

def check_motor_fault():
    """
    Reads the motor/stepper driver FAULT pin, if wired and enabled.
    Returns (is_fault: bool, message: str or None).
    In simulation mode (no GPIO / not enabled) this always returns
    (False, None) unless a fault is injected via /simulate_fault.
    """
    if not (HAS_GPIO and ENABLE_MOTOR_FAULT_PIN):
        return False, None
    try:
        level = GPIO.input(MOTOR_FAULT_PIN)
        is_fault = (level == GPIO.LOW) if MOTOR_FAULT_ACTIVE_LOW else (level == GPIO.HIGH)
        if is_fault:
            return True, f"Motor driver FAULT pin (GPIO {MOTOR_FAULT_PIN}) asserted"
        return False, None
    except Exception as e:
        return True, f"Could not read motor FAULT pin: {e}"

def speak_async(text):
    """Optional audio guidance using espeak if available on Raspberry Pi."""
    def _speak():
        try:
            subprocess.run(["espeak", "-s", "155", text], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    threading.Thread(target=_speak, daemon=True).start()

# ---------------------------------------------------------------------------
# ROBOT STATE & WORKER THREAD
# ---------------------------------------------------------------------------
class RobotNavigator:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = "IDLE"
        self.is_driving = False
        self.current_step = 0
        self.total_steps = 0
        self.distance_walked_m = 0.0
        self.remaining_distance_m = 0.0
        self.destination = "None"
        self.current_instruction = "Waiting for phone navigation..."
        self.cancel_event = threading.Event()
        self.worker_thread = None

        # --- Feedback / fault-reporting state ---
        # This is what lets the phone app know "something went wrong" on
        # the robot side (stepper/motor fault, unexpected exception, etc.)
        # rather than just firing commands one-way and hoping for the best.
        self.fault_active = False
        self.last_error = None
        self.last_fault_at = None

    def get_status(self):
        with self.lock:
            return {
                "state": self.state,
                "is_driving": self.is_driving,
                "current_step": self.current_step,
                "total_steps": self.total_steps,
                "distance_walked_m": self.distance_walked_m,
                "remaining_distance_m": self.remaining_distance_m,
                "destination": self.destination,
                "current_instruction": self.current_instruction,
                "hardware_gpio": HAS_GPIO,
                "fault_active": self.fault_active,
                "last_error": self.last_error,
                "last_fault_at": self.last_fault_at
            }

    def _raise_fault(self, message):
        """Marks the robot as faulted, halts motors, and records the error
        so the next /status poll (and the /navigate response) surface it."""
        halt_motors()
        self.fault_active = True
        self.last_error = message
        self.last_fault_at = datetime.now().strftime("%H:%M:%S")
        self.state = "ERROR"
        self.is_driving = False
        logger.error("⚠️ [FAULT] %s", message)

    def simulate_fault(self, message=None):
        """Manually triggers a fault for testing the feedback path end-to-end
        without needing a real stepper stall (used by the app's Test Fault button)."""
        with self.lock:
            self.cancel_event.set()
            self._raise_fault(message or "Simulated motor fault (manual test trigger)")

    def clear_fault(self):
        """Acknowledges/clears a fault so navigation can resume."""
        with self.lock:
            self.fault_active = False
            self.last_error = None
            self.cancel_event.clear()
            if self.state == "ERROR":
                self.state = "IDLE"
            logger.info("[FAULT CLEARED] Ready to resume navigation.")

    def stop(self):
        with self.lock:
            self.cancel_event.set()
            halt_motors()
            self.state = "STOPPED"
            self.is_driving = False
            logger.info("🛑 Motors halted and active motion stopped.")

    def handle_incoming_transcript(self, data):
        """Processes real-time per-step telemetry or full route."""
        with self.lock:
            # Preempt previous move for live step updates
            self.cancel_event.set()
            halt_motors()
            self.cancel_event.clear()

            # A fresh command means we're trying again - clear any previous
            # fault so it doesn't block this attempt. If the same problem is
            # still present, _execute_payload will re-raise it immediately.
            self.fault_active = False
            self.last_error = None

            direction = data.get("direction", "")
            meters = float(data.get("meters", data.get("distance_meters", 0.70)))

            dest_obj = data.get("destination", {})
            if isinstance(dest_obj, dict):
                self.destination = dest_obj.get("label", dest_obj.get("name", "Destination"))
            else:
                self.destination = str(dest_obj) if dest_obj else "Destination"

            self.current_step = data.get("current_step_number", data.get("step_number", 1))
            self.total_steps = data.get("total_steps", 1)
            self.distance_walked_m = float(data.get("distance_walked_m", 0.0))
            self.remaining_distance_m = float(data.get("remaining_distance_m", 0.0))
            self.state = "NAVIGATING"
            self.is_driving = True

            if direction:
                self.current_instruction = f"{direction.replace('_', ' ').title()} ({meters:.1f}m)"
            else:
                steps = data.get("steps", [])
                if steps:
                    self.current_instruction = steps[0].get("instruction", "Continue")
                else:
                    self.current_instruction = data.get("event", "Step detected")

            # Launch motion in dedicated worker thread
            self.worker_thread = threading.Thread(
                target=self._execute_payload,
                args=(data,),
                daemon=True
            )
            self.worker_thread.start()

    def _execute_payload(self, data):
        try:
            self._run_steps(data)
        except Exception as e:
            # Any unexpected error while driving (bad GPIO state, a
            # disconnected driver, etc.) gets reported back to the app
            # instead of silently leaving the robot in a stuck state.
            with self.lock:
                self._raise_fault(f"Unexpected controller error: {e}")
        finally:
            with self.lock:
                self.is_driving = False

    def _run_steps(self, data):
        steps = data.get("steps", [])
        if not steps and "direction" in data:
            dist = float(data.get("meters", data.get("distance_meters", 0.70)))
            direction = str(data.get("direction", "forward")).lower()
            steps = [{
                "action": direction,
                "instruction": f"{direction.replace('_', ' ').capitalize()} for {dist:.1f}m",
                "leg_distance_m": dist,
                "simulate_fault": data.get("simulate_fault", False)
            }]
        if not steps:
            return

        for step in steps:
            if self.cancel_event.is_set():
                break

            if self.fault_active:
                # A fault already came in (e.g. via /simulate_fault) while
                # this thread was queued - don't keep driving over it.
                break

            action = str(step.get("action", data.get("direction", "forward"))).lower()
            leg_dist = float(step.get("leg_distance_m", data.get("meters", data.get("distance_meters", 0.70))))
            instruction = step.get("instruction", f"{action.replace('_', ' ').capitalize()} for {leg_dist:.1f}m")

            cmd_str = data.get("command") or step.get("instruction")
            if not cmd_str:
                if action in ("turn_left", "slight_left"):
                    cmd_str = f"turn left after {leg_dist:.1f}m"
                elif action in ("turn_right", "slight_right"):
                    cmd_str = f"turn right after {leg_dist:.1f}m"
                elif action in ("step_backward", "backward"):
                    cmd_str = f"step backward for {leg_dist:.1f}m"
                elif action == "arrive":
                    cmd_str = "arrived at destination"
                elif action == "stop":
                    cmd_str = "stop"
                else:
                    cmd_str = f"walk straight for {leg_dist:.1f}m"

            if action == "stop":
                print(f"\n🛑 [ROBOT COMMAND] -> {cmd_str}", flush=True)
            elif action == "arrive":
                print(f"\n🎉 [ROBOT COMMAND] -> {cmd_str}", flush=True)
            else:
                print(f"\n🤖 [ROBOT COMMAND] -> {cmd_str}", flush=True)

            # Speak instruction if espeak installed
            if instruction:
                speak_async(instruction)

            # Execute Physical Motor Movement
            if action in ("arrive", "stop"):
                halt_motors()
                self.state = "ARRIVED" if action == "arrive" else "STOPPED"
                self.is_driving = False
                logger.info("🛑 [HALTED] Motors stopped.")
                return

            elif action in ("step_backward", "backward"):
                duration = leg_dist / METERS_PER_SECOND
                logger.info("[REVERSE] Reversing %.2fm for %.2fs...", leg_dist, duration)
                set_motors(-1, CRUISE_SPEED_PWM, -1, CRUISE_SPEED_PWM)
                t_end = time.time() + duration
                while time.time() < t_end and not self.cancel_event.is_set():
                    time.sleep(0.02)
                halt_motors()

            elif action in ("turn_left", "slight_left"):
                turn_time = 45.0 / DEG_PER_SECOND if action == "slight_left" else 90.0 / DEG_PER_SECOND
                logger.info("[TURN LEFT] Turning Left for %.2fs...", turn_time)
                set_motors(-1, TURN_SPEED_PWM, 1, TURN_SPEED_PWM)
                t_end = time.time() + turn_time
                while time.time() < t_end and not self.cancel_event.is_set():
                    time.sleep(0.02)
                halt_motors()

            elif action in ("turn_right", "slight_right"):
                turn_time = 45.0 / DEG_PER_SECOND if action == "slight_right" else 90.0 / DEG_PER_SECOND
                logger.info("[TURN RIGHT] Turning Right for %.2fs...", turn_time)
                set_motors(1, TURN_SPEED_PWM, -1, TURN_SPEED_PWM)
                t_end = time.time() + turn_time
                while time.time() < t_end and not self.cancel_event.is_set():
                    time.sleep(0.02)
                halt_motors()

            else:
                duration = leg_dist / METERS_PER_SECOND
                logger.info("[FORWARD] Driving Forward %.2fm for %.2fs...", leg_dist, duration)
                set_motors(1, CRUISE_SPEED_PWM, 1, CRUISE_SPEED_PWM)
                t_end = time.time() + duration
                while time.time() < t_end and not self.cancel_event.is_set():
                    time.sleep(0.02)
                halt_motors()

            # --- Feedback check: did this movement segment go wrong? ---
            # Checks the real hardware FAULT pin if wired/enabled, OR a
            # "simulate_fault": true flag on the step/payload (used to test
            # the whole feedback path from the app without real hardware).
            pin_fault, pin_msg = check_motor_fault()
            step_simulated_fault = bool(step.get("simulate_fault", data.get("simulate_fault", False)))
            if pin_fault or step_simulated_fault:
                msg = pin_msg if pin_fault else f"Simulated fault during '{action}' step"
                self._raise_fault(msg)
                break

        with self.lock:
            self.is_driving = False

robot = RobotNavigator()

# ---------------------------------------------------------------------------
# FLASK REST API
# ---------------------------------------------------------------------------
app = Flask(__name__)

@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "service": "NAV-BOT Raspberry Pi Navigation Receiver",
        "status": robot.get_status(),
        "hardware_gpio_active": HAS_GPIO
    })

@app.route("/status", methods=["GET"])
def status():
    return jsonify(robot.get_status())

@app.route("/stop", methods=["POST", "OPTIONS"])
def stop_route():
    if request.method == "OPTIONS":
        return "", 200
    robot.stop()
    return jsonify({"stopped": True, "message": "Motors halted."})

@app.route("/simulate_fault", methods=["POST", "OPTIONS"])
def simulate_fault_route():
    """Manually trigger a fault, for testing the app's feedback UI without
    needing a real stepper stall or FAULT-pin wiring."""
    if request.method == "OPTIONS":
        return "", 200
    payload = request.get_json(silent=True) or {}
    robot.simulate_fault(payload.get("message"))
    return jsonify({"ok": True, "status": robot.get_status()})

@app.route("/clear_fault", methods=["POST", "OPTIONS"])
def clear_fault_route():
    """Acknowledge/clear a reported fault so navigation can resume."""
    if request.method == "OPTIONS":
        return "", 200
    robot.clear_fault()
    return jsonify({"ok": True, "status": robot.get_status()})

@app.route("/navigate", methods=["POST", "OPTIONS"])
def receive_navigation():
    if request.method == "OPTIONS":
        return "", 200

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid or empty JSON body"}), 400

    robot.handle_incoming_transcript(payload)

    return jsonify({
        "success": True,
        "step_number": robot.current_step,
        "destination": robot.destination,
        "message": f"Step {robot.current_step} received and executing",
        "status": robot.get_status()
    }), 200

# ---------------------------------------------------------------------------
# MAIN ENTRY
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("[ACTIVE] NAV-BOT RASPBERRY PI NAVIGATION RECEIVER ACTIVE")
    print("=" * 65)
    print(f"   Listening on    : http://0.0.0.0:{PORT}")
    print(f"   Endpoint        : POST /navigate")
    print(f"   Hardware GPIO   : {'ENABLED' if HAS_GPIO else 'SIMULATION MODE'}")
    print("=" * 65 + "\n")

    try:
        app.run(host=HOST, port=PORT, threaded=True)
    finally:
        halt_motors()
        if HAS_GPIO:
            GPIO.cleanup()
