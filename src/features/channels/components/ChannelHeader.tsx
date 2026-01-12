import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { FaChevronDown } from "react-icons/fa";
import { useUpdateChannel } from "../api/use-update-channel";
import { useRemoveChannel } from "../api/use-remove-channel";
import { toast } from "sonner";
import { useChannelId } from "@/hooks/use-channel-id";
import { useConfirm } from "@/hooks/use-confirm";
import { useRouter } from "next/navigation";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";

interface ChannelHeaderProps {
  title: string;
}

export function ChannelHeader({ title }: ChannelHeaderProps) {
  const router = useRouter();
  const channelId = useChannelId();
  const workspaceId = useWorkspaceId();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);

  const [ConfirmDialog, confirm] = useConfirm({
    title: "Delete this channel?",
    message:
      "You are about to delete this channel. This action is irreversible",
  });

  const { data: member } = useCurrentMember({ workspaceId });

  const { mutate: updateChannel, isPending: isUpdatingChannel } =
    useUpdateChannel();
  const { mutate: removeChannel, isPending: isRemovingChannel } =
    useRemoveChannel();

  const handleEditOpen = (val: boolean) => {
    if (member?.role !== "admin") return;

    setIsEditing(val);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateChannel(
      { id: channelId, name: value },
      {
        onSuccess: () => {
          toast.success("Channel updated");
          setIsEditing(false);
        },
        onError: () => {
          toast.error("Failed to update channel");
        },
      }
    );
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const value = e.target.value.replace(/\s+/g, "-").toLowerCase();
    setValue(value);
  };

  const handleRemove = async () => {
    const ok = await confirm();

    if (!ok) return;

    removeChannel(
      { id: channelId },
      {
        onSuccess: () => {
          toast.success("Channel removed");
          router.replace(`/workspace/${workspaceId}`);
        },
        onError: () => {
          toast.error("Failed to delete channel");
        },
      }
    );
  };

  return (
    <div className="bg-white border-b flex items-center px-4 h-[49px] overflow-hidden">
      <ConfirmDialog />
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="text-lg font-semibold px-2 overflow-hidden w-auto"
            size="sm"
          >
            <span className="truncate"># {title}</span>
            <FaChevronDown className="size-2.5 ml-2" />
          </Button>
        </DialogTrigger>
        <DialogContent className="p-0 bg-gray-50 overflow-hidden">
          <DialogHeader className="p-4 border-b  bg-white">
            <DialogTitle># {title}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 flex flex-col gap-y-2">
            <Dialog open={isEditing} onOpenChange={handleEditOpen}>
              <DialogTrigger asChild>
                <div className="px-5 py-4 bg-white rounded-lg border cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Channel name</p>
                    {member?.role === "admin" && (
                      <p className="text-sm text-[#1254a3] hover:underline font-semibold">
                        Edit
                      </p>
                    )}
                  </div>
                  <p className="text-sm"># {title}</p>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename this channel</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    disabled={isUpdatingChannel}
                    value={value}
                    autoFocus
                    required
                    minLength={3}
                    maxLength={80}
                    placeholder="Channel name e.g 'plan-budget'"
                    onChange={handleChange}
                  />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        disabled={isUpdatingChannel}
                        type="button"
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button disabled={isUpdatingChannel} type="submit">
                      Save
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            {member?.role === "admin" && (
              <button
                onClick={handleRemove}
                disabled={isRemovingChannel}
                className="flex items-center gap-x-2 py-4 px-5 bg-white rounded-lg cursor-pointer border hover:bg-gray-50 text-rose-600"
              >
                <TrashIcon className="size-4" />
                <p className="text-sm font-semibold">Delete channel</p>
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
