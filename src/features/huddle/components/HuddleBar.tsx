"use client";

import { Button } from "@/components/ui/button";
import { useHuddleState } from "../store/use-huddle-state";
import { HuddleDialog } from "./HuddleDialog";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { useGetMember } from "@/features/members/api/use-get-member";
import { getUserDisplayName } from "@/lib/user-utils";
import { useActiveHuddle } from "../api/use-active-huddle";
import { useHuddleParticipants } from "../api/use-huddle-participants";
import { useLeaveHuddle } from "../api/use-leave-huddle";
import { HuddleMediaProvider, useHuddleMedia } from "./HuddleMediaProvider";
import {
  Headphones,
  Minimize2,
  Maximize2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MoreVertical,
  Music,
  ChevronDown,
  Square,
  UserPlus,
  PhoneOff,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useMemo, useEffect, useRef } from "react";

/**
 * HuddleBar Component
 *
 * Shows huddle participants in sidebar when active
 * Shows nothing when inactive
 *
 * PHASE 3: WebRTC Integration
 * - Real-time audio/video using simple-peer (P2P mesh)
 * - Media controls (mute, video, screen share)
 * - Convex signaling for WebRTC
 */

// Inner component that uses media hooks
function HuddleBarContent() {
  const [huddleState, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { mutate: leaveHuddle } = useLeaveHuddle();

  // Media controls
  const {
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
  } = useHuddleMedia();

  // Get source information
  const channelIdForQuery =
    huddleState.huddleSource === "channel" && huddleState.huddleSourceId
      ? (huddleState.huddleSourceId as Id<"channels">)
      : ("" as Id<"channels">);
  const memberIdForQuery =
    huddleState.huddleSource === "dm" && huddleState.huddleSourceId
      ? (huddleState.huddleSourceId as Id<"members">)
      : ("" as Id<"members">);

  const { data: channel } = useGetChannel({ id: channelIdForQuery });
  const { data: member } = useGetMember({ id: memberIdForQuery });

  // Get active huddle from Convex
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

  // Use currentHuddleId from state if available (for immediate updates after join)
  const effectiveHuddleId = huddleState.currentHuddleId || activeHuddle?._id || null;

  // Get participants
  const { data: participants } = useHuddleParticipants({
    huddleId: effectiveHuddleId,
  });

  // Determine huddle title
  const huddleTitle =
    huddleState.huddleSource === "channel"
      ? channel?.name || "Channel"
      : huddleState.huddleSource === "dm"
      ? getUserDisplayName(member?.user || {})
      : "Huddle";

  // Check if huddle is actually active (from Convex or state)
  const isHuddleActive = huddleState.currentHuddleId ? true : (activeHuddle?.isActive ?? false);

  // Get remote streams from media provider (WebRTC is managed there)
  const { remoteStreams } = useHuddleMedia();

  // Hidden audio elements for remote streams (to play audio even when dialog is closed)
  const remoteAudioRefs = useRef<Map<Id<"members">, HTMLAudioElement>>(new Map());
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
      audioTracks.forEach((track) => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });

      // Update srcObject if different
      if (audioElement.srcObject !== stream) {
        audioElement.srcObject = stream;
      }

      audioElement.muted = false;
      audioElement.volume = 1.0;

      // Play if not already playing
      const isPlaying = playingRefs.current.get(memberId);
      if (!isPlaying && audioElement.readyState >= 2) {
        playingRefs.current.set(memberId, true);
        audioElement.play().then(() => {
          console.log(`Playing audio for ${memberId} in HuddleBar`);
        }).catch((err) => {
          playingRefs.current.set(memberId, false);
          if (!err.message.includes("interrupted") && !err.message.includes("AbortError")) {
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
  }, [remoteStreams, isHuddleActive]);

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

  // Process participants for display (must be before any early returns)
  const displayParticipants = useMemo(() => {
    if (!participants || !currentMember) return [];
    return participants.map((p) => ({
      id: p.memberId,
      name: getUserDisplayName(p.user),
      isYou: p.memberId === currentMember._id,
      role: p.role,
    }));
  }, [participants, currentMember]);

  // Don't show anything when huddle is not active
  if (!isHuddleActive) {
    return (
      <>
        <HuddleDialog
          open={huddleState.isHuddleOpen}
          onOpenChange={(open) =>
            setHuddleState((prev) => ({ ...prev, isHuddleOpen: open }))
          }
        />
      </>
    );
  }

  const handleToggleDialog = () => {
    setHuddleState((prev) => ({
      ...prev,
      isHuddleOpen: !prev.isHuddleOpen,
    }));
  };

  const handleLeave = () => {
    const huddleIdToLeave = effectiveHuddleId;
    if (huddleIdToLeave) {
      leaveHuddle(huddleIdToLeave, {
        onSuccess: () => {
          setHuddleState((prev) => ({
            ...prev,
            isHuddleActive: false,
            isHuddleOpen: false,
            currentHuddleId: null,
          }));
        },
      });
    } else {
      // Fallback: just update local state
      setHuddleState((prev) => ({
        ...prev,
        isHuddleActive: false,
        isHuddleOpen: false,
        currentHuddleId: null,
      }));
    }
  };

  const handleCloseDialog = (open: boolean) => {
    setHuddleState((prev) => ({
      ...prev,
      isHuddleOpen: open,
    }));
  };

  return (
    <>
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
            aria-label={huddleState.isHuddleOpen ? "Minimize" : "Restore"}
            title={huddleState.isHuddleOpen ? "Minimize" : "Restore"}
          >
            {huddleState.isHuddleOpen ? (
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
            {displayParticipants.map((participant) => (
              <div
                key={participant.id}
                className="size-12 rounded-lg bg-white flex items-center justify-center shadow-md"
                title={
                  participant.name +
                  (participant.role === "host" ? " (Host)" : "")
                }
              >
                <span className="text-xl font-bold text-gray-700">
                  {participant.name.charAt(0).toUpperCase()}
                </span>
              </div>
            ))}
            {/* Add participant card */}
            <div className="size-12 rounded-lg bg-white flex items-center justify-center shadow-md cursor-pointer hover:bg-gray-50 transition-colors">
              <UserPlus className="size-5 text-[#5E2C5F]" />
            </div>
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
              className={`size-9 rounded-full border-0 transition-all ${
                !isVideoEnabled
                  ? "bg-black/20 hover:bg-black/30 text-white"
                  : "bg-green-500/20 hover:bg-green-500/30 text-white"
              }`}
              title={!isVideoEnabled ? "Turn on video" : "Turn off video"}
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
              className={`size-9 rounded-full border-0 transition-all ${
                isScreenSharing
                  ? "bg-green-500/20 hover:bg-green-500/30 text-white"
                  : "bg-black/20 hover:bg-black/30 text-white"
              }`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
              onClick={toggleScreenShare}
            >
              <Monitor className="size-4.5" />
            </Button>

            {/* More options button */}
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full bg-black/20 hover:bg-black/30 text-white border-0"
              title="More options"
            >
              <MoreVertical className="size-4.5" />
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
      <HuddleDialog
        open={huddleState.isHuddleOpen}
        onOpenChange={handleCloseDialog}
      />
    </>
  );
}

export function HuddleBar() {
  const [huddleState, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
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

  // Use currentHuddleId from state if available (for immediate updates after join)
  const effectiveHuddleId = huddleState.currentHuddleId || activeHuddle?._id || null;

  // Check if huddle is active (from state or Convex)
  const isHuddleActive = huddleState.currentHuddleId ? true : (activeHuddle?.isActive ?? false);

  // Wrap with media provider when huddle is active
  // Pass huddleId so WebRTC is managed in the provider
  if (isHuddleActive) {
    return (
      <HuddleMediaProvider enabled={isHuddleActive} huddleId={effectiveHuddleId}>
        <HuddleBarContent />
      </HuddleMediaProvider>
    );
  }

  // Show dialog only when not active
  return (
    <>
      <HuddleDialog
        open={huddleState.isHuddleOpen}
        onOpenChange={(open) =>
          setHuddleState((prev) => ({ ...prev, isHuddleOpen: open }))
        }
      />
    </>
  );
}
