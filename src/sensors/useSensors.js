// =============================================================================
// REACT HOOK FOR DEVICE SENSORS, PEDOMETER & INDOOR DEAD RECKONING
// Google Maps-Style Accurate Map Matching, Tilt Compensation & Gyro Fusion
// Forward/Backward Motion Detection, Stationary Freezing & Noise Filtering
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Pedometer } from './pedometer.js';
import {
  smoothHeading,
  smoothPosition,
  projectDeadReckoningStep,
  projectRouteStep,
  computeTiltCompensatedHeading,
  transformMotionToWorld,
  fuseHeadingAndGyro,
  detectMovementDirection
} from './sensorFusion.js';

export function useSensors({
  initialPos = { x: 130, y: 600 },
  activeRoute = null,
  activeMap = null,
  onStepDetected,
  onHeadingChanged
} = {}) {
  const [sensorsActive, setSensorsActive] = useState(false);
  const [userPos, setUserPos] = useState(initialPos || { x: 130, y: 600 });
  const [headingDeg, setHeadingDeg] = useState(0);
  const [rawHeadingDeg, setRawHeadingDeg] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [motionMag, setMotionMag] = useState(0);
  const [cadence, setCadence] = useState(0);
  const [walkingSpeedMps, setWalkingSpeedMps] = useState(0);
  const [rawAccel, setRawAccel] = useState({ x: 0, y: 0, z: 0 });
  const [worldAccel, setWorldAccel] = useState({ east: 0, north: 0, up: 0, mapX: 0, mapY: 0, horizontalMag: 0 });
  const [gpsStatus, setGpsStatus] = useState("inactive"); // inactive | active | error
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsVelocity, setGpsVelocity] = useState({ speedMps: 0, bearingDeg: 0 });
  const [isSnapped, setIsSnapped] = useState(true);
  const [lastStepDirection, setLastStepDirection] = useState(1); // 1 = forward, -1 = backward
  const [movementState, setMovementState] = useState('stationary'); // 'forward' | 'backward' | 'stationary'
  const [directionMode, setDirectionMode] = useState('auto'); // 'auto' | 'forward' | 'backward'
  const [deviationMeters, setDeviationMeters] = useState(0);
  const [hasMotionSensor, setHasMotionSensor] = useState(false);
  const [hasOrientationSensor, setHasOrientationSensor] = useState(false);

  // Calibration state
  const [stepSensitivity, setStepSensitivity] = useState(0.60); // m/s^2 impact threshold (calibrated to reject phone shaking)
  const [stepLengthMeters, setStepLengthMeters] = useState(0.70);
  const [compassOffsetDeg, setCompassOffsetDeg] = useState(0);
  const [snapToCorridor, setSnapToCorridor] = useState(true);
  const [offRouteThresholdMeters, setOffRouteThresholdMeters] = useState(3.0);

  const pedometerRef = useRef(new Pedometer({ impactThreshold: 0.60 }));
  const targetHeadingRef = useRef(0);
  const currentHeadingRef = useRef(0);
  const gyroRateZRef = useRef(0);
  const lastGyroTimeRef = useRef(performance.now());
  const orientationDataRef = useRef({ alpha: 0, beta: 0, gamma: 0 });

  const userPosRef = useRef(userPos);
  userPosRef.current = userPos;
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;
  const activeMapRef = useRef(activeMap);
  activeMapRef.current = activeMap;
  const directionModeRef = useRef(directionMode);
  directionModeRef.current = directionMode;
  const worldAccelRef = useRef(worldAccel);
  worldAccelRef.current = worldAccel;
  const prevGpsRef = useRef(null);

  // Sync sensitivity updates
  useEffect(() => {
    pedometerRef.current.setSensitivity(stepSensitivity);
  }, [stepSensitivity]);

  const onStepDetectedRef = useRef(onStepDetected);
  onStepDetectedRef.current = onStepDetected;

  // Handle a step (advance position in heading direction or along route)
  const advanceStep = useCallback((overrideX, overrideY, stepData = {}, forceDirection = null) => {
    // If manual coordinate override (e.g. from Auto-Walk or direct map teleport)
    if (overrideX !== undefined && overrideY !== undefined) {
      setStepCount((c) => c + 1);
      setMovementState('forward');
      setLastStepDirection(1);
      const nextPos = {
        x: overrideX,
        y: overrideY,
        floor: activeMapRef.current?.floor || 0
      };
      setUserPos(nextPos);
      if (onStepDetectedRef.current) {
        onStepDetectedRef.current({
          newPos: nextPos,
          headingDeg: currentHeadingRef.current,
          stepLengthMeters,
          isForward: true,
          direction: 1,
          movementState: 'forward',
          cadence: stepData.cadence || 110,
          speedMps: stepData.intervalMs ? stepLengthMeters / (stepData.intervalMs / 1000) : 1.25
        });
      }
      return;
    }

    const current = userPosRef.current;
    const currentRoute = activeRouteRef.current;
    const currentMap = activeMapRef.current;

    // 1. Movement Direction Detection:
    // Manual override > user directionMode lock > automatic sensor fusion
    let effDirection = forceDirection;
    if (effDirection === null) {
      if (directionModeRef.current === 'forward') {
        effDirection = 1;
      } else if (directionModeRef.current === 'backward') {
        effDirection = -1;
      } else {
        // 'auto' mode: combine corridor alignment + world acceleration impulse
        effDirection = null; // Let detectMovementDirection evaluate heading & world accel
      }
    }

    const motionResult = detectMovementDirection({
      headingDeg: currentHeadingRef.current,
      activeRoute: currentRoute,
      currentCoord: current,
      worldAccel: worldAccelRef.current,
      isStationary: stepData.isStationary === true,
      forceDirection: effDirection
    });

    // If completely stationary, freeze position
    if (motionResult.direction === 0) {
      setMovementState('stationary');
      setWalkingSpeedMps(0);
      setCadence(0);
      return;
    }

    const inc = stepData.stepCountIncrement || 1;
    setStepCount((c) => c + inc);

    if (stepData.cadence) {
      setCadence(stepData.cadence);
      const intervalSec = (stepData.intervalMs || 550) / 1000;
      setWalkingSpeedMps(parseFloat((stepLengthMeters / intervalSec).toFixed(2)));
    } else {
      setCadence(110);
      setWalkingSpeedMps(1.25);
    }

    // 2. Project step along route polyline or free dead reckoning
    const effStepLength = stepLengthMeters * inc;
    let routeStepResult;
    let nextTargetPos;
    const isFwd = motionResult.direction === 1;

    if (currentRoute && currentRoute.length >= 2) {
      routeStepResult = projectRouteStep(
        current,
        currentRoute,
        currentHeadingRef.current,
        effStepLength,
        currentMap,
        effDirection,
        motionResult
      );
      nextTargetPos = { x: routeStepResult.x, y: routeStepResult.y, floor: routeStepResult.floor };
      if (routeStepResult.deviationDistanceMeters !== undefined) {
        setDeviationMeters(routeStepResult.deviationDistanceMeters);
      }
    } else {
      nextTargetPos = projectDeadReckoningStep(
        current,
        currentHeadingRef.current,
        effStepLength,
        currentMap,
        !isFwd
      );
    }

    // 3. Apply smoothing filter to prevent sudden jumps
    const smoothedNextPos = smoothPosition(current, nextTargetPos, 0.45);

    setLastStepDirection(isFwd ? 1 : -1);
    setMovementState(isFwd ? 'forward' : 'backward');
    setUserPos(smoothedNextPos);

    if (onStepDetectedRef.current) {
      onStepDetectedRef.current({
        newPos: smoothedNextPos,
        rawTargetPos: nextTargetPos,
        headingDeg: currentHeadingRef.current,
        stepLengthMeters,
        isForward: isFwd,
        direction: motionResult.direction,
        movementState: isFwd ? 'forward' : 'backward',
        cadence: stepData.cadence || 110,
        speedMps: stepData.intervalMs ? stepLengthMeters / (stepData.intervalMs / 1000) : 1.25,
        deviationMeters: routeStepResult?.deviationDistanceMeters || 0
      });
    }
  }, [stepLengthMeters]);

  // Wire pedometer callback
  useEffect(() => {
    const pedometer = pedometerRef.current;
    pedometer.onStep((stepData) => {
      let fDir = null;
      if (directionModeRef.current === 'forward') fDir = 1;
      else if (directionModeRef.current === 'backward') fDir = -1;
      advanceStep(undefined, undefined, stepData, fDir);
    });

    pedometer.onStillness(() => {
      setMovementState('stationary');
      setWalkingSpeedMps(0);
      setCadence(0);
    });
  }, [advanceStep]);

  // Motion processing listener with 3D world transformation & gyroscope capture
  const handleDeviceMotion = useCallback((event) => {
    setHasMotionSensor(true);
    const now = performance.now();
    const dt = Math.max(0.005, Math.min(0.2, (now - lastGyroTimeRef.current) / 1000));
    lastGyroTimeRef.current = now;

    // Capture Gyroscope yaw angular velocity
    if (event.rotationRate) {
      // Screen orientation: if landscape vs portrait
      const scrAngle = window.screen?.orientation?.angle || 0;
      let yawRate = event.rotationRate.alpha;
      if (scrAngle === 90) yawRate = event.rotationRate.beta;
      else if (scrAngle === 270) yawRate = -event.rotationRate.beta;
      else if (scrAngle === 180) yawRate = -event.rotationRate.alpha;

      if (typeof yawRate === 'number' && !isNaN(yawRate)) {
        gyroRateZRef.current = yawRate;
      }
    }

    // Process pedometer & dynamic impact
    const result = pedometerRef.current.processMotion(event);
    setMotionMag(result.motionMag || 0);

    if (result.isStationary) {
      setMovementState('stationary');
      setCadence(0);
      setWalkingSpeedMps(0);
    } else if (result.cadence !== undefined) {
      setCadence(result.cadence);
    }

    // Capture raw acceleration
    let x = 0, y = 0, z = 0;
    if (event.acceleration && event.acceleration.x !== null) {
      x = event.acceleration.x;
      y = event.acceleration.y;
      z = event.acceleration.z;
    } else if (event.accelerationIncludingGravity && event.accelerationIncludingGravity.x !== null) {
      x = event.accelerationIncludingGravity.x - (pedometerRef.current.gravity.x || 0);
      y = event.accelerationIncludingGravity.y - (pedometerRef.current.gravity.y || 0);
      z = event.accelerationIncludingGravity.z - (pedometerRef.current.gravity.z || 0);
    }
    const currentAccel = { x: x || 0, y: y || 0, z: z || 0 };
    setRawAccel(currentAccel);

    // Transform motion into Earth-fixed world frame & 2D map plane
    const scr = window.screen?.orientation?.angle || 0;
    const wAccel = transformMotionToWorld(currentAccel, orientationDataRef.current, scr);
    setWorldAccel(wAccel);

    // Complementary gyro fusion tick for real-time heading responsiveness
    if (gyroRateZRef.current !== 0) {
      const fused = fuseHeadingAndGyro(
        currentHeadingRef.current,
        targetHeadingRef.current,
        gyroRateZRef.current,
        dt,
        0.90
      );
      currentHeadingRef.current = fused;
    }
  }, []);

  // Orientation processing listener with 3D tilt compensation
  const handleDeviceOrientation = useCallback((event) => {
    setHasOrientationSensor(true);
    let raw = 0;

    orientationDataRef.current = {
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0
    };

    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
      // iOS Safari provides true magnetic compass heading
      raw = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      // Android / Standards: tilt compensation from 3D Euler angles
      const scr = window.screen?.orientation?.angle || 0;
      raw = computeTiltCompensatedHeading(event.alpha, event.beta, event.gamma, scr);
    }

    setRawHeadingDeg(Math.round(raw));
    const calibrated = (raw + compassOffsetDeg + 360) % 360;
    targetHeadingRef.current = calibrated;
  }, [compassOffsetDeg]);

  // Instant high-accuracy location acquisition
  const acquireInstantLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus("active");
        setGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        });
      },
      (err) => {
        console.warn("GPS Notice:", err.message);
      },
      { enableHighAccuracy: true, timeout: 2500, maximumAge: 3000 }
    );
  }, []);

  // Request & enable phone sensors
  const startTracking = async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
          const orientPerm = await DeviceOrientationEvent.requestPermission();
          if (orientPerm !== "granted") {
            console.warn("Orientation permission notice:", orientPerm);
          }
        } catch (e) {
          console.warn("DeviceOrientation permission notice:", e.message);
        }
      }

      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        try {
          const motionPerm = await DeviceMotionEvent.requestPermission();
          if (motionPerm !== "granted") {
            console.warn("Motion permission notice:", motionPerm);
          }
        } catch (e) {
          console.warn("DeviceMotion permission notice:", e.message);
        }
      }

      // Attach sensors with passive mode for smooth 60fps rendering
      if ("ondeviceorientationabsolute" in window) {
        window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, { passive: true, capture: true });
      }
      window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true, capture: true });
      window.addEventListener("devicemotion", handleDeviceMotion, { passive: true, capture: true });

      setSensorsActive(true);
      acquireInstantLocation();
      startGpsWatching();
      return true;
    } catch (err) {
      console.error("Error enabling sensors:", err);
      return false;
    }
  };

  const stopTracking = () => {
    window.removeEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
    window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
    window.removeEventListener("devicemotion", handleDeviceMotion, true);
    setSensorsActive(false);
  };

  // High accuracy GPS watching
  const startGpsWatching = () => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("active");
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        setGpsCoords({ latitude: lat, longitude: lon, accuracy: acc });

        if (prevGpsRef.current) {
          const prev = prevGpsRef.current;
          const dt = (pos.timestamp - prev.timestamp) / 1000;
          if (dt > 0.4) {
            const R = 6371000;
            const dLat = (lat - prev.lat) * (Math.PI / 180);
            const dLon = (lon - prev.lon) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(prev.lat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distM = R * c;

            if (distM > 1.0) {
              const y = Math.sin(dLon) * Math.cos(lat * (Math.PI / 180));
              const x = Math.cos(prev.lat * (Math.PI / 180)) * Math.sin(lat * (Math.PI / 180)) -
                        Math.sin(prev.lat * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) * Math.cos(dLon);
              const bearing = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
              const spd = parseFloat((distM / dt).toFixed(2));
              setGpsVelocity({ speedMps: spd, bearingDeg: Math.round(bearing) });
              prevGpsRef.current = { lat, lon, timestamp: pos.timestamp };
            }
          }
        } else {
          prevGpsRef.current = { lat, lon, timestamp: pos.timestamp };
        }
      },
      (err) => {
        console.warn("GPS Notice:", err.message);
        setGpsStatus("error");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 7000 }
    );
  };

  // Smooth compass animation loop with wrap-around interpolation
  useEffect(() => {
    let animId;
    const loop = () => {
      const smoothed = smoothHeading(currentHeadingRef.current, targetHeadingRef.current, 0.22);
      currentHeadingRef.current = smoothed;
      setHeadingDeg(Math.round(smoothed));
      if (onHeadingChanged) onHeadingChanged(smoothed);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [onHeadingChanged]);

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
      window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
      window.removeEventListener("devicemotion", handleDeviceMotion, true);
    };
  }, [handleDeviceMotion, handleDeviceOrientation]);

  // Reset position
  const resetPosition = (x, y) => {
    if (x !== undefined && y !== undefined) {
      setUserPos({ x, y, floor: activeMapRef.current?.floor || 0 });
    } else if (initialPos) {
      setUserPos(initialPos);
    }
    setStepCount(0);
    setMovementState('stationary');
    pedometerRef.current.reset();
  };

  // Update calibration
  const updateCalibration = (params = {}) => {
    if (params.stepSensitivity !== undefined) setStepSensitivity(params.stepSensitivity);
    if (params.strideLengthMeters !== undefined) setStepLengthMeters(params.strideLengthMeters);
    if (params.headingOffsetDeg !== undefined) setCompassOffsetDeg(params.headingOffsetDeg);
    if (params.snapToCorridor !== undefined) setSnapToCorridor(params.snapToCorridor);
    if (params.offRouteThresholdMeters !== undefined) setOffRouteThresholdMeters(params.offRouteThresholdMeters);
  };

  // Calibrate current heading to align with a target angle (e.g. corridor direction)
  const calibrateHeadingToTarget = (targetAngleDeg) => {
    const raw = rawHeadingDeg || 0;
    const offset = (targetAngleDeg - raw + 360) % 360;
    setCompassOffsetDeg(offset);
    targetHeadingRef.current = targetAngleDeg;
    currentHeadingRef.current = targetAngleDeg;
    setHeadingDeg(Math.round(targetAngleDeg));
  };

  // Zero orientation offset
  const zeroHeading = () => {
    const newOffset = -(rawHeadingDeg || 0);
    setCompassOffsetDeg(Math.round((newOffset + 360) % 360));
  };

  // Formatted sensorState object for App & child components
  const sensorState = {
    isTracking: sensorsActive,
    userPos: userPos || { x: 130, y: 600 },
    heading: headingDeg,
    rawHeading: rawHeadingDeg,
    stepCount,
    stepDirection: lastStepDirection,
    movementState,
    directionMode,
    distanceWalkedMeters: stepCount * stepLengthMeters,
    accelMag: motionMag,
    cadence,
    speedMps: walkingSpeedMps,
    rawAccel,
    worldAccel,
    deviationMeters,
    motionAvailable: sensorsActive && hasMotionSensor,
    orientationAvailable: sensorsActive && hasOrientationSensor,
    gpsAvailable: gpsStatus === "active",
    gpsCoords,
    gpsVelocity,
    isSnapped: snapToCorridor,
    calibrationParams: {
      strideLengthMeters: stepLengthMeters,
      stepSensitivity,
      headingOffsetDeg: compassOffsetDeg,
      snapToCorridor,
      offRouteThresholdMeters
    }
  };

  return {
    sensorState,
    startTracking,
    stopTracking,
    resetPosition,
    updateCalibration,
    calibrateHeadingToTarget,
    zeroHeading,
    directionMode,
    setDirectionMode,
    simulateStep: advanceStep,
    stepForward: () => advanceStep(undefined, undefined, {}, 1),
    stepBackward: () => advanceStep(undefined, undefined, {}, -1),
    stepStop: () => {
      setMovementState('stationary');
      setWalkingSpeedMps(0);
      setCadence(0);
    },
    deviateOffRoute: (offsetPx = 100) => {
      // For testing off-route detection
      const cur = userPosRef.current;
      const deviatedPos = { x: cur.x + offsetPx, y: cur.y + offsetPx, floor: cur.floor || 0 };
      setUserPos(deviatedPos);
      setDeviationMeters(parseFloat((offsetPx / (activeMapRef.current?.pixelsPerMeter || 20)).toFixed(2)));
    },

    // Direct property access for backwards compatibility
    sensorsActive,
    requestSensorAccess: startTracking,
    headingDeg,
    stepCount,
    motionMag,
    movementState,
    gpsStatus,
    gpsAccuracy: gpsCoords ? gpsCoords.accuracy : null,
    stepSensitivity,
    stepLengthMeters,
    compassOffsetDeg,
    offRouteThresholdMeters
  };
}

export default useSensors;
