import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";

interface UseJoinHuddleOptions {
  onSuccess?: (huddleId: Id<"huddles">) => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

interface UseJoinHuddleProps {
  workspaceId: Id<"workspaces">;
  huddleId: Id<"huddles">;
}

export function useJoinHuddle() {
  const [data, setData] = useState<Id<"huddles"> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.huddles.joinHuddleByHuddleId);
  const isPending = useMemo(() => status === "pending", [status]);
  const isSuccess = useMemo(() => status === "success", [status]);
  const isError = useMemo(() => status === "error", [status]);
  const isSettled = useMemo(() => status === "settled", [status]);

  const mutate = useCallback(
    async (values: UseJoinHuddleProps, options?: UseJoinHuddleOptions) => {
      try {
        setData(null);
        setError(null);
        setStatus("pending");

        const response = await mutation(values);
        options?.onSuccess?.(response);
        setData(response);
        setStatus("success");
        return response;
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

  return { mutate, data, error, isPending, isSuccess, isError, isSettled };
}
