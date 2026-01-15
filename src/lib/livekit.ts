/**
 * LiveKit Client Utilities
 *
 * Helper functions for LiveKit integration
 */

export interface TokenRequest {
  identity: string;
  roomName: string;
  participantName?: string;
}

export interface TokenResponse {
  token: string;
  url: string;
}

/**
 * Request a LiveKit access token from the server
 *
 * @param identity - Unique user identifier
 * @param roomName - Room name to join
 * @param participantName - Optional display name
 * @returns Promise with token and URL
 */
export async function getLiveKitToken({
  identity,
  roomName,
  participantName,
}: {
  identity: string;
  roomName: string;
  participantName?: string;
}): Promise<TokenResponse> {
  const response = await fetch("/api/livekit/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identity,
      roomName,
      participantName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get token");
  }

  return response.json();
}

/**
 * PHASE 11: Client-side utility to delete/close a LiveKit room
 *
 * This function makes a POST request to the room deletion API route.
 * Room deletion is performed server-side for security (API secrets never exposed).
 */

export async function deleteLiveKitRoom(
  roomName: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch("/api/livekit/room/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roomName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete room");
  }

  return response.json();
}
