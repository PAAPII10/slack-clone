import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetHuddleProps {
  id: Id<"huddles"> | null | undefined;
  workspaceId: Id<"workspaces"> | null | undefined;
}

export function useGetHuddle({ id, workspaceId }: UseGetHuddleProps) {
  const shouldFetch = isValidConvexId(id) && isValidConvexId(workspaceId);
  const data = useQuery(
    api.huddles.getHuddleById,
    shouldFetch ? { id, workspaceId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
