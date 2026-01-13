/**
 * Format duration in milliseconds to a human-readable string
 * Examples:
 * - 5000 -> "5s"
 * - 65000 -> "1m 5s"
 * - 3665000 -> "1h 1m 5s"
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingSeconds = seconds % 60;
  const remainingMinutes = minutes % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes}m`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(" ");
}

/**
 * Get current duration for an active huddle
 * @param startedAt - When the huddle started (timestamp in ms)
 * @returns Current duration in milliseconds
 */
export function getCurrentDuration(startedAt: number): number {
  return Date.now() - startedAt;
}
