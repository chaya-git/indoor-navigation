// =============================================================================
// INDOOR MAP CATALOG & 3D MAPPING REGISTRY
// Supports multiple 3D maps, switching, custom map creation, and persistent storage
// =============================================================================

import {
  OFFICE_CABINS,
  OFFICE_NODES,
  OFFICE_EDGES,
  OFFICE_WALLS,
  OFFICE_DIMENSIONS,
  OFFICE_CHECKPOINTS
} from './buildingMapData.js';

// Helper to compute node lookup dictionary
export function createNodesById(nodes) {
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

// Helper to compute adjacency list
export function createAdjacency(nodes, edges) {
  const adj = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach(([a, b]) => {
    if (adj[a] && adj[b]) {
      adj[a].push(b);
      adj[b].push(a);
    }
  });
  return adj;
}

// -----------------------------------------------------------------------------
// MAP 1: OFFICE BLUEPRINT 3D (Default User Map)
// -----------------------------------------------------------------------------
export const OFFICE_BLUEPRINT_3D = {
  id: 'office_blueprint_3d',
  name: 'Office Blueprint 3D',
  shortName: 'Office 3D',
  category: 'Corporate Office',
  description: 'Executive floor with CEO Cabin, HR Cabin, Main Entrance, and calibrated corridor dimensions.',
  icon: '🏢',
  floor: 1,
  pixelsPerMeter: 72,
  bounds: { width: 920, height: 680 },
  wallHeightMeters: 2.8,
  rooms: OFFICE_CABINS,
  walls: OFFICE_WALLS,
  dimensions: OFFICE_DIMENSIONS,
  nodes: OFFICE_NODES,
  edges: OFFICE_EDGES,
  checkpoints: OFFICE_CHECKPOINTS,
  destinations: [
    { id: 'ceo_cabin', name: 'CEO Cabin', label: 'CEO Cabin', category: 'Executive', x: 670, y: 190, nodeId: 'ceo_cabin' },
    { id: 'hr_cabin', name: 'HR Cabin', label: 'HR Cabin', category: 'Human Resources', x: 620, y: 440, nodeId: 'hr_cabin' },
    { id: 'main_entrance', name: 'Main Entrance', label: 'Main Entrance', category: 'Exit / Entrance', x: 175, y: 505, nodeId: 'main_entrance' }
  ],
  defaultStart: 'main_entrance',
  defaultDest: 'ceo_cabin'
};

// -----------------------------------------------------------------------------
// MAP 2: TECH INNOVATION LAB 3D
// -----------------------------------------------------------------------------
export const TECH_LAB_3D = {
  id: 'tech_innovation_lab_3d',
  name: 'Tech Innovation Lab 3D',
  shortName: 'Tech Lab 3D',
  category: 'R&D Center',
  description: 'High-tech facility featuring Robotics Prototyping Bay, Server Cluster, Boardroom, and Breakout Lounge.',
  icon: '🔬',
  floor: 1,
  pixelsPerMeter: 60,
  bounds: { width: 1000, height: 720 },
  wallHeightMeters: 3.0,
  rooms: [
    {
      id: 'main_lobby',
      name: 'Main Reception & Lobby',
      label: 'MAIN LOBBY',
      type: 'entrance',
      x: 80, y: 460, w: 180, h: 200,
      color: '#e0f2fe',
      stroke: '#0369a1',
      labelX: 170, labelY: 560,
      door: { x: 260, y: 530, radius: 36, side: 'right' }
    },
    {
      id: 'boardroom',
      name: 'Executive Boardroom',
      label: 'BOARDROOM',
      type: 'cabin',
      x: 80, y: 80, w: 220, h: 260,
      color: '#fef3c7',
      stroke: '#b45309',
      labelX: 190, labelY: 210,
      door: { x: 300, y: 210, radius: 36, side: 'right' }
    },
    {
      id: 'breakout_cafe',
      name: 'Tech Lounge & Cafe',
      label: 'TECH CAFE',
      type: 'common',
      x: 360, y: 80, w: 160, h: 180,
      color: '#dcfce7',
      stroke: '#15803d',
      labelX: 440, labelY: 170,
      door: { x: 440, y: 260, radius: 36, side: 'bottom' }
    },
    {
      id: 'robotics_bay',
      name: 'Robotics & Hardware Bay',
      label: 'ROBOTICS BAY',
      type: 'lab',
      x: 580, y: 80, w: 360, h: 280,
      color: '#ede9fe',
      stroke: '#6d28d9',
      labelX: 760, labelY: 220,
      door: { x: 580, y: 220, radius: 40, side: 'left' }
    },
    {
      id: 'server_cluster',
      name: 'AI Server & Cloud Cluster',
      label: 'SERVER CLUSTER',
      type: 'server',
      x: 580, y: 420, w: 360, h: 240,
      color: '#fee2e2',
      stroke: '#b91c1c',
      labelX: 760, labelY: 540,
      door: { x: 580, y: 530, radius: 40, side: 'left' }
    }
  ],
  walls: [
    { x1: 260, y1: 530, x2: 440, y2: 530 },
    { x1: 440, y1: 530, x2: 440, y2: 340 },
    { x1: 440, y1: 340, x2: 440, y2: 210 },
    { x1: 440, y1: 340, x2: 580, y2: 340 },
    { x1: 300, y1: 210, x2: 440, y2: 210 },
    { x1: 440, y1: 530, x2: 580, y2: 530 }
  ],
  nodes: [
    { id: 'node_lobby', x: 170, y: 560, label: 'Main Lobby', type: 'poi' },
    { id: 'node_lobby_door', x: 260, y: 530, label: 'Lobby Doorway', type: 'waypoint' },
    { id: 'node_south_junction', x: 440, y: 530, label: 'South Atrium Junction', type: 'junction' },
    { id: 'node_mid_hall', x: 440, y: 340, label: 'Central Corridor', type: 'junction' },
    { id: 'node_north_hall', x: 440, y: 210, label: 'North Gallery Junction', type: 'junction' },
    { id: 'node_boardroom_door', x: 300, y: 210, label: 'Boardroom Doorway', type: 'waypoint' },
    { id: 'node_boardroom', x: 190, y: 210, label: 'Executive Boardroom', type: 'poi' },
    { id: 'node_cafe_door', x: 440, y: 260, label: 'Cafe Entrance', type: 'waypoint' },
    { id: 'node_cafe', x: 440, y: 170, label: 'Tech Lounge', type: 'poi' },
    { id: 'node_robotics_door', x: 580, y: 220, label: 'Robotics Bay AirLock', type: 'waypoint' },
    { id: 'node_robotics_bay', x: 760, y: 220, label: 'Robotics Lab', type: 'poi' },
    { id: 'node_server_door', x: 580, y: 530, label: 'Server Room Vault', type: 'waypoint' },
    { id: 'node_server_cluster', x: 760, y: 540, label: 'Server Cluster', type: 'poi' }
  ],
  edges: [
    ['node_lobby', 'node_lobby_door'],
    ['node_lobby_door', 'node_south_junction'],
    ['node_south_junction', 'node_mid_hall'],
    ['node_south_junction', 'node_server_door'],
    ['node_server_door', 'node_server_cluster'],
    ['node_mid_hall', 'node_north_hall'],
    ['node_mid_hall', 'node_robotics_door'],
    ['node_robotics_door', 'node_robotics_bay'],
    ['node_north_hall', 'node_boardroom_door'],
    ['node_boardroom_door', 'node_boardroom'],
    ['node_north_hall', 'node_cafe_door'],
    ['node_cafe_door', 'node_cafe']
  ],
  destinations: [
    { id: 'node_robotics_bay', name: 'Robotics & Hardware Bay', label: 'Robotics Bay', category: 'Laboratories', x: 760, y: 220, nodeId: 'node_robotics_bay' },
    { id: 'node_server_cluster', name: 'AI Server & Cloud Cluster', label: 'Server Cluster', category: 'Infrastructure', x: 760, y: 540, nodeId: 'node_server_cluster' },
    { id: 'node_boardroom', name: 'Executive Boardroom', label: 'Boardroom', category: 'Executive', x: 190, y: 210, nodeId: 'node_boardroom' },
    { id: 'node_cafe', name: 'Tech Lounge & Cafe', label: 'Tech Cafe', category: 'Amenities', x: 440, y: 170, nodeId: 'node_cafe' },
    { id: 'node_lobby', name: 'Main Reception & Lobby', label: 'Main Lobby', category: 'Entrance', x: 170, y: 560, nodeId: 'node_lobby' }
  ],
  defaultStart: 'node_lobby',
  defaultDest: 'node_robotics_bay'
};

// -----------------------------------------------------------------------------
// MAP 3: LOGISTICS WAREHOUSE 3D
// -----------------------------------------------------------------------------
export const LOGISTICS_WAREHOUSE_3D = {
  id: 'logistics_warehouse_3d',
  name: 'Logistics Warehouse 3D',
  shortName: 'Warehouse 3D',
  category: 'Industrial Facility',
  description: 'Modern logistics hub with Inbound Receiving, Automated Storage Racks, Sorting Hub, and Dispatch Docks.',
  icon: '📦',
  floor: 1,
  pixelsPerMeter: 50,
  bounds: { width: 1080, height: 750 },
  wallHeightMeters: 4.5,
  rooms: [
    {
      id: 'inbound_dock',
      name: 'Inbound Receiving Dock',
      label: 'INBOUND RECEIVING',
      type: 'dock',
      x: 80, y: 90, w: 200, h: 220,
      color: '#e0f2fe',
      stroke: '#0284c7',
      labelX: 180, labelY: 200,
      door: { x: 280, y: 200, radius: 40, side: 'right' }
    },
    {
      id: 'dispatch_dock',
      name: 'Outbound Dispatch Dock',
      label: 'DISPATCH DOCK',
      type: 'dock',
      x: 80, y: 460, w: 200, h: 220,
      color: '#fef9c3',
      stroke: '#ca8a04',
      labelX: 180, labelY: 570,
      door: { x: 280, y: 570, radius: 40, side: 'right' }
    },
    {
      id: 'storage_racks_a',
      name: 'High-Rack Storage Bay A',
      label: 'STORAGE BAY A',
      type: 'storage',
      x: 370, y: 90, w: 270, h: 260,
      color: '#f3e8ff',
      stroke: '#7e22ce',
      labelX: 505, labelY: 220,
      door: { x: 505, y: 350, radius: 40, side: 'bottom' }
    },
    {
      id: 'storage_racks_b',
      name: 'High-Rack Storage Bay B',
      label: 'STORAGE BAY B',
      type: 'storage',
      x: 370, y: 420, w: 270, h: 260,
      color: '#f3e8ff',
      stroke: '#7e22ce',
      labelX: 505, labelY: 550,
      door: { x: 505, y: 420, radius: 40, side: 'top' }
    },
    {
      id: 'automated_sorter',
      name: 'Automated Conveyor Sorter',
      label: 'AUTOMATED SORTER',
      type: 'automation',
      x: 720, y: 90, w: 280, h: 260,
      color: '#dcfce7',
      stroke: '#16a34a',
      labelX: 860, labelY: 220,
      door: { x: 720, y: 220, radius: 40, side: 'left' }
    },
    {
      id: 'control_room',
      name: 'Warehouse Operations Room',
      label: 'OPERATIONS CONTROL',
      type: 'office',
      x: 720, y: 420, w: 280, h: 260,
      color: '#fee2e2',
      stroke: '#dc2626',
      labelX: 860, labelY: 550,
      door: { x: 720, y: 550, radius: 40, side: 'left' }
    }
  ],
  walls: [
    { x1: 280, y1: 200, x2: 370, y2: 200 },
    { x1: 280, y1: 570, x2: 370, y2: 570 },
    { x1: 370, y1: 200, x2: 370, y2: 570 },
    { x1: 370, y1: 385, x2: 720, y2: 385 },
    { x1: 720, y1: 220, x2: 720, y2: 550 }
  ],
  nodes: [
    { id: 'node_inbound', x: 180, y: 200, label: 'Inbound Receiving', type: 'poi' },
    { id: 'node_inbound_door', x: 280, y: 200, label: 'Inbound Staging Area', type: 'waypoint' },
    { id: 'node_dispatch', x: 180, y: 570, label: 'Dispatch Loading Dock', type: 'poi' },
    { id: 'node_dispatch_door', x: 280, y: 570, label: 'Outbound Staging Area', type: 'waypoint' },
    { id: 'node_west_corridor', x: 370, y: 385, label: 'Aisle 1 & 2 Main Fork', type: 'junction' },
    { id: 'node_bay_a_entry', x: 505, y: 385, label: 'Bay A Aisleway', type: 'waypoint' },
    { id: 'node_storage_bay_a', x: 505, y: 220, label: 'High-Rack Storage A', type: 'poi' },
    { id: 'node_bay_b_entry', x: 505, y: 385, label: 'Bay B Aisleway', type: 'waypoint' },
    { id: 'node_storage_bay_b', x: 505, y: 550, label: 'High-Rack Storage B', type: 'poi' },
    { id: 'node_east_corridor', x: 670, y: 385, label: 'Cross-Dock Expressway', type: 'junction' },
    { id: 'node_sorter_door', x: 720, y: 220, label: 'Conveyor Feeder', type: 'waypoint' },
    { id: 'node_automated_sorter', x: 860, y: 220, label: 'Sorting Hub', type: 'poi' },
    { id: 'node_control_door', x: 720, y: 550, label: 'Control Room Door', type: 'waypoint' },
    { id: 'node_control_room', x: 860, y: 550, label: 'Operations Control Room', type: 'poi' }
  ],
  edges: [
    ['node_inbound', 'node_inbound_door'],
    ['node_inbound_door', 'node_west_corridor'],
    ['node_dispatch', 'node_dispatch_door'],
    ['node_dispatch_door', 'node_west_corridor'],
    ['node_west_corridor', 'node_bay_a_entry'],
    ['node_bay_a_entry', 'node_storage_bay_a'],
    ['node_bay_a_entry', 'node_storage_bay_b'],
    ['node_bay_a_entry', 'node_east_corridor'],
    ['node_east_corridor', 'node_sorter_door'],
    ['node_sorter_door', 'node_automated_sorter'],
    ['node_east_corridor', 'node_control_door'],
    ['node_control_door', 'node_control_room']
  ],
  destinations: [
    { id: 'node_automated_sorter', name: 'Automated Conveyor Sorter', label: 'Sorting Hub', category: 'Automation', x: 860, y: 220, nodeId: 'node_automated_sorter' },
    { id: 'node_storage_bay_a', name: 'High-Rack Storage Bay A', label: 'Storage A', category: 'Warehousing', x: 505, y: 220, nodeId: 'node_storage_bay_a' },
    { id: 'node_storage_bay_b', name: 'High-Rack Storage Bay B', label: 'Storage B', category: 'Warehousing', x: 505, y: 550, nodeId: 'node_storage_bay_b' },
    { id: 'node_control_room', name: 'Warehouse Operations Room', label: 'Control Room', category: 'Management', x: 860, y: 550, nodeId: 'node_control_room' },
    { id: 'node_dispatch', name: 'Outbound Dispatch Dock', label: 'Dispatch Dock', category: 'Shipping', x: 180, y: 570, nodeId: 'node_dispatch' },
    { id: 'node_inbound', name: 'Inbound Receiving Dock', label: 'Inbound Dock', category: 'Receiving', x: 180, y: 200, nodeId: 'node_inbound' }
  ],
  defaultStart: 'node_inbound',
  defaultDest: 'node_automated_sorter'
};

// -----------------------------------------------------------------------------
// MAP: ROBOMANTHA 3-FLOOR 3D BUILDING
// Realistic 3-floor isometric cutaway building showing route from
// Ground Floor Entrance -> 1st Floor Shop -> 2nd Floor Robomantha Office
// -----------------------------------------------------------------------------
export const ROBOMANTHA_3D_BUILDING = {
  id: 'robomantha_3d_building',
  name: 'Robomantha 3D Building (3 Floors)',
  shortName: 'Robomantha 3D',
  category: 'Multi-Floor Facility',
  description: 'Realistic 3D isometric cutaway indoor navigation map showing complete route from Ground Floor Entrance past 1st Floor Shop to 2nd Floor Robomantha Office.',
  icon: '🏢',
  floor: 3,
  imageUrl: '/assets/robomantha_3d_building.jpg',
  pixelsPerMeter: 45,
  bounds: { width: 1200, height: 896 },
  wallHeightMeters: 2.8,
  dimensions: [
    { p1: { x: 450, y: 780 }, p2: { x: 450, y: 651 }, text: '2.58 m (Entrance → Stairs)', offset: { x: 70, y: 0 } },
    { p1: { x: 450, y: 651 }, p2: { x: 241, y: 651 }, text: '10 Stairs (4.18 m)', offset: { x: 0, y: -22 } },
    { p1: { x: 241, y: 651 }, p2: { x: 241, y: 407 }, text: '10 Stairs (4.89 m) → 1F', offset: { x: -80, y: 0 } },
    { p1: { x: 241, y: 407 }, p2: { x: 120, y: 407 }, text: 'Shop (On Left)', offset: { x: 0, y: -22 } },
    { p1: { x: 241, y: 407 }, p2: { x: 459, y: 407 }, text: '10 Stairs (4.37 m)', offset: { x: 0, y: -22 } },
    { p1: { x: 459, y: 407 }, p2: { x: 459, y: 191 }, text: '10 Stairs (4.33 m) → 2F', offset: { x: 80, y: 0 } },
    { p1: { x: 480, y: 260 }, p2: { x: 670, y: 260 }, text: '3.80 m (Door → Junction)', offset: { x: 0, y: -22 } },
    { p1: { x: 670, y: 260 }, p2: { x: 821, y: 260 }, text: '3.02 m (Total 6.8m → HR)', offset: { x: 0, y: -22 } },
    { p1: { x: 670, y: 260 }, p2: { x: 670, y: 534 }, text: '5.47 m Corridor', offset: { x: -60, y: 0 } },
    { p1: { x: 670, y: 534 }, p2: { x: 780, y: 534 }, text: 'CEO Cabin (Right)', offset: { x: 0, y: 25 } }
  ],
  rooms: [
    // Ground Floor: Foyer & Main Entrance
    {
      id: 'room_gf_foyer',
      name: 'Ground Floor Main Entrance & Foyer',
      label: 'GF ENTRANCE (2.58m)',
      floor: 0,
      type: 'entrance',
      x: 360, y: 620, w: 180, h: 180,
      color: '#e0f2fe',
      stroke: '#0284c7',
      labelX: 450, labelY: 715,
      door: { x: 450, y: 780, radius: 36, side: 'bottom' }
    },
    // 1st Floor: Retail Shop (To the left of 1F Landing)
    {
      id: 'room_ff_shop',
      name: '1st Floor Retail Shop',
      label: 'RETAIL SHOP (1F LEFT)',
      floor: 1,
      type: 'poi',
      x: 40, y: 340, w: 170, h: 140,
      color: '#fef3c7',
      stroke: '#b45309',
      labelX: 125, labelY: 407,
      door: { x: 210, y: 407, radius: 32, side: 'right' }
    },
    // 1st Floor: Stair Landing
    {
      id: 'room_ff_landing',
      name: '1st Floor Stair Landing',
      label: '1F LANDING',
      floor: 1,
      type: 'waypoint',
      x: 200, y: 350, w: 100, h: 120,
      color: '#f8fafc',
      stroke: '#64748b',
      labelX: 241, labelY: 407
    },
    // 2nd Floor: Robomantha Office Entrance
    {
      id: 'room_sf_reception',
      name: 'Robomantha Entrance',
      label: 'ROBOMANTHA ENTRANCE',
      floor: 2,
      type: 'entrance',
      x: 460, y: 210, w: 130, h: 100,
      color: '#dcfce7',
      stroke: '#16a34a',
      labelX: 525, labelY: 260,
      door: { x: 480, y: 260, radius: 32, side: 'left' }
    },
    // 2nd Floor: HR Cabin (6.8m straight from entrance)
    {
      id: 'room_sf_hr',
      name: 'HR Cabin',
      label: 'HR CABIN (6.8m)',
      floor: 2,
      type: 'cabin',
      x: 770, y: 200, w: 160, h: 130,
      color: '#fef9c3',
      stroke: '#ca8a04',
      labelX: 840, labelY: 260,
      door: { x: 770, y: 260, radius: 30, side: 'left' }
    },
    // 2nd Floor: CEO Cabin (Turn left 5.47m, turn right)
    {
      id: 'room_sf_ceo',
      name: 'CEO Cabin',
      label: 'CEO CABIN',
      floor: 2,
      type: 'cabin',
      x: 740, y: 460, w: 190, h: 150,
      color: '#fce7f3',
      stroke: '#db2777',
      labelX: 830, labelY: 534,
      door: { x: 740, y: 534, radius: 32, side: 'left' }
    }
  ],
  nodes: [
    // Ground Floor
    {
      id: 'gf_entrance',
      x: 450,
      y: 780,
      label: 'Ground Floor Main Entrance',
      floor: 0,
      type: 'entrance',
      action: 'start',
      instruction: 'Start at Ground Floor Main Entrance. Go straight for 2.58 meters till the base of the stairs.'
    },
    {
      id: 'gf_stairs_base',
      x: 450,
      y: 651,
      label: 'Base of Stairs',
      floor: 0,
      type: 'stairs',
      action: 'turn_left',
      instruction: 'Turn LEFT and take 10 stairs up for 4.18 meters.'
    },

    // Staircase 1 (GF to 1F Dogleg)
    {
      id: 'gf_stairs_mid',
      x: 241,
      y: 651,
      label: 'Stairs 1 Mid-Landing',
      floor: 0.5,
      type: 'stairs',
      action: 'turn_right',
      instruction: 'Turn RIGHT and take 10 stairs up for 4.89 meters to reach the 1st Floor.'
    },

    // 1st Floor
    {
      id: 'ff_landing',
      x: 241,
      y: 407,
      label: '1st Floor Landing',
      floor: 1,
      type: 'junction',
      action: 'straight',
      instruction: 'You are on the 1st Floor. You can see a shop to your left.'
    },
    {
      id: 'ff_shop',
      x: 120,
      y: 407,
      label: '1st Floor Retail Shop',
      floor: 1,
      type: 'poi',
      action: 'arrive',
      instruction: 'Arrive at the Retail Shop to your left on the 1st Floor.'
    },

    // Staircase 2 (1F to 2F Dogleg)
    {
      id: 'ff_stairs_mid',
      x: 459,
      y: 407,
      label: 'Stairs 2 Mid-Landing',
      floor: 1.5,
      type: 'stairs',
      action: 'turn_right',
      instruction: 'Turn RIGHT and take 10 steps for 4.37 meters.'
    },
    {
      id: 'sf_stairs_top',
      x: 459,
      y: 191,
      label: '2nd Floor Landing',
      floor: 2,
      type: 'junction',
      action: 'turn_right',
      instruction: 'Turn RIGHT, take 10 steps for 4.33 meters and turn RIGHT. You are on the 2nd Floor and can see Robomantha to your right.'
    },

    // 2nd Floor Corridor & Robomantha Office Entrance
    {
      id: 'sf_robomantha_door',
      x: 480,
      y: 260,
      label: 'Robomantha Office Entrance',
      floor: 2,
      type: 'entrance',
      action: 'enter',
      instruction: 'Enter inside the Robomantha Office.'
    },

    // Inside Robomantha Office (Exact Measured Layout)
    {
      id: 'sf_office_junction',
      x: 670,
      y: 260,
      label: 'Office Main Junction (3.8m)',
      floor: 2,
      type: 'junction',
      action: 'straight',
      instruction: 'From entrance walk straight for 3.8 meters to the corridor junction.'
    },
    {
      id: 'sf_office_hr',
      x: 821,
      y: 260,
      label: 'HR Cabin (6.8m from entrance)',
      floor: 2,
      type: 'poi',
      action: 'arrive',
      instruction: 'From entrance walk straight for 6.8 meters. Arrive at HR Cabin.'
    },
    {
      id: 'sf_office_north_corner',
      x: 670,
      y: 534,
      label: 'CEO Corridor Corner (5.47m)',
      floor: 2,
      type: 'waypoint',
      action: 'turn_right',
      instruction: 'Turn LEFT and walk straight for 5.47 meters down the hallway, then turn RIGHT.'
    },
    {
      id: 'sf_office_ceo',
      x: 780,
      y: 534,
      label: 'CEO Cabin',
      floor: 2,
      type: 'poi',
      action: 'arrive',
      instruction: 'Turn RIGHT into CEO Cabin. Arrive at CEO Cabin.'
    }
  ],
  edges: [
    ['gf_entrance', 'gf_stairs_base'],
    ['gf_stairs_base', 'gf_stairs_mid'],
    ['gf_stairs_mid', 'ff_landing'],
    ['ff_landing', 'ff_shop'],
    ['ff_landing', 'ff_stairs_mid'],
    ['ff_stairs_mid', 'sf_stairs_top'],
    ['sf_stairs_top', 'sf_robomantha_door'],
    ['sf_robomantha_door', 'sf_office_junction'],
    ['sf_office_junction', 'sf_office_hr'],
    ['sf_office_junction', 'sf_office_north_corner'],
    ['sf_office_north_corner', 'sf_office_ceo']
  ],
  destinations: [
    {
      id: 'sf_office_ceo',
      name: 'CEO Cabin (2nd Floor Office)',
      label: 'CEO Cabin',
      category: 'Executive',
      floor: 2,
      x: 780,
      y: 534,
      nodeId: 'sf_office_ceo'
    },
    {
      id: 'sf_office_hr',
      name: 'HR Cabin (6.8m Straight)',
      label: 'HR Cabin',
      category: 'Human Resources',
      floor: 2,
      x: 821,
      y: 260,
      nodeId: 'sf_office_hr'
    },
    {
      id: 'ff_shop',
      name: '1st Floor Retail Shop (To Left)',
      label: 'Retail Shop',
      category: 'Commercial',
      floor: 1,
      x: 120,
      y: 407,
      nodeId: 'ff_shop'
    },
    {
      id: 'sf_robomantha_door',
      name: 'Robomantha Office Entrance (2nd Floor)',
      label: 'Office Door',
      category: 'Entrance',
      floor: 2,
      x: 480,
      y: 260,
      nodeId: 'sf_robomantha_door'
    },
    {
      id: 'gf_entrance',
      name: 'Ground Floor Main Entrance',
      label: 'Main Entrance',
      category: 'Exit / Entrance',
      floor: 0,
      x: 450,
      y: 780,
      nodeId: 'gf_entrance'
    }
  ],
  dimensions: [
    {
      id: 'dim_gf_entrance_stairs',
      from: { x: 450, y: 780, z: 0 },
      to: { x: 450, y: 651, z: 0 },
      p1: { x: 450, y: 780 },
      p2: { x: 450, y: 651 },
      text: '2.58 m',
      label: 'Entrance → Stairs: 2.58 m',
      shortLabel: '2.58 m',
      distanceMeters: 2.58,
      type: 'walk',
      floor: 0,
      description: 'From entrance walk straight for 2.58 m till the base of stairs'
    },
    {
      id: 'dim_flight_1a',
      from: { x: 450, y: 651, z: 0 },
      to: { x: 241, y: 651, z: 55 },
      p1: { x: 450, y: 651 },
      p2: { x: 241, y: 651 },
      text: '10 Stairs · 4.18 m',
      label: 'Stairs 1A: 10 Steps (4.18 m)',
      shortLabel: '10 Stairs · 4.18 m',
      distanceMeters: 4.18,
      steps: 10,
      type: 'stairs',
      floor: 0,
      description: 'Turn left, take 10 stairs (4.18 m)'
    },
    {
      id: 'dim_flight_1b',
      from: { x: 241, y: 651, z: 55 },
      to: { x: 241, y: 407, z: 110 },
      p1: { x: 241, y: 651 },
      p2: { x: 241, y: 407 },
      text: '10 Stairs · 4.89 m',
      label: 'Stairs 1B: 10 Steps (4.89 m)',
      shortLabel: '10 Stairs · 4.89 m',
      distanceMeters: 4.89,
      steps: 10,
      type: 'stairs',
      floor: 1,
      description: 'Turn right, take 10 stairs (4.89 m) to reach 1st Floor'
    },
    {
      id: 'dim_ff_shop',
      from: { x: 241, y: 407, z: 110 },
      to: { x: 120, y: 407, z: 110 },
      p1: { x: 241, y: 407 },
      p2: { x: 120, y: 407 },
      text: 'Shop to Left',
      label: '1st Floor Landing → Shop (Left)',
      shortLabel: 'Shop to Left',
      type: 'landmark',
      floor: 1,
      description: 'You are on 1st floor and can see a shop to your left'
    },
    {
      id: 'dim_flight_2a',
      from: { x: 241, y: 407, z: 110 },
      to: { x: 459, y: 407, z: 165 },
      p1: { x: 241, y: 407 },
      p2: { x: 459, y: 407 },
      text: '10 Stairs · 4.37 m',
      label: 'Stairs 2A: 10 Steps (4.37 m)',
      shortLabel: '10 Stairs · 4.37 m',
      distanceMeters: 4.37,
      steps: 10,
      type: 'stairs',
      floor: 1,
      description: 'Turn right, take 10 steps (4.37 m)'
    },
    {
      id: 'dim_flight_2b',
      from: { x: 459, y: 407, z: 165 },
      to: { x: 459, y: 191, z: 220 },
      p1: { x: 459, y: 407 },
      p2: { x: 459, y: 191 },
      text: '10 Stairs · 4.33 m',
      label: 'Stairs 2B: 10 Steps (4.33 m)',
      shortLabel: '10 Stairs · 4.33 m',
      distanceMeters: 4.33,
      steps: 10,
      type: 'stairs',
      floor: 2,
      description: 'Turn right, take 10 steps (4.33 m) to 2nd Floor'
    },
    {
      id: 'dim_sf_entrance',
      from: { x: 459, y: 191, z: 220 },
      to: { x: 480, y: 260, z: 220 },
      p1: { x: 459, y: 191 },
      p2: { x: 480, y: 260 },
      text: 'Robomantha on Right',
      label: '2nd Floor Landing → Robomantha',
      shortLabel: 'Robomantha to Right',
      type: 'landmark',
      floor: 2,
      description: 'Turn right, you see Robomantha to your right and enter'
    },
    {
      id: 'dim_office_junction',
      from: { x: 480, y: 260, z: 220 },
      to: { x: 670, y: 260, z: 220 },
      p1: { x: 480, y: 260 },
      p2: { x: 670, y: 260 },
      text: '3.80 m',
      label: 'Office Door → Junction: 3.80 m',
      shortLabel: '3.80 m',
      distanceMeters: 3.8,
      type: 'walk',
      floor: 2,
      description: 'From office entrance walk straight for 3.8 m'
    },
    {
      id: 'dim_office_hr',
      from: { x: 670, y: 260, z: 220 },
      to: { x: 821, y: 260, z: 220 },
      p1: { x: 670, y: 260 },
      p2: { x: 821, y: 260 },
      text: '3.02 m (Total 6.80 m)',
      label: 'Junction → HR Cabin: 3.02 m (Total 6.80 m)',
      shortLabel: '3.02 m (Total 6.80 m)',
      distanceMeters: 3.02,
      type: 'walk',
      floor: 2,
      description: 'From entrance walk straight for 6.8 m (3.8m + 3.02m) to reach HR cabin'
    },
    {
      id: 'dim_office_hallway',
      from: { x: 670, y: 260, z: 220 },
      to: { x: 670, y: 534, z: 220 },
      p1: { x: 670, y: 260 },
      p2: { x: 670, y: 534 },
      text: '5.47 m',
      label: 'Junction → Hallway Corner: 5.47 m',
      shortLabel: '5.47 m',
      distanceMeters: 5.47,
      type: 'walk',
      floor: 2,
      description: 'From 3.8m mark, turn left and walk straight for 5.47 m'
    },
    {
      id: 'dim_office_ceo',
      from: { x: 670, y: 534, z: 220 },
      to: { x: 780, y: 534, z: 220 },
      p1: { x: 670, y: 534 },
      p2: { x: 780, y: 534 },
      text: 'CEO Cabin on Right',
      label: 'Hallway Corner → CEO Cabin (Right)',
      shortLabel: 'CEO Cabin on Right',
      type: 'walk',
      floor: 2,
      description: 'Turn right and enter CEO Cabin'
    }
  ],
  defaultStart: 'gf_entrance',
  defaultDest: 'sf_office_ceo'
};

// Built-in map catalog (Robomantha 3D building first)
export const BUILTIN_MAPS = [
  ROBOMANTHA_3D_BUILDING,
  OFFICE_BLUEPRINT_3D,
  TECH_LAB_3D,
  LOGISTICS_WAREHOUSE_3D
];

const CUSTOM_MAPS_STORAGE_KEY = 'navbot_custom_3d_maps';

// Read all maps (built-in + user-created custom maps)
export function getAllMaps() {
  const customMaps = getCustomMaps();
  return [...BUILTIN_MAPS, ...customMaps];
}

export function getMapById(id) {
  const all = getAllMaps();
  return all.find((m) => m.id === id) || ROBOMANTHA_3D_BUILDING || OFFICE_BLUEPRINT_3D;
}

export function getCustomMaps() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Error reading custom 3D maps:', err);
    return [];
  }
}

export function saveCustomMap(mapData) {
  if (!mapData || !mapData.id) return false;
  try {
    const current = getCustomMaps();
    const filtered = current.filter((m) => m.id !== mapData.id);
    filtered.push(mapData);
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error('Error saving custom 3D map:', err);
    return false;
  }
}

export function deleteCustomMap(id) {
  try {
    const current = getCustomMaps();
    const updated = current.filter((m) => m.id !== id);
    localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Error deleting custom map:', err);
    return false;
  }
}
