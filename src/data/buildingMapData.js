// =============================================================================
// INDOOR MAP TOPOLOGY & WAYFINDING GRAPH DATA
// Includes the Office Blueprint (CEO Cabin, HR Cabin, Main Entrance)
// =============================================================================

export const PIXELS_PER_METER = 72;
export const DEFAULT_STEP_LENGTH_M = 0.70;
export const MAP_WIDTH = 920;
export const MAP_HEIGHT = 680;

export const QR_PREFIX = "NAVROBOT:";

// -----------------------------------------------------------------------------
// OFFICE BLUEPRINT DATA (The user's original map)
// -----------------------------------------------------------------------------
export const OFFICE_CABINS = [
  {
    id: "ceo_cabin",
    name: "CEO Cabin",
    label: "CEO CABIN",
    type: "cabin",
    x: 498, y: 89, w: 341, h: 259,
    color: "#fef3c7",
    stroke: "#1a1a1a",
    labelX: 670, labelY: 190,
    door: { x: 498, y: 155, radius: 36, side: "left" }
  },
  {
    id: "hr_cabin",
    name: "HR Cabin",
    label: "HR CABIN",
    type: "cabin",
    x: 514, y: 326, w: 217, h: 216,
    color: "#fef3c7",
    stroke: "#1a1a1a",
    labelX: 620, labelY: 440,
    door: { x: 514, y: 440, radius: 36, side: "left" }
  },
  {
    id: "main_entrance",
    name: "Main Entrance",
    label: "MAIN ENTRANCE",
    type: "entrance",
    x: 120, y: 460, w: 85, h: 100,
    color: "#e0f2fe",
    stroke: "#1a1a1a",
    labelX: 175, labelY: 505,
    door: { x: 175, y: 505, radius: 42, side: "top" }
  }
];

export const OFFICE_WALLS = [
  // Outer corridor boundary walls
  { x1: 140, y1: 377, x2: 140, y2: 542 },
  { x1: 140, y1: 542, x2: 414, y2: 542 },
  { x1: 414, y1: 542, x2: 414, y2: 149 },
  { x1: 414, y1: 149, x2: 498, y2: 149 }
];

export const OFFICE_DIMENSIONS = [
  { p1: { x: 498, y: 74 }, p2: { x: 839, y: 74 }, text: "4.73 m", offset: { x: 0, y: -10 } },
  { p1: { x: 857, y: 89 }, p2: { x: 857, y: 348 }, text: "3.60 m", offset: { x: 26, y: 0 } },
  { p1: { x: 414, y: 128 }, p2: { x: 498, y: 128 }, text: "1.18 m", offset: { x: 0, y: -10 } },
  { p1: { x: 432, y: 149 }, p2: { x: 432, y: 542 }, text: "5.47 m", offset: { x: 26, y: 0 } },
  { p1: { x: 140, y: 560 }, p2: { x: 414, y: 560 }, text: "3.80 m", offset: { x: 0, y: 14 } },
  { p1: { x: 514, y: 560 }, p2: { x: 731, y: 560 }, text: "3.02 m", offset: { x: 0, y: 14 } },
  { p1: { x: 749, y: 326 }, p2: { x: 749, y: 542 }, text: "3.00 m", offset: { x: 26, y: 0 } }
];

export const OFFICE_NODES = [
  { id: "main_entrance", x: 175, y: 505, label: "Main Entrance", type: "poi", action: "start", instruction: "Start at Main Entrance. Walk straight for 3.8 meters to South Junction." },
  { id: "p_entrance_inner", x: 215, y: 542, label: "", type: "waypoint" },
  { id: "p_bottom_mid", x: 300, y: 542, label: "", type: "waypoint" },
  { id: "corner_bottom", x: 413, y: 542, label: "South Junction (3.8m)", type: "junction", action: "turn_left", instruction: "Turn LEFT and walk straight along the corridor towards CEO Cabin." },
  { id: "hr_doorway", x: 450, y: 440, label: "HR Doorway", type: "waypoint" },
  { id: "hr_cabin", x: 620, y: 440, label: "HR Cabin (6.8m from entrance)", type: "poi", action: "arrive", instruction: "Arrive at HR Cabin (6.8 meters from entrance)." },
  { id: "p_vert_mid", x: 413, y: 330, label: "Hallway (5.47m)", type: "waypoint", action: "straight", instruction: "Walk straight for 5.47 meters along the hallway." },
  { id: "corner_top", x: 413, y: 155, label: "North Junction", type: "junction", action: "turn_right", instruction: "Turn RIGHT towards CEO Cabin." },
  { id: "ceo_doorway", x: 498, y: 155, label: "CEO Doorway", type: "waypoint" },
  { id: "ceo_cabin", x: 670, y: 190, label: "CEO Cabin", type: "poi", action: "arrive", instruction: "Arrive at CEO Cabin to your right." }
];

export const OFFICE_EDGES = [
  ["main_entrance", "p_entrance_inner"],
  ["p_entrance_inner", "p_bottom_mid"],
  ["p_bottom_mid", "corner_bottom"],
  ["corner_bottom", "hr_doorway"],
  ["hr_doorway", "hr_cabin"],
  ["corner_bottom", "p_vert_mid"],
  ["p_vert_mid", "corner_top"],
  ["corner_top", "ceo_doorway"],
  ["ceo_doorway", "ceo_cabin"]
];

export const OFFICE_CHECKPOINTS = [
  { id: "CP_ENTRANCE", nodeId: "main_entrance", label: "Entrance Wall QR", code: "QR_ENTRANCE" },
  { id: "CP_CORNER_S", nodeId: "corner_bottom", label: "South Corridor Corner QR", code: "QR_CORNER_S" },
  { id: "CP_HR", nodeId: "hr_cabin", label: "HR Cabin Door QR", code: "QR_HR_CABIN" },
  { id: "CP_CORNER_N", nodeId: "corner_top", label: "North Corridor Corner QR", code: "QR_CORNER_N" },
  { id: "CP_CEO", nodeId: "ceo_cabin", label: "CEO Cabin Door QR", code: "QR_CEO_CABIN" }
];

// Active Map Configuration (Defaults to user's Office Map)
export const ROOMS = OFFICE_CABINS;
export const NODES = OFFICE_NODES;
export const EDGES = OFFICE_EDGES;
export const CHECKPOINTS = OFFICE_CHECKPOINTS;

export const nodesById = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Adjacency table
export const adjacency = {};
NODES.forEach((n) => (adjacency[n.id] = []));
EDGES.forEach(([a, b]) => {
  if (adjacency[a] && adjacency[b]) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
});

export function findNearestNode(x, y) {
  let best = NODES[0];
  let bestDist = Infinity;
  for (const n of NODES) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

// Destination options (rooms and cabins users can navigate to)
export const DESTINATIONS = [
  {
    id: "ceo_cabin",
    name: "CEO Cabin",
    label: "CEO Cabin",
    category: "Executive",
    x: 670, y: 190,
    nodeId: "ceo_cabin"
  },
  {
    id: "hr_cabin",
    name: "HR Cabin",
    label: "HR Cabin",
    category: "Human Resources",
    x: 620, y: 440,
    nodeId: "hr_cabin"
  },
  {
    id: "main_entrance",
    name: "Main Entrance",
    label: "Main Entrance",
    category: "Exit / Entrance",
    x: 175, y: 505,
    nodeId: "main_entrance"
  }
];

export const GRAPH_NODES = NODES;
export const CORRIDORS = EDGES;
export const MAP_BOUNDS = { width: MAP_WIDTH, height: MAP_HEIGHT };
export const QR_CHECKPOINTS = CHECKPOINTS.map((c) => ({
  id: c.id,
  code: c.code || c.id,
  name: c.label,
  nodeId: c.nodeId,
  x: nodesById[c.nodeId] ? nodesById[c.nodeId].x : 0,
  y: nodesById[c.nodeId] ? nodesById[c.nodeId].y : 0,
  floor: 1
}));
export const getNearestNode = findNearestNode;
export const calculateDistance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
