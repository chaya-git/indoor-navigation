// =============================================================================
// RASPBERRY PI DISPATCH MODAL
// Allows sending the active route transcript directly to the Raspberry Pi robot
// via REST API (POST http://<pi_ip>:5000/navigate)
// =============================================================================

import React, { useState, useEffect } from 'react';

export default function RaspberryPiModal({
  isOpen,
  onClose,
  destinationName,
  selectedDest,
  selectedStart,
  turnInstructions = [],
  activeRoute = [],
  currentStepIndex = 0,
  isLivePiSync = true,
  onToggleLivePiSync
}) {
  const [protocol, setProtocol] = useState(() => {
    return localStorage.getItem('navbot_pi_protocol') || 'http';
  });
  const [piIp, setPiIp] = useState(() => {
    return localStorage.getItem('navbot_pi_ip') || '127.0.0.1';
  });
  const [piPort, setPiPort] = useState(() => {
    return localStorage.getItem('navbot_pi_port') || '5000';
  });
  const [sendMode, setSendMode] = useState('single'); // 'single' | 'all'
  const [selectedStepIdx, setSelectedStepIdx] = useState(currentStepIndex);
  const [isSending, setIsSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info'); // 'info' | 'success' | 'error'
  const [copied, setCopied] = useState(false);
  // Feedback-from-Pi test controls (state, faults) - lets you verify the
  // feedback path works even without real stepper hardware wired up.
  const [robotStatus, setRobotStatus] = useState(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackType, setFeedbackType] = useState('info');
  const [isFeedbackBusy, setIsFeedbackBusy] = useState(false);

  // Sync selected step with current navigation position
  useEffect(() => {
    setSelectedStepIdx(currentStepIndex);
  }, [currentStepIndex]);

  // Persist IP, Port, and Protocol to localStorage
  useEffect(() => {
    localStorage.setItem('navbot_pi_protocol', protocol);
    localStorage.setItem('navbot_pi_ip', piIp);
    localStorage.setItem('navbot_pi_port', piPort);
  }, [protocol, piIp, piPort]);

  if (!isOpen) return null;

  // Build the standardized JSON transcript expected by Raspberry Pi main.py
  const buildTranscript = () => {
    let cumulativeM = 0;
    const steps = (turnInstructions || []).map((step, idx) => {
      const legDist = typeof step.legDistanceMeters === 'number'
        ? step.legDistanceMeters
        : (typeof step.distanceMeters === 'number' ? step.distanceMeters : 0);
      cumulativeM += legDist;

      let act = (step.action || step.type || 'forward').toLowerCase();
      if (step.isArrival || act.includes('arrive')) act = 'arrive';
      else if (act.includes('u_turn') || act.includes('uturn')) act = 'u_turn';
      else if (act.includes('slight_left')) act = 'slight_left';
      else if (act.includes('slight_right')) act = 'slight_right';
      else if (act.includes('left')) act = 'turn_left';
      else if (act.includes('right')) act = 'turn_right';
      else act = 'forward'; // 'start' and 'straight' map to 'forward'

      const heading = typeof step.bearing === 'number' ? step.bearing : (typeof step.heading === 'number' ? step.heading : 0.0);

      return {
        seq: idx + 1,
        step_number: idx + 1,
        action: act,
        instruction: step.instruction || 'Continue straight',
        heading_deg: parseFloat(heading.toFixed(1)),
        leg_distance_m: parseFloat(legDist.toFixed(2)),
        cumulative_distance_m: parseFloat(cumulativeM.toFixed(2)),
        target_node: step.turnCoord?.name || step.targetNodeLabel || 'Corridor Junction',
        to_node_id: step.turnCoord?.id || `node_${idx + 1}`,
        to_node_label: step.turnCoord?.name || step.targetNodeLabel || 'Corridor'
      };
    });

    const totalDist = steps.length > 0 ? steps[steps.length - 1].cumulative_distance_m : 9.9;

    return {
      schema_version: '1.0',
      route_id: `route_${selectedDest}_${Date.now()}`,
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      units: 'meters',
      destination: {
        node_id: selectedDest || 'ceo_cabin',
        label: destinationName || 'CEO Cabin'
      },
      start: {
        node_id: selectedStart || 'main_entrance',
        label: selectedStart === 'current_location' ? 'Current Location' : 'Main Entrance'
      },
      total_distance_m: parseFloat(totalDist.toFixed(2)),
      step_length_m: 0.7,
      steps: steps.length > 0 ? steps : [
        {
          seq: 1,
          step_number: 1,
          action: 'forward',
          instruction: 'Head forward towards junction',
          heading_deg: 0.0,
          leg_distance_m: 0.8,
          cumulative_distance_m: 0.8,
          target_node: 'Corridor Junction',
          to_node_id: 'junction_south',
          to_node_label: 'Corridor Junction'
        },
        {
          seq: 2,
          step_number: 2,
          action: 'slight_left',
          instruction: 'Slight left onto corridor',
          heading_deg: 315.0,
          leg_distance_m: 2.8,
          cumulative_distance_m: 3.6,
          target_node: 'Corridor Junction',
          to_node_id: 'junction_hallway',
          to_node_label: 'Corridor'
        },
        {
          seq: 3,
          step_number: 3,
          action: 'turn_left',
          instruction: 'Turn left onto corridor',
          heading_deg: 270.0,
          leg_distance_m: 5.4,
          cumulative_distance_m: 9.0,
          target_node: 'Corridor Junction',
          to_node_id: 'junction_main',
          to_node_label: 'Corridor'
        },
        {
          seq: 4,
          step_number: 4,
          action: 'turn_right',
          instruction: 'Turn right onto corridor',
          heading_deg: 0.0,
          leg_distance_m: 3.6,
          cumulative_distance_m: 12.6,
          target_node: 'Corridor Junction',
          to_node_id: 'door_ceo',
          to_node_label: 'CEO Doorway'
        },
        {
          seq: 5,
          step_number: 5,
          action: 'arrive',
          instruction: 'Arrive at destination',
          heading_deg: 0.0,
          leg_distance_m: 0.0,
          cumulative_distance_m: 12.6,
          target_node: 'CEO Cabin',
          to_node_id: 'ceo_cabin',
          to_node_label: 'CEO Cabin'
        }
      ]
    };
  };

  const transcript = buildTranscript();
  const activeStep = transcript.steps[selectedStepIdx] || transcript.steps[0];

  const stepAction = (activeStep?.action || 'forward').toLowerCase();
  const stepDist = typeof activeStep?.leg_distance_m === 'number' ? activeStep.leg_distance_m : 0.8;
  const stepDistFormatted = parseFloat(stepDist.toFixed(1));
  let stepCmd = `walk straight for ${stepDistFormatted}m`;
  if (stepAction.includes('u_turn') || stepAction.includes('uturn')) {
    stepCmd = `make a U-turn after ${stepDistFormatted}m`;
  } else if (stepAction.includes('slight_left')) {
    stepCmd = `slight left after ${stepDistFormatted}m`;
  } else if (stepAction.includes('slight_right')) {
    stepCmd = `slight right after ${stepDistFormatted}m`;
  } else if (stepAction.includes('left')) {
    stepCmd = `turn left after ${stepDistFormatted}m`;
  } else if (stepAction.includes('right')) {
    stepCmd = `turn right after ${stepDistFormatted}m`;
  } else if (stepAction === 'arrive') {
    stepCmd = `arrived at ${destinationName || 'destination'}`;
  } else if (stepAction === 'stop') {
    stepCmd = 'stop';
  }

  const payloadToSend = sendMode === 'single' ? {
    command: stepCmd,
    direction: stepAction,
    meters: parseFloat(stepDist.toFixed(2))
  } : {
    commands: transcript.steps.map(s => {
      const a = (s.action || 'forward').toLowerCase();
      const d = typeof s.leg_distance_m === 'number' ? parseFloat(s.leg_distance_m.toFixed(1)) : 0;
      let c = `walk straight for ${d}m`;
      if (a.includes('left')) c = `turn left after ${d}m`;
      else if (a.includes('right')) c = `turn right after ${d}m`;
      else if (a === 'arrive') c = `arrived at ${destinationName || 'destination'}`;
      return { command: c, direction: a, meters: d };
    })
  };

  const payloadJson = JSON.stringify(payloadToSend, null, 2);

  // Send to Raspberry Pi (via Backend Proxy to bypass HTTPS Mixed Content)
  const handleSendToPi = async () => {
    const cleanIp = piIp.trim();
    const cleanPort = piPort.trim();
    if (!cleanIp) {
      setStatusMsg('Please enter your Raspberry Pi IP address.');
      setStatusType('error');
      return;
    }

    const modeLabel = sendMode === 'single'
      ? `Step ${(selectedStepIdx || 0) + 1} (${activeStep?.action})`
      : `all ${transcript.steps.length} steps`;

    setIsSending(true);
    setStatusMsg(`Dispatching ${modeLabel} to Raspberry Pi at ${protocol}://${cleanIp}:${cleanPort}...`);
    setStatusType('info');

    try {
      const proxyRes = await fetch('/api/send-to-pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pi_ip: cleanIp,
          pi_port: cleanPort,
          protocol: protocol,
          transcript: payloadToSend
        })
      });

      const resData = await proxyRes.json().catch(() => ({}));
      if (proxyRes.ok) {
        setStatusMsg(`✅ Successfully sent ${modeLabel} to Raspberry Pi! Robot is ready.`);
        setStatusType('success');
        setIsSending(false);
        return;
      } else {
        setStatusMsg(`⚠️ ${resData.error || proxyRes.statusText}`);
        setStatusType('error');
        setIsSending(false);
        return;
      }
    } catch (proxyErr) {
      console.warn('Backend proxy fetch failed, attempting direct fetch:', proxyErr);
    }

    // Direct fetch fallback
    const endpoint = `${protocol}://${cleanIp}:${cleanPort}/navigate`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadJson,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        setStatusMsg(`✅ Successfully dispatched ${modeLabel} to Raspberry Pi!`);
        setStatusType('success');
      } else {
        const errData = await response.json().catch(() => ({}));
        setStatusMsg(`⚠️ Pi returned error: ${errData.error || response.statusText}`);
        setStatusType('error');
      }
    } catch (err) {
      console.warn('Direct fetch to Pi failed:', err);
      setStatusMsg(
        `⚠️ Could not reach Pi at ${endpoint}. Ensure 'python3 main.py' is running on the Pi.`
      );
      setStatusType('error');
    } finally {
      setIsSending(false);
    }
  };

  // --- Feedback FROM the Pi: check status, and test the fault path ---
  const callPiRelay = async (piPath, body = {}) => {
    const cleanIp = piIp.trim();
    const cleanPort = piPort.trim();
    const res = await fetch('/api/send-to-pi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pi_ip: cleanIp,
        pi_port: cleanPort,
        protocol,
        pi_path: piPath,
        transcript: body
      })
    });
    return res.json().catch(() => ({}));
  };

  const handleCheckStatus = async () => {
    setIsFeedbackBusy(true);
    setFeedbackMsg('Checking robot status...');
    setFeedbackType('info');
    try {
      const cleanIp = piIp.trim();
      const cleanPort = piPort.trim();
      const res = await fetch(
        `/api/pi-status?pi_ip=${encodeURIComponent(cleanIp)}&pi_port=${encodeURIComponent(cleanPort)}&protocol=${encodeURIComponent(protocol)}`
      );
      const data = await res.json();
      if (data.error) {
        setFeedbackMsg(`⚠️ ${data.error}`);
        setFeedbackType('error');
        setRobotStatus(null);
      } else {
        setRobotStatus(data);
        setFeedbackMsg(data.fault_active ? `⚠️ Robot is reporting a fault: ${data.last_error}` : `✅ Robot status: ${data.state}`);
        setFeedbackType(data.fault_active ? 'error' : 'success');
      }
    } catch (e) {
      setFeedbackMsg(`⚠️ Could not reach robot: ${e.message}`);
      setFeedbackType('error');
    } finally {
      setIsFeedbackBusy(false);
    }
  };

  const handleSimulateFault = async () => {
    setIsFeedbackBusy(true);
    setFeedbackMsg('Triggering test fault on robot...');
    setFeedbackType('info');
    try {
      const data = await callPiRelay('/simulate_fault', { message: 'Test fault triggered from dashboard' });
      setRobotStatus(data.status || null);
      setFeedbackMsg('⚠️ Test fault triggered - the app should show a fault banner now.');
      setFeedbackType('error');
    } catch (e) {
      setFeedbackMsg(`⚠️ Could not reach robot: ${e.message}`);
      setFeedbackType('error');
    } finally {
      setIsFeedbackBusy(false);
    }
  };

  const handleClearFault = async () => {
    setIsFeedbackBusy(true);
    setFeedbackMsg('Clearing fault...');
    setFeedbackType('info');
    try {
      const data = await callPiRelay('/clear_fault');
      setRobotStatus(data.status || null);
      setFeedbackMsg('✅ Fault cleared. Robot is ready again.');
      setFeedbackType('success');
    } catch (e) {
      setFeedbackMsg(`⚠️ Could not reach robot: ${e.message}`);
      setFeedbackType('error');
    } finally {
      setIsFeedbackBusy(false);
    }
  };

  // Copy JSON Transcript
  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(transcriptJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Download Transcript as .json file
  const handleDownloadTranscript = () => {
    const blob = new Blob([transcriptJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `navbot_transcript_${selectedDest}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay gmaps-modal-overlay" onClick={onClose}>
      <div className="modal-card gmaps-modal-card pi-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pi-modal-header">
          <div className="pi-title-row">
            <span className="pi-chip-icon">🤖</span>
            <div>
              <h3>Dispatch to Raspberry Pi</h3>
              <p className="pi-sub">Send navigation transcript to guide robot</p>
            </div>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        {/* Target Destination & Stats */}
        <div className="pi-route-summary">
          <div className="pi-summary-item">
            <span>Destination:</span>
            <strong>{destinationName || 'CEO Cabin'}</strong>
          </div>
          <div className="pi-summary-item">
            <span>Steps:</span>
            <strong>{transcript.steps.length} maneuvers</strong>
          </div>
          <div className="pi-summary-item">
            <span>Distance:</span>
            <strong>{transcript.total_distance_m} m</strong>
          </div>
        </div>

        {/* Transmission Mode Switcher: Step-by-Step vs All at Once */}
        <div style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '4px',
          borderRadius: '12px',
          marginBottom: '16px',
          gap: '4px'
        }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              background: sendMode === 'single' ? '#7c3aed' : 'transparent',
              color: sendMode === 'single' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setSendMode('single')}
          >
            ⚡ One-by-One (As Map Moves)
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              background: sendMode === 'all' ? '#7c3aed' : 'transparent',
              color: sendMode === 'all' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setSendMode('all')}
          >
            📦 All Steps at Once
          </button>
        </div>

        {/* Step-by-Step Selector Card (when in single mode) */}
        {sendMode === 'single' && (
          <div style={{
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active Step to Send
              </span>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>
                Step {(selectedStepIdx || 0) + 1} of {transcript.steps.length}
              </span>
            </div>

            <div style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <div>
                <span style={{
                  display: 'inline-block',
                  background: '#ede9fe',
                  color: '#6d28d9',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  marginBottom: '4px'
                }}>
                  {activeStep?.action}
                </span>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                  {activeStep?.instruction}
                </p>
              </div>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#7c3aed', whiteSpace: 'nowrap', marginLeft: '10px' }}>
                {activeStep?.leg_distance_m} m
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={selectedStepIdx <= 0}
                onClick={() => setSelectedStepIdx((i) => Math.max(0, i - 1))}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '600',
                  cursor: selectedStepIdx <= 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedStepIdx <= 0 ? 0.5 : 1
                }}
              >
                ◀ Prev Step
              </button>
              <button
                type="button"
                disabled={selectedStepIdx >= transcript.steps.length - 1}
                onClick={() => setSelectedStepIdx((i) => Math.min(transcript.steps.length - 1, i + 1))}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: '600',
                  cursor: selectedStepIdx >= transcript.steps.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: selectedStepIdx >= transcript.steps.length - 1 ? 0.5 : 1
                }}
              >
                Next Step ▶
              </button>
            </div>

            {onToggleLivePiSync && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isLivePiSync}
                  onChange={onToggleLivePiSync}
                  style={{ accentColor: '#7c3aed', width: '16px', height: '16px' }}
                />
                <span>Automatically sync next step when map moves</span>
              </label>
            )}
          </div>
        )}

        {/* IP & Port Configuration */}
        <div className="pi-config-box">
          <label className="pi-config-label">Raspberry Pi Wi-Fi Address:</label>
          <div className="pi-ip-inputs">
            <select
              className="pi-protocol-select"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              style={{
                background: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0 8px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <option value="http">http://</option>
              <option value="https">https://</option>
            </select>
            <div className="pi-input-wrapper">
              <input
                type="text"
                className="pi-ip-input"
                placeholder="127.0.0.1"
                value={piIp}
                onChange={(e) => setPiIp(e.target.value)}
              />
            </div>
            <div className="pi-port-wrapper">
              <span className="input-prefix">:</span>
              <input
                type="text"
                className="pi-port-input"
                placeholder="5000"
                value={piPort}
                onChange={(e) => setPiPort(e.target.value)}
              />
            </div>
          </div>
          <span className="pi-hint">
            The Pi runs <code>python3 main.py</code> listening on port 5000.
          </span>
        </div>

        {/* Robot Feedback Panel - the return path FROM the Pi (state, and
            any stepper/motor fault). Includes test buttons so you can verify
            this works even before real motor hardware is wired up. */}
        <div className="pi-config-box">
          <label className="pi-config-label">Robot Feedback:</label>
          {robotStatus && (
            <div className={`pi-status-box ${robotStatus.fault_active ? 'error' : 'success'}`} style={{ marginBottom: '8px' }}>
              State: <strong>{robotStatus.state}</strong>
              {robotStatus.fault_active && robotStatus.last_error && (
                <> — ⚠️ {robotStatus.last_error} {robotStatus.last_fault_at ? `(at ${robotStatus.last_fault_at})` : ''}</>
              )}
            </div>
          )}
          {feedbackMsg && (
            <div className={`pi-status-box ${feedbackType}`} style={{ marginBottom: '8px' }}>
              {feedbackMsg}
            </div>
          )}
          <div className="pi-secondary-row">
            <button type="button" className="btn-pi-secondary" onClick={handleCheckStatus} disabled={isFeedbackBusy}>
              🔄 Check Status
            </button>
            <button type="button" className="btn-pi-secondary" onClick={handleSimulateFault} disabled={isFeedbackBusy}>
              ⚠️ Simulate Fault
            </button>
            <button type="button" className="btn-pi-secondary" onClick={handleClearFault} disabled={isFeedbackBusy}>
              ✅ Clear Fault
            </button>
          </div>
          <span className="pi-hint">
            "Simulate Fault" lets you test the phone app's fault banner without real stepper hardware.
          </span>
        </div>

        {/* Status Feedback */}
        {statusMsg && (
          <div className={`pi-status-box ${statusType}`}>
            {statusMsg}
          </div>
        )}

        {/* Dispatch Actions */}
        <div className="pi-action-buttons">
          <button
            type="button"
            className="btn-pi-dispatch"
            onClick={handleSendToPi}
            disabled={isSending}
          >
            <span className="btn-icon">⚡</span>
            <span>
              {isSending
                ? 'Sending...'
                : sendMode === 'single'
                ? `Send: "${stepCmd}" to Raspberry Pi`
                : `Send All ${transcript.steps.length} Steps to Raspberry Pi`}
            </span>
          </button>

          <div className="pi-secondary-row">
            <button
              type="button"
              className="btn-pi-secondary"
              onClick={handleCopyTranscript}
            >
              {copied ? '✓ Copied' : '📋 Copy JSON'}
            </button>
            <button
              type="button"
              className="btn-pi-secondary"
              onClick={handleDownloadTranscript}
            >
              💾 Download .json
            </button>
          </div>
        </div>

        {/* Collapsible JSON Preview */}
        <details className="pi-json-details">
          <summary>View JSON Payload ({sendMode === 'single' ? `Step ${(selectedStepIdx || 0) + 1}` : 'All Steps'})</summary>
          <pre className="pi-json-preview">
            <code>{payloadJson}</code>
          </pre>
        </details>
      </div>
    </div>
  );
}
