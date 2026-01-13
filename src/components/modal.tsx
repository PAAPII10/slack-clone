"use client";

import { CreateWorkspaceModal } from "@/features/workspaces/components/CreateWorkspaceModal";
import { CreateChannelModal } from "@/features/channels/components/CreateChannelModal";
import { IncomingHuddleNotification } from "@/features/huddle/components/IncomingHuddleNotification";
import { useHuddleState } from "@/features/huddle/store/use-huddle-state";

export function Modals() {
  if (typeof window === "undefined") return null;

  const [huddleState] = useHuddleState();

  return (
    <>
      <CreateChannelModal />
      <CreateWorkspaceModal />
      {huddleState.incomingHuddle && <IncomingHuddleNotification />}
    </>
  );
}
