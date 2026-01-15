import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";
import { useActiveChannelHuddle } from "../../store/use-active-channel-huddle";

interface UseGetChannelHuddleByCurrentUserProps {
  workspaceId: Id<"workspaces">;
  channelId?: Id<"channels">;
  huddleId?: Id<"huddles">;
}

export function useGetChannelHuddleByCurrentUser({
  workspaceId,
}: UseGetChannelHuddleByCurrentUserProps) {
  const [activeChannelHuddle] = useActiveChannelHuddle();
  const shouldFetch =
    isValidConvexId(workspaceId) &&
    isValidConvexId(activeChannelHuddle?.channelId) &&
    isValidConvexId(activeChannelHuddle?.huddleId);
  const data = useQuery(
    api.huddles.getCurrentUserChannelHuddle,
    shouldFetch
      ? {
          workspaceId,
          channelId: activeChannelHuddle?.channelId,
          huddleId: activeChannelHuddle?.huddleId,
        }
      : "skip"
  );

  const isLoading = data === undefined;
  return { data, isLoading };
}
