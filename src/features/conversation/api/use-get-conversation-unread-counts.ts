import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetConversationUnreadCountsProps {
  workspaceId: Id<"workspaces">;
}

export function useGetConversationUnreadCounts({
  workspaceId,
}: UseGetConversationUnreadCountsProps) {
  const data = useQuery(api.readState.getConversationUnreadCounts, {
    workspaceId,
  });
  const isLoading = data === undefined;
  return { data: data || {}, isLoading };
}
