"use client";

import { useGetChannel } from "@/features/channels/api/use-get-channel";
import { ChannelHeader } from "@/features/channels/components/ChannelHeader";
import { ChatInput } from "@/features/channels/components/ChatInput";
import { useGetMessages } from "@/features/messages/api/use-get-messages";
import { MessagesList } from "@/features/messages/components/MessagesList";
import { useChannelId } from "@/hooks/use-channel-id";
import { Loader, TriangleAlert } from "lucide-react";

export default function ChannelIdPage() {
  const channelId = useChannelId();
  const { data: channel, isLoading: isChannelLoading } = useGetChannel({
    id: channelId,
  });

  const { results, status, loadMore } = useGetMessages({
    channelId,
  });

  if (isChannelLoading || status === "LoadingFirstPage") {
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

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader title={channel.name} />
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
