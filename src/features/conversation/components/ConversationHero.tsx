import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePanel } from "@/hooks/use-panel";
import { Id } from "../../../../convex/_generated/dataModel";

interface ConversationHeroProps {
  name?: string;
  image?: string;
  memberId?: Id<"members">;
}

export function ConversationHero({
  name = "Member",
  image,
  memberId,
}: ConversationHeroProps) {
  const { onOpenProfile } = usePanel();
  const avatarFallback = name.charAt(0).toUpperCase();
  return (
    <div className="mt-[88px] mx-5 mb-4">
      <button
        className="flex items-center gap-x-1 mb-2 cursor-pointer"
        onClick={() => {
          if (memberId) onOpenProfile(memberId);
        }}
      >
        <Avatar className="size-14 mr-2">
          <AvatarImage src={image} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>
        <p className="text-2xl font-bold">{name}</p>
      </button>
      <p className="font-normal text-slate-800 mb-4">
        This conversation is between you and <strong>{name}</strong>.
      </p>
    </div>
  );
}
