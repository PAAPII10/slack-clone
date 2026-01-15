import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useState, useCallback, useMemo } from "react";
import { getLiveKitToken } from "@/lib/livekit";

type UseJoinChannelHuddleSuccess = {
  channelHuddleId: Id<"channelHuddles">;
  token: string;
  url: string;
  roomId: string;
};

interface UseJoinChannelHuddleOptions {
  onSuccess?: (data: UseJoinChannelHuddleSuccess) => void;
  onError?: (error: Error) => void;
  throwError?: boolean;
}

interface UseJoinChannelHuddleProps {
  workspaceId: Id<"workspaces">;
  channelId: Id<"channels">;
  memberId: Id<"members">;
  participantName: string;
  startMuted?: boolean;
  roomId?: string;
  huddleId: Id<"channelHuddles">;
}

export function useJoinChannelHuddle() {
  const [data, setData] = useState<UseJoinChannelHuddleSuccess | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "success" | "error" | "pending" | "settled" | null
  >(null);

  const mutation = useMutation(api.channelHuddles.joinChannelHuddle);

  const isPending = useMemo(() => status === "pending", [status]);
  const isSuccess = useMemo(() => status === "success", [status]);
  const isError = useMemo(() => status === "error", [status]);
  const isSettled = useMemo(() => status === "settled", [status]);

  const mutate = useCallback(
    async (
      values: UseJoinChannelHuddleProps,
      options?: UseJoinChannelHuddleOptions
    ) => {
      try {
        setData(null);
        setError(null);
        setStatus("pending");

        // Join the channel huddle (returns channelHuddleId and roomId)
        const response = await mutation({
          workspaceId: values.workspaceId,
          channelId: values.channelId,
          startMuted: values.startMuted,
          roomId: values.roomId,
          huddleId: values.huddleId,
        });

        const roomId = response.roomId;

        // Get LiveKit token
        const { token, url } = await getLiveKitToken({
          identity: values.memberId,
          roomName: roomId,
          participantName: values.participantName,
        });

        const result = {
          channelHuddleId: response.channelHuddleId,
          token,
          url,
          roomId,
        };

        options?.onSuccess?.(result);
        setData(result);
        setStatus("success");

        return result;
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
