import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { WebRTCSignal } from "@/lib/webrtc-signal-types";

interface UseSendSignalProps {
  huddleId: Id<"huddles">;
  toMemberId: Id<"members">;
  signal: WebRTCSignal;
}

export function useSendSignal() {
  const mutation = useMutation(api.huddles.sendSignal);

  const sendSignal = (props: UseSendSignalProps) => {
    return mutation(props);
  };

  return { sendSignal };
}
