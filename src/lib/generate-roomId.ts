/**
 * Generates a LiveKit-safe room ID
 * Allowed chars: A-Z a-z 0-9 _ -
 */
export function generateRoomId(options?: {
  prefix?: string;
  length?: number;
}): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

  const length = options?.length ?? 16;
  const prefix = options?.prefix ? `${options.prefix}_` : "";

  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix}${id}`;
}
