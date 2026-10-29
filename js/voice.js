"use strict";

// =============================================================================
// VOICE GUIDANCE
// -----------------------------------------------------------------------------
// Previously `speak()` had no guard against overlapping calls, so anything
// that triggered it in quick succession (rapid false steps, re-renders,
// duplicate sensor listeners) queued up speech that played back-to-back,
// sounding like it was talking non-stop. Now:
//   - Only one utterance can be "in flight" at a time (isSpeaking flag).
//   - The exact same text is never spoken twice in a row.
//   - Turn-by-turn prompts are only ever triggered from confirmed movement
//     (a real or simulated step), never from rendering/animation.
// =============================================================================

let voiceEnabled = true;
let isSpeaking = false;
let lastSpokenText = "";

function speak(text, { force = false } = {}) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  if (!force && text === lastSpokenText && isSpeaking) return; // avoid duplicate overlap

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.onstart = () => { isSpeaking = true; };
  utterance.onend = () => { isSpeaking = false; };
  utterance.onerror = () => { isSpeaking = false; };

  lastSpokenText = text;
  window.speechSynthesis.speak(utterance);
}

// Called after each confirmed step (real sensor step or auto-walk/manual tap).
// Speaks the upcoming instruction only the first time the walked distance
// crosses into that instruction's segment — one announcement per step of
// the route, not per physical footstep.
function checkVoicePrompt() {
  if (!state.navigating || !state.directions.length) return;
  const coveredM = distanceCoveredAlong(state.path, state.progress) / PX_PER_METER;

  for (let i = 0; i < state.directions.length; i++) {
    const step = state.directions[i];
    if (i > state.lastSpokenIndex && coveredM >= step.startDistanceM - 0.2) {
      state.lastSpokenIndex = i;
      speak(step.instruction);
      break;
    }
  }
}
