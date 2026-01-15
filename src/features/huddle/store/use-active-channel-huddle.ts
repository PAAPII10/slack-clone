import { atom, useAtom } from "jotai";
import { Id } from "../../../../convex/_generated/dataModel";

// Use the same type as getCurrentUserHuddle return type
type ChannelHuddleData = {
  huddleId: Id<"huddles">;
  channelId: Id<"channels">;
} | null;

const activeChannelHuddleAtom = atom<ChannelHuddleData>(null);

export function useActiveChannelHuddle() {
  return useAtom(activeChannelHuddleAtom);
}
