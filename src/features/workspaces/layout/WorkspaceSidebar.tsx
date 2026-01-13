import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useGetWorkspace } from "../api/use-get-workspace";
import {
  AlertTriangle,
  Hash,
  Loader,
  Lock,
  MessageSquareText,
  SendHorizontal,
} from "lucide-react";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { SidebarItem } from "./SidebarItem";
import { useGetChannels } from "@/features/channels/api/use-get-channels";
import { WorkspaceSection } from "./WorkspaceSection";
import { useGetMembers } from "@/features/members/api/use-get-members";
import { UserItem } from "./UserItem";
import { useCreateChannelModal } from "@/features/channels/store/useCreateChanelModal";
import { useChannelId } from "@/hooks/use-channel-id";
import { useMemberId } from "@/hooks/use-member-id";
import { useIsChannelMember } from "@/features/channels/api/use-is-channel-member";
import { useJoinChannel } from "@/features/channels/api/use-join-channel";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";
import { getUserDisplayName } from "@/lib/user-utils";
import { HuddleBar } from "@/features/huddle/components/HuddleBar";

function ChannelItem({
  channel,
  currentChannelId,
  onJoin,
  isJoining,
}: {
  channel: {
    _id: Id<"channels">;
    name: string;
    channelType: "public" | "private";
    unreadCount?: number;
  };
  currentChannelId: string | null;
  onJoin: (channelId: Id<"channels">) => void;
  isJoining: boolean;
}) {
  const { data: isMember, isLoading: isLoadingMembership } = useIsChannelMember(
    {
      channelId: channel._id,
    }
  );

  const showJoinButton =
    channel.channelType === "public" && !isMember && !isLoadingMembership;

  return (
    <SidebarItem
      label={channel.name}
      icon={channel.channelType === "public" ? Hash : Lock}
      id={channel._id}
      variant={currentChannelId === channel._id ? "active" : "default"}
      showJoinButton={showJoinButton}
      onJoin={() => onJoin(channel._id)}
      isJoining={isJoining}
      unreadCount={channel.unreadCount ?? 0}
    />
  );
}

export function WorkspaceSidebar() {
  const memberId = useMemberId();
  const channelId = useChannelId();
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const [, setOpen] = useCreateChannelModal();

  const { data: member, isLoading: isMemberLoading } = useCurrentMember({
    workspaceId,
  });
  const { data: workspace, isLoading: isWorkspaceLoading } = useGetWorkspace({
    id: workspaceId,
  });

  const { data: channels, isLoading: isChannelsLoading } = useGetChannels({
    workspaceId,
  });

  const { data: members, isLoading: isMembersLoading } = useGetMembers({
    workspaceId,
  });

  const { mutate: joinChannel, isPending: isJoining } = useJoinChannel();

  const handleJoinChannel = (channelId: Id<"channels">) => {
    joinChannel(
      { channelId },
      {
        onSuccess: () => {
          toast.success("Joined channel");
          router.push(`/workspace/${workspaceId}/channel/${channelId}`);
        },
        onError: (error) => {
          toast.error(error.message || "Failed to join channel");
        },
      }
    );
  };

  if (
    isMemberLoading ||
    isWorkspaceLoading ||
    isChannelsLoading ||
    isMembersLoading
  ) {
    return (
      <div className="flex flex-col bg-[#5E2C5F] items-center justify-center h-full">
        <Loader className="size-5 text-white animate-spin" />
      </div>
    );
  }

  if (!member || !workspace || !channels) {
    return (
      <div className="flex flex-col bg-[#5E2C5F] items-center justify-center h-full">
        <AlertTriangle className="size-5 text-white" />
        <p className="text-white text-sm">Workspace not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#5E2C5F] h-full">
      <WorkspaceHeader
        workspace={workspace}
        isAdmin={member.role === "admin"}
      />
      <div className="flex flex-col px-2 mt-3">
        <SidebarItem
          label="Threads"
          icon={MessageSquareText}
          id="threads"
          href={`/workspace/${workspaceId}/threads`}
        />

        <SidebarItem
          label="Drafts & Sent"
          icon={SendHorizontal}
          id="drafts"
          href={`/workspace/${workspaceId}/drafts`}
        />
      </div>
      <WorkspaceSection
        label="Channels"
        hint="New channel"
        onNew={() => setOpen(true)}
        defaultOpen
      >
        {[...channels]
          .sort((a, b) => {
            // Sort by unread count (unread channels first)
            const aUnread = a.unreadCount ?? 0;
            const bUnread = b.unreadCount ?? 0;
            if (aUnread !== bUnread) {
              return bUnread - aUnread; // Higher unread count first
            }
            // If unread counts are equal, maintain original order (by name)
            return a.name.localeCompare(b.name);
          })
          .map((item) => (
            <ChannelItem
              key={`${item._id}-${item.channelType}`}
              channel={item}
              currentChannelId={channelId}
              onJoin={handleJoinChannel}
              isJoining={isJoining}
            />
          ))}
      </WorkspaceSection>
      <WorkspaceSection
        label="Direct Messages"
        hint="New direct message"
        onNew={() => {}}
        defaultOpen
      >
        {[...(members || [])]
          .sort((a, b) => {
            // Sort by unread count (unread conversations first)
            const aUnread = a.unreadCount ?? 0;
            const bUnread = b.unreadCount ?? 0;
            if (aUnread !== bUnread) {
              return bUnread - aUnread; // Higher unread count first
            }
            // If unread counts are equal, maintain original order (by name)
            const aName = getUserDisplayName(a.user);
            const bName = getUserDisplayName(b.user);
            return aName.localeCompare(bName);
          })
          .map((item) => (
            <UserItem
              key={item._id}
              id={item._id}
              label={getUserDisplayName(item.user)}
              image={item.user.image}
              variant={memberId === item._id ? "active" : "default"}
              unreadCount={item.unreadCount ?? 0}
            />
          ))}
      </WorkspaceSection>
      <div className="mt-auto">
        <HuddleBar />
      </div>
    </div>
  );
}
