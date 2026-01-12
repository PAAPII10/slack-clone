"use client";

import { CreateWorkspaceModal } from "@/features/workspaces/components/CreateWorkspaceModal";
import { CreateChannelModal } from "@/features/channels/components/CreateChannelModal";

export function Modals() {
  if (typeof window === "undefined") return null;

  return (
    <>
      <CreateChannelModal />
      <CreateWorkspaceModal />
    </>
  );
}
