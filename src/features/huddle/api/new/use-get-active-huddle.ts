import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { getUserDisplayName } from "@/lib/user-utils";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useShowHuddleDialog } from "../../components/new/store/use-show-huddle-dialog";
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { useJoinHuddle } from "./use-join-huddle";
import { logger } from "@/lib/logger";

interface UseGetActiveHuddleProps {
  workspaceId: Id<"workspaces">;
}

export function useGetActiveHuddle({ workspaceId }: UseGetActiveHuddleProps) {
  const [, setShowHuddleDialog] = useShowHuddleDialog();
  const [liveKitToken, setLiveKitToken] = useLiveKitToken();
  const shouldFetch = isValidConvexId(workspaceId);
  const data = useQuery(
    api.huddles.getCurrentMemberActiveHuddle,
    shouldFetch ? { workspaceId } : "skip"
  );
  const isLoading = data === undefined;
  const { mutate: joinHuddle, isPending: isJoining } = useJoinHuddle();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const isRoomConnected = !!liveKitToken?.token && !!liveKitToken?.url;

  // Track if we've already attempted to join this huddle to prevent infinite loops
  const hasAttemptedJoinRef = useRef<string | null>(null);

  // Auto-join huddle when active huddle is found and user is not connected
  useEffect(() => {
    // Skip if:
    // - Still loading
    // - No huddle data
    // - Already connected to room
    // - Already joining
    // - No current member
    // - Already attempted to join this huddle
    if (
      isLoading ||
      !data ||
      isRoomConnected ||
      isJoining ||
      !currentMember ||
      !currentMember.user ||
      hasAttemptedJoinRef.current === data._id
    ) {
      return;
    }

    // Mark that we're attempting to join this huddle
    hasAttemptedJoinRef.current = data._id;

    joinHuddle(
      {
        huddleId: data._id,
        workspaceId,
        memberId: currentMember._id,
        participantName: getUserDisplayName(currentMember.user),
      },
      {
        onSuccess: (result) => {
          setShowHuddleDialog(true);
          setLiveKitToken({ token: result.token, url: result.url });
        },
        onError: (error) => {
          logger.error("Failed to join huddle", error as Error);
          // Reset the ref on error so we can retry if needed
          hasAttemptedJoinRef.current = null;
        },
      }
    );
  }, [
    data,
    isLoading,
    isRoomConnected,
    isJoining,
    currentMember,
    workspaceId,
    joinHuddle,
    setShowHuddleDialog,
    setLiveKitToken,
  ]);

  // Reset the ref when huddle changes or user leaves
  useEffect(() => {
    if (!data) {
      hasAttemptedJoinRef.current = null;
    }
  }, [data]);
  const hasActiveHuddle = data !== null && data !== undefined;
  return { data, isLoading, hasActiveHuddle };
}
