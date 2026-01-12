"use client";

import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useGetWorkspaceInfo } from "@/features/workspaces/api/use-get-workspace-info";
import { useJoin } from "@/features/workspaces/api/use-join";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { Loader } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export default function JoinPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();

  const { data: workspaceInfo, isLoading: isLoadingWorkspaceInfo } =
    useGetWorkspaceInfo({ id: workspaceId });

  const { mutate: join, isPending: isJoining } = useJoin();

  const isMember = workspaceInfo?.isMember;

  useEffect(() => {
    if (isMember) {
      router.replace(`/workspace/${workspaceId}`);
    }
  }, [isMember, router, workspaceId]);

  if (isLoadingWorkspaceInfo || isMember) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="size-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const handleJoin = (code: string) => {
    join(
      { workspaceId, joinCode: code },
      {
        onSuccess: (id) => {
          toast.success("Workspace joined.");
          router.replace(`/workspace/${id}`);
        },
        onError: () => {
          toast.error("Failed to join workspace");
        },
      }
    );
  };

  return (
    <div
      className="h-full flex flex-col gap-y-8
   items-center justify-center bg-white p-8 rounded-lg shadow-md"
    >
      <Image src="/logo.svg" alt="Logo" width={60} height={60} />
      <div className="flex flex-col gap-y-4 items-center justify-center max-w-md">
        <div className="flex flex-col gap-y-2 items-center justify-center">
          <h1 className="text-2xl font-bold">Join {workspaceInfo?.name}</h1>
          <p className="text-md text-muted-foreground">
            Enter the join code to join
          </p>
        </div>
        <InputOTP
          maxLength={6}
          autoFocus
          pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
          onComplete={handleJoin}
          disabled={isJoining}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className="flex gap-x-4">
        <Button size="lg" variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
