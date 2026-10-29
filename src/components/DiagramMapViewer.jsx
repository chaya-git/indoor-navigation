// =============================================================================
// DIAGRAM 3D MAP VIEWER
// Displays the user's uploaded 3D building diagram with interactive label pins,
// glowing animated route overlay, 3D tilt perspective, and live user navigation
// =============================================================================

import React, { useRef, useState, useEffect } from 'react';

export default function DiagramMapViewer({
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
  const containerRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [is3DTilt, setIs3DTilt] = useState(true);
  const [selectedPinPopup, setSelectedPinPopup] = useState(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const bounds = activeMap?.bounds || { width: 900, height: 650 };
  const width = bounds.width;
  const height = bounds.height;

  const currentNodes = activeMap?.nodes || [];
  const currentDestinations = activeMap?.destinations || [];
  const activeDest = currentDestinations.find((d) => d.id === destinationId);

  // Zoom handling
  const handleZoom = (delta) => {
    setZoomLevel((z) => Math.max(0.5, Math.min(3.0, z + delta)));
  };

  // Recenter
  const recenter = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoomLevel(1);
  };

  // Drag pan
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

  // Vision cone arc
  const coneRadius = 45;
  const rad = ((headingDeg || 0) - 90) * (Math.PI / 180);
  const span = 25 * (Math.PI / 180);
  const x1 = Math.cos(rad - span) * coneRadius;
  const y1 = Math.sin(rad - span) * coneRadius;
  const x2 = Math.cos(rad + span) * coneRadius;
  const y2 = Math.sin(rad + span) * coneRadius;
  const conePath = `M 0 0 L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${coneRadius} ${coneRadius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0a0f1d',
        userSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => (isDraggingRef.current = false)}
    >
      {/* 3D Perspective Controls Toolbar (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 60,
          display: 'flex',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '4px 6px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}
      >
        <button
          type="button"
          onClick={() => setIs3DTilt((v) => !v)}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '800',
            cursor: 'pointer',
            background: is3DTilt ? '#6366f1' : 'transparent',
            color: '#ffffff'
          }}
        >
          {is3DTilt ? '📐 3D Tilt: ON' : '🗺️ 2D Flat'}
        </button>
        <button
          type="button"
          onClick={recenter}
          style={{
            padding: '6px 10px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
            background: 'transparent',
            color: '#cbd5e1'
          }}
          title="Reset Zoom & Pan"
        >
          🎯 Center
        </button>
      </div>

      {/* Zoom Pills (Top Left) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          overflow: 'hidden'
        }}
      >
        <button
          type="button"
          onClick={() => handleZoom(0.25)}
          style={{
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ＋
        </button>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <button
          type="button"
          onClick={() => handleZoom(-0.25)}
          style={{
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          －
        </button>
      </div>

      {/* Main 3D Canvas / Diagram Wrapper with perspective transform */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: is3DTilt ? '1200px' : 'none'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) ${
              is3DTilt ? 'rotateX(22deg) rotateZ(-2deg)' : ''
            }`,
            transformOrigin: '50% 50%',
            transition: 'transform 0.1s ease-out',
            boxShadow: is3DTilt ? '0 30px 60px rgba(0, 0, 0, 0.7)' : 'none',
            borderRadius: '12px'
          }}
        >
          {/* Uploaded 3D Diagram Image */}
          {activeMap?.imageUrl && (
            <img
              src={activeMap.imageUrl}
              alt={activeMap.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                borderRadius: '12px',
                pointerEvents: 'none'
              }}
            />
          )}

          {/* SVG Navigation Route Overlay */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 10
            }}
            viewBox={`0 0 ${width} ${height}`}
          >
            <defs>
              <filter id="diagramPathGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#6366f1" floodOpacity="0.9" />
              </filter>
              <radialGradient id="diagramVision" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Glowing Active Route Polyline */}
            {activeRoute && activeRoute.length >= 2 && (
              <>
                <polyline
                  points={activeRoute.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#diagramPathGlow)"
                />
                <polyline
                  points={activeRoute.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#a5b4fc"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Route Waypoint Dots */}
            {activeRoute && activeRoute.map((p, idx) => (
              <circle
                key={`wp-${idx}`}
                cx={p.x}
                cy={p.y}
                r="5"
                fill="#ffffff"
                stroke="#6366f1"
                strokeWidth="2"
              />
            ))}

            {/* Destination Target Marker */}
            {activeDest && (
              <g transform={`translate(${activeDest.x}, ${activeDest.y})`}>
                <circle r="18" fill="#ef4444" fillOpacity="0.3">
                  <animate attributeName="r" values="12;24;12" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
              </g>
            )}

            {/* Live User Position Marker & Heading Flashlight */}
            {userPos && (
              <g transform={`translate(${userPos.x}, ${userPos.y})`}>
                <path d={conePath} fill="url(#diagramVision)" />
                <circle r="10" fill="#3b82f6" stroke="#ffffff" strokeWidth="2.5" />
                <g transform={`rotate(${headingDeg || 0})`}>
                  <polygon points="0,-14 6,-4 -6,-4" fill="#ffffff" />
                </g>
              </g>
            )}
          </svg>

          {/* HTML Interactive Room Pins on top of Diagram */}
          {currentNodes.filter((n) => n.type !== 'junction').map((pin) => {
            const isStart = selectedStart === pin.id;
            const isDest = destinationId === pin.id;
            return (
              <div
                key={pin.id}
                style={{
                  position: 'absolute',
                  left: `${pin.x}px`,
                  top: `${pin.y}px`,
                  transform: 'translate(-50%, -100%)',
                  zIndex: isDest ? 30 : 20,
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPinPopup(pin);
                }}
              >
                <div
                  style={{
                    background: isDest
                      ? '#ef4444'
                      : isStart
                      ? '#10b981'
                      : 'rgba(15, 23, 42, 0.9)',
                    color: '#ffffff',
                    padding: '4px 10px',
                    borderRadius: '14px',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    border: '2px solid #ffffff'
                  }}
                >
                  <span>{isDest ? '🎯' : isStart ? '🟢' : '📍'}</span>
                  <span>{pin.label || pin.name}</span>
                </div>
                <div
                  style={{
                    width: '3px',
                    height: '8px',
                    background: isDest ? '#ef4444' : isStart ? '#10b981' : '#ffffff',
                    margin: '0 auto'
                  }}
                />
              </div>
            );
          })}

          {/* Clicked Pin Selector Popup */}
          {selectedPinPopup && (
            <div
              style={{
                position: 'absolute',
                left: `${selectedPinPopup.x}px`,
                top: `${selectedPinPopup.y + 12}px`,
                transform: 'translateX(-50%)',
                background: '#ffffff',
                padding: '10px 14px',
                borderRadius: '12px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                zIndex: 100,
                width: '180px',
                border: '1.5px solid #6366f1'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#6366f1' }}>
                  {selectedPinPopup.type === 'entrance' ? 'ENTRANCE' : 'ROOM'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedPinPopup(null)}
                  style={{ background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', color: '#94a3b8' }}
                >
                  ✕
                </button>
              </div>
              <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                {selectedPinPopup.label}
              </strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectStart) onSelectStart(selectedPinPopup.id);
                    setSelectedPinPopup(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '5px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                >
                  🟢 Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectDest) onSelectDest(selectedPinPopup.id);
                    setSelectedPinPopup(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '5px',
                    background: '#6366f1',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  🎯 Dest
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Diagram Banner Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '16px',
          zIndex: 40,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(6px)',
          padding: '6px 12px',
          borderRadius: '10px',
          color: '#ffffff',
          fontSize: '11.5px',
          fontWeight: '600',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          pointerEvents: 'none'
        }}
      >
        <span>🏢 <strong>{activeMap?.name}</strong> · Tap any labeled pin to set Start or Destination</span>
      </div>
    </div>
  );
}
