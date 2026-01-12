import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetChannelMembersProps {
  channelId: Id<"channels">;
}

export function useGetChannelMembers({ channelId }: UseGetChannelMembersProps) {
  const data = useQuery(api.channels.getChannelMembers, { channelId });
  const isLoading = data === undefined;
  return { data, isLoading };
}
