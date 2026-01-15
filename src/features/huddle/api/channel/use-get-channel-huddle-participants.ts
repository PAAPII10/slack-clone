import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetChannelHuddleParticipantsProps {
  channelHuddleId: Id<"channelHuddles"> | null | undefined;
}

export function useGetChannelHuddleParticipants({
  channelHuddleId,
}: UseGetChannelHuddleParticipantsProps) {
  const shouldFetch = channelHuddleId && isValidConvexId(channelHuddleId);
  const data = useQuery(
    api.channelHuddles.getChannelHuddleParticipants,
    shouldFetch ? { channelHuddleId } : "skip"
  );

  const isLoading = data === undefined;
  return { data, isLoading };
}
