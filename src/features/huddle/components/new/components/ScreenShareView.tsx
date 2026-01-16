import {
  VideoTrack,
  TrackReferenceOrPlaceholder,
  TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { LocalParticipant, RemoteParticipant } from "livekit-client";
import { Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserDisplayName } from "@/lib/user-utils";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useGetActiveHuddle } from "@/features/huddle/api/new/use-get-active-huddle";
import { MicOff, Volume2, Loader2 } from "lucide-react";

type HuddleParticipant = NonNullable<
  ReturnType<typeof useGetActiveHuddle>["data"]
>["participants"][0];

interface ScreenShareViewProps {
  tracks: TrackReferenceOrPlaceholder[];
  localParticipant: LocalParticipant;
  remoteParticipants: RemoteParticipant[];
  activeHuddle:
    | ReturnType<typeof useGetActiveHuddle>["data"]
    | ReturnType<typeof useGetActiveHuddle>["data"];
  workspaceId: Id<"workspaces">;
  getParticipantState: (participant: HuddleParticipant) => {
    isMuted: boolean;
    isSpeaking: boolean;
    isWaiting: boolean;
  };
  isMaximized?: boolean;
  isCameraEnabled: boolean;
}

export function ScreenShareView({
  tracks,
  localParticipant,
  remoteParticipants,
  activeHuddle,
  workspaceId,
  getParticipantState,
  isMaximized = false,
  isCameraEnabled,
}: ScreenShareViewProps) {
  const { data: currentMember } = useCurrentMember({ workspaceId });

  if (!activeHuddle) return null;

  // Get screen share tracks (filter out placeholders)
  const screenShareTracks = tracks.filter(
    (track): track is TrackReference =>
      track.publication?.source === Track.Source.ScreenShare &&
      !!track.publication // Ensure it's not a placeholder
  );

  // Get camera tracks (filter out placeholders and muted tracks)
  const cameraTracks = tracks.filter(
    (track) =>
      track.publication?.source === Track.Source.Camera &&
      !!track.publication &&
      !track.publication.isMuted
  );

  // Find local and remote screen share tracks
  const localScreenShareTrack = screenShareTracks.find(
    (track) => track.participant.identity === localParticipant.identity
  );

  const remoteScreenShareTracks = screenShareTracks.filter(
    (track) => track.participant.identity !== localParticipant.identity
  );

  // If no screen sharing, return null (parent will show regular grid)
  if (!localScreenShareTrack && remoteScreenShareTracks.length === 0) {
    return null;
  }

  // Helper to find LiveKit participant by identity
  const findLiveKitParticipant = (identity: string) => {
    if (identity === localParticipant.identity) {
      return localParticipant;
    }
    return remoteParticipants.find((p) => p.identity === identity);
  };

  // Helper to find camera track for a participant
  const findCameraTrack = (participant: HuddleParticipant) => {
    if (!participant) return null;

    const isYou = participant.memberId === currentMember?._id;
    const participantIdentity = isYou
      ? localParticipant.identity
      : participant.memberId?.toString() ||
        participant._id?.toString() ||
        participant.user?._id?.toString();

    if (!participantIdentity) return null;

    return (
      cameraTracks.find(
        (track) =>
          track.publication?.source === Track.Source.Camera &&
          !!track.publication &&
          !track.publication.isMuted &&
          (track.participant.identity === participantIdentity ||
            track.participant.identity === String(participantIdentity))
      ) || null
    );
  };

  // Helper to check if participant has camera enabled
  const hasCameraEnabled = (participant: HuddleParticipant) => {
    if (!participant) return false;

    const isYou = participant.memberId === currentMember?._id;
    if (isYou) {
      return isCameraEnabled;
    }

    // For remote participants, find LiveKit participant and check camera state
    const liveKitParticipant = remoteParticipants.find((p) => {
      if (participant.memberId) {
        return (
          p.identity === participant.memberId ||
          p.identity === String(participant.memberId) ||
          p.identity === participant.memberId.toString()
        );
      }
      return false;
    });

    return liveKitParticipant?.isCameraEnabled ?? false;
  };

  // Filter participants - prioritize active speaker in small mode
  // In maximized mode, show all participants (they'll be smaller and scrollable)
  const getVisibleParticipants = () => {
    const participants = activeHuddle.participants.filter((p) => p !== null);
    if (isMaximized) return participants; // Show all in maximized mode

    // Small mode: show active speaker + up to 3 others (max 4 total)
    const sorted = [...participants].sort((a, b) => {
      if (!a || !b) return 0;
      const aState = getParticipantState(a);
      const bState = getParticipantState(b);
      if (aState.isSpeaking && !bState.isSpeaking) return -1;
      if (!aState.isSpeaking && bState.isSpeaking) return 1;
      return 0;
    });

    return sorted.slice(0, 4);
  };

  const visibleParticipants = getVisibleParticipants();
  const remainingCount = isMaximized
    ? 0
    : Math.max(
        0,
        activeHuddle.participants.length - visibleParticipants.length
      );

  return (
    <div
      className={cn(
        "flex-1 flex min-h-0 overflow-hidden",
        isMaximized ? "flex-row bg-gray-900" : "flex-col bg-gray-50"
      )}
    >
      {/* Participant Cards - Left sidebar (max) or Bottom strip (small) */}
      {isMaximized && (
        <div
          className={cn(
            "flex shrink-0 overflow-y-auto flex-col gap-2 p-3 bg-gray-900",
            "w-48" // Smaller fixed width for left sidebar
          )}
        >
          {visibleParticipants.map((participant) => {
            if (!participant || !participant.user || !participant.memberId)
              return null;
            const state = getParticipantState(participant);
            const isYou = participant.memberId === currentMember?._id;
            const isWaiting = state.isWaiting;
            const isActiveSpeaker = state.isSpeaking;

            // Check if this participant is sharing screen
            const memberId = participant.memberId;
            const liveKitParticipant = isYou
              ? localParticipant
              : memberId
              ? remoteParticipants.find(
                  (p) =>
                    p.identity === memberId ||
                    p.identity === String(memberId) ||
                    p.identity === memberId.toString()
                )
              : undefined;

            const isSharingScreen = liveKitParticipant
              ? screenShareTracks.some(
                  (track) =>
                    track.participant.identity === liveKitParticipant.identity
                )
              : false;

            const cameraTrack = findCameraTrack(participant);
            const hasCamera = hasCameraEnabled(participant) && cameraTrack && cameraTrack.publication;

            return (
              <div
                key={participant._id}
                className={cn(
                  "relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-200 transition-all shrink-0",
                  "w-full aspect-video", // Smaller cards in maximized mode
                  isSharingScreen && "ring-2 ring-green-500 ring-offset-1",
                  isActiveSpeaker && "ring-2 ring-blue-400 ring-offset-1",
                  isWaiting && "opacity-50"
                )}
              >
                {/* Show video track if camera is enabled, otherwise show avatar */}
                <div className="absolute inset-0 w-full h-full">
                  {hasCamera ? (
                    <VideoTrack
                      trackRef={cameraTrack}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Avatar className="w-full h-full rounded-lg">
                      <AvatarImage
                        src={participant.user.image || undefined}
                        className="w-full h-full object-cover"
                      />
                      <AvatarFallback className="w-full h-full text-2xl font-bold bg-linear-to-br from-sky-400 to-purple-500 text-white flex items-center justify-center rounded-lg">
                        {getUserDisplayName(participant.user)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>

                {/* Loading overlay */}
                {isWaiting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                    <Loader2 className="size-6 text-white animate-spin" />
                  </div>
                )}

                {/* Speaking indicator */}
                {isActiveSpeaker && !isWaiting && (
                  <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none animate-pulse z-10" />
                )}

                {/* Screen sharing indicator */}
                {isSharingScreen && !isWaiting && (
                  <div className="absolute top-1 right-1 bg-green-600 px-1.5 py-0.5 rounded flex items-center gap-1 z-10">
                    <Monitor className="size-2.5 text-white" />
                  </div>
                )}

                {/* Participant Name and Status */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-linear-to-t from-black/90 via-black/70 to-transparent px-1.5 py-1 z-10">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-white font-medium truncate">
                      {isYou ? "You" : getUserDisplayName(participant.user)}
                    </span>
                    {participant.role === "host" && (
                      <span className="text-[9px] text-yellow-300 font-semibold shrink-0">
                        Host
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {state.isMuted ? (
                      <MicOff className="text-red-400 size-2.5" />
                    ) : (
                      <Volume2 className="text-green-400 size-2.5" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Screen Share Display - Takes main area */}
      <div
        className={cn(
          "relative bg-black overflow-hidden min-h-0",
          isMaximized ? "flex-1" : "flex-1"
        )}
      >
        {localScreenShareTrack ? (
          <>
            <VideoTrack
              trackRef={localScreenShareTrack}
              className="w-full h-full object-contain"
            />
            <div
              className={cn(
                "absolute bg-blue-600 rounded flex items-center gap-2 z-10",
                isMaximized
                  ? "top-2 left-2 px-3 py-1.5"
                  : "top-1 left-1 px-2 py-1"
              )}
            >
              <Monitor
                className={cn("text-white", isMaximized ? "size-4" : "size-3")}
              />
              <span
                className={cn(
                  "font-medium text-white",
                  isMaximized ? "text-sm" : "text-xs"
                )}
              >
                You are sharing
              </span>
            </div>
          </>
        ) : remoteScreenShareTracks[0] ? (
          <>
            <VideoTrack
              trackRef={remoteScreenShareTracks[0]}
              className="w-full h-full object-contain"
            />
            <div
              className={cn(
                "absolute bg-green-600 rounded flex items-center gap-2 z-10",
                isMaximized
                  ? "top-2 left-2 px-3 py-1.5"
                  : "top-1 left-1 px-2 py-1"
              )}
            >
              <Monitor
                className={cn("text-white", isMaximized ? "size-4" : "size-3")}
              />
              <span
                className={cn(
                  "font-medium text-white",
                  isMaximized ? "text-sm" : "text-xs"
                )}
              >
                {(() => {
                  const liveKitParticipant = findLiveKitParticipant(
                    remoteScreenShareTracks[0].participant.identity
                  );
                  const huddleParticipant = activeHuddle.participants.find(
                    (p) =>
                      p?.memberId ===
                        remoteScreenShareTracks[0].participant.identity ||
                      String(p?.memberId) ===
                        remoteScreenShareTracks[0].participant.identity
                  );
                  const name = huddleParticipant?.user
                    ? getUserDisplayName(huddleParticipant.user)
                    : liveKitParticipant?.name ||
                      liveKitParticipant?.identity ||
                      "Someone";
                  return isMaximized
                    ? `${name} is sharing their screen`
                    : `${name} sharing`;
                })()}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {/* Participant Cards - Bottom strip (small mode only) */}
      {!isMaximized && (
        <div className="flex shrink-0 overflow-x-auto h-24 flex-row gap-2 p-2 border-t border-gray-200 bg-gray-50">
          {visibleParticipants.map((participant) => {
            if (!participant || !participant.user || !participant.memberId)
              return null;
            const state = getParticipantState(participant);
            const isYou = participant.memberId === currentMember?._id;
            const isWaiting = state.isWaiting;
            const isActiveSpeaker = state.isSpeaking;

            // Check if this participant is sharing screen
            const memberId = participant.memberId;
            const liveKitParticipant = isYou
              ? localParticipant
              : memberId
              ? remoteParticipants.find(
                  (p) =>
                    p.identity === memberId ||
                    p.identity === String(memberId) ||
                    p.identity === memberId.toString()
                )
              : undefined;

            const isSharingScreen = liveKitParticipant
              ? screenShareTracks.some(
                  (track) =>
                    track.participant.identity === liveKitParticipant.identity
                )
              : false;

            const cameraTrack = findCameraTrack(participant);
            const hasCamera = hasCameraEnabled(participant) && cameraTrack && cameraTrack.publication;

            return (
              <div
                key={participant._id}
                className={cn(
                  "relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-200 transition-all shrink-0 w-32 h-full",
                  isSharingScreen && "ring-1 ring-green-500",
                  isActiveSpeaker && "ring-1 ring-blue-400",
                  isWaiting && "opacity-50"
                )}
              >
                {/* Show video track if camera is enabled, otherwise show avatar */}
                <div className="absolute inset-0 w-full h-full">
                  {hasCamera ? (
                    <VideoTrack
                      trackRef={cameraTrack}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Avatar className="w-full h-full rounded-lg">
                      <AvatarImage
                        src={participant.user.image || undefined}
                        className="w-full h-full object-cover"
                      />
                      <AvatarFallback className="w-full h-full text-4xl font-bold bg-linear-to-br from-sky-400 to-purple-500 text-white flex items-center justify-center rounded-lg">
                        {getUserDisplayName(participant.user)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>

                {/* Loading overlay */}
                {isWaiting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg z-10">
                    <Loader2 className="size-8 text-white animate-spin" />
                  </div>
                )}

                {/* Speaking indicator */}
                {isActiveSpeaker && !isWaiting && (
                  <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none animate-pulse z-10" />
                )}

                {/* Screen sharing indicator */}
                {isSharingScreen && !isWaiting && (
                  <div className="absolute top-2 right-2 bg-green-600 px-2 py-1 rounded flex items-center gap-1 z-10">
                    <Monitor className="size-3 text-white" />
                  </div>
                )}

                {/* Participant Name and Status */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-linear-to-t from-black/90 via-black/70 to-transparent px-1.5 py-0.5 z-10">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-white font-medium truncate">
                      {isYou ? "You" : getUserDisplayName(participant.user)}
                    </span>
                    {participant.role === "host" && (
                      <span className="text-[9px] text-yellow-300 font-semibold shrink-0">
                        Host
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {state.isMuted ? (
                      <MicOff className="text-red-400 size-2.5" />
                    ) : (
                      <Volume2 className="text-green-400 size-2.5" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* "+N more" indicator for small mode */}
          {remainingCount > 0 && (
            <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-800 border border-dashed border-gray-600 shrink-0 w-32 h-full">
              <div className="text-center">
                <div className="text-sm font-bold text-gray-400 mb-0.5">
                  +{remainingCount}
                </div>
                <div className="text-[10px] text-gray-500">more</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
