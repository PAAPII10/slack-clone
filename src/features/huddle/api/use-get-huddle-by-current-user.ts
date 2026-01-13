import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetHuddleByCurrentUserProps {
  workspaceId: Id<"workspaces">;
}

export function useGetHuddleByCurrentUser({
  workspaceId,
}: UseGetHuddleByCurrentUserProps) {
  const shouldFetch = isValidConvexId(workspaceId);
  const data = useQuery(
    api.huddles.getCurrentUserHuddle,
    shouldFetch ? { workspaceId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
