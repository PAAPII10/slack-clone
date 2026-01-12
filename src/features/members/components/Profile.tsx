import { Button } from "@/components/ui/button";
import { Id } from "../../../../convex/_generated/dataModel";
import { useGetMember } from "../api/use-get-member";
import {
  AlertTriangle,
  ChevronDownIcon,
  Loader,
  MailIcon,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useUpdateMember } from "../api/use-update-member";
import { useRemoveMember } from "../api/use-remove-member";
import { useCurrentMember } from "../api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { useRouter } from "next/navigation";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";

interface ProfileProps {
  memberId: Id<"members">;
  onClose: () => void;
}

export function Profile({ memberId, onClose }: ProfileProps) {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { data: currentMember, isLoading: isCurrentMemberLoading } =
    useCurrentMember({ workspaceId });

  const { data: member, isLoading: isMemberLoading } = useGetMember({
    id: memberId,
  });

  const isOnline = useMemberOnlineStatus({ memberId });

  const [LeaveConfirmDialog, leaveConfirm] = useConfirm({
    title: "Leave workspace",
    message: "Are you sure you want to leave this workspace?",
  });

  const [RemoveConfirmDialog, removeConfirm] = useConfirm({
    title: "Remove member",
    message: "Are you sure you want to remove this member?",
  });

  const [UpdateConfirmDialog, updateConfirm] = useConfirm({
    title: "Change role",
    message: "Are you sure you want to update this member role?",
  });

  const { mutate: updateMember, isPending: isUpdateMemberPending } =
    useUpdateMember();
  const { mutate: removeMember, isPending: isRemoveMemberPending } =
    useRemoveMember();

  const onRemove = async () => {
    const ok = await removeConfirm();

    if (!ok) return;

    removeMember(
      { id: memberId },
      {
        onSuccess: () => {
          toast.success("Member removed");
          onClose();
        },
        onError: () => {
          toast.error("Failed to remove member");
        },
      }
    );
  };

  const onLeave = async () => {
    const ok = await leaveConfirm();

    if (!ok) return;

    removeMember(
      { id: memberId },
      {
        onSuccess: () => {
          toast.success("You have left the workspace");
          router.replace("/");
          onClose();
        },
        onError: () => {
          toast.error("Failed to leave workspace");
        },
      }
    );
  };

  const onUpdate = async (role: "admin" | "member") => {
    const ok = await updateConfirm();

    if (!ok) return;

    updateMember(
      { id: memberId, role },
      {
        onSuccess: () => {
          toast.success("Member role updated");
        },
        onError: () => {
          toast.error("Failed to update member role");
        },
      }
    );
  };

  if (isMemberLoading || isCurrentMemberLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-[49px] flex justify-between items-center px-4 border-b">
          <p className="text-lg font-bold">Profile</p>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-5 stroke-[1.5]" />
          </Button>
        </div>
        <div className="flex items-center justify-center h-full">
          <Loader className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-[49px] flex justify-between items-center px-4 border-b">
          <p className="text-lg font-bold">Profile</p>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-5 stroke-[1.5]" />
          </Button>
        </div>
        <div className="flex flex-col gap-y-2 items-center justify-center h-full">
          <AlertTriangle className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Profile not found</p>
        </div>
      </div>
    );
  }

  const avatarFallback = member.user.name?.charAt(0).toUpperCase();

  return (
    <>
      <LeaveConfirmDialog />
      <RemoveConfirmDialog />
      <UpdateConfirmDialog />
      <div className="h-full flex flex-col">
        <div className="h-[49px] flex justify-between items-center px-4 border-b w-full">
          <p className="text-lg font-bold">Profile</p>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-5 stroke-[1.5]" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center p-4">
          <Avatar className="max-w-[256px] max-h-[256px] size-full">
            <AvatarImage src={member.user.image} />
            <AvatarFallback className="aspect-square md:text-8xl text-6xl">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex flex-col p-4">
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{member.user.name}</p>
          </div>
          {currentMember?.role === "admin" &&
          currentMember?._id !== memberId ? (
            <div className="flex items-center gap-2 mt-4 w-fit">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full capitalize">
                    {member.role} <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuRadioGroup
                    value={member.role}
                    onValueChange={(value) =>
                      onUpdate(value as "admin" | "member")
                    }
                  >
                    <DropdownMenuRadioItem value="admin">
                      Admin
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="member">
                      Member
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                disabled={isRemoveMemberPending}
                variant="outline"
                className="w-full"
                onClick={onRemove}
              >
                Remove
              </Button>
            </div>
          ) : currentMember?._id === memberId &&
            currentMember?.role !== "admin" ? (
            <div className="mt-4">
              <Button
                disabled={isUpdateMemberPending}
                variant="outline"
                className="w-full"
                onClick={onLeave}
              >
                Leave
              </Button>
            </div>
          ) : null}
        </div>
        <Separator />
        <div className="flex flex-col p-4">
          <p className="text-sm font-bold mb-4">Contact Information</p>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-md bg-muted flex items-center justify-center">
              <MailIcon className="size-4" />
            </div>
            <div className="flex flex-col">
              <p className="text-[13px] font-semibold text-muted-foreground">
                Email Address
              </p>
              <Link
                href={`mailto:${member.user.email}`}
                className="text-sm text-[#1264a3] hover:underline"
              >
                {member.user.email}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {isOnline ? (
              <>
                <span
                  className="size-2 bg-green-500 rounded-full"
                  aria-label="Active"
                />
                <span className="text-sm text-muted-foreground">Active</span>
              </>
            ) : (
              <>
                <span
                  className="size-2 bg-gray-400 rounded-full"
                  aria-label="Away"
                />
                <span className="text-sm text-muted-foreground">Away</span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
