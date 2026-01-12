import { Button } from "@/components/ui/button";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { LucideIcon, Plus } from "lucide-react";
import Link from "next/link";
import { IconType } from "react-icons/lib";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  label: string;
  icon: LucideIcon | IconType;
  id: string;
  variant?: VariantProps<typeof sidebarItemVariants>["variant"];
  href?: string;
  showJoinButton?: boolean;
  onJoin?: () => void;
  isJoining?: boolean;
  unreadCount?: number;
}

const sidebarItemVariants = cva(
  "flex items-center justify-start gap-1.5 h-7 px-[18px] text-sm overflow-hidden",
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

export function SidebarItem({
  label,
  icon: Icon,
  id,
  variant,
  href,
  showJoinButton,
  onJoin,
  isJoining,
  unreadCount = 0,
}: SidebarItemProps) {
  const workspaceId = useWorkspaceId();
  const hasUnread = unreadCount > 0;

  const handleJoinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onJoin?.();
  };

  return (
    <div className="flex items-center group">
      <Button
        asChild
        variant="transparent"
        size="sm"
        className={cn(
          sidebarItemVariants({ variant }),
          "flex-1 relative",
          hasUnread && "font-semibold"
        )}
      >
        <Link href={href ? href : `/workspace/${workspaceId}/channel/${id}`} className="flex items-center w-full">
          {/* Unread dot indicator - positioned on the left edge like Slack */}
          {hasUnread && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white shrink-0" />
          )}
          <Icon className="size-3.5 mr-1 shrink-0" />
          <span className="text-sm truncate flex-1">{label}</span>
          {/* Unread count badge - positioned on the right like Slack */}
          {hasUnread && unreadCount > 0 && (
            <span className="ml-auto mr-0 bg-white text-[#481349] text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight shrink-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
      </Button>
      {showJoinButton && (
        <Button
          variant="transparent"
          size="sm"
          onClick={handleJoinClick}
          disabled={isJoining}
          className="opacity-0 group-hover:opacity-100 transition-opacity px-2 text-[#f9edffcc] hover:text-white"
        >
          <Plus className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
