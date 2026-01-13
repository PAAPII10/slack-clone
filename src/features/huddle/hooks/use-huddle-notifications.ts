"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useGetSoundPreferences } from "@/features/userPreferences/api/use-get-sound-preferences";
import { playNotificationSound } from "@/lib/sound-manager";
import { useHuddleState } from "../store/use-huddle-state";

/**
 * Hook to monitor huddles and send notifications when:
 * - A new huddle is started in a channel/conversation the user is part of
 * - User is not already in that huddle
 */
export function useHuddleNotifications() {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: soundPrefs } = useGetSoundPreferences({
    workspaceId: workspaceId!,
  });
  const [huddleState, setHuddleState] = useHuddleState();
  const notifiedHuddlesRef = useRef<Set<Id<"huddles">>>(new Set());
  const previousHuddlesRef = useRef<Set<Id<"huddles">>>(new Set());

  // Monitor active huddles for channels/conversations the user is part of
  const myActiveHuddle = useQuery(
    api.huddles.getMyActiveHuddle,
    workspaceId ? { workspaceId } : "skip"
  );

  // Get all active huddles in workspace (for detecting new huddles)
  const allActiveHuddles = useQuery(
    api.huddles.getActiveHuddlesForWorkspace,
    workspaceId ? { workspaceId } : "skip"
  );

  useEffect(() => {
    if (!workspaceId || !currentMember || !soundPrefs || !allActiveHuddles) return;

    const currentHuddleIds = new Set(
      allActiveHuddles.map((h) => h._id)
    );

    // Find new huddles (huddles that weren't in previous set)
    const newHuddles = allActiveHuddles.filter(
      (huddle) => !previousHuddlesRef.current.has(huddle._id)
    );

    // Check if user is already in any of these huddles
    const myHuddleId = myActiveHuddle?._id;
    const huddlesToNotify = newHuddles.filter(
      (huddle) => huddle._id !== myHuddleId && !notifiedHuddlesRef.current.has(huddle._id)
    );

    // Process each new huddle
    huddlesToNotify.forEach((huddle) => {
      // Mark as notified
      notifiedHuddlesRef.current.add(huddle._id);

      // Play sound notification
      if (soundPrefs.enabled) {
        playNotificationSound(soundPrefs.soundType, soundPrefs.volume);
      }

      // Show browser notification
      if (
        soundPrefs.browserNotificationsEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window
      ) {
        if (Notification.permission === "default") {
          Notification.requestPermission();
        } else if (Notification.permission === "granted") {
          const title = huddle.sourceType === "channel" 
            ? "New huddle started" 
            : "Incoming huddle";
          const body = huddle.sourceType === "channel"
            ? "Someone started a huddle in a channel"
            : "Someone wants to huddle with you";

          new Notification(title, {
            body,
            icon: "/favicon.ico",
            tag: `huddle-${huddle._id}`,
          });
        }
      }

      // Update huddle state to show incoming notification
      // This will trigger the IncomingHuddleNotification component
      if (!huddleState.incomingHuddle) {
        // Get the correct sourceId for the notification
        let sourceId: Id<"channels"> | Id<"members"> | undefined;
        
        if (huddle.sourceType === "channel" && huddle.channelId) {
          sourceId = huddle.channelId;
        } else if (huddle.sourceType === "dm") {
          // For DM, use otherMemberId from the query result
          const huddleWithMember = huddle as typeof huddle & { otherMemberId?: Id<"members"> };
          if (huddleWithMember.otherMemberId) {
            sourceId = huddleWithMember.otherMemberId;
          } else {
            // Skip if we don't have otherMemberId (shouldn't happen, but be safe)
            console.warn("DM huddle missing otherMemberId, skipping notification");
            return;
          }
        } else {
          return; // Skip if we don't have valid source
        }
        
        if (!sourceId) {
          return; // Skip if sourceId is still undefined
        }
        
        setHuddleState((prev) => ({
          ...prev,
          incomingHuddle: {
            callerId: huddle.createdBy,
            callerName: "Someone", // Will be populated by IncomingHuddleNotification
            callerImage: undefined,
            huddleSource: huddle.sourceType,
            huddleSourceId: sourceId,
          },
        }));
      }
    });

    // Update previous huddles set
    previousHuddlesRef.current = currentHuddleIds;

    // Clean up old notified huddles (huddles that are no longer active)
    notifiedHuddlesRef.current.forEach((huddleId) => {
      if (!currentHuddleIds.has(huddleId)) {
        notifiedHuddlesRef.current.delete(huddleId);
      }
    });
  }, [
    workspaceId,
    currentMember,
    soundPrefs,
    allActiveHuddles,
    myActiveHuddle,
    huddleState.incomingHuddle,
    setHuddleState,
  ]);
}
