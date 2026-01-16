import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";

interface UseLeaveHuddleOptions {
  onSuccess?: (response: {
    huddleId: Id<"huddles">;
    roomId?: string;
    participantsCount: number;
  }) => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

export function useLeaveHuddle() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.huddles.leaveHuddle);
  const isPending = useMemo(() => status === "pending", [status]);
  const isSuccess = useMemo(() => status === "success", [status]);
  const isError = useMemo(() => status === "error", [status]);
  const isSettled = useMemo(() => status === "settled", [status]);

  const mutate = useCallback(
    async (huddleId: Id<"huddles">, options?: UseLeaveHuddleOptions) => {
      try {
        setError(null);
        setStatus("pending");

        const response = await mutation({ huddleId });
        if (response) {
          options?.onSuccess?.(response);
        }
        setStatus("success");
      } catch (error) {
        setError(error as Error);
        setStatus("error");
        options?.onError?.(error as Error);
        if (options?.throwError) {
          throw error;
        }
      } finally {
        setStatus("settled");
      }
    },
    [mutation]
  );

  return { mutate, error, isPending, isSuccess, isError, isSettled };
}
