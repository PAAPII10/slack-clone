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
import { Id } from "../../../../convex/_generated/dataModel";
import { useWebRTC } from "../hooks/use-webrtc";
import { useHuddleState } from "../store/use-huddle-state";
import { useActiveHuddle } from "../api/use-active-huddle";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

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

const HuddleMediaContext = createContext<
  HuddleMediaContextValue | undefined
>(undefined);

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
  const effectiveHuddleId = huddleId || huddleState.currentHuddleId || activeHuddle?._id || null;
  const isHuddleActive = Boolean(effectiveHuddleId && enabled);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Get media constraints with noise cancellation
  const getMediaConstraints = useCallback(
    (audio: boolean, video: boolean): MediaStreamConstraints => {
      return {
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
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
    []
  );

  // Initialize media stream
  const initializeMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return; // Already initialized
    }

    setIsLoading(true);
    setError(null);

    try {
      const constraints = getMediaConstraints(isAudioEnabled, isVideoEnabled);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error("Error initializing media:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isAudioEnabled, isVideoEnabled, getMediaConstraints]);

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
  }, [isMuted]);

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
      setLocalStream(
        new MediaStream(localStreamRef.current.getTracks())
      );
    }
  }, [isVideoEnabled, getMediaConstraints]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
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
    throw new Error(
      "useHuddleMedia must be used within HuddleMediaProvider"
    );
  }
  return context;
}
