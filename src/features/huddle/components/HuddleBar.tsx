"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLeaveHuddle } from "../api/use-leave-huddle";
import { useStartHuddle } from "../api/use-start-huddle";
import { useHuddleMedia } from "./HuddleMediaProvider";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { useActiveSpeaker } from "../hooks/use-active-speaker";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { useSettingsModal } from "@/store/use-settings-modal";
import {
  Headphones,
  Minimize2,
  Maximize2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Music,
  ChevronDown,
  Square,
  UserPlus,
  PhoneOff,
  Settings,
  Phone,
  Loader2,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { useJoinHuddle } from "../api/use-join-huddle";
import { useGetHuddleByCurrentUser } from "../api/use-get-huddle-by-current-user";

/**
 * Shared data type for HuddleBar and HuddleDialog
 */
export interface HuddleSharedData {
  workspaceId: Id<"workspaces">;
  currentMember: Doc<"members"> | undefined;
  channel: Doc<"channels"> | undefined;
  member: Doc<"members"> | undefined;
  activeHuddle:
    | {
        _id: Id<"huddles">;
        workspaceId: Id<"workspaces">;
        sourceType: "channel" | "dm";
        channelId: Id<"channels"> | undefined;
        conversationId: Id<"conversations"> | undefined;
        createdBy: Id<"members">;
        isActive: boolean;
        createdAt: number;
        startedAt: number;
        endedAt: number | undefined;
        duration: number;
        hungup?: boolean;
      }
    | undefined;
  effectiveHuddleId: Id<"huddles"> | null;
  isHuddleActive: boolean;
  huddleTitle: string;
  displayParticipants: Array<{
    id: Id<"members">;
    name: string;
    image?: string;
    isYou: boolean;
    role: "host" | "participant";
    isMuted: boolean;
    status?: "waiting" | "joined" | "left";
  }>;
  disconnectedHuddle: {
    _id: Id<"huddles">;
    workspaceId: Id<"workspaces">;
    sourceType: "channel" | "dm";
    channelId: Id<"channels"> | undefined;
    conversationId: Id<"conversations"> | undefined;
    otherMemberId?: Id<"members">;
    createdBy: Id<"members">;
    isActive: boolean;
    createdAt: number;
    startedAt: number;
    endedAt: number | undefined;
    duration: number;
    myRole: "host" | "participant";
    hungup?: boolean;
  } | null;
  isDialogOpen: boolean;
  onToggleDialog: () => void;
}

/**
 * HuddleBar Component
 *
 * Presentational component that displays huddle controls in the sidebar.
 * Receives all data from parent HuddleCall component.
 *
 * PHASE 3: WebRTC Integration
 * - Real-time audio/video using simple-peer (P2P mesh)
 * - Media controls (mute, video, screen share)
 * - Convex signaling for WebRTC
 */

interface HuddleBarProps {
  sharedData: HuddleSharedData;
}

export function HuddleBar({ sharedData }: HuddleBarProps) {
  const {
    workspaceId,
    currentMember,
    effectiveHuddleId,
    isHuddleActive,
    huddleTitle,
    displayParticipants,
    disconnectedHuddle,
    isDialogOpen,
    onToggleDialog,
  } = sharedData;

  const { mutate: leaveHuddle } = useLeaveHuddle();
  const [, , openSettings] = useSettingsModal();
  const { settings } = useHuddleAudioSettings();
  const { data: activeHuddle } = useGetHuddleByCurrentUser({ workspaceId });
  const { mutate: startHuddle } = useStartHuddle();
  const { mutate: joinHuddle } = useJoinHuddle();

  // Debug: Log disconnected huddle state
  useEffect(() => {
    console.log("🔄 HuddleBar state:", {
      disconnectedHuddle,
      disconnectedHuddleId: disconnectedHuddle?._id,
      currentHuddleId: effectiveHuddleId,
      shouldShowBanner: !!disconnectedHuddle && !effectiveHuddleId,
      hasDisconnectedHuddle: !!disconnectedHuddle,
    });
  }, [disconnectedHuddle, effectiveHuddleId]);

  // Media controls
  const {
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    remoteStreams,
    localStream,
    cleanup,
  } = useHuddleMedia();

  // Active speaker detection
  const activeSpeakerId = useActiveSpeaker({
    isHuddleActive,
    localStream,
    remoteStreams,
    currentMemberId: currentMember?._id || null,
  });

  // Hidden audio elements for remote streams (to play audio even when dialog is closed)
  const remoteAudioRefs = useRef<Map<Id<"members">, HTMLAudioElement>>(
    new Map()
  );
  const playingRefs = useRef<Map<Id<"members">, boolean>>(new Map());

  // Update remote audio elements to play audio even when dialog is closed
  useEffect(() => {
    if (!isHuddleActive) return;

    remoteStreams.forEach((stream, memberId) => {
      let audioElement = remoteAudioRefs.current.get(memberId);

      if (!audioElement) {
        // Create hidden audio element
        audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        audioElement.style.display = "none";
        document.body.appendChild(audioElement);
        remoteAudioRefs.current.set(memberId, audioElement);
      }

      // Ensure audio tracks are enabled
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track: MediaStreamTrack) => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });

      // Update srcObject if different
      if (audioElement.srcObject !== stream) {
        audioElement.srcObject = stream;
      }

      audioElement.muted = false;
      audioElement.volume = settings.outputVolume;

      // Set speaker output device (sinkId)
      if (settings.selectedSpeakerId && "setSinkId" in audioElement) {
        (
          audioElement as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(settings.selectedSpeakerId)
          .catch((err) => {
            console.warn(`Failed to set speaker device for ${memberId}:`, err);
          });
      }

      // Play if not already playing
      const isPlaying = playingRefs.current.get(memberId);
      if (!isPlaying && audioElement.readyState >= 2) {
        playingRefs.current.set(memberId, true);
        audioElement
          .play()
          .then(() => {
            console.log(`Playing audio for ${memberId} in HuddleBar`);
          })
          .catch((err) => {
            playingRefs.current.set(memberId, false);
            if (
              !err.message.includes("interrupted") &&
              !err.message.includes("AbortError")
            ) {
              console.error(`Error playing audio for ${memberId}:`, err);
            }
          });
      }
    });

    // Clean up audio elements for removed streams
    const currentMemberIds = new Set(remoteStreams.keys());
    remoteAudioRefs.current.forEach((audioElement, memberId) => {
      if (!currentMemberIds.has(memberId)) {
        audioElement.remove();
        remoteAudioRefs.current.delete(memberId);
        playingRefs.current.delete(memberId);
      }
    });
  }, [
    remoteStreams,
    isHuddleActive,
    settings.outputVolume,
    settings.selectedSpeakerId,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    const audioRefs = remoteAudioRefs.current;
    const playingStates = playingRefs.current;
    return () => {
      audioRefs.forEach((audioElement) => {
        audioElement.remove();
      });
      audioRefs.clear();
      playingStates.clear();
    };
  }, []);

  // Don't render anything when huddle is not active
  if (!isHuddleActive) {
    return null;
  }

  // Show reconnect UI if there's a disconnected active huddle
  // Check: we have a disconnected huddle but it's not the same as our current one
  // or we don't have a current huddle
  const shouldShowReconnectBanner =
    disconnectedHuddle &&
    (!effectiveHuddleId || disconnectedHuddle._id !== effectiveHuddleId);

  console.log("🎯 Banner decision:", {
    disconnectedHuddle: disconnectedHuddle?._id,
    effectiveHuddleId,
    shouldShow: shouldShowReconnectBanner,
  });

  if (shouldShowReconnectBanner) {
    const handleReconnect = () => {
      if (!workspaceId || !disconnectedHuddle.otherMemberId) return;

      if (activeHuddle?._id) {
        joinHuddle(
          {
            workspaceId,
            huddleId: activeHuddle._id,
          },
          {
            onSuccess: (huddleId) => {
              console.log("Reconnected to huddle:", huddleId);
              playHuddleSound("join");
              // Huddle reconnected - dialog state will be managed by HuddleCall
              console.log("Huddle reconnected:", huddleId);
            },
            onError: (error) => {
              console.error("Failed to reconnect:", error);
            },
          }
        );
      } else {
        startHuddle(
          {
            workspaceId,
            sourceType: "dm",
            sourceId: disconnectedHuddle.otherMemberId!,
            startMuted: settings.startMuted,
          },
          {
            onSuccess: (huddleId) => {
              console.log("Reconnected to huddle:", huddleId);
              playHuddleSound("join");
              // Huddle reconnected - dialog state will be managed by HuddleCall
              console.log("Huddle reconnected:", huddleId);
            },
            onError: (error) => {
              console.error("Failed to reconnect:", error);
            },
          }
        );
      }
    };

    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#5E2C5F] text-white shadow-2xl border-t-2 border-[#4A1C4F]">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-3 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                Active huddle in progress
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReconnect}
                className="bg-white/10 hover:bg-white/20 text-white"
              >
                <Phone className="size-4 mr-2" />
                Rejoin Huddle
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleToggleDialog = () => {
    onToggleDialog();
  };

  const handleLeave = () => {
    // Cleanup WebRTC connections
    cleanup();
    // Play hangup sound
    playHuddleSound("hangup");
    const huddleIdToLeave = effectiveHuddleId;
    if (huddleIdToLeave) {
      leaveHuddle(huddleIdToLeave, {
        onSuccess: () => {
          // Huddle left - state will be updated by HuddleCall when huddle data changes
          console.log("Huddle left successfully");
        },
      });
    }
  };

  return (
    <div className="bg-[#5E2C5F] flex flex-col">
      {/* Header with headphones icon, title, and window controls */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#481349]">
        <div className="flex items-center gap-2 text-white">
          <Headphones className="size-4" />
          <span className="text-sm font-medium">{huddleTitle}</span>
        </div>
        <button
          onClick={handleToggleDialog}
          className="text-white hover:bg-white/10 rounded p-1 transition-colors"
          aria-label={isDialogOpen ? "Minimize" : "Restore"}
          title={isDialogOpen ? "Minimize" : "Restore"}
        >
          {isDialogOpen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </button>
      </div>

      {/* Participant display area with gradient background */}
      <div
        className="mx-2 my-2 px-3 py-4 bg-linear-to-r from-pink-400 via-yellow-300 to-blue-300 rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
        onClick={handleToggleDialog}
      >
        <div className="flex items-center justify-center gap-2.5">
          {displayParticipants.map((participant) => {
            const isActiveSpeaker = activeSpeakerId === participant.id;
            const isWaiting = participant.status === "waiting";
            return (
              <div key={participant.id} className="relative">
                <Avatar
                  className={`size-12 rounded-lg shadow-md ${
                    isActiveSpeaker ? "ring-2 ring-[#5E2C5F]" : ""
                  } ${isWaiting ? "opacity-50" : ""}`}
                  title={
                    participant.name +
                    (participant.role === "host" ? " (Host)" : "") +
                    (isActiveSpeaker ? " (Speaking)" : "") +
                    (participant.isMuted ? " (Muted)" : "") +
                    (isWaiting ? " (Joining...)" : "")
                  }
                >
                  <AvatarImage
                    src={participant.image || undefined}
                    alt={participant.name}
                    className="rounded-lg"
                  />
                  <AvatarFallback className="rounded-lg bg-white text-xl font-bold text-gray-700">
                    {participant.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isWaiting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                    <Loader2 className="size-5 text-white animate-spin" />
                  </div>
                )}
                {participant.isMuted && !isWaiting && (
                  <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1">
                    <MicOff className="size-3 text-white" />
                  </div>
                )}
              </div>
            );
          })}
          {/* Add participant card */}
          {displayParticipants.length < 2 && (
            <div className="size-12 rounded-lg bg-white flex items-center justify-center shadow-md cursor-pointer hover:bg-gray-50 transition-colors">
              <UserPlus className="size-5 text-[#5E2C5F]" />
            </div>
          )}
        </div>
      </div>

      {/* Call controls section */}
      <div className="px-3 py-2.5 bg-[#5E2C5F] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Mic button */}
          <Button
            variant="ghost"
            size="icon"
            className={`size-9 rounded-full border-0 transition-all ${
              isMuted
                ? "bg-red-500/20 hover:bg-red-500/30 text-white"
                : "bg-black/20 hover:bg-black/30 text-white"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
            onClick={toggleAudio}
          >
            {isMuted ? (
              <MicOff className="size-4.5" />
            ) : (
              <Mic className="size-4.5" />
            )}
          </Button>

          {/* Video button */}
          <Button
            variant="ghost"
            size="icon"
            className={`size-9 rounded-full border-0 transition-all opacity-50 cursor-not-allowed ${
              !isVideoEnabled
                ? "bg-black/20 text-white"
                : "bg-green-500/20 text-white"
            }`}
            title="Video disabled"
            disabled
            onClick={toggleVideo}
          >
            {!isVideoEnabled ? (
              <VideoOff className="size-4.5" />
            ) : (
              <Video className="size-4.5" />
            )}
          </Button>

          {/* Screen share button */}
          <Button
            variant="ghost"
            size="icon"
            className={`size-9 rounded-full border-0 transition-all opacity-50 cursor-not-allowed ${
              isScreenSharing
                ? "bg-green-500/20 text-white"
                : "bg-black/20 text-white"
            }`}
            title="Screen sharing disabled"
            disabled
            onClick={toggleScreenShare}
          >
            <Monitor className="size-4.5" />
          </Button>

          {/* Settings button */}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full bg-black/20 hover:bg-black/30 text-white border-0"
            title="Audio Settings"
            onClick={() => openSettings("audio-video")}
          >
            <Settings className="size-4.5" />
          </Button>
        </div>

        {/* Leave button */}
        <Button
          onClick={handleLeave}
          className="size-9 rounded-full bg-red-500 hover:bg-red-600 text-white border-0 transition-all"
          title="Leave huddle"
          size="icon"
        >
          <PhoneOff className="size-4.5" />
        </Button>
      </div>

      {/* Music player control */}
      <div className="mx-2 mb-2 px-3 py-2 bg-gray-900 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Music className="size-3.5" />
          <span className="text-xs">Focus Beats</span>
          <ChevronDown className="size-3" />
        </div>
        <button
          className="text-white hover:bg-white/10 rounded p-0.5 transition-colors"
          aria-label="Stop music"
        >
          <Square className="size-3" />
        </button>
      </div>
    </div>
  );
}
