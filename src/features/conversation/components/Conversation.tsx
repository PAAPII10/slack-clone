import { useMemberId } from "@/hooks/use-member-id";
import { Id } from "../../../../convex/_generated/dataModel";
import { useGetMember } from "@/features/members/api/use-get-member";
import { Loader, TriangleAlert } from "lucide-react";
import { useGetMessages } from "@/features/messages/api/use-get-messages";
import { MemberHeader } from "@/features/members/components/MemberHeader";
import { ChatInput } from "./ChatInput";
import { MessagesList } from "@/features/messages/components/MessagesList";
import { usePanel } from "@/hooks/use-panel";
import { useMarkConversationAsRead } from "../api/use-mark-conversation-as-read";
import { useEffect, useRef } from "react";
import { getUserDisplayName } from "@/lib/user-utils";

interface ConversationProps {
  id: Id<"conversations">;
}

export function Conversation({ id }: ConversationProps) {
  const memberId = useMemberId();
  const { onOpenProfile } = usePanel();
  const { data: member, isLoading: isMemberLoading } = useGetMember({
    id: memberId,
  });

  const { results, status, loadMore } = useGetMessages({ conversationId: id });
  const { markAsRead } = useMarkConversationAsRead();
  const lastMessageIdRef = useRef<string | null>(null);
  const lastConversationIdRef = useRef<string | null>(null);

  // Mark conversation as read when it opens or when new messages arrive
  useEffect(() => {
    if (!id) {
      return;
    }

    // Reset when conversation changes
    if (id !== lastConversationIdRef.current) {
      lastConversationIdRef.current = id;
      lastMessageIdRef.current = null;
    }

    // Get the latest message if available
    const latestMessage = results?.[0];
    const currentMessageId = latestMessage?._id;

    // Mark as read if:
    // 1. Conversation just opened (lastMessageIdRef is null)
    // 2. New message arrived (message ID changed)
    if (currentMessageId && lastMessageIdRef.current !== currentMessageId) {
      markAsRead(id, currentMessageId);
      lastMessageIdRef.current = currentMessageId;
    } else if (!lastMessageIdRef.current && id) {
      // Conversation opened but no messages yet - still mark as read
      markAsRead(id);
    }
  }, [id, results, markAsRead]);

  if (isMemberLoading || status === "LoadingFirstPage") {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader className="size-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex-1 flex items-center justify-center h-full gap-y-2 flex-col">
        <TriangleAlert className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Member not found</span>
      </div>
    );
  }

  const displayName = member ? getUserDisplayName(member.user) : "Member";

  return (
    <div className="flex flex-col h-full">
      <MemberHeader
        memberName={displayName}
        memberImage={member?.user.image}
        memberId={memberId}
        onClick={() => onOpenProfile(memberId)}
      />
      <MessagesList
        data={results}
        loadMore={loadMore}
        variant="conversation"
        memberName={displayName}
        memberImage={member?.user.image}
        isLoadingMore={status === "LoadingMore"}
        canLoadMore={status === "CanLoadMore"}
      />
      <ChatInput
        conversationId={id}
        placeholder={`Message ${displayName}`}
      />
    </div>
  );
}
