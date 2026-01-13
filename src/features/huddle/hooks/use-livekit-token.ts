import { useState, useEffect, useCallback } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseLiveKitTokenProps {
  roomName: string | null;
  enabled: boolean;
  participantIdentity: string | null; // memberId
}

interface TokenResponse {
  token: string;
  serverUrl: string;
}

/**
 * Hook to fetch LiveKit access token from backend API
 * 
 * Phase 4: Implements token fetching from /api/livekit/token endpoint
 * Token includes participant identity and room permissions
 */
export function useLiveKitToken({
  roomName,
  enabled,
  participantIdentity,
}: UseLiveKitTokenProps) {
  const [token, setToken] = useState<string>("");
  const [serverUrl, setServerUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchToken = useCallback(async () => {
    if (!enabled || !roomName || !participantIdentity) {
      setToken("");
      setServerUrl("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/livekit/token?room=${encodeURIComponent(roomName)}&identity=${encodeURIComponent(participantIdentity)}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch token: ${response.statusText}`);
      }

      const data: TokenResponse = await response.json();
      setToken(data.token);
      setServerUrl(data.serverUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch LiveKit token");
      setError(error);
      setToken("");
      setServerUrl("");
      console.error("Error fetching LiveKit token:", error);
    } finally {
      setIsLoading(false);
    }
  }, [roomName, enabled, participantIdentity]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  return { token, serverUrl, isLoading, error, refetch: fetchToken };
}

/**
 * Get LiveKit server URL from environment variables
 * Falls back to placeholder if not configured
 */
export function getLiveKitServerUrl(): string {
  // Phase 2: Use environment variable, fallback to placeholder
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://your-livekit-server.com";
}
