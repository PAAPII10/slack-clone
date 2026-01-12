import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback, useEffect, useRef } from "react";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

interface UseTypingProps {
  channelId?: Id<"channels">;
  conversationId?: Id<"conversations">;
  enabled?: boolean;
}

/**
 * Hook to manage typing indicators
 * Handles emitting typing start/stop events with debouncing
 */
export function useTyping({
  channelId,
  conversationId,
  enabled = true,
}: UseTypingProps) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const startTyping = useMutation(api.typing.startTyping);
  const stopTyping = useMutation(api.typing.stopTyping);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const lastTypingEventRef = useRef<number>(0);

  // Debounce delay: send typing event at most once every 1 second
  const TYPING_THROTTLE_MS = 1000;
  // Stop typing after 2.5 seconds of inactivity
  const TYPING_STOP_DELAY_MS = 2500;

  const emitTypingStart = useCallback(() => {
    if (!enabled || !workspaceId || (!channelId && !conversationId)) {
      return;
    }

    const now = Date.now();
    const timeSinceLastEvent = now - lastTypingEventRef.current;

    // Throttle typing events
    if (timeSinceLastEvent < TYPING_THROTTLE_MS && isTypingRef.current) {
      return;
    }

    lastTypingEventRef.current = now;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping({
        workspaceId,
        channelId,
        conversationId,
      }).catch(() => {
        // Ignore errors - typing is best effort
      });
    } else {
      // Update existing typing state
      startTyping({
        workspaceId,
        channelId,
        conversationId,
      }).catch(() => {
        // Ignore errors
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing after inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping({
          workspaceId,
          channelId,
          conversationId,
        }).catch(() => {
          // Ignore errors
        });
      }
    }, TYPING_STOP_DELAY_MS);
  }, [enabled, workspaceId, channelId, conversationId, startTyping, stopTyping]);

  const emitTypingStop = useCallback(() => {
    if (!enabled || !workspaceId || (!channelId && !conversationId)) {
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping({
        workspaceId,
        channelId,
        conversationId,
      }).catch(() => {
        // Ignore errors
      });
    }
  }, [enabled, workspaceId, channelId, conversationId, stopTyping]);

  // Cleanup on unmount or when dependencies change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping({
          workspaceId,
          channelId,
          conversationId,
        }).catch(() => {
          // Ignore errors
        });
      }
    };
  }, [workspaceId, channelId, conversationId, stopTyping]);

  return {
    emitTypingStart,
    emitTypingStop,
  };
}

interface UseTypingIndicatorProps {
  channelId?: Id<"channels">;
  conversationId?: Id<"conversations">;
  enabled?: boolean;
}

/**
 * Hook to get currently typing users for display
 */
export function useTypingIndicator({
  channelId,
  conversationId,
  enabled = true,
}: UseTypingIndicatorProps) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });

  const typingUsers = useQuery(
    api.typing.getTypingUsers,
    enabled && currentMember && (channelId || conversationId)
      ? {
          channelId,
          conversationId,
          currentMemberId: currentMember._id,
        }
      : "skip"
  );

  return typingUsers ?? [];
}
