"use client";

import { useGetChannels } from "@/features/channels/api/use-get-channels";
import { useCreateChannelModal } from "@/features/channels/store/useCreateChanelModal";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useGetWorkspace } from "@/features/workspaces/api/use-get-workspace";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Loader, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WorkspaceIdPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const [open, setOpen] = useCreateChannelModal();

  const { data: member, isLoading: isMemberLoading } = useCurrentMember({
    workspaceId,
  });
  const { data: workspace, isLoading: isWorkspaceLoading } = useGetWorkspace({
    id: workspaceId,
  });
  const { data: channels, isLoading: isChannelsLoading } = useGetChannels({
    workspaceId,
  });

  const channelId = channels?.[0]?._id;
  const isAdmin = member?.role === "admin";

  useEffect(() => {
    if (
      isWorkspaceLoading ||
      isChannelsLoading ||
      !workspace ||
      isMemberLoading ||
      !member
    )
      return;

    if (channelId) {
      router.push(`/workspace/${workspaceId}/channel/${channelId}`);
    } else if (!open && isAdmin) {
      setOpen(true);
    }
  }, [
    channelId,
    isAdmin,
    isChannelsLoading,
    isMemberLoading,
    isWorkspaceLoading,
    member,
    open,
    router,
    setOpen,
    workspace,
    workspaceId,
  ]);

  if (isWorkspaceLoading || isChannelsLoading || isMemberLoading) {
    return (
      <div className="flex flex-1 flex-col gap-2 items-center justify-center h-full">
        <Loader className="size-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!workspace || !member) {
    return (
      <div className="flex flex-1 flex-col gap-2 items-center justify-center h-full">
        <TriangleAlert className="size-6 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Workspace not found
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 items-center justify-center h-full">
      <TriangleAlert className="size-6 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">No channel found</span>
    </div>
  );
}
