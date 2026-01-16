"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone } from "lucide-react";
import { useGetMember } from "@/features/members/api/use-get-member";
import { getUserDisplayName } from "@/lib/user-utils";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { playHuddleSound, stopHuddleSound } from "@/lib/huddle-sounds";
import { useEffect } from "react";
import { useDeclineHuddle } from "../api/use-decline-huddle";
import { useGetIncomingHuddle } from "../api/use-get-incoming-huddle";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useJoinHuddle } from "../api/new/use-join-huddle";
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { useShowHuddleDialog } from "./new/store/use-show-huddle-dialog";
import { logger } from "@/lib/logger";

export function IncomingHuddleNotification() {
  const workspaceId = useWorkspaceId();
  const [, setLiveKitToken] = useLiveKitToken();
  const [, setShowHuddleDialog] = useShowHuddleDialog();
  const { data: incomingHuddle } = useGetIncomingHuddle({
    workspaceId,
  });

  const { data: currentMember } = useCurrentMember({
    workspaceId: workspaceId,
  });

  const { mutate: joinHuddle } = useJoinHuddle();

  const { mutate: declineHuddle } = useDeclineHuddle();

  const { data: caller } = useGetMember({
    id: incomingHuddle?.createdBy ?? undefined,
  });

  const showNotification = Boolean(incomingHuddle);

  // Stop incoming call sound when notification is cleared
  useEffect(() => {
    if (!showNotification) {
      stopHuddleSound("incoming_call");
    }
  }, [showNotification]);

  if (!currentMember) return null;

  const handleJoin = () => {
    if (!incomingHuddle || !workspaceId) return;

    // Stop incoming call sound
    stopHuddleSound("incoming_call");

    // Immediately join the huddle
    joinHuddle(
      {
        huddleId: incomingHuddle._id,
        workspaceId,
        memberId: currentMember._id,
        participantName: getUserDisplayName(caller?.user ?? {}),
      },
      {
        onSuccess: (data) => {
          logger.debug("Joined huddle from notification", {
            huddleId: data.huddleId,
          });
          setShowHuddleDialog(true);
          setLiveKitToken({ token: data.token, url: data.url });
          // Play join sound
          playHuddleSound("join");
        },
        onError: (error) => {
          logger.error(
            "Failed to join huddle from notification",
            error as Error
          );
        },
      }
    );
  };

  const handleDecline = () => {
    if (!incomingHuddle || !workspaceId) return;

    // Stop incoming call sound
    stopHuddleSound("incoming_call");

    // Decline the huddle if we have the huddleId
    if (incomingHuddle?._id) {
      declineHuddle(
        { huddleId: incomingHuddle._id },
        {
          onSuccess: () => {
            logger.debug("Huddle declined, will be deleted after 20 seconds");
          },
          onError: (error) => {
            logger.error("Failed to decline huddle", error as Error);
          },
        }
      );
    }
  };

  if (incomingHuddle?.createdBy === currentMember?._id) return null;

  if (!incomingHuddle || !caller) return null;

  if (!showNotification) {
    return null;
  }

  return (
    <Dialog
      open={showNotification}
      onOpenChange={(open) => {
        // Prevent closing by clicking outside - only allow explicit close via buttons
        if (!open) {
          // Only close if explicitly handled by buttons (handleClose/handleDecline)
          // This prevents accidental dismissal
          return;
        }
      }}
    >
      <DialogContent
        className="max-w-sm p-0 overflow-hidden bg-gray-900 border-gray-700"
        showCloseButton={false}
        onInteractOutside={(e) => {
          // Prevent closing when clicking outside
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Allow ESC key to decline the call
          e.preventDefault();
          handleDecline();
        }}
      >
        <DialogTitle className="sr-only">
          Incoming SyncUp from {getUserDisplayName(caller.user ?? {})}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-center px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Phone className="size-5 text-white" />
            <span className="text-white font-medium">Incoming SyncUp</span>
          </div>
        </div>

        {/* Caller Information */}
        <div className="px-6 py-8 flex flex-col items-center">
          <Avatar className="size-24 border-4 border-blue-500 mb-4">
            <AvatarImage src={caller?.user.image ?? undefined} />
            <AvatarFallback className="text-3xl font-bold bg-blue-500 text-white">
              {getUserDisplayName(caller?.user ?? {})
                .charAt(0)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h3 className="text-2xl font-bold text-white mb-1">
            {getUserDisplayName(caller?.user ?? {})}
          </h3>
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
