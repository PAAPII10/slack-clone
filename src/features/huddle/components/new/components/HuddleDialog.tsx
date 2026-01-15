import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Settings,
  Headphones,
  Maximize2,
  Minimize2,
  Volume2,
  Loader2,
  PhoneOff,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { getUserDisplayName } from "@/lib/user-utils";
import { useShowHuddleDialog } from "../store/use-show-huddle-dialog";
import { useSettingsModal } from "@/store/use-settings-modal";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useGetHuddleByCurrentUser } from "@/features/huddle/api/use-get-huddle-by-current-user";
import { LocalParticipant, RemoteParticipant, Track } from "livekit-client";
import { useTracks } from "@livekit/components-react";
import { ScreenShareView } from "./ScreenShareView";

type HuddleParticipant = NonNullable<
  ReturnType<typeof useGetHuddleByCurrentUser>["data"]
>["participants"][0];

/**
 * Computes grid layout configuration based on participant count and dialog size
 */
function computeGridLayout(
  participantCount: number,
  isMaximized: boolean
): {
  cols: number;
  rows: number;
  maxVisible: number;
  gap: string;
  nameFontSize: string;
} {
  if (isMaximized) {
    // Maximized Dialog Mode
    if (participantCount === 1) {
      return {
        cols: 1,
        rows: 1,
        maxVisible: 1,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    } else if (participantCount === 2) {
      return {
        cols: 2,
        rows: 1,
        maxVisible: 2,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    } else if (participantCount <= 4) {
      return {
        cols: 2,
        rows: 2,
        maxVisible: 4,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    } else if (participantCount <= 6) {
      return {
        cols: 3,
        rows: 2,
        maxVisible: 6,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    } else if (participantCount <= 8) {
      return {
        cols: 4,
        rows: 2,
        maxVisible: 8,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    } else {
      // 9+ participants: 3x3 grid, show 9 max
      return {
        cols: 3,
        rows: 3,
        maxVisible: 9,
        gap: "12px",
        nameFontSize: "text-sm",
      };
    }
  } else {
    // Small Dialog Mode
    if (participantCount === 1) {
      return {
        cols: 1,
        rows: 1,
        maxVisible: 1,
        gap: "4px",
        nameFontSize: "text-xs",
      };
    } else if (participantCount === 2) {
      // Prefer vertical stack in small mode, but allow horizontal if aspect ratio allows
      return {
        cols: 1,
        rows: 2,
        maxVisible: 2,
        gap: "4px",
        nameFontSize: "text-xs",
      };
    } else if (participantCount <= 4) {
      return {
        cols: 2,
        rows: 2,
        maxVisible: 4,
        gap: "6px",
        nameFontSize: "text-xs",
      };
    } else {
      // 5+ participants: show max 4 visible, rest in +N indicator
      return {
        cols: 2,
        rows: 2,
        maxVisible: 4,
        gap: "6px",
        nameFontSize: "text-[10px]",
      };
    }
  }
}

/**
 * Sorts participants to prioritize active speaker, then returns visible subset
 */
function getVisibleParticipants(
  participants: (HuddleParticipant | null)[],
  getParticipantState: (participant: HuddleParticipant) => {
    isMuted: boolean;
    isSpeaking: boolean;
    isWaiting: boolean;
  },
  maxVisible: number,
  isMaximized: boolean
): {
  visible: HuddleParticipant[];
  remaining: number;
} {
  const validParticipants = participants.filter(
    (p): p is HuddleParticipant => p !== null && p.user !== null
  );

  if (isMaximized || validParticipants.length <= maxVisible) {
    return {
      visible: validParticipants,
      remaining: 0,
    };
  }

  // Small mode: prioritize active speaker
  const sorted = [...validParticipants].sort((a, b) => {
    const aState = getParticipantState(a);
    const bState = getParticipantState(b);
    if (aState.isSpeaking && !bState.isSpeaking) return -1;
    if (!aState.isSpeaking && bState.isSpeaking) return 1;
    return 0;
  });

  return {
    visible: sorted.slice(0, maxVisible),
    remaining: validParticipants.length - maxVisible,
  };
}

interface HuddleDialogProps {
  activeHuddle: ReturnType<typeof useGetHuddleByCurrentUser>["data"];
  workspaceId: Id<"workspaces">;
  localParticipant: LocalParticipant;
  remoteParticipants: RemoteParticipant[];
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  toggleMute: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  getParticipantState: (participant: HuddleParticipant) => {
    isMuted: boolean;
    isSpeaking: boolean;
    isWaiting: boolean;
  };
  onLeaveHuddle: () => void;
}

export function HuddleDialog({
  activeHuddle,
  workspaceId,
  localParticipant,
  remoteParticipants,
  isMicrophoneEnabled,
  isCameraEnabled,
  isScreenSharing,
  toggleMute,
  toggleVideo,
  toggleScreenShare,
  getParticipantState,
  onLeaveHuddle,
}: HuddleDialogProps) {
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const [showHuddleDialog, setShowHuddleDialog] = useShowHuddleDialog();
  const [manualMaximized, setManualMaximized] = useState<boolean | null>(null);
  const [, , openSettings] = useSettingsModal();

  // Get tracks for screen sharing
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  // Check if screen sharing is active
  const screenShareTracks = tracks.filter(
    (track) => track.publication?.source === Track.Source.ScreenShare
  );
  const hasScreenShare =
    screenShareTracks.some(
      (track) => track.participant.identity === localParticipant.identity
    ) || screenShareTracks.length > 0;

  // Derive maximized state: auto-maximize when screen sharing, but allow manual override
  const isMaximized =
    manualMaximized !== null ? manualMaximized : hasScreenShare;

  if (!activeHuddle) return null;

  const otherParticipant = activeHuddle.participants.filter(
    (participant) => participant?.memberId !== currentMember?._id
  );

  const huddleTitle = `Huddle with ${
    otherParticipant.length === 1 && otherParticipant[0]?.user?.name
      ? otherParticipant[0].user?.name
      : otherParticipant.length > 1
      ? `${otherParticipant.length} people`
      : "No participants"
  }`;

  return (
    <Dialog open={showHuddleDialog} onOpenChange={setShowHuddleDialog}>
      <DialogContent
        className={`${
          isMaximized ? "h-[95vh]" : "h-[50vh]"
        } p-0 overflow-hidden flex flex-col transition-all duration-300`}
        style={{
          maxWidth: isMaximized ? "98vw" : "42rem",
          width: isMaximized ? "98vw" : "100%",
        }}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{huddleTitle}</DialogTitle>
        {/* Thin Header */}
        <div className="bg-white px-6 py-3 flex items-center justify-between shrink-0 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-[#5E2C5F] flex items-center justify-center">
              <Headphones className="size-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">
                Huddle with{" "}
                {otherParticipant.length === 1 &&
                otherParticipant[0]?.user?.name
                  ? otherParticipant[0].user?.name
                  : otherParticipant.length > 1
                  ? `${otherParticipant.length} people`
                  : "No participants"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setManualMaximized(!isMaximized)}
              className="size-8 hover:bg-gray-100"
              title={isMaximized ? "Minimize" : "Maximize"}
            >
              {isMaximized ? (
                <Minimize2 className="size-4 text-gray-600" />
              ) : (
                <Maximize2 className="size-4 text-gray-600" />
              )}
            </Button>
          </div>
        </div>

        {/* Participant View Area */}
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col min-h-0">
          {hasScreenShare ? (
            <ScreenShareView
              tracks={tracks}
              localParticipant={localParticipant}
              remoteParticipants={remoteParticipants}
              activeHuddle={activeHuddle}
              workspaceId={workspaceId}
              getParticipantState={(participant) =>
                getParticipantState(participant as HuddleParticipant)
              }
              isMaximized={isMaximized}
            />
          ) : activeHuddle.participants.length > 0 ? (
            <ParticipantGrid
              participants={activeHuddle.participants}
              currentMember={currentMember}
              getParticipantState={getParticipantState}
              isMaximized={isMaximized}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Headphones className="size-12 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No participants</p>
              </div>
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="bg-[#5E2C5F] px-6 py-4 flex items-center justify-center shrink-0 border-t border-[#481349]">
          <div className="flex items-center gap-3">
            {/* Mic button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-11 rounded-full transition-all text-white",
                !isMicrophoneEnabled
                  ? "bg-red-500/20 hover:bg-red-500/30"
                  : "bg-white/10 hover:bg-white/20"
              )}
              title={!isMicrophoneEnabled ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              {!isMicrophoneEnabled ? (
                <MicOff className="size-5" />
              ) : (
                <Mic className="size-5" />
              )}
            </Button>

            {/* Video button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-11 rounded-full transition-all text-white",
                !isCameraEnabled
                  ? "bg-gray-500/20 hover:bg-gray-500/30"
                  : "bg-white/10 hover:bg-white/20"
              )}
              title={!isCameraEnabled ? "Turn on camera" : "Turn off camera"}
              onClick={toggleVideo}
            >
              {!isCameraEnabled ? (
                <VideoOff className="size-5" />
              ) : (
                <Video className="size-5" />
              )}
            </Button>

            {/* Screen share button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-11 rounded-full transition-all text-white",
                isScreenSharing
                  ? "bg-green-500/20 hover:bg-green-500/30"
                  : "bg-white/10 hover:bg-white/20"
              )}
              title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
              onClick={toggleScreenShare}
            >
              <Monitor className="size-5" />
            </Button>

            {/* Settings button */}
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
              onClick={() => openSettings("audio-video")}
              title="Settings"
            >
              <Settings className="size-5" />
            </Button>

            {/* Leave/Hangup button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onLeaveHuddle}
              className="size-11 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all ml-2"
              title="Leave huddle"
            >
              <PhoneOff className="size-5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Participant Grid Component - Dialog-aware layout
 */
function ParticipantGrid({
  participants,
  currentMember,
  getParticipantState,
  isMaximized,
}: {
  participants: (HuddleParticipant | null)[];
  currentMember: ReturnType<typeof useCurrentMember>["data"];
  getParticipantState: (participant: HuddleParticipant) => {
    isMuted: boolean;
    isSpeaking: boolean;
    isWaiting: boolean;
  };
  isMaximized: boolean;
}) {
  const participantCount = participants.length;
  const layout = useMemo(
    () => computeGridLayout(participantCount, isMaximized),
    [participantCount, isMaximized]
  );

  const { visible, remaining } = useMemo(
    () =>
      getVisibleParticipants(
        participants,
        getParticipantState,
        layout.maxVisible,
        isMaximized
      ),
    [participants, getParticipantState, layout.maxVisible, isMaximized]
  );

  // For 2 participants in small mode, use horizontal layout if space allows
  const useHorizontalForTwo =
    !isMaximized &&
    participantCount === 2 &&
    layout.cols === 1 &&
    layout.rows === 2;

  // Map grid columns/rows to Tailwind classes
  const gridColsClass = useMemo(() => {
    const cols = useHorizontalForTwo ? 2 : layout.cols;
    if (cols === 1) return "grid-cols-1";
    if (cols === 2) return "grid-cols-2";
    if (cols === 3) return "grid-cols-3";
    if (cols === 4) return "grid-cols-4";
    return "grid-cols-1";
  }, [layout.cols, useHorizontalForTwo]);

  const gridRowsClass = useMemo(() => {
    const rows = useHorizontalForTwo ? 1 : layout.rows;
    if (rows === 1) return "grid-rows-1";
    if (rows === 2) return "grid-rows-2";
    if (rows === 3) return "grid-rows-3";
    return "grid-rows-1";
  }, [layout.rows, useHorizontalForTwo]);

  return (
    <div
      className={cn(
        "flex items-center justify-center h-full overflow-auto",
        isMaximized ? "p-4" : "p-2"
      )}
    >
      <div
        className={cn(
          "w-full h-full max-w-7xl mx-auto grid",
          gridColsClass,
          gridRowsClass
        )}
        style={{
          gap: layout.gap,
          gridAutoRows: "1fr",
        }}
      >
        {visible.map((participant, index) => {
          if (!participant?.user) return null;
          const state = getParticipantState(participant);
          const isYou = participant.memberId === currentMember?._id;
          const isWaiting = state.isWaiting;
          const isActiveSpeaker = state.isSpeaking;

          // For 3 participants in small mode, make third one span 2 columns
          const shouldSpanTwoColumns =
            !isMaximized &&
            participantCount === 3 &&
            index === 2 &&
            layout.cols === 2;

          return (
            <ParticipantCard
              key={participant._id}
              participant={participant}
              isYou={isYou}
              isWaiting={isWaiting}
              isActiveSpeaker={isActiveSpeaker}
              isMuted={state.isMuted}
              shouldSpanTwoColumns={shouldSpanTwoColumns}
              nameFontSize={layout.nameFontSize}
            />
          );
        })}

        {/* "+N more" indicator for small mode with 5+ participants */}
        {remaining > 0 && (
          <div
            className={cn(
              "relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-800 border-2 border-dashed border-gray-600 transition-all",
              isMaximized ? "border-gray-500" : "border-gray-600"
            )}
            style={{
              borderRadius: isMaximized ? "12px" : "8px",
            }}
          >
            <div className="text-center">
              <div
                className={cn(
                  "font-bold text-gray-400",
                  isMaximized ? "text-2xl mb-2" : "text-lg mb-1"
                )}
              >
                +{remaining}
              </div>
              <div
                className={cn(
                  "text-gray-500",
                  isMaximized ? "text-sm" : "text-xs"
                )}
              >
                more
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Individual Participant Card Component
 */
function ParticipantCard({
  participant,
  isYou,
  isWaiting,
  isActiveSpeaker,
  isMuted,
  shouldSpanTwoColumns,
  nameFontSize,
}: {
  participant: HuddleParticipant;
  isYou: boolean;
  isWaiting: boolean;
  isActiveSpeaker: boolean;
  isMuted: boolean;
  shouldSpanTwoColumns: boolean;
  nameFontSize: string;
}) {
  // Runtime check - should never happen due to filtering above, but TypeScript needs it
  if (!participant?.user) return null;

  // TypeScript now knows participant and participant.user are non-null
  const user = participant.user;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-900 transition-all shadow-lg border-2 w-full h-full min-h-0",
        shouldSpanTwoColumns && "col-span-2",
        // Active speaker highlight - visible in both small and max
        isActiveSpeaker && !isWaiting
          ? "border-blue-400 ring-2 ring-blue-400 ring-offset-1"
          : "border-transparent",
        isWaiting && "opacity-60"
      )}
      style={{
        borderRadius: "8px",
      }}
    >
      {/* Background with gradient - Google Meet/Slack style */}
      <div className="absolute inset-0 w-full h-full">
        <Avatar className="w-full h-full rounded-lg">
          <AvatarImage
            src={user.image || undefined}
            className="w-full h-full object-cover"
          />
          <AvatarFallback className="w-full h-full text-4xl font-bold bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 text-white flex items-center justify-center rounded-lg shadow-inner">
            {getUserDisplayName(user).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Loading overlay for waiting participants */}
      {isWaiting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-10 backdrop-blur-sm">
          <Loader2 className="size-8 text-white animate-spin" />
        </div>
      )}

      {/* Active speaker glow effect - subtle but noticeable */}
      {isActiveSpeaker && !isWaiting && (
        <div className="absolute inset-0 bg-blue-400/20 rounded-lg pointer-events-none animate-pulse z-5" />
      )}

      {/* Participant Name and Status Bar - Google Meet/Slack style */}
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/70 to-transparent px-3 py-2.5 z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={cn(
                "font-semibold text-white truncate drop-shadow-md",
                nameFontSize
              )}
            >
              {isYou ? "You" : getUserDisplayName(user)}
            </span>
            {participant.role === "host" && (
              <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500 text-yellow-900 font-bold rounded shrink-0 shadow-sm">
                HOST
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isMuted ? (
              <div className="bg-red-500 rounded-full p-1 shadow-md">
                <MicOff className="size-3 text-white" />
              </div>
            ) : (
              <div className="bg-green-500 rounded-full p-1 shadow-md">
                <Volume2 className="size-3 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
