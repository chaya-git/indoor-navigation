"""
motor_driver.py — Differential-Drive Motor Controller for Raspberry Pi
======================================================================
Provides clean, low-level GPIO motor control primitives:
  - drive(distance_m, speed_pwm)
  - rotate(delta_deg, speed_pwm)
  - forward(), backward(), turn_left(), turn_right(), stop()
  - emergency_stop()

Includes a seamless MockGPIO fallback so the service can run and be tested
on development laptops without a Raspberry Pi or physical motors.
"""

import time
import logging
import threading
import config

logger = logging.getLogger("navbot.motor")

# Try importing real RPi.GPIO, or fall back to simulation mock
HAS_GPIO = False
try:
    import RPi.GPIO as GPIO
    HAS_GPIO = True
    logger.info("RPi.GPIO loaded successfully (Hardware Mode).")
except (ImportError, RuntimeError):
    logger.warning("RPi.GPIO not found or not on Raspberry Pi. Running in SIMULATION MODE.")
    
    class MockGPIO:
        BCM = "BCM"
        OUT = "OUT"
        IN = "IN"
        PUD_UP = "PUD_UP"
        FALLING = "FALLING"
        HIGH = 1
        LOW = 0

        @staticmethod
        def setmode(mode): pass
        @staticmethod
        def setwarnings(flag): pass
        @staticmethod
        def setup(pin, mode, pull_up_down=None, initial=None): pass
        @staticmethod
        def output(pin, state): pass
        @staticmethod
        def input(pin): return 1
        @staticmethod
        def add_event_detect(pin, edge, callback=None, bouncetime=None): pass
        @staticmethod
        def cleanup(): pass

        class PWM:
            def __init__(self, pin, freq):
                self.pin = pin
                self.freq = freq
                self.duty = 0
            def start(self, duty): self.duty = duty
            def ChangeDutyCycle(self, duty): self.duty = duty
            def stop(self): self.duty = 0

    GPIO = MockGPIO()


class MotorDriver:
    """
    Differential-drive controller for 2 DC motors driven via H-Bridge (e.g. L298N / TB6612FNG).
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._is_stopped = True
        self._is_e_stopped = False
        self._left_pwm = None
        self._right_pwm = None
        self._cancel_current_action = False
        self._init_gpio()

    def _init_gpio(self):
        with self._lock:
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)

            # Left Motor GPIO setup
            GPIO.setup(config.LEFT_MOTOR_IN1, GPIO.OUT, initial=GPIO.LOW)
            GPIO.setup(config.LEFT_MOTOR_IN2, GPIO.OUT, initial=GPIO.LOW)
            GPIO.setup(config.LEFT_MOTOR_PWM, GPIO.OUT)

            # Right Motor GPIO setup
            GPIO.setup(config.RIGHT_MOTOR_IN3, GPIO.OUT, initial=GPIO.LOW)
            GPIO.setup(config.RIGHT_MOTOR_IN4, GPIO.OUT, initial=GPIO.LOW)
            GPIO.setup(config.RIGHT_MOTOR_PWM, GPIO.OUT)

            # Hardware PWM initialization
            self._left_pwm = GPIO.PWM(config.LEFT_MOTOR_PWM, config.PWM_FREQUENCY_HZ)
            self._right_pwm = GPIO.PWM(config.RIGHT_MOTOR_PWM, config.PWM_FREQUENCY_HZ)
            self._left_pwm.start(0)
            self._right_pwm.start(0)

            # Optional Hardware Emergency Stop Pin (active LOW button to GND)
            if config.ENABLE_HARDWARE_ESTOP:
                try:
                    GPIO.setup(config.EMERGENCY_STOP_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                    GPIO.add_event_detect(
                        config.EMERGENCY_STOP_PIN,
                        GPIO.FALLING,
                        callback=self._handle_hardware_estop,
                        bouncetime=300
                    )
                    logger.info(f"Hardware E-Stop active on GPIO {config.EMERGENCY_STOP_PIN}")
                except Exception as e:
                    logger.warning(f"Could not initialize Hardware E-Stop pin: {e}")

    def _handle_hardware_estop(self, channel=None):
        logger.critical("!!! HARDWARE EMERGENCY STOP TRIGGERED ON PIN %s !!!", channel)
        self.emergency_stop()

    def _set_motor_speeds(self, left_dir, left_speed, right_dir, right_speed):
        """
        Directly sets direction and PWM duty cycle for both motors.
        left_dir: 1 = forward, -1 = backward, 0 = brake/stop
        right_dir: 1 = forward, -1 = backward, 0 = brake/stop
        """
        if self._is_e_stopped:
            self._raw_stop()
            return

        # Left Motor
        if left_dir > 0:
            GPIO.output(config.LEFT_MOTOR_IN1, GPIO.HIGH)
            GPIO.output(config.LEFT_MOTOR_IN2, GPIO.LOW)
        elif left_dir < 0:
            GPIO.output(config.LEFT_MOTOR_IN1, GPIO.LOW)
            GPIO.output(config.LEFT_MOTOR_IN2, GPIO.HIGH)
        else:
            GPIO.output(config.LEFT_MOTOR_IN1, GPIO.LOW)
            GPIO.output(config.LEFT_MOTOR_IN2, GPIO.LOW)

        # Right Motor
        if right_dir > 0:
            GPIO.output(config.RIGHT_MOTOR_IN3, GPIO.HIGH)
            GPIO.output(config.RIGHT_MOTOR_IN4, GPIO.LOW)
        elif right_dir < 0:
            GPIO.output(config.RIGHT_MOTOR_IN3, GPIO.LOW)
            GPIO.output(config.RIGHT_MOTOR_IN4, GPIO.HIGH)
        else:
            GPIO.output(config.RIGHT_MOTOR_IN3, GPIO.LOW)
            GPIO.output(config.RIGHT_MOTOR_IN4, GPIO.LOW)

        # Duty cycles (clamped 0 to 100)
        l_pwm = max(0.0, min(100.0, float(left_speed)))
        r_pwm = max(0.0, min(100.0, float(right_speed)))

        if self._left_pwm:
            self._left_pwm.ChangeDutyCycle(l_pwm)
        if self._right_pwm:
            self._right_pwm.ChangeDutyCycle(r_pwm)

        self._is_stopped = (left_dir == 0 and right_dir == 0)

    def _raw_stop(self):
        """Immediate hardware stop without locks."""
        GPIO.output(config.LEFT_MOTOR_IN1, GPIO.LOW)
        GPIO.output(config.LEFT_MOTOR_IN2, GPIO.LOW)
        GPIO.output(config.RIGHT_MOTOR_IN3, GPIO.LOW)
        GPIO.output(config.RIGHT_MOTOR_IN4, GPIO.LOW)
        if self._left_pwm:
            self._left_pwm.ChangeDutyCycle(0)
        if self._right_pwm:
            self._right_pwm.ChangeDutyCycle(0)
        self._is_stopped = True

    # -------------------------------------------------------------------------
    # Public Motion Primitives
    # -------------------------------------------------------------------------

    def forward(self, speed_pwm=None):
        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_CRUISE_SPEED_PWM
        with self._lock:
            self._set_motor_speeds(1, speed, 1, speed)

    def backward(self, speed_pwm=None):
        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_CRUISE_SPEED_PWM
        with self._lock:
            self._set_motor_speeds(-1, speed, -1, speed)

    def turn_left(self, speed_pwm=None):
        """In-place counter-clockwise rotation."""
        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_TURN_SPEED_PWM
        with self._lock:
            self._set_motor_speeds(-1, speed, 1, speed)

    def turn_right(self, speed_pwm=None):
        """In-place clockwise rotation."""
        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_TURN_SPEED_PWM
        with self._lock:
            self._set_motor_speeds(1, speed, -1, speed)

    def stop(self):
        with self._lock:
            self._cancel_current_action = True
            self._raw_stop()

    def emergency_stop(self):
        """Hard emergency stop. Inhibits any further drive commands until reset."""
        with self._lock:
            self._is_e_stopped = True
            self._cancel_current_action = True
            self._raw_stop()
        logger.warning("Emergency stop state ENGAGED.")

    def reset_emergency_stop(self):
        with self._lock:
            self._is_e_stopped = False
            self._cancel_current_action = False
            self._raw_stop()
        logger.info("Emergency stop state cleared.")

    # -------------------------------------------------------------------------
    # High-Level Timed Dead-Reckoning Drive Functions
    # -------------------------------------------------------------------------

    def drive_distance(self, distance_m, speed_pwm=None, cancel_token=None):
        """
        Drives straight forward for `distance_m` meters based on calibrated speed.
        Returns True if completed, False if cancelled or aborted.
        """
        if distance_m <= 0:
            return True

        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_CRUISE_SPEED_PWM
        # Calculate duration
        duration_sec = distance_m / config.METERS_PER_SECOND
        logger.info(f"Driving {distance_m:.2f} m at speed {speed}% (~{duration_sec:.2f}s)")

        self._cancel_current_action = False
        self.forward(speed)

        start_time = time.time()
        completed = True

        while time.time() - start_time < duration_sec:
            if self._is_e_stopped or self._cancel_current_action or (cancel_token and cancel_token()):
                logger.info("Drive cancelled mid-action.")
                completed = False
                break
            time.sleep(0.05)

        self.stop()
        return completed

    def drive_backward(self, distance_m, speed_pwm=None, cancel_token=None):
        """
        Drives straight backward for `distance_m` meters based on calibrated speed.
        Returns True if completed, False if cancelled or aborted.
        """
        if distance_m <= 0:
            return True

        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_CRUISE_SPEED_PWM
        duration_sec = distance_m / config.METERS_PER_SECOND
        logger.info(f"Reversing {distance_m:.2f} m at speed {speed}% (~{duration_sec:.2f}s)")

        self._cancel_current_action = False
        self.backward(speed)

        start_time = time.time()
        completed = True

        while time.time() - start_time < duration_sec:
            if self._is_e_stopped or self._cancel_current_action or (cancel_token and cancel_token()):
                logger.info("Reverse drive cancelled mid-action.")
                completed = False
                break
            time.sleep(0.05)

        self.stop()
        return completed

    def rotate_angle(self, delta_deg, speed_pwm=None, cancel_token=None):
        """
        Rotates in-place by `delta_deg` degrees:
          delta_deg > 0: Clockwise (Turn Right)
          delta_deg < 0: Counter-Clockwise (Turn Left)
        Returns True if completed, False if cancelled.
        """
        if abs(delta_deg) < 1.0:
            return True

        speed = speed_pwm if speed_pwm is not None else config.DEFAULT_TURN_SPEED_PWM
        duration_sec = abs(delta_deg) / config.DEGREES_PER_SECOND
        direction_str = "RIGHT (CW)" if delta_deg > 0 else "LEFT (CCW)"
        logger.info(f"Rotating {direction_str} by {abs(delta_deg):.1f}° (~{duration_sec:.2f}s)")

        self._cancel_current_action = False
        if delta_deg > 0:
            self.turn_right(speed)
        else:
            self.turn_left(speed)

        start_time = time.time()
        completed = True

        while time.time() - start_time < duration_sec:
            if self._is_e_stopped or self._cancel_current_action or (cancel_token and cancel_token()):
                logger.info("Rotation cancelled mid-action.")
                completed = False
                break
            time.sleep(0.05)

        self.stop()
        return completed

    def cleanup(self):
        """Releases GPIO and stops all PWM."""
        with self._lock:
            self._raw_stop()
            if self._left_pwm:
                self._left_pwm.stop()
            if self._right_pwm:
                self._right_pwm.stop()
            GPIO.cleanup()
            logger.info("GPIO cleanup finished.")
