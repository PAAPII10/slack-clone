"use client";

import { CreateWorkspaceModal } from "@/features/workspaces/components/CreateWorkspaceModal";
import { CreateChannelModal } from "@/features/channels/components/CreateChannelModal";
import { IncomingHuddleNotification } from "@/features/huddle/components/IncomingHuddleNotification";
import { UnifiedSettingsDialog } from "@/components/UnifiedSettingsDialog";
import { useHuddleState } from "@/features/huddle/store/use-huddle-state";

export function Modals() {
  const [huddleState] = useHuddleState();

  if (typeof window === "undefined") return null;

  return (
    <>
      <CreateChannelModal />
      <CreateWorkspaceModal />
      <UnifiedSettingsDialog />
      {huddleState.incomingHuddle && <IncomingHuddleNotification />}
    </>
  );
}
