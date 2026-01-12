import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseMarkConversationAsReadProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useMarkConversationAsRead({
  onSuccess,
  onError,
}: UseMarkConversationAsReadProps = {}) {
  const mutate = useMutation(api.readState.markConversationAsRead);

  return {
    markAsRead: (conversationId: Id<"conversations">, messageId?: Id<"messages">) => {
      mutate(
        { conversationId, messageId },
        {
          onSuccess,
          onError: (error) => {
            console.error("Failed to mark conversation as read:", error);
            onError?.(error as Error);
          },
        }
      );
    },
  };
}
