"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { getAudioContextConstructor } from "@/lib/audio-context-types";
import { useUpdateMuteStatus } from "../api/use-update-mute-status";
import { useGetHuddleByCurrentUser } from "../api/use-get-huddle-by-current-user";
import { LiveKitRoomWrapper, getLiveKitRoomName } from "./LiveKitRoom";
import { useLiveKitToken } from "../hooks/use-livekit-token";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import {
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";

interface HuddleMediaContextValue {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<Id<"members">, MediaStream>;
  remoteScreenShares: Map<Id<"members">, MediaStream>; // Separate map for remote screen shares
  screenSharingMemberId: Id<"members"> | null; // Who is currently sharing (local or remote)
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
  initializeMedia: () => Promise<void>;
  cleanup: () => void;
  isLoading: boolean;
  error: Error | null;
  // Mute status tracking
  participantsMuteStatus: Map<
    string,
    { isMuted: boolean; isSpeaking: boolean }
  >;
}

const HuddleMediaContext = createContext<HuddleMediaContextValue | undefined>(
  undefined
);

interface HuddleMediaProviderProps {
  children: ReactNode;
  enabled: boolean;
}

/**
 * Inner component that uses LiveKit hooks
 * Must be rendered inside LiveKitRoom context
 */
function LiveKitMediaProviderInner({
  children: roomChildren,
  activeHuddle,
  updateMuteStatus,
  setLocalStream,
  setScreenStream,
  setIsScreenSharing,
  setIsMuted,
  setIsVideoEnabled,
  setError,
  tokenLoading,
  error,
  currentMemberId,
}: {
  children: ReactNode;
  activeHuddle: { _id: Id<"huddles"> } | null | undefined;
  updateMuteStatus: (props: {
    huddleId: Id<"huddles">;
    isMuted: boolean;
  }) => Promise<unknown>;
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setIsScreenSharing: (sharing: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  setIsVideoEnabled: (enabled: boolean) => void;
  setError: (error: Error | null) => void;
  tokenLoading: boolean;
  error: Error | null;
  currentMemberId: Id<"members"> | null;
}) {
  // Get LiveKit tracks and participants
  // Note: Audio settings (device, noise cancellation) are handled by LiveKitRoomWrapper
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.Microphone, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: true },
    ],
    { onlySubscribed: false }
  );

  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();

  // Build mute status map directly from LiveKit participants
  // This is simpler than maintaining a separate hook with event listeners
  const participantsMuteStatus = useMemo(() => {
    const statusMap = new Map<
      string,
      { isMuted: boolean; isSpeaking: boolean }
    >();

    // Add local participant
    if (localParticipant.localParticipant) {
      statusMap.set(localParticipant.localParticipant.identity, {
        isMuted: !localParticipant.isMicrophoneEnabled,
        isSpeaking: localParticipant.localParticipant.isSpeaking,
      });
    }

    // Add remote participants
    remoteParticipants.forEach((participant) => {
      statusMap.set(participant.identity, {
        isMuted: !participant.isMicrophoneEnabled,
        isSpeaking: participant.isSpeaking,
      });
    });

    return statusMap;
  }, [
    localParticipant.localParticipant,
    localParticipant.isMicrophoneEnabled,
    remoteParticipants,
  ]);

  // Phase 6: Get room connection state
  // Derive connection state directly from localParticipant to avoid setState in effect
  const isRoomConnected = !!localParticipant.localParticipant;
  
  // Log connection status changes
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (isRoomConnected && !prevConnectedRef.current) {
      console.log("✓ Room connection established, local participant ready");
    }
    prevConnectedRef.current = isRoomConnected;
  }, [isRoomConnected]);

  const isConnecting = !isRoomConnected;

  // Phase 6: Multi-Participant Support
  // Build remote streams map from LiveKit tracks
  // Maps LiveKit participant identity (memberId) to MediaStream objects
  // Supports unlimited participants (not just 2)
  // Automatically handles join/leave events via LiveKit's useRemoteParticipants hook
  const { liveKitRemoteStreams, liveKitRemoteScreenShares } = useMemo(() => {
    const streams = new Map<Id<"members">, MediaStream>();
    const screenShares = new Map<Id<"members">, MediaStream>();

    // Create a set of active participant identities for quick lookup
    const activeParticipantIdentities = new Set(
      remoteParticipants.map((p) => p.identity)
    );

    // Group tracks by participant identity (which is memberId from token)
    const tracksByParticipant = new Map<
      string,
      {
        audio?: MediaStreamTrack;
        video?: MediaStreamTrack;
        screenShare?: MediaStreamTrack;
      }
    >();

    // Process all tracks and group by participant
    // LiveKit automatically provides tracks for all remote participants
    tracks.forEach((trackRef) => {
      // Skip placeholders and local tracks
      if ("placeholder" in trackRef || trackRef.participant.isLocal) {
        return;
      }

      const participantIdentity = trackRef.participant.identity;
      const mediaTrack = trackRef.publication?.track?.mediaStreamTrack;

      if (!participantIdentity || !mediaTrack) {
        return;
      }

      // CRITICAL: Only process tracks for participants that are still present
      // This prevents the "Tried to add a track for a participant, that's not present" error
      // when someone leaves the huddle
      if (!activeParticipantIdentities.has(participantIdentity)) {
        return;
      }

      // Get or create participant track group
      let participantTracks = tracksByParticipant.get(participantIdentity);
      if (!participantTracks) {
        participantTracks = {};
        tracksByParticipant.set(participantIdentity, participantTracks);
      }

      // Add track based on source
      if (trackRef.source === Track.Source.Microphone) {
        participantTracks.audio = mediaTrack;
      } else if (trackRef.source === Track.Source.Camera) {
        participantTracks.video = mediaTrack;
      } else if (trackRef.source === Track.Source.ScreenShare) {
        participantTracks.screenShare = mediaTrack;
      }
    });

    // Build MediaStream objects for each remote participant
    // This supports unlimited participants - each gets their own stream
    tracksByParticipant.forEach((participantTracks, participantIdentity) => {
      // Convert participant identity (string) to memberId (Id<"members">)
      // Identity is set to memberId in the token (Phase 4)
      const memberId = participantIdentity as Id<"members">;

      // Separate screen share streams
      if (participantTracks.screenShare) {
        screenShares.set(
          memberId,
          new MediaStream([participantTracks.screenShare])
        );
      }

      // Build regular video/audio stream (excluding screen share)
      const streamTracks: MediaStreamTrack[] = [];
      if (participantTracks.video) {
        streamTracks.push(participantTracks.video);
      }
      if (participantTracks.audio) {
        streamTracks.push(participantTracks.audio);
      }

      // Only create stream if there are tracks
      if (streamTracks.length > 0) {
        streams.set(memberId, new MediaStream(streamTracks));
      }
    });

    return {
      liveKitRemoteStreams: streams,
      liveKitRemoteScreenShares: screenShares,
    };
  }, [tracks, remoteParticipants]); // Include remoteParticipants to filter out disconnected participants

  // Get local tracks from participant
  const localAudioTrack = localParticipant.microphoneTrack;
  const localVideoTrack = localParticipant.cameraTrack;

  // Find screen share track from tracks array
  const localScreenTrack = tracks.find(
    (trackRef) =>
      !("placeholder" in trackRef) &&
      trackRef.source === Track.Source.ScreenShare &&
      trackRef.participant.isLocal
  );

  // Build local stream from LiveKit tracks
  // LiveKit handles audio settings (device, noise cancellation, etc.) natively via LiveKitRoomWrapper
  const liveKitLocalStream = useMemo(() => {
    const trackArray: MediaStreamTrack[] = [];

    // Add audio track
    if (localAudioTrack?.track?.mediaStreamTrack) {
      trackArray.push(localAudioTrack.track.mediaStreamTrack);
    }

    // Add video track
    if (localVideoTrack?.track?.mediaStreamTrack) {
      trackArray.push(localVideoTrack.track.mediaStreamTrack);
    }

    return trackArray.length > 0 ? new MediaStream(trackArray) : null;
  }, [localAudioTrack, localVideoTrack]);

  // Build screen stream
  const liveKitScreenStream = useMemo(() => {
    if (!localScreenTrack || "placeholder" in localScreenTrack) return null;
    const mediaTrack = localScreenTrack.publication?.track?.mediaStreamTrack;
    if (!mediaTrack) return null;
    return new MediaStream([mediaTrack]);
  }, [localScreenTrack]);

  // Phase 6: Handle participant join/leave events automatically
  // LiveKit automatically manages participant list via useRemoteParticipants
  // We just need to update our remote streams map when participants change

  // Update state from LiveKit
  useEffect(() => {
    setLocalStream(liveKitLocalStream);
  }, [liveKitLocalStream, setLocalStream]);

  useEffect(() => {
    setScreenStream(liveKitScreenStream);
    setIsScreenSharing(!!liveKitScreenStream);
  }, [liveKitScreenStream, setScreenStream, setIsScreenSharing]);

  // Phase 6: Log participant join/leave events for debugging
  useEffect(() => {
    console.log("LiveKit remote participants:", {
      count: remoteParticipants.length,
      identities: remoteParticipants.map((p) => p.identity),
    });
  }, [remoteParticipants]);

  // Update mute state from LiveKit
  // This syncs UI state with LiveKit's actual microphone state
  useEffect(() => {
    const muted = localParticipant.isMicrophoneEnabled === false;
    setIsMuted(muted);
    console.log("Mute state synced from LiveKit:", {
      isMicrophoneEnabled: localParticipant.isMicrophoneEnabled,
      muted,
    });
  }, [localParticipant.isMicrophoneEnabled, setIsMuted]);

  // Update video state from LiveKit
  useEffect(() => {
    const videoEnabled = !!localParticipant.cameraTrack;
    setIsVideoEnabled(videoEnabled);
  }, [localParticipant.cameraTrack, setIsVideoEnabled]);

  // Override toggle functions to use LiveKit
  const liveKitToggleAudio = useCallback(async () => {
    if (!localParticipant.localParticipant) {
      console.warn("Cannot toggle audio: localParticipant not available");
      setError(new Error("Cannot toggle microphone: not connected to LiveKit"));
      return;
    }

    // Wait for connection to be ready before attempting to toggle
    if (!isRoomConnected) {
      console.warn("Cannot toggle audio: room not yet connected");
      return;
    }

    try {
      // Toggle microphone: if currently enabled, disable it (mute), and vice versa
      const currentlyEnabled = localParticipant.isMicrophoneEnabled;
      const newEnabled = !currentlyEnabled;
      const newMuted = !newEnabled; // muted = not enabled

      console.log("Toggling microphone:", {
        currentlyEnabled,
        newEnabled,
        newMuted,
        hasLocalParticipant: !!localParticipant.localParticipant,
        isRoomConnected,
      });

      // Use await to ensure the operation completes
      await localParticipant.localParticipant.setMicrophoneEnabled(newEnabled);

      // Update local state immediately for responsive UI
      setIsMuted(newMuted);

      // Update backend mute status
      if (activeHuddle) {
        updateMuteStatus({
          huddleId: activeHuddle._id,
          isMuted: newMuted,
        }).catch((err) => {
          console.error("Failed to update mute status:", err);
        });
      }
    } catch (err) {
      console.error("Error toggling microphone:", err);
      setError(
        err instanceof Error ? err : new Error("Failed to toggle microphone")
      );
    }
  }, [
    localParticipant,
    activeHuddle,
    updateMuteStatus,
    setIsMuted,
    setError,
    isRoomConnected,
  ]);

  const liveKitToggleVideo = useCallback(async () => {
    if (!localParticipant.localParticipant || !isRoomConnected) {
      console.warn("Cannot toggle video: room not connected");
      return;
    }

    const newVideoEnabled = !localParticipant.cameraTrack;
    await localParticipant.localParticipant.setCameraEnabled(newVideoEnabled);
    setIsVideoEnabled(newVideoEnabled);
  }, [localParticipant, setIsVideoEnabled, isRoomConnected]);

  const liveKitToggleScreenShare = useCallback(async () => {
    if (!localParticipant.localParticipant || !isRoomConnected) {
      console.warn("Cannot toggle screen share: room not connected");
      return;
    }

    const currentlySharing = !!liveKitScreenStream;
    if (currentlySharing) {
      // Stop screen sharing
      playHuddleSound("screen_sharing_stop");
      await localParticipant.localParticipant.setScreenShareEnabled(false);
      setIsScreenSharing(false);
    } else {
      // Start screen sharing
      try {
        await localParticipant.localParticipant.setScreenShareEnabled(true);
        playHuddleSound("screen_sharing_start");
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Error starting screen share:", err);
        setError(err as Error);
      }
    }
  }, [
    localParticipant,
    liveKitScreenStream,
    setIsScreenSharing,
    setError,
    isRoomConnected,
  ]);

  // Determine who is sharing screen (local or remote)
  const screenSharingMemberId = useMemo(() => {
    // Check if local user is sharing
    if (liveKitScreenStream && currentMemberId) {
      return currentMemberId;
    }
    // Check if any remote participant is sharing
    if (liveKitRemoteScreenShares.size > 0) {
      // Return the first remote participant who is sharing
      return liveKitRemoteScreenShares.keys().next().value || null;
    }
    return null;
  }, [liveKitScreenStream, liveKitRemoteScreenShares, currentMemberId]);

  const value: HuddleMediaContextValue = {
    localStream: liveKitLocalStream,
    screenStream: liveKitScreenStream,
    remoteStreams: liveKitRemoteStreams,
    remoteScreenShares: liveKitRemoteScreenShares,
    screenSharingMemberId,
    isAudioEnabled: true, // LiveKit always has audio capability
    isVideoEnabled: !!localParticipant.cameraTrack,
    isScreenSharing:
      !!liveKitScreenStream || liveKitRemoteScreenShares.size > 0,
    isMuted: localParticipant.isMicrophoneEnabled === false,
    isConnecting,
    toggleAudio: liveKitToggleAudio,
    toggleVideo: liveKitToggleVideo,
    toggleScreenShare: liveKitToggleScreenShare,
    initializeMedia: async () => {
      // LiveKit handles initialization automatically
    },
    cleanup: () => {
      // LiveKit handles cleanup automatically
    },
    isLoading: tokenLoading,
    error,
    participantsMuteStatus, // Already in the correct format
  };

  return (
    <HuddleMediaContext.Provider value={value}>
      {roomChildren}
    </HuddleMediaContext.Provider>
  );
}

/**
 * Provider component that manages media streams (audio, video, screen sharing)
 * Phase 2: Now uses LiveKit for real-time communication
 * Replaces custom WebRTC implementation with LiveKit
 */
export function HuddleMediaProvider({
  children,
  enabled,
}: HuddleMediaProviderProps) {
  const workspaceId = useWorkspaceId();

  const { data: activeHuddle } = useGetHuddleByCurrentUser({ workspaceId });
  const { data: currentMember } = useCurrentMember({
    workspaceId: workspaceId || ("" as Id<"workspaces">),
  });

  const isHuddleActive = Boolean(activeHuddle && enabled);

  // Phase 3: Generate LiveKit room name from huddle scope
  // Room name is scoped to either channelId (channel huddles) or conversationId (DM huddles)
  const roomName = useMemo(() => {
    if (!activeHuddle) return null;

    // Validate huddle has proper scope
    const hasChannelScope = Boolean(activeHuddle.channelId);
    const hasConversationScope = Boolean(activeHuddle.conversationId);

    // A huddle should have exactly one scope based on sourceType
    if (activeHuddle.sourceType === "channel" && !hasChannelScope) {
      console.error("Channel huddle missing channelId", activeHuddle);
      return null;
    }
    if (activeHuddle.sourceType === "dm" && !hasConversationScope) {
      console.error("DM huddle missing conversationId", activeHuddle);
      return null;
    }

    // Generate room name from scope
    const name = getLiveKitRoomName(
      activeHuddle.channelId || null,
      activeHuddle.conversationId || null
    );

    if (!name) {
      console.error("Failed to generate room name for huddle", activeHuddle);
    }

    return name;
  }, [activeHuddle]);

  // Phase 4: Get LiveKit token and server URL from API
  // Token includes participant identity (memberId) and room permissions
  const {
    token,
    serverUrl,
    isLoading: tokenLoading,
    error: tokenError,
  } = useLiveKitToken({
    roomName: roomName || "",
    enabled: isHuddleActive && Boolean(currentMember?._id),
    participantIdentity: currentMember?._id || null,
  });
  // Audio settings
  const { settings } = useHuddleAudioSettings();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const isAudioEnabled = true;
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(settings.startMuted); // Initialize with setting
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Update mute status API
  const { mutate: updateMuteStatus } = useUpdateMuteStatus();

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Web Audio API pipeline for gain control
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamDestinationRef =
    useRef<MediaStreamAudioDestinationNode | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const rawAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const micGainRef = useRef(settings.micGain);
  const echoCancellationRef = useRef(settings.echoCancellation);
  const noiseSuppressionRef = useRef(settings.noiseSuppression);
  const autoGainControlRef = useRef(settings.autoGainControl);

  // Keep refs in sync with settings
  useEffect(() => {
    echoCancellationRef.current = settings.echoCancellation;
    noiseSuppressionRef.current = settings.noiseSuppression;
    autoGainControlRef.current = settings.autoGainControl;
  }, [
    settings.echoCancellation,
    settings.noiseSuppression,
    settings.autoGainControl,
  ]);

  // Get media constraints with audio processing settings
  const getMediaConstraints = useCallback(
    (audio: boolean, video: boolean): MediaStreamConstraints => {
      return {
        audio: audio
          ? {
              deviceId: settings.selectedMicId
                ? { exact: settings.selectedMicId }
                : undefined,
              echoCancellation: { ideal: echoCancellationRef.current },
              noiseSuppression: { ideal: noiseSuppressionRef.current },
              autoGainControl: { ideal: autoGainControlRef.current },
              // Chrome/Chromium experimental constraints for enhanced audio processing
              // @ts-expect-error - Experimental Chrome constraints
              googEchoCancellation: echoCancellationRef.current,
              googNoiseSuppression: noiseSuppressionRef.current,
              googAutoGainControl: autoGainControlRef.current,
              googHighpassFilter: true, // Removes low-frequency noise
              googTypingNoiseDetection: true, // Suppresses typing noise
              googNoiseSuppression2: noiseSuppressionRef.current, // Enhanced noise suppression
            }
          : false,
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
            }
          : false,
      };
    },
    [settings.selectedMicId]
  );

  // Apply Web Audio API gain control to mic stream
  const applyGainControl = useCallback(
    (rawStream: MediaStream): MediaStream => {
      try {
        // Create or reuse AudioContext
        const AudioContextClass = getAudioContextConstructor();
        if (!AudioContextClass) {
          console.warn("AudioContext not supported, using raw stream");
          return rawStream;
        }

        // Create new AudioContext if needed
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }

        const audioContext = audioContextRef.current;

        // Resume if suspended (required by some browsers) - do this FIRST
        if (audioContext.state === "suspended") {
          audioContext.resume().catch((err) => {
            console.warn("Failed to resume AudioContext:", err);
          });
        }

        // Clean up existing pipeline if source exists
        // Note: You can only create one MediaStreamAudioSourceNode per MediaStream
        if (mediaStreamSourceRef.current) {
          try {
            mediaStreamSourceRef.current.disconnect();
          } catch (err) {
            // Source might already be disconnected
            console.warn("Error disconnecting source:", err);
          }
          mediaStreamSourceRef.current = null;
        }

        // Create gain node if needed
        if (!gainNodeRef.current) {
          gainNodeRef.current = audioContext.createGain();
        }

        const gainNode = gainNodeRef.current;
        gainNode.gain.value = micGainRef.current;

        // Create destination for processed stream (reuse if exists)
        if (!mediaStreamDestinationRef.current) {
          mediaStreamDestinationRef.current =
            audioContext.createMediaStreamDestination();
        }

        const destination = mediaStreamDestinationRef.current;

        // Ensure gain node is connected to destination (in case it was disconnected)
        try {
          gainNode.disconnect();
        } catch {
          // Might not be connected
        }
        gainNode.connect(destination);

        // Create source from raw stream
        // IMPORTANT: You can only create one MediaStreamAudioSourceNode per MediaStream
        // So we create it fresh each time (the old one is disconnected above)
        const source = audioContext.createMediaStreamSource(rawStream);
        mediaStreamSourceRef.current = source;

        // Connect: Source -> GainNode (which is already connected to Destination)
        source.connect(gainNode);

        // Get processed stream (audio only)
        const processedAudioStream = destination.stream;

        // Ensure audio tracks are enabled
        processedAudioStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });

        // Combine with video tracks from raw stream if any
        const videoTracks = rawStream.getVideoTracks();
        const processedStream = new MediaStream([
          ...processedAudioStream.getAudioTracks(),
          ...videoTracks,
        ]);

        // Ensure all tracks in the final stream are enabled
        processedStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });

        // Verify the processed stream has active audio tracks
        const audioTracks = processedStream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.warn(
            "Processed stream has no audio tracks, using raw stream"
          );
          return rawStream;
        }

        console.log("Applied gain control:", {
          rawAudioTracks: rawStream.getAudioTracks().length,
          processedAudioTracks: audioTracks.length,
          audioContextState: audioContext.state,
          gainValue: gainNode.gain.value,
        });

        processedStreamRef.current = processedStream;
        return processedStream;
      } catch (error) {
        console.error("Error applying gain control:", error);
        return rawStream; // Fallback to raw stream
      }
    },
    []
  );

  // Update gain when settings change
  useEffect(() => {
    micGainRef.current = settings.micGain;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = settings.micGain;
    }
  }, [settings.micGain]);

  // Initialize media stream
  const initializeMedia = useCallback(
    async (force: boolean = false) => {
      if (!force && localStreamRef.current) {
        return; // Already initialized, skip unless forced
      }

      setIsLoading(true);
      setError(null);

      try {
        // Stop old stream if reinitializing
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }
        if (rawAudioTrackRef.current) {
          rawAudioTrackRef.current.stop();
          rawAudioTrackRef.current = null;
        }

        // Clean up audio processing pipeline when reinitializing
        // This is crucial when switching devices - we need a fresh destination
        if (mediaStreamSourceRef.current) {
          try {
            mediaStreamSourceRef.current.disconnect();
          } catch (err) {
            console.warn("Error disconnecting source during cleanup:", err);
          }
          mediaStreamSourceRef.current = null;
        }
        if (mediaStreamDestinationRef.current) {
          try {
            mediaStreamDestinationRef.current.disconnect();
          } catch (err) {
            console.warn(
              "Error disconnecting destination during cleanup:",
              err
            );
          }
          mediaStreamDestinationRef.current = null;
        }
        if (processedStreamRef.current) {
          processedStreamRef.current
            .getTracks()
            .forEach((track) => track.stop());
          processedStreamRef.current = null;
        }

        // WebRTC getUserMedia removed - will be replaced with LiveKit in Phase 2
        // For now, set empty stream to maintain interface compatibility
        localStreamRef.current = null;
        setLocalStream(null);
      } catch (err) {
        const error = err as Error;
        setError(error);
        console.error("Error initializing media:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [isAudioEnabled, isVideoEnabled, getMediaConstraints, applyGainControl]
  );

  // Phase 5: Media Controls - Use LiveKit APIs only
  // These are fallback implementations when not connected to LiveKit
  // When connected, LiveKitMediaProviderInner provides the actual LiveKit implementations

  // Toggle audio (fallback - LiveKit version is in LiveKitMediaProviderInner)
  // This is used when not connected to LiveKit (token loading, connection failed, etc.)
  const toggleAudio = useCallback(() => {
    // Phase 5: When not connected to LiveKit, just update state
    // Note: This won't actually control the mic until connected to LiveKit
    const newMuted = !isMuted;
    setIsMuted(newMuted);

    console.log("Toggle audio (fallback - not connected to LiveKit):", {
      currentMuted: isMuted,
      newMuted,
      isHuddleActive,
      hasToken: !!token,
    });

    // Update backend mute status
    if (activeHuddle) {
      updateMuteStatus({
        huddleId: activeHuddle._id,
        isMuted: newMuted,
      }).catch((err) => {
        console.error("Failed to update mute status:", err);
      });
    }
  }, [isMuted, activeHuddle, updateMuteStatus, isHuddleActive, token]);

  // Toggle video (fallback - LiveKit version is in LiveKitMediaProviderInner)
  const toggleVideo = useCallback(async () => {
    // Phase 5: When not connected to LiveKit, just update state
    // LiveKit handles actual camera control when connected
    setIsVideoEnabled(!isVideoEnabled);
  }, [isVideoEnabled]);

  // Toggle screen sharing (fallback - LiveKit version is in LiveKitMediaProviderInner)
  const toggleScreenShare = useCallback(async () => {
    // Phase 5: When not connected to LiveKit, just update state
    // LiveKit handles actual screen share control when connected
    if (isScreenSharing) {
      playHuddleSound("screen_sharing_stop");
      setIsScreenSharing(false);
    } else {
      playHuddleSound("screen_sharing_start");
      setIsScreenSharing(true);
    }
  }, [isScreenSharing]);

  // Cleanup
  const cleanup = useCallback(() => {
    // Clean up Web Audio API pipeline
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (mediaStreamDestinationRef.current) {
      mediaStreamDestinationRef.current.disconnect();
      mediaStreamDestinationRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach((track) => track.stop());
      processedStreamRef.current = null;
    }

    if (rawAudioTrackRef.current) {
      rawAudioTrackRef.current.stop();
      rawAudioTrackRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }

    setIsScreenSharing(false);
    setIsMuted(false);
    setError(null);
  }, []);

  // Reinitialize media when the selected microphone changes (requires new stream)
  useEffect(() => {
    if (enabled && localStreamRef.current && isAudioEnabled) {
      initializeMedia(true);
    }
  }, [enabled, isAudioEnabled, settings.selectedMicId, initializeMedia]);

  // Apply new audio processing constraints without recreating the entire stream
  const updateAudioTrackConstraints = useCallback(async () => {
    if (!rawAudioTrackRef.current || !isAudioEnabled) return;

    const audioTrack = rawAudioTrackRef.current;

    try {
      await audioTrack.applyConstraints({
        echoCancellation: { ideal: settings.echoCancellation },
        noiseSuppression: { ideal: settings.noiseSuppression },
        autoGainControl: { ideal: settings.autoGainControl },
        // Chrome/Chromium experimental constraints for enhanced audio processing
        // @ts-expect-error - Experimental Chrome constraints
        googEchoCancellation: settings.echoCancellation,
        googNoiseSuppression: settings.noiseSuppression,
        googAutoGainControl: settings.autoGainControl,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
        googNoiseSuppression2: settings.noiseSuppression,
      });
      console.log("Applied enhanced audio constraints:", {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      });
    } catch (err) {
      console.warn("Failed to apply updated audio constraints:", err);
    }
  }, [
    isAudioEnabled,
    settings.echoCancellation,
    settings.noiseSuppression,
    settings.autoGainControl,
  ]);

  useEffect(() => {
    updateAudioTrackConstraints();
  }, [updateAudioTrackConstraints]);

  // Initialize media when enabled
  useEffect(() => {
    if (enabled) {
      initializeMedia();
    } else {
      cleanup();
    }

    return () => {
      if (!enabled) {
        cleanup();
      }
    };
  }, [enabled, initializeMedia, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Phase 4: Join/Leave Logic
  // Join huddle: Connect via LiveKitRoom when token is available
  // Leave huddle: Disconnect when huddle becomes inactive (handled by LiveKitRoom)
  // Reconnects: Handled automatically by LiveKitRoom

  // Combine token errors with other errors
  useEffect(() => {
    if (tokenError) {
      setError(tokenError);
    }
  }, [tokenError]);

  // Phase 4: Reconnection is handled automatically by LiveKitRoom
  // When token refreshes or connection drops, LiveKitRoom will attempt to reconnect

  // Wrap children with LiveKitRoom if huddle is active and token is available
  if (isHuddleActive && roomName && token && serverUrl) {
    return (
      <LiveKitRoomWrapper
        roomName={roomName}
        token={token}
        serverUrl={serverUrl}
        enabled={isHuddleActive}
        onConnected={() => {
          // Phase 4: Join successful - LiveKit handles track initialization
          setError(null);
          console.log("Joined LiveKit room:", roomName);
        }}
        onDisconnected={() => {
          // Phase 4: Leave/Disconnect - LiveKit handles cleanup
          console.log("Disconnected from LiveKit room:", roomName);
          // Cleanup local state
          setLocalStream(null);
          setScreenStream(null);
          setIsScreenSharing(false);
        }}
        onError={(err) => {
          // Filter out non-critical DataChannel errors
          // These are warnings from LiveKit's internal WebRTC DataChannel and don't affect functionality
          const errorMessage = err.message || err.toString();
          const isDataChannelError = 
            errorMessage.includes("DataChannel") || 
            errorMessage.includes("dataChannel") ||
            errorMessage.includes("reliable");
          
          if (isDataChannelError) {
            // Log as warning instead of error - these are non-critical
            console.warn("LiveKit DataChannel warning (non-critical):", err);
            return; // Don't set as error state
          }
          
          // For other errors, handle normally
          setError(err);
          console.error("LiveKit connection error:", err);
          // LiveKitRoom will handle reconnection automatically
        }}
      >
        <LiveKitMediaProviderInner
          activeHuddle={activeHuddle}
          updateMuteStatus={updateMuteStatus}
          setLocalStream={setLocalStream}
          setScreenStream={setScreenStream}
          setIsScreenSharing={setIsScreenSharing}
          setIsMuted={setIsMuted}
          setIsVideoEnabled={setIsVideoEnabled}
          setError={setError}
          tokenLoading={tokenLoading}
          error={error}
          currentMemberId={currentMember?._id || null}
        >
          {children}
        </LiveKitMediaProviderInner>
      </LiveKitRoomWrapper>
    );
  }

  // Fallback: provide context without LiveKit when not connected
  // This happens when:
  // - Huddle is not active
  // - Token is still loading
  // - Token fetch failed
  const value: HuddleMediaContextValue = {
    localStream,
    screenStream,
    remoteStreams: new Map<Id<"members">, MediaStream>(),
    remoteScreenShares: new Map<Id<"members">, MediaStream>(),
    screenSharingMemberId:
      isScreenSharing && currentMember?._id ? currentMember._id : null,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    isMuted,
    isConnecting: tokenLoading || (isHuddleActive && !token),
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    initializeMedia,
    cleanup,
    isLoading: tokenLoading,
    error: tokenError || error,
    participantsMuteStatus: new Map(), // Empty when not connected
  };

  return (
    <HuddleMediaContext.Provider value={value}>
      {children}
    </HuddleMediaContext.Provider>
  );
}

export function useHuddleMedia() {
  const context = useContext(HuddleMediaContext);
  if (context === undefined) {
    // Return default values when not in provider (for settings dialog rendered globally)
    return {
      localStream: null,
      screenStream: null,
      remoteStreams: new Map(),
      remoteScreenShares: new Map(),
      screenSharingMemberId: null,
      isAudioEnabled: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      isMuted: false,
      isConnecting: false,
      toggleAudio: () => {},
      toggleVideo: () => {},
      toggleScreenShare: async () => {},
      initializeMedia: async () => {},
      cleanup: () => {},
      isLoading: false,
      error: null,
      participantsMuteStatus: new Map(), // Empty when not in provider
    };
  }
  return context;
}
