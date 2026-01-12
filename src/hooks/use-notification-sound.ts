import { useEffect, useRef } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { playNotificationSound } from "@/lib/sound-manager";
import { useGetSoundPreferences } from "@/features/userPreferences/api/use-get-sound-preferences";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

interface UseNotificationSoundProps {
  messages?: Array<{
    _id: Id<"messages">;
    memberId: Id<"members">;
    _creationTime: number;
  }>;
  currentMemberId?: Id<"members">;
  enabled?: boolean;
}

/**
 * Hook to play notification sounds when new messages arrive
 * Only plays sound for messages not sent by the current user
 */
export function useNotificationSound({
  messages,
  currentMemberId,
  enabled = true,
}: UseNotificationSoundProps) {
  const workspaceId = useWorkspaceId();
  const previousMessageIdsRef = useRef<Set<Id<"messages">>>(new Set());
  const isInitialMountRef = useRef(true);
  const { data: soundPrefs } = useGetSoundPreferences({
    workspaceId: workspaceId!,
  });

  useEffect(() => {
    if (!enabled || !messages || messages.length === 0 || !workspaceId) {
      return;
    }

    // Skip sound on initial mount to avoid playing sounds for existing messages
    if (isInitialMountRef.current) {
      // Store all current message IDs
      messages.forEach((message) => {
        previousMessageIdsRef.current.add(message._id);
      });
      isInitialMountRef.current = false;
      return;
    }

    // Find new messages (messages that weren't in the previous set)
    const newMessages = messages.filter(
      (message) =>
        !previousMessageIdsRef.current.has(message._id) &&
        message.memberId !== currentMemberId
    );

    // Play sound for each new message from other users
    if (newMessages.length > 0 && soundPrefs) {
      // Use preferences from Convex
      if (soundPrefs.enabled) {
        playNotificationSound(soundPrefs.soundType, soundPrefs.volume);
      }

      // Update the set of known message IDs
      messages.forEach((message) => {
        previousMessageIdsRef.current.add(message._id);
      });
    } else {
      // Still update the set even if no new messages (in case of reordering)
      messages.forEach((message) => {
        previousMessageIdsRef.current.add(message._id);
      });
    }
  }, [messages, currentMemberId, enabled, soundPrefs, workspaceId]);
}
