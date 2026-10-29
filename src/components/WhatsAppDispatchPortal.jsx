import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { DESTINATIONS, GRAPH_NODES } from '../data/buildingMapData.js';

export default function WhatsAppDispatchPortal({
  activeMap,
  allMaps = [],
  onSelectMap,
  selectedDest,
  onSelectDest,
  selectedStart,
  onSelectStart,
  onLaunchNavigation,
  onSwitchToMap,
  onOpenPi,
  onOpenUploadDiagram
}) {
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [serverIp, setServerIp] = useState(() => {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
    return localStorage.getItem('navbot_lan_ip') || '192.168.0.95';
  });

  const destList = (activeMap?.destinations && activeMap.destinations.length > 0)
    ? activeMap.destinations
    : (DESTINATIONS || [
        { id: 'ceo_cabin', name: 'CEO Cabin', category: 'Executive' },
        { id: 'hr_cabin', name: 'HR Cabin', category: 'Human Resources' },
        { id: 'main_entrance', name: 'Main Entrance', category: 'Exit / Entrance' }
      ]);

  const mapNodes = activeMap?.nodes || GRAPH_NODES || [];
  const currentDest = destList.find((d) => d.id === selectedDest) || destList[0];

  // Auto-fetch LAN IP from server endpoint
  useEffect(() => {
    fetch('/api/ip')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ip && d.ip !== '127.0.0.1') {
          setServerIp(d.ip);
          localStorage.setItem('navbot_lan_ip', d.ip);
        }
      })
      .catch(() => {});
  }, []);

  // Compute live navigation URL
  const getNavigationUrl = () => {
    const host = window.location.hostname;
    const port = window.location.port || '8443';
    const protocol = window.location.protocol === 'http:' ? 'http:' : 'https:';

    let targetHost = (host === 'localhost' || host === '127.0.0.1')
      ? (serverIp || '10.220.26.126')
      : host;

    // Convert raw IP to .nip.io wildcard domain
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(targetHost)) {
      targetHost = `${targetHost}.nip.io`;
    }

    const origin = `${protocol}//${targetHost}${port ? `:${port}` : ''}`;
    const params = new URLSearchParams();
    if (activeMap?.id) params.set('map', activeMap.id);
    if (selectedDest) params.set('dest', selectedDest);
    if (selectedStart) params.set('start', selectedStart);
    params.set('view', 'map');
    return `${origin}/?${params.toString()}`;
  };

  const navUrl = getNavigationUrl();

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(navUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR generation error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [navUrl]);

  const getFullPhoneNumber = () => {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const cleanCode = countryCode.replace(/\D/g, '');
    if (digitsOnly.startsWith(cleanCode)) {
      return digitsOnly;
    }
    return `${cleanCode}${digitsOnly}`;
  };

  // WhatsApp formatted message
  const buildWhatsAppMessage = () => {
    const destName = currentDest?.name || 'Your Destination';
    const startNode = mapNodes.find((n) => n.id === selectedStart);
    const startLabel = selectedStart === 'current_location'
      ? 'Current Location'
      : (startNode?.label || 'Main Entrance');

    const host = window.location.hostname;
    let targetHost = (host === 'localhost' || host === '127.0.0.1')
      ? (serverIp || '10.220.26.126')
      : host;

    const domain = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(targetHost)
      ? `${targetHost}.nip.io`
      : targetHost;

    const params = new URLSearchParams();
    if (activeMap?.id) params.set('map', activeMap.id);
    if (selectedDest) params.set('dest', selectedDest);
    if (selectedStart) params.set('start', selectedStart);
    params.set('view', 'map');

    const cleanLink = `https://${domain}:8443/?${params.toString()}`;
    const mapName = activeMap?.name || 'Office Blueprint 3D';

    return (
      `🏢 *Indoor 3D Smart Navigation*\n\n` +
      `🗺️ *Facility:* ${mapName}\n` +
      `🎯 *Destination:* ${destName}\n` +
      `📍 *Starting Point:* ${startLabel}\n\n` +
      `Tap the link below to launch turn-by-turn 3D guidance on your phone:\n\n` +
      `${cleanLink}\n\n` +
      `_No app download required. Sensor fusion & compass tracking supported._`
    );
  };

  const handleSendWhatsApp = (e) => {
    e.preventDefault();
    const fullPhone = getFullPhoneNumber();

    if (!phoneNumber || fullPhone.length < 10) {
      setStatusMessage('Please enter a valid phone number.');
      return;
    }

    const messageText = buildWhatsAppMessage();
    const encodedMessage = encodeURIComponent(messageText);
    const waUrl = `https://wa.me/${fullPhone}?text=${encodedMessage}`;

    setStatusMessage('Opening WhatsApp to dispatch navigation link...');
    setSentSuccess(true);
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    setTimeout(() => {
      setStatusMessage('Link ready! Check WhatsApp on your phone or scan the QR code.');
    }, 1500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(navUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="wa-portal-container">
      <header className="wa-portal-header">
        <div className="wa-portal-badge">
          <span className="badge-pulse" />
          <span>Indoor 3D Smart Navigation System</span>
        </div>
        <h1 className="wa-portal-title">Send 3D Navigation to Phone</h1>
        <p className="wa-portal-subtitle">
          Select your 3D building map, pick your destination, and send the route directly to your phone via WhatsApp or QR code.
        </p>
      </header>

      <div className="wa-portal-grid">
        {/* Form Card */}
        <section className="wa-portal-card wa-form-card">
          <form onSubmit={handleSendWhatsApp} className="wa-nav-form">
            {/* Step 1: 3D Map Selector */}
            <div className="wa-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="wa-form-label" style={{ margin: 0 }}>
                  <span className="step-num">1</span>
                  <span>Select 3D Facility Map</span>
                </label>
                {onOpenUploadDiagram && (
                  <button
                    type="button"
                    onClick={onOpenUploadDiagram}
                    style={{
                      background: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                  >
                    📤 Upload 3D Diagram
                  </button>
                )}
              </div>
              <select
                className="wa-select"
                value={activeMap?.id || ''}
                onChange={(e) => onSelectMap && onSelectMap(e.target.value)}
                style={{ fontWeight: '700', fontSize: '14px', color: '#1e1b4b' }}
              >
                {(allMaps || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.icon || '🏢'} {m.name} ({m.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Select Destination */}
            <div className="wa-form-group">
              <label className="wa-form-label">
                <span className="step-num">2</span>
                <span>Select Destination</span>
              </label>
              <div className="dest-chips-grid">
                {destList.map((dest) => (
                  <button
                    key={dest.id}
                    type="button"
                    className={`dest-chip-card ${selectedDest === dest.id ? 'active' : ''}`}
                    onClick={() => onSelectDest(dest.id)}
                  >
                    <div className="dest-chip-icon">
                      {dest.category === 'Executive' ? '👔' : dest.category === 'Laboratories' ? '🔬' : dest.category === 'Automation' ? '🤖' : '🚪'}
                    </div>
                    <div className="dest-chip-details">
                      <div className="dest-chip-title">{dest.name}</div>
                      <div className="dest-chip-sub">{dest.category || 'Zone'}</div>
                    </div>
                    {selectedDest === dest.id && (
                      <span className="dest-chip-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Starting Point */}
            <div className="wa-form-group">
              <label className="wa-form-label">
                <span className="step-num">3</span>
                <span>Starting From</span>
              </label>
              <select
                className="wa-select"
                value={selectedStart}
                onChange={(e) => onSelectStart(e.target.value)}
              >
                <option value="current_location">📍 Detect My Location Automatically</option>
                {mapNodes.filter(n => n.type === 'poi' || n.type === 'junction' || n.type === 'entrance').map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label || `Location ${n.id}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 4: Phone Number */}
            <div className="wa-form-group">
              <label className="wa-form-label">
                <span className="step-num">4</span>
                <span>Your WhatsApp Number</span>
              </label>
              <div className="wa-phone-input-row">
                <select
                  className="wa-country-select"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                >
                  <option value="+91">🇮🇳 +91 (India)</option>
                  <option value="+1">🇺🇸 +1 (US / CA)</option>
                  <option value="+44">🇬🇧 +44 (UK)</option>
                  <option value="+971">🇦🇪 +971 (UAE)</option>
                  <option value="+65">🇸🇬 +65 (Singapore)</option>
                </select>
                <input
                  type="tel"
                  className="wa-phone-input"
                  placeholder="Enter 10-digit number"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setStatusMessage('');
                  }}
                  autoComplete="tel"
                  maxLength={15}
                />
              </div>
              <span className="wa-hint-text">
                Your number is never stored. A secure HTTPS link will be sent to WhatsApp.
              </span>
            </div>

            {statusMessage && (
              <div className={`wa-status-alert ${sentSuccess ? 'success' : 'info'}`}>
                {statusMessage}
              </div>
            )}

            <button type="submit" className="wa-btn-send-whatsapp">
              <span className="wa-icon">💬</span>
              <span>Send 3D Route to My WhatsApp</span>
            </button>
          </form>
        </section>

        {/* QR Code & Direct Launch Card */}
        <section className="wa-portal-card wa-qr-card">
          <div className="wa-qr-header">
            <h3>📱 Or Scan QR with Phone</h3>
            <p>Scan with any phone camera to open 3D interactive navigation instantly.</p>
          </div>

          <div className="wa-qr-container">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="3D Navigation QR Code" className="wa-qr-image" />
            ) : (
              <div className="wa-qr-placeholder">Generating 3D QR...</div>
            )}
            <div className="wa-qr-badge">
              <span>{activeMap?.shortName || '3D Map'}</span> · <span>{currentDest?.name}</span>
            </div>
          </div>

          <div className="wa-link-box">
            <input
              type="text"
              readOnly
              value={navUrl}
              className="wa-link-input"
              onClick={(e) => e.target.select()}
            />
            <button
              type="button"
              className="wa-btn-copy"
              onClick={handleCopyLink}
              title="Copy navigation link"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="wa-direct-launch-actions">
            <button
              type="button"
              className="wa-btn-launch-map"
              onClick={onSwitchToMap}
            >
              🗺️ Open 3D Map Directly on this Screen
            </button>

            {onOpenPi && (
              <button
                type="button"
                className="wa-btn-pi-dispatch"
                onClick={onOpenPi}
                title="Send route transcript directly to Raspberry Pi robot"
              >
                🤖 Send to Raspberry Pi Robot
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
