import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";

interface UseEndHuddleOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

export function useEndHuddle() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.huddles.endHuddle);
  const isPending = useMemo(() => status === "pending", [status]);
  const isSuccess = useMemo(() => status === "success", [status]);
  const isError = useMemo(() => status === "error", [status]);
  const isSettled = useMemo(() => status === "settled", [status]);

  const mutate = useCallback(
    async (huddleId: Id<"huddles">, options?: UseEndHuddleOptions) => {
      try {
        setError(null);
        setStatus("pending");

        await mutation({ huddleId });
        options?.onSuccess?.();
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
