// =============================================================================
// INDOOR MAP VIEWER (3D & 2D BLUEPRINT VIEWPORT)
// Seamlessly toggles between Three.js WebGL 3D World and Classic 2D Architectural Blueprint
// =============================================================================

import React, { useRef, useState, useEffect } from 'react';
import {
  ROOMS,
  NODES,
  EDGES,
  MAP_WIDTH,
  MAP_HEIGHT,
  OFFICE_WALLS,
  OFFICE_DIMENSIONS,
  nodesById as defaultNodesById
} from '../data/buildingMapData.js';
import MapViewer3D from './MapViewer3D.jsx';
import DiagramMapViewer from './DiagramMapViewer.jsx';

// SVG Dimension Arrow Helper
function DimensionArrow({ p1, p2, from, to, text, offset = { x: 0, y: -10 } }) {
  const pt1 = p1 || from;
  const pt2 = p2 || to;
  if (!pt1 || !pt2 || typeof pt1.x !== 'number' || typeof pt2.x !== 'number' || typeof pt1.y !== 'number' || typeof pt2.y !== 'number') {
    return null;
  }
  const angle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
  const midX = (pt1.x + pt2.x) / 2 + (offset?.x || 0);
  const midY = (pt1.y + pt2.y) / 2 + (offset?.y || 0);
  const headLen = 6;

  return (
    <g className="dimension-group">
      <line
        x1={pt1.x}
        y1={pt1.y}
        x2={pt2.x}
        y2={pt2.y}
        stroke="#64748b"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />
      <line
        x1={pt1.x}
        y1={pt1.y}
        x2={pt1.x + headLen * Math.cos(angle + 0.4)}
        y2={pt1.y + headLen * Math.sin(angle + 0.4)}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <line
        x1={pt1.x}
        y1={pt1.y}
        x2={pt1.x + headLen * Math.cos(angle - 0.4)}
        y2={pt1.y + headLen * Math.sin(angle - 0.4)}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <line
        x1={pt2.x}
        y1={pt2.y}
        x2={pt2.x - headLen * Math.cos(angle + 0.4)}
        y2={pt2.y - headLen * Math.sin(angle + 0.4)}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <line
        x1={pt2.x}
        y1={pt2.y}
        x2={pt2.x - headLen * Math.cos(angle - 0.4)}
        y2={pt2.y - headLen * Math.sin(angle - 0.4)}
        stroke="#64748b"
        strokeWidth="1.5"
      />
      <text
        x={midX}
        y={midY}
        fill="#94a3b8"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

// Door swing arc
function DoorArc({ cx, cy, radius = 38, startAngle = 0, endAngle = Math.PI / 2 }) {
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);

  return (
    <g className="door-arc-group">
      <path
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
        fill="rgba(59, 130, 246, 0.08)"
        stroke="#334155"
        strokeWidth="1.5"
      />
      <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#334155" strokeWidth="2.2" />
    </g>
  );
}

export function MapViewer({
  activeMap,
  currentCoord,
  userPos,
  headingDeg,
  userHeading,
  activePath,
  activeRoute,
  destinationId,
  destination,
  selectedStart,
  onSelectStart,
  onSelectDest,
  onMapTap,
  onLocateMe,
  isNavigating = false,
  rooms = ROOMS,
  corridors = EDGES,
  bounds = { width: MAP_WIDTH, height: MAP_HEIGHT }
}) {
  const containerRef = useRef(null);

  // 3D vs 2D View Mode: defaults to '3d'
  const [viewMode, setViewMode] = useState('3d');

  const effectiveBounds = activeMap?.bounds || bounds;
  const effectiveWidth = effectiveBounds.width || MAP_WIDTH;
  const effectiveHeight = effectiveBounds.height || MAP_HEIGHT;
  const effectiveRooms = activeMap?.rooms || rooms || ROOMS;
  const effectiveCorridors = activeMap?.edges || corridors || EDGES;
  const currentNodesById = activeMap?.nodes ? Object.fromEntries(activeMap.nodes.map((n) => [n.id, n])) : defaultNodesById;

  const pos = currentCoord || userPos || (activeMap?.nodes ? activeMap.nodes[0] : { x: 175, y: 505 });
  const heading = headingDeg !== undefined ? headingDeg : (userHeading !== undefined ? userHeading : 0);
  const route = activeRoute || activePath || [];
  const destCoord = destination && destination.x !== undefined 
    ? destination 
    : (destinationId && currentNodesById[destinationId] ? currentNodesById[destinationId] : null);

  // Zoom & Pan state for 2D mode
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const recenter = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoomLevel(1);
  };

  const centerOnUser = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (rect.width / 2) - (pos.x * zoomLevel);
    const cy = (rect.height / 2) - (pos.y * zoomLevel);
    setPanOffset({ x: Math.round(cx), y: Math.round(cy) });
  };

  useEffect(() => {
    if (isNavigating && viewMode === '2d') {
      centerOnUser();
    }
  }, [isNavigating, viewMode, pos.x, pos.y, zoomLevel]);

  const handleZoom = (delta) => {
    setZoomLevel((z) => Math.max(0.6, Math.min(2.8, z + delta)));
  };

  // Drag pan for 2D mode
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      setPanOffset({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleSvgClick = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left - panOffset.x) / (rect.width * zoomLevel)) * effectiveWidth;
    const clickY = ((e.clientY - rect.top - panOffset.y) / (rect.height * zoomLevel)) * effectiveHeight;

    if (clickX >= 0 && clickX <= effectiveWidth && clickY >= 0 && clickY <= effectiveHeight) {
      if (onMapTap) onMapTap({ x: Math.round(clickX), y: Math.round(clickY) });
    }
  };

  // Vision cone arc geometry (2D mode)
  const coneRadius = 55;
  const rad = (heading - 90) * (Math.PI / 180);
  const span = 26 * (Math.PI / 180);
  const x1 = Math.cos(rad - span) * coneRadius;
  const y1 = Math.sin(rad - span) * coneRadius;
  const x2 = Math.cos(rad + span) * coneRadius;
  const y2 = Math.sin(rad + span) * coneRadius;
  const conePath = `M 0 0 L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${coneRadius} ${coneRadius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;

  // If 2D view mode is selected and map has a diagram image, render DiagramMapViewer with toggle
  if (viewMode === '2d' && activeMap?.imageUrl) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 60,
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(10px)',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            style={{
              padding: '7px 14px',
              border: 'none',
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              background: 'transparent',
              color: '#94a3b8',
              transition: 'all 0.18s ease'
            }}
          >
            🎮 3D WebGL
          </button>
          <button
            type="button"
            onClick={() => setViewMode('2d')}
            style={{
              padding: '7px 14px',
              border: 'none',
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              background: '#6366f1',
              color: '#ffffff',
              transition: 'all 0.18s ease'
            }}
          >
            📐 2D Diagram
          </button>
        </div>

        <DiagramMapViewer
          activeMap={activeMap}
          userPos={pos}
          headingDeg={heading}
          activeRoute={route}
          destinationId={destinationId}
          selectedStart={selectedStart}
          onSelectStart={onSelectStart}
          onSelectDest={onSelectDest}
          onMapTap={onMapTap}
          isNavigating={isNavigating}
        />
      </div>
    );
  }

  return (
    <div
      className="gmaps-map-wrapper"
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* 2D / 3D Mode Toggle Switcher (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 60,
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(10px)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode('3d')}
          style={{
            padding: '7px 14px',
            border: 'none',
            borderRadius: '9px',
            fontSize: '12px',
            fontWeight: '800',
            cursor: 'pointer',
            background: viewMode === '3d' ? '#6366f1' : 'transparent',
            color: viewMode === '3d' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.18s ease'
          }}
        >
          🎮 3D WebGL
        </button>
        <button
          type="button"
          onClick={() => setViewMode('2d')}
          style={{
            padding: '7px 14px',
            border: 'none',
            borderRadius: '9px',
            fontSize: '12px',
            fontWeight: '800',
            cursor: 'pointer',
            background: viewMode === '2d' ? '#6366f1' : 'transparent',
            color: viewMode === '2d' ? '#ffffff' : '#94a3b8',
            transition: 'all 0.18s ease'
          }}
        >
          {activeMap?.imageUrl ? '📐 2D Diagram' : '📐 2D Plan'}
        </button>
      </div>

      {/* 3D WebGL Mode */}
      {viewMode === '3d' ? (
        <MapViewer3D
          activeMap={activeMap}
          userPos={pos}
          headingDeg={heading}
          activeRoute={route}
          destinationId={destinationId}
          selectedStart={selectedStart}
          onSelectStart={onSelectStart}
          onSelectDest={onSelectDest}
          onMapTap={onMapTap}
          isNavigating={isNavigating}
        />
      ) : (
        /* 2D SVG Blueprint Mode */
        <div
          style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleSvgClick}
        >
          {/* Floating Google Maps Style Controls for 2D */}
          <div className="gmaps-floating-controls" style={{ top: '64px' }}>
            <button
              type="button"
              className="gmaps-circle-btn locate-me-btn"
              onClick={(e) => {
                e.stopPropagation();
                centerOnUser();
                if (onLocateMe) onLocateMe();
              }}
              title="Center on My Location"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 19 21 12 17 5 21 12 2" fill="#1a73e8" />
              </svg>
            </button>

            <button
              type="button"
              className="gmaps-circle-btn"
              onClick={(e) => { e.stopPropagation(); recenter(); }}
              title="Reset Zoom / Pan"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <circle cx="12" cy="12" r="7" />
              </svg>
            </button>

            <div className="gmaps-zoom-pill">
              <button
                type="button"
                className="gmaps-zoom-btn"
                onClick={(e) => { e.stopPropagation(); handleZoom(0.2); }}
                title="Zoom In"
              >
                ＋
              </button>
              <div className="zoom-divider" />
              <button
                type="button"
                className="gmaps-zoom-btn"
                onClick={(e) => { e.stopPropagation(); handleZoom(-0.2); }}
                title="Zoom Out"
              >
                －
              </button>
            </div>
          </div>

          <svg
            className="gmaps-svg-canvas"
            viewBox={`0 0 ${effectiveWidth} ${effectiveHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: '50% 50%'
            }}
          >
            <defs>
              <radialGradient id="visionGlow" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#4285f4" stopOpacity="0.4" />
                <stop offset="70%" stopColor="#60a5fa" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
              <filter id="routeBlueGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#6366f1" floodOpacity="0.6" />
              </filter>
            </defs>

            {/* 1. Blueprint Background */}
            <rect x="0" y="0" width={effectiveWidth} height={effectiveHeight} fill="#0f172a" />

            {/* Map Title */}
            <text
              x={effectiveWidth / 2}
              y="34"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="16"
              fontWeight="800"
              letterSpacing="0.4"
            >
              {activeMap?.name || 'INDOOR MAP'} (2D Blueprint)
            </text>

            {/* 2. Dimensions if office map */}
            {(activeMap?.dimensions || OFFICE_DIMENSIONS || []).map((dim, idx) => (
              <DimensionArrow
                key={`dim-${idx}`}
                p1={dim.p1}
                p2={dim.p2}
                from={dim.from}
                to={dim.to}
                text={dim.text || dim.shortLabel || dim.label}
                offset={dim.offset}
              />
            ))}

            {/* 3. Outer walls */}
            {(activeMap?.walls || OFFICE_WALLS || []).map((wall, idx) => (
              <line
                key={`wall-${idx}`}
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke="#475569"
                strokeWidth="5"
                strokeLinecap="square"
              />
            ))}

            {/* 4. Rooms */}
            {effectiveRooms.map((room) => (
              <g key={room.id} className="office-cabin-group">
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={room.color || '#1e293b'}
                  stroke={room.stroke || '#6366f1'}
                  strokeWidth="3"
                  rx="6"
                />
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize="14"
                  fontWeight="800"
                >
                  {room.name || room.label}
                </text>
              </g>
            ))}

            {/* 5. Door Arcs for office blueprint */}
            {activeMap?.id === 'office_blueprint_3d' && (
              <>
                <DoorArc cx={175} cy={505} radius={42} startAngle={-Math.PI / 2} endAngle={0} />
                <DoorArc cx={498} cy={155} radius={38} startAngle={0} endAngle={Math.PI / 2} />
                <DoorArc cx={514} cy={440} radius={36} startAngle={0} endAngle={Math.PI / 2} />
              </>
            )}

            {/* 6. Corridor Navigation Spine */}
            {effectiveCorridors.map((edge, idx) => {
              const fromId = Array.isArray(edge) ? edge[0] : edge.from;
              const toId = Array.isArray(edge) ? edge[1] : edge.to;
              const fromNode = currentNodesById[fromId];
              const toNode = currentNodesById[toId];
              if (!fromNode || !toNode) return null;
              return (
                <line
                  key={`spine-${idx}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#334155"
                  strokeWidth="2.5"
                  strokeDasharray="4 6"
                />
              );
            })}

            {/* 7. Active Route Path Ribbon */}
            {route.length >= 2 && (
              <polyline
                points={route.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#6366f1"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#routeBlueGlow)"
              />
            )}

            {/* 8. Destination Beacon Marker */}
            {destCoord && (
              <g transform={`translate(${destCoord.x}, ${destCoord.y})`}>
                <circle r="14" fill="#ef4444" fillOpacity="0.35" />
                <circle r="7" fill="#ef4444" />
                <text y="-14" textAnchor="middle" fill="#f87171" fontSize="12" fontWeight="800">
                  🎯 {destCoord.name || destCoord.label || 'Destination'}
                </text>
              </g>
            )}

            {/* 9. User Position & Heading Arrow */}
            {pos && (
              <g transform={`translate(${pos.x}, ${pos.y})`}>
                <path d={conePath} fill="url(#visionGlow)" />
                <circle r="10" fill="#3b82f6" stroke="#ffffff" strokeWidth="2.5" />
                <g transform={`rotate(${heading})`}>
                  <polygon points="0,-14 6,-4 -6,-4" fill="#ffffff" />
                </g>
              </g>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}

export default MapViewer;
