"use strict";

// =============================================================================
// ROBUST PEAK-AND-VALLEY PEDESTRIAN STEP DETECTOR & COMPASS
// =============================================================================

// Real human walking cadence: ~1.4 - 1.9 steps/second (520ms - 750ms per step)
const MIN_STEP_INTERVAL_MS = 520; 
const STEP_IMPACT_THRESHOLD = 1.15; // Requires an actual footfall impact (rejects hand jitter)
const STEP_VALLEY_RATIO = 0.50;     // Must fall back down after peak to confirm step
const MAX_CANDIDATE_WINDOW = 850;   // Discard if impact does not settle

let gravity = { x: 0, y: 0, z: 9.81 };
let accelHistory = [];
const ACCEL_WINDOW = 16;

let stepCandidate = null; // { peakRise, startedAt }
let lastConfirmedStepTime = 0;

function resetStepDetector() {
  accelHistory = [];
  stepCandidate = null;
  lastConfirmedStepTime = 0;
  gravity = { x: 0, y: 0, z: 9.81 };
}

function processMotion(event) {
  let x = null, y = null, z = null;

  if (event.acceleration && event.acceleration.x !== null) {
    x = event.acceleration.x;
    y = event.acceleration.y;
    z = event.acceleration.z;
  } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x !== null) {
    x = event.accelerationIncludingGravity.x;
    y = event.accelerationIncludingGravity.y;
    z = event.accelerationIncludingGravity.z;
  }

  if (x === null) return;

  // 1. Exponential low-pass filter to isolate static gravity vector
  const alpha = 0.88;
  gravity.x = alpha * gravity.x + (1 - alpha) * x;
  gravity.y = alpha * gravity.y + (1 - alpha) * y;
  gravity.z = alpha * gravity.z + (1 - alpha) * z;

  // 2. High-pass filter to isolate user dynamic movement
  const linearX = x - gravity.x;
  const linearY = y - gravity.y;
  const linearZ = z - gravity.z;
  const motionMag = Math.sqrt(linearX * linearX + linearY * linearY + linearZ * linearZ);

  const accelEl = document.getElementById("diagAccel");
  if (accelEl) accelEl.textContent = motionMag.toFixed(2);

  // 3. Track rolling baseline noise
  accelHistory.push(motionMag);
  if (accelHistory.length > ACCEL_WINDOW) accelHistory.shift();
  const baseline = accelHistory.reduce((s, v) => s + v, 0) / accelHistory.length;

  const now = performance.now();
  const rise = motionMag - baseline;

  // 4. Peak-and-Valley step verification algorithm
  if (!stepCandidate) {
    // Only start a step candidate if rise is a sharp footfall impact AND cooldown has passed
    if (rise > STEP_IMPACT_THRESHOLD && (now - lastConfirmedStepTime) > MIN_STEP_INTERVAL_MS) {
      stepCandidate = { peakRise: rise, startedAt: now };
    }
    return;
  }

  // Follow peak
  if (rise > stepCandidate.peakRise) {
    stepCandidate.peakRise = rise;
  }

  const hasSettled = rise < (stepCandidate.peakRise * STEP_VALLEY_RATIO);
  const isExpired = (now - stepCandidate.startedAt) > MAX_CANDIDATE_WINDOW;

  if (hasSettled) {
    // Confirmed genuine footstep!
    lastConfirmedStepTime = now;
    stepCandidate = null;
    onPhysicalStepDetected();
  } else if (isExpired) {
    // Discard noise / tilt that didn't settle
    stepCandidate = null;
  }
}

function processOrientation(event) {
  let heading = 0;
  if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null && event.alpha !== undefined) {
    heading = 360 - event.alpha;
  }
  state.targetHeadingDeg = (heading + 360) % 360;
  const headingEl = document.getElementById("diagHeading");
  if (headingEl) headingEl.textContent = `${Math.round(state.targetHeadingDeg)}°`;
}

async function enablePhoneSensors() {
  const btn = document.getElementById("enableSensorsBtn");
  if (state.sensorsActive) return;

  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const orientPerm = await DeviceOrientationEvent.requestPermission();
      if (orientPerm !== "granted") {
        showToast("Orientation permission denied.");
        return;
      }
    }

    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const motionPerm = await DeviceMotionEvent.requestPermission();
      if (motionPerm !== "granted") {
        showToast("Motion / step permission denied.");
        return;
      }
    }

    resetStepDetector();
    window.addEventListener("deviceorientation", processOrientation, true);
    if ("ondeviceorientationabsolute" in window) {
      window.addEventListener("deviceorientationabsolute", processOrientation, true);
    }
    window.addEventListener("devicemotion", processMotion, true);

    state.sensorsActive = true;
    if (btn) {
      btn.classList.add("active");
      btn.textContent = "📱 Active";
    }
    const gyroBadge = document.getElementById("gyroBadge");
    const gyroText = document.getElementById("gyroText");
    if (gyroBadge) gyroBadge.classList.add("active");
    if (gyroText) gyroText.textContent = "Gyro: Active";
    showToast("✅ Phone sensors active — walk at a normal pace");
  } catch (err) {
    console.error("Sensor error:", err);
    showToast("Sensor note: Tap '🚶 Take Step' to advance manually.");
  }
}

// Auto-request sensors on first touch
window.addEventListener("touchstart", () => {
  if (!state.sensorsActive) enablePhoneSensors();
}, { once: true });
