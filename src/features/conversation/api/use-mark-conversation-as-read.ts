import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback } from "react";

interface UseMarkConversationAsReadProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useMarkConversationAsRead({
  onSuccess,
  onError,
}: UseMarkConversationAsReadProps = {}) {
  const mutation = useMutation(api.readState.markConversationAsRead);

  const markAsRead = useCallback(
    async (conversationId: Id<"conversations">, messageId?: Id<"messages">) => {
      try {
        await mutation({ conversationId, messageId });
        onSuccess?.();
      } catch (error) {
        console.error("Failed to mark conversation as read:", error);
        onError?.(error as Error);
      }
    },
    [mutation, onSuccess, onError]
  );

  return { markAsRead };
}
