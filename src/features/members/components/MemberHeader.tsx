import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FaChevronDown } from "react-icons/fa";

interface MemberHeaderProps {
  memberName?: string;
  memberImage?: string;
  onClick?: () => void;
}

export function MemberHeader({
  memberName,
  memberImage,
  onClick,
}: MemberHeaderProps) {
  const avatarFallback = memberName?.charAt(0).toUpperCase();

  return (
    <div className="bg-white border-b flex items-center px-4 h-[49px] overflow-hidden">
      <Button
        variant="ghost"
        className="text-lg font-semibold px-2 overflow-hidden w-auto"
        size="sm"
        onClick={onClick}
      >
        <Avatar className="size-6 mr-2">
          <AvatarImage src={memberImage} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>
        <span className="truncate">{memberName}</span>
        <FaChevronDown className="size-2.5 ml-2" />
      </Button>
    </div>
  );
}
