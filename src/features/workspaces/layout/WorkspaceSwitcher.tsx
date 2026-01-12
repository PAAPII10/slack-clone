"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useGetWorkspace } from "../api/use-get-workspace";
import { useGetWorkspaces } from "../api/use-get-workspaces";
import { useCreateWorkspaceModal } from "../store/useCreateWorkspaceModal";
import { Loader, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();

  const [_open, setOpen] = useCreateWorkspaceModal();

  const { data: workspaces, isLoading: isWorkspacesLoading } =
    useGetWorkspaces();
  const { data: workspace, isLoading: isWorkspaceLoading } = useGetWorkspace({
    id: workspaceId,
  });

  const filteredWorkspaces = workspaces?.filter(
    (workspace) => workspace._id !== workspaceId
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-9 relative overflow-hidden bg-[#ABABAD] hover:bg-[#ABABAD]/80 text-slate-800 font-semibold text-xl">
          {isWorkspaceLoading ? (
            <Loader className="size-4 animate-spin shrink-0" />
          ) : (
            workspace?.name?.charAt(0).toUpperCase()
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-64">
        <DropdownMenuItem
          className="cursor-pointer flex-col justify-start items-start capitalize"
          onClick={() => router.push(`/workspace/${workspaceId}`)}
        >
          {workspace?.name}
          <span className="text-xs text-muted-foreground">
            Active workspace
          </span>
        </DropdownMenuItem>
        {filteredWorkspaces?.map((workspace) => (
          <DropdownMenuItem
            key={workspace._id}
            className="cursor-pointer capitalize"
            onClick={() => router.push(`/workspace/${workspace._id}`)}
          >
            <div className="shrink-0 size-9 relative overflow-hidden bg-[#616061] text-slate-800 font-semibold text-lg rounded-md flex items-center justify-center mr-2">
              {workspace.name?.charAt(0).toUpperCase()}
            </div>
            <p className="truncate">{workspace.name}</p>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => setOpen(true)}
        >
          <div className="size-9 relative overflow-hidden bg-[#F2F2F2] text-slate-800 font-semibold text-lg rounded-md flex items-center justify-center mr-2">
            <Plus />
          </div>
          Create a new workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
