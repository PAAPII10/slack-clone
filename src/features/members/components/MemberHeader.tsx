import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa";
import { Phone } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";
import { useHuddleState } from "@/features/huddle/store/use-huddle-state";
import { useStartHuddle } from "@/features/huddle/api/use-start-huddle";
import { playHuddleSound } from "@/lib/huddle-sounds";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Hint } from "@/components/Hint";
import { useHuddleAudioSettings } from "@/features/huddle/hooks/use-huddle-audio-settings";

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
  const [, setHuddleState] = useHuddleState();
  const workspaceId = useWorkspaceId();
  const { mutate: startHuddle } = useStartHuddle();
  const { settings } = useHuddleAudioSettings();

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
          setHuddleState((prev) => ({
            ...prev,
            currentHuddleId: huddleId,
            isHuddleActive: true,
            isHuddleOpen: true,
            huddleSource: "dm",
            huddleSourceId: memberId,
          }));
        },
        onError: (error) => {
          console.error("Failed to start huddle:", error);
        },
      }
    );
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
    </div>
  );
}
