// =============================================================================
// GOOGLE MAPS-STYLE PEDESTRIAN STEP DETECTOR & ANTI-SHAKE GAIT LOCK
// Multi-Tier Validation: Vertical Footstrike Shockwave + Peak-Valley Verification +
// Strict Human Cadence Window (440ms-920ms) + 2-Step Gait Confirmation
// Completely ignores hand shaking, fidgeting, or wrist gestures while standing still.
// =============================================================================

export class Pedometer {
  constructor(options = {}) {
    // Dynamic footstrike threshold above baseline (m/s^2)
    // Real footfalls produce distinct 0.60 to 2.2 m/s^2 vertical impact.
    // Hand jitter and slight shaking without walking is rejected.
    this.impactThreshold = options.impactThreshold || 0.60;

    // Strict human walking cadence bounds:
    // ~65 steps/min (920ms) to ~136 steps/min (440ms)
    // Faster oscillations (< 440ms) are rapid hand shakes, not walking!
    this.minStepIntervalMs = options.minStepIntervalMs || 440;
    this.maxStepIntervalMs = options.maxStepIntervalMs || 920;

    // Gravity tracking via exponential low-pass filter
    this.gravity = { x: 0, y: 0, z: 9.81 };
    this.filteredVertMotion = 0;
    this.baselineMotion = 0;

    // Sliding ring buffer for motion history & stillness detection
    this.motionBuffer = [];
    this.sampleHistory = []; // stores recent vert samples { vert, total, time }

    this.lastConfirmedStepTime = 0;
    this.stepCount = 0;
    this.cadence = 0;
    this.lastStepIntervalMs = 550;
    this.isStationary = true;
    this.stillCounter = 0;

    // Google Maps Anti-Shake Gait Lock:
    // When standing still, an isolated shake or fidget does NOT move the marker.
    // Walking unlocks only when 2 consecutive rhythmic footfalls occur within human cadence.
    this.isGaitLocked = true;
    this.pendingStepCandidate = null; // { time, accel, motionMag }

    this.onStepCallback = null;
    this.onStillnessCallback = null;
  }

  setSensitivity(threshold) {
    // Clamp to walking threshold range [0.35, 1.40]
    // 0.45 = gentle walking
    // 0.60 = normal handheld walking (rejects phone shakes)
    // 0.85 = firm footfalls / pocket walking
    this.impactThreshold = Math.max(0.35, Math.min(1.40, threshold));
  }

  reset() {
    this.gravity = { x: 0, y: 0, z: 9.81 };
    this.filteredVertMotion = 0;
    this.baselineMotion = 0;
    this.motionBuffer = [];
    this.sampleHistory = [];
    this.lastConfirmedStepTime = 0;
    this.stepCount = 0;
    this.cadence = 0;
    this.isStationary = true;
    this.isGaitLocked = true;
    this.pendingStepCandidate = null;
    this.stillCounter = 0;
  }

  onStep(callback) {
    this.onStepCallback = callback;
  }

  onStillness(callback) {
    this.onStillnessCallback = callback;
  }

  /**
   * Process incoming DeviceMotionEvent.
   * Filters out hand shakes and emits steps ONLY during genuine rhythmic walking.
   */
  processMotion(event) {
    let rawX = null, rawY = null, rawZ = null;
    let gx = this.gravity.x, gy = this.gravity.y, gz = this.gravity.z;

    // 1. Maintain gravity orientation vector
    if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x !== null) {
      gx = event.accelerationIncludingGravity.x;
      gy = event.accelerationIncludingGravity.y;
      gz = event.accelerationIncludingGravity.z;

      const alpha = 0.85;
      this.gravity.x = alpha * this.gravity.x + (1 - alpha) * gx;
      this.gravity.y = alpha * this.gravity.y + (1 - alpha) * gy;
      this.gravity.z = alpha * this.gravity.z + (1 - alpha) * gz;
    }

    // 2. Extract linear dynamic acceleration
    if (event.acceleration && event.acceleration.x !== null && event.acceleration.x !== undefined) {
      rawX = event.acceleration.x;
      rawY = event.acceleration.y;
      rawZ = event.acceleration.z;
    } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x !== null) {
      rawX = gx - this.gravity.x;
      rawY = gy - this.gravity.y;
      rawZ = gz - this.gravity.z;
    }

    if (rawX === null) {
      return {
        motionMag: 0,
        baseline: 0,
        isStep: false,
        cadence: this.cadence,
        isMoving: !this.isStationary,
        isStationary: this.isStationary,
        linearAccel: { x: 0, y: 0, z: 0 }
      };
    }

    const now = performance.now();

    // 3. Decompose into Vertical Footstrike vs Lateral Jerk:
    // In real walking, the body heel-strikes the floor, transferring force along the gravity axis.
    // In hand shaking, the motion is mostly lateral/angular wrist twist with low vertical coherence.
    const gNorm = Math.hypot(this.gravity.x, this.gravity.y, this.gravity.z) || 9.81;
    const gUnitX = this.gravity.x / gNorm;
    const gUnitY = this.gravity.y / gNorm;
    const gUnitZ = this.gravity.z / gNorm;

    // Signed acceleration along gravity (positive = downward deceleration impact)
    const vertAccelSigned = rawX * gUnitX + rawY * gUnitY + rawZ * gUnitZ;
    const vertAccelMag = Math.abs(vertAccelSigned);
    const totalMag = Math.hypot(rawX, rawY, rawZ);

    // 4. Sliding Window Stillness Gate:
    this.motionBuffer.push(vertAccelMag);
    if (this.motionBuffer.length > 16) {
      this.motionBuffer.shift();
    }

    let mean = 0;
    for (let i = 0; i < this.motionBuffer.length; i++) mean += this.motionBuffer[i];
    mean /= (this.motionBuffer.length || 1);

    let variance = 0;
    for (let i = 0; i < this.motionBuffer.length; i++) {
      const diff = this.motionBuffer[i] - mean;
      variance += diff * diff;
    }
    variance /= (this.motionBuffer.length || 1);

    const isSampleStationary = vertAccelMag < 0.18 && variance < 0.035;
    if (isSampleStationary) {
      this.stillCounter = Math.min(20, this.stillCounter + 1);
    } else {
      this.stillCounter = Math.max(0, this.stillCounter - 2);
    }

    const wasStationary = this.isStationary;
    this.isStationary = this.stillCounter >= 4;

    if (!wasStationary && this.isStationary) {
      this.isGaitLocked = true;
      this.pendingStepCandidate = null;
      this.cadence = 0;
      if (this.onStillnessCallback) {
        this.onStillnessCallback(true);
      }
    }

    // 5. Cadence Timeout (User stopped walking for > 1300ms)
    if (this.lastConfirmedStepTime > 0 && (now - this.lastConfirmedStepTime > 1300)) {
      this.cadence = 0;
      this.isGaitLocked = true;
      this.pendingStepCandidate = null;
    }

    // 6. Low-pass filter vertical motion to extract footstrike wave
    this.filteredVertMotion = this.filteredVertMotion * 0.60 + vertAccelMag * 0.40;
    this.baselineMotion = this.baselineMotion * 0.96 + this.filteredVertMotion * 0.04;
    const dynamicRise = Math.max(0, this.filteredVertMotion - this.baselineMotion);

    // 7. Maintain 5-sample ring buffer for peak + valley curve verification
    this.sampleHistory.push({
      val: dynamicRise,
      vert: vertAccelSigned,
      total: totalMag,
      accel: { x: rawX, y: rawY, z: rawZ },
      time: now
    });
    if (this.sampleHistory.length > 5) {
      this.sampleHistory.shift();
    }

    let isStepDetected = false;

    // 8. Footstrike Peak + Valley Detection
    if (this.sampleHistory.length === 5 && !this.isStationary) {
      const s0 = this.sampleHistory[0];
      const s1 = this.sampleHistory[1];
      const sPeak = this.sampleHistory[2];
      const s3 = this.sampleHistory[3];
      const s4 = this.sampleHistory[4];

      // A local peak requires rising before and falling after
      const isLocalPeak = (sPeak.val > s1.val && s1.val >= s0.val) &&
                          (sPeak.val >= s3.val && s3.val > s4.val);
      const isAboveThreshold = sPeak.val >= this.impactThreshold;

      // ANTI-SHAKE CHECK 1: Vertical vs Lateral Dominance
      // In real walking, vertical shock accounts for >= 40% of total dynamic magnitude.
      // In lateral hand shaking, horizontal jerk dominates while vertical is small.
      const isVerticalDominant = Math.abs(sPeak.vert) >= (sPeak.total * 0.38);

      // ANTI-SHAKE CHECK 2: Footstep Valley Rebound
      // Human steps exhibit a trough as weight transitions to the other foot.
      const valleyDepth = sPeak.val - Math.min(s0.val, s4.val);
      const hasFootstrikeValley = valleyDepth >= (sPeak.val * 0.35);

      if (isLocalPeak && isAboveThreshold && isVerticalDominant && hasFootstrikeValley) {
        // Potential walking impact identified!
        const timeSinceLast = now - this.lastConfirmedStepTime;

        // ANTI-SHAKE CHECK 3: Strict Human Cadence Window (440ms to 920ms)
        // If faster than 440ms, user is violently shaking the phone!
        if (this.lastConfirmedStepTime > 0 && timeSinceLast < this.minStepIntervalMs) {
          // Reject high-frequency hand vibration / shaking
          this.pendingStepCandidate = null;
        } else {
          // ANTI-SHAKE CHECK 4: Google Maps 2-Step Gait Confirmation Lock
          // When stationary, the first shake/step does NOT move the map marker.
          // It requires a 2nd step within valid human walking cadence (440ms - 920ms) to confirm walking!
          if (this.isGaitLocked) {
            if (!this.pendingStepCandidate) {
              // Store first step candidate; wait for rhythm confirmation
              this.pendingStepCandidate = {
                time: now,
                accel: sPeak.accel,
                motionMag: sPeak.total
              };
            } else {
              const candidateDt = now - this.pendingStepCandidate.time;
              if (candidateDt >= this.minStepIntervalMs && candidateDt <= this.maxStepIntervalMs) {
                // RHYTHM CONFIRMED! Two consecutive biological footsteps detected.
                this.isGaitLocked = false;
                this.lastStepIntervalMs = Math.round(candidateDt);
                this.cadence = Math.round(60000 / this.lastStepIntervalMs);
                this.lastConfirmedStepTime = now;
                this.pendingStepCandidate = null;

                // Emit confirmed walking step
                this.stepCount += 2; // Count both the initiator and this step
                isStepDetected = true;

                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  try { navigator.vibrate(35); } catch (_) {}
                }

                if (this.onStepCallback) {
                  this.onStepCallback({
                    stepCount: this.stepCount,
                    cadence: this.cadence,
                    intervalMs: this.lastStepIntervalMs,
                    motionMag: sPeak.total,
                    isStationary: false,
                    stepCountIncrement: 2
                  });
                }
              } else {
                // Not in cadence window (e.g. erratic shake), reset candidate
                this.pendingStepCandidate = {
                  time: now,
                  accel: sPeak.accel,
                  motionMag: sPeak.total
                };
              }
            }
          } else {
            // Already in confirmed walking state: verify cadence rhythm
            if (timeSinceLast <= this.maxStepIntervalMs) {
              this.lastStepIntervalMs = Math.round(timeSinceLast);
              this.cadence = Math.round(60000 / this.lastStepIntervalMs);
            } else {
              this.cadence = 100;
              this.lastStepIntervalMs = 600;
            }

            this.lastConfirmedStepTime = now;
            this.stepCount++;
            isStepDetected = true;

            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(30); } catch (_) {}
            }

            if (this.onStepCallback) {
              this.onStepCallback({
                stepCount: this.stepCount,
                cadence: this.cadence,
                intervalMs: this.lastStepIntervalMs,
                motionMag: sPeak.total,
                isStationary: false,
                stepCountIncrement: 1
              });
            }
          }
        }
      }
    }

    return {
      motionMag: parseFloat(totalMag.toFixed(2)),
      dynamicRise: parseFloat(dynamicRise.toFixed(2)),
      isStep: isStepDetected,
      cadence: this.cadence,
      stepCount: this.stepCount,
      isMoving: !this.isStationary && !this.isGaitLocked,
      isStationary: this.isStationary,
      isGaitLocked: this.isGaitLocked,
      linearAccel: { x: rawX, y: rawY, z: rawZ }
    };
  }
}

export default Pedometer;
