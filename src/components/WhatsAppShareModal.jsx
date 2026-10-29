import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function WhatsAppShareModal({
  isOpen,
  onClose,
  activeMap,
  destinationName,
  selectedDest,
  selectedStart
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [serverIp, setServerIp] = useState(() => {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return host;
    }
    return localStorage.getItem('navbot_lan_ip') || '192.168.0.95';
  });

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/ip')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ip && d.ip !== '127.0.0.1') {
          setServerIp(d.ip);
          localStorage.setItem('navbot_lan_ip', d.ip);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const host = window.location.hostname;
  const port = window.location.port || '8443';
  const protocol = window.location.protocol === 'http:' ? 'http:' : 'https:';
  let targetHost = (host === 'localhost' || host === '127.0.0.1') ? (serverIp || '10.220.26.126') : host;

  // Convert raw IP to .nip.io wildcard domain for full WhatsApp hyperlink support
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(targetHost)) {
    targetHost = `${targetHost}.nip.io`;
  }

  const origin = `${protocol}//${targetHost}${port ? `:${port}` : ''}`;
  const mapParam = activeMap?.id ? `&map=${encodeURIComponent(activeMap.id)}` : '';
  const navUrl = `${origin}/?dest=${encodeURIComponent(selectedDest || 'ceo_cabin')}&start=${encodeURIComponent(selectedStart || 'main_entrance')}${mapParam}&view=map`;

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    QRCode.toDataURL(navUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).then((url) => {
      if (isMounted) setQrUrl(url);
    });
    return () => { isMounted = false; };
  }, [isOpen, navUrl]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 7) {
      setFeedback('Please enter a valid phone number.');
      return;
    }
    const cleanCode = countryCode.replace(/\D/g, '');
    const full = cleanDigits.startsWith(cleanCode) ? cleanDigits : `${cleanCode}${cleanDigits}`;

    const rawHost = (host === 'localhost' || host === '127.0.0.1') ? (serverIp || '10.220.26.126') : host;
    const cleanDomain = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawHost) ? `${rawHost}.nip.io` : rawHost;
    const params = `dest=${encodeURIComponent(selectedDest || 'ceo_cabin')}&start=${encodeURIComponent(selectedStart || 'main_entrance')}&view=map`;
    
    const httpsUrl = `https://${cleanDomain}:8443/?${params}`;
    const httpUrl = `http://${cleanDomain}:8000/?${params}`;

    const msg = 
      `🏢 *Office Indoor Navigation*\n\n` +
      `📍 *Destination:* ${destinationName || 'Office'}\n\n` +
      `👉 *Tap to open indoor navigation map:*\n\n` +
      `${httpsUrl}\n\n` +
      `⚡ *Instant open (HTTP - No SSL warning):*\n\n` +
      `${httpUrl}\n\n` +
      `📶 *(Connect your phone to the same Wi-Fi. For HTTPS, tap 'Advanced' → 'Proceed' if asked)*`;

    window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    setFeedback(`Opened WhatsApp for +${full}!`);
    setTimeout(() => onClose(), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(navUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-overlay gmaps-modal-overlay" onClick={onClose}>
      <div className="modal-card gmaps-modal-card wa-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal-header">
          <div className="wa-modal-title-row">
            <span className="wa-brand-icon">💬</span>
            <h3>Send Route to WhatsApp</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <p className="wa-modal-desc">
          Send the turn-by-turn route to <strong>{destinationName}</strong> to any mobile device.
        </p>

        <form onSubmit={handleSend} className="wa-modal-form">
          <div className="wa-phone-input-row">
            <select
              className="wa-country-select"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              <option value="+91">🇮🇳 +91</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+971">🇦🇪 +971</option>
            </select>
            <input
              type="tel"
              className="wa-phone-input"
              placeholder="Enter phone number"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setFeedback('');
              }}
              autoFocus
            />
          </div>

          {feedback && <div className="wa-feedback-tag">{feedback}</div>}

          <button type="submit" className="btn-send-whatsapp modal-btn">
            Send via WhatsApp
          </button>
        </form>

        <div className="wa-modal-divider">
          <span>OR SCAN DIRECTLY</span>
        </div>

        <div className="wa-modal-qr-section">
          {qrUrl ? (
            <img src={qrUrl} alt="Scan QR" className="wa-modal-qr-img" />
          ) : (
            <div className="qr-placeholder">Generating...</div>
          )}
          <button type="button" className="btn-copy-link-modal" onClick={handleCopy}>
            {copied ? '✓ Link Copied' : '🔗 Copy Navigation Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
