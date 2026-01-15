import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetChannelHuddleProps {
  channelId: Id<"channels"> | null | undefined;
}

export function useGetChannelHuddle({ channelId }: UseGetChannelHuddleProps) {
  const shouldFetch = channelId && isValidConvexId(channelId);
  const data = useQuery(
    api.channelHuddles.getActiveChannelHuddleWithCount,
    shouldFetch ? { channelId } : "skip"
  );
  const isLoading = data === undefined;
  const hasActiveHuddle = data !== null && data !== undefined;
  return { data, isLoading, hasActiveHuddle };
}
