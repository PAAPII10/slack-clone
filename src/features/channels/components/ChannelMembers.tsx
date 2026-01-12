"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGetChannelMembers } from "../api/use-get-channel-members";
import { useInviteChannelMember } from "../api/use-invite-channel-member";
import { useRemoveChannelMember } from "../api/use-remove-channel-member";
import { useGetMembers } from "@/features/members/api/use-get-members";
import { useChannelId } from "@/hooks/use-channel-id";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";
import { LogOut, UserPlus, Users, X } from "lucide-react";
import { Loader } from "lucide-react";
import { Hint } from "@/components/Hint";
import { getUserDisplayName } from "@/lib/user-utils";

interface ChannelMembersProps {
  channelType: "public" | "private";
}

export function ChannelMembers({ channelType }: ChannelMembersProps) {
  const channelId = useChannelId();
  const workspaceId = useWorkspaceId();
  const [open, setOpen] = useState(false);
  const [invitingMemberId, setInvitingMemberId] =
    useState<Id<"members"> | null>(null);

  const { data: channelMembers, isLoading: isChannelMembersLoading } =
    useGetChannelMembers({ channelId });
  const { data: workspaceMembers, isLoading: isWorkspaceMembersLoading } =
    useGetMembers({ workspaceId });
  const { data: currentMember } = useCurrentMember({ workspaceId });

  const { mutate: inviteMember, isPending: isInviting } =
    useInviteChannelMember();
  const { mutate: removeMember, isPending: isRemoving } =
    useRemoveChannelMember();

  // Type assertion: both queries return members with user data populated
  type MemberWithUser = {
    _id: Id<"members">;
    user: { name?: string; image?: string; email?: string };
    role: "admin" | "member";
    ownerId?: Id<"members"> | undefined;
  };

  // Get members who are part of the channel
  const displayMembers = (channelMembers as MemberWithUser[] | undefined) || [];

  // Get members who are not yet in the channel
  const channelMemberIds = new Set(
    (channelMembers as Array<{ _id: Id<"members"> }> | undefined)?.map(
      (m) => m._id
    ) || []
  );
  const availableToInvite: MemberWithUser[] =
    (workspaceMembers as MemberWithUser[] | undefined)?.filter(
      (m) => !channelMemberIds.has(m._id)
    ) || [];

  const handleInvite = (memberId: Id<"members">) => {
    setInvitingMemberId(memberId);
    inviteMember(
      { channelId, memberId },
      {
        onSuccess: () => {
          toast.success("Member invited to channel");
          setInvitingMemberId(null);
        },
        onError: (error) => {
          toast.error(error.message || "Failed to invite member");
          setInvitingMemberId(null);
        },
      }
    );
  };

  const handleRemove = (memberId: Id<"members">) => {
    removeMember(
      { channelId, memberId },
      {
        onSuccess: () => {
          toast.success("Member removed from channel");
        },
        onError: (error) => {
          toast.error(error.message || "Failed to remove member");
        },
      }
    );
  };

  const isLoading = isChannelMembersLoading || isWorkspaceMembersLoading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Hint label="Members">
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-sm">
            <Users />
          </Button>
        </DialogTrigger>
      </Hint>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {channelType === "private"
              ? "Channel members"
              : "Workspace members"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="size-5 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <>
              {availableToInvite.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Invite members
                  </h3>
                  {availableToInvite.map((member) => (
                    <div
                      key={member._id}
                      className="flex items-center justify-between p-2 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarImage src={member.user.image} />
                          <AvatarFallback>
                            {getUserDisplayName(member.user).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{getUserDisplayName(member.user)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInvite(member._id)}
                        disabled={isInviting || invitingMemberId === member._id}
                        className="w-28"
                      >
                        {invitingMemberId === member._id ? (
                          <Loader className="size-4 animate-spin" />
                        ) : (
                          <>
                            Add
                            <UserPlus className="size-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {displayMembers && displayMembers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Members
                  </h3>
                  {displayMembers.map((member) => (
                    <div
                      key={member._id}
                      className="flex items-center justify-between p-2 rounded-md"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="size-8">
                          <AvatarImage src={member.user.image} />
                          <AvatarFallback>
                            {getUserDisplayName(member.user).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">
                            {getUserDisplayName(member.user)}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {channelMembers?.find((m) => m._id === member._id)
                              ?.ownerId === member._id
                              ? "Owner"
                              : member.role}
                          </span>
                        </div>
                      </div>
                      {currentMember &&
                        (currentMember.role === "admin" ||
                          currentMember._id === member._id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemove(member._id)}
                            disabled={isRemoving}
                            className="w-28"
                          >
                            {currentMember._id === member._id
                              ? "Leave"
                              : "Remove"}
                            {currentMember._id === member._id ? (
                              <LogOut className="size-4" />
                            ) : (
                              <X className="size-4" />
                            )}
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
              )}

              {displayMembers && displayMembers.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No members found
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
