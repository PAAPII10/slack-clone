import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseMarkChannelAsReadProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useMarkChannelAsRead({
  onSuccess,
  onError,
}: UseMarkChannelAsReadProps = {}) {
  const mutate = useMutation(api.readState.markChannelAsRead);

  return {
    markAsRead: (channelId: Id<"channels">, messageId?: Id<"messages">) => {
      mutate(
        { channelId, messageId },
        {
          onSuccess,
          onError: (error) => {
            console.error("Failed to mark channel as read:", error);
            onError?.(error as Error);
          },
        }
      );
    },
  };
}
