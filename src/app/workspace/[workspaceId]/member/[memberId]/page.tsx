"use client";

import { useMemberId } from "@/hooks/use-member-id";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Loader, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Conversation } from "@/features/conversation/components/Conversation";
import { useCreateOrGetConversation } from "@/features/conversation/api/use-create-or-get-message";

export default function MemberIdPage() {
  const memberId = useMemberId();
  const workspaceId = useWorkspaceId();

  const [conversationId, setConversationId] =
    useState<Id<"conversations"> | null>(null);

  const { isPending: isConversationLoading, mutate: createOrGetConversation } =
    useCreateOrGetConversation();

  useEffect(() => {
    createOrGetConversation(
      {
        workspaceId,
        memberId,
      },
      {
        onSuccess(data) {
          setConversationId(data);
        },
        onError() {
          toast.error("Failed to create or get conversation");
        },
      }
    );
  }, [createOrGetConversation, workspaceId, memberId]);

  if (isConversationLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader className="size-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center h-full gap-y-2 flex-col">
        <TriangleAlert className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Conversation not found
        </span>
      </div>
    );
  }

  return <Conversation id={conversationId} />;
}
