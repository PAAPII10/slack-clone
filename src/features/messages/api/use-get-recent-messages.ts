import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetRecentMessagesProps {
  workspaceId: Id<"workspaces">;
  limit?: number;
}

export function useGetRecentMessages({
  workspaceId,
  limit,
}: UseGetRecentMessagesProps) {
  return useQuery(api.messages.getRecentForNotifications, {
    workspaceId,
    limit,
  });
}
