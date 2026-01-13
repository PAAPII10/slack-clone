/**
 * Type definitions for AudioContext with webkit fallback support
 */

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: {
    new (contextOptions?: AudioContextOptions): AudioContext;
  };
};

/**
 * Get AudioContext constructor with webkit fallback
 * Returns null if neither is available
 */
export function getAudioContextConstructor():
  | (new (contextOptions?: AudioContextOptions) => AudioContext)
  | null {
  const windowWithWebkit = window as WindowWithWebkitAudio;
  return window.AudioContext || windowWithWebkit.webkitAudioContext || null;
}
