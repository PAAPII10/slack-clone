"use client";

import { ReactNode, useCallback, useMemo, useEffect, useRef } from "react";
import { LiveKitRoom, useRoomContext } from "@livekit/components-react";
import { RoomOptions, Track, LocalAudioTrack } from "livekit-client";
import { Id } from "../../../../convex/_generated/dataModel";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { getAudioContextConstructor } from "@/lib/audio-context-types";

interface LiveKitRoomWrapperProps {
  children: ReactNode;
  roomName: string;
  token: string;
  serverUrl: string;
  enabled: boolean;
  onConnected?: () => void; // Room available via useRoom() hook in children
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Inner component to handle LiveKit audio settings
 * Must be rendered inside LiveKitRoom context
 *
 * NOTE: Microphone gain control - While the slider stores the user's preference,
 * applying gain control to LiveKit tracks requires special handling because
 * LiveKit manages MediaStreamTracks internally and doesn't expose easy hooks
 * for audio processing injection.
 */
function LiveKitAudioSettingsHandler() {
  const room = useRoomContext();
  const { settings } = useHuddleAudioSettings();
  const isConnectedRef = useRef(false);

  // Wait for room to be fully connected before enabling tracks
  // This prevents "publishing rejected as engine not connected within timeout" errors
  useEffect(() => {
    if (!room) return;

    const handleConnectionStateChange = (state: string) => {
      console.log("LiveKit connection state:", state);

      if (state === "connected" && !isConnectedRef.current) {
        isConnectedRef.current = true;
        console.log("✓ LiveKit room connected, enabling tracks");

        // Enable microphone after connection is established
        // Only enable if user didn't start muted
        if (!settings.startMuted && room.localParticipant) {
          room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
            console.error("Error enabling microphone after connection:", err);
          });
        }
      }
    };

    // Listen to connection state changes
    room.on("connectionStateChanged", handleConnectionStateChange);

    // Check initial state
    if (room.state === "connected") {
      handleConnectionStateChange("connected");
    }

    return () => {
      room.off("connectionStateChanged", handleConnectionStateChange);
    };
  }, [room, settings.startMuted]);

  // Apply device selection when settings change
  useEffect(() => {
    if (!room || !room.localParticipant || !isConnectedRef.current) return;

    const applyAudioSettings = async () => {
      try {
        // Switch microphone device if selected
        if (settings.selectedMicId) {
          await room.switchActiveDevice("audioinput", settings.selectedMicId);
          console.log("Switched microphone to:", settings.selectedMicId);
        }

        // Switch speaker device if selected (only works in supported browsers)
        if (settings.selectedSpeakerId) {
          await room.switchActiveDevice(
            "audiooutput",
            settings.selectedSpeakerId
          );
          console.log("Switched speaker to:", settings.selectedSpeakerId);
        }
      } catch (err) {
        console.warn("Error applying audio device settings:", err);
      }
    };

    applyAudioSettings();
  }, [room, settings.selectedMicId, settings.selectedSpeakerId]);

  // Apply audio processing options when they change
  useEffect(() => {
    if (!room || !room.localParticipant || !isConnectedRef.current) return;

    const updateAudioOptions = async () => {
      const micPublication = room.localParticipant.getTrackPublication(
        Track.Source.Microphone
      );
      if (!micPublication?.track) return;

      try {
        // Get current constraints and update audio processing
        const mediaTrack = (micPublication.track as LocalAudioTrack)
          .mediaStreamTrack;
        if (mediaTrack && typeof mediaTrack.applyConstraints === "function") {
          const constraints: MediaTrackConstraints = {
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
          };

          await mediaTrack.applyConstraints(constraints);
          console.log("Applied audio processing constraints:", constraints);
        }
      } catch (err) {
        console.warn("Error applying audio processing settings:", err);
      }
    };

    updateAudioOptions();
  }, [
    room,
    settings.echoCancellation,
    settings.noiseSuppression,
    settings.autoGainControl,
  ]);

  // Apply mic gain using manual track management
  // This is a working implementation that creates a processed mic track
  const gainProcessorRef = useRef<{
    audioContext: AudioContext;
    gainNode: GainNode;
    source: MediaStreamAudioSourceNode;
    destination: MediaStreamAudioDestinationNode;
  } | null>(null);
  const processedTrackRef = useRef<MediaStreamTrack | null>(null);
  const setupCompleteRef = useRef(false);

  useEffect(() => {
    if (
      !room ||
      !room.localParticipant ||
      !isConnectedRef.current ||
      setupCompleteRef.current
    )
      return;

    const setupGainProcessing = async () => {
      try {
        const micPub = room.localParticipant.getTrackPublication(
          Track.Source.Microphone
        );
        if (!micPub?.track) return;

        const audioTrack = micPub.track as LocalAudioTrack;
        const originalTrack = audioTrack.mediaStreamTrack;

        if (!originalTrack) return;

        // Only set up once
        if (processedTrackRef.current) return;

        const AudioContextClass = getAudioContextConstructor();
        if (!AudioContextClass) return;

        // Create Web Audio pipeline
        const audioContext = new AudioContextClass();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const gainNode = audioContext.createGain();
        gainNode.gain.value = settings.micGain;

        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaStreamSource(
          new MediaStream([originalTrack])
        );

        // Connect pipeline
        source.connect(gainNode);
        gainNode.connect(destination);

        // Store references
        gainProcessorRef.current = {
          audioContext,
          gainNode,
          source,
          destination,
        };

        // Get processed track
        const processedTrack = destination.stream.getAudioTracks()[0];
        processedTrackRef.current = processedTrack;

        // Replace the track
        await audioTrack.replaceTrack(processedTrack, { stopProcessor: false });

        setupCompleteRef.current = true;
        console.log("✓ Gain control active:", settings.micGain);
      } catch (error) {
        console.error("Gain setup error:", error);
      }
    };

    // Wait a bit for track to be ready
    const timer = setTimeout(setupGainProcessing, 500);
    return () => clearTimeout(timer);
  }, [room, settings.micGain]);

  // Update gain in real-time
  useEffect(() => {
    if (gainProcessorRef.current) {
      const { gainNode, audioContext } = gainProcessorRef.current;
      const currentTime = audioContext.currentTime;

      gainNode.gain.cancelScheduledValues(currentTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
      gainNode.gain.linearRampToValueAtTime(
        settings.micGain,
        currentTime + 0.05
      );

      console.log("🎚️ Mic gain:", Math.round(settings.micGain * 100) + "%");
    }
  }, [settings.micGain]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (gainProcessorRef.current) {
        const { source, gainNode, destination, audioContext } =
          gainProcessorRef.current;
        try {
          source.disconnect();
          gainNode.disconnect();
          destination.disconnect();
          audioContext.close();
        } catch {
          // Ignore
        }
        gainProcessorRef.current = null;
      }
      processedTrackRef.current = null;
      setupCompleteRef.current = false;
    };
  }, []);

  return null;
}

/**
 * LiveKitRoom wrapper component
 * Manages LiveKit room connection and provides room context to children
 *
 * Phase 2: Client-only setup - token fetching will be added in Phase 4
 * Updated: Now includes audio settings integration
 */
export function LiveKitRoomWrapper({
  children,
  roomName, // Room name for validation/logging (room name is also embedded in token)
  token,
  serverUrl,
  enabled,
  onConnected,
  onDisconnected,
  onError,
}: LiveKitRoomWrapperProps) {
  const { settings } = useHuddleAudioSettings();

  // Validate room name format (room name is also embedded in token)
  // This validation helps catch issues early
  if (
    process.env.NODE_ENV === "development" &&
    roomName &&
    !roomName.startsWith(ROOM_NAME_PREFIX)
  ) {
    console.warn(
      `Invalid room name format: ${roomName}. Expected format: ${ROOM_NAME_PREFIX}<id>`
    );
  }

  // Room name is used for validation above and available for debugging
  // The actual room name is embedded in the LiveKit token
  void roomName; // Explicitly mark as used for linting

  const handleConnected = useCallback(() => {
    // LiveKitRoom provides room via context, not as callback parameter
    // Access room from context if needed using useRoom() hook
    onConnected?.();
  }, [onConnected]);

  const handleDisconnected = useCallback(() => {
    onDisconnected?.();
  }, [onDisconnected]);

  const handleError = useCallback(
    (error: Error) => {
      // Filter out non-critical DataChannel errors before passing to parent
      const errorMessage = error.message || error.toString();
      const isDataChannelError =
        errorMessage.includes("DataChannel") ||
        errorMessage.includes("dataChannel") ||
        errorMessage.includes("reliable");

      if (isDataChannelError) {
        // Log as warning but don't propagate - these are non-critical
        console.warn("LiveKit DataChannel warning (non-critical):", error);
        return; // Don't call onError for DataChannel errors
      }

      // Pass other errors to parent handler
      onError?.(error);
    },
    [onError]
  );

  // Build room options with audio settings
  const roomOptions: RoomOptions = useMemo(
    () => ({
      // Enable audio capture with processing options from settings
      audioCaptureDefaults: {
        deviceId: settings.selectedMicId || undefined,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      },
      // Video defaults
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720, frameRate: 30 },
      },
      // Audio output device
      audioOutput: {
        deviceId: settings.selectedSpeakerId || undefined,
      },
      // Adaptive stream for better quality
      adaptiveStream: true,
      // Dynacast for bandwidth optimization
      dynacast: true,
    }),
    [
      settings.selectedMicId,
      settings.selectedSpeakerId,
      settings.echoCancellation,
      settings.noiseSuppression,
      settings.autoGainControl,
    ]
  );

  if (!enabled || !token || !serverUrl) {
    return <>{children}</>;
  }

  return (
    <LiveKitRoom
      video={false}
      audio={false} // Start with audio disabled, enable after connection established
      token={token}
      serverUrl={serverUrl}
      connect={enabled}
      options={roomOptions}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
    >
      <LiveKitAudioSettingsHandler />
      {children}
    </LiveKitRoom>
  );
}

/**
 * Phase 3: Huddle Scope Mapping
 *
 * Each huddle is scoped to either:
 * - A channel (channelId) - for channel-wide huddles
 * - A conversation (conversationId) - for 1:1 DM huddles
 *
 * The LiveKit room name is derived from this scope to ensure:
 * - Unique room names per huddle scope
 * - Proper isolation between different huddles
 * - Easy mapping back from room name to huddle source
 */

const ROOM_NAME_PREFIX = "huddle-";

/**
 * Helper function to generate LiveKit room name from huddle source
 *
 * Room name format:
 * - Channel huddle: `huddle-${channelId}`
 * - DM huddle: `huddle-${conversationId}`
 *
 * @param channelId - Channel ID for channel huddles (mutually exclusive with conversationId)
 * @param conversationId - Conversation ID for DM huddles (mutually exclusive with channelId)
 * @returns LiveKit room name string, or null if neither ID is provided
 *
 * @example
 * // Channel huddle
 * getLiveKitRoomName("ch_abc123", null) // Returns: "huddle-ch_abc123"
 *
 * // DM huddle
 * getLiveKitRoomName(null, "conv_xyz789") // Returns: "huddle-conv_xyz789"
 */
export function getLiveKitRoomName(
  channelId: Id<"channels"> | null | undefined,
  conversationId: Id<"conversations"> | null | undefined
): string | null {
  // Channel huddles take precedence (should not have both)
  if (channelId) {
    return `${ROOM_NAME_PREFIX}${channelId}`;
  }

  // DM huddles use conversationId
  if (conversationId) {
    return `${ROOM_NAME_PREFIX}${conversationId}`;
  }

  // No valid scope - cannot create room name
  return null;
}

/**
 * Extract huddle scope from LiveKit room name
 *
 * @param roomName - LiveKit room name (format: "huddle-${id}")
 * @returns Object with channelId or conversationId, or null if invalid format
 */
export function parseLiveKitRoomName(
  roomName: string
):
  | { channelId: Id<"channels"> }
  | { conversationId: Id<"conversations"> }
  | null {
  if (!roomName.startsWith(ROOM_NAME_PREFIX)) {
    return null;
  }

  const id = roomName.slice(ROOM_NAME_PREFIX.length) as
    | Id<"channels">
    | Id<"conversations">;

  // Heuristic: channel IDs typically start with "ch_", conversation IDs with "conv_"
  // This is a best-effort guess - in production, you might want to validate against database
  if (id.startsWith("ch_")) {
    return { channelId: id as Id<"channels"> };
  } else if (id.startsWith("conv_")) {
    return { conversationId: id as Id<"conversations"> };
  }

  // Unknown format - return null
  return null;
}
