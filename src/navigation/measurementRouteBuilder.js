// =============================================================================
// MEASUREMENT-BASED CUSTOM ROUTE GENERATOR
// Automatically creates 2D/3D indoor routes from custom measurement instructions
// (e.g. "move straight 2m, take left, go straight 3m, take left, go straight 3m")
// Compatible with sensor fusion, forward/backward detection, voice, and Pi robot
// =============================================================================

import { PIXELS_PER_METER } from '../data/buildingMapData.js';

/**
 * Parses natural text measurement instructions into structured navigation segments.
 * Example inputs:
 *  - "move straight 2m take left after 3m go straight take left after 3 m"
 *  - "straight 2m, left 3m, straight 3m"
 *  - "forward 4m, turn right, 2.5m, turn left, 3m"
 */
export function parseMeasurementText(text) {
  if (!text || typeof text !== 'string') return [];

  const raw = text.toLowerCase().replace(/[,;\n\r]+/g, ' ');
  // Tokens matching directions and distances
  // Matches tokens like: "straight 2m", "move 3 meters", "left after 3m", "turn right 5m", etc.
  const segments = [];

  // Regex to match movement verbs and distances
  // Patterns like: (straight|forward|left|right|u-turn) ... (digits) (m|meter|meters)
  const pattern = /(straight|forward|ahead|left|right|turn left|turn right|slight left|slight right|u-turn|uturn|back|backward)?\s*(?:after|for|then)?\s*(?:(?:go|move|walk|take)\s*)?(?:(straight|forward|left|right|turn left|turn right|slight left|slight right|u-turn|uturn|back|backward))?\s*(?:after|for|then)?\s*(\d+(?:\.\d+)?)\s*(?:m|meter|meters)?/gi;

  let match;
  let lastIndex = 0;

  while ((match = pattern.exec(raw)) !== null) {
    const rawAction1 = (match[1] || '').trim();
    const rawAction2 = (match[2] || '').trim();
    const distStr = match[3];

    let actionStr = rawAction1 || rawAction2 || 'straight';
    // If "take left after 3m", action might be left
    if (rawAction2 && (rawAction2.includes('left') || rawAction2.includes('right') || rawAction2.includes('turn'))) {
      actionStr = rawAction2;
    } else if (rawAction1 && (rawAction1.includes('left') || rawAction1.includes('right') || rawAction1.includes('turn'))) {
      actionStr = rawAction1;
    }

    let action = 'straight';
    if (actionStr.includes('slight left')) action = 'slight_left';
    else if (actionStr.includes('slight right')) action = 'slight_right';
    else if (actionStr.includes('left')) action = 'turn_left';
    else if (actionStr.includes('right')) action = 'turn_right';
    else if (actionStr.includes('u-turn') || actionStr.includes('uturn')) action = 'u_turn';
    else if (actionStr.includes('back')) action = 'backward';
    else action = 'straight';

    const distance = distStr ? parseFloat(distStr) : 2.0;

    if (!isNaN(distance) && distance > 0) {
      segments.push({
        action,
        distance: parseFloat(distance.toFixed(2))
      });
    }

    lastIndex = pattern.lastIndex;
  }

  // Fallback: If regex didn't catch, try splitting by words
  if (segments.length === 0) {
    const parts = raw.split(/\s+/);
    let pendingAction = 'straight';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === 'left') pendingAction = 'turn_left';
      else if (p === 'right') pendingAction = 'turn_right';
      else if (p === 'straight' || p === 'forward') pendingAction = 'straight';
      else if (p === 'uturn' || p === 'u-turn') pendingAction = 'u_turn';

      const numMatch = p.match(/^(\d+(?:\.\d+)?)(?:m)?$/);
      if (numMatch) {
        segments.push({
          action: pendingAction,
          distance: parseFloat(numMatch[1])
        });
        pendingAction = 'straight';
      }
    }
  }

  return segments;
}

/**
 * Builds coordinate waypoints and turn-by-turn guidance from measurement segments.
 */
export function generateRouteFromMeasurements({
  startPos = { x: 175, y: 505 },
  initialHeadingDeg = 0,
  segments = [],
  activeMap = null,
  destinationName = 'Measured Destination'
}) {
  if (!segments || segments.length === 0) {
    return null;
  }

  const ppm = activeMap?.pixelsPerMeter || PIXELS_PER_METER;
  let currX = startPos.x;
  let currY = startPos.y;
  let currHeading = initialHeadingDeg;

  const rawWaypoints = [{
    x: Math.round(currX * 10) / 10,
    y: Math.round(currY * 10) / 10,
    name: 'Start Point',
    floor: activeMap?.floor || startPos.floor || 0
  }];

  const maneuvers = [];
  let cumulativeDist = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segDist = Math.max(0.2, seg.distance || 1.0);
    const segAction = seg.action || 'straight';

    // 1. Update heading if turn
    let turnText = 'Continue straight';
    let turnAngleDelta = 0;

    if (segAction === 'turn_left') {
      turnAngleDelta = -90;
      turnText = 'Turn left';
    } else if (segAction === 'turn_right') {
      turnAngleDelta = 90;
      turnText = 'Turn right';
    } else if (segAction === 'slight_left') {
      turnAngleDelta = -45;
      turnText = 'Slight left';
    } else if (segAction === 'slight_right') {
      turnAngleDelta = 45;
      turnText = 'Slight right';
    } else if (segAction === 'u_turn') {
      turnAngleDelta = 180;
      turnText = 'Make a U-turn';
    } else if (segAction === 'backward') {
      turnAngleDelta = 180;
      turnText = 'Step backward';
    }

    currHeading = (currHeading + turnAngleDelta + 360) % 360;

    // 2. Project forward along current heading
    // Map space: 0° = North (-Y), 90° = East (+X), 180° = South (+Y), 270° = West (-X)
    const rad = (currHeading - 90) * (Math.PI / 180);
    const stepPxTotal = segDist * ppm;

    const startLegX = currX;
    const startLegY = currY;

    // Add intermediate interpolation points every ~1.2m for smooth tracking & off-route checks
    const subSteps = Math.max(1, Math.round(segDist / 1.2));
    for (let s = 1; s <= subSteps; s++) {
      const frac = s / subSteps;
      const ptX = startLegX + Math.cos(rad) * (stepPxTotal * frac);
      const ptY = startLegY + Math.sin(rad) * (stepPxTotal * frac);

      rawWaypoints.push({
        x: Math.round(ptX * 10) / 10,
        y: Math.round(ptY * 10) / 10,
        name: s === subSteps ? `Leg ${i + 1} (${segDist}m)` : `Segment ${i + 1}`,
        floor: activeMap?.floor || startPos.floor || 0
      });
    }

    currX = startLegX + Math.cos(rad) * stepPxTotal;
    currY = startLegY + Math.sin(rad) * stepPxTotal;
    cumulativeDist += segDist;

    let instruction = '';
    if (i === 0) {
      instruction = `Head forward for ${segDist.toFixed(1)} m`;
    } else if (segAction === 'straight') {
      instruction = `Continue straight for ${segDist.toFixed(1)} m`;
    } else {
      instruction = `${turnText}, then continue for ${segDist.toFixed(1)} m`;
    }

    const nextSeg = segments[i + 1];
    let subText = 'Continue to destination';
    if (nextSeg) {
      const nextAction = nextSeg.action || 'straight';
      if (nextAction === 'turn_left') subText = `Then turn left in ${nextSeg.distance}m`;
      else if (nextAction === 'turn_right') subText = `Then turn right in ${nextSeg.distance}m`;
      else subText = `Then continue for ${nextSeg.distance}m`;
    } else {
      subText = `Arriving at ${destinationName}`;
    }

    maneuvers.push({
      maneuverIndex: i,
      stepNumber: i + 1,
      type: segAction,
      action: segAction,
      instruction,
      subText,
      startCoord: { x: Math.round(startLegX), y: Math.round(startLegY) },
      turnCoord: { x: Math.round(currX), y: Math.round(currY), label: `Turn ${i + 1}`, name: destinationName },
      legDistanceMeters: parseFloat(segDist.toFixed(1)),
      distanceMeters: parseFloat(segDist.toFixed(1)),
      cumulativeDistanceMeters: parseFloat(cumulativeDist.toFixed(1)),
      isFinalLeg: i === segments.length - 1,
      x: Math.round(currX),
      y: Math.round(currY)
    });
  }

  // Arrival maneuver
  const lastPoint = rawWaypoints[rawWaypoints.length - 1];
  maneuvers.push({
    maneuverIndex: maneuvers.length,
    stepNumber: maneuvers.length + 1,
    type: 'arrive',
    action: 'arrive',
    instruction: `Arrive at ${destinationName}`,
    subText: 'You have reached the measured destination',
    turnCoord: { x: lastPoint.x, y: lastPoint.y, label: destinationName, name: destinationName },
    startCoord: { x: lastPoint.x, y: lastPoint.y },
    legDistanceMeters: 0,
    distanceMeters: 0,
    cumulativeDistanceMeters: parseFloat(cumulativeDist.toFixed(1)),
    isFinalLeg: true,
    isArrival: true,
    x: lastPoint.x,
    y: lastPoint.y
  });

  return {
    path: rawWaypoints,
    turns: maneuvers,
    destinationCoord: {
      x: Math.round(currX),
      y: Math.round(currY),
      name: destinationName,
      label: destinationName
    },
    totalDistanceMeters: parseFloat(cumulativeDist.toFixed(1))
  };
}
