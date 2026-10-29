// =============================================================================
// A* PATHFINDING ALGORITHM & PATH GEOMETRY HELPERS
// Dynamic multi-map topology graph support with backwards-compatible defaults
// =============================================================================

import {
  NODES as DEFAULT_NODES,
  nodesById as DEFAULT_NODES_BY_ID,
  adjacency as DEFAULT_ADJACENCY,
  PIXELS_PER_METER as DEFAULT_PPM
} from '../data/buildingMapData.js';

export function distBetween(aId, bId, customLookup = DEFAULT_NODES_BY_ID) {
  const a = customLookup[aId];
  const b = customLookup[bId];
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A* Pathfinding to compute optimal path between start node and goal node.
 * Supports dynamic graph topology passed from active 3D map.
 */
export function aStar(startId, goalId, graphData = {}) {
  const lookup = graphData.nodesById || DEFAULT_NODES_BY_ID;
  const adj = graphData.adjacency || DEFAULT_ADJACENCY;
  const nodeList = graphData.nodes || DEFAULT_NODES;

  if (!lookup[startId] || !lookup[goalId]) return [];
  if (startId === goalId) return [startId];

  const openSet = new Set([startId]);
  const cameFrom = {};

  const gScore = {};
  const fScore = {};
  nodeList.forEach((n) => {
    gScore[n.id] = Infinity;
    fScore[n.id] = Infinity;
  });

  gScore[startId] = 0;
  fScore[startId] = distBetween(startId, goalId, lookup);

  while (openSet.size > 0) {
    let current = null;
    for (const id of openSet) {
      if (current === null || fScore[id] < fScore[current]) {
        current = id;
      }
    }

    if (current === goalId) {
      const totalPath = [current];
      while (cameFrom[current] !== undefined) {
        current = cameFrom[current];
        totalPath.unshift(current);
      }
      return totalPath;
    }

    openSet.delete(current);

    const neighbors = adj[current] || [];
    for (const neighbor of neighbors) {
      const tentativeG = gScore[current] + distBetween(current, neighbor, lookup);
      if (tentativeG < gScore[neighbor]) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentativeG;
        fScore[neighbor] = tentativeG + distBetween(neighbor, goalId, lookup);
        openSet.add(neighbor);
      }
    }
  }

  return [];
}

/**
 * Calculates total path length in pixels.
 */
export function pathLengthPx(path, customLookup = DEFAULT_NODES_BY_ID) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += distBetween(path[i], path[i + 1], customLookup);
  }
  return total;
}

/**
 * Total path distance in meters.
 */
export function pathDistanceMeters(path, ppm = DEFAULT_PPM, customLookup = DEFAULT_NODES_BY_ID) {
  return pathLengthPx(path, customLookup) / ppm;
}

/**
 * Interpolates coordinate (x, y) along path for progress t in [0, 1].
 */
export function positionAlongPath(path, t, customLookup = DEFAULT_NODES_BY_ID) {
  if (!path || !path.length) return { x: 0, y: 0 };
  if (path.length === 1) return { ...customLookup[path[0]] };

  const total = pathLengthPx(path, customLookup);
  if (total === 0) return { ...customLookup[path[0]] };

  const targetPx = Math.max(0, Math.min(1, t)) * total;
  let covered = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = customLookup[path[i]];
    const b = customLookup[path[i + 1]];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);

    if (targetPx <= covered + segLen || i === path.length - 2) {
      const segT = segLen === 0 ? 0 : Math.max(0, Math.min(1, (targetPx - covered) / segLen));
      return {
        x: a.x + (b.x - a.x) * segT,
        y: a.y + (b.y - a.y) * segT,
      };
    }
    covered += segLen;
  }

  const last = customLookup[path[path.length - 1]];
  return { x: last.x, y: last.y };
}

/**
 * Returns array of node objects for route path
 */
export function findAStarPath(startId, goalId, graphData = {}) {
  const lookup = graphData.nodesById || DEFAULT_NODES_BY_ID;
  const ids = aStar(startId, goalId, graphData);
  return ids.map((id) => lookup[id]).filter(Boolean);
}
