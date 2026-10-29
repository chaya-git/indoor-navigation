import React, { useState, useRef, useEffect } from 'react';
import { QR_CHECKPOINTS } from '../data/buildingMapData.js';

export default function QRScannerModal({ isOpen, onClose, onCheckpointScanned }) {
  if (!isOpen) return null;

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported in this browser environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.warn('Camera error:', err);
      setCameraError(err.message || 'Camera access denied or unavailable.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleSelectCheckpoint = (cp) => {
    setLastScanned(cp.name);
    stopCamera();
    onCheckpointScanned({
      x: cp.x,
      y: cp.y,
      nodeId: cp.nodeId,
      name: cp.name,
      floor: cp.floor
    });
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <span className="icon">📷</span>
            <h3>Indoor QR Checkpoint</h3>
          </div>
          <button className="close-btn" onClick={() => { stopCamera(); onClose(); }} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <p className="modal-sub">
            Scan a physical wall QR code or tap a checkpoint below to immediately reset your position and eliminate sensor drift.
          </p>

          {/* Camera Viewfinder */}
          <div className="qr-scanner-box">
            {cameraActive ? (
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                <div className="scanner-crosshair">
                  <div className="crosshair-line horizontal" />
                  <div className="crosshair-line vertical" />
                </div>
              </div>
            ) : (
              <div className="camera-placeholder">
                <span style={{ fontSize: '36px' }}>📷</span>
                <p style={{ margin: '8px 0', fontSize: '13px', color: '#94a3b8' }}>
                  {cameraError ? cameraError : 'Camera stream inactive.'}
                </p>
                <button type="button" className="btn-secondary" onClick={startCamera} style={{ fontSize: '12px' }}>
                  Start Live Camera Scanner
                </button>
              </div>
            )}
          </div>

          {lastScanned && (
            <div className="scanned-badge">
              ✓ Calibrated to: <strong>{lastScanned}</strong>
            </div>
          )}

          {/* Quick Checkpoint Tap list */}
          <div className="checkpoint-list-section">
            <label className="section-label">Or Tap Any Indoor Checkpoint:</label>
            <div className="checkpoint-grid">
              {QR_CHECKPOINTS.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  className="checkpoint-btn"
                  onClick={() => handleSelectCheckpoint(cp)}
                >
                  <span className="cp-code">{cp.code}</span>
                  <span className="cp-name">{cp.name}</span>
                  <span className="cp-coords">({cp.x}, {cp.y})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => { stopCamera(); onClose(); }}>Close</button>
        </div>
      </div>
    </div>
  );
}
