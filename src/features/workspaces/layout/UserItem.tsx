import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Id } from "../../../../convex/_generated/dataModel";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";

interface UserItemProps {
  id: Id<"members">;
  label?: string;
  image?: string;
  variant?: VariantProps<typeof userItemVariants>["variant"];
  unreadCount?: number;
}

const userItemVariants = cva(
  "flex items-center justify-start gap-1.5 font-normal h-7 px-2 text-sm overflow-hidden",
  {
    variants: {
      variant: {
        default: "text-[#f9edffcc]",
        active: "text-[#481349] bg-white/90 hover:bg-white/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export function UserItem({
  id,
  label = "Member",
  image,
  variant,
  unreadCount = 0,
}: UserItemProps) {
  const workspaceId = useWorkspaceId();
  const avatarFallback = label.charAt(0).toUpperCase();
  const isOnline = useMemberOnlineStatus({ memberId: id });
  const hasUnread = unreadCount > 0;

  return (
    <Button
      variant="transparent"
      size="sm"
      className={cn(
        userItemVariants({ variant }),
        "relative",
        hasUnread && "font-semibold"
      )}
      asChild
    >
      <Link href={`/workspace/${workspaceId}/member/${id}`} className="flex items-center w-full">
        {/* Unread dot indicator - positioned on the left edge like Slack */}
        {hasUnread && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white shrink-0 z-10" />
        )}
        <div className="relative shrink-0">
          <Avatar className="size-5 mr-1">
            <AvatarImage src={image} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
          {isOnline ? (
            <span
              className="absolute bottom-0 right-0.5 size-2 bg-green-500 border border-[#5E2C5F] rounded-full z-10"
              aria-label="Online"
            />
          ) : (
            <span
              className="absolute bottom-0 right-0.5 size-2 bg-gray-400 border border-[#5E2C5F] rounded-full z-10"
              aria-label="Offline"
            />
          )}
        </div>
        <span className="text-sm truncate flex-1">{label}</span>
        {/* Unread count badge - positioned on the right like Slack */}
        {hasUnread && unreadCount > 0 && (
          <span className="ml-auto mr-0 bg-white text-[#481349] text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight shrink-0">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    </Button>
  );
}
