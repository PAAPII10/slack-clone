import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetIncomingHuddleProps {
  workspaceId?: Id<"workspaces">;
}

export function useGetIncomingHuddle({
  workspaceId,
}: UseGetIncomingHuddleProps) {
  const shouldFetch = isValidConvexId(workspaceId);
  const data = useQuery(
    api.huddles.getIncomingHuddle,
    shouldFetch ? { workspaceId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
