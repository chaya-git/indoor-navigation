"""
config.py — Configuration for NAV-BOT Raspberry Pi Route Follower Service
========================================================================
All hardware GPIO pin mappings, calibration constants, safety thresholds,
and server settings are centralized here.
"""

import os

# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
HOST = "0.0.0.0"
PORT = 5000
DEBUG = False

# File storage locations
BASE_DIR = os.path.expanduser("~")
ROUTES_DIR = os.path.join(BASE_DIR, "routes")
LOG_DIR = os.path.join(BASE_DIR, "logs")

# =============================================================================
# GPIO PIN MAPPINGS (BCM Numbering)
# Typical configuration for L298N / TB6612FNG / L9110S Motor Drivers
# =============================================================================

# Left Motor Pins
LEFT_MOTOR_IN1 = 17   # Direction Pin 1 (BCM GPIO 17 / Physical Pin 11)
LEFT_MOTOR_IN2 = 27   # Direction Pin 2 (BCM GPIO 27 / Physical Pin 13)
LEFT_MOTOR_PWM = 22   # Speed/Enable Pin (BCM GPIO 22 / Physical Pin 15)

# Right Motor Pins
RIGHT_MOTOR_IN3 = 23  # Direction Pin 3 (BCM GPIO 23 / Physical Pin 16)
RIGHT_MOTOR_IN4 = 24  # Direction Pin 4 (BCM GPIO 24 / Physical Pin 18)
RIGHT_MOTOR_PWM = 25  # Speed/Enable Pin (BCM GPIO 25 / Physical Pin 22)

# Safety Hardware E-Stop (Optional physical push button wired to GPIO & GND)
EMERGENCY_STOP_PIN = 4 # BCM GPIO 4 (Active LOW with internal pull-up)
ENABLE_HARDWARE_ESTOP = True

# Optional Status LED / Buzzer
STATUS_LED_PIN = 18    # BCM GPIO 18 (Blinks when driving, solid when arrived)
ENABLE_STATUS_LED = False

# =============================================================================
# CHASSIS CALIBRATION & SPEED TUNING
# =============================================================================

# PWM duty cycle (0 to 100%)
DEFAULT_CRUISE_SPEED_PWM = 70.0
DEFAULT_TURN_SPEED_PWM = 65.0

# Linear Speed Calibration:
# Measured meters traveled per second at DEFAULT_CRUISE_SPEED_PWM.
# E.g. If robot moves 1.0 meter in 3.0 seconds -> 1.0 / 3.0 = ~0.333 m/s
METERS_PER_SECOND = 0.35

# Angular / Rotation Speed Calibration:
# Measured rotation in degrees per second at DEFAULT_TURN_SPEED_PWM during in-place spin.
# E.g. If robot completes a 360-degree turn in 3.6 seconds -> 360 / 3.6 = 100.0 deg/s
DEGREES_PER_SECOND = 100.0

# PWM Frequency in Hertz
PWM_FREQUENCY_HZ = 1000

# =============================================================================
# SAFETY & VALIDATION THRESHOLDS
# =============================================================================

# Maximum allowed distance for a single leg in meters (clamp crazy inputs)
MAX_SINGLE_LEG_DISTANCE_M = 50.0
MIN_SINGLE_LEG_DISTANCE_M = 0.0

# Maximum allowed total route distance in meters
MAX_TOTAL_ROUTE_DISTANCE_M = 250.0

# Watchdog heartbeat timeout in seconds (0 to disable)
# If enabled (> 0), supervisor must POST /heartbeat periodically or motors halt.
HEARTBEAT_TIMEOUT_SEC = 12.0
ENABLE_HEARTBEAT_WATCHDOG = False

# Minimum pause duration between consecutive navigation steps (seconds)
STEP_SETTLE_DELAY_SEC = 0.4
