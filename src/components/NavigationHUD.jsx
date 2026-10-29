// =============================================================================
// GOOGLE MAPS STYLE BOTTOM NAVIGATION SHEET (HUD)
// Ultra-responsive mobile bottom sheet with collapsible drawer & full controls
// =============================================================================

import React, { useState } from 'react';
import { DESTINATIONS, ROOMS, GRAPH_NODES } from '../data/buildingMapData.js';

export function NavigationHUD({
  activeMap,
  allMaps = [],
  onSelectMap,
  onOpenAddMap,
  onOpenUploadDiagram,
  destinations = DESTINATIONS,
  selectedDest,
  onSelectDest,
  selectedStart = 'current_location',
  onSelectStart,
  isNavigating = false,
  onStartNavigation,
  onStopNavigation,
  onResetNavigation,
  isAutoWalking = false,
  onToggleAutoWalk,
  isTrackingSensors = false,
  onStartSensors,
  onOpenCalibration,
  onOpenMeasurementRoute,
  onOpenQR,
  onOpenWhatsApp,
  onOpenPi,
  isLivePiSync = true,
  onToggleLivePiSync,
  onAlignGyro,
  directionMode = 'auto',
  onSetDirectionMode,
  movementState = 'stationary',
  onStepForward,
  onStepBackward,
  onStepStop,
  onDeviateOffRoute,
  currentStepIndex = 0,
  totalSteps = 0,
  walkingSpeedMps = 0,
  cadence = 0,
  remainingDistanceMeters = 18.4,
  distanceWalkedMeters = 0,
  motionMag = 0,
  stepCount = 0
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExtraNavTools, setShowExtraNavTools] = useState(false);

  const destList = (activeMap?.destinations && activeMap.destinations.length > 0)
    ? activeMap.destinations
    : (destinations && destinations.length > 0 ? destinations : [
        { id: "ceo_cabin", name: "CEO Cabin", label: "CEO Cabin" },
        { id: "hr_cabin", name: "HR Cabin", label: "HR Cabin" },
        { id: "main_entrance", name: "Main Entrance", label: "Main Entrance" }
      ]);

  const mapNodes = activeMap?.nodes || GRAPH_NODES || [];
  const currentDest = destList.find((d) => d.id === selectedDest) || destList[0];

  const safeRemDist = typeof remainingDistanceMeters === 'number' && !isNaN(remainingDistanceMeters) ? remainingDistanceMeters : 0;
  const safeDistWalked = typeof distanceWalkedMeters === 'number' && !isNaN(distanceWalkedMeters) ? distanceWalkedMeters : 0;
  const safeSpeed = typeof walkingSpeedMps === 'number' && !isNaN(walkingSpeedMps) ? walkingSpeedMps : 0;

  const estimatedSeconds = safeSpeed > 0.4
    ? Math.round(safeRemDist / safeSpeed)
    : Math.round(safeRemDist / 1.2);
  const etaText = estimatedSeconds < 60 ? `${Math.max(5, estimatedSeconds)} sec` : `${Math.ceil(estimatedSeconds / 60)} min`;

  return (
    <div className={`gmaps-bottom-sheet ${isExpanded ? 'sheet-expanded' : 'sheet-collapsed'}`}>
      <div className="gmaps-sheet-card">
        {/* Grab bar with expand/collapse toggle */}
        <div 
          className="gmaps-grab-bar-area" 
          onClick={() => setIsExpanded(prev => !prev)}
          title={isExpanded ? "Collapse panel" : "Expand settings & tools"}
        >
          <div className="gmaps-grab-bar" />
          {!isNavigating && (
            <div className="gmaps-grab-hint">
              <span>{isExpanded ? '▼ Tap to minimize' : '▲ Tap for maps & tools'}</span>
            </div>
          )}
        </div>

        {isNavigating ? (
          /* =========================================================================
             Active Navigation Strip (Google Maps Style)
             ========================================================================= */
          <div className="gmaps-active-nav-strip">
            <div className="gmaps-nav-summary">
              <div className="nav-eta-pill">
                <span className="eta-mins">{etaText}</span>
                <span className="eta-dot">·</span>
                <span className="eta-dist">{safeRemDist > 0 ? `${safeRemDist.toFixed(1)} m left` : 'Arrived'}</span>
                <span className="eta-dot">·</span>
                <span className="eta-dest">{currentDest?.name || 'Destination'}</span>
              </div>
              <div
                className="nav-sensors-badge"
                onClick={!isTrackingSensors ? onStartSensors : undefined}
                style={{ cursor: !isTrackingSensors ? 'pointer' : 'default' }}
                title={!isTrackingSensors ? "Tap to enable phone sensors" : "Motion tracking active"}
              >
                <span className={`live-dot ${isTrackingSensors ? 'active' : ''}`} />
                <span>
                  {isTrackingSensors ? (
                    movementState === 'backward' ? (
                      `🔙 BACKWARD · ${(safeSpeed * 3.6).toFixed(1)} km/h · ${stepCount} steps (${safeDistWalked.toFixed(1)}m)`
                    ) : movementState === 'forward' && safeSpeed > 0 ? (
                      `🏃 FORWARD · ${(safeSpeed * 3.6).toFixed(1)} km/h · ${stepCount} steps (${safeDistWalked.toFixed(1)}m)`
                    ) : (
                      `🛑 STATIONARY · ${stepCount} steps (${safeDistWalked.toFixed(1)}m)`
                    )
                  ) : (
                    '⚠️ Tap to Enable Sensors'
                  )}
                </span>
              </div>
            </div>

            <div className="gmaps-nav-btn-row">
              {onSetDirectionMode && (
                <div className="direction-segmented-control">
                  <button
                    type="button"
                    onClick={() => onSetDirectionMode('auto')}
                    className={`dir-seg-btn ${directionMode === 'auto' ? 'active-auto' : ''}`}
                    title="Auto-detect forward/backward using sensors"
                  >
                    🔄 Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetDirectionMode('forward')}
                    className={`dir-seg-btn ${directionMode === 'forward' ? 'active-fwd' : ''}`}
                    title="Lock steps to forward direction"
                  >
                    🚶 Fwd
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetDirectionMode('backward')}
                    className={`dir-seg-btn ${directionMode === 'backward' ? 'active-rev' : ''}`}
                    title="Lock steps to reverse direction"
                  >
                    🔙 Rev
                  </button>
                </div>
              )}

              {onAlignGyro && (
                <button
                  type="button"
                  onClick={onAlignGyro}
                  className="gmaps-btn-align"
                  title="Calibrate phone compass to point straight down this corridor"
                >
                  🧭 Align
                </button>
              )}

              <button
                type="button"
                className={`gmaps-btn-debug-toggle ${showExtraNavTools ? 'active' : ''}`}
                onClick={() => setShowExtraNavTools(prev => !prev)}
                title="Toggle manual step debugging buttons"
              >
                ⚙️
              </button>

              <button
                type="button"
                className="gmaps-btn-stop"
                onClick={onStopNavigation}
                title="Turn off navigation and stop robot"
              >
                🛑 Stop
              </button>

              <button
                type="button"
                className="gmaps-btn-reset"
                onClick={onResetNavigation}
                title="Reset navigation back to start point"
              >
                🔄 Reset
              </button>
            </div>

            {/* Extra manual controls (toggleable so they don't crowd small screens) */}
            {showExtraNavTools && (
              <div className="gmaps-nav-extra-row">
                {onStepBackward && (
                  <button
                    type="button"
                    onClick={onStepBackward}
                    className="extra-step-btn rev"
                    title="Step backward along route"
                  >
                    🔙 Step Back
                  </button>
                )}
                {onStepStop && (
                  <button
                    type="button"
                    onClick={onStepStop}
                    className="extra-step-btn"
                    title="Simulate stopping stationary"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', color: '#fca5a5' }}
                  >
                    🛑 Stop
                  </button>
                )}
                {onStepForward && (
                  <button
                    type="button"
                    onClick={onStepForward}
                    className="extra-step-btn fwd"
                    title="Step forward along route"
                  >
                    👟 Step Fwd
                  </button>
                )}
                {onDeviateOffRoute && (
                  <button
                    type="button"
                    onClick={() => onDeviateOffRoute(80)}
                    className="extra-step-btn"
                    title="Walk away from route to test dynamic off-route detection and rerouting"
                    style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: '#f59e0b', color: '#fcd34d' }}
                  >
                    ↗️ Off-Route Test
                  </button>
                )}
                <button
                  type="button"
                  className={`gmaps-btn-autowalk ${isAutoWalking ? 'active' : ''}`}
                  onClick={onToggleAutoWalk}
                >
                  <span>{isAutoWalking ? '⏸ Pause' : '⚡ Auto-Walk'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             Pre-Route Destination Planner Sheet
             ========================================================================= */
          <div className="gmaps-plan-sheet">
            {/* COLLAPSED VIEW: Ultra-compact, instant navigation bar */}
            {!isExpanded && (
              <div className="gmaps-compact-nav-bar">
                <div className="compact-dest-row">
                  <div className="compact-dest-selector">
                    <span className="dest-pin">📍</span>
                    <select
                      className="compact-select"
                      value={selectedDest || ''}
                      onChange={(e) => onSelectDest(e.target.value)}
                    >
                      {destList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="compact-meta-chip">
                    <span className="compact-eta">{etaText}</span>
                    <span className="compact-dist">({safeRemDist > 0 ? `${safeRemDist.toFixed(1)}m` : '18.4m'})</span>
                  </div>
                </div>

                <div className="gmaps-actions-row">
                  <button
                    type="button"
                    className="gmaps-btn-start"
                    onClick={onStartNavigation}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span>Start Navigation</span>
                  </button>

                  <button
                    type="button"
                    className="gmaps-btn-secondary"
                    onClick={onResetNavigation}
                    title="Reset position back to start"
                  >
                    🔄 Reset
                  </button>

                  {onOpenMeasurementRoute && (
                    <button
                      type="button"
                      className="gmaps-btn-secondary"
                      onClick={onOpenMeasurementRoute}
                      title="Build route from walking measurements (e.g. straight 2m, left 3m)"
                      style={{ borderColor: '#60a5fa', color: '#93c5fd' }}
                    >
                      📐 Custom Route
                    </button>
                  )}

                  <button
                    type="button"
                    className="gmaps-btn-secondary"
                    onClick={() => setIsExpanded(true)}
                    title="Open full options, 3D maps and tools"
                  >
                    ⚙️ Options
                  </button>
                </div>
              </div>
            )}

            {/* EXPANDED VIEW: Full controls, 3D diagram upload, route planner & tools */}
            {isExpanded && (
              <>
                {/* 3D Map Selector Bar */}
                <div className="gmaps-map-selector-bar">
                  <div className="map-select-group">
                    <span className="map-icon">{activeMap?.icon || '🗺️'}</span>
                    <span className="map-label">Map:</span>
                    <select
                      className="gmaps-select map-dropdown"
                      value={activeMap?.id || ''}
                      onChange={(e) => onSelectMap && onSelectMap(e.target.value)}
                    >
                      {(allMaps || []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.icon || '🏢'} {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="map-action-buttons">
                    <button
                      type="button"
                      onClick={onOpenUploadDiagram}
                      className="btn-upload-diagram"
                      title="Upload your own 3D building diagram image"
                    >
                      📤 Upload
                    </button>
                    <button
                      type="button"
                      onClick={onOpenAddMap}
                      className="btn-manage-maps"
                      title="Templates and Map Manager"
                    >
                      ⚙️ Manage
                    </button>
                  </div>
                </div>

                {/* Quick destination chips */}
                <div className="gmaps-quick-chips">
                  <span className="chips-label">Dest:</span>
                  {destList.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`gmaps-chip ${selectedDest === d.id ? 'active' : ''}`}
                      onClick={() => onSelectDest(d.id)}
                    >
                      {d.category === 'Executive' ? '👔 ' : d.category === 'Laboratories' ? '🔬 ' : d.category === 'Automation' ? '🤖 ' : '📍 '}
                      {d.name || d.label}
                    </button>
                  ))}
                </div>

                {/* Start & Destination Selector Dropdowns */}
                <div className="gmaps-route-inputs">
                  <div className="route-input-row">
                    <span className="pin-dot start" />
                    <span className="input-label">Start:</span>
                    <select
                      className="gmaps-select"
                      value={selectedStart}
                      onChange={(e) => onSelectStart && onSelectStart(e.target.value)}
                    >
                      <option value="current_location">📍 My Location (GPS/Sensor)</option>
                      {mapNodes.filter(n => n.type === 'poi' || n.type === 'junction' || n.type === 'entrance').map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label || `Location ${n.id}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="route-input-row">
                    <span className="pin-dot dest" />
                    <span className="input-label">To:</span>
                    <select
                      className="gmaps-select"
                      value={selectedDest || ''}
                      onChange={(e) => onSelectDest(e.target.value)}
                    >
                      {destList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Estimated metrics bar */}
                <div className="gmaps-metrics-preview">
                  <div className="metric-pill">
                    <span className="m-icon">⏱</span>
                    <strong>{etaText}</strong>
                  </div>
                  <div className="metric-pill">
                    <span className="m-icon">📏</span>
                    <strong>{remainingDistanceMeters > 0 ? `${remainingDistanceMeters.toFixed(1)} m` : '18.4 m'}</strong>
                  </div>
                  <div className="metric-pill">
                    <span className="m-icon">👣</span>
                    <strong>~{Math.round((remainingDistanceMeters || 18.4) / 0.70)} steps</strong>
                  </div>
                </div>

                {/* Primary Action Row */}
                <div className="gmaps-actions-row">
                  <button
                    type="button"
                    className="gmaps-btn-start"
                    onClick={onStartNavigation}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span>Start Navigation</span>
                  </button>

                  {onOpenMeasurementRoute && (
                    <button
                      type="button"
                      className="gmaps-btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenMeasurementRoute();
                      }}
                      title="Build custom route from distance and turn measurements"
                      style={{ borderColor: '#60a5fa', color: '#93c5fd' }}
                    >
                      <span>📐 Measure Route</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="gmaps-btn-whatsapp-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenWhatsApp) onOpenWhatsApp();
                    }}
                    title="Send this route link to WhatsApp"
                  >
                    <span>💬 WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    className="gmaps-btn-pi-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenPi) onOpenPi();
                    }}
                    title="Send route transcript to Raspberry Pi robot"
                  >
                    <span>🤖 Robot</span>
                  </button>
                </div>

                {/* Quick Tools Row (Sensor, QR, Calibrate, Auto-walk, Robot Live Sync) */}
                <div className="gmaps-tools-row">
                  <button
                    type="button"
                    className={`tool-pill ${isTrackingSensors ? 'active' : ''}`}
                    onClick={onStartSensors}
                    title="Toggle Pedometer & Gyro Tracking"
                  >
                    <span className="tool-icon">🧭</span>
                    <span>{isTrackingSensors ? 'Sensors ON' : 'Sensors OFF'}</span>
                  </button>

                  {onOpenMeasurementRoute && (
                    <button
                      type="button"
                      className="tool-pill"
                      onClick={onOpenMeasurementRoute}
                      title="Build custom route from walking measurements"
                    >
                      <span className="tool-icon">📐</span>
                      <span>Measure Route</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="tool-pill"
                    onClick={onOpenCalibration}
                    title="Calibrate step stride length and sensitivity"
                  >
                    <span className="tool-icon">⚙️</span>
                    <span>Calibrate</span>
                  </button>

                  <button
                    type="button"
                    className="tool-pill"
                    onClick={onOpenQR}
                    title="Scan wall QR checkpoint to reset indoor location"
                  >
                    <span className="tool-icon">📷</span>
                    <span>Scan QR</span>
                  </button>

                  <button
                    type="button"
                    className={`tool-pill ${isAutoWalking ? 'active' : ''}`}
                    onClick={onToggleAutoWalk}
                    title="Simulate walking along route automatically"
                  >
                    <span className="tool-icon">⚡</span>
                    <span>Auto</span>
                  </button>

                  <button
                    type="button"
                    className={`tool-pill ${isLivePiSync ? 'active' : ''}`}
                    onClick={onToggleLivePiSync}
                    title="Toggle automatic step-by-step dispatch to robot as map moves"
                  >
                    <span className="tool-icon">🤖</span>
                    <span>{isLivePiSync ? 'Pi Live ON' : 'Pi Live OFF'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NavigationHUD;
