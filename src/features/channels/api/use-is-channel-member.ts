import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseIsChannelMemberProps {
  channelId: Id<"channels">;
}

export function useIsChannelMember({ channelId }: UseIsChannelMemberProps) {
  const shouldFetch = isValidConvexId(channelId);
  const data = useQuery(api.channels.isChannelMember, shouldFetch ? { channelId } : "skip");
  const isLoading = data === undefined && shouldFetch;
  return { data: data ?? false, isLoading };
}
