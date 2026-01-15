import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetChannelHuddleByCurrentUserProps {
  workspaceId: Id<"workspaces">;
  channelId: Id<"channels">;
}

export function useGetChannelHuddleByCurrentUser({
  workspaceId,
  channelId,
}: UseGetChannelHuddleByCurrentUserProps) {
  const shouldFetch =
    isValidConvexId(workspaceId) && isValidConvexId(channelId);
  const data = useQuery(
    api.channelHuddles.getCurrentUserChannelHuddle,
    shouldFetch ? { workspaceId, channelId } : "skip"
  );

  const isLoading = data === undefined;
  return { data, isLoading };
}
