import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";
import { getLiveKitToken } from "@/lib/livekit";

type UseJoinHuddleSuccess = {
  huddleId: Id<"huddles">;
  token: string;
  url: string;
};

interface UseJoinHuddleOptions {
  onSuccess?: (data: UseJoinHuddleSuccess) => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

interface UseJoinHuddleProps {
  workspaceId: Id<"workspaces">;
  huddleId: Id<"huddles">;
  memberId: Id<"members">;
  participantName: string;
}

export function useJoinHuddle() {
  const [data, setData] = useState<UseJoinHuddleSuccess | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.huddles.joinHuddleWithRoom);

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

        const response = await mutation({
          workspaceId: values.workspaceId,
          huddleId: values.huddleId,
        });

        const { token, url } = await getLiveKitToken({
          identity: values.memberId,
          roomName: response.roomId,
          participantName: values.participantName,
        });

        options?.onSuccess?.({
          ...response,
          token,
          url,
        });

        setData({
          ...response,
          token,
          url,
        });
        setStatus("success");

        return {
          ...response,
          token,
          url,
        };
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
