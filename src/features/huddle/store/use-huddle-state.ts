import { atom, useAtom } from "jotai";
import { Id } from "../../../../convex/_generated/dataModel";

/**
 * Huddle state type
 * - isHuddleOpen: Whether the huddle dialog is open
 * - isHuddleActive: Whether a huddle is currently active
 * - huddleSource: Where the huddle was started from ("channel" | "dm")
 * - huddleSourceId: The ID of the channel or member (for DM)
 * - incomingHuddle: Information about an incoming huddle notification
 */
export type HuddleSource = "channel" | "dm";

export interface IncomingHuddle {
  callerId: Id<"members">;
  callerName?: string;
  callerImage?: string;
  huddleSource: HuddleSource;
  huddleSourceId: Id<"channels"> | Id<"members">;
}

interface HuddleState {
  isHuddleOpen: boolean;
  isHuddleActive: boolean;
  huddleSource: HuddleSource | null;
  huddleSourceId: Id<"channels"> | Id<"members"> | null;
  incomingHuddle: IncomingHuddle | null;
  currentHuddleId: Id<"huddles"> | null;
}

const huddleStateAtom = atom<HuddleState>({
  isHuddleOpen: false,
  isHuddleActive: false,
  huddleSource: null,
  huddleSourceId: null,
  incomingHuddle: null,
  currentHuddleId: null,
});

export function useHuddleState() {
  return useAtom(huddleStateAtom);
}
