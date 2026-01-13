import { useState } from "react";
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
import { TrashIcon, Phone } from "lucide-react";
import { FaChevronDown } from "react-icons/fa";
import { useUpdateChannel } from "../api/use-update-channel";
import { useRemoveChannel } from "../api/use-remove-channel";
import { toast } from "sonner";
import { useChannelId } from "@/hooks/use-channel-id";
import { useConfirm } from "@/hooks/use-confirm";
import { useRouter } from "next/navigation";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { ChannelMembers } from "./ChannelMembers";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { Hint } from "@/components/Hint";
import { useHuddleAudioSettings } from "@/features/huddle/hooks/use-huddle-audio-settings";
import { usePanel } from "@/hooks/use-panel";
import { useStartHuddle } from "@/features/huddle/api/use-start-huddle";

interface ChannelHeaderProps {
  title: string;
  type: "public" | "private";
}

export function ChannelHeader({ title, type }: ChannelHeaderProps) {
  const router = useRouter();
  const channelId = useChannelId();
  const workspaceId = useWorkspaceId();
  const { onOpenHuddle } = usePanel();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [channelType, setChannelType] = useState<"public" | "private">(type);

  const [ConfirmDialog, confirm] = useConfirm({
    title: "Delete this channel?",
    message:
      "You are about to delete this channel. This action is irreversible",
  });

  const { data: member } = useCurrentMember({ workspaceId });
  const { mutate: startHuddle } = useStartHuddle();
  const { settings } = useHuddleAudioSettings();

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
      { id: channelId, name: value, channelType },
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

  const handleStartHuddle = () => {
    if (!channelId || !workspaceId) return;

    // Immediately start/join huddle - no join screen
    startHuddle(
      {
        workspaceId,
        sourceType: "channel",
        sourceId: channelId,
        startMuted: settings.startMuted,
      },
      {
        onSuccess: (huddleId) => {
          onOpenHuddle(huddleId);
          playHuddleSound("join");
        },
        onError: (error) => {
          console.error("Failed to start huddle:", error);
        },
      }
    );
  };

  return (
    <div className="bg-white border-b flex items-center justify-between px-4 h-[49px] overflow-hidden">
      <ConfirmDialog />
      <div className="flex items-center gap-2">
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
                    <DialogTitle>Edit this channel</DialogTitle>
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
                    <div className="space-y-3 flex flex-col">
                      <label className="text-sm font-medium">
                        Channel type
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                          <input
                            type="radio"
                            name="channelType"
                            value="public"
                            checked={channelType === "public"}
                            onChange={(e) =>
                              setChannelType(
                                e.target.value as "public" | "private"
                              )
                            }
                            disabled={isUpdatingChannel}
                            className="mt-0.5 w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">Public</div>
                            <div className="text-xs text-muted-foreground">
                              Anyone in the workspace can view and join this
                              channel
                            </div>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                          <input
                            type="radio"
                            name="channelType"
                            value="private"
                            checked={channelType === "private"}
                            onChange={(e) =>
                              setChannelType(
                                e.target.value as "public" | "private"
                              )
                            }
                            disabled={isUpdatingChannel}
                            className="mt-0.5 w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">Private</div>
                            <div className="text-xs text-muted-foreground">
                              Only invited members can view and join this
                              channel
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
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
      <div className="flex items-center gap-1">
        <Hint label="Start Huddle">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm"
            onClick={handleStartHuddle}
          >
            <Phone className="size-4" />
          </Button>
        </Hint>
        <ChannelMembers channelType={channelType} />
      </div>
    </div>
  );
}
