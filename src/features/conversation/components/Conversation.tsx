import { useMemberId } from "@/hooks/use-member-id";
import { Id } from "../../../../convex/_generated/dataModel";
import { useGetMember } from "@/features/members/api/use-get-member";
import { Loader, TriangleAlert } from "lucide-react";
import { useGetMessages } from "@/features/messages/api/use-get-messages";
import { MemberHeader } from "@/features/members/components/MemberHeader";
import { ChatInput } from "./ChatInput";
import { MessagesList } from "@/features/messages/components/MessagesList";
import { usePanel } from "@/hooks/use-panel";

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

  return (
    <div className="flex flex-col h-full">
      <MemberHeader
        memberName={member?.user.name}
        memberImage={member?.user.image}
        memberId={memberId}
        onClick={() => onOpenProfile(memberId)}
      />
      <MessagesList
        data={results}
        loadMore={loadMore}
        variant="conversation"
        memberName={member?.user.name}
        memberImage={member?.user.image}
        isLoadingMore={status === "LoadingMore"}
        canLoadMore={status === "CanLoadMore"}
      />
      <ChatInput
        conversationId={id}
        placeholder={`Message ${member?.user.name}`}
      />
    </div>
  );
}
