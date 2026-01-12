import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetConversationUnreadCountProps {
  conversationId: Id<"conversations">;
}

export function useGetConversationUnreadCount({
  conversationId,
}: UseGetConversationUnreadCountProps) {
  const data = useQuery(api.readState.getConversationUnreadCount, {
    conversationId,
  });
  const isLoading = data === undefined;
  return { data: data ?? 0, isLoading };
}
