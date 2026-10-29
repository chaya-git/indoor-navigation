// =============================================================================
// SPOKEN VOICE NAVIGATION ENGINE (Web Speech API)
// =============================================================================

class VoiceNavigator {
  constructor() {
    this.enabled = true;
    this.lastSpokenText = "";
    this.lastSpokenTime = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return this.enabled;
  }

  speak(text, { force = false } = {}) {
    if (!this.enabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const now = performance.now();
    // Prevent duplicate speech firing within 2 seconds
    if (!force && text === this.lastSpokenText && (now - this.lastSpokenTime) < 2200) {
      return;
    }

    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Pick English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}

export const voiceNavigator = new VoiceNavigator();

export function speakGuidance(text, isMuted = false) {
  if (isMuted) return;
  voiceNavigator.speak(text);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

