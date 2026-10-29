import React from 'react';

export default function ArrivalModal({
  isOpen,
  destinationName,
  stepCount,
  distanceMeters,
  onClose,
  onNewRoute
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card arrival-card">
        <div className="arrival-icon-wrapper">
          <div className="arrival-icon">📍</div>
        </div>

        <h3 className="arrival-title">Destination Reached</h3>
        <p className="arrival-destination">
          You have reached <strong>{destinationName}</strong>
        </p>

        <div className="arrival-stats-grid">
          <div className="arrival-stat">
            <span className="stat-label">Steps Walked</span>
            <span className="stat-value">{stepCount}</span>
          </div>
          <div className="arrival-stat">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{distanceMeters.toFixed(1)} m</span>
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '20px' }}>
          <button className="btn-secondary" onClick={onClose}>Dismiss</button>
          <button className="btn-primary" onClick={onNewRoute}>New Destination</button>
        </div>
      </div>
    </div>
  );
}
