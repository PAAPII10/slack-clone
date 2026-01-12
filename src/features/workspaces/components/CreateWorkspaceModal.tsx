"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateWorkspaceModal } from "../store/useCreateWorkspaceModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateWorkspace } from "../api/use-create-workspace";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CreateWorkspaceModal() {
  const router = useRouter();
  const [open, setOpen] = useCreateWorkspaceModal();
  const [name, setName] = useState("");

  const { mutate, isPending } = useCreateWorkspace();
  const handleClose = () => {
    setOpen(false);
    setName(""); // Reset form
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    mutate(
      { name },
      {
        onSuccess: (id) => {
          toast.success("Workspace created");
          router.push(`/workspace/${id}`);
          handleClose();
        },
        onError: () => {
          // Show toast error
        },
        onSettled: () => {
          // Reset form
        },
      }
    );
  };
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a workspace</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            value={name}
            disabled={isPending}
            required
            autoFocus
            minLength={3}
            placeholder="Workspace name e.g 'Work', 'Personal', 'Home'"
            onChange={(e) => {
              setName(e.target.value);
            }}
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
