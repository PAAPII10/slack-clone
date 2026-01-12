import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogClose,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { useUpdateWorkspace } from "../api/use-update-workspace";
import { useRemoveWorkspace } from "../api/use-remove-workspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/use-confirm";

interface PreferencesModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialValue: string;
}

export function PreferencesModal({
  open,
  setOpen,
  initialValue,
}: PreferencesModalProps) {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const [ConfirmDialog, confirm] = useConfirm({
    title: "Are you sure",
    message: "This action is irreversible",
  });

  const { mutate: updateWorkspace, isPending: isUpdatingWorkspace } =
    useUpdateWorkspace();
  const { mutate: removeWorkspace, isPending: isRemovingWorkspace } =
    useRemoveWorkspace();
  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateWorkspace(
      { id: workspaceId, name: value },
      {
        onSuccess: () => {
          toast.success("Workspace updated");
          setIsEditing(false);
        },
        onError: () => {
          toast.error("Failed to update workspace");
        },
        onSettled: () => {},
      }
    );
  };

  const handleRemove = async () => {
    const ok = await confirm();

    if (!ok) return;

    removeWorkspace(
      { id: workspaceId },
      {
        onSuccess: () => {
          toast.success("Workspace removed");
          router.replace("/");
        },
        onError: () => {
          toast.error("Failed to delete workspace");
        },
      }
    );
  };

  return (
    <>
      <ConfirmDialog />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 bg-gray-50 overflow-hidden">
          <DialogHeader className="p-4 border-b  bg-white">
            <DialogTitle>{value}</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 flex flex-col gap-y-2">
            <Dialog open={isEditing} onOpenChange={setIsEditing}>
              <DialogTrigger asChild>
                <div className="px-5 py-4 bg-white rounded-lg border cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Workspace name</p>
                    <p className="text-sm text-[#1264a3] hover:underline font-semibold">
                      Edit
                    </p>
                  </div>
                  <p className="text-sm">{value}</p>
                </div>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename workspace</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEdit} className="space-y-4">
                  <Input
                    value={value}
                    disabled={isUpdatingWorkspace}
                    required
                    autoFocus
                    minLength={3}
                    maxLength={80}
                    placeholder="Workspace name e.g 'Work', 'Personal', 'Home'"
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isUpdatingWorkspace}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button disabled={isUpdatingWorkspace}>Save</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <button
              disabled={isRemovingWorkspace}
              onClick={handleRemove}
              className="flex items-center gap-x-2 py-4 px-5 bg-white rounded-lg cursor-pointer border hover:border-gray-50 text-rose-600"
            >
              <TrashIcon className="size-4" />
              <p className="text-sm font-semibold">Delete workspace</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
