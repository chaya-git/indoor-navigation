// =============================================================================
// 3D INDOOR MAP VIEWER (THREE.JS)
// Interactive WebGL 3D building viewer with extruded walls, glowing path ribbon,
// 3D robot/user marker, destination beacon, camera controls, and click-to-route
// Real-world physical dimensions & stair drawings
// =============================================================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

// Helper to create floating 3D text/measurement badges using CanvasTexture
function createMeasurementBadge(text, subtext = '', color = '#38bdf8', bgColor = 'rgba(15, 23, 42, 0.92)') {
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 76;
  const ctx = canvas.getContext('2d');

  // Rounded background card
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(4, 4, 332, 68, 12);
  } else {
    ctx.rect(4, 4, 332, 68);
  }
  ctx.fill();

  // Vibrant border glow
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(4, 4, 332, 68, 12);
  } else {
    ctx.rect(4, 4, 332, 68);
  }
  ctx.stroke();

  // Top title text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 170, subtext ? 26 : 38);

  // Subtext (meters / stair count)
  if (subtext) {
    ctx.fillStyle = color;
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(subtext, 170, 52);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false // Ensures badge stays visible and readable over 3D geometry
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(85, 19, 1);
  return sprite;
}

// Helper to create 3D dashed dimension line with end caps
function createDimensionLine(p1, p2, colorHex = 0xf59e0b) {
  const group = new THREE.Group();

  const points = [p1, p2];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: colorHex,
    dashSize: 8,
    gapSize: 4,
    linewidth: 2.5,
    transparent: true,
    opacity: 0.9
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  group.add(line);

  // Small sphere endpoint caps
  const capGeo = new THREE.SphereGeometry(3.5, 12, 12);
  const capMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
  const cap1 = new THREE.Mesh(capGeo, capMat);
  cap1.position.copy(p1);
  const cap2 = new THREE.Mesh(capGeo, capMat);
  cap2.position.copy(p2);
  group.add(cap1);
  group.add(cap2);

  return group;
}

export default function MapViewer3D({
  activeMap,
  userPos,
  headingDeg = 0,
  activeRoute = [],
  destinationId,
  selectedStart,
  onSelectStart,
  onSelectDest,
  onMapTap,
  isNavigating = false
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animFrameRef = useRef(null);
  const objectsGroupRef = useRef(null);
  const measurementsGroupRef = useRef(null);
  const pathGroupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destBeaconRef = useRef(null);
  const roomMeshesRef = useRef([]);

  // Camera preset mode: 'iso' | 'top' | 'follow'
  const [cameraMode, setCameraMode] = useState('iso');
  // Selected room info for popup
  const [selectedRoomPopup, setSelectedRoomPopup] = useState(null);
  // Mobile responsive detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  // Real-world physical measurements overlay toggles (collapsed by default on mobile screens)
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showMeasurementsPanel, setShowMeasurementsPanel] = useState(() => typeof window !== 'undefined' && window.innerWidth > 768);
  const [focusedMeasurementId, setFocusedMeasurementId] = useState(null);

  // Resize listener for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Map coordinate conversion: SVG coords (x: 0..W, y: 0..H) -> Three.js 3D coords
  const mapW = activeMap?.bounds?.width || 920;
  const mapH = activeMap?.bounds?.height || 680;
  const to3D = useCallback((x, y, z = 0) => {
    return new THREE.Vector3(x - mapW / 2, -(y - mapH / 2), z);
  }, [mapW, mapH]);

  // Drag / Orbit state & multi-touch pointer tracking (Pinch-to-zoom & 2-finger pan)
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef(new Map());
  const pinchStartDistRef = useRef(null);
  const pinchStartRadiusRef = useRef(null);
  const pinchStartCenterRef = useRef(null);
  const cameraStateRef = useRef({
    theta: Math.PI / 4, // Horizontal rotation
    phi: Math.PI / 3.2, // Pitch elevation
    radius: 950,
    target: new THREE.Vector3(0, 0, 0)
  });

  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    const { theta, phi, radius, target } = cameraStateRef.current;
    const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = target.y - radius * Math.sin(phi) * Math.cos(theta);
    const z = target.z + radius * Math.cos(phi);

    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(target.x, target.y, target.z);
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0f1d');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 10, 5000);
    cameraRef.current = camera;
    updateCameraPosition();

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xe0e7ff, 0.9);
    dirLight1.position.set(300, -400, 800);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 50;
    dirLight1.shadow.camera.far = 2500;
    const d = 800;
    dirLight1.shadow.camera.left = -d;
    dirLight1.shadow.camera.right = d;
    dirLight1.shadow.camera.top = d;
    dirLight1.shadow.camera.bottom = -d;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.4);
    dirLight2.position.set(-400, 300, 400);
    scene.add(dirLight2);

    // Ground Grid & Base Foundation
    const gridHelper = new THREE.GridHelper(Math.max(mapW, mapH) * 1.6, 36, 0x312e81, 0x1e1b4b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -1;
    scene.add(gridHelper);

    // Floor Base Plate
    const floorGeo = new THREE.BoxGeometry(mapW + 60, mapH + 60, 4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.1
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.z = -2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Main Objects Group
    const objectsGroup = new THREE.Group();
    scene.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    // Measurements Group (3D dimension lines & measurement badges)
    const measurementsGroup = new THREE.Group();
    scene.add(measurementsGroup);
    measurementsGroupRef.current = measurementsGroup;

    // Path Group (glowing route line)
    const pathGroup = new THREE.Group();
    scene.add(pathGroup);
    pathGroupRef.current = pathGroup;

    // Animation Loop
    let pulseTime = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      pulseTime += 0.04;

      // Animate Destination Beacon
      if (destBeaconRef.current) {
        destBeaconRef.current.rotation.z += 0.02;
        const scale = 1 + 0.12 * Math.sin(pulseTime * 2);
        destBeaconRef.current.scale.set(scale, scale, 1 + 0.2 * Math.cos(pulseTime * 2));
      }

      // Animate User/Robot Marker pulse
      if (userMarkerRef.current) {
        const pulseRing = userMarkerRef.current.getObjectByName('pulseRing');
        if (pulseRing) {
          const pScale = 1 + 0.3 * (Math.sin(pulseTime * 3) + 1);
          pulseRing.scale.set(pScale, pScale, 1);
          pulseRing.material.opacity = 0.7 - 0.3 * Math.sin(pulseTime * 3);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.clear();
    };
  }, [mapW, mapH, updateCameraPosition]);

  // Build 3D Building Geometry (Rooms, Extruded Walls, Labels) whenever activeMap changes
  useEffect(() => {
    const group = objectsGroupRef.current;
    if (!group || !activeMap) return;

    // Clear previous map objects
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }
    roomMeshesRef.current = [];

    // Clear previous measurement annotations
    const mGroup = measurementsGroupRef.current;
    if (mGroup) {
      while (mGroup.children.length > 0) {
        const obj = mGroup.children[0];
        mGroup.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
    }

    const wallHeight = (activeMap.wallHeightMeters || 2.8) * 10; // 3D units
    const floorElevationStep = 110;

    // 0. Build Multi-Floor Slabs if multi-floor map
    const numFloors = activeMap.floor || 1;
    if (numFloors > 1) {
      for (let fl = 0; fl < numFloors; fl++) {
        const zBase = fl * floorElevationStep;
        const slabGeo = new THREE.BoxGeometry(mapW + 40, mapH + 40, 4);
        const slabMat = new THREE.MeshStandardMaterial({
          color: fl === 0 ? 0x0f172a : fl === 1 ? 0x1e293b : 0x0f172a,
          roughness: 0.6,
          metalness: 0.2,
          transparent: true,
          opacity: fl === 0 ? 0.95 : 0.60
        });
        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
        slabMesh.position.set(0, 0, zBase);
        slabMesh.receiveShadow = true;
        group.add(slabMesh);

        // Floor Level Badge Sprite
        const fCanvas = document.createElement('canvas');
        fCanvas.width = 340;
        fCanvas.height = 70;
        const fCtx = fCanvas.getContext('2d');
        fCtx.fillStyle = fl === 0 ? '#0369a1' : fl === 1 ? '#b45309' : '#4338ca';
        fCtx.roundRect(0, 0, 340, 70, 14);
        fCtx.fill();
        fCtx.strokeStyle = '#ffffff';
        fCtx.lineWidth = 3;
        fCtx.roundRect(0, 0, 340, 70, 14);
        fCtx.stroke();
        fCtx.fillStyle = '#ffffff';
        fCtx.font = 'bold 24px sans-serif';
        fCtx.textAlign = 'center';
        fCtx.textBaseline = 'middle';
        const fTitle = fl === 0 ? 'GROUND FLOOR' : fl === 1 ? '1ST FLOOR · SHOP' : '2ND FLOOR · ROBOMANTHA';
        fCtx.fillText(fTitle, 170, 35);

        const fTex = new THREE.CanvasTexture(fCanvas);
        const fSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fTex, transparent: true }));
        fSprite.scale.set(160, 34, 1);
        fSprite.position.set(-mapW / 2 + 120, mapH / 2 - 30, zBase + 24);
        group.add(fSprite);
      }

      // 3D Physical Staircases between floors (4 flights of 10 steps each)
      const stairSpecs = [
        // Flight 1A (GF -> Mid): 10 steps, 4.18m
        { from: { x: 450, y: 651, z: 0 }, to: { x: 241, y: 651, z: 55 }, steps: 10, label: '10 Stairs (4.18m)' },
        // Flight 1B (Mid -> 1F): 10 steps, 4.89m
        { from: { x: 241, y: 651, z: 55 }, to: { x: 241, y: 407, z: 110 }, steps: 10, label: '10 Stairs (4.89m)' },
        // Flight 2A (1F -> Mid): 10 steps, 4.37m
        { from: { x: 241, y: 407, z: 110 }, to: { x: 459, y: 407, z: 165 }, steps: 10, label: '10 Stairs (4.37m)' },
        // Flight 2B (Mid -> 2F): 10 steps, 4.33m
        { from: { x: 459, y: 407, z: 165 }, to: { x: 459, y: 191, z: 220 }, steps: 10, label: '10 Stairs (4.33m)' }
      ];

      stairSpecs.forEach(({ from, to, steps }) => {
        const dx = (to.x - from.x) / steps;
        const dy = (to.y - from.y) / steps;
        const dz = (to.z - from.z) / steps;

        for (let s = 0; s < steps; s++) {
          const sx = from.x + dx * (s + 0.5);
          const sy = from.y + dy * (s + 0.5);
          const sz = from.z + dz * s;

          const isHorizontalX = Math.abs(dx) > Math.abs(dy);
          const stepGeo = new THREE.BoxGeometry(
            isHorizontalX ? 24 : 36,
            isHorizontalX ? 36 : 24,
            11
          );
          const stepMat = new THREE.MeshStandardMaterial({
            color: 0x6366f1,
            emissive: 0x312e81,
            roughness: 0.35
          });
          const stepMesh = new THREE.Mesh(stepGeo, stepMat);
          const pStep = to3D(sx, sy, sz + 5);
          stepMesh.position.set(pStep.x, pStep.y, pStep.z);
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
          group.add(stepMesh);
        }
      });
    }

    // 1. Build 3D Room Zones
    (activeMap.rooms || []).forEach((room) => {
      const floorZ = (room.floor !== undefined ? room.floor : 0) * floorElevationStep;
      const rw = room.w;
      const rh = room.h;
      const cx = room.x + rw / 2;
      const cy = room.y + rh / 2;
      const pos3D = to3D(cx, cy, floorZ + 1);

      // Floor plane of the room
      const roomFloorGeo = new THREE.PlaneGeometry(rw - 2, rh - 2);
      const roomColorHex = parseInt((room.color || '#1e293b').replace('#', '0x'), 16);
      const roomFloorMat = new THREE.MeshStandardMaterial({
        color: roomColorHex,
        roughness: 0.5,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
      });
      const roomFloor = new THREE.Mesh(roomFloorGeo, roomFloorMat);
      roomFloor.position.copy(pos3D);
      roomFloor.receiveShadow = true;
      roomFloor.userData = { isRoom: true, roomData: room };
      group.add(roomFloor);
      roomMeshesRef.current.push(roomFloor);

      // Extruded Walls around room perimeter (with door gap if configured)
      const wallThickness = 6;
      const doorRadius = room.door?.radius || 36;
      const doorSide = room.door?.side || 'left';

      // 4 walls: North, South, East, West
      const walls = [
        { side: 'top', x: 0, y: rh / 2, w: rw, h: wallThickness },
        { side: 'bottom', x: 0, y: -rh / 2, w: rw, h: wallThickness },
        { side: 'left', x: -rw / 2, y: 0, w: wallThickness, h: rh },
        { side: 'right', x: rw / 2, y: 0, w: wallThickness, h: rh }
      ];

      walls.forEach((wDef) => {
        // If this wall contains the door, create gap
        if (wDef.side === doorSide) {
          const segLen = (wDef.w === wallThickness ? rh : rw) / 2 - doorRadius / 2;
          if (segLen > 4) {
            // Half wall A
            const g1 = new THREE.BoxGeometry(
              wDef.w === wallThickness ? wallThickness : segLen,
              wDef.h === wallThickness ? segLen : wallThickness,
              wallHeight
            );
            const m1 = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 });
            const mesh1 = new THREE.Mesh(g1, m1);
            mesh1.position.set(
              pos3D.x + (wDef.side === 'left' ? -rw / 2 : wDef.side === 'right' ? rw / 2 : -rw / 4 - doorRadius / 4),
              pos3D.y + (wDef.side === 'top' ? rh / 2 : wDef.side === 'bottom' ? -rh / 2 : -rh / 4 - doorRadius / 4),
              floorZ + wallHeight / 2
            );
            mesh1.castShadow = true;
            mesh1.receiveShadow = true;
            group.add(mesh1);

            // Half wall B
            const g2 = new THREE.BoxGeometry(
              wDef.w === wallThickness ? wallThickness : segLen,
              wDef.h === wallThickness ? segLen : wallThickness,
              wallHeight
            );
            const m2 = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3 });
            const mesh2 = new THREE.Mesh(g2, m2);
            mesh2.position.set(
              pos3D.x + (wDef.side === 'left' ? -rw / 2 : wDef.side === 'right' ? rw / 2 : rw / 4 + doorRadius / 4),
              pos3D.y + (wDef.side === 'top' ? rh / 2 : wDef.side === 'bottom' ? -rh / 2 : rh / 4 + doorRadius / 4),
              floorZ + wallHeight / 2
            );
            mesh2.castShadow = true;
            mesh2.receiveShadow = true;
            group.add(mesh2);
          }
        } else {
          // Solid Wall
          const wallGeo = new THREE.BoxGeometry(wDef.w, wDef.h, wallHeight);
          const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.4,
            metalness: 0.1
          });
          const wallMesh = new THREE.Mesh(wallGeo, wallMat);
          wallMesh.position.set(pos3D.x + wDef.x, pos3D.y + wDef.y, floorZ + wallHeight / 2);
          wallMesh.castShadow = true;
          wallMesh.receiveShadow = true;
          group.add(wallMesh);
        }
      });

      // 3D Text Label Banner floating above room
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(0, 0, 256, 64, 12);
      ctx.fill();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.roundRect(0, 0, 256, 64, 12);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.label || room.name, 128, 32);

      const labelTex = new THREE.CanvasTexture(canvas);
      labelTex.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(110, 28, 1);
      sprite.position.set(pos3D.x, pos3D.y, floorZ + wallHeight + 18);
      group.add(sprite);
    });

    // 2. Extra freestanding walls (if map defines them)
    (activeMap.walls || []).forEach((w) => {
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(-(dy), dx);

      const wallGeo = new THREE.BoxGeometry(len, 6, wallHeight);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);

      const midX = (w.x1 + w.x2) / 2;
      const midY = (w.y1 + w.y2) / 2;
      const p = to3D(midX, midY, wallHeight / 2);
      wallMesh.position.set(p.x, p.y, p.z);
      wallMesh.rotation.z = angle;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);
    });

    // 3. Waypoint Nodes as subtle floor markers
    (activeMap.nodes || []).forEach((node) => {
      if (node.type === 'poi' || node.type === 'junction') {
        const p = to3D(node.x, node.y, 1.5);
        const diskGeo = new THREE.CircleGeometry(node.type === 'poi' ? 10 : 6, 24);
        const diskMat = new THREE.MeshBasicMaterial({
          color: node.type === 'poi' ? 0x6366f1 : 0x475569,
          transparent: true,
          opacity: 0.6
        });
        const disk = new THREE.Mesh(diskGeo, diskMat);
        disk.position.copy(p);
        group.add(disk);
      }
    });

    // 4. Real-World Physical Measurement 3D Annotations & Dimensions
    if (mGroup && activeMap.dimensions && activeMap.dimensions.length > 0) {
      activeMap.dimensions.forEach((dim) => {
        const from = dim.from || dim.p1;
        const to = dim.to || dim.p2;
        if (!from || !to || typeof from.x !== 'number' || typeof to.x !== 'number') return;

        const p1 = to3D(from.x, from.y, (from.z ?? 0) + 4);
        const p2 = to3D(to.x, to.y, (to.z ?? 0) + 4);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

        let badgeColor = '#38bdf8'; // sky blue for walk
        let lineHex = 0x38bdf8;
        if (dim.type === 'stairs') {
          badgeColor = '#f59e0b'; // amber gold for stairs
          lineHex = 0xf59e0b;
        } else if (dim.type === 'landmark') {
          badgeColor = '#ec4899'; // pink for landmarks
          lineHex = 0xec4899;
        }

        // Draw glowing 3D dimension line with end-caps
        const dimLine = createDimensionLine(p1, p2, lineHex);
        dimLine.name = `line_${dim.id}`;
        mGroup.add(dimLine);

        // Subtext on badge
        const sub = dim.type === 'stairs'
          ? `🪜 ${dim.steps || 10} Stairs · ${dim.distanceMeters || '4.2'}m`
          : dim.distanceMeters
          ? `📏 ${dim.distanceMeters} m`
          : '📍 Landmark';

        // 3D Billboard Sprite Badge
        const badge = createMeasurementBadge(
          dim.shortLabel || dim.label,
          sub,
          badgeColor
        );
        // Elevate badge above the line so it floats legibly in 3D
        badge.position.set(mid.x, mid.y, mid.z + 18);
        badge.name = `badge_${dim.id}`;
        mGroup.add(badge);
      });
    }

  }, [activeMap, to3D]);

  // Sync measurement group visibility with state
  useEffect(() => {
    if (measurementsGroupRef.current) {
      measurementsGroupRef.current.visible = showMeasurements;
    }
  }, [showMeasurements]);

  // Render 3D Route Path Ribbon
  useEffect(() => {
    const pathGroup = pathGroupRef.current;
    if (!pathGroup) return;

    // Clear previous path
    while (pathGroup.children.length > 0) {
      const obj = pathGroup.children[0];
      pathGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }

    if (!activeRoute || activeRoute.length < 2) return;

    // Convert route coordinates to 3D curve with floor elevation
    const floorElevationStep = 110;
    const points3D = activeRoute.map((pt) => {
      let fl = pt.floor;
      if (fl === undefined && (activeMap?.floor || 1) > 1) {
        fl = pt.y > 660 ? 0 : pt.y > 430 ? 1 : 2;
      }
      return to3D(pt.x, pt.y, (fl || 0) * floorElevationStep + 5);
    });

    // Create a smooth 3D curved tube or ribbon along path
    const curve = new THREE.CatmullRomCurve3(points3D);
    curve.curveType = 'catmullrom';
    curve.tension = 0.2;

    // Glowing 3D Tube Path
    const tubeGeo = new THREE.TubeGeometry(curve, points3D.length * 8, 4.5, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.92
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    pathGroup.add(tubeMesh);

    // Glowing waypoint beads along the path
    points3D.forEach((p, idx) => {
      if (idx === 0 || idx === points3D.length - 1) return;
      const beadGeo = new THREE.SphereGeometry(6, 16, 16);
      const beadMat = new THREE.MeshStandardMaterial({
        color: 0xa5b4fc,
        emissive: 0x818cf8,
        emissiveIntensity: 0.8
      });
      const bead = new THREE.Mesh(beadGeo, beadMat);
      bead.position.copy(p);
      pathGroup.add(bead);
    });

  }, [activeRoute, activeMap, to3D]);

  // Destination 3D Pulsing Beacon
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing beacon
    if (destBeaconRef.current) {
      scene.remove(destBeaconRef.current);
      destBeaconRef.current = null;
    }

    if (!destinationId || !activeMap) return;
    const dest = (activeMap.destinations || []).find((d) => d.id === destinationId);
    if (!dest) return;

    const floorElevationStep = 110;
    let destFloor = dest.floor;
    if (destFloor === undefined && (activeMap?.floor || 1) > 1) {
      destFloor = dest.y > 660 ? 0 : dest.y > 430 ? 1 : 2;
    }
    const destZ = (destFloor || 0) * floorElevationStep + 2;

    const beaconGroup = new THREE.Group();
    const p = to3D(dest.x, dest.y, destZ);

    // 1. Concentric Floor Rings
    const ringGeo = new THREE.RingGeometry(18, 24, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    beaconGroup.add(ring);

    // 2. Towering Vertical Beacon Cylinder
    const beamGeo = new THREE.CylinderGeometry(2, 16, 140, 24, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf87171,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = Math.PI / 2;
    beam.position.z = 70;
    beaconGroup.add(beam);

    // 3. Floating 3D Target Pin Cone
    const pinGeo = new THREE.ConeGeometry(12, 28, 24);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.7 });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.rotation.x = -Math.PI / 2;
    pin.position.z = 145;
    beaconGroup.add(pin);

    beaconGroup.position.set(p.x, p.y, p.z);
    scene.add(beaconGroup);
    destBeaconRef.current = beaconGroup;

  }, [destinationId, activeMap, to3D]);

  // User / Robot 3D Position Marker
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!userMarkerRef.current) {
      const markerGroup = new THREE.Group();

      // Robot Chassis Body (Rounded box)
      const bodyGeo = new THREE.CylinderGeometry(14, 16, 10, 24);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.4
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      markerGroup.add(body);

      // Directional Heading Arrow Nose
      const arrowGeo = new THREE.ConeGeometry(7, 16, 16);
      const arrowMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x3b82f6 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(0, 18, 0);
      arrow.rotation.z = 0;
      markerGroup.add(arrow);

      // Pulsing Base Ring
      const ringGeo = new THREE.RingGeometry(18, 22, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = 'pulseRing';
      markerGroup.add(ring);

      markerGroup.position.z = 8;
      scene.add(markerGroup);
      userMarkerRef.current = markerGroup;
    }

    if (userPos && userMarkerRef.current) {
      const floorElevationStep = 110;
      let uFloor = userPos.floor;
      if (uFloor === undefined && (activeMap?.floor || 1) > 1) {
        uFloor = userPos.y > 660 ? 0 : userPos.y > 430 ? 1 : 2;
      }
      const uZ = (uFloor || 0) * floorElevationStep + 8;
      const p = to3D(userPos.x, userPos.y, uZ);

      userMarkerRef.current.position.x = p.x;
      userMarkerRef.current.position.y = p.y;
      userMarkerRef.current.position.z = uZ;

      // Rotate marker based on headingDeg
      // In Three.js coordinates, 0 deg is North (+Y)
      const rad = -(headingDeg * Math.PI) / 180;
      userMarkerRef.current.rotation.z = rad;

      // When navigating, keep camera focused and moving with the user (Google Maps 3D navigation style)
      if (isNavigating && cameraRef.current) {
        cameraStateRef.current.target.set(p.x, p.y, uZ);
        if (cameraMode === 'follow') {
          cameraStateRef.current.theta = rad;
        }
        cameraStateRef.current.phi = Math.PI / 3.4;
        cameraStateRef.current.radius = 460;
        updateCameraPosition();
      } else if (cameraMode === 'follow' && cameraRef.current) {
        cameraStateRef.current.target.set(p.x, p.y, uZ);
        cameraStateRef.current.theta = rad;
        cameraStateRef.current.phi = Math.PI / 3.4;
        cameraStateRef.current.radius = 450;
        updateCameraPosition();
      }
    }
  }, [userPos, headingDeg, cameraMode, isNavigating, activeMap, to3D, updateCameraPosition]);

  // Click / Raycast Selection & Multi-Touch Gestures (Pinch-to-zoom & 2-finger pan)
  const handlePointerDown = (e) => {
    isDraggingRef.current = false;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    } else if (activePointersRef.current.size === 2) {
      isDraggingRef.current = true;
      const pts = Array.from(activePointersRef.current.values());
      pinchStartDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStartRadiusRef.current = cameraStateRef.current.radius;
      pinchStartCenterRef.current = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
    }
  };

  const handlePointerMove = (e) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const numPointers = activePointersRef.current.size;

    if (numPointers === 1) {
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDraggingRef.current = true;
      }

      if (e.buttons === 1 || e.pointerType === 'touch') {
        // Orbit rotation
        cameraStateRef.current.theta -= dx * 0.007;
        cameraStateRef.current.phi = Math.max(0.15, Math.min(Math.PI / 2.05, cameraStateRef.current.phi - dy * 0.007));
        updateCameraPosition();
      } else if (e.buttons === 2) {
        // Right button pan
        cameraStateRef.current.target.x -= dx * 0.6;
        cameraStateRef.current.target.y += dy * 0.6;
        updateCameraPosition();
      }
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

    } else if (numPointers === 2) {
      isDraggingRef.current = true;
      const pts = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

      // Multi-Touch Pinch to Zoom
      if (pinchStartDistRef.current && currentDist > 10) {
        const factor = pinchStartDistRef.current / currentDist;
        const newRadius = pinchStartRadiusRef.current * factor;
        cameraStateRef.current.radius = Math.max(260, Math.min(2400, newRadius));
      }

      // Multi-Touch Two-Finger Pan
      const currentCenter = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
      if (pinchStartCenterRef.current) {
        const panDx = currentCenter.x - pinchStartCenterRef.current.x;
        const panDy = currentCenter.y - pinchStartCenterRef.current.y;
        cameraStateRef.current.target.x -= panDx * 0.7;
        cameraStateRef.current.target.y += panDy * 0.7;
        pinchStartCenterRef.current = currentCenter;
      }

      updateCameraPosition();
    }
  };

  const handlePointerUp = (e) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
      pinchStartCenterRef.current = null;
    }
    if (activePointersRef.current.size === 1) {
      const remainingPt = Array.from(activePointersRef.current.values())[0];
      prevMouseRef.current = { x: remainingPt.x, y: remainingPt.y };
    }

    if (!isDraggingRef.current && mountRef.current && cameraRef.current && sceneRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(roomMeshesRef.current);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const roomData = hit.object.userData?.roomData;
        if (roomData) {
          setSelectedRoomPopup({
            room: roomData,
            screenX: e.clientX,
            screenY: e.clientY
          });
        }
      } else {
        setSelectedRoomPopup(null);
      }
    }
  };

  const handlePointerCancel = (e) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
      pinchStartCenterRef.current = null;
    }
  };

  // Scroll Wheel Zoom
  const handleWheel = (e) => {
    e.preventDefault();
    cameraStateRef.current.radius = Math.max(260, Math.min(2400, cameraStateRef.current.radius + e.deltaY * 0.8));
    updateCameraPosition();
  };

  // Floating Zoom Buttons (Single-thumb mobile controls)
  const handleZoomIn = (e) => {
    e?.stopPropagation();
    cameraStateRef.current.radius = Math.max(260, cameraStateRef.current.radius - 140);
    updateCameraPosition();
  };

  const handleZoomOut = (e) => {
    e?.stopPropagation();
    cameraStateRef.current.radius = Math.min(2400, cameraStateRef.current.radius + 140);
    updateCameraPosition();
  };

  // Preset Views (Includes Multi-Floor Jumps)
  const setPresetView = (mode) => {
    setCameraMode(mode);
    const floorElevationStep = 110;
    if (mode === 'iso') {
      cameraStateRef.current.theta = Math.PI / 4;
      cameraStateRef.current.phi = Math.PI / 3.2;
      cameraStateRef.current.radius = 1100;
      cameraStateRef.current.target.set(0, 0, (activeMap?.floor || 1) > 1 ? 110 : 0);
    } else if (mode === 'top') {
      cameraStateRef.current.theta = 0;
      cameraStateRef.current.phi = 0.01;
      cameraStateRef.current.radius = 1200;
      cameraStateRef.current.target.set(0, 0, (activeMap?.floor || 1) > 1 ? 110 : 0);
    } else if (mode === 'gf') {
      const p = to3D(450, 715, 0);
      cameraStateRef.current.target.set(p.x, p.y, 0);
      cameraStateRef.current.theta = Math.PI / 4;
      cameraStateRef.current.phi = Math.PI / 3.3;
      cameraStateRef.current.radius = 550;
    } else if (mode === 'ff') {
      const p = to3D(241, 407, floorElevationStep);
      cameraStateRef.current.target.set(p.x, p.y, floorElevationStep);
      cameraStateRef.current.theta = Math.PI / 3.8;
      cameraStateRef.current.phi = Math.PI / 3.3;
      cameraStateRef.current.radius = 580;
    } else if (mode === 'sf') {
      const p = to3D(670, 350, floorElevationStep * 2);
      cameraStateRef.current.target.set(p.x, p.y, floorElevationStep * 2);
      cameraStateRef.current.theta = Math.PI / 4;
      cameraStateRef.current.phi = Math.PI / 3.3;
      cameraStateRef.current.radius = 650;
    } else if (mode === 'follow') {
      if (userPos) {
        let uFloor = userPos.floor;
        if (uFloor === undefined && (activeMap?.floor || 1) > 1) {
          uFloor = userPos.y > 660 ? 0 : userPos.y > 430 ? 1 : 2;
        }
        const uZ = (uFloor || 0) * floorElevationStep + 8;
        const p = to3D(userPos.x, userPos.y, uZ);
        cameraStateRef.current.target.set(p.x, p.y, uZ);
        cameraStateRef.current.theta = -(headingDeg * Math.PI) / 180;
        cameraStateRef.current.phi = Math.PI / 3.4;
        cameraStateRef.current.radius = 450;
      }
    }
    updateCameraPosition();
  };

  const handleCenterOnUser = () => {
    if (!userPos) return;
    const floorElevationStep = 110;
    let uFloor = userPos.floor;
    if (uFloor === undefined && (activeMap?.floor || 1) > 1) {
      uFloor = userPos.y > 660 ? 0 : userPos.y > 430 ? 1 : 2;
    }
    const uZ = (uFloor || 0) * floorElevationStep + 8;
    const p = to3D(userPos.x, userPos.y, uZ);
    cameraStateRef.current.target.set(p.x, p.y, uZ);
    updateCameraPosition();
  };

  // Fly camera to focus on a specific measurement segment
  const handleFocusDimension = (dim) => {
    if (!dim) return;
    setFocusedMeasurementId(dim.id);
    const from = dim.from || dim.p1;
    const to = dim.to || dim.p2;
    if (!from || !to || typeof from.x !== 'number' || typeof to.x !== 'number') return;

    const p1 = to3D(from.x, from.y, from.z || 0);
    const p2 = to3D(to.x, to.y, to.z || 0);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    cameraStateRef.current.target.set(mid.x, mid.y, mid.z);
    cameraStateRef.current.radius = 480;
    cameraStateRef.current.phi = Math.PI / 3.4;
    cameraStateRef.current.theta = Math.PI / 4;
    updateCameraPosition();
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0a0f1d'
      }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Camera Controls & Header Controls */}
      {isMobile ? (
        /* Mobile Top Navigation Pills */
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '68px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 50,
          pointerEvents: 'auto'
        }}>
          {/* View Preset Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowCameraMenu((v) => !v)}
              style={{
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(10px)',
                color: '#ffffff',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '20px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                cursor: 'pointer'
              }}
            >
              <span>{cameraMode === 'iso' ? '📐 3D Iso' : cameraMode === 'top' ? '🔝 Top-Down' : cameraMode === 'follow' ? '🏃 Follow' : cameraMode === 'gf' ? '1️⃣ GF' : cameraMode === 'ff' ? '2️⃣ 1F' : cameraMode === 'sf' ? '3️⃣ 2F' : '🎥 View'}</span>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>{showCameraMenu ? '▲' : '▼'}</span>
            </button>

            {/* Mobile Dropdown Popover */}
            {showCameraMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '110%',
                  left: '0',
                  minWidth: '150px',
                  background: 'rgba(15, 23, 42, 0.96)',
                  backdropFilter: 'blur(16px)',
                  border: '1.5px solid rgba(99, 102, 241, 0.5)',
                  borderRadius: '14px',
                  padding: '6px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  zIndex: 60
                }}
              >
                <button
                  type="button"
                  onClick={() => { setPresetView('iso'); setShowCameraMenu(false); }}
                  style={{
                    background: cameraMode === 'iso' ? '#6366f1' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  📐 3D Isometric
                </button>
                <button
                  type="button"
                  onClick={() => { setPresetView('top'); setShowCameraMenu(false); }}
                  style={{
                    background: cameraMode === 'top' ? '#6366f1' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  🔝 Top-Down 2D
                </button>
                <button
                  type="button"
                  onClick={() => { setPresetView('follow'); setShowCameraMenu(false); }}
                  style={{
                    background: cameraMode === 'follow' ? '#6366f1' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  🏃 Follow User
                </button>

                {(activeMap?.floor || 1) > 1 && (
                  <>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
                    <button
                      type="button"
                      onClick={() => { setPresetView('gf'); setShowCameraMenu(false); }}
                      style={{
                        background: cameraMode === 'gf' ? '#0284c7' : 'transparent',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      1️⃣ Ground Floor
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPresetView('ff'); setShowCameraMenu(false); }}
                      style={{
                        background: cameraMode === 'ff' ? '#b45309' : 'transparent',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      2️⃣ 1st Floor Shop
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPresetView('sf'); setShowCameraMenu(false); }}
                      style={{
                        background: cameraMode === 'sf' ? '#4f46e5' : 'transparent',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      3️⃣ 2nd Floor Robomanthan
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile Blueprint Drawer Toggle Pill */}
          {activeMap?.dimensions && activeMap.dimensions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMeasurementsPanel((v) => !v)}
              style={{
                background: showMeasurementsPanel ? '#f59e0b' : 'rgba(15, 23, 42, 0.92)',
                color: showMeasurementsPanel ? '#0f172a' : '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                borderRadius: '20px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                cursor: 'pointer'
              }}
            >
              <span>📐 Blueprint</span>
            </button>
          )}

          {/* 3D Dimension Lines Toggle Pill */}
          <button
            type="button"
            onClick={() => setShowMeasurements((v) => !v)}
            title="Toggle 3D dimension badges"
            style={{
              background: showMeasurements ? 'rgba(52, 211, 153, 0.2)' : 'rgba(15, 23, 42, 0.92)',
              color: showMeasurements ? '#34d399' : '#94a3b8',
              border: `1px solid ${showMeasurements ? '#10b981' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '20px',
              padding: '7px 10px',
              fontSize: '11.5px',
              fontWeight: '700',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              cursor: 'pointer'
            }}
          >
            📏 {showMeasurements ? '3D ON' : '3D OFF'}
          </button>
        </div>
      ) : (
        /* Desktop Vertical Dock Toolbar (Top Left) */
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 50,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '6px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <button
            type="button"
            onClick={() => setPresetView('iso')}
            style={{
              background: cameraMode === 'iso' ? '#6366f1' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            📐 3D Iso
          </button>
          <button
            type="button"
            onClick={() => setPresetView('top')}
            style={{
              background: cameraMode === 'top' ? '#6366f1' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            🔝 Top-Down
          </button>
          <button
            type="button"
            onClick={() => setPresetView('follow')}
            style={{
              background: cameraMode === 'follow' ? '#6366f1' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            🏃 Follow
          </button>

          {(activeMap?.floor || 1) > 1 && (
            <>
              <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.12)', margin: '2px 0' }} />
              <button
                type="button"
                onClick={() => setPresetView('gf')}
                style={{
                  background: cameraMode === 'gf' ? '#0284c7' : 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                1️⃣ GF Entrance
              </button>
              <button
                type="button"
                onClick={() => setPresetView('ff')}
                style={{
                  background: cameraMode === 'ff' ? '#b45309' : 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                2️⃣ 1F Shop
              </button>
              <button
                type="button"
                onClick={() => setPresetView('sf')}
                style={{
                  background: cameraMode === 'sf' ? '#4f46e5' : 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                3️⃣ 2F Office
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleCenterOnUser}
            title="Center view on user/robot position"
            style={{
              background: 'transparent',
              color: '#a5b4fc',
              border: '1px solid rgba(165, 180, 252, 0.3)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            🎯 Re-Center
          </button>

          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.12)', margin: '2px 0' }} />

          {/* Real-world measurements toggle */}
          <button
            type="button"
            onClick={() => setShowMeasurements((v) => !v)}
            title="Toggle 3D dimension lines & measurement labels"
            style={{
              background: showMeasurements ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: showMeasurements ? '#818cf8' : '#64748b',
              border: `1px solid ${showMeasurements ? '#6366f1' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <span>📏 3D Labels:</span>
            <span style={{ color: showMeasurements ? '#34d399' : '#94a3b8' }}>{showMeasurements ? 'ON' : 'OFF'}</span>
          </button>

          {activeMap?.dimensions && activeMap.dimensions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMeasurementsPanel((v) => !v)}
              title="Toggle measurement blueprint card"
              style={{
                background: showMeasurementsPanel ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: showMeasurementsPanel ? '#f59e0b' : '#94a3b8',
                border: `1px solid ${showMeasurementsPanel ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              📐 Blueprint {showMeasurementsPanel ? '▲' : '▼'}
            </button>
          )}
        </div>
      )}

      {/* Floating Single-Thumb Zoom & Re-Center Controls (Right Hand Floating Pill) */}
      <div style={{
        position: 'absolute',
        right: '16px',
        bottom: isMobile ? '86px' : '36px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 48,
        pointerEvents: 'auto'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          overflow: 'hidden'
        }}>
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              background: 'transparent',
              color: '#ffffff',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              width: '42px',
              height: '42px',
              fontSize: '20px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              background: 'transparent',
              color: '#ffffff',
              border: 'none',
              width: '42px',
              height: '42px',
              fontSize: '20px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            −
          </button>
        </div>

        {/* Center on User shortcut button */}
        <button
          type="button"
          onClick={handleCenterOnUser}
          title="Center on user"
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(10px)',
            color: '#a5b4fc',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '12px',
            width: '42px',
            height: '42px',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            cursor: 'pointer'
          }}
        >
          🎯
        </button>
      </div>

      {/* Floating Google Maps-Style Compass Widget (Top Right) */}
      <button
        type="button"
        onClick={() => {
          handleCenterOnUser();
          setPresetView('iso');
        }}
        title="Tap to re-orient North and center on user"
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '2px solid rgba(99, 102, 241, 0.6)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
          transition: 'transform 0.15s ease'
        }}
      >
        <div
          style={{
            transform: `rotate(${-(headingDeg || 0)}deg)`,
            transition: 'transform 0.1s linear',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <div style={{
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '14px solid #ef4444'
          }} />
          <div style={{
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '14px solid #cbd5e1'
          }} />
        </div>
      </button>

      {/* Real-World Physical Measurements Blueprint: Bottom Sheet Drawer (Mobile) or Floating Card (Desktop) */}
      {activeMap?.dimensions && activeMap.dimensions.length > 0 && showMeasurementsPanel && (
        isMobile ? (
          /* Mobile Bottom Sheet Drawer */
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '65vh',
              background: 'rgba(15, 23, 42, 0.97)',
              backdropFilter: 'blur(20px)',
              borderTop: '2px solid rgba(99, 102, 241, 0.5)',
              borderTopLeftRadius: '22px',
              borderTopRightRadius: '22px',
              boxShadow: '0 -12px 40px rgba(0, 0, 0, 0.75)',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              overflow: 'hidden'
            }}
          >
            {/* Drawer Pull Handle */}
            <div
              onClick={() => setShowMeasurementsPanel(false)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                padding: '10px 0 4px',
                cursor: 'pointer'
              }}
            >
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.3)' }} />
            </div>

            {/* Drawer Header */}
            <div style={{
              padding: '8px 16px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📐</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#f8fafc' }}>
                    Measured Blueprint
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {activeMap.dimensions.length} Exact Measured Segments
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMeasurements((v) => !v)}
                  style={{
                    background: showMeasurements ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: `1px solid ${showMeasurements ? '#10b981' : '#64748b'}`,
                    color: showMeasurements ? '#34d399' : '#94a3b8',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  3D: {showMeasurements ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMeasurementsPanel(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    color: '#94a3b8',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Summary Badges */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1, background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '10px', padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#a5b4fc' }}>40 Stairs</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>4 flights × 10</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#fbbf24' }}>17.77 m</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Total Stairs</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#34d399' }}>6.80 m</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Door to HR</div>
                </div>
              </div>

              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', margin: '4px 2px 2px' }}>
                Tap a segment to fly camera to it:
              </div>

              {activeMap.dimensions.map((dim, idx) => {
                const isFocused = focusedMeasurementId === dim.id;
                const isStairs = dim.type === 'stairs';
                const isLandmark = dim.type === 'landmark';

                return (
                  <div
                    key={dim.id}
                    onClick={() => handleFocusDimension(dim)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: isFocused
                        ? 'rgba(99, 102, 241, 0.35)'
                        : 'rgba(30, 41, 59, 0.7)',
                      border: `1.5px solid ${
                        isFocused
                          ? '#818cf8'
                          : isStairs
                          ? 'rgba(245, 158, 11, 0.3)'
                          : isLandmark
                          ? 'rgba(236, 72, 153, 0.3)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px' }}>
                        {isStairs ? '🪜' : isLandmark ? '🏢' : '🚶'}
                      </span>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#f1f5f9' }}>
                          {idx + 1}. {dim.shortLabel || dim.label}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>
                          {dim.description}
                        </div>
                      </div>
                    </div>
                    {dim.distanceMeters && (
                      <div style={{
                        marginLeft: '8px',
                        fontSize: '12.5px',
                        fontWeight: '800',
                        color: isStairs ? '#fbbf24' : '#38bdf8',
                        whiteSpace: 'nowrap'
                      }}>
                        {dim.distanceMeters}m
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Desktop Blueprint Card */
          <div
            style={{
              position: 'absolute',
              top: '72px',
              right: '16px',
              width: '320px',
              maxHeight: 'calc(100vh - 120px)',
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1.5px solid rgba(99, 102, 241, 0.45)',
              borderRadius: '16px',
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55)',
              zIndex: 45,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.25s ease'
            }}
          >
            {/* Card Header */}
            <div
              onClick={() => setShowMeasurementsPanel((v) => !v)}
              style={{
                padding: '12px 14px',
                background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📐</span>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#f8fafc', letterSpacing: '0.3px' }}>
                    Measured Blueprint
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {activeMap.dimensions.length} Exact Measured Segments
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMeasurements((v) => !v);
                  }}
                  title="Toggle 3D dimension badges"
                  style={{
                    background: showMeasurements ? 'rgba(52, 211, 153, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    border: `1px solid ${showMeasurements ? '#10b981' : '#64748b'}`,
                    color: showMeasurements ? '#34d399' : '#94a3b8',
                    borderRadius: '6px',
                    padding: '2px 7px',
                    fontSize: '9.5px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  3D: {showMeasurements ? 'ON' : 'OFF'}
                </button>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>▲</span>
              </div>
            </div>

            {/* Card Body */}
            <div style={{ padding: '10px', overflowY: 'auto', maxHeight: '380px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                <div style={{ flex: 1, background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#a5b4fc' }}>40 Stairs</div>
                  <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>4 flights × 10</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#fbbf24' }}>17.77 m</div>
                  <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>Total Stairs</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#34d399' }}>6.80 m</div>
                  <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>Door to HR</div>
                </div>
              </div>

              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', margin: '4px 2px 2px' }}>
                Tap a segment to fly 3D view:
              </div>

              {activeMap.dimensions.map((dim, idx) => {
                const isFocused = focusedMeasurementId === dim.id;
                const isStairs = dim.type === 'stairs';
                const isLandmark = dim.type === 'landmark';

                return (
                  <div
                    key={dim.id}
                    onClick={() => handleFocusDimension(dim)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: isFocused
                        ? 'rgba(99, 102, 241, 0.25)'
                        : 'rgba(30, 41, 59, 0.65)',
                      border: `1px solid ${
                        isFocused
                          ? '#6366f1'
                          : isStairs
                          ? 'rgba(245, 158, 11, 0.25)'
                          : isLandmark
                          ? 'rgba(236, 72, 153, 0.25)'
                          : 'rgba(255, 255, 255, 0.08)'
                      }`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isFocused) e.currentTarget.style.background = 'rgba(30, 41, 59, 0.65)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '14px', marginTop: '1px' }}>
                        {isStairs ? '🪜' : isLandmark ? '🏢' : '🚶'}
                      </span>
                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#f1f5f9' }}>
                          {idx + 1}. {dim.shortLabel || dim.label}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.25' }}>
                          {dim.description}
                        </div>
                      </div>
                    </div>
                    {dim.distanceMeters && (
                      <div style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        fontWeight: '800',
                        color: isStairs ? '#fbbf24' : '#38bdf8',
                        whiteSpace: 'nowrap'
                      }}>
                        {dim.distanceMeters}m
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Floating Room Raycast Selection Card */}
      {selectedRoomPopup && (
        <div style={{
          position: 'absolute',
          ...(isMobile ? {
            bottom: '24px',
            left: '16px',
            right: '16px',
            width: 'auto'
          } : {
            top: Math.max(20, Math.min(window.innerHeight - 200, selectedRoomPopup.screenY - 120)),
            left: Math.max(20, Math.min(window.innerWidth - 220, selectedRoomPopup.screenX - 100)),
            width: '210px'
          }),
          zIndex: 100,
          background: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
          padding: '12px 14px',
          border: '1.5px solid #6366f1',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#6366f1', textTransform: 'uppercase' }}>
              {selectedRoomPopup.room.type || 'Room'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedRoomPopup(null)}
              style={{ background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: '#94a3b8' }}
            >
              ✕
            </button>
          </div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>
            {selectedRoomPopup.room.name || selectedRoomPopup.room.label}
          </h4>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                const targetNode = activeMap?.nodes?.find((n) => n.id === selectedRoomPopup.room.id || n.id === selectedRoomPopup.room.nodeId) || selectedRoomPopup.room;
                if (onSelectStart) onSelectStart(targetNode.id);
                setSelectedRoomPopup(null);
              }}
              style={{
                flex: 1,
                padding: '6px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#1e293b',
                cursor: 'pointer'
              }}
            >
              🟢 Set Start
            </button>
            <button
              type="button"
              onClick={() => {
                const destObj = activeMap?.destinations?.find((d) => d.id === selectedRoomPopup.room.id || d.nodeId === selectedRoomPopup.room.id) || selectedRoomPopup.room;
                if (onSelectDest) onSelectDest(destObj.id);
                setSelectedRoomPopup(null);
              }}
              style={{
                flex: 1,
                padding: '6px',
                background: '#6366f1',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              🏁 Navigate
            </button>
          </div>
        </div>
      )}

      {/* 3D Navigation Watermark & Hint */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '16px',
        zIndex: 40,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: 'rgba(255, 255, 255, 0.45)',
        fontSize: '11px',
        fontWeight: '600'
      }}>
        <span>🌐 Drag to rotate · Pinch/scroll to zoom · Tap rooms to navigate</span>
      </div>
    </div>
  );
}
