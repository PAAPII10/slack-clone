"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useHuddleState } from "../store/use-huddle-state";
import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { useGetMember } from "@/features/members/api/use-get-member";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { getUserDisplayName } from "@/lib/user-utils";
import { useActiveHuddle } from "../api/use-active-huddle";
import { useHuddleParticipants } from "../api/use-huddle-participants";
import { useStartOrJoinHuddle } from "../api/use-start-or-join-huddle";
import { useLeaveHuddle } from "../api/use-leave-huddle";
import { useHuddleMedia } from "./HuddleMediaProvider";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { useActiveSpeaker } from "../hooks/use-active-speaker";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { useSettingsModal } from "@/store/use-settings-modal";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Smile,
  Settings,
  Headphones,
  Maximize2,
  Minimize2,
  X,
  Volume2,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useMemo, useRef, useEffect } from "react";

/**
 * HuddleDialog Component
 *
 * PHASE 3: WebRTC Integration
 * - Real-time audio/video using simple-peer (P2P mesh)
 * - Media controls (mute, video, screen share)
 * - Noise cancellation via browser constraints
 * - Convex signaling for WebRTC offers/answers/ICE candidates
 */

interface HuddleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner component that uses WebRTC hooks
function HuddleDialogContent({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [huddleState, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const [isMaximized, setIsMaximized] = useState(false);
  const [, , openSettings] = useSettingsModal();
  const { settings } = useHuddleAudioSettings();
  const { mutate: startOrJoinHuddle, isPending: isJoining } =
    useStartOrJoinHuddle();
  const { mutate: leaveHuddle } = useLeaveHuddle();

  // Media controls from HuddleMediaProvider
  const {
    localStream,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    cleanup,
  } = useHuddleMedia();

  // Get source information
  // Only fetch when we have a valid source ID
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
  const effectiveHuddleId =
    huddleState.currentHuddleId || activeHuddle?._id || null;

  // Get participants
  const { data: participants } = useHuddleParticipants({
    huddleId: effectiveHuddleId,
  });

  // Check if huddle is actually active (from Convex or state)
  const isHuddleActive = huddleState.currentHuddleId
    ? true
    : activeHuddle?.isActive ?? false;

  // Get remote streams from media provider (WebRTC is managed there)
  const { remoteStreams, isConnecting } = useHuddleMedia();

  // Video refs for local and remote streams
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<Id<"members">, HTMLVideoElement>>(
    new Map()
  );
  const remoteAudioRefs = useRef<Map<Id<"members">, HTMLAudioElement>>(
    new Map()
  );
  const playingRefs = useRef<Map<Id<"members">, boolean>>(new Map());

  // Active speaker detection
  const activeSpeakerId = useActiveSpeaker({
    isHuddleActive,
    localStream,
    remoteStreams,
    currentMemberId: currentMember?._id || null,
  });

  // Update local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Update remote video elements
  useEffect(() => {
    remoteStreams.forEach((stream, memberId) => {
      const videoElement = remoteVideoRefs.current.get(memberId);
      const audioElement = remoteAudioRefs.current.get(memberId);
      const isPlaying = playingRefs.current.get(memberId);

      // Ensure audio tracks are enabled
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track: MediaStreamTrack) => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });

      if (videoElement) {
        // Only update srcObject if it's different to avoid interrupting playback
        if (videoElement.srcObject !== stream) {
          videoElement.srcObject = stream;
        }

        // Ensure video element is not muted and can play audio
        videoElement.muted = false;
        videoElement.volume = settings.outputVolume;

        // Set speaker output device (sinkId) for video element
        if (settings.selectedSpeakerId && "setSinkId" in videoElement) {
          (
            videoElement as HTMLVideoElement & {
              setSinkId: (id: string) => Promise<void>;
            }
          )
            .setSinkId(settings.selectedSpeakerId)
            .catch((err) => {
              console.warn(
                `Failed to set speaker device for video ${memberId}:`,
                err
              );
            });
        }

        // Only try to play if not already playing and element is ready
        if (!isPlaying && videoElement.readyState >= 2) {
          playingRefs.current.set(memberId, true);
          videoElement
            .play()
            .then(() => {
              console.log(`Playing video/audio for ${memberId}`);
            })
            .catch((err) => {
              playingRefs.current.set(memberId, false);
              // Only log if it's not an abort error (which is expected when stream changes)
              if (
                !err.message.includes("interrupted") &&
                !err.message.includes("AbortError")
              ) {
                console.error(
                  `Error playing remote stream for ${memberId}:`,
                  err
                );
              }
            });
        }
      }

      // Handle audio-only streams with audio element
      if (audioElement && stream.getVideoTracks().length === 0) {
        // Only update srcObject if it's different
        if (audioElement.srcObject !== stream) {
          audioElement.srcObject = stream;
        }

        audioElement.muted = false;
        audioElement.volume = settings.outputVolume;

        // Set speaker output device (sinkId) for audio element
        if (settings.selectedSpeakerId && "setSinkId" in audioElement) {
          (
            audioElement as HTMLAudioElement & {
              setSinkId: (id: string) => Promise<void>;
            }
          )
            .setSinkId(settings.selectedSpeakerId)
            .catch((err) => {
              console.warn(
                `Failed to set speaker device for audio ${memberId}:`,
                err
              );
            });
        }

        // Only try to play if not already playing
        if (!isPlaying && audioElement.readyState >= 2) {
          playingRefs.current.set(memberId, true);
          audioElement
            .play()
            .then(() => {
              console.log(`Playing audio for ${memberId}`);
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
      }
    });

    // Clean up playing refs for removed streams
    const currentMemberIds = new Set(remoteStreams.keys());
    playingRefs.current.forEach((_, memberId) => {
      if (!currentMemberIds.has(memberId)) {
        playingRefs.current.delete(memberId);
      }
    });
  }, [remoteStreams, settings.outputVolume, settings.selectedSpeakerId]);

  // Determine huddle title
  const huddleTitle =
    huddleState.huddleSource === "channel"
      ? `# ${channel?.name || "Channel"}`
      : huddleState.huddleSource === "dm"
      ? getUserDisplayName(member?.user || {})
      : "Huddle";

  // Process participants for display
  const displayParticipants = useMemo(() => {
    if (!participants || !currentMember) return [];
    return participants.map((p) => ({
      id: p.memberId,
      name: getUserDisplayName(p.user),
      image: (p.user as { image?: string | null })?.image || undefined,
      isYou: p.memberId === currentMember._id,
      role: p.role,
      isMuted: p.isMuted,
    }));
  }, [participants, currentMember]);

  // Auto-join when dialog opens if huddle source is set but not active
  useEffect(() => {
    if (
      open &&
      !isHuddleActive &&
      huddleState.huddleSource &&
      sourceId &&
      workspaceId
    ) {
      // Auto-join the huddle when dialog opens
      startOrJoinHuddle(
        {
          workspaceId,
          sourceType: huddleState.huddleSource,
          sourceId,
        },
        {
          onSuccess: (huddleId) => {
            console.log("Auto-joined huddle:", huddleId);
            // Play join sound
            playHuddleSound("join");
            setHuddleState((prev) => ({
              ...prev,
              currentHuddleId: huddleId,
              isHuddleActive: true,
              isHuddleOpen: true,
            }));
          },
          onError: (error) => {
            console.error("Failed to auto-join huddle:", error);
          },
        }
      );
    }
  }, [
    open,
    isHuddleActive,
    huddleState.huddleSource,
    sourceId,
    workspaceId,
    startOrJoinHuddle,
    setHuddleState,
  ]);

  const handleJoin = () => {
    if (!workspaceId || !huddleState.huddleSource || !sourceId) return;

    startOrJoinHuddle(
      {
        workspaceId,
        sourceType: huddleState.huddleSource,
        sourceId,
      },
      {
        onSuccess: (huddleId) => {
          console.log("Huddle started/joined successfully:", huddleId);
          // Play join sound
          playHuddleSound("join");
          // Update state immediately with huddleId to trigger UI update
          setHuddleState((prev) => ({
            ...prev,
            currentHuddleId: huddleId,
            isHuddleActive: true,
            isHuddleOpen: true,
          }));
        },
        onError: (error) => {
          console.error("Failed to join huddle:", error);
        },
      }
    );
  };

  const handleLeave = () => {
    cleanup();
    // Play hangup sound
    playHuddleSound("hangup");
    const huddleIdToLeave = effectiveHuddleId;
    if (huddleIdToLeave) {
      leaveHuddle(huddleIdToLeave, {
        onSuccess: () => {
          setHuddleState((prev) => ({
            ...prev,
            isHuddleActive: false,
            isHuddleOpen: false,
            currentHuddleId: null,
            huddleSource: null,
            huddleSourceId: null,
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
        huddleSource: null,
        huddleSourceId: null,
      }));
    }
  };

  const handleToggleMute = () => {
    toggleAudio();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  const handleScreenShare = () => {
    toggleScreenShare();
  };

  const handleEmoji = () => {
    // TODO (PHASE 2): Open emoji picker for reactions
  };

  const handleSettings = () => {
    openSettings("audio-video");
  };

  // Show join screen if not active
  if (!isHuddleActive) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md p-0 overflow-hidden"
          showCloseButton={false}
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside
            e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">
            Huddle with {huddleTitle}
          </DialogTitle>
          <div className="flex flex-col">
            {/* Join Header */}
            <div className="bg-[#5E2C5F] px-6 py-4 flex items-center gap-3 rounded-t-lg">
              <Headphones className="size-6 text-white" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Huddle with {huddleTitle}
              </h2>
            </div>

            {/* Participant Preview */}
            <div className="px-6 py-12 bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 min-h-[320px] flex items-center justify-center">
              <div className="flex items-center gap-8">
                {displayParticipants.length > 0 ? (
                  displayParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex flex-col items-center group"
                    >
                      <div className="relative">
                        <Avatar className="size-24 border-4 border-white shadow-xl transition-transform group-hover:scale-105">
                          <AvatarImage src={undefined} />
                          <AvatarFallback className="text-3xl font-bold bg-[#5E2C5F] text-white">
                            {participant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {participant.isYou && (
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-md border border-gray-200">
                            <span className="text-xs font-semibold text-gray-800">
                              You
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="mt-4 text-base font-semibold text-gray-800 tracking-tight">
                        {participant.isYou
                          ? "You"
                          : participant.name.split(" ")[0]}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">No participants yet</div>
                )}
              </div>
            </div>

            {/* Join Button */}
            <div className="px-6 py-5 bg-white border-t rounded-b-lg">
              <Button
                onClick={handleJoin}
                disabled={isJoining}
                className="w-full bg-[#5E2C5F] hover:bg-[#481349] text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                size="lg"
              >
                <Headphones className="size-5 mr-2" />
                {isJoining ? "Joining..." : "Join Huddle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleToggleSize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    // Close dialog without ending the huddle
    onOpenChange(false);
  };

  // Active huddle view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${
          isMaximized ? "h-[90vh]" : "h-[50vh]"
        } p-0 overflow-hidden flex flex-col transition-all duration-300`}
        style={{
          maxWidth: isMaximized ? "95vw" : "42rem",
          width: isMaximized ? "95vw" : "100%",
        }}
        showCloseButton={false}
        onInteractOutside={(e) => {
          // Prevent closing when clicking outside - only allow minimize button
          e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Huddle with {huddleTitle}</DialogTitle>
        {/* Thin Header */}
        <div className="bg-white px-6 py-3 flex items-center justify-between shrink-0 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-[#5E2C5F] flex items-center justify-center">
              <Headphones className="size-4 text-white" />
            </div>
            <span className="text-sm text-gray-600 font-medium">
              {huddleTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleSize}
              className="size-8 hover:bg-gray-100"
              title={isMaximized ? "Minimize" : "Maximize"}
            >
              {isMaximized ? (
                <Minimize2 className="size-4 text-gray-600" />
              ) : (
                <Maximize2 className="size-4 text-gray-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="size-8 hover:bg-gray-100"
              title="Close dialog"
            >
              <X className="size-4 text-gray-600" />
            </Button>
          </div>
        </div>

        {/* Participant View Area - Side by Side */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {displayParticipants.length > 0 ? (
            displayParticipants.map((participant) => {
              const isYou = participant.isYou;
              const stream = isYou
                ? localStream
                : remoteStreams.get(participant.id);
              const hasVideo =
                stream
                  ?.getVideoTracks()
                  .some((t: MediaStreamTrack) => t.enabled) ?? false;
              const hasAudio =
                stream
                  ?.getAudioTracks()
                  .some((t: MediaStreamTrack) => t.enabled) ?? false;

              // Check if this participant is the active speaker
              const isActiveSpeaker = activeSpeakerId === participant.id;

              return (
                <div
                  key={participant.id}
                  className={`flex-1 relative flex flex-col items-center justify-center overflow-hidden rounded-md ${
                    isActiveSpeaker ? "ring-2 ring-[#5E2C5F]" : ""
                  }`}
                >
                  {hasVideo ? (
                    <video
                      ref={
                        isYou
                          ? localVideoRef
                          : (el) => {
                              if (el) {
                                remoteVideoRefs.current.set(participant.id, el);
                                // Set properties but don't play here - let the effect handle it
                                if (!isYou) {
                                  el.muted = false;
                                  el.volume = 1.0;
                                }
                              } else {
                                remoteVideoRefs.current.delete(participant.id);
                              }
                            }
                      }
                      autoPlay
                      playsInline
                      muted={isYou}
                      className="w-full h-full object-cover"
                      onLoadedMetadata={(e) => {
                        // Only play when metadata is loaded and element is ready
                        if (!isYou && e.currentTarget.readyState >= 2) {
                          const isPlaying = playingRefs.current.get(
                            participant.id
                          );
                          if (!isPlaying) {
                            playingRefs.current.set(participant.id, true);
                            e.currentTarget.play().catch((err) => {
                              playingRefs.current.set(participant.id, false);
                              if (
                                !err.message.includes("interrupted") &&
                                !err.message.includes("AbortError")
                              ) {
                                console.error(
                                  `Error playing video for ${participant.id}:`,
                                  err
                                );
                              }
                            });
                          }
                        }
                      }}
                    />
                  ) : (
                    <>
                      {/* Hidden audio element for audio-only streams */}
                      {!isYou && stream && hasAudio && (
                        <audio
                          ref={(el) => {
                            if (el) {
                              remoteAudioRefs.current.set(participant.id, el);
                              // Set properties but don't play here - let the effect handle it
                              if (stream) {
                                el.srcObject = stream;
                                el.muted = false;
                                el.volume = 1.0;
                              }
                            } else {
                              remoteAudioRefs.current.delete(participant.id);
                            }
                          }}
                          autoPlay
                          playsInline
                        />
                      )}
                      {/* Full-size avatar that fills the entire area */}
                      <div className="absolute inset-0 w-full h-full">
                        <Avatar className="w-full h-full rounded-none">
                          <AvatarImage
                            src={participant.image || undefined}
                            className="w-full h-full object-cover"
                          />
                          <AvatarFallback className="w-full h-full text-8xl font-bold bg-sky-500 text-white flex items-center justify-center rounded-none">
                            {participant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </>
                  )}

                  {/* Participant Name and Status */}
                  <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                    <span className="text-sm text-white font-medium">
                      {isYou ? "You" : participant.name}
                      {participant.role === "host" && " (Host)"}
                    </span>
                    {isYou ? (
                      <>
                        {!isMuted && <Volume2 className="size-4 text-white" />}
                        {isMuted && <MicOff className="size-4 text-white" />}
                      </>
                    ) : (
                      <>
                        {participant.isMuted && (
                          <MicOff className="size-4 text-white" />
                        )}
                        {!participant.isMuted && (
                          <Volume2 className="size-4 text-white" />
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              No participants
            </div>
          )}
          {isConnecting && (
            <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded text-sm">
              Connecting...
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="bg-[#5E2C5F] px-6 py-4 flex items-center justify-center gap-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`size-12 rounded-full transition-all ${
              isMuted
                ? "bg-red-500/20 hover:bg-red-500/30 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
            onClick={handleToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <MicOff className="size-5" />
            ) : (
              <Mic className="size-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`size-12 rounded-full transition-all opacity-50 cursor-not-allowed ${
              !isVideoEnabled
                ? "bg-gray-500/20 text-white"
                : "bg-white/10 text-white"
            }`}
            title="Video disabled"
            disabled
            onClick={handleToggleVideo}
          >
            {!isVideoEnabled ? (
              <VideoOff className="size-5" />
            ) : (
              <Video className="size-5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`size-12 rounded-full transition-all opacity-50 cursor-not-allowed ${
              isScreenSharing
                ? "bg-green-500/20 text-white"
                : "bg-white/10 text-white"
            }`}
            title="Screen sharing disabled"
            disabled
            onClick={handleScreenShare}
          >
            <Monitor className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-12 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            onClick={handleEmoji}
            title="Add reaction"
          >
            <Smile className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-12 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            onClick={handleSettings}
            title="Settings"
          >
            <Settings className="size-5" />
          </Button>

          <Button
            onClick={handleLeave}
            className="ml-4 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-all"
          >
            Leave
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HuddleDialog({ open, onOpenChange }: HuddleDialogProps) {
  const [huddleState, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { mutate: startOrJoinHuddle, isPending: isJoining } =
    useStartOrJoinHuddle();

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
  const effectiveHuddleId =
    huddleState.currentHuddleId || activeHuddle?._id || null;

  // Get participants
  const { data: participants } = useHuddleParticipants({
    huddleId: effectiveHuddleId,
  });

  // Determine huddle title
  const huddleTitle =
    huddleState.huddleSource === "channel"
      ? `# ${channel?.name || "Channel"}`
      : huddleState.huddleSource === "dm"
      ? getUserDisplayName(member?.user || {})
      : "Huddle";

  // Process participants for display
  const displayParticipants = useMemo(() => {
    if (!participants || !currentMember) return [];
    return participants.map((p) => ({
      id: p.memberId,
      name: getUserDisplayName(p.user),
      image: (p.user as { image?: string | null })?.image || undefined,
      isYou: p.memberId === currentMember._id,
      role: p.role,
      isMuted: p.isMuted,
    }));
  }, [participants, currentMember]);

  // Check if huddle is actually active (from Convex or state)
  const isHuddleActive = huddleState.currentHuddleId
    ? true
    : activeHuddle?.isActive ?? false;

  // Debug logging
  useEffect(() => {
    console.log("HuddleDialog outer render state:", {
      currentHuddleId: huddleState.currentHuddleId,
      activeHuddleId: activeHuddle?._id,
      activeHuddleIsActive: activeHuddle?.isActive,
      isHuddleActive,
      open,
    });
  }, [huddleState.currentHuddleId, activeHuddle, isHuddleActive, open]);

  const handleJoin = () => {
    console.log("handleJoin called with state:", {
      workspaceId,
      huddleSource: huddleState.huddleSource,
      huddleSourceId: huddleState.huddleSourceId,
      sourceId,
    });

    if (!workspaceId) {
      console.error("Cannot join huddle: missing workspaceId");
      alert("Cannot start huddle: Missing workspace");
      return;
    }

    if (!huddleState.huddleSource) {
      console.error("Cannot join huddle: missing huddleSource");
      alert("Cannot start huddle: Missing source type");
      return;
    }

    if (!sourceId) {
      console.error("Cannot join huddle: missing sourceId", {
        huddleSourceId: huddleState.huddleSourceId,
        huddleSource: huddleState.huddleSource,
      });
      alert("Cannot start huddle: Missing source ID");
      return;
    }

    console.log("Starting/joining huddle with:", {
      workspaceId,
      sourceType: huddleState.huddleSource,
      sourceId,
    });

    startOrJoinHuddle(
      {
        workspaceId,
        sourceType: huddleState.huddleSource,
        sourceId,
      },
      {
        onSuccess: (huddleId) => {
          console.log("Huddle started/joined successfully:", huddleId);
          // Update state immediately with huddleId to trigger UI update
          setHuddleState((prev) => ({
            ...prev,
            currentHuddleId: huddleId,
            isHuddleActive: true,
            isHuddleOpen: true,
          }));
        },
        onError: (error) => {
          console.error("Failed to join huddle:", error);
          alert(`Failed to start huddle: ${error.message || "Unknown error"}`);
        },
      }
    );
  };

  // Show join screen if not active
  if (!isHuddleActive) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md p-0 overflow-hidden"
          showCloseButton={false}
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside
            e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">
            Huddle with {huddleTitle}
          </DialogTitle>
          <div className="flex flex-col">
            {/* Join Header */}
            <div className="bg-[#5E2C5F] px-6 py-4 flex items-center gap-3 rounded-t-lg">
              <Headphones className="size-6 text-white" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Huddle with {huddleTitle}
              </h2>
            </div>

            {/* Participant Preview */}
            <div className="px-6 py-12 bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 min-h-[320px] flex items-center justify-center">
              <div className="flex items-center gap-8">
                {displayParticipants.length > 0 ? (
                  displayParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex flex-col items-center group"
                    >
                      <div className="relative">
                        <Avatar className="size-24 border-4 border-white shadow-xl transition-transform group-hover:scale-105">
                          <AvatarImage src={undefined} />
                          <AvatarFallback className="text-3xl font-bold bg-[#5E2C5F] text-white">
                            {participant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {participant.isYou && (
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded-full shadow-md border border-gray-200">
                            <span className="text-xs font-semibold text-gray-800">
                              You
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="mt-4 text-base font-semibold text-gray-800 tracking-tight">
                        {participant.isYou
                          ? "You"
                          : participant.name.split(" ")[0]}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">No participants yet</div>
                )}
              </div>
            </div>

            {/* Join Button */}
            <div className="px-6 py-5 bg-white border-t rounded-b-lg">
              <Button
                onClick={handleJoin}
                disabled={isJoining}
                className="w-full bg-[#5E2C5F] hover:bg-[#481349] text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                size="lg"
              >
                <Headphones className="size-5 mr-2" />
                {isJoining ? "Joining..." : "Join Huddle"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Active huddle - no need to wrap with provider since HuddleBar already provides it
  // HuddleDialog is rendered inside HuddleBarContent, so it's already within the provider
  return <HuddleDialogContent open={open} onOpenChange={onOpenChange} />;
}
