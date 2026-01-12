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

export function UserButton() {
  const { data, isLoading } = useCurrentUser();
  const { signOut } = useAuthActions();
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
        <Avatar className="size-10 hover:opacity-75 transition">
          <AvatarImage alt={name} src={image} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>
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
