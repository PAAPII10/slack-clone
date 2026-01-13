import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { isValidConvexId } from "@/lib/utils";

interface UseIsTypingToMemberProps {
  memberId?: Id<"members">;
}

/**
 * Hook to check if a specific member is typing to the current user
 * Returns true if the member is actively typing in the conversation with the current user
 */
export function useIsTypingToMember({ memberId }: UseIsTypingToMemberProps) {
  const workspaceId = useWorkspaceId();

  const { data: currentMember } = useCurrentMember({
    workspaceId: memberId ? workspaceId : undefined,
  });

  // Get conversationId for this member
  const conversationId = useQuery(
    api.conversations.getByMembers,
    workspaceId && isValidConvexId(memberId)
      ? { workspaceId, memberId }
      : "skip"
  );

  // Check if the member is typing in this conversation (to the current user)
  const isMemberTyping = useQuery(
    api.typing.isMemberTyping,
    conversationId && currentMember && isValidConvexId(memberId)
      ? {
          conversationId,
          memberId,
          currentMemberId: currentMember._id,
        }
      : "skip"
  );

  return isMemberTyping ?? false;
}
