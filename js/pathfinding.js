"use strict";

// =============================================================================
// A* PATHFINDING & TURN-BY-TURN DIRECTIONS
// =============================================================================

function dist(aId, bId) {
  const a = nodesById[aId], b = nodesById[bId];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aStar(start, goal) {
  const open = new Set([start]);
  const cameFrom = {};
  const g = {}; NODES.forEach(n => (g[n.id] = Infinity)); g[start] = 0;
  const f = {}; NODES.forEach(n => (f[n.id] = Infinity)); f[start] = dist(start, goal);

  while (open.size) {
    let current = null;
    for (const id of open) if (current === null || f[id] < f[current]) current = id;

    if (current === goal) {
      const path = [current];
      while (cameFrom[current] !== undefined) {
        current = cameFrom[current];
        path.unshift(current);
      }
      return path;
    }

    open.delete(current);
    for (const nb of adjacency[current]) {
      const tentative = g[current] + dist(current, nb);
      if (tentative < g[nb]) {
        cameFrom[nb] = current;
        g[nb] = tentative;
        f[nb] = tentative + dist(nb, goal);
        open.add(nb);
      }
    }
  }
  return [];
}

function pathLength(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += dist(path[i], path[i + 1]);
  return total;
}

function positionAlong(path, t) {
  if (!path.length) return { x: 0, y: 0 };
  if (path.length === 1) return { ...nodesById[path[0]] };

  const total = pathLength(path);
  if (total === 0) return { ...nodesById[path[0]] };

  const target = Math.max(0, Math.min(1, t)) * total;
  let covered = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = nodesById[path[i]], b = nodesById[path[i + 1]];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= covered + segLen || i === path.length - 2) {
      const segT = segLen === 0 ? 0 : Math.max(0, Math.min(1, (target - covered) / segLen));
      return {
        x: a.x + (b.x - a.x) * segT,
        y: a.y + (b.y - a.y) * segT,
      };
    }
    covered += segLen;
  }
  const last = nodesById[path[path.length - 1]];
  return { x: last.x, y: last.y };
}

function distanceCoveredAlong(path, t) {
  return Math.max(0, Math.min(1, t)) * pathLength(path);
}

function bearingDeg(aId, bId) {
  const a = nodesById[aId], b = nodesById[bId];
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

function normalizeAngle(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function turnLabel(deltaDeg) {
  const a = Math.abs(deltaDeg);
  const side = deltaDeg > 0 ? "right" : "left";
  if (a < 20) return { text: "Continue straight", side: null, action: "forward" };
  if (a < 50) return { text: `Slight ${side}`, side, action: `slight_${side}` };
  if (a < 140) return { text: `Turn ${side}`, side, action: `turn_${side}` };
  return { text: "Make a U-turn", side, action: "u_turn" };
}

function generateDirections(path) {
  if (path.length < 2) return [];
  const steps = [];
  let cumulative = 0;
  let prevBearing = null;

  for (let i = 0; i < path.length - 1; i++) {
    const legPx = dist(path[i], path[i + 1]);
    const legM = legPx / PX_PER_METER;
    const bearing = bearingDeg(path[i], path[i + 1]);
    const startM = cumulative;
    cumulative += legM;

    let instruction;
    let action = "forward";
    if (i === 0) {
      instruction = `Head forward for ${legM.toFixed(1)} m`;
    } else {
      const delta = normalizeAngle(bearing - prevBearing);
      const turn = turnLabel(delta);
      action = turn.action;
      instruction = turn.side
        ? `${turn.text}, then continue for ${legM.toFixed(1)} m`
        : `${turn.text} for ${legM.toFixed(1)} m`;
    }

    steps.push({
      instruction,
      action,
      legDistanceM: legM,
      startDistanceM: startM,
      cumulativeDistanceM: cumulative,
      headingDeg: (bearing + 360) % 360,
      toNodeId: path[i + 1],
      toNodeLabel: nodesById[path[i + 1]].label || "corridor",
    });
    prevBearing = bearing;
  }

  steps.push({
    instruction: `Arrive at ${nodesById[path[path.length - 1]].label}`,
    action: "arrive",
    legDistanceM: 0,
    startDistanceM: cumulative,
    cumulativeDistanceM: cumulative,
    headingDeg: prevBearing !== null ? (prevBearing + 360) % 360 : 0,
    toNodeId: path[path.length - 1],
    toNodeLabel: nodesById[path[path.length - 1]].label,
    isArrival: true,
  });

  return steps;
}

function currentStepFor(steps, coveredM) {
  for (const step of steps) {
    if (coveredM < step.cumulativeDistanceM - 0.05 || step.isArrival) return step;
  }
  return steps[steps.length - 1] || null;
}
