import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetMemberBySourceProps {
  conversationId?: Id<"conversations">;
  channelId?: Id<"channels">;
  workspaceId: Id<"workspaces">;
}

export function useGetMemberBySource({
  conversationId,
  channelId,
  workspaceId,
}: UseGetMemberBySourceProps) {
  const shouldFetch =
    isValidConvexId(conversationId) ||
    (isValidConvexId(channelId) && isValidConvexId(workspaceId));

  const data = useQuery(
    api.members.getMembersBySourceId,
    shouldFetch ? { conversationId, channelId, workspaceId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
