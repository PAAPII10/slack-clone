"use client";

import { useEffect } from "react";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

/**
 * Hook to detect active huddle on page reload and return huddle info
 * Does NOT auto-connect - just provides the information
 */
export function useAutoReconnectHuddle() {
  const workspaceId = useWorkspaceId();

  // Get user's active huddle if any (only for DM huddles)
  const myActiveHuddle = useQuery(
    api.huddles.getMyActiveHuddle,
    workspaceId ? { workspaceId } : "skip"
  );

  // Debug logging
  useEffect(() => {
    console.log("🔍 useAutoReconnectHuddle:", {
      myActiveHuddle,
      sourceType: myActiveHuddle?.sourceType,
      huddleId: myActiveHuddle?._id,
      workspaceId,
    });
  }, [myActiveHuddle, workspaceId]);

  // Only return DM huddles (skip channel huddles)
  if (myActiveHuddle && myActiveHuddle.sourceType === "dm") {
    console.log("✅ Returning DM huddle for reconnect:", myActiveHuddle._id);
    return myActiveHuddle;
  }

  if (myActiveHuddle && myActiveHuddle.sourceType === "channel") {
    console.log("⏭️ Skipping channel huddle");
  }

  return null;
}
