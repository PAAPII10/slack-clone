import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Id } from "../../convex/_generated/dataModel";
import { playNotificationSound } from "@/lib/sound-manager";
import { useGetSoundPreferences } from "@/features/userPreferences/api/use-get-sound-preferences";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useGetRecentMessages } from "@/features/messages/api/use-get-recent-messages";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useChannelId } from "@/hooks/use-channel-id";
import { useMemberId } from "@/hooks/use-member-id";
import { useGetConversation } from "@/features/conversation/api/use-get-conversation";
import { extractPlainTextFromQuill } from "@/lib/utils";

/**
 * Global notification hook that monitors all messages in the workspace
 * and triggers notifications when messages arrive in different conversations/channels
 */
export function useGlobalNotifications() {
  const workspaceId = useWorkspaceId();
  const pathname = usePathname();
  const channelId = useChannelId();
  const memberId = useMemberId();
  const previousMessageIdsRef = useRef<Set<Id<"messages">>>(new Set());
  const isInitialMountRef = useRef(true);

  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: soundPrefs } = useGetSoundPreferences({
    workspaceId: workspaceId!,
  });

  // Get current conversation ID if we're on a member page
  const currentConversationId = useGetConversation({
    workspaceId,
    memberId,
  });

  // Get recent messages for notifications
  const recentMessages = useGetRecentMessages({
    workspaceId: workspaceId!,
    limit: 50,
  });

  useEffect(() => {
    if (
      !workspaceId ||
      !recentMessages ||
      recentMessages.length === 0 ||
      !currentMember
    ) {
      return;
    }

    // Skip on initial mount
    if (isInitialMountRef.current) {
      recentMessages.forEach((message) => {
        previousMessageIdsRef.current.add(message._id);
      });
      isInitialMountRef.current = false;
      return;
    }

    // Find new messages (not sent by current user and not in previous set)
    const newMessages = recentMessages.filter(
      (message) =>
        !previousMessageIdsRef.current.has(message._id) &&
        message.memberId !== currentMember._id
    );

    if (newMessages.length === 0) {
      // Still update the set even if no new messages
      recentMessages.forEach((message) => {
        previousMessageIdsRef.current.add(message._id);
      });
      return;
    }

    // Check if we're viewing a different conversation/channel
    for (const message of newMessages) {
      let isInCurrentView = false;

      // Check if message is in the current channel
      if (message.channelId && channelId) {
        isInCurrentView = message.channelId === channelId;
      }

      // Check if message is in the current conversation
      if (!isInCurrentView && message.conversationId && currentConversationId) {
        isInCurrentView = message.conversationId === currentConversationId;
      }

      // Phase 5: Check if current user is mentioned in this message
      const isMentioned = message.mentions?.includes(currentMember._id) ?? false;

      // Notify if:
      // 1. Message is NOT in the current view, OR
      // 2. Current user is mentioned (even if in current view, mentions should be highlighted)
      const shouldNotify = !isInCurrentView || isMentioned;

      if (shouldNotify) {
        // Play sound notification
        // Phase 5: Always play sound for mentions, even if in current view
        if (soundPrefs?.enabled) {
          playNotificationSound(soundPrefs.soundType, soundPrefs.volume);
        }

        // Show browser notification (only if enabled in preferences)
        if (
          soundPrefs?.browserNotificationsEnabled &&
          typeof window !== "undefined" &&
          "Notification" in window
        ) {
          // Request permission if not already granted
          if (Notification.permission === "default") {
            Notification.requestPermission();
          } else if (Notification.permission === "granted") {
            // Get display name (displayName || fullName || name)
            const user = message.user as { name?: string; displayName?: string; fullName?: string };
            const userDisplayName = user.displayName || user.fullName || user.name || "Someone";
            
            // Phase 5: Special title for mentions
            const title: string = isMentioned
              ? `${userDisplayName} mentioned you`
              : message.channelId
              ? `New message in channel`
              : userDisplayName;
            
            // Extract plain text from Quill Delta JSON (async)
            extractPlainTextFromQuill(message.body).then((plainText) => {
              const body = plainText
                ? plainText.length > 100
                  ? plainText.substring(0, 100) + "..."
                  : plainText
                : "New message";

              new Notification(title, {
                body,
                icon: message.user.image || undefined,
                tag: message._id, // Prevent duplicate notifications
                // Phase 5: Add badge/priority for mentions (if supported)
                ...(isMentioned && { badge: message.user.image || undefined }),
              });
            });
          }
        }
      }
    }

    // Update the set of known message IDs
    recentMessages.forEach((message) => {
      previousMessageIdsRef.current.add(message._id);
    });
  }, [
    recentMessages,
    currentMember,
    workspaceId,
    channelId,
    memberId,
    currentConversationId,
    pathname,
    soundPrefs,
  ]);
}
