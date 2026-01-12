import { useChannelId } from "./use-channel-id";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Hook to get the currently active channel ID
 * Returns null if no channel is active
 */
export function useActiveChannel(): Id<"channels"> | null {
  const channelId = useChannelId();
  return channelId || null;
}
