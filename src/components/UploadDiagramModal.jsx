// =============================================================================
// UPLOAD 3D DIAGRAM MODAL
// Allows users to upload an image of any 3D/isometric building diagram,
// tag/pin labeled rooms & entrances, and immediately use it for indoor navigation.
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { saveCustomMap } from '../data/mapCatalog.js';

export default function UploadDiagramModal({
  isOpen,
  onClose,
  onMapCreated
}) {
  const [diagramName, setDiagramName] = useState('');
  const [imageSrc, setImageSrc] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 800, height: 600 });
  const [pins, setPins] = useState([]); // Array of { id, label, x, y, type: 'poi' | 'entrance' | 'junction' }
  const [hallwayPoints, setHallwayPoints] = useState([]); // Corridor waypoints
  const [pinMode, setPinMode] = useState('poi'); // 'poi' | 'entrance' | 'hallway'
  const [tempPin, setTempPin] = useState(null); // Clicked coordinate waiting for label input
  const [newLabel, setNewLabel] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src === 'string') {
        setImageSrc(src);
        setPins([]);
        setHallwayPoints([]);
        setDiagramName(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));

        // Get native image dimensions
        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.naturalWidth || 900, height: img.naturalHeight || 650 });
        };
        img.src = src;
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle clicking on the diagram image to place a label pin
  const handleImageClick = (e) => {
    if (!imageRef.current || !imageSrc) return;
    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Scale to image's native resolution
    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;
    const nativeX = Math.round(clickX * scaleX);
    const nativeY = Math.round(clickY * scaleY);

    if (pinMode === 'hallway') {
      // Directly add hallway waypoint
      const newHw = {
        id: `hw_${Date.now()}_${hallwayPoints.length + 1}`,
        x: nativeX,
        y: nativeY,
        label: `Corridor ${hallwayPoints.length + 1}`,
        type: 'junction'
      };
      setHallwayPoints((prev) => [...prev, newHw]);
    } else {
      // Prompt for room/door label
      setTempPin({
        x: nativeX,
        y: nativeY,
        displayX: clickX,
        displayY: clickY,
        type: pinMode
      });
      setNewLabel('');
    }
  };

  // Confirm adding the new label pin
  const handleConfirmPin = (e) => {
    e.preventDefault();
    if (!tempPin || !newLabel.trim()) return;

    const newPin = {
      id: `pin_${Date.now()}_${pins.length + 1}`,
      label: newLabel.trim(),
      x: tempPin.x,
      y: tempPin.y,
      type: tempPin.type
    };

    setPins((prev) => [...prev, newPin]);
    setTempPin(null);
    setNewLabel('');
  };

  // Delete a pin
  const handleDeletePin = (id) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
  };

  // Delete a hallway point
  const handleDeleteHallway = (id) => {
    setHallwayPoints((prev) => prev.filter((h) => h.id !== id));
  };

  // Save the diagram as an active navigable 3D map
  const handleSaveAndUse = () => {
    if (!imageSrc) {
      setStatusMsg('Please select or upload a 3D diagram image first.');
      return;
    }
    if (pins.length < 2) {
      setStatusMsg('Please add at least 2 labeled locations (e.g. an Entrance and a Destination room).');
      return;
    }

    const mapId = `diagram_${Date.now()}`;
    const name = diagramName.trim() || 'Uploaded 3D Diagram';

    // Build graph nodes
    const allNodes = [
      ...pins.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        label: p.label,
        type: p.type === 'entrance' ? 'entrance' : 'poi'
      })),
      ...hallwayPoints.map((h) => ({
        id: h.id,
        x: h.x,
        y: h.y,
        label: h.label || 'Corridor Junction',
        type: 'junction'
      }))
    ];

    // Build edges (connect each room to the nearest hallway point or directly to other rooms)
    const edges = [];
    if (hallwayPoints.length >= 2) {
      // Connect hallway points in sequence to form a central corridor spine
      for (let i = 0; i < hallwayPoints.length - 1; i++) {
        edges.push([hallwayPoints[i].id, hallwayPoints[i + 1].id]);
      }
      // Connect each pin to the nearest hallway point
      pins.forEach((p) => {
        let bestH = hallwayPoints[0];
        let bestDist = Infinity;
        hallwayPoints.forEach((h) => {
          const d = Math.hypot(p.x - h.x, p.y - h.y);
          if (d < bestDist) {
            bestDist = d;
            bestH = h;
          }
        });
        edges.push([p.id, bestH.id]);
      });
    } else {
      // Connect rooms to adjacent rooms to ensure a complete navigable mesh
      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          edges.push([pins[i].id, pins[j].id]);
        }
      }
    }

    // Destinations list from pins
    const destinations = pins.map((p) => ({
      id: p.id,
      name: p.label,
      label: p.label,
      category: p.type === 'entrance' ? 'Entrance' : 'Labeled Room',
      x: p.x,
      y: p.y,
      nodeId: p.id
    }));

    const entrancePin = pins.find((p) => p.type === 'entrance') || pins[0];
    const destPin = pins.find((p) => p.id !== entrancePin.id) || pins[1] || pins[0];

    const newMapData = {
      id: mapId,
      name: name,
      shortName: name.length > 16 ? `${name.substring(0, 14)}...` : name,
      category: 'Uploaded 3D Diagram',
      description: `Custom building diagram with ${pins.length} labeled locations.`,
      icon: '🏢',
      floor: 1,
      isDiagramMap: true,
      imageUrl: imageSrc,
      pixelsPerMeter: 60,
      bounds: { width: imageSize.width, height: imageSize.height },
      wallHeightMeters: 2.8,
      rooms: pins.map((p) => ({
        id: p.id,
        name: p.label,
        label: p.label,
        x: p.x - 40,
        y: p.y - 30,
        w: 80,
        h: 60,
        color: p.type === 'entrance' ? '#e0f2fe' : '#fef3c7'
      })),
      nodes: allNodes,
      edges: edges,
      destinations: destinations,
      defaultStart: entrancePin.id,
      defaultDest: destPin.id
    };

    saveCustomMap(newMapData);
    if (onMapCreated) onMapCreated(newMapData.id);
    onClose();
  };

  return (
    <div className="modal-overlay gmaps-modal-overlay" onClick={onClose}>
      <div
        className="modal-card gmaps-modal-card"
        style={{ maxWidth: '820px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pi-modal-header" style={{ paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
          <div className="pi-title-row">
            <span className="pi-chip-icon">📤</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                Upload 3D Building Diagram
              </h3>
              <p className="pi-sub" style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Upload your labeled 3D/isometric diagram and tag rooms for instant route navigation
              </p>
            </div>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '14px 0', overflowY: 'auto', flex: 1 }}>
          {/* Step 1: Upload or change image */}
          {!imageSrc ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #6366f1',
                borderRadius: '16px',
                padding: '40px 20px',
                textAlign: 'center',
                background: '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div style={{ fontSize: '42px', marginBottom: '8px' }}>🖼️</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
                Click to Select or Drop 3D Building Diagram
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Supports PNG, JPG, SVG, and WebP 3D architectural floor plans
              </p>
            </div>
          ) : (
            <div>
              {/* Diagram Name & Re-upload button */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={diagramName}
                  onChange={(e) => setDiagramName(e.target.value)}
                  placeholder="Enter Diagram / Building Name"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: '700'
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🔄 Change Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>

              {/* Pinning Toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f1f5f9',
                padding: '6px 10px',
                borderRadius: '10px',
                marginBottom: '10px',
                flexWrap: 'wrap',
                gap: '6px'
              }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                  Click tool to tag on diagram:
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setPinMode('poi')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      background: pinMode === 'poi' ? '#6366f1' : '#ffffff',
                      color: pinMode === 'poi' ? '#ffffff' : '#334155',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    🎯 Room Label
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinMode('entrance')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      background: pinMode === 'entrance' ? '#0284c7' : '#ffffff',
                      color: pinMode === 'entrance' ? '#ffffff' : '#334155',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    🚪 Entrance Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinMode('hallway')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      background: pinMode === 'hallway' ? '#10b981' : '#ffffff',
                      color: pinMode === 'hallway' ? '#ffffff' : '#334155',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    🛣️ Hallway Waypoint
                  </button>
                </div>
              </div>

              {/* Interactive Diagram Canvas / Image with Pin Overlay */}
              <div
                ref={containerRef}
                style={{
                  position: 'relative',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#0f172a',
                  cursor: 'crosshair',
                  userSelect: 'none'
                }}
                onClick={handleImageClick}
              >
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="3D Building Diagram"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />

                {/* Render Labeled Room Pins */}
                {pins.map((p) => {
                  const pctX = (p.x / imageSize.width) * 100;
                  const pctY = (p.y / imageSize.height) * 100;
                  return (
                    <div
                      key={p.id}
                      style={{
                        position: 'absolute',
                        left: `${pctX}%`,
                        top: `${pctY}%`,
                        transform: 'translate(-50%, -100%)',
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                        zIndex: 10
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePin(p.id);
                      }}
                      title="Click to remove pin"
                    >
                      <div style={{
                        background: p.type === 'entrance' ? '#0284c7' : '#6366f1',
                        color: '#ffffff',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '800',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1.5px solid #ffffff'
                      }}>
                        <span>{p.type === 'entrance' ? '🚪' : '🎯'}</span>
                        <span>{p.label}</span>
                        <span style={{ fontSize: '9px', opacity: 0.8 }}>✕</span>
                      </div>
                      <div style={{
                        width: '3px',
                        height: '6px',
                        background: '#ffffff',
                        margin: '0 auto'
                      }} />
                    </div>
                  );
                })}

                {/* Render Hallway Waypoint Beads */}
                {hallwayPoints.map((h, idx) => {
                  const pctX = (h.x / imageSize.width) * 100;
                  const pctY = (h.y / imageSize.height) * 100;
                  return (
                    <div
                      key={h.id}
                      style={{
                        position: 'absolute',
                        left: `${pctX}%`,
                        top: `${pctY}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: '#10b981',
                        border: '2px solid #ffffff',
                        boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                        zIndex: 5,
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHallway(h.id);
                      }}
                      title="Hallway waypoint. Click to remove"
                    />
                  );
                })}

                {/* Temp Pin Input Popup */}
                {tempPin && (
                  <div
                    style={{
                      position: 'absolute',
                      left: Math.max(10, Math.min(containerRef.current?.clientWidth - 210, tempPin.displayX - 100)),
                      top: Math.max(10, tempPin.displayY - 60),
                      background: '#ffffff',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      zIndex: 100,
                      width: '200px',
                      border: '2px solid #6366f1'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#6366f1', display: 'block', marginBottom: '4px' }}>
                      {tempPin.type === 'entrance' ? '🚪 Enter Entrance Name' : '🎯 Enter Room Label'}
                    </span>
                    <form onSubmit={handleConfirmPin} style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="e.g. Conference Room"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px'
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          background: '#6366f1',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        ✓ Add
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Pins Count & Instructions */}
              <div style={{
                marginTop: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                color: '#64748b'
              }}>
                <span>
                  📍 <strong>{pins.length}</strong> labeled room(s) tagged · 🛣️ <strong>{hallwayPoints.length}</strong> corridor waypoint(s)
                </span>
                <span style={{ fontSize: '11px' }}>
                  Tip: Tap on room to add label pin. Click a pin to delete it.
                </span>
              </div>
            </div>
          )}

          {statusMsg && (
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              background: '#fee2e2',
              color: '#991b1b'
            }}>
              {statusMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          paddingTop: '12px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!imageSrc || pins.length < 2}
            onClick={handleSaveAndUse}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: (!imageSrc || pins.length < 2) ? '#94a3b8' : '#6366f1',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '700',
              cursor: (!imageSrc || pins.length < 2) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}
          >
            🚀 Use This 3D Diagram for Navigation
          </button>
        </div>
      </div>
    </div>
  );
}
