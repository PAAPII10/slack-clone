import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetActiveHuddleParticipantsProps {
  channelId?: Id<"channels"> | null | undefined;
}

export function useGetActiveChannelHuddleParticipants({
  channelId,
}: UseGetActiveHuddleParticipantsProps) {
  const shouldFetch = channelId && isValidConvexId(channelId);
  const data = useQuery(
    api.huddles.getActiveChannelHuddleParticipants,
    shouldFetch ? { channelId } : "skip"
  );
  const isLoading = data === undefined || data?.participants === undefined;
  const hasActiveHuddle =
    data?.huddleId !== null && data?.huddleId !== undefined;
  return {
    data: data?.participants ?? [],
    isLoading,
    hasActiveHuddle,
    huddleId: data?.huddleId ?? null,
  };
}
