"use client";

import { CreateWorkspaceModal } from "@/features/workspaces/components/CreateWorkspaceModal";
import { CreateChannelModal } from "@/features/channels/components/CreateChannelModal";
import { IncomingHuddleNotification } from "@/features/huddle/components/IncomingHuddleNotification";
import { UnifiedSettingsDialog } from "@/components/UnifiedSettingsDialog";

export function Modals() {
  if (typeof window === "undefined") return null;

  return (
    <>
      <CreateChannelModal />
      <CreateWorkspaceModal />
      {/* UnifiedSettingsDialog is now rendered inside LiveKitRoomProvider in workspace layout */}
      <IncomingHuddleNotification />
    </>
  );
}
