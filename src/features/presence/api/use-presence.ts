import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/features/auth/api/use-current-user";

interface UsePresenceProps {
  workspaceId: Id<"workspaces">;
  enabled?: boolean;
}

/**
 * Hook to manage user presence (online/offline status)
 * Sends periodic heartbeats to indicate the user is online
 */
export function usePresence({ workspaceId, enabled = true }: UsePresenceProps) {
  const heartbeat = useMutation(api.presence.heartbeat);
  const clearPresence = useMutation(api.presence.clearPresence);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousWorkspaceIdRef = useRef<Id<"workspaces"> | null>(null);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    // Don't track presence if user is not authenticated
    if (!currentUser) {
      // Clear any existing presence if user logged out
      if (previousWorkspaceIdRef.current) {
        clearPresence({ workspaceId: previousWorkspaceIdRef.current }).catch(
          () => {
            // Ignore errors
          }
        );
        previousWorkspaceIdRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (!enabled || !workspaceId) {
      return;
    }

    // Store the current workspaceId for cleanup
    const currentWorkspaceId = workspaceId;

    // Clear presence from previous workspace if it changed
    if (
      previousWorkspaceIdRef.current &&
      previousWorkspaceIdRef.current !== workspaceId
    ) {
      clearPresence({ workspaceId: previousWorkspaceIdRef.current }).catch(
        () => {
          // Ignore errors
        }
      );
    }

    previousWorkspaceIdRef.current = workspaceId;

    // Send initial heartbeat
    heartbeat({ workspaceId }).catch(() => {
      // If initial heartbeat fails, don't set up interval
      return;
    });

    // Set up interval to send heartbeats every 10 seconds
    intervalRef.current = setInterval(() => {
      heartbeat({ workspaceId: currentWorkspaceId }).catch(() => {
        // If heartbeat fails (e.g., user logged out), clear the interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      });
    }, 10 * 1000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Clear presence when leaving workspace (use closure value)
      if (currentWorkspaceId) {
        clearPresence({ workspaceId: currentWorkspaceId }).catch(() => {
          // Ignore errors - user might have logged out
        });
      }
    };
  }, [workspaceId, enabled, heartbeat, clearPresence, currentUser]);

  // Send heartbeat when page becomes visible again
  useEffect(() => {
    if (!enabled || !workspaceId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        heartbeat({ workspaceId }).catch(() => {
          // Ignore errors
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [workspaceId, enabled, heartbeat]);
}

interface UseOnlineStatusProps {
  workspaceId: Id<"workspaces">;
}

/**
 * Hook to get online status for all members in a workspace
 */
export function useOnlineStatus({ workspaceId }: UseOnlineStatusProps) {
  const statusMap = useQuery(api.presence.getOnlineStatus, { workspaceId });
  return statusMap ?? {};
}

interface UseMemberOnlineStatusProps {
  memberId: Id<"members"> | undefined;
}

/**
 * Hook to get online status for a specific member
 */
export function useMemberOnlineStatus({
  memberId,
}: UseMemberOnlineStatusProps) {
  const isOnline = useQuery(
    api.presence.getMemberOnlineStatus,
    memberId ? { memberId } : "skip"
  );
  return isOnline ?? false;
}
