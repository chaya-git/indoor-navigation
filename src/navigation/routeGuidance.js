// =============================================================================
// TURN-BY-TURN GUIDANCE GENERATOR & ROUTE DEVIATION MONITOR
// =============================================================================

import { nodesById, PIXELS_PER_METER } from '../data/buildingMapData.js';
import { distBetween } from './aStar.js';

export function bearingDeg(aId, bId) {
  const a = nodesById[aId];
  const b = nodesById[bId];
  if (!a || !b) return 0;
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

export function normalizeAngle(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function classifyTurn(deltaDeg) {
  const abs = Math.abs(deltaDeg);
  const side = deltaDeg > 0 ? "right" : "left";

  if (abs < 22) return { action: "straight", text: "Continue straight", icon: "ArrowUp" };
  if (abs < 55) return { action: `slight_${side}`, text: `Slight ${side}`, icon: side === "right" ? "ArrowUpRight" : "ArrowUpLeft" };
  if (abs < 135) return { action: `turn_${side}`, text: `Turn ${side}`, icon: side === "right" ? "CornerUpRight" : "CornerUpLeft" };
  return { action: "u_turn", text: "Make a U-turn", icon: "RotateCcw" };
}

/**
 * Generates turn-by-turn navigation instructions for path.
 */
export function generateTurnByTurn(path) {
  if (!path || path.length < 2) return [];

  const instructions = [];
  let cumulativeMeters = 0;
  let prevBearing = null;

  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];
    const legDistM = distBetween(fromId, toId) / PIXELS_PER_METER;
    const bearing = bearingDeg(fromId, toId);

    const startM = cumulativeMeters;
    cumulativeMeters += legDistM;

    let turnInfo;
    let text;

    if (i === 0) {
      turnInfo = { action: "start", text: "Head forward", icon: "Navigation" };
      text = `Head forward for ${legDistM.toFixed(1)} m`;
    } else {
      const delta = normalizeAngle(bearing - prevBearing);
      turnInfo = classifyTurn(delta);
      text = turnInfo.action === "straight"
        ? `Continue straight for ${legDistM.toFixed(1)} m`
        : `${turnInfo.text}, then continue for ${legDistM.toFixed(1)} m`;
    }

    instructions.push({
      stepNumber: i + 1,
      instruction: text,
      action: turnInfo.action,
      icon: turnInfo.icon,
      legDistanceM: legDistM,
      startDistanceM: startM,
      cumulativeDistanceM: cumulativeMeters,
      targetNodeLabel: nodesById[toId]?.label || "corridor"
    });

    prevBearing = bearing;
  }

  // Arrival step
  const destNode = nodesById[path[path.length - 1]];
  instructions.push({
    stepNumber: path.length,
    instruction: `Arrive at ${destNode?.label || "destination"}`,
    action: "arrive",
    icon: "MapPin",
    legDistanceM: 0,
    startDistanceM: cumulativeMeters,
    cumulativeDistanceM: cumulativeMeters,
    targetNodeLabel: destNode?.label || "Destination",
    isArrival: true
  });

  return instructions;
}

/**
 * Checks if user coordinate has drifted off the active route path by more than thresholdMeters.
 */
export function isUserOffRoute(userCoord, path, thresholdMeters = 3.2) {
  if (!path || path.length < 2 || !userCoord) return false;

  const thresholdPx = thresholdMeters * PIXELS_PER_METER;
  let minDistancePx = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const a = nodesById[path[i]];
    const b = nodesById[path[i + 1]];
    const distToSeg = pointToSegmentDistance(userCoord, a, b);
    if (distToSeg < minDistancePx) {
      minDistancePx = distToSeg;
    }
  }

  return minDistancePx > thresholdPx;
}

function pointToSegmentDistance(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Consolidates straight corridor segments into clean, unified Google Maps maneuvers.
 */
export function generateConsolidatedManeuvers(pointPath, ppm = PIXELS_PER_METER) {
  if (!pointPath || pointPath.length < 2) return [];

  const legs = [];
  let currentLegPoints = [pointPath[0], pointPath[1]];
  let prevBearing = Math.atan2(pointPath[1].y - pointPath[0].y, pointPath[1].x - pointPath[0].x) * (180 / Math.PI);

  for (let i = 1; i < pointPath.length - 1; i++) {
    const p1 = pointPath[i];
    const p2 = pointPath[i + 1];
    const bearing = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    const angleDiff = Math.abs(normalizeAngle(bearing - prevBearing));

    // Break leg on significant turn OR when node has a specific instruction (like stairs or entrance)
    const hasSpecificInstruction = Boolean(p1.instruction) || p1.type === 'stairs' || p1.type === 'entrance';

    if (angleDiff > 32 || hasSpecificInstruction) {
      legs.push({ points: currentLegPoints });
      currentLegPoints = [p1, p2];
      prevBearing = bearing;
    } else {
      currentLegPoints.push(p2);
      prevBearing = bearing;
    }
  }
  if (currentLegPoints.length >= 2) {
    legs.push({ points: currentLegPoints });
  }

  const maneuvers = [];
  let cumulativeDist = 0;

  for (let m = 0; m < legs.length; m++) {
    const leg = legs[m];
    const startPt = leg.points[0];
    const endPt = leg.points[leg.points.length - 1];

    let legPx = 0;
    for (let k = 0; k < leg.points.length - 1; k++) {
      legPx += Math.hypot(leg.points[k + 1].x - leg.points[k].x, leg.points[k + 1].y - leg.points[k].y);
    }
    const legM = parseFloat((legPx / (ppm || PIXELS_PER_METER)).toFixed(1));
    cumulativeDist += legM;

    const labelName = endPt.label || endPt.name || 'corridor';
    let action = startPt.action || endPt.action || 'straight';
    let instruction = startPt.instruction || endPt.instruction || '';
    let upcomingTurnText = '';

    // Destination Relevance: Never mention HR Cabin if navigating to CEO Cabin
    const finalDest = pointPath[pointPath.length - 1];
    const finalDestName = finalDest?.name || finalDest?.label || '';
    if (finalDestName && !finalDestName.toLowerCase().includes('hr') && instruction.toLowerCase().includes('hr')) {
      instruction = instruction.replace(/to HR Cabin.*?, or /gi, '').replace(/walk.*to HR Cabin.*?,\s*/gi, '');
      if (instruction.toLowerCase().includes('hr')) {
        instruction = `Continue along corridor towards ${finalDestName}`;
      }
    }

    if (!instruction) {
      if (m === 0) {
        action = 'start';
        instruction = `Head forward towards ${labelName}`;
      } else {
        const prevLeg = legs[m - 1];
        const pPrev = prevLeg.points[prevLeg.points.length - 2] || prevLeg.points[0];
        const pCorner = prevLeg.points[prevLeg.points.length - 1];
        const bBefore = Math.atan2(pCorner.y - pPrev.y, pCorner.x - pPrev.x) * (180 / Math.PI);
        const bAfter = Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) * (180 / Math.PI);
        const turnClass = classifyTurn(normalizeAngle(bAfter - bBefore));
        action = endPt.action || turnClass.action;
        instruction = `${turnClass.text} towards ${labelName}`;
      }
    }

    if (m < legs.length - 1) {
      const nextLeg = legs[m + 1];
      const nextStart = nextLeg.points[0];
      const nextEnd = nextLeg.points[nextLeg.points.length - 1];
      upcomingTurnText = nextStart.instruction || nextEnd.instruction || `Then towards ${nextEnd.label || nextEnd.name || 'next corridor'}`;
    } else {
      upcomingTurnText = endPt.instruction || `Arriving at ${labelName}`;
    }

    maneuvers.push({
      maneuverIndex: m,
      stepNumber: m + 1,
      type: action,
      action,
      instruction,
      subText: upcomingTurnText,
      turnCoord: { x: endPt.x, y: endPt.y, label: labelName, name: labelName },
      startCoord: { x: startPt.x, y: startPt.y },
      legDistanceMeters: legM,
      distanceMeters: legM,
      cumulativeDistanceMeters: parseFloat(cumulativeDist.toFixed(1)),
      isFinalLeg: m === legs.length - 1,
      x: endPt.x,
      y: endPt.y
    });
  }

  // Arrival step (if last maneuver is not already arrive)
  const lastPoint = pointPath[pointPath.length - 1];
  const lastLabel = lastPoint.label || lastPoint.name || 'destination';
  const prevManeuver = maneuvers[maneuvers.length - 1];

  if (!prevManeuver || prevManeuver.action !== 'arrive') {
    maneuvers.push({
      maneuverIndex: maneuvers.length,
      stepNumber: maneuvers.length + 1,
      type: 'arrive',
      action: 'arrive',
      instruction: `Arrive at ${lastLabel}`,
      subText: 'You have reached your destination',
      turnCoord: { x: lastPoint.x, y: lastPoint.y, label: lastLabel, name: lastLabel },
      startCoord: { x: lastPoint.x, y: lastPoint.y },
      legDistanceMeters: 0,
      distanceMeters: 0,
      cumulativeDistanceMeters: parseFloat(cumulativeDist.toFixed(1)),
      isFinalLeg: true,
      isArrival: true,
      x: lastPoint.x,
      y: lastPoint.y
    });
  } else {
    prevManeuver.isFinalLeg = true;
    prevManeuver.isArrival = true;
  }

  return maneuvers;
}

export const generateTurnByTurnDirections = generateConsolidatedManeuvers;

/**
 * Calculates live physical distance and turn countdown from user coordinate.
 */
export function computeLiveManeuverProgress(userPos, maneuvers, currentManeuverIndex = 0, ppm = PIXELS_PER_METER) {
  if (!maneuvers || maneuvers.length === 0 || !userPos) {
    return {
      distanceToTurnMeters: 0,
      totalRemainingMeters: 0,
      isNearTurn: false,
      isAtTurn: false,
      isArrival: false,
      isBacktracking: false,
      matchedManeuverIndex: 0
    };
  }

  // Dynamically find closest maneuver leg based on userPos (supports both forward and backward progression)
  let matchedIndex = currentManeuverIndex;
  let minLegDist = Infinity;

  for (let m = 0; m < maneuvers.length; m++) {
    const man = maneuvers[m];
    if (man.startCoord && man.turnCoord) {
      const d = pointToSegmentDistance(userPos, man.startCoord, man.turnCoord);
      if (d < minLegDist) {
        minLegDist = d;
        matchedIndex = m;
      }
    }
  }

  const effectiveIdx = Math.max(0, Math.min(maneuvers.length - 1, matchedIndex));
  const activeManeuver = maneuvers[effectiveIdx] || {};
  const targetCoord = activeManeuver.turnCoord || {
    x: typeof activeManeuver.x === 'number' ? activeManeuver.x : (userPos ? userPos.x : 0),
    y: typeof activeManeuver.y === 'number' ? activeManeuver.y : (userPos ? userPos.y : 0)
  };

  const distPx = Math.hypot(targetCoord.x - (userPos.x || 0), targetCoord.y - (userPos.y || 0));
  const distanceToTurnMeters = parseFloat((distPx / (ppm || PIXELS_PER_METER)).toFixed(1));

  let remainingM = distanceToTurnMeters;
  for (let i = effectiveIdx + 1; i < maneuvers.length; i++) {
    remainingM += maneuvers[i].legDistanceMeters || 0;
  }

  const isBacktracking = effectiveIdx < currentManeuverIndex;

  return {
    distanceToTurnMeters,
    totalRemainingMeters: parseFloat(remainingM.toFixed(1)),
    isNearTurn: distanceToTurnMeters <= 4.0 && distanceToTurnMeters > 1.2,
    isAtTurn: distanceToTurnMeters <= 1.2,
    isArrival: activeManeuver.isArrival || (activeManeuver.isFinalLeg && distanceToTurnMeters <= 1.5),
    isBacktracking,
    matchedManeuverIndex: effectiveIdx
  };
}

export function getRouteDeviation(userCoord, path, ppm = PIXELS_PER_METER) {
  if (!path || path.length < 2 || !userCoord) {
    return { minDistancePx: 0, minDistanceMeters: 0, nearestSegmentIdx: 0 };
  }
  let minD = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const a = (typeof p1.x === 'number' && typeof p1.y === 'number') ? p1 : (nodesById[p1.id || p1] || p1);
    const b = (typeof p2.x === 'number' && typeof p2.y === 'number') ? p2 : (nodesById[p2.id || p2] || p2);
    if (!a || !b || typeof a.x !== 'number' || typeof b.x !== 'number') continue;
    const d = pointToSegmentDistance(userCoord, a, b);
    if (d < minD) {
      minD = d;
      nearestIdx = i;
    }
  }
  return {
    minDistancePx: parseFloat(minD.toFixed(1)),
    minDistanceMeters: parseFloat((minD / ppm).toFixed(2)),
    nearestSegmentIdx: nearestIdx
  };
}

export function checkOffRouteDeviation(userCoord, path, thresholdPx = 95) {
  if (!path || path.length < 2 || !userCoord) return false;
  let minD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const a = (typeof p1.x === 'number' && typeof p1.y === 'number') ? p1 : (nodesById[p1.id || p1] || p1);
    const b = (typeof p2.x === 'number' && typeof p2.y === 'number') ? p2 : (nodesById[p2.id || p2] || p2);
    if (!a || !b || typeof a.x !== 'number' || typeof b.x !== 'number') continue;
    const d = pointToSegmentDistance(userCoord, a, b);
    if (d < minD) minD = d;
  }
  return minD > thresholdPx;
}

