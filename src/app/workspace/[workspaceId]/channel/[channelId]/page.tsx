"use client";

import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { ChannelHeader } from "@/features/channels/components/ChannelHeader";
import { ChatInput } from "@/features/channels/components/ChatInput";
import { useGetMessages } from "@/features/messages/api/use-get-messages";
import { MessagesList } from "@/features/messages/components/MessagesList";
import { useChannelId } from "@/hooks/use-channel-id";
import { Loader, TriangleAlert } from "lucide-react";
import { useIsChannelMember } from "@/features/channels/api/use-is-channel-member";
import { useJoinChannel } from "@/features/channels/api/use-join-channel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function ChannelIdPage() {
  const channelId = useChannelId();
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const { data: channel, isLoading: isChannelLoading } = useGetChannel({
    id: channelId,
  });

  const { data: isMember, isLoading: isMembershipLoading } = useIsChannelMember(
    {
      channelId,
    }
  );

  const { results, status, loadMore } = useGetMessages({
    channelId,
  });

  const { mutate: joinChannel, isPending: isJoining } = useJoinChannel();

  const handleJoin = () => {
    joinChannel(
      { channelId },
      {
        onSuccess: () => {
          toast.success("Joined channel");
          router.refresh();
        },
        onError: (error) => {
          toast.error(error.message || "Failed to join channel");
        },
      }
    );
  };

  if (
    isChannelLoading ||
    isMembershipLoading ||
    status === "LoadingFirstPage"
  ) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader className="size-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center h-full gap-y-2 flex-col">
        <TriangleAlert className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Channel not found</span>
      </div>
    );
  }

  // Show join option for public channels where user is not a member
  if (channel.channelType === "public" && !isMember) {
    return (
      <div className="flex flex-col h-full">
        <ChannelHeader title={channel.name} type={channel.channelType} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold">#{channel.name}</h2>
              <p className="text-muted-foreground">
                You&apos;re not a member of this channel yet. Join to start
                participating in the conversation.
              </p>
            </div>
            <Button
              onClick={handleJoin}
              disabled={isJoining}
              size="lg"
              className="w-full"
            >
              {isJoining ? (
                <>
                  <Loader className="size-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join Channel"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader title={channel.name} type={channel.channelType} />
      <MessagesList
        channelName={channel.name}
        channelCreationTime={channel._creationTime}
        data={results}
        loadMore={loadMore}
        isLoadingMore={status === "LoadingMore"}
        canLoadMore={status === "CanLoadMore"}
      />
      <ChatInput placeholder={`Message # ${channel.name}`} />
    </div>
  );
}
