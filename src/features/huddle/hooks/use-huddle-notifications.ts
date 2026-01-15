"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useGetSoundPreferences } from "@/features/userPreferences/api/use-get-sound-preferences";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { SoundPreferences } from "@/hooks/use-sound-preferences";
import { useGetMember } from "@/features/members/api/use-get-member";
import { getUserDisplayName } from "@/lib/user-utils";
import { logger } from "@/lib/logger";

/**
 * Hook to monitor huddles and send notifications when:
 * - A new incoming huddle is detected (user has status "waiting")
 * - User is not already in that huddle
 */
export function useHuddleNotifications() {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });

  const { data: soundPrefs } = useGetSoundPreferences({
    workspaceId: workspaceId!,
  });
  const notifiedHuddleIdRef = useRef<Id<"huddles"> | null>(null);

  // Get incoming huddle (huddle where user has status "waiting")
  const incomingHuddle = useQuery(
    api.huddles.getIncomingHuddle,
    workspaceId ? { workspaceId } : "skip"
  );

  const { data: caller } = useGetMember({
    id: incomingHuddle?.createdBy ?? undefined,
  });

  // Get the huddle the user is currently in (if any)
  const myActiveHuddle = useQuery(
    api.huddles.getCurrentUserHuddle,
    workspaceId ? { workspaceId } : "skip"
  );

  useEffect(() => {
    if (!workspaceId || !currentMember) return;

    // Use default sound preferences if not loaded yet
    const defaultPrefs: Partial<SoundPreferences> = {
      enabled: true,
      volume: 0.7,
      browserNotificationsEnabled: false,
    };
    const effectiveSoundPrefs: SoundPreferences =
      soundPrefs || (defaultPrefs as SoundPreferences);

    // Check if we have an incoming huddle
    if (!incomingHuddle) {
      // Clear notification if huddle no longer exists or user joined
      if (notifiedHuddleIdRef.current) {
        notifiedHuddleIdRef.current = null;
      }
      return;
    }

    // Don't notify if user is already in this huddle (they joined it)
    const myHuddleId = myActiveHuddle?._id;
    if (myHuddleId === incomingHuddle._id) {
      // User joined the huddle, clear notification
      if (notifiedHuddleIdRef.current === incomingHuddle._id) {
        notifiedHuddleIdRef.current = null;
      }
      return;
    }

    // Don't notify if we already notified about this huddle
    if (notifiedHuddleIdRef.current === incomingHuddle._id) {
      return;
    }

    // Mark as notified
    notifiedHuddleIdRef.current = incomingHuddle._id;

    // Play incoming call sound
    if (effectiveSoundPrefs.enabled) {
      logger.debug("[HuddleNotifications] Playing incoming call sound", {
        enabled: effectiveSoundPrefs.enabled,
        volume: effectiveSoundPrefs.volume,
        huddleId: incomingHuddle._id,
      });
      playHuddleSound("incoming_call", effectiveSoundPrefs.volume);
    } else {
      logger.debug(
        "[HuddleNotifications] Sound disabled, skipping incoming call sound",
        {
          enabled: effectiveSoundPrefs.enabled,
        }
      );
    }

    // Show browser notification (only for DM huddles)
    if (
      effectiveSoundPrefs.browserNotificationsEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window
    ) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      } else if (Notification.permission === "granted") {
        new Notification("Incoming huddle", {
          body: `${getUserDisplayName(
            caller?.user ?? {}
          )} wants to huddle with you}`,
          icon: "/favicon.ico",
          tag: `huddle-${incomingHuddle._id}`,
        });
      }
    }
  }, [
    workspaceId,
    currentMember,
    soundPrefs,
    incomingHuddle,
    myActiveHuddle,
    caller?.user,
  ]);
}
