"use client";

import { useEffect } from "react";
import { useCreateWorkspaceModal } from "@/features/workspaces/store/useCreateWorkspaceModal";
import { useGetWorkspaces } from "@/features/workspaces/api/use-get-workspaces";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

export default function Home() {
  const [open, setOpen] = useCreateWorkspaceModal();
  const router = useRouter();
  const { data, isLoading } = useGetWorkspaces();

  const workspaceId = data?.[0]?._id;

  useEffect(() => {
    if (isLoading) return;

    if (workspaceId) {
      router.replace(`/workspace/${workspaceId}`);
    } else if (!open) {
      setOpen(true);
    }
  }, [isLoading, open, router, setOpen, workspaceId]);

  return (
    <div className="flex items-center justify-center h-full">
      <Loader className="size-6 text-muted-foreground animate-spin" />
    </div>
  );
}
