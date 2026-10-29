import React, { useState } from 'react';

export default function SensorCalibrationModal({
  isOpen,
  onClose,
  calibrationParams = {},
  onUpdateCalibration,
  liveAccel = 0,
  liveHeading = 0,
  worldAccel = null,
  movementState = 'stationary'
}) {
  if (!isOpen) return null;

  const [stride, setStride] = useState(calibrationParams.strideLengthMeters || 0.70);
  const [sensitivity, setSensitivity] = useState(calibrationParams.stepSensitivity || 0.60);
  const [compassOffset, setCompassOffset] = useState(calibrationParams.headingOffsetDeg || 0);
  const [snapToCorridor, setSnapToCorridor] = useState(calibrationParams.snapToCorridor !== false);
  const [offRouteThreshold, setOffRouteThreshold] = useState(calibrationParams.offRouteThresholdMeters || 3.0);

  const handleSave = () => {
    onUpdateCalibration({
      strideLengthMeters: parseFloat(stride),
      stepSensitivity: parseFloat(sensitivity),
      headingOffsetDeg: parseFloat(compassOffset),
      snapToCorridor,
      offRouteThresholdMeters: parseFloat(offRouteThreshold)
    });
    onClose();
  };

  const handleZeroHeading = () => {
    const newOffset = -liveHeading;
    setCompassOffset(Math.round(newOffset));
  };

  const handleResetDefaults = () => {
    setStride(0.70);
    setSensitivity(0.60);
    setCompassOffset(0);
    setSnapToCorridor(true);
    setOffRouteThreshold(3.0);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <span className="icon">⚙️</span>
            <h3>Sensor & Walk Calibration</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <p className="modal-sub">
            Calibrate sensor fusion, forward/backward detection sensitivity, and route deviation thresholds for your device.
          </p>

          <div className="live-pill-grid">
            <div className="live-pill">
              <span className="live-lbl">Live Movement:</span>
              <span className="live-val" style={{
                color: movementState === 'forward' ? '#10b981' : movementState === 'backward' ? '#38bdf8' : '#f59e0b'
              }}>
                {movementState.toUpperCase()}
              </span>
            </div>
            <div className="live-pill">
              <span className="live-lbl">Fused Heading:</span>
              <span className="live-val">{Math.round(liveHeading)}°</span>
            </div>
            <div className="live-pill">
              <span className="live-lbl">Dynamic Accel:</span>
              <span className={`live-val ${liveAccel > sensitivity ? 'pulse' : ''}`}>
                {liveAccel.toFixed(2)} m/s²
              </span>
            </div>
            <div className="live-pill">
              <span className="live-lbl">World East / North:</span>
              <span className="live-val">
                {worldAccel ? `${worldAccel.east.toFixed(1)} / ${worldAccel.north.toFixed(1)}` : '0.0 / 0.0'}
              </span>
            </div>
          </div>

          <div className="field-group">
            <div className="field-header">
              <label>Step Stride Length</label>
              <span className="field-val">{parseFloat(stride).toFixed(2)} m</span>
            </div>
            <input
              type="range"
              min="0.45"
              max="1.10"
              step="0.05"
              value={stride}
              onChange={(e) => setStride(e.target.value)}
            />
            <span className="field-hint">Average step: Adults 0.65m–0.75m; Fast walk 0.80m+</span>
          </div>

          <div className="field-group">
            <div className="field-header">
              <label>Step Detection Threshold</label>
              <span className="field-val">{parseFloat(sensitivity).toFixed(2)} m/s²</span>
            </div>
            <input
              type="range"
              min="0.20"
              max="1.20"
              step="0.02"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
            />
            <span className="field-hint">
              Lower = more sensitive. Recommended: 0.35–0.45 m/s² for handheld walking.
            </span>
          </div>

          <div className="field-group">
            <div className="field-header">
              <label>Off-Route Recalculation Threshold</label>
              <span className="field-val">{parseFloat(offRouteThreshold).toFixed(1)} m</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="6.0"
              step="0.5"
              value={offRouteThreshold}
              onChange={(e) => setOffRouteThreshold(e.target.value)}
            />
            <span className="field-hint">
              Triggers route recalculation if walking away from the corridor by more than this distance.
            </span>
          </div>

          <div className="field-group">
            <div className="field-header">
              <label>Compass Bearing Alignment</label>
              <span className="field-val">{Math.round(compassOffset)}°</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={compassOffset}
                onChange={(e) => setCompassOffset(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-secondary" onClick={handleZeroHeading} style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                Zero Current
              </button>
            </div>
            <span className="field-hint">Aligns phone compass forward direction to the building floor plan orientation.</span>
          </div>

          <div className="field-group-checkbox">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={snapToCorridor}
                onChange={(e) => setSnapToCorridor(e.target.checked)}
              />
              <span>Snap position to nearest corridor centerline (Prevents drift into walls)</span>
            </label>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="btn-secondary" onClick={handleResetDefaults}>
            Reset Defaults
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave}>
              Save Calibration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
