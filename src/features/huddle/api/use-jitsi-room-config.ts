import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";

interface UseJitsiRoomConfigOptions {
  onSuccess?: (data: {
    roomName: string;
    displayName: string;
    email?: string;
  }) => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

export function useJitsiRoomConfig() {
  const [data, setData] = useState<{
    roomName: string;
    displayName: string;
    email?: string;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.jitsi.getJitsiRoomConfig);
  const isPending = useMemo(() => status === "pending", [status]);
  const isSuccess = useMemo(() => status === "success", [status]);
  const isError = useMemo(() => status === "error", [status]);
  const isSettled = useMemo(() => status === "settled", [status]);

  const mutate = useCallback(
    async (huddleId: Id<"huddles">, options?: UseJitsiRoomConfigOptions) => {
      try {
        setData(null);
        setError(null);
        setStatus("pending");

        const response = await mutation({ huddleId });
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
