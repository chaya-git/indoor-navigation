// =============================================================================
// GOOGLE MAPS NAVIGATION TURN-BY-TURN BANNER
// =============================================================================

import React, { useState } from 'react';
import { computeLiveManeuverProgress } from '../navigation/routeGuidance.js';

// Maneuver Icons
function IconManeuver({ type, size = 32 }) {
  const t = (type || '').toLowerCase();

  if (t.includes('right')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 14 20 9 15 4" />
        <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
      </svg>
    );
  }

  if (t.includes('left')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    );
  }

  if (t.includes('arrive') || t.includes('destination')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#ea4335" />
        <circle cx="12" cy="10" r="3" fill="#ffffff" />
      </svg>
    );
  }

  if (t.includes('stairs') || t.includes('step') || t.includes('up')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19h4v-4h4v-4h4V7h4" />
        <polyline points="15 4 21 4 21 10" />
      </svg>
    );
  }

  // Straight
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

export function TurnByTurnBanner({
  activeRoute,
  turnInstructions = [],
  currentStepIndex = 0,
  userPos,
  isVoiceMuted,
  isMuted = false,
  onToggleVoice,
  onToggleMute
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const muteActive = isVoiceMuted !== undefined ? isVoiceMuted : isMuted;
  const handleToggle = onToggleVoice || onToggleMute;

  if (!turnInstructions || turnInstructions.length === 0) {
    return null;
  }

  const currentStep = turnInstructions[currentStepIndex] || turnInstructions[turnInstructions.length - 1];
  const nextStep = turnInstructions[currentStepIndex + 1];

  // Compute live real-time countdown to the upcoming maneuver
  const progress = computeLiveManeuverProgress(userPos, turnInstructions, currentStepIndex) || { distanceToTurnMeters: 0, isAtTurn: false };
  const liveDist = typeof progress.distanceToTurnMeters === 'number' && !isNaN(progress.distanceToTurnMeters) ? progress.distanceToTurnMeters : 0;

  let countdownText = 'Ahead';
  if (currentStep?.isArrival) {
    countdownText = liveDist <= 1.5 ? 'Arrived' : `In ${liveDist.toFixed(1)} m`;
  } else if (progress.isAtTurn) {
    countdownText = 'Turn now';
  } else if (liveDist > 0) {
    countdownText = `In ${liveDist.toFixed(1)} m`;
  }

  return (
    <div className={`gmaps-top-nav-card ${progress.isAtTurn ? 'at-turn-flash' : ''}`}>
      <div className="gmaps-nav-header">
        {/* Maneuver Arrow Box */}
        <div className={`gmaps-maneuver-box ${progress.isAtTurn ? 'active-turn' : ''}`}>
          <IconManeuver type={currentStep?.type} size={32} />
        </div>

        {/* Turn Instructions with Live Distance Countdown */}
        <div className="gmaps-turn-details">
          <div className="gmaps-turn-distance">
            {countdownText}
          </div>
          <div className="gmaps-turn-instruction">
            {currentStep?.instruction || 'Proceed straight along corridor'}
          </div>
          {nextStep ? (
            <div className="gmaps-turn-next">
              Then: {nextStep.instruction}
            </div>
          ) : (
            currentStep?.subText && (
              <div className="gmaps-turn-next">
                {currentStep.subText}
              </div>
            )
          )}
        </div>

        {/* Action icons: Speaker & Drawer */}
        <div className="gmaps-nav-actions">
          {handleToggle && (
            <button
              type="button"
              className="gmaps-icon-btn"
              onClick={handleToggle}
              title={muteActive ? 'Unmute voice' : 'Mute voice'}
              aria-label={muteActive ? 'Unmute' : 'Mute'}
            >
              {muteActive ? '🔇' : '🔊'}
            </button>
          )}

          <button
            type="button"
            className="gmaps-icon-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title="Show all turns"
            aria-label="Toggle turn sheet"
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Expandable Step Sheet */}
      {isExpanded && (
        <div className="gmaps-steps-list">
          {turnInstructions.map((step, idx) => (
            <div
              key={idx}
              className={`gmaps-step-item ${idx === currentStepIndex ? 'active' : ''} ${idx < currentStepIndex ? 'completed' : ''}`}
            >
              <div className="step-icon-col">
                <IconManeuver type={step.type} size={18} />
              </div>
              <div className="step-text-col">
                <div className="step-main-text">{step.instruction}</div>
                {typeof step.distanceMeters === 'number' && step.distanceMeters > 0 && (
                  <div className="step-dist-text">{Number(step.distanceMeters).toFixed(1)} m</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TurnByTurnBanner;
