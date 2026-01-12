import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback } from "react";

interface UseMarkChannelAsReadProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useMarkChannelAsRead({
  onSuccess,
  onError,
}: UseMarkChannelAsReadProps = {}) {
  const mutation = useMutation(api.readState.markChannelAsRead);

  const markAsRead = useCallback(
    async (channelId: Id<"channels">, messageId?: Id<"messages">) => {
      try {
        await mutation({ channelId, messageId });
        onSuccess?.();
      } catch (error) {
        console.error("Failed to mark channel as read:", error);
        onError?.(error as Error);
      }
    },
    [mutation, onSuccess, onError]
  );

  return { markAsRead };
}
