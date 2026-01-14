import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa";
import { Phone, PhoneOff } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";
import { useStartHuddle } from "@/features/huddle/api/use-start-huddle";
import { useLeaveHuddle } from "@/features/huddle/api/use-leave-huddle";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Hint } from "@/components/Hint";
import { useHuddleAudioSettings } from "@/features/huddle/hooks/use-huddle-audio-settings";
import { useGetHuddleByCurrentUser } from "@/features/huddle/api/use-get-huddle-by-current-user";
import { useGetConversation } from "@/features/conversation/api/use-get-conversation";

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
  const avatarFallback = memberName?.charAt(0).toUpperCase();
  const isOnline = useMemberOnlineStatus({ memberId });
  const workspaceId = useWorkspaceId();
  const { data: huddle } = useGetHuddleByCurrentUser({ workspaceId });
  const { mutate: startHuddle } = useStartHuddle();
  const { mutate: leaveHuddle } = useLeaveHuddle();
  const { settings } = useHuddleAudioSettings();
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
    if (!memberId || !workspaceId) return;

    // Immediately start/join huddle - no join screen
    startHuddle(
      {
        workspaceId,
        sourceType: "dm",
        sourceId: memberId,
        startMuted: settings.startMuted,
      },
      {
        onSuccess: (huddleId) => {
          console.log("Huddle started/joined successfully:", huddleId);
          // Play join sound
          playHuddleSound("join");
        },
        onError: (error) => {
          console.error("Failed to start huddle:", error);
        },
      }
    );
  };

  const handleHangup = () => {
    if (!huddle?._id) return;

    playHuddleSound("hangup");
    leaveHuddle(huddle._id, {
      onSuccess: () => {
        console.log("Huddle hung up successfully");
      },
      onError: (error) => {
        console.error("Failed to hangup huddle:", error);
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
      ) : (
        <Hint label="Start Huddle">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm"
            onClick={handleStartHuddle}
          >
            <Phone className="size-4" />
          </Button>
        </Hint>
      )}
    </div>
  );
}
