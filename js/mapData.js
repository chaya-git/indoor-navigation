"use strict";

// =============================================================================
// OFFICE FLOOR MAP DATA
// Scale: 72 pixels per meter
// =============================================================================

const QR_PREFIX = "NAVROBOT:";
const PX_PER_METER = 72;
const STEP_LENGTH_METERS = 0.70;
const STEP_LENGTH_PX = STEP_LENGTH_METERS * PX_PER_METER;

const MAP_ORIGIN_X = 140;
const MAP_ORIGIN_Y = 60;

// Route is fixed for now: Main Entrance -> CEO Cabin only.
const ROUTE_START_ID = "main_entrance";
const ROUTE_DESTINATION_ID = "ceo_cabin";

function m2px(mx, my) {
  return {
    x: MAP_ORIGIN_X + mx * PX_PER_METER,
    y: MAP_ORIGIN_Y + my * PX_PER_METER
  };
}

const CABINS = {
  ceo: {
    label: "CEO\nCABIN",
    name: "CEO Cabin",
    x: 4.98, y: 0.40, w: 4.73, h: 3.60,
    door: { x: 4.98, y: 1.60, radius: 0.50, side: "left" }
  },
  hr: {
    label: "HR\nCABIN",
    name: "HR Cabin",
    x: 5.20, y: 3.70, w: 3.02, h: 3.00,
    door: { x: 5.20, y: 4.50, radius: 0.50, side: "left" }
  }
};

// HR cabin stays on the map for context, but is not a selectable
// destination while navigation is limited to Entrance -> CEO Cabin.
const NODES = [
  { id: "main_entrance", x: 175, y: 505, label: "MAIN ENTRANCE" },
  { id: "p_entrance_inner", x: 215, y: 542, label: "", selectable: false },
  { id: "p_bottom_mid", x: 300, y: 542, label: "", selectable: false },
  { id: "corner_bottom", x: 413, y: 542, label: "", selectable: false },
  { id: "hr_doorway", x: 450, y: 440, label: "", selectable: false },
  { id: "hr_cabin", x: 620, y: 440, label: "HR CABIN", selectable: true },
  { id: "p_vert_mid", x: 413, y: 330, label: "", selectable: false },
  { id: "corner_top", x: 413, y: 155, label: "", selectable: false },
  { id: "ceo_doorway", x: 498, y: 155, label: "", selectable: false },
  { id: "ceo_cabin", x: 670, y: 190, label: "CEO CABIN" },
];

const EDGES = [
  ["main_entrance", "p_entrance_inner"],
  ["p_entrance_inner", "p_bottom_mid"],
  ["p_bottom_mid", "corner_bottom"],
  ["corner_bottom", "hr_doorway"],
  ["hr_doorway", "hr_cabin"],
  ["corner_bottom", "p_vert_mid"],
  ["p_vert_mid", "corner_top"],
  ["corner_top", "ceo_doorway"],
  ["ceo_doorway", "ceo_cabin"],
];

const nodesById = Object.fromEntries(NODES.map(n => [n.id, n]));
const adjacency = {};
NODES.forEach(n => (adjacency[n.id] = []));
EDGES.forEach(([a, b]) => { adjacency[a].push(b); adjacency[b].push(a); });

function findNearestNode(x, y) {
  let best = NODES[0];
  let bestDist = Infinity;
  NODES.forEach(n => {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  });
  return best;
}
