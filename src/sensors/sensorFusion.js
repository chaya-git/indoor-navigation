// =============================================================================
// SENSOR FUSION, PEDESTRIAN DEAD RECKONING & MAP MATCHING
// Google Maps-Style Accurate Map Matching, Bidirectional Route Progression,
// 3D Tilt-Compensated Compass Fusion & Gyroscope Stabilization
// =============================================================================

import {
  PIXELS_PER_METER as DEFAULT_PPM,
  MAP_WIDTH as DEFAULT_MAP_WIDTH,
  MAP_HEIGHT as DEFAULT_MAP_HEIGHT,
  EDGES as DEFAULT_EDGES,
  nodesById as defaultNodesById
} from '../data/buildingMapData.js';

/**
 * 3D Tilt-Compensated Compass Azimuth from Phone IMU
 * Accounts for 3D Euler angles (pitch beta, roll gamma, yaw alpha)
 * and screen orientation so heading remains accurate when the phone
 * is held at an angle in the hand while walking.
 */
export function computeTiltCompensatedHeading(alpha, beta, gamma, screenAngle = 0) {
  if (alpha === null || alpha === undefined) return 0;

  const degToRad = Math.PI / 180;
  const _x = (beta || 0) * degToRad;   // pitch (front-back tilt)
  const _y = (gamma || 0) * degToRad;  // roll (left-right tilt)
  const _z = (alpha || 0) * degToRad;  // yaw (azimuth)

  const cX = Math.cos(_x);
  const sX = Math.sin(_x);
  const cY = Math.cos(_y);
  const sY = Math.sin(_y);
  const cZ = Math.cos(_z);
  const sZ = Math.sin(_z);

  // Vector pointing along phone's top axis projected on horizontal Earth plane
  const vX = -cZ * sY - sZ * sX * cY;
  const vY = -sZ * sY + cZ * sX * cY;

  let heading = Math.atan2(vX, vY) * (180 / Math.PI);
  if (heading < 0) heading += 360;

  // Add screen orientation angle (e.g. 0 portrait, 90 landscape)
  const scr = typeof screenAngle === 'number' ? screenAngle : (window.screen?.orientation?.angle || 0);
  heading = (heading + scr + 360) % 360;

  return heading;
}

/**
 * Transforms phone body-frame linear acceleration into Earth-fixed World Frame:
 * (East, North, Up) using 3D device orientation (Euler yaw alpha, pitch beta, roll gamma).
 * Also maps to 2D Map coordinate system:
 * - Map +X is East (+East)
 * - Map +Y is South (-North in SVG / 2D Canvas)
 */
export function transformMotionToWorld(accel, orientation, screenAngle = 0) {
  if (!accel) {
    return { east: 0, north: 0, up: 0, mapX: 0, mapY: 0, horizontalMag: 0 };
  }

  const ax = accel.x || 0;
  const ay = accel.y || 0;
  const az = accel.z || 0;

  if (!orientation || orientation.alpha === null || orientation.alpha === undefined) {
    return {
      east: ax,
      north: ay,
      up: az,
      mapX: ax,
      mapY: -ay,
      horizontalMag: Math.hypot(ax, ay)
    };
  }

  const degToRad = Math.PI / 180;
  const a = (orientation.alpha || 0) * degToRad;
  const b = (orientation.beta || 0) * degToRad;
  const g = (orientation.gamma || 0) * degToRad;

  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);

  // Rotation matrix from phone body frame to world coordinate system (East, North, Up):
  // R = Rz(-alpha) * Rx(-beta) * Ry(-gamma)
  const r00 = cA * cG - sA * sB * sG;
  const r01 = -sA * cB;
  const r02 = cA * sG + sA * sB * cG;

  const r10 = sA * cG + cA * sB * sG;
  const r11 = cA * cB;
  const r12 = sA * sG - cA * sB * cG;

  const r20 = -cB * sG;
  const r21 = sB;
  const r22 = cB * cG;

  let east = r00 * ax + r01 * ay + r02 * az;
  let north = r10 * ax + r11 * ay + r12 * az;
  const up = r20 * ax + r21 * ay + r22 * az;

  // Screen rotation compensation
  if (screenAngle !== 0) {
    const sRad = -screenAngle * degToRad;
    const cS = Math.cos(sRad), sS = Math.sin(sRad);
    const e = east * cS - north * sS;
    const n = east * sS + north * cS;
    east = e;
    north = n;
  }

  return {
    east,
    north,
    up,
    mapX: east,        // Map +X is East
    mapY: -north,      // Map +Y is South (down)
    horizontalMag: Math.hypot(east, north)
  };
}

/**
 * Complementary Sensor Fusion: Blends Gyroscope Angular Velocity with Compass Orientation.
 * Eliminates high-frequency magnetic jitter indoors while tracking sudden physical turns instantly.
 */
export function fuseHeadingAndGyro(currentFusedHeading, targetCompassHeading, gyroRateZ = 0, dtSeconds = 0.016, alpha = 0.92) {
  let gyroIntegrated = currentFusedHeading;

  // Integrate gyro rotation rate if valid
  if (typeof gyroRateZ === 'number' && !isNaN(gyroRateZ) && dtSeconds > 0 && dtSeconds < 0.25) {
    // Gyro yaw angular velocity (deg/s)
    gyroIntegrated = (currentFusedHeading - gyroRateZ * dtSeconds + 360) % 360;
  }

  // Shortest angular difference between gyro heading and compass target
  let diff = (targetCompassHeading - gyroIntegrated + 540) % 360 - 180;

  // Complementary blend: gyro for fast turns + compass for absolute reference
  const blended = (gyroIntegrated + diff * (1 - alpha) + 360) % 360;
  return blended;
}

/**
 * Project a point onto a line segment [a, b].
 * Returns projected point, parameter t in [0, 1], and perpendicular distance.
 */
export function projectPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;

  if (l2 === 0) {
    return {
      x: a.x,
      y: a.y,
      t: 0,
      dist: Math.hypot(p.x - a.x, p.y - a.y)
    };
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  return {
    x: projX,
    y: projY,
    t,
    dist: Math.hypot(p.x - projX, p.y - projY)
  };
}

/**
 * Calculates new coordinates after taking one physical step
 * in the direction of headingDeg outside of an active route.
 */
export function projectDeadReckoningStep(currentCoord, headingDeg, stepLengthMeters = 0.70, activeMap = null, isBackward = false) {
  const ppm = activeMap?.pixelsPerMeter || DEFAULT_PPM;
  const mapW = activeMap?.bounds?.width || DEFAULT_MAP_WIDTH;
  const mapH = activeMap?.bounds?.height || DEFAULT_MAP_HEIGHT;

  const stepPx = stepLengthMeters * ppm * (isBackward ? -1 : 1);

  // Heading 0 = North (-Y), 90 = East (+X), 180 = South (+Y), 270 = West (-X)
  const rad = (headingDeg - 90) * (Math.PI / 180);

  const rawX = currentCoord.x + Math.cos(rad) * stepPx;
  const rawY = currentCoord.y + Math.sin(rad) * stepPx;

  // Clamp inside map boundaries with safe margin
  const margin = 20;
  const clampedX = Math.max(margin, Math.min(mapW - margin, rawX));
  const clampedY = Math.max(margin, Math.min(mapH - margin, rawY));

  // Snap to nearest corridor if within corridor snap radius
  return snapToNearestCorridor({ x: clampedX, y: clampedY, floor: currentCoord.floor || 0 }, 40, activeMap);
}

/**
 * Smooths angular transition across 0°/360° boundary.
 */
export function smoothHeading(currentHeading, targetHeading, factor = 0.22) {
  let diff = (targetHeading - currentHeading + 180) % 360 - 180;
  if (Math.abs(diff) > 0.05) {
    return (currentHeading + diff * factor + 360) % 360;
  }
  return targetHeading;
}

/**
 * Smooths 2D position transitions to avoid sudden graphical jumps (Lerp / EMA Filter).
 */
export function smoothPosition(currentPos, targetPos, factor = 0.35) {
  if (!currentPos || !targetPos) return targetPos || currentPos || { x: 0, y: 0 };
  const dx = targetPos.x - currentPos.x;
  const dy = targetPos.y - currentPos.y;
  if (Math.hypot(dx, dy) < 0.3) {
    return { x: targetPos.x, y: targetPos.y, floor: targetPos.floor ?? currentPos.floor ?? 0 };
  }
  return {
    x: parseFloat((currentPos.x + dx * factor).toFixed(2)),
    y: parseFloat((currentPos.y + dy * factor).toFixed(2)),
    floor: targetPos.floor ?? currentPos.floor ?? 0
  };
}

/**
 * Snaps coordinate to nearest corridor centerline of the active map.
 */
export function snapToNearestCorridor(point, maxSnapDistancePx = 35, activeMap = null) {
  const edges = activeMap?.edges || DEFAULT_EDGES;
  const nodes = activeMap?.nodes;
  const nodesMap = nodes ? Object.fromEntries(nodes.map((n) => [n.id, n])) : defaultNodesById;

  let bestDist = Infinity;
  let bestPoint = point;

  for (const [fromId, toId] of edges) {
    const a = nodesMap[fromId];
    const b = nodesMap[toId];
    if (!a || !b) continue;

    const proj = projectPointOnSegment(point, a, b);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestPoint = { x: proj.x, y: proj.y, floor: point.floor ?? a.floor ?? 0 };
    }
  }

  if (bestDist <= maxSnapDistancePx) {
    return bestPoint;
  }

  return point;
}

/**
 * Forward/Backward & Movement Classification using Sensor Fusion:
 * Evaluates corridor tangent vector vs heading vector and world acceleration impulse.
 * Returns:
 *  1: Progressing Forward toward destination along corridor
 * -1: Progressing Backward toward route start along corridor
 *  0: Stationary / negligible motion
 */
export function detectMovementDirection({
  headingDeg = 0,
  activeRoute = null,
  currentCoord = null,
  worldAccel = null,
  isStationary = false,
  forceDirection = null // 1 = forward, -1 = backward, null = auto
}) {
  if (isStationary) {
    return { direction: 0, isForward: true, state: 'stationary', alignment: 0 };
  }

  if (forceDirection === 1) {
    return { direction: 1, isForward: true, state: 'forward', alignment: 1 };
  }
  if (forceDirection === -1) {
    return { direction: -1, isForward: false, state: 'backward', alignment: -1 };
  }

  if (!activeRoute || activeRoute.length < 2 || !currentCoord) {
    return { direction: 1, isForward: true, state: 'forward', alignment: 1 };
  }

  // 1. Find the nearest segment along the route polyline
  let bestSegIdx = 0;
  let minSegDist = Infinity;

  for (let i = 0; i < activeRoute.length - 1; i++) {
    const a = activeRoute[i];
    const b = activeRoute[i + 1];
    const res = projectPointOnSegment(currentCoord, a, b);
    if (res.dist < minSegDist) {
      minSegDist = res.dist;
      bestSegIdx = i;
    }
  }

  const segA = activeRoute[bestSegIdx];
  const segB = activeRoute[bestSegIdx + 1];
  const segDx = segB.x - segA.x;
  const segDy = segB.y - segA.y;
  const segLen = Math.hypot(segDx, segDy);

  if (segLen < 0.001) {
    return { direction: 1, isForward: true, state: 'forward', alignment: 1 };
  }

  // Corridor unit vector pointing toward destination
  const sHatX = segDx / segLen;
  const sHatY = segDy / segLen;

  // User heading unit vector in 2D map space:
  // 0° = North = -Y, 90° = East = +X, 180° = South = +Y, 270° = West = -X
  const headingRad = (headingDeg - 90) * (Math.PI / 180);
  const uHatX = Math.cos(headingRad);
  const uHatY = Math.sin(headingRad);

  // Heading alignment: dot product of user facing direction and corridor forward direction
  const headingAlignment = uHatX * sHatX + uHatY * sHatY;

  // World acceleration impulse along corridor (if worldAccel is available)
  let accelAlignment = 0;
  if (worldAccel && (Math.abs(worldAccel.mapX || 0) > 0.05 || Math.abs(worldAccel.mapY || 0) > 0.05)) {
    const aX = worldAccel.mapX || 0;
    const aY = worldAccel.mapY || 0;
    const aMag = Math.hypot(aX, aY);
    if (aMag > 0.05) {
      accelAlignment = (aX * sHatX + aY * sHatY) / aMag;
    }
  }

  // Direction Decision Logic:
  // - If user is facing backward along the corridor (alignment < -0.15, angle > 98°),
  //   walking in that direction moves backward along the route towards start!
  // - If user is facing forward (alignment > 0.15) but acceleration impulse is strongly negative
  //   (stepping backward without turning around), direction is backward (-1).
  // - Otherwise, user is moving forward toward destination (+1).
  let direction = 1;

  if (headingAlignment < -0.15) {
    // Turned around, walking away from destination along route
    direction = -1;
  } else if (headingAlignment > 0.20 && accelAlignment < -0.55) {
    // Facing forward but taking reverse steps backwards
    direction = -1;
  } else {
    direction = 1;
  }

  return {
    direction,
    isForward: direction === 1,
    state: direction === 1 ? 'forward' : 'backward',
    alignment: headingAlignment,
    segmentIndex: bestSegIdx
  };
}

/**
 * Route-Constrained Dead Reckoning (Google Maps Map-Matching Algorithm).
 * Accurately handles BOTH forward and backward motion along the route:
 * - If user moves forward: advances forward along the polyline towards destination.
 * - If user moves backward: decreases position along the polyline towards start.
 * - If user is stationary: freezes position completely with zero drift.
 * - If user walks off-corridor: calculates deviation distance so dynamic rerouting can fire.
 */
export function projectRouteStep(
  currentCoord,
  activeRoute,
  headingDeg,
  stepLengthMeters = 0.70,
  activeMap = null,
  forceDirection = null,
  motionState = null
) {
  if (!activeRoute || activeRoute.length < 2) {
    const isBack = forceDirection === -1;
    return projectDeadReckoningStep(currentCoord, headingDeg, stepLengthMeters, activeMap, isBack);
  }

  const ppm = activeMap?.pixelsPerMeter || DEFAULT_PPM;
  const stepPx = Math.abs(stepLengthMeters) * ppm;

  // 1. Find the nearest segment along the route polyline
  let bestSegIdx = 0;
  let minSegDist = Infinity;
  let bestProj = currentCoord;

  for (let i = 0; i < activeRoute.length - 1; i++) {
    const a = activeRoute[i];
    const b = activeRoute[i + 1];
    const res = projectPointOnSegment(currentCoord, a, b);
    if (res.dist < minSegDist) {
      minSegDist = res.dist;
      bestSegIdx = i;
      bestProj = { x: res.x, y: res.y, t: res.t };
    }
  }

  // 2. Determine forward vs backward alignment
  let movement;
  if (motionState) {
    movement = motionState;
  } else {
    movement = detectMovementDirection({
      headingDeg,
      activeRoute,
      currentCoord,
      isStationary: false,
      forceDirection
    });
  }

  const isStationary = movement.direction === 0;
  const isForward = movement.direction === 1;

  // If stationary, freeze position immediately at projection
  if (isStationary) {
    const activeFloor = activeRoute[bestSegIdx]?.floor ?? currentCoord.floor ?? 0;
    return {
      x: Math.round(bestProj.x * 10) / 10,
      y: Math.round(bestProj.y * 10) / 10,
      floor: activeFloor,
      isForward: true,
      direction: 'stationary',
      signedDisplacementMeters: 0,
      segmentIndex: bestSegIdx,
      deviationDistancePx: parseFloat(minSegDist.toFixed(1)),
      deviationDistanceMeters: parseFloat((minSegDist / ppm).toFixed(2))
    };
  }

  // 3. Move along the route polyline according to direction (forward or backward)
  let remainingPx = stepPx;
  let currIdx = bestSegIdx;
  let currPoint = { x: bestProj.x, y: bestProj.y };

  if (isForward) {
    // ADVANCE FORWARD TOWARDS DESTINATION
    while (remainingPx > 0 && currIdx < activeRoute.length - 1) {
      const nextTarget = activeRoute[currIdx + 1];
      const distToNext = Math.hypot(nextTarget.x - currPoint.x, nextTarget.y - currPoint.y);

      if (distToNext <= remainingPx) {
        remainingPx -= distToNext;
        currPoint = { x: nextTarget.x, y: nextTarget.y };
        currIdx += 1;
      } else {
        const ratio = remainingPx / distToNext;
        currPoint = {
          x: currPoint.x + (nextTarget.x - currPoint.x) * ratio,
          y: currPoint.y + (nextTarget.y - currPoint.y) * ratio
        };
        remainingPx = 0;
      }
    }
  } else {
    // BACK UP BACKWARDS TOWARDS START
    while (remainingPx > 0 && currIdx >= 0) {
      const prevTarget = activeRoute[currIdx]; // Start of current segment
      const distToPrev = Math.hypot(prevTarget.x - currPoint.x, prevTarget.y - currPoint.y);

      if (distToPrev <= remainingPx) {
        remainingPx -= distToPrev;
        currPoint = { x: prevTarget.x, y: prevTarget.y };
        currIdx -= 1;
      } else {
        const ratio = remainingPx / distToPrev;
        currPoint = {
          x: currPoint.x + (prevTarget.x - currPoint.x) * ratio,
          y: currPoint.y + (prevTarget.y - currPoint.y) * ratio
        };
        remainingPx = 0;
      }
    }
  }

  // Determine current floor from nearest waypoint on polyline
  const safeIdx = Math.max(0, Math.min(activeRoute.length - 1, currIdx));
  const activeFloor = activeRoute[safeIdx]?.floor ?? currentCoord.floor ?? 0;

  return {
    x: Math.round(currPoint.x * 10) / 10,
    y: Math.round(currPoint.y * 10) / 10,
    floor: activeFloor,
    isForward,
    direction: isForward ? 'forward' : 'backward',
    signedDisplacementMeters: isForward ? stepLengthMeters : -stepLengthMeters,
    segmentIndex: Math.max(0, Math.min(activeRoute.length - 2, currIdx)),
    deviationDistancePx: parseFloat(minSegDist.toFixed(1)),
    deviationDistanceMeters: parseFloat((minSegDist / ppm).toFixed(2))
  };
}

/**
 * Calculates remaining physical distance along the route from user coordinate.
 */
export function calculateRemainingRouteDistance(userCoord, activeRoute, activeMap = null) {
  if (!activeRoute || activeRoute.length < 2 || !userCoord) {
    return { remainingMeters: 0, distanceToNextWaypointMeters: 0, nearestSegmentIdx: 0 };
  }

  const ppm = activeMap?.pixelsPerMeter || DEFAULT_PPM;

  let bestIdx = 0;
  let minDist = Infinity;
  let projCoord = userCoord;

  for (let i = 0; i < activeRoute.length - 1; i++) {
    const a = activeRoute[i];
    const b = activeRoute[i + 1];
    const res = projectPointOnSegment(userCoord, a, b);
    if (res.dist < minDist) {
      minDist = res.dist;
      bestIdx = i;
      projCoord = { x: res.x, y: res.y };
    }
  }

  const nextWp = activeRoute[bestIdx + 1];
  const distToNextWpPx = Math.hypot(nextWp.x - projCoord.x, nextWp.y - projCoord.y);
  let remainingPx = distToNextWpPx;

  for (let j = bestIdx + 1; j < activeRoute.length - 1; j++) {
    remainingPx += Math.hypot(activeRoute[j + 1].x - activeRoute[j].x, activeRoute[j + 1].y - activeRoute[j].y);
  }

  return {
    remainingMeters: parseFloat((remainingPx / ppm).toFixed(1)),
    distanceToNextWaypointMeters: parseFloat((distToNextWpPx / ppm).toFixed(1)),
    nearestSegmentIdx: bestIdx,
    deviationMeters: parseFloat((minDist / ppm).toFixed(2))
  };
}
