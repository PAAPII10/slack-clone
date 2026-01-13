/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Loader2,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useJoinChannelHuddle } from "../api/use-join-channel-huddle";
import { useHuddleParticipants } from "../api/use-huddle-participants";
import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { getUserDisplayName } from "@/lib/user-utils";
import { HuddleMediaProvider } from "./HuddleMediaProvider";

interface ChannelHuddleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  huddleId: Id<"huddles"> | null;
  channelId: Id<"channels"> | null;
}

// Join screen component (doesn't need media)
function ChannelHuddleJoinScreen({
  open,
  onOpenChange,
  huddleId,
  channelId,
  onJoinSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  huddleId: Id<"huddles"> | null;
  channelId: Id<"channels"> | null;
  onJoinSuccess: () => void;
}) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: channel } = useGetChannel({
    id: channelId || ("" as Id<"channels">),
  });
  const { data: participants, isLoading: isLoadingParticipants } =
    useHuddleParticipants({ huddleId });
  const { settings } = useHuddleAudioSettings();
  const { mutate: joinHuddle, isPending: isJoiningHuddle } =
    useJoinChannelHuddle();

  const huddleTitle = channel ? `# ${channel.name}` : "Channel Huddle";

  const displayParticipants =
    participants
      ?.filter((p) => p.user && p.memberId)
      .map((p) => ({
        id: p.memberId,
        name: getUserDisplayName(p.user),
        image: p.user.image || undefined,
        isYou: p.memberId === currentMember?._id,
        role: p.role,
        isMuted: p.isMuted ?? false,
        status: "joined" as const,
      })) || [];

  const handleJoin = () => {
    if (!huddleId) return;

    joinHuddle(
      {
        huddleId,
        startMuted: settings.startMuted,
      },
      {
        onSuccess: () => {
          playHuddleSound("join");
          onJoinSuccess();
        },
        onError: (error) => {
          console.error("Failed to join huddle:", error);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden"
        showCloseButton={false}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Huddle in {huddleTitle}</DialogTitle>
        <div className="flex flex-col">
          {/* Join Header */}
          <div className="bg-[#5E2C5F] px-6 py-4 flex items-center justify-between gap-3 rounded-t-lg">
            <div className="flex items-center gap-3">
              <Headphones className="size-6 text-white" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Huddle in {huddleTitle}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-white/20 hover:text-white h-8 w-8 rounded-full"
            >
              <X className="size-5" />
            </Button>
          </div>

          {/* Participant Preview */}
          <div className="px-6 py-12 bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 min-h-[320px] flex items-center justify-center">
            {isLoadingParticipants ? (
              <Loader2 className="size-8 text-gray-500 animate-spin" />
            ) : displayParticipants.length > 0 ? (
              <div className="flex items-center gap-8">
                {displayParticipants.map((participant) => {
                  return (
                    <div
                      key={participant.id}
                      className="flex flex-col items-center group"
                    >
                      <div className="relative">
                        <Avatar className="size-24 border-4 border-white shadow-xl transition-transform group-hover:scale-105">
                          <AvatarImage src={participant.image || undefined} />
                          <AvatarFallback className="text-3xl font-bold bg-[#5E2C5F] text-white">
                            {participant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <span className="mt-4 text-base font-semibold tracking-tight text-gray-800">
                        {participant.name.split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500">No participants yet</div>
            )}
          </div>

          {/* Join Button */}
          <div className="px-6 py-5 bg-white border-t rounded-b-lg">
            <Button
              onClick={handleJoin}
              disabled={isJoiningHuddle}
              className="w-full bg-[#5E2C5F] hover:bg-[#481349] text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              size="lg"
            >
              <Headphones className="size-5 mr-2" />
              {isJoiningHuddle ? "Joining..." : "Join Huddle"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Active huddle view component (needs media)
function ChannelHuddleActiveView({
  open,
  onOpenChange,
  huddleId,
  channelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  huddleId: Id<"huddles"> | null;
  channelId: Id<"channels"> | null;
}) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: channel } = useGetChannel({
    id: channelId || ("" as Id<"channels">),
  });
  const { data: participants } = useHuddleParticipants({ huddleId });

  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, , openSettings] = useSettingsModal();
  const { settings } = useHuddleAudioSettings();
  const { mutate: leaveHuddle } = useLeaveHuddle();

  // Media controls from HuddleMediaProvider
  const {
    localStream,
    screenStream,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    cleanup,
    remoteStreams,
    remoteScreenShares,
    screenSharingMemberId,
    isConnecting,
  } = useHuddleMedia();

  // Build display participants
  const displayParticipants =
    participants
      ?.filter((p) => p.user && p.memberId)
      .map((p) => ({
        id: p.memberId,
        name: getUserDisplayName(p.user),
        image: p.user.image || undefined,
        isYou: p.memberId === currentMember?._id,
        role: p.role,
        isMuted: p.isMuted ?? false,
        status: "joined" as const,
      })) || [];

  const huddleTitle = channel ? `# ${channel.name}` : "Channel Huddle";

  // Auto-maximize when screen sharing starts
  const prevScreenSharingRef = useRef(isScreenSharing);
  useEffect(() => {
    if (isScreenSharing && !prevScreenSharingRef.current && !isMaximized) {
      setTimeout(() => {
        setIsMaximized(true);
      }, 100);
    }
    prevScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing, isMaximized]);

  // Handle fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    if (isScreenSharing && screenShareVideoRef.current) {
      if (!isFullscreen) {
        if (screenShareVideoRef.current.requestFullscreen) {
          screenShareVideoRef.current.requestFullscreen();
        } else if (
          (screenShareVideoRef.current as any).webkitRequestFullscreen
        ) {
          (screenShareVideoRef.current as any).webkitRequestFullscreen();
        } else if ((screenShareVideoRef.current as any).mozRequestFullScreen) {
          (screenShareVideoRef.current as any).mozRequestFullScreen();
        } else if ((screenShareVideoRef.current as any).msRequestFullscreen) {
          (screenShareVideoRef.current as any).msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    }
  }, [isScreenSharing, isFullscreen]);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange
      );
    };
  }, []);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        handleToggleFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isFullscreen, handleToggleFullscreen]);

  // Video refs for local and remote streams
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<Id<"members">, HTMLVideoElement>>(
    new Map()
  );
  const remoteAudioRefs = useRef<Map<Id<"members">, HTMLAudioElement>>(
    new Map()
  );
  const playingRefs = useRef<Map<Id<"members">, boolean>>(new Map());
  const screenShareVideoRef = useRef<HTMLVideoElement>(null);

  // Active speaker detection
  // In active view, user is always a participant
  const activeSpeakerId = useActiveSpeaker({
    isHuddleActive: true,
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

  // Update screen share video element
  useEffect(() => {
    const videoElement = screenShareVideoRef.current;
    if (!videoElement) return;

    if (screenSharingMemberId) {
      const shareStream =
        screenSharingMemberId === currentMember?._id
          ? screenStream
          : remoteScreenShares.get(screenSharingMemberId);

      if (shareStream && videoElement.srcObject !== shareStream) {
        requestAnimationFrame(() => {
          if (screenShareVideoRef.current) {
            screenShareVideoRef.current.srcObject = shareStream;
          }
        });
      }
    } else {
      requestAnimationFrame(() => {
        if (screenShareVideoRef.current) {
          screenShareVideoRef.current.srcObject = null;
        }
      });
    }
  }, [
    screenSharingMemberId,
    screenStream,
    remoteScreenShares,
    currentMember?._id,
  ]);

  // Update remote video elements
  useEffect(() => {
    remoteStreams.forEach((stream, memberId) => {
      const videoElement = remoteVideoRefs.current.get(memberId);
      const audioElement = remoteAudioRefs.current.get(memberId);
      const isPlaying = playingRefs.current.get(memberId);

      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track: MediaStreamTrack) => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });

      if (videoElement) {
        if (videoElement.srcObject !== stream) {
          videoElement.srcObject = stream;
        }

        videoElement.muted = false;
        videoElement.volume = settings.outputVolume;

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

        if (!isPlaying && videoElement.readyState >= 2) {
          playingRefs.current.set(memberId, true);
          videoElement
            .play()
            .then(() => {
              console.log(`Playing video/audio for ${memberId}`);
            })
            .catch((err) => {
              playingRefs.current.set(memberId, false);
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

      if (audioElement && stream.getVideoTracks().length === 0) {
        if (audioElement.srcObject !== stream) {
          audioElement.srcObject = stream;
        }

        audioElement.muted = false;
        audioElement.volume = settings.outputVolume;

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

    const currentMemberIds = new Set(remoteStreams.keys());
    playingRefs.current.forEach((_, memberId) => {
      if (!currentMemberIds.has(memberId)) {
        playingRefs.current.delete(memberId);
      }
    });
  }, [remoteStreams, settings.outputVolume, settings.selectedSpeakerId]);

  const handleLeave = () => {
    cleanup();
    playHuddleSound("hangup");
    if (huddleId) {
      leaveHuddle(huddleId, {
        onSuccess: () => {
          console.log("Huddle left successfully");
          // Close the dialog when user leaves
          onOpenChange(false);
        },
      });
    } else {
      // If no huddleId, just close the dialog
      onOpenChange(false);
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
    // TODO: Open emoji picker for reactions
  };

  const handleSettings = () => {
    openSettings("audio-video");
  };

  const handleToggleSize = () => {
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Get active speaker participant info
  const activeSpeakerParticipant = activeSpeakerId
    ? displayParticipants.find((p) => p.id === activeSpeakerId)
    : null;

  // Active huddle view
  return (
    <>
      {/* Fullscreen Overlay */}
      {isFullscreen && isScreenSharing && screenSharingMemberId && (
        <div className="fixed inset-0 z-9999 bg-black flex items-center justify-center">
          <div className="w-full h-full relative flex">
            <div className="flex-1 relative">
              <video
                ref={screenShareVideoRef}
                autoPlay
                playsInline
                muted={false}
                className="w-full h-full object-contain"
              />
            </div>

            {activeSpeakerParticipant && (
              <div className="absolute bottom-8 right-8 flex items-center gap-3 bg-black/80 px-4 py-3 rounded-lg border border-white/20">
                <Avatar className="size-10 border-2 border-[#5E2C5F]">
                  <AvatarImage
                    src={activeSpeakerParticipant.image || undefined}
                  />
                  <AvatarFallback className="bg-[#5E2C5F] text-white">
                    {activeSpeakerParticipant.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">
                    {activeSpeakerParticipant.isYou
                      ? "You"
                      : activeSpeakerParticipant.name}
                  </span>
                  <span className="text-xs text-gray-300">Speaking</span>
                </div>
                <Volume2 className="size-5 text-green-400" />
              </div>
            )}

            <div className="absolute top-4 right-4 bg-black/70 px-3 py-2 rounded text-xs text-white">
              Press ESC to exit fullscreen
            </div>
          </div>
        </div>
      )}

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
            e.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">Huddle in {huddleTitle}</DialogTitle>
          {/* Header */}
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

          {/* Participant View Area */}
          <div
            className={`flex-1 flex gap-4 p-4 overflow-hidden ${
              isScreenSharing ? "flex-row" : "flex-col"
            }`}
          >
            {/* Screen Share Card */}
            {isScreenSharing && screenSharingMemberId && (
              <div
                className="flex-1 relative bg-black rounded-lg overflow-hidden border-2 border-green-500 cursor-pointer group"
                onClick={handleToggleFullscreen}
              >
                <video
                  ref={screenShareVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className="w-full h-full object-contain"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch((err) => {
                      if (
                        !err.message.includes("interrupted") &&
                        !err.message.includes("AbortError")
                      ) {
                        console.error("Error playing screen share:", err);
                      }
                    });
                  }}
                />
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 px-3 py-2 rounded">
                  <Monitor className="size-4 text-green-400" />
                  <span className="text-sm text-white font-medium">
                    {screenSharingMemberId === currentMember?._id
                      ? "You are sharing your screen"
                      : (() => {
                          const sharingParticipant = displayParticipants.find(
                            (p) => p.id === screenSharingMemberId
                          );
                          return `${
                            sharingParticipant?.name || "Someone"
                          } is sharing their screen`;
                        })()}
                  </span>
                </div>
                <div className="absolute top-4 right-4 bg-black/70 px-3 py-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-white">
                    Click to fullscreen
                  </span>
                </div>
              </div>
            )}

            {/* Participants Grid */}
            <div
              className={`flex gap-4 overflow-hidden ${
                isScreenSharing ? "w-64 flex-col" : "flex-1 flex-row"
              }`}
            >
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
                  const isActiveSpeaker = activeSpeakerId === participant.id;

                  return (
                    <div
                      key={participant.id}
                      className={`${
                        isScreenSharing
                          ? "w-full h-auto aspect-video"
                          : "flex-1"
                      } relative flex flex-col items-center justify-center overflow-hidden rounded-md ${
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
                                    remoteVideoRefs.current.set(
                                      participant.id,
                                      el
                                    );
                                    if (!isYou) {
                                      el.muted = false;
                                      el.volume = 1.0;
                                    }
                                  } else {
                                    remoteVideoRefs.current.delete(
                                      participant.id
                                    );
                                  }
                                }
                          }
                          autoPlay
                          playsInline
                          muted={isYou}
                          className="w-full h-full object-cover"
                          onLoadedMetadata={(e) => {
                            if (!isYou && e.currentTarget.readyState >= 2) {
                              const isPlaying = playingRefs.current.get(
                                participant.id
                              );
                              if (!isPlaying) {
                                playingRefs.current.set(participant.id, true);
                                e.currentTarget.play().catch((err) => {
                                  playingRefs.current.set(
                                    participant.id,
                                    false
                                  );
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
                          {!isYou && stream && hasAudio && (
                            <audio
                              ref={(el) => {
                                if (el) {
                                  remoteAudioRefs.current.set(
                                    participant.id,
                                    el
                                  );
                                  if (stream) {
                                    el.srcObject = stream;
                                    el.muted = false;
                                    el.volume = 1.0;
                                  }
                                } else {
                                  remoteAudioRefs.current.delete(
                                    participant.id
                                  );
                                }
                              }}
                              autoPlay
                              playsInline
                            />
                          )}
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

                      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                        <span className="text-sm text-white font-medium">
                          {isYou ? "You" : participant.name}
                          {participant.role === "host" && " (Host)"}
                        </span>
                        {isYou ? (
                          <>
                            {!isMuted && (
                              <Volume2 className="size-4 text-white" />
                            )}
                            {isMuted && (
                              <MicOff className="size-4 text-white" />
                            )}
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
            </div>
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
              className={`size-12 rounded-full transition-all ${
                !isVideoEnabled
                  ? "bg-gray-500/20 hover:bg-gray-500/30 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
              title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
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
              className={`size-12 rounded-full transition-all ${
                isScreenSharing
                  ? "bg-green-500/20 hover:bg-green-500/30 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
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
    </>
  );
}

export function ChannelHuddleDialog({
  open,
  onOpenChange,
  huddleId,
  channelId,
}: ChannelHuddleDialogProps) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: participants } = useHuddleParticipants({ huddleId });

  // Check if current user is already a participant
  // Participants from getHuddleParticipants are already filtered to active participants
  const isParticipant =
    participants?.some((p) => p.memberId === currentMember?._id) ?? false;

  const [hasJoined, setHasJoined] = useState(false);
  const prevIsParticipantRef = useRef(isParticipant);

  // Close dialog if user is no longer a participant (they left)
  useEffect(() => {
    // If user was a participant but is no longer, close the dialog
    if (prevIsParticipantRef.current && !isParticipant && open) {
      onOpenChange(false);
      // Reset hasJoined in next tick to avoid setState in effect
      setTimeout(() => setHasJoined(false), 0);
    }
    prevIsParticipantRef.current = isParticipant;
  }, [isParticipant, open, onOpenChange]);

  // Show join screen if not a participant
  if (!isParticipant && !hasJoined) {
    return (
      <ChannelHuddleJoinScreen
        open={open}
        onOpenChange={onOpenChange}
        huddleId={huddleId}
        channelId={channelId}
        onJoinSuccess={() => setHasJoined(true)}
      />
    );
  }

  // Show active view (wrapped in HuddleMediaProvider)
  return (
    <HuddleMediaProvider enabled={open && (isParticipant || hasJoined)}>
      <ChannelHuddleActiveView
        open={open}
        onOpenChange={onOpenChange}
        huddleId={huddleId}
        channelId={channelId}
      />
    </HuddleMediaProvider>
  );
}
