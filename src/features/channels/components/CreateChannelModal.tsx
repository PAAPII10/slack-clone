"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useRouter } from "next/navigation";
import { useCreateChannelModal } from "../store/useCreateChanelModal";
import { useCreateChannel } from "../api/use-create-channel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { toast } from "sonner";

export function CreateChannelModal() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const [open, setOpen] = useCreateChannelModal();
  const { mutate, isPending } = useCreateChannel();
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState<"public" | "private">(
    "public"
  );

  const handleClose = () => {
    setOpen(false);
    setName(""); // Reset form
    setChannelType("public"); // Reset to default
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutate(
      { name, workspaceId, channelType },
      {
        onSuccess: (id) => {
          toast.success("Channel created");
          router.push(`/workspace/${workspaceId}/channel/${id}`);
          handleClose();
        },
        onError: () => {
          toast.error("Failed to create channel");
        },
      }
    );
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const value = e.target.value.replace(/\s+/g, "-").toLowerCase();
    setName(value);
  };
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a channel</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            value={name}
            disabled={isPending}
            required
            autoFocus
            minLength={3}
            placeholder="Channel name e.g 'plan-budget'"
            onChange={handleChange}
            maxLength={80}
          />
          <div className="space-y-3 flex flex-col">
            <label className="text-sm font-medium">Channel type</label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="channelType"
                  value="public"
                  checked={channelType === "public"}
                  onChange={(e) =>
                    setChannelType(e.target.value as "public" | "private")
                  }
                  disabled={isPending}
                  className="mt-0.5 w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">
                    Anyone in the workspace can view and join this channel
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
                    setChannelType(e.target.value as "public" | "private")
                  }
                  disabled={isPending}
                  className="mt-0.5 w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">
                    Only invited members can view and join this channel
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
