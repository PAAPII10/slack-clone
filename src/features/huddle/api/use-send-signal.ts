import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseSendSignalProps {
  huddleId: Id<"huddles">;
  toMemberId: Id<"members">;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signal: any; // WebRTC signal object
}

export function useSendSignal() {
  const mutation = useMutation(api.huddles.sendSignal);

  const sendSignal = (props: UseSendSignalProps) => {
    return mutation(props);
  };

  return { sendSignal };
}
