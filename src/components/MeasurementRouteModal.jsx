// =============================================================================
// MEASUREMENT ROUTE BUILDER MODAL
// Creates custom indoor routes dynamically from measured distances & turns
// (e.g. "move straight 2m, take left, go straight 3m, take left, go straight 3m")
// =============================================================================

import React, { useState } from 'react';
import { parseMeasurementText, generateRouteFromMeasurements } from '../navigation/measurementRouteBuilder.js';

export default function MeasurementRouteModal({
  isOpen,
  onClose,
  startPos,
  currentHeading = 0,
  activeMap,
  onApplyRoute
}) {
  if (!isOpen) return null;

  // Default example from user request
  const [inputText, setInputText] = useState('move straight 2m take left after 3m go straight take left after 3 m');
  const [destinationName, setDestinationName] = useState('Measured Target');
  const [initialHeading, setInitialHeading] = useState(Math.round(currentHeading || 0));

  // Structured segments list (editable)
  const [segments, setSegments] = useState(() => {
    return parseMeasurementText('move straight 2m take left after 3m go straight take left after 3 m');
  });

  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'builder'

  // Parse text input into segments
  const handleParseText = () => {
    const parsed = parseMeasurementText(inputText);
    if (parsed.length > 0) {
      setSegments(parsed);
      setActiveTab('builder');
    }
  };

  // Add new segment
  const handleAddSegment = () => {
    setSegments((prev) => [
      ...prev,
      { action: 'straight', distance: 2.0 }
    ]);
  };

  // Update segment
  const handleUpdateSegment = (idx, field, value) => {
    setSegments((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        [field]: field === 'distance' ? parseFloat(value) || 0 : value
      };
      return next;
    });
  };

  // Remove segment
  const handleRemoveSegment = (idx) => {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Presets
  const applyPreset = (presetText, name = 'Measured Target') => {
    setInputText(presetText);
    setDestinationName(name);
    const parsed = parseMeasurementText(presetText);
    setSegments(parsed);
  };

  // Generate & Launch Navigation
  const handleCreateRoute = () => {
    const route = generateRouteFromMeasurements({
      startPos: startPos || { x: 175, y: 505 },
      initialHeadingDeg: parseFloat(initialHeading) || 0,
      segments: segments.length > 0 ? segments : parseMeasurementText(inputText),
      activeMap,
      destinationName
    });

    if (route && route.path.length >= 2) {
      onApplyRoute(route);
      onClose();
    }
  };

  const totalDistance = segments.reduce((sum, s) => sum + (s.distance || 0), 0);

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '520px', width: '92%' }}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="icon">📐</span>
            <h3>Build Route from Measurements</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p className="modal-sub">
            Specify walking distance measurements and turns to automatically generate an indoor route.
            Forward/backward tracking, step detection, and voice instructions will follow this route.
          </p>

          {/* Preset Buttons */}
          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quick Presets:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '16px' }}
                onClick={() => applyPreset('move straight 2m take left after 3m go straight take left after 3 m', 'Corridor Loop')}
              >
                ⚡ Straight 2m, Left 3m, Left 3m
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '16px' }}
                onClick={() => applyPreset('straight 4m, right 3m, straight 2m', 'Office Corner')}
              >
                ⚡ L-Turn: 4m, Right 3m
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '16px' }}
                onClick={() => applyPreset('straight 6m', 'Straight Hallway')}
              >
                ⚡ Straight 6m
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="telemetry-tabs" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className={`telemetry-tab ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              ✍️ Natural Text
            </button>
            <button
              type="button"
              className={`telemetry-tab ${activeTab === 'builder' ? 'active' : ''}`}
              onClick={() => setActiveTab('builder')}
            >
              📋 Step-by-Step ({segments.length} Legs)
            </button>
          </div>

          {activeTab === 'text' && (
            <div className="field-group">
              <label>Type or paste movement description:</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  marginTop: '6px',
                  resize: 'vertical'
                }}
                placeholder="e.g. move straight 2m take left after 3m go straight take left after 3 m"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleParseText}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Parse into Segments ➔
                </button>
              </div>
            </div>
          )}

          {activeTab === 'builder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {segments.map((seg, idx) => (
                <div
                  key={`seg-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', width: '22px' }}>
                    #{idx + 1}
                  </span>

                  <select
                    value={seg.action || 'straight'}
                    onChange={(e) => handleUpdateSegment(idx, 'action', e.target.value)}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      padding: '6px',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  >
                    <option value="straight">⬆️ Move Straight</option>
                    <option value="turn_left">⬅️ Turn Left (90°)</option>
                    <option value="turn_right">➡️ Turn Right (90°)</option>
                    <option value="slight_left">↖️ Slight Left (45°)</option>
                    <option value="slight_right">↗️ Slight Right (45°)</option>
                    <option value="u_turn">🔄 Make a U-Turn (180°)</option>
                  </select>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={seg.distance}
                      onChange={(e) => handleUpdateSegment(idx, 'distance', e.target.value)}
                      style={{
                        width: '65px',
                        background: '#0f172a',
                        color: '#38bdf8',
                        fontWeight: '800',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '6px',
                        borderRadius: '6px',
                        textAlign: 'center',
                        fontSize: '12px'
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>m</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSegment(idx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px'
                    }}
                    title="Remove segment"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddSegment}
                style={{ width: '100%', marginTop: '4px', padding: '8px', fontSize: '12px' }}
              >
                + Add Another Leg
              </button>
            </div>
          )}

          {/* Initial Orientation / Heading Alignment */}
          <div className="field-group" style={{ marginTop: '14px' }}>
            <div className="field-header">
              <label>Starting Heading Direction</label>
              <span className="field-val">{Math.round(initialHeading)}°</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max="355"
                step="5"
                value={initialHeading}
                onChange={(e) => setInitialHeading(parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setInitialHeading(Math.round(currentHeading || 0))}
                style={{ padding: '4px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                Compass ({Math.round(currentHeading || 0)}°)
              </button>
            </div>
            <span className="field-hint">
              0° = Facing North (-Y), 90° = Facing East (+X), 180° = South (+Y), 270° = West (-X)
            </span>
          </div>

          {/* Destination Name */}
          <div className="field-group">
            <div className="field-header">
              <label>Destination Label</label>
            </div>
            <input
              type="text"
              value={destinationName}
              onChange={(e) => setDestinationName(e.target.value)}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px'
              }}
              placeholder="e.g. Measured Point"
            />
          </div>

          {/* Summary Card */}
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginTop: '12px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Total Legs</div>
              <strong style={{ fontSize: '16px', color: '#ffffff' }}>{segments.length}</strong>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Distance</div>
              <strong style={{ fontSize: '16px', color: '#38bdf8' }}>{totalDistance.toFixed(1)} m</strong>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Est. Steps</div>
              <strong style={{ fontSize: '16px', color: '#10b981' }}>~{Math.round(totalDistance / 0.70)}</strong>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreateRoute}
            disabled={segments.length === 0}
            style={{ background: '#3b82f6', color: '#ffffff', fontWeight: '800' }}
          >
            🚀 Create & Start Route
          </button>
        </div>
      </div>
    </div>
  );
}
