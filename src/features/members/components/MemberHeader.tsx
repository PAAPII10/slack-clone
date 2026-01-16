import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa";
import { Phone, PhoneOff } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";
import { useLeaveHuddle } from "@/features/huddle/api/use-leave-huddle";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Hint } from "@/components/Hint";
import { useGetConversation } from "@/features/conversation/api/use-get-conversation";
import { useStartAndJoinHuddle } from "@/features/huddle/api/new/use-start-and-join-huddle";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { useShowHuddleDialog } from "@/features/huddle/components/new/store/use-show-huddle-dialog";
import { deleteLiveKitRoom } from "@/lib/livekit";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { useGetActiveHuddle } from "@/features/huddle/api/new/use-get-active-huddle";
import { useGetMember } from "../api/use-get-member";
import { useJoinHuddle } from "@/features/huddle/api/new/use-join-huddle";
import { useGetHuddle } from "@/features/huddle/api/new/use-get-huddle";
import { getUserDisplayName } from "@/lib/user-utils";
import { cn } from "@/lib/utils";

interface MemberHeaderProps {
  memberName?: string;
  memberImage?: string;
  memberId?: Id<"members">;
  onClick?: () => void;
}

export function MemberHeader({
  memberName,
  memberImage,
  memberId,
  onClick,
}: MemberHeaderProps) {
  const [, setShowHuddleDialog] = useShowHuddleDialog();
  const avatarFallback = memberName?.charAt(0).toUpperCase();
  const { data: member } = useGetMember({ id: memberId });
  const isOnline = useMemberOnlineStatus({ memberId });
  const workspaceId = useWorkspaceId();

  const [, setLiveKitToken] = useLiveKitToken();
  const { data: currentMember } = useCurrentMember({ workspaceId });

  const { data: huddle } = useGetActiveHuddle({ workspaceId });

  const { data: memberHuddle } = useGetHuddle({
    id: member?.activeHuddleId,
    workspaceId,
  });

  const {
    startAndJoin,
    isPending: isStartingHuddle,
    currentStep,
  } = useStartAndJoinHuddle();

  const { mutate: joinHuddle } = useJoinHuddle();

  const { mutate: leaveHuddle } = useLeaveHuddle();

  const conversationId = useGetConversation({
    workspaceId,
    memberId,
  });

  // Check if there's an active huddle for this DM conversation
  const isActiveHuddleForThisMember =
    huddle?.isActive &&
    huddle?.sourceType === "dm" &&
    huddle?.conversationId === conversationId;

  const handleStartHuddle = () => {
    if (!memberId || !workspaceId || !currentMember?._id) return;

    // If the member is already in a huddle for this conversation, join it
    if (memberHuddle && conversationId === memberHuddle?.conversationId) {
      joinHuddle(
        {
          huddleId: memberHuddle._id,
          workspaceId,
          memberId: currentMember._id,
          participantName: getUserDisplayName(currentMember.user ?? {}),
        },
        {
          onSuccess: (data) => {
            setLiveKitToken({ token: data.token, url: data.url });
            setShowHuddleDialog(true);
            logger.debug("Huddle  joined successfully", {
              huddleId: data.huddleId,
            });
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
    } else {
      startAndJoin(
        {
          workspaceId,
          sourceType: "dm",
          sourceId: memberId,
          memberId: currentMember._id,
          participantName: memberName ?? "Anonymous",
        },
        {
          onSuccess: (data) => {
            setLiveKitToken({ token: data.token, url: data.url });
            setShowHuddleDialog(true);
            logger.debug("Huddle started and joined successfully", {
              huddleId: data.huddleId,
            });
          },
          onError: (error, step) => {
            logger.error(`Failed to ${step} huddle`, error as Error);
            setLiveKitToken(null);
          },
        }
      );
    }
  };

  const handleHangup = () => {
    if (!huddle?._id) return;

    leaveHuddle(huddle._id, {
      onSuccess: (data) => {
        if (data.roomId) {
          deleteLiveKitRoom(data.roomId);
          playHuddleSound("hangup");
        }
      },
    });
  };

  return (
    <div className="bg-white border-b flex items-center justify-between px-4 h-[49px] overflow-hidden">
      <Button
        variant="ghost"
        className="text-lg font-semibold px-2 overflow-hidden w-auto"
        size="sm"
        onClick={onClick}
      >
        <div className="relative">
          <Avatar className="size-6 mr-2">
            <AvatarImage src={memberImage} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
          {isOnline ? (
            <span
              className="absolute bottom-0 right-1.5 size-2.5 bg-green-500 border-2 border-white rounded-full"
              aria-label="Online"
            />
          ) : (
            <span
              className="absolute bottom-0 right-1.5 size-2.5 bg-gray-400 border-2 border-white rounded-full"
              aria-label="Offline"
            />
          )}
        </div>
        <span className="truncate">{memberName}</span>
        <FaChevronDown className="size-2.5 ml-2" />
      </Button>
      {isActiveHuddleForThisMember ? (
        <Hint label="Hangup">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-red-600 hover:text-red-700"
            onClick={handleHangup}
          >
            <PhoneOff className="size-4" />
          </Button>
        </Hint>
      ) : currentStep === "starting" || currentStep === "joining" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>
            {currentStep === "starting"
              ? "Starting huddle..."
              : "Joining huddle..."}
          </span>
        </div>
      ) : (
        <Hint
          label={
            conversationId === memberHuddle?.conversationId
              ? "Join Huddle"
              : member?.activeHuddleId
              ? "Already in a huddle"
              : "Start Huddle"
          }
        >
          <span className="inline-block">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-sm",
                conversationId === memberHuddle?.conversationId &&
                  "bg-green-500/10 hover:bg-green-500/20 text-green-600 hover:text-green-700"
              )}
              onClick={handleStartHuddle}
              disabled={
                isStartingHuddle ||
                (!!member?.activeHuddleId &&
                  conversationId !== memberHuddle?.conversationId)
              }
            >
              <Phone className="size-4" />
            </Button>
          </span>
        </Hint>
      )}
    </div>
  );
}
