"use client";

import { useState, useMemo } from "react";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { HuddleBar } from "./HuddleBar";
import { HuddleDialog } from "./HuddleDialog";
import { HuddleMediaProvider, useHuddleMedia } from "./HuddleMediaProvider";
import { useGetHuddleByCurrentUser } from "../api/use-get-huddle-by-current-user";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { useGetMember } from "@/features/members/api/use-get-member";
import { getUserDisplayName } from "@/lib/user-utils";
import type { HuddleSharedData } from "./HuddleBar";
import { Id } from "../../../../convex/_generated/dataModel";

/**
 * Inner component that has access to HuddleMedia context
 * Used to track mute status of participants from LiveKit
 */
function HuddleCallInner({
  sharedData,
  isDialogOpen,
  handleDialogOpenChange,
}: {
  sharedData: HuddleSharedData;
  isDialogOpen: boolean;
  handleDialogOpenChange: (open: boolean) => void;
}) {
  // Get mute status for all participants from HuddleMedia context
  const { participantsMuteStatus } = useHuddleMedia();

  // Update display participants with real mute status from LiveKit
  const displayParticipantsWithMuteStatus = useMemo(() => {
    return sharedData.displayParticipants.map((participant) => {
      const muteStatus = participantsMuteStatus.get(participant.id);
      return {
        ...participant,
        isMuted: muteStatus?.isMuted ?? participant.isMuted,
        isSpeaking: muteStatus?.isSpeaking ?? false,
      };
    });
  }, [sharedData.displayParticipants, participantsMuteStatus]);

  // Create updated shared data with mute status
  const sharedDataWithMuteStatus = useMemo(
    () => ({
      ...sharedData,
      displayParticipants: displayParticipantsWithMuteStatus,
    }),
    [sharedData, displayParticipantsWithMuteStatus]
  );

  return (
    <>
      <HuddleDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        sharedData={sharedDataWithMuteStatus}
      />
      <HuddleBar sharedData={sharedDataWithMuteStatus} />
    </>
  );
}

/**
 * Unified HuddleCall Component
 *
 * Single source of truth for huddle data and state management.
 * Fetches all shared data once and passes it to HuddleBar and HuddleDialog.
 * Manages HuddleMediaProvider for WebRTC connections.
 * Handles dialog open/close state here.
 * Dialog opens automatically when huddle.isActive === true
 */
export function HuddleCall() {
  const workspaceId = useWorkspaceId();

  // Get active huddle for current user
  const { data: huddle } = useGetHuddleByCurrentUser({ workspaceId });

  // Get current member
  const { data: currentMember } = useCurrentMember({ workspaceId });

  // Get channel if huddle source is channel
  const { data: channel } = useGetChannel({
    id: huddle?.channelId || ("" as Id<"channels">),
  });

  // Get member if huddle source is DM (need to find other member in conversation)
  const otherMemberId = useMemo(() => {
    if (!huddle || huddle.sourceType !== "dm" || !currentMember) return null;
    // Find the other member in participants
    // Participants structure: { ...user, member }
    const otherParticipant = huddle.participants?.find(
      (p) => p && p.member && p.member._id !== currentMember._id
    );
    return otherParticipant?.member._id || null;
  }, [huddle, currentMember]);

  const { data: member } = useGetMember({
    id: otherMemberId || ("" as Id<"members">),
  });

  // Auto-open dialog when huddle becomes active
  // Derive dialog state from huddle.isActive, but allow manual override
  const shouldDialogBeOpen = huddle?.isActive === true;

  // Track if user manually closed the dialog per huddle
  const [closedHuddleIds, setClosedHuddleIds] = useState<Set<Id<"huddles">>>(
    new Set()
  );

  // Check if current huddle is closed
  const isCurrentHuddleClosed = huddle
    ? closedHuddleIds.has(huddle._id)
    : false;

  // Derive dialog state directly - no need for effects or additional state
  // Dialog should be open if:
  // 1. Huddle is active, AND
  // 2. User hasn't manually closed this specific huddle
  // This prevents flicker during status transitions because we only care about
  // the huddle ID and user action, not intermediate status changes
  const isDialogOpen = shouldDialogBeOpen && !isCurrentHuddleClosed;

  // Build shared data
  const sharedData = useMemo((): HuddleSharedData | null => {
    if (!huddle || !workspaceId || !currentMember) return null;

    // Only show if huddle is active
    if (!huddle.isActive) return null;

    // Determine huddle title
    const huddleTitle =
      huddle.sourceType === "channel"
        ? channel?.name || "Channel"
        : huddle.sourceType === "dm"
        ? getUserDisplayName(member?.user || {})
        : "Huddle";

    // Build display participants from huddle.participants
    // Participants structure: { ...user, member, participantStatus }
    const displayParticipants =
      huddle.participants
        ?.filter(
          (p): p is NonNullable<typeof p> => p !== null && p.member !== null
        )
        .map((p) => ({
          id: p.member._id,
          name: getUserDisplayName(p),
          image: p.image || undefined,
          isYou: p.member._id === currentMember._id,
          role: (p.member._id === huddle.createdBy ? "host" : "participant") as
            | "host"
            | "participant",
          isMuted: false, // Will be updated by LiveKit mute status in HuddleCallInner
          isSpeaking: false, // Will be updated by LiveKit in HuddleCallInner
          status: (
            p as typeof p & {
              participantStatus?: "waiting" | "joined" | "left";
            }
          ).participantStatus,
        })) || [];

    // Build activeHuddle object
    // Calculate duration: if ended, use endedAt - startedAt, otherwise use 0 (will be calculated on client)
    const duration = huddle.endedAt ? huddle.endedAt - huddle.startedAt : 0;

    const activeHuddle = {
      _id: huddle._id,
      workspaceId: huddle.workspaceId,
      sourceType: huddle.sourceType,
      channelId: huddle.channelId,
      conversationId: huddle.conversationId,
      createdBy: huddle.createdBy,
      isActive: huddle.isActive,
      createdAt: huddle.createdAt,
      startedAt: huddle.startedAt,
      endedAt: huddle.endedAt,
      duration,
    };

    return {
      workspaceId,
      currentMember,
      channel:
        huddle.sourceType === "channel" ? channel ?? undefined : undefined,
      member: huddle.sourceType === "dm" ? member ?? undefined : undefined,
      activeHuddle,
      effectiveHuddleId: huddle._id,
      isHuddleActive: huddle.isActive,
      huddleTitle,
      displayParticipants,
      disconnectedHuddle: null, // TODO: Implement disconnected huddle detection if needed
      isDialogOpen,
      onToggleDialog: () => {
        if (huddle) {
          setClosedHuddleIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(huddle._id)) {
              newSet.delete(huddle._id);
            } else {
              newSet.add(huddle._id);
            }
            return newSet;
          });
        }
      },
    };
  }, [huddle, workspaceId, currentMember, channel, member, isDialogOpen]);

  // Handle dialog open/close
  const handleDialogOpenChange = (open: boolean) => {
    if (huddle) {
      setClosedHuddleIds((prev) => {
        const newSet = new Set(prev);
        if (!open) {
          newSet.add(huddle._id);
        } else {
          newSet.delete(huddle._id);
        }
        return newSet;
      });
    }
  };

  // Don't render anything if no active huddle
  if (!huddle || !huddle.isActive || !sharedData) return null;

  return (
    <HuddleMediaProvider enabled={true}>
      <HuddleCallInner
        sharedData={sharedData}
        isDialogOpen={isDialogOpen}
        handleDialogOpenChange={handleDialogOpenChange}
      />
    </HuddleMediaProvider>
  );
}
