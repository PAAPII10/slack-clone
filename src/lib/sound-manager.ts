/**
 * Sound Manager - Provides high-quality notification sounds
 * Uses Web Audio API to generate pleasant notification sounds
 */

export type SoundType = "default" | "chime" | "bell" | "pop" | "ding" | "slack";

interface SoundConfig {
  name: string;
  play: (volume: number) => void;
}

export interface SoundPreferences {
  soundType: SoundType;
  volume: number; // 0.0 to 1.0
  enabled: boolean;
}

const DEFAULT_PREFERENCES: SoundPreferences = {
  soundType: "default",
  volume: 0.5,
  enabled: true,
};

/**
 * Get audio context (supports Safari)
 */
function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    return new AudioContextClass();
  } catch {
    return null;
  }
}

/**
 * Play a tone with specified frequency, duration, and envelope
 */
function playTone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  envelope?: { attack: number; decay: number; sustain: number; release: number }
) {
  const audioContext = getAudioContext();
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = type;

  const now = audioContext.currentTime;
  const totalDuration = duration;

  if (envelope) {
    const { attack, decay, sustain, release } = envelope;
    const sustainLevel = sustain * volume;
    const peakLevel = volume;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakLevel, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
    gainNode.gain.setValueAtTime(sustainLevel, now + totalDuration - release);
    gainNode.gain.linearRampToValueAtTime(0, now + totalDuration);
  } else {
    // Simple envelope
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + totalDuration);
  }

  oscillator.start(now);
  oscillator.stop(now + totalDuration);

  // Clean up audio context after sound finishes
  const cleanup = () => {
    try {
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    } catch {
      // Ignore errors during cleanup
    }
  };

  oscillator.onended = cleanup;

  // Fallback cleanup in case onended doesn't fire
  setTimeout(cleanup, (totalDuration + 0.1) * 1000);
}

/**
 * Play multiple tones in sequence or parallel
 */
function playChord(
  frequencies: number[],
  duration: number,
  volume: number,
  stagger: number = 0
) {
  const audioContext = getAudioContext();
  if (!audioContext) return;

  const gainNode = audioContext.createGain();
  gainNode.connect(audioContext.destination);

  frequencies.forEach((freq, index) => {
    const oscillator = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    oscillator.connect(oscGain);
    oscGain.connect(gainNode);

    oscillator.frequency.value = freq;
    oscillator.type = "sine";

    const startTime = audioContext.currentTime + index * stagger;
    const individualVolume = volume / frequencies.length;

    oscGain.gain.setValueAtTime(0, startTime);
    oscGain.gain.linearRampToValueAtTime(individualVolume, startTime + 0.01);
    oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });

  // Clean up audio context after all sounds finish
  const cleanup = () => {
    try {
      if (audioContext.state !== "closed") {
        audioContext.close();
      }
    } catch {
      // Ignore errors during cleanup
    }
  };

  setTimeout(
    cleanup,
    (frequencies.length - 1) * stagger * 1000 + duration * 1000 + 100
  );
}

// Sound definitions
const sounds: Record<SoundType, SoundConfig> = {
  default: {
    name: "Default",
    play: (volume) => {
      // Pleasant two-tone chime
      playChord([523.25, 659.25], 0.3, volume, 0.05); // C5 and E5
    },
  },
  chime: {
    name: "Chime",
    play: (volume) => {
      // Three-tone ascending chime
      playChord([523.25, 659.25, 783.99], 0.4, volume, 0.08); // C5, E5, G5
    },
  },
  bell: {
    name: "Bell",
    play: (volume) => {
      // Bell-like sound with harmonics
      const audioContext = getAudioContext();
      if (!audioContext) return;

      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);

      // Fundamental + harmonics for bell-like sound
      const frequencies = [440, 880, 1320, 1760]; // A4 and harmonics
      const now = audioContext.currentTime;
      const duration = 0.6;

      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const oscGain = audioContext.createGain();
        oscillator.connect(oscGain);
        oscGain.connect(gainNode);

        oscillator.frequency.value = freq;
        oscillator.type = index === 0 ? "sine" : "triangle";

        const individualVolume =
          (volume / frequencies.length) * (1 / (index + 1));

        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(individualVolume, now + 0.02);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
      });

      // Clean up audio context after sound finishes
      const cleanup = () => {
        try {
          if (audioContext.state !== "closed") {
            audioContext.close();
          }
        } catch {
          // Ignore errors during cleanup
        }
      };

      setTimeout(cleanup, duration * 1000 + 100);
    },
  },
  pop: {
    name: "Pop",
    play: (volume) => {
      // Quick, snappy pop sound
      playTone(800, 0.15, volume, "sine", {
        attack: 0.001,
        decay: 0.05,
        sustain: 0.3,
        release: 0.1,
      });
    },
  },
  ding: {
    name: "Ding",
    play: (volume) => {
      // Single clean ding
      playTone(800, 0.25, volume, "sine", {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.14,
      });
    },
  },
  slack: {
    name: "Slack-style",
    play: (volume) => {
      // Slack-like notification: quick two-tone
      const audioContext = getAudioContext();
      if (!audioContext) return;

      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);

      // Two quick tones
      [523.25, 659.25].forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const oscGain = audioContext.createGain();
        oscillator.connect(oscGain);
        oscGain.connect(gainNode);

        oscillator.frequency.value = freq;
        oscillator.type = "sine";

        const startTime = audioContext.currentTime + index * 0.1;
        const duration = 0.15;

        oscGain.gain.setValueAtTime(0, startTime);
        oscGain.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.01);
        oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      });

      // Clean up audio context after sound finishes
      const cleanup = () => {
        try {
          if (audioContext.state !== "closed") {
            audioContext.close();
          }
        } catch {
          // Ignore errors during cleanup
        }
      };

      setTimeout(cleanup, 300);
    },
  },
};

/**
 * Play a notification sound
 */
export function playNotificationSound(
  soundType: SoundType = "default",
  volume: number = 0.5
) {
  const sound = sounds[soundType];
  if (!sound) {
    sounds.default.play(volume);
    return;
  }

  try {
    sound.play(Math.max(0, Math.min(1, volume)));
  } catch (error) {
    console.warn("Could not play notification sound:", error);
  }
}

/**
 * Get default sound preferences
 * Note: Actual preferences should be fetched from Convex using useGetSoundPreferences hook
 */
export function getDefaultSoundPreferences(): SoundPreferences {
  return DEFAULT_PREFERENCES;
}

/**
 * Get all available sound types
 */
export function getAvailableSounds(): Array<{ type: SoundType; name: string }> {
  return Object.entries(sounds).map(([type, config]) => ({
    type: type as SoundType,
    name: config.name,
  }));
}
