import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa";
import { Id } from "../../../../convex/_generated/dataModel";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";

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

  return (
    <div className="bg-white border-b flex items-center px-4 h-[49px] overflow-hidden">
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
    </div>
  );
}
