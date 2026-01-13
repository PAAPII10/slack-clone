"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Phone } from "lucide-react";
import { useHuddleState } from "../store/use-huddle-state";
import { useGetMember } from "@/features/members/api/use-get-member";
import { getUserDisplayName } from "@/lib/user-utils";
import { Id } from "../../../../convex/_generated/dataModel";
import { useStartOrJoinHuddle } from "../api/use-start-or-join-huddle";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

/**
 * IncomingHuddleNotification Component
 * 
 * Shows notification when someone starts a huddle
 * 
 * PHASE 1: UI-only implementation
 * - Mock incoming huddle notifications
 * - Shows caller information
 * - Provides Join/Decline options
 * 
 * TODO (PHASE 2+):
 * - Connect to Convex for real-time huddle invitations
 * - Show actual caller information
 * - Handle multiple incoming huddles
 * - Add sound/vibration notifications
 */

export function IncomingHuddleNotification() {
  const [huddleState, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
  const { mutate: startOrJoinHuddle } = useStartOrJoinHuddle();

  // Get caller information from incoming huddle state
  const incomingHuddle = huddleState.incomingHuddle;
  const { data: caller } = useGetMember({
    id: incomingHuddle?.callerId || ("" as Id<"members">),
  });

  const displayName = caller
    ? getUserDisplayName(caller.user)
    : incomingHuddle?.callerName || "Someone";
  const displayImage = caller?.user.image || incomingHuddle?.callerImage;
  const avatarFallback = displayName.charAt(0).toUpperCase();

  // Show notification if we have incoming huddle data
  // TODO (PHASE 2): Get this from Convex real-time updates
  const showNotification = !!huddleState.incomingHuddle;

  const handleJoin = () => {
    if (!huddleState.incomingHuddle || !workspaceId) return;
    
    const incomingHuddle = huddleState.incomingHuddle;
    
    // Clear notification first
    setHuddleState((prev) => ({
      ...prev,
      incomingHuddle: null,
    }));
    
    // Immediately join the huddle
    startOrJoinHuddle(
      {
        workspaceId,
        sourceType: incomingHuddle.huddleSource,
        sourceId: incomingHuddle.huddleSourceId,
      },
      {
        onSuccess: (huddleId) => {
          console.log("Joined huddle from notification:", huddleId);
          setHuddleState((prev) => ({
            ...prev,
            currentHuddleId: huddleId,
            isHuddleActive: true,
            isHuddleOpen: true,
            huddleSource: incomingHuddle.huddleSource,
            huddleSourceId: incomingHuddle.huddleSourceId,
          }));
        },
        onError: (error) => {
          console.error("Failed to join huddle from notification:", error);
        },
      }
    );
  };

  const handleDecline = () => {
    // TODO (PHASE 2): Decline huddle invitation
    // Clear the incoming notification
    setHuddleState((prev) => ({
      ...prev,
      incomingHuddle: null,
    }));
  };

  const handleClose = () => {
    handleDecline();
  };

  if (!showNotification) {
    return null;
  }

  return (
    <Dialog open={showNotification} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden bg-gray-900 border-gray-700">
        <DialogTitle className="sr-only">
          Incoming SyncUp from {displayName}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Phone className="size-5 text-white" />
            <span className="text-white font-medium">Incoming SyncUp</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="size-8 hover:bg-gray-800 text-white"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Caller Information */}
        <div className="px-6 py-8 flex flex-col items-center">
          <Avatar className="size-24 border-4 border-blue-500 mb-4">
            <AvatarImage src={displayImage} />
            <AvatarFallback className="text-3xl font-bold bg-blue-500 text-white">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
          <h3 className="text-2xl font-bold text-white mb-1">{displayName}</h3>
          <p className="text-sm text-gray-400">is calling you</p>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 flex gap-3 border-t border-gray-800">
          <Button
            onClick={handleDecline}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg"
          >
            Decline
          </Button>
          <Button
            onClick={handleJoin}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg"
          >
            Join
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
