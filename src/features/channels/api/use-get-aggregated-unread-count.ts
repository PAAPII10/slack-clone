import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetAggregatedUnreadCountProps {
  workspaceId: Id<"workspaces">;
}

export function useGetAggregatedUnreadCount({
  workspaceId,
}: UseGetAggregatedUnreadCountProps) {
  const data = useQuery(api.readState.getAggregatedUnreadCount, {
    workspaceId,
  });
  const isLoading = data === undefined;
  return { data: data ?? 0, isLoading };
}
