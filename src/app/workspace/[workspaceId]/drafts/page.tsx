"use client";

import { TriangleAlert } from "lucide-react";

export default function DraftsPage() {
  return (
    <div className="flex-1 flex items-center justify-center h-full gap-y-2 flex-col">
      <TriangleAlert className="size-5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Drafts page is currently in progress
      </span>
    </div>
  );
}
