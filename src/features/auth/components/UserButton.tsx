"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "../api/use-current-user";
import { Loader, LogOut } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useMemberOnlineStatus } from "@/features/presence/api/use-presence";

export function UserButton() {
  const { data, isLoading } = useCurrentUser();
  const { signOut } = useAuthActions();
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({
    workspaceId: workspaceId!,
  });
  const isOnline = useMemberOnlineStatus({
    memberId: currentMember?._id,
  });

  if (isLoading) {
    return <Loader className="size-4 text-muted-foreground animate-spin" />;
  }

  if (!data) {
    return null;
  }

  const { name, image } = data;

  const avatarFallback = name!.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="outline-none relative">
        <div className="relative">
          <Avatar className="size-10 hover:opacity-75 transition">
            <AvatarImage alt={name} src={image} />
            <AvatarFallback>{avatarFallback}</AvatarFallback>
          </Avatar>
          {currentMember && (
            <>
              {isOnline ? (
                <span
                  className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-[#481349] rounded-full"
                  aria-label="Online"
                />
              ) : (
                <span
                  className="absolute bottom-0 right-0 size-3 bg-gray-400 border-2 border-[#481349] rounded-full"
                  aria-label="Offline"
                />
              )}
            </>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="center" side="right">
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="size-4 mr-2" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
