/**
 * Huddle Sound Manager
 * Manages audio feedback for huddle events (incoming call, join, leave, screen sharing, hangup)
 */

export type HuddleSoundType =
  | "incoming_call"
  | "join"
  | "leave"
  | "screen_sharing_start"
  | "screen_sharing_stop"
  | "hangup";

interface HuddleSoundConfig {
  path: string;
  volume: number; // Default volume (0.0 to 1.0)
}

const HUDDLE_SOUNDS: Record<HuddleSoundType, HuddleSoundConfig> = {
  incoming_call: {
    path: "/sounds/huddle/incoming_call.mp3",
    volume: 0.7,
  },
  join: {
    path: "/sounds/huddle/join.mp3", // Will use generated sound if file doesn't exist
    volume: 0.6,
  },
  leave: {
    path: "/sounds/huddle/leave.mp3", // Will use generated sound if file doesn't exist
    volume: 0.5,
  },
  screen_sharing_start: {
    path: "/sounds/huddle/screen_sharing_start.mp3", // Will use generated sound if file doesn't exist
    volume: 0.4,
  },
  screen_sharing_stop: {
    path: "/sounds/huddle/screen_sharing_stop.mp3", // Will use generated sound if file doesn't exist
    volume: 0.4,
  },
  hangup: {
    path: "/sounds/huddle/leave.mp3", // Will use generated sound if file doesn't exist
    volume: 0.6,
  },
};

// Cache for audio elements to avoid recreating them
const audioCache = new Map<HuddleSoundType, HTMLAudioElement>();

/**
 * Get or create an audio element for a sound
 */
function getAudioElement(soundType: HuddleSoundType): HTMLAudioElement {
  if (audioCache.has(soundType)) {
    return audioCache.get(soundType)!;
  }

  const config = HUDDLE_SOUNDS[soundType];
  const audio = new Audio(config.path);
  audio.volume = config.volume;
  audio.preload = "auto";

  // Make incoming call sound loop
  if (soundType === "incoming_call") {
    audio.loop = true;
  }

  audioCache.set(soundType, audio);
  return audio;
}

/**
 * Generate a fallback sound using Web Audio API if file doesn't exist
 */
function generateFallbackSound(
  soundType: HuddleSoundType,
  volume: number
): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different sounds for different events
    switch (soundType) {
      case "join":
        // Pleasant ascending tone
        oscillator.frequency.value = 523.25; // C5
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
        break;

      case "leave":
        // Descending tone
        oscillator.frequency.value = 440;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + 0.15
        );
        oscillator.frequency.exponentialRampToValueAtTime(
          330,
          ctx.currentTime + 0.15
        );
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);
        break;

      case "screen_sharing_start":
        // Quick pop
        oscillator.frequency.value = 800;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(
          volume * 0.5,
          ctx.currentTime + 0.01
        );
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
        break;

      case "screen_sharing_stop":
        // Quick pop (lower)
        oscillator.frequency.value = 600;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(
          volume * 0.5,
          ctx.currentTime + 0.01
        );
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
        break;

      case "hangup":
        // Quick descending tone
        oscillator.frequency.value = 600;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.frequency.exponentialRampToValueAtTime(
          300,
          ctx.currentTime + 0.2
        );
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
        break;

      default:
        return;
    }

    // Cleanup
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        // Ignore errors
      }
    }, 500);
  } catch {
    // Ignore errors if AudioContext creation fails
  }
}

/**
 * Play a huddle sound effect
 */
export function playHuddleSound(
  soundType: HuddleSoundType,
  volume?: number
): void {
  try {
    const config = HUDDLE_SOUNDS[soundType];
    const audio = getAudioElement(soundType);

    // Ensure loop is set for incoming calls
    if (soundType === "incoming_call") {
      audio.loop = true;
    }

    // Set volume if provided, otherwise use default
    if (volume !== undefined) {
      audio.volume = Math.max(0, Math.min(1, volume));
    } else {
      audio.volume = config.volume;
    }

    // Reset to beginning and play
    audio.currentTime = 0;
    console.log(
      `[HuddleSound] Playing ${soundType} sound at volume ${audio.volume}, loop: ${audio.loop}`
    );
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log(
            `[HuddleSound] Successfully started playing ${soundType}`
          );
        })
        .catch((error) => {
          console.warn(
            `[HuddleSound] Failed to play ${soundType} file, using fallback:`,
            error
          );
          // If file doesn't exist or can't play, use fallback
          generateFallbackSound(soundType, audio.volume);
        });
    }
  } catch (error) {
    console.error(`[HuddleSound] Error playing ${soundType}:`, error);
    // Try fallback on error
    const config = HUDDLE_SOUNDS[soundType];
    generateFallbackSound(soundType, volume ?? config.volume);
  }
}

/**
 * Stop a huddle sound effect (useful for stopping incoming call sounds)
 */
export function stopHuddleSound(soundType: HuddleSoundType): void {
  try {
    const audio = audioCache.get(soundType);
    if (audio) {
      console.log(`[HuddleSound] Stopping ${soundType} sound`);
      audio.pause();
      audio.currentTime = 0;
      // Disable loop when stopping
      if (soundType === "incoming_call") {
        audio.loop = false;
      }
    }
  } catch (error) {
    console.error(`[HuddleSound] Error stopping ${soundType}:`, error);
  }
}

/**
 * Preload all huddle sounds
 */
export function preloadHuddleSounds(): void {
  Object.keys(HUDDLE_SOUNDS).forEach((soundType) => {
    try {
      getAudioElement(soundType as HuddleSoundType);
    } catch {
      // Ignore errors during preload
    }
  });
}

/**
 * Clean up audio cache
 */
export function cleanupHuddleSounds(): void {
  audioCache.forEach((audio) => {
    try {
      audio.pause();
      audio.src = "";
    } catch {
      // Ignore errors
    }
  });
  audioCache.clear();
}
