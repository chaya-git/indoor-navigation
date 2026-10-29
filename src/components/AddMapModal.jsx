// =============================================================================
// ADD / CUSTOM 3D MAP MODAL
// Allows users to create, upload, or install custom 3D indoor maps with
// custom rooms, nodes, corridors, and destinations
// =============================================================================

import React, { useState } from 'react';
import { saveCustomMap, getCustomMaps, deleteCustomMap } from '../data/mapCatalog.js';

export default function AddMapModal({
  isOpen,
  onClose,
  onMapAdded
}) {
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'json' | 'list'
  const [customList, setCustomList] = useState(getCustomMaps());
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info');

  // JSON editor state
  const defaultTemplateJson = {
    id: `custom_map_${Date.now()}`,
    name: 'Custom 3D Facility',
    shortName: 'Custom 3D',
    category: 'Commercial',
    description: 'Custom indoor 3D floor map with interconnected rooms and corridors.',
    icon: '🏛️',
    floor: 1,
    pixelsPerMeter: 60,
    bounds: { width: 960, height: 700 },
    wallHeightMeters: 3.0,
    rooms: [
      {
        id: 'room_entry',
        name: 'Main Reception & Entry',
        label: 'RECEPTION',
        type: 'entrance',
        x: 100, y: 440, w: 200, h: 200,
        color: '#e0f2fe',
        door: { x: 300, y: 540, radius: 40, side: 'right' }
      },
      {
        id: 'room_lab_a',
        name: 'Primary Laboratory A',
        label: 'LAB A',
        type: 'lab',
        x: 100, y: 100, w: 220, h: 260,
        color: '#ede9fe',
        door: { x: 320, y: 230, radius: 40, side: 'right' }
      },
      {
        id: 'room_office_b',
        name: 'Executive Office B',
        label: 'OFFICE B',
        type: 'cabin',
        x: 560, y: 100, w: 300, h: 260,
        color: '#fef3c7',
        door: { x: 560, y: 230, radius: 40, side: 'left' }
      },
      {
        id: 'room_conference',
        name: 'Main Conference Center',
        label: 'CONFERENCE',
        type: 'conference',
        x: 560, y: 440, w: 300, h: 200,
        color: '#dcfce7',
        door: { x: 560, y: 540, radius: 40, side: 'left' }
      }
    ],
    walls: [
      { x1: 300, y1: 540, x2: 440, y2: 540 },
      { x1: 440, y1: 540, x2: 440, y2: 230 },
      { x1: 320, y1: 230, x2: 440, y2: 230 },
      { x1: 440, y1: 230, x2: 560, y2: 230 },
      { x1: 440, y1: 540, x2: 560, y2: 540 }
    ],
    nodes: [
      { id: 'node_entry', x: 200, y: 540, label: 'Main Reception', type: 'poi' },
      { id: 'node_entry_door', x: 300, y: 540, label: 'Reception Doorway', type: 'waypoint' },
      { id: 'node_corridor_south', x: 440, y: 540, label: 'Central Corridor South', type: 'junction' },
      { id: 'node_corridor_north', x: 440, y: 230, label: 'Central Corridor North', type: 'junction' },
      { id: 'node_lab_door', x: 320, y: 230, label: 'Lab A Doorway', type: 'waypoint' },
      { id: 'node_lab_a', x: 210, y: 230, label: 'Primary Laboratory A', type: 'poi' },
      { id: 'node_office_door', x: 560, y: 230, label: 'Office B Doorway', type: 'waypoint' },
      { id: 'node_office_b', x: 710, y: 230, label: 'Executive Office B', type: 'poi' },
      { id: 'node_conf_door', x: 560, y: 540, label: 'Conference Doorway', type: 'waypoint' },
      { id: 'node_conference', x: 710, y: 540, label: 'Main Conference Room', type: 'poi' }
    ],
    edges: [
      ['node_entry', 'node_entry_door'],
      ['node_entry_door', 'node_corridor_south'],
      ['node_corridor_south', 'node_corridor_north'],
      ['node_corridor_north', 'node_lab_door'],
      ['node_lab_door', 'node_lab_a'],
      ['node_corridor_north', 'node_office_door'],
      ['node_office_door', 'node_office_b'],
      ['node_corridor_south', 'node_conf_door'],
      ['node_conf_door', 'node_conference']
    ],
    destinations: [
      { id: 'node_office_b', name: 'Executive Office B', label: 'Office B', category: 'Executive', x: 710, y: 230, nodeId: 'node_office_b' },
      { id: 'node_lab_a', name: 'Primary Laboratory A', label: 'Lab A', category: 'Research', x: 210, y: 230, nodeId: 'node_lab_a' },
      { id: 'node_conference', name: 'Main Conference Center', label: 'Conference', category: 'Meetings', x: 710, y: 540, nodeId: 'node_conference' },
      { id: 'node_entry', name: 'Main Reception & Entry', label: 'Reception', category: 'Entrance', x: 200, y: 540, nodeId: 'node_entry' }
    ],
    defaultStart: 'node_entry',
    defaultDest: 'node_office_b'
  };

  const [jsonText, setJsonText] = useState(JSON.stringify(defaultTemplateJson, null, 2));

  if (!isOpen) return null;

  // Handle saving custom map from JSON
  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.id || !parsed.name || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.nodes)) {
        setStatusMsg('Invalid map format. Must include id, name, rooms, and nodes.');
        setStatusType('error');
        return;
      }

      // Ensure fallback properties
      parsed.bounds = parsed.bounds || { width: 960, height: 700 };
      parsed.pixelsPerMeter = parsed.pixelsPerMeter || 60;
      parsed.wallHeightMeters = parsed.wallHeightMeters || 3.0;
      parsed.destinations = parsed.destinations || parsed.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        label: r.label || r.name,
        x: r.x + (r.w || 100) / 2,
        y: r.y + (r.h || 100) / 2,
        nodeId: r.id
      }));

      const ok = saveCustomMap(parsed);
      if (ok) {
        setStatusMsg(`✅ Map "${parsed.name}" successfully created!`);
        setStatusType('success');
        setCustomList(getCustomMaps());
        if (onMapAdded) onMapAdded(parsed.id);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setStatusMsg('Failed to save custom map to browser storage.');
        setStatusType('error');
      }
    } catch (err) {
      setStatusMsg(`JSON syntax error: ${err.message}`);
      setStatusType('error');
    }
  };

  // Quick 1-click template installation
  const handleInstallTemplate = (templateType) => {
    let mapData;
    if (templateType === 'hospital') {
      mapData = {
        id: `hospital_wing_${Date.now()}`,
        name: 'Healthcare & Emergency Wing 3D',
        shortName: 'Hospital 3D',
        category: 'Medical Facility',
        description: 'Multi-room clinic featuring Emergency Triage, ICU Ward, Diagnostics, Pharmacy, and Doctor Suites.',
        icon: '🏥',
        floor: 1,
        pixelsPerMeter: 55,
        bounds: { width: 1020, height: 720 },
        wallHeightMeters: 3.2,
        rooms: [
          { id: 'h_emergency', name: 'Emergency Triage & Reception', label: 'EMERGENCY', type: 'entrance', x: 80, y: 440, w: 220, h: 220, color: '#fee2e2', door: { x: 300, y: 550, radius: 40, side: 'right' } },
          { id: 'h_pharmacy', name: 'Central Pharmacy & Dispensary', label: 'PHARMACY', type: 'service', x: 80, y: 80, w: 220, h: 260, color: '#fef3c7', door: { x: 300, y: 210, radius: 40, side: 'right' } },
          { id: 'h_icu', name: 'Intensive Care Unit (ICU)', label: 'ICU WARD', type: 'ward', x: 580, y: 80, w: 360, h: 260, color: '#e0f2fe', door: { x: 580, y: 210, radius: 40, side: 'left' } },
          { id: 'h_diagnostics', name: 'Radiology & Diagnostics', label: 'DIAGNOSTICS', type: 'lab', x: 580, y: 440, w: 360, h: 220, color: '#ede9fe', door: { x: 580, y: 550, radius: 40, side: 'left' } }
        ],
        walls: [
          { x1: 300, y1: 550, x2: 440, y2: 550 },
          { x1: 440, y1: 550, x2: 440, y2: 210 },
          { x1: 300, y1: 210, x2: 440, y2: 210 },
          { x1: 440, y1: 210, x2: 580, y2: 210 },
          { x1: 440, y1: 550, x2: 580, y2: 550 }
        ],
        nodes: [
          { id: 'n_er', x: 190, y: 550, label: 'Emergency Reception', type: 'poi' },
          { id: 'n_er_door', x: 300, y: 550, label: 'ER Exit Corridor', type: 'waypoint' },
          { id: 'n_central_south', x: 440, y: 550, label: 'South Clinical Junction', type: 'junction' },
          { id: 'n_central_north', x: 440, y: 210, label: 'North Clinical Junction', type: 'junction' },
          { id: 'n_pharma_door', x: 300, y: 210, label: 'Pharmacy Desk', type: 'waypoint' },
          { id: 'n_pharma', x: 190, y: 210, label: 'Dispensary', type: 'poi' },
          { id: 'n_icu_door', x: 580, y: 210, label: 'ICU AirLock', type: 'waypoint' },
          { id: 'n_icu', x: 760, y: 210, label: 'Intensive Care Unit', type: 'poi' },
          { id: 'n_diag_door', x: 580, y: 550, label: 'MRI / Radiology Door', type: 'waypoint' },
          { id: 'n_diag', x: 760, y: 550, label: 'Diagnostics & Imaging', type: 'poi' }
        ],
        edges: [
          ['n_er', 'n_er_door'],
          ['n_er_door', 'n_central_south'],
          ['n_central_south', 'n_central_north'],
          ['n_central_north', 'n_pharma_door'],
          ['n_pharma_door', 'n_pharma'],
          ['n_central_north', 'n_icu_door'],
          ['n_icu_door', 'n_icu'],
          ['n_central_south', 'n_diag_door'],
          ['n_diag_door', 'n_diag']
        ],
        destinations: [
          { id: 'n_icu', name: 'Intensive Care Unit (ICU)', label: 'ICU Ward', category: 'Patient Wards', x: 760, y: 210, nodeId: 'n_icu' },
          { id: 'n_diag', name: 'Radiology & Diagnostics', label: 'Diagnostics', category: 'Imaging', x: 760, y: 550, nodeId: 'n_diag' },
          { id: 'n_pharma', name: 'Central Pharmacy & Dispensary', label: 'Pharmacy', category: 'Services', x: 190, y: 210, nodeId: 'n_pharma' },
          { id: 'n_er', name: 'Emergency Triage & Reception', label: 'Emergency', category: 'Entry', x: 190, y: 550, nodeId: 'n_er' }
        ],
        defaultStart: 'n_er',
        defaultDest: 'n_icu'
      };
    }

    if (mapData) {
      saveCustomMap(mapData);
      setCustomList(getCustomMaps());
      if (onMapAdded) onMapAdded(mapData.id);
      onClose();
    }
  };

  // Delete a custom map
  const handleDelete = (id) => {
    deleteCustomMap(id);
    setCustomList(getCustomMaps());
  };

  return (
    <div className="modal-overlay gmaps-modal-overlay" onClick={onClose}>
      <div
        className="modal-card gmaps-modal-card"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pi-modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div className="pi-title-row">
            <span className="pi-chip-icon">🗺️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                Add / Manage 3D Indoor Maps
              </h3>
              <p className="pi-sub" style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Load pre-made 3D architectures or define custom 3D buildings
              </p>
            </div>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '6px', margin: '14px 0', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              background: activeTab === 'templates' ? '#6366f1' : 'transparent',
              color: activeTab === 'templates' ? '#ffffff' : '#64748b'
            }}
          >
            ⚡ Pre-Made Templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              background: activeTab === 'json' ? '#6366f1' : 'transparent',
              color: activeTab === 'json' ? '#ffffff' : '#64748b'
            }}
          >
            🛠️ JSON 3D Creator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              background: activeTab === 'list' ? '#6366f1' : 'transparent',
              color: activeTab === 'list' ? '#ffffff' : '#64748b'
            }}
          >
            📋 My Maps ({customList.length})
          </button>
        </div>

        {/* Tab 1: Templates */}
        {activeTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '12px'
            }}>
              <div>
                <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>🏥 Healthcare & Emergency Wing 3D</strong>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Emergency Triage, ICU Ward, Diagnostics Lab, Pharmacy</span>
              </div>
              <button
                type="button"
                onClick={() => handleInstallTemplate('hospital')}
                style={{
                  background: '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                + Install 3D Map
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Custom JSON Spec Editor */}
        {activeTab === 'json' && (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b' }}>
              Define room rectangles, doorway coordinates, and corridor edges. The 3D engine will automatically extrude walls, floor zones, and path ribbons.
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={12}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '11.5px',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#0f172a',
                color: '#38bdf8',
                boxSizing: 'border-box'
              }}
            />
            {statusMsg && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                background: statusType === 'success' ? '#dcfce7' : '#fee2e2',
                color: statusType === 'success' ? '#166534' : '#991b1b'
              }}>
                {statusMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '8px' }}>
              <button
                type="button"
                onClick={handleSaveJson}
                style={{
                  background: '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                💾 Save & Open in 3D
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Custom Map List */}
        {activeTab === 'list' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {customList.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px', fontSize: '13px' }}>
                No custom maps added yet. Use the "Pre-Made Templates" or "JSON 3D Creator" tabs to add one!
              </p>
            ) : (
              customList.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>{m.icon || '🏛️'} {m.name}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {m.rooms?.length || 0} rooms · {m.nodes?.length || 0} nodes · {m.destinations?.length || 0} destinations
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (onMapAdded) onMapAdded(m.id);
                        onClose();
                      }}
                      style={{
                        background: '#6366f1',
                        color: '#ffffff',
                        border: 'none',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: 'none',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
