import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetUnreadCountsProps {
  workspaceId: Id<"workspaces">;
}

export function useGetUnreadCounts({ workspaceId }: UseGetUnreadCountsProps) {
  const data = useQuery(api.readState.getUnreadCounts, { workspaceId });
  const isLoading = data === undefined;
  return { data: data || {}, isLoading };
}
