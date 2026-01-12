import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetConversationProps {
  workspaceId: Id<"workspaces"> | undefined;
  memberId: Id<"members"> | undefined;
}

export function useGetConversation({
  workspaceId,
  memberId,
}: UseGetConversationProps) {
  return useQuery(
    api.conversations.getByMembers,
    workspaceId && memberId
      ? {
          workspaceId,
          memberId,
        }
      : "skip"
  );
}
