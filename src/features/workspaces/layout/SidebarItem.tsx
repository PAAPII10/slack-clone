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
}

const sidebarItemVariants = cva(
  "flex items-center justify-start gap-1.5 font-normal h-7 px-[18px] text-sm overflow-hidden",
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
}: SidebarItemProps) {
  const workspaceId = useWorkspaceId();

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
        className={cn(sidebarItemVariants({ variant }), "flex-1")}
      >
        <Link href={href ? href : `/workspace/${workspaceId}/channel/${id}`}>
          <Icon className="size-3.5 mr-1 shrink-0" />
          <span className="text-sm truncate">{label}</span>
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
