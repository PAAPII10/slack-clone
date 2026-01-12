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

  const handleClose = () => {
    setOpen(false);
    setName(""); // Reset form
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutate(
      { name, workspaceId },
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
