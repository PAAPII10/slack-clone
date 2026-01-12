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
}: UserItemProps) {
  const workspaceId = useWorkspaceId();
  const avatarFallback = label.charAt(0).toUpperCase();
  const isOnline = useMemberOnlineStatus({ memberId: id });

  return (
    <Button
      variant="transparent"
      size="sm"
      className={cn(userItemVariants({ variant }))}
      asChild
    >
      <Link href={`/workspace/${workspaceId}/member/${id}`}>
        <div className="relative">
          <Avatar className="size-5 mr-1">
            <AvatarImage src={image} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
          {isOnline ? (
            <span
              className="absolute bottom-0 right-0.5 size-2 bg-green-500 border border-[#5E2C5F] rounded-full"
              aria-label="Online"
            />
          ) : (
            <span
              className="absolute bottom-0 right-0.5 size-2 bg-gray-400 border border-[#5E2C5F] rounded-full"
              aria-label="Offline"
            />
          )}
        </div>
        <span className="text-sm truncate">{label}</span>
      </Link>
    </Button>
  );
}
