import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useGetHuddleByCurrentUser } from "@/features/huddle/api/use-get-huddle-by-current-user";
import { useLeaveHuddle } from "@/features/huddle/api/use-leave-huddle";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { deleteLiveKitRoom } from "@/lib/livekit";
import { getUserDisplayName } from "@/lib/user-utils";
import { cn } from "@/lib/utils";
import {
  Headphones,
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
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Id } from "../../../../../../convex/_generated/dataModel";
import {
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { HuddleDialog } from "./HuddleDialog";
import { Track } from "livekit-client";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { useShowHuddleDialog } from "../store/use-show-huddle-dialog";
import { useSettingsModal } from "@/store/use-settings-modal";
import { logger } from "@/lib/logger";

interface HuddleCallProps {
  activeHuddle: ReturnType<typeof useGetHuddleByCurrentUser>["data"];
  isHuddleLoading: boolean;
}

export function HuddleCall({ activeHuddle, isHuddleLoading }: HuddleCallProps) {
  const workspaceId = useWorkspaceId();

  const [liveKitToken] = useLiveKitToken();

  const { mutate: leaveHuddle } = useLeaveHuddle();
  // Only render LiveKit components when we have a token (inside LiveKitRoom context)
  const isRoomConnected = !!liveKitToken?.token && !!liveKitToken?.url;

  if (!activeHuddle || isHuddleLoading || !isRoomConnected) return null;

  const handleLeaveHuddle = () => {
    if (!activeHuddle?._id) return;

    leaveHuddle(activeHuddle._id, {
      onSuccess: (data) => {
        if (data.roomId) {
          deleteLiveKitRoom(data.roomId);
          playHuddleSound("hangup");
        }
      },
    });
  };

  return (
    <>
      <RoomAudioRenderer />
      <HuddleCallUI
        activeHuddle={activeHuddle}
        workspaceId={workspaceId}
        onLeaveHuddle={handleLeaveHuddle}
      />
    </>
  );
}

interface HuddleCallUIProps {
  activeHuddle: ReturnType<typeof useGetHuddleByCurrentUser>["data"];
  workspaceId: Id<"workspaces">;
  onLeaveHuddle: () => void;
}

function HuddleCallUI({
  activeHuddle,
  workspaceId,
  onLeaveHuddle,
}: HuddleCallUIProps) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  const [, setShowHuddleDialog] = useShowHuddleDialog();
  const [, , openSettings] = useSettingsModal();
  const remoteParticipants = useRemoteParticipants();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  // Get screen share tracks
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  if (!activeHuddle) return null;

  // Get screen share tracks (filter out placeholders)
  const screenShareTracks = tracks.filter(
    (track) =>
      track.publication?.source === Track.Source.ScreenShare &&
      !!track.publication
  );

  const isScreenSharing = screenShareTracks.some(
    (track) => track.participant.identity === localParticipant.identity
  );

  // Find active screen share track (local takes priority, then first remote)
  const activeScreenShareTrack =
    screenShareTracks.find(
      (track) => track.participant.identity === localParticipant.identity
    ) || screenShareTracks[0];

  // Toggle microphone
  const toggleMute = async () => {
    try {
      const newState = !isMicrophoneEnabled;
      logger.debug("Toggling microphone", {
        current: isMicrophoneEnabled,
        new: newState,
        participant: localParticipant.identity,
      });

      await localParticipant.setMicrophoneEnabled(newState);

      // Verify the state was updated
      logger.debug("Microphone toggled successfully", {
        expected: newState,
        actual: localParticipant.isMicrophoneEnabled,
      });
    } catch (error) {
      logger.error("Failed to toggle microphone", error as Error);
      // Show user-friendly error message
      if (error instanceof Error) {
        if (
          error.name === "NotAllowedError" ||
          error.message.includes("permission")
        ) {
          alert(
            "Microphone permission denied. Please allow microphone access in your browser settings."
          );
        } else if (
          error.name === "NotFoundError" ||
          error.message.includes("device")
        ) {
          alert("Microphone not found. Please check your audio input device.");
        } else {
          alert(`Failed to toggle microphone: ${error.message}`);
        }
      } else {
        alert("Failed to toggle microphone. Please try again.");
      }
    }
  };

  // Toggle camera
  const toggleVideo = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      logger.error("Failed to toggle camera", error as Error);
      // Show user-friendly error message
      if (error instanceof Error) {
        if (
          error.name === "NotAllowedError" ||
          error.message.includes("permission")
        ) {
          alert(
            "Camera permission denied. Please allow camera access in your browser settings."
          );
        } else if (
          error.name === "NotFoundError" ||
          error.message.includes("device")
        ) {
          alert("Camera not found. Please check your video input device.");
        } else {
          alert(`Failed to toggle camera: ${error.message}`);
        }
      } else {
        alert("Failed to toggle camera. Please try again.");
      }
    }
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await localParticipant.setScreenShareEnabled(false);
      } else {
        await localParticipant.setScreenShareEnabled(true);
      }
    } catch (error) {
      logger.error("Failed to toggle screen share", error as Error);
    }
  };

  const getParticipantState = (
    participant: (typeof activeHuddle.participants)[0]
  ) => {
    if (!participant)
      return { isMuted: false, isSpeaking: false, isWaiting: false };

    // Compare memberId, not participant._id (which is the huddle participant ID)
    const isYou = participant.memberId === currentMember?._id;
    const isWaiting = participant?.status === "waiting";

    // For local participant, use LiveKit state
    if (isYou) {
      return {
        isMuted: !isMicrophoneEnabled,
        isSpeaking: localParticipant.isSpeaking,
        isWaiting,
      };
    }

    // For remote participants, find matching LiveKit participant
    // Identity is set to memberId when joining the room
    const liveKitParticipant = remoteParticipants.find((p) => {
      // Primary: Match by memberId (identity is set to memberId when joining)
      if (participant.memberId) {
        if (
          p.identity === participant.memberId ||
          p.identity === String(participant.memberId) ||
          p.identity === participant.memberId.toString()
        ) {
          return true;
        }
      }

      // Fallback: Match by participant ID
      if (
        p.identity === participant._id ||
        p.identity === String(participant._id)
      ) {
        return true;
      }

      // Fallback: Match by user ID
      if (participant.user?._id) {
        if (
          p.identity === participant.user._id ||
          p.identity === String(participant.user._id)
        ) {
          return true;
        }
      }

      // Fallback: Match by name
      if (participant.user) {
        const participantName = getUserDisplayName(participant.user);
        if (
          p.name === participant.user?.name ||
          p.name === participant.user?.displayName ||
          p.name === participantName
        ) {
          return true;
        }
      }

      return false;
    });

    // For remote participants, use LiveKit state if available
    if (liveKitParticipant) {
      const isMuted = !liveKitParticipant.isMicrophoneEnabled;
      const isSpeaking = liveKitParticipant.isSpeaking;

      // // Debug logging (can be removed later)
      // if (process.env.NODE_ENV === "development") {
      //   console.log("Remote participant state:", {
      //     participantId: participant._id,
      //     participantName: participant.user
      //       ? getUserDisplayName(participant.user)
      //       : "Unknown",
      //     liveKitIdentity: liveKitParticipant.identity,
      //     liveKitName: liveKitParticipant.name,
      //     isMuted,
      //     isSpeaking,
      //   });
      // }

      return {
        isMuted,
        isSpeaking,
        isWaiting,
      };
    }

    // Fallback to huddle participant state (but this might be stale)
    // Log when we can't find LiveKit participant for debugging
    if (process.env.NODE_ENV === "development") {
      logger.warn("Could not find LiveKit participant", {
        participantId: participant._id,
        participantMemberId: participant.memberId,
        participantName: participant.user
          ? getUserDisplayName(participant.user)
          : "Unknown",
        availableLiveKitParticipants: remoteParticipants.map((p) => ({
          identity: p.identity,
          name: p.name,
          isMicrophoneEnabled: p.isMicrophoneEnabled,
        })),
      });
    }

    return {
      isMuted: participant.isMuted ?? false,
      isSpeaking: false,
      isWaiting,
    };
  };

  return (
    <>
      <HuddleDialog
        activeHuddle={activeHuddle}
        workspaceId={workspaceId}
        localParticipant={localParticipant}
        remoteParticipants={remoteParticipants}
        isMicrophoneEnabled={isMicrophoneEnabled}
        isCameraEnabled={isCameraEnabled}
        isScreenSharing={isScreenSharing}
        toggleMute={toggleMute}
        toggleVideo={toggleVideo}
        toggleScreenShare={toggleScreenShare}
        getParticipantState={getParticipantState}
        onLeaveHuddle={onLeaveHuddle}
      />
      <div className="bg-[#5E2C5F] flex flex-col">
        {/* Header with headphones icon, title, and window controls */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#481349]">
          <div className="flex items-center gap-2 text-white">
            <Headphones className="size-4" />
            <span className="text-sm font-medium">Huddle</span>
          </div>
          <button
            onClick={() => setShowHuddleDialog(true)}
            className="text-white hover:bg-white/10 rounded p-1 transition-colors"
            aria-label="Minimize"
            title="Minimize"
          >
            <ExternalLink className="size-4" />
          </button>
        </div>

        {/* Screen share or Participant display area */}
        {activeScreenShareTrack && activeScreenShareTrack.publication ? (
          <div className="mx-2 my-2 bg-black rounded-lg overflow-hidden aspect-video relative cursor-pointer">
            <VideoTrack
              trackRef={activeScreenShareTrack}
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 left-2 bg-green-600 px-2 py-1 rounded flex items-center gap-1.5 z-10">
              <Monitor className="size-3 text-white" />
              <span className="text-xs font-medium text-white">
                {activeScreenShareTrack.participant.identity ===
                localParticipant.identity
                  ? "You are sharing"
                  : "Screen shared"}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="mx-2 my-2 px-3 py-4 bg-linear-to-r from-pink-400 via-yellow-300 to-blue-300 rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => {}}
          >
            <div className="flex items-center justify-center gap-2.5">
              {activeHuddle.participants.map((participant) => {
                if (!participant || !participant.user) return null;
                const state = getParticipantState(participant);
                const isActiveSpeaker = state.isSpeaking;
                const isWaiting = state.isWaiting;
                return (
                  <div key={participant._id} className="relative">
                    <Avatar
                      className={cn(
                        "size-12 rounded-lg shadow-md transition-all",
                        isActiveSpeaker &&
                          "ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent",
                        isWaiting && "opacity-50"
                      )}
                      title={
                        participant.user.name +
                        (participant.role === "host" ? " (Host)" : "") +
                        (isActiveSpeaker ? " (Speaking)" : "") +
                        (state.isMuted ? " (Muted)" : "") +
                        (isWaiting ? " (Joining...)" : "")
                      }
                    >
                      <AvatarImage
                        src={participant.user.image || undefined}
                        alt={
                          participant.user.name ||
                          participant.user.displayName ||
                          participant.user.fullName ||
                          undefined
                        }
                        className="rounded-lg"
                      />
                      <AvatarFallback className="rounded-lg bg-linear-to-br from-sky-400 to-purple-500 text-xl font-bold text-white">
                        {getUserDisplayName(participant.user)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isWaiting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                        <Loader2 className="size-5 text-white animate-spin" />
                      </div>
                    )}
                    {state.isMuted && !isWaiting && (
                      <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1">
                        <MicOff className="size-3 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Add participant card */}
              {activeHuddle.participants.length < 2 && (
                <div className="size-12 rounded-lg bg-white flex items-center justify-center shadow-md cursor-pointer hover:bg-gray-50 transition-colors">
                  <UserPlus className="size-5 text-[#5E2C5F]" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Call controls section */}
        <div className="px-3 py-2.5 bg-[#5E2C5F] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Mic button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 rounded-full border-0 transition-all text-white",
                !isMicrophoneEnabled
                  ? "bg-red-500/20 hover:bg-red-500/30"
                  : "bg-black/20 hover:bg-black/30"
              )}
              title={!isMicrophoneEnabled ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              {!isMicrophoneEnabled ? (
                <MicOff className="size-4.5" />
              ) : (
                <Mic className="size-4.5" />
              )}
            </Button>

            {/* Video button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 rounded-full border-0 transition-all text-white",
                !isCameraEnabled
                  ? "bg-black/20 hover:bg-black/30"
                  : "bg-green-500/20 hover:bg-green-500/30"
              )}
              title={!isCameraEnabled ? "Turn on camera" : "Turn off camera"}
              onClick={toggleVideo}
            >
              {!isCameraEnabled ? (
                <VideoOff className="size-4.5" />
              ) : (
                <Video className="size-4.5" />
              )}
            </Button>

            {/* Screen share button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-9 rounded-full border-0 transition-all text-white",
                !isScreenSharing
                  ? "bg-green-500/20 hover:bg-green-500/30"
                  : "bg-black/20 hover:bg-black/30"
              )}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
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
            onClick={onLeaveHuddle}
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
    </>
  );
}
