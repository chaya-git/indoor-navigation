import React, { useState } from 'react';

export default function TelemetryDrawer({
  isOpen,
  onToggle,
  sensorState,
  onManualStep,
  onStepForward,
  onStepBackward,
  onStepStop,
  onDeviateOffRoute,
  onAlignGyro
}) {
  const [activeTab, setActiveTab] = useState('sensors');

  const movColor = sensorState.movementState === 'forward'
    ? '#10b981'
    : sensorState.movementState === 'backward'
    ? '#38bdf8'
    : '#f59e0b';

  return (
    <div className={`telemetry-drawer ${isOpen ? 'open' : ''}`}>
      {/* Tab Header Handle */}
      <button className="telemetry-handle" onClick={onToggle} aria-label="Toggle Telemetry Drawer">
        <span className="handle-icon">{isOpen ? '▼' : '▲'}</span>
        <span className="handle-title">Live Sensor Telemetry & Diagnostics</span>
        <span className={`status-dot ${sensorState.isTracking ? 'active' : ''}`} />
      </button>

      {isOpen && (
        <div className="telemetry-content">
          {/* Diagnostic Tabs */}
          <div className="telemetry-tabs">
            <button
              className={`telemetry-tab ${activeTab === 'sensors' ? 'active' : ''}`}
              onClick={() => setActiveTab('sensors')}
            >
              Sensors & Movement
            </button>
            <button
              className={`telemetry-tab ${activeTab === 'position' ? 'active' : ''}`}
              onClick={() => setActiveTab('position')}
            >
              Position & Diagnostics
            </button>
          </div>

          {activeTab === 'sensors' && (
            <div className="telemetry-grid">
              {/* Movement State Card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Movement Detection</span>
                  <span className="badge" style={{ background: `${movColor}22`, color: movColor, borderColor: movColor }}>
                    {(sensorState.movementState || 'stationary').toUpperCase()}
                  </span>
                </div>
                <div className="metric-row">
                  <span>Direction Mode:</span>
                  <strong style={{ textTransform: 'capitalize' }}>{sensorState.directionMode || 'auto'}</strong>
                </div>
                <div className="metric-row highlight">
                  <span>Step Direction:</span>
                  <strong style={{ color: movColor }}>
                    {sensorState.stepDirection === -1 ? '🔙 Backward (-1)' : '🏃 Forward (+1)'}
                  </strong>
                </div>
              </div>

              {/* World Coordinates IMU Card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">World Frame Accel</span>
                  <span className={`badge ${sensorState.motionAvailable ? 'badge-ok' : 'badge-warn'}`}>
                    {sensorState.motionAvailable ? 'FUSED' : 'NO SENSOR'}
                  </span>
                </div>
                <div className="metric-row">
                  <span>East: {sensorState.worldAccel ? sensorState.worldAccel.east.toFixed(2) : '0.00'}</span>
                  <span>North: {sensorState.worldAccel ? sensorState.worldAccel.north.toFixed(2) : '0.00'}</span>
                  <span>Up: {sensorState.worldAccel ? sensorState.worldAccel.up.toFixed(2) : '0.00'}</span>
                </div>
                <div className="metric-row highlight">
                  <span>Horizontal Mag:</span>
                  <strong>
                    {sensorState.worldAccel ? sensorState.worldAccel.horizontalMag.toFixed(2) : '0.00'} m/s²
                  </strong>
                </div>
              </div>

              {/* Accelerometer card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Device Body Accel</span>
                  <span className={`badge ${sensorState.motionAvailable ? 'badge-ok' : 'badge-warn'}`}>
                    {sensorState.motionAvailable ? 'ACTIVE' : 'NO SENSOR'}
                  </span>
                </div>
                <div className="metric-row">
                  <span>X: {sensorState.rawAccel.x.toFixed(2)}</span>
                  <span>Y: {sensorState.rawAccel.y.toFixed(2)}</span>
                  <span>Z: {sensorState.rawAccel.z.toFixed(2)}</span>
                </div>
                <div className="metric-row highlight">
                  <span>Total Dynamic:</span>
                  <strong>{sensorState.accelMag.toFixed(2)} m/s²</strong>
                </div>
              </div>

              {/* Step counter card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Pedometer & Stride</span>
                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                    {sensorState.cadence > 0 ? `${sensorState.cadence} spm` : '0 spm'}
                  </span>
                </div>
                <div className="metric-row">
                  <span>Step Count:</span>
                  <strong className="stat-number">{sensorState.stepCount}</strong>
                </div>
                <div className="metric-row">
                  <span>Walking Speed:</span>
                  <strong>{(sensorState.speedMps * 3.6).toFixed(1)} km/h ({sensorState.speedMps.toFixed(2)} m/s)</strong>
                </div>
              </div>

              {/* Compass & Gyro card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Compass & Gyro Fusion</span>
                  {onAlignGyro && (
                    <button
                      type="button"
                      className="btn-manual-step"
                      onClick={onAlignGyro}
                      title="Align heading with corridor"
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                    >
                      Align
                    </button>
                  )}
                </div>
                <div className="metric-row">
                  <span>Raw Orientation:</span>
                  <strong>{Math.round(sensorState.rawHeading)}°</strong>
                </div>
                <div className="metric-row highlight">
                  <span>Fused Heading:</span>
                  <strong>{Math.round(sensorState.heading)}°</strong>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'position' && (
            <div className="telemetry-grid">
              {/* Map coordinate card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Indoor Map Coordinates</span>
                </div>
                <div className="metric-row">
                  <span>X Position:</span>
                  <strong>{Math.round(sensorState.userPos.x)} px</strong>
                </div>
                <div className="metric-row">
                  <span>Y Position:</span>
                  <strong>{Math.round(sensorState.userPos.y)} px</strong>
                </div>
                <div className="metric-row">
                  <span>Snapped to Corridor:</span>
                  <strong style={{ color: sensorState.isSnapped ? '#10b981' : '#f59e0b' }}>
                    {sensorState.isSnapped ? 'YES (Snapping active)' : 'NO (Free)'}
                  </strong>
                </div>
              </div>

              {/* Route Deviation card */}
              <div className="metric-card">
                <div className="metric-header">
                  <span className="metric-label">Route Deviation</span>
                  <span className="badge" style={{
                    background: (sensorState.deviationMeters || 0) > 3.0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: (sensorState.deviationMeters || 0) > 3.0 ? '#f87171' : '#34d399'
                  }}>
                    {(sensorState.deviationMeters || 0) > 3.0 ? 'OFF-ROUTE' : 'ON-ROUTE'}
                  </span>
                </div>
                <div className="metric-row">
                  <span>Corridor Distance:</span>
                  <strong>{(sensorState.deviationMeters || 0).toFixed(2)} m</strong>
                </div>
                <div className="metric-row highlight">
                  <span>Threshold:</span>
                  <strong>{sensorState.calibrationParams?.offRouteThresholdMeters || 3.0} m</strong>
                </div>
              </div>

              {/* Test / Diagnostic Trigger Controls */}
              <div className="metric-card" style={{ gridColumn: '1 / -1' }}>
                <div className="metric-header">
                  <span className="metric-label">Manual Test & Diagnostic Controls</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {onStepForward && (
                    <button
                      type="button"
                      className="btn-manual-step"
                      onClick={onStepForward}
                      style={{ background: '#10b981', color: '#fff', padding: '6px 12px' }}
                    >
                      👟 Step Fwd (+1)
                    </button>
                  )}
                  {onStepBackward && (
                    <button
                      type="button"
                      className="btn-manual-step"
                      onClick={onStepBackward}
                      style={{ background: '#38bdf8', color: '#0f172a', padding: '6px 12px' }}
                    >
                      🔙 Step Back (-1)
                    </button>
                  )}
                  {onStepStop && (
                    <button
                      type="button"
                      className="btn-manual-step"
                      onClick={onStepStop}
                      style={{ background: '#ef4444', color: '#fff', padding: '6px 12px' }}
                    >
                      🛑 Stop (Stationary)
                    </button>
                  )}
                  {onDeviateOffRoute && (
                    <button
                      type="button"
                      className="btn-manual-step"
                      onClick={() => onDeviateOffRoute(80)}
                      style={{ background: '#f59e0b', color: '#0f172a', padding: '6px 12px' }}
                    >
                      ↗️ Off-Route Test (+4m)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
