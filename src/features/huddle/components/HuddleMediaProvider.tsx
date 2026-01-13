"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWebRTC } from "../hooks/use-webrtc";
import { useHuddleState } from "../store/use-huddle-state";
import { useActiveHuddle } from "../api/use-active-huddle";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { getAudioContextConstructor } from "@/lib/audio-context-types";
import { useUpdateMuteStatus } from "../api/use-update-mute-status";

interface HuddleMediaContextValue {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<Id<"members">, MediaStream>;
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
}

const HuddleMediaContext = createContext<HuddleMediaContextValue | undefined>(
  undefined
);

interface HuddleMediaProviderProps {
  children: ReactNode;
  enabled: boolean;
  huddleId?: Id<"huddles"> | null;
}

/**
 * Provider component that manages media streams (audio, video, screen sharing)
 * Uses browser WebRTC constraints for noise cancellation
 * Also manages WebRTC peer connections for remote streams
 */
export function HuddleMediaProvider({
  children,
  enabled,
  huddleId,
}: HuddleMediaProviderProps) {
  const workspaceId = useWorkspaceId();
  const [huddleState] = useHuddleState();

  // Get active huddle if huddleId not provided
  const sourceId =
    huddleState.huddleSource === "channel"
      ? (huddleState.huddleSourceId as Id<"channels">)
      : huddleState.huddleSource === "dm"
      ? (huddleState.huddleSourceId as Id<"members">)
      : null;

  const { data: activeHuddle } = useActiveHuddle({
    workspaceId,
    sourceType: huddleState.huddleSource || "channel",
    sourceId: sourceId || ("" as Id<"channels">),
  });

  // Use provided huddleId, or currentHuddleId from state, or activeHuddle
  const effectiveHuddleId =
    huddleId || huddleState.currentHuddleId || activeHuddle?._id || null;
  const isHuddleActive = Boolean(effectiveHuddleId && enabled);
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

        const constraints = getMediaConstraints(isAudioEnabled, isVideoEnabled);
        const rawStream = await navigator.mediaDevices.getUserMedia(
          constraints
        );

        const rawAudioTrack = rawStream.getAudioTracks()[0] || null;
        if (rawAudioTrack) {
          rawAudioTrack.enabled = true;
          rawAudioTrackRef.current = rawAudioTrack;
        }

        // Apply Web Audio API gain control if audio is enabled
        let processedStream: MediaStream;
        if (isAudioEnabled) {
          try {
            processedStream = applyGainControl(rawStream);
            // Verify the processed stream is valid
            const processedAudioTracks = processedStream.getAudioTracks();
            if (processedAudioTracks.length === 0) {
              console.warn(
                "Processed stream has no audio tracks, using raw stream"
              );
              processedStream = rawStream;
            }
          } catch (error) {
            console.error(
              "Error applying gain control, using raw stream:",
              error
            );
            processedStream = rawStream;
          }
        } else {
          processedStream = rawStream;
        }

        // Ensure processed stream audio tracks are enabled
        processedStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });

        console.log("Initialized media stream:", {
          audioTracks: processedStream.getAudioTracks().length,
          videoTracks: processedStream.getVideoTracks().length,
          audioEnabled: processedStream
            .getAudioTracks()
            .filter((t: MediaStreamTrack) => t.enabled).length,
          usingGainControl: isAudioEnabled && processedStream !== rawStream,
        });

        localStreamRef.current = processedStream;
        setLocalStream(processedStream);
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

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) {
      setIsMuted(!isMuted);
      return;
    }

    const newMuted = !isMuted;
    setIsMuted(newMuted);

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !newMuted;
    });

    // Update backend mute status
    if (effectiveHuddleId) {
      updateMuteStatus({ huddleId: effectiveHuddleId, isMuted: newMuted }).catch((err) => {
        console.error("Failed to update mute status:", err);
      });
    }
  }, [isMuted, effectiveHuddleId, updateMuteStatus]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) {
      setIsVideoEnabled(!isVideoEnabled);
      return;
    }

    const newVideoEnabled = !isVideoEnabled;
    setIsVideoEnabled(newVideoEnabled);

    if (newVideoEnabled) {
      // Add video track
      try {
        const constraints = getMediaConstraints(false, true);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(videoTrack);
          setLocalStream(new MediaStream(localStreamRef.current));
        }
        stream.getTracks().forEach((track) => {
          if (track.kind !== "video") {
            track.stop();
          }
        });
      } catch (err) {
        console.error("Error enabling video:", err);
        setIsVideoEnabled(false);
      }
    } else {
      // Remove video track
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.stop();
        localStreamRef.current?.removeTrack(track);
      });
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    }
  }, [isVideoEnabled, getMediaConstraints]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      playHuddleSound("screen_sharing_stop");
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      setIsScreenSharing(false);

      // Restore video if it was enabled
      if (isVideoEnabled && localStreamRef.current) {
        try {
          const constraints = getMediaConstraints(false, true);
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack && localStreamRef.current) {
            localStreamRef.current.addTrack(videoTrack);
            setLocalStream(new MediaStream(localStreamRef.current));
          }
          stream.getTracks().forEach((track) => {
            if (track.kind !== "video") {
              track.stop();
            }
          });
        } catch (err) {
          console.error("Error restoring video:", err);
        }
      }
    } else {
      // Start screen sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            displaySurface: "monitor",
          } as MediaTrackConstraints,
          audio: true,
        });

        // Play screen sharing start sound
        playHuddleSound("screen_sharing_start");
        screenStreamRef.current = stream;
        setScreenStream(stream);

        // Replace video track in local stream with screen share
        if (localStreamRef.current) {
          const oldVideoTracks = localStreamRef.current.getVideoTracks();
          oldVideoTracks.forEach((track) => {
            track.stop();
            localStreamRef.current?.removeTrack(track);
          });

          const screenVideoTrack = stream.getVideoTracks()[0];
          if (screenVideoTrack && localStreamRef.current) {
            localStreamRef.current.addTrack(screenVideoTrack);
            setLocalStream(new MediaStream(localStreamRef.current));
          }
        }

        setIsScreenSharing(true);

        // Handle screen share end (user clicks stop in browser UI)
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          toggleScreenShare();
        });
      } catch (err) {
        console.error("Error starting screen share:", err);
        setError(err as Error);
      }
    }
  }, [isScreenSharing, isVideoEnabled, getMediaConstraints]);

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

  // WebRTC connections - managed here so both HuddleBar and HuddleDialog share the same connections
  const { remoteStreams, isConnecting } = useWebRTC({
    huddleId: effectiveHuddleId,
    localStream,
    enabled: isHuddleActive && !!effectiveHuddleId,
  });

  const value: HuddleMediaContextValue = {
    localStream,
    screenStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    isMuted,
    isConnecting,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    initializeMedia,
    cleanup,
    isLoading,
    error,
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
    };
  }
  return context;
}
