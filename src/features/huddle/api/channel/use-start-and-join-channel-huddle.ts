import { useCallback, useState, useMemo } from "react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useCreateChannelHuddle } from "./use-create-channel-huddle";
import { useJoinChannelHuddle } from "./use-join-channel-huddle";
import { logger } from "@/lib/logger";

type UseStartAndJoinChannelHuddleSuccess = {
  channelHuddleId: Id<"channelHuddles">;
  roomId: string;
  token: string;
  url: string;
};

interface UseStartAndJoinChannelHuddleProps {
  workspaceId: Id<"workspaces">;
  channelId: Id<"channels">;
  memberId: Id<"members">;
  participantName: string;
  startMuted?: boolean;
  roomId?: string;
}

interface UseStartAndJoinChannelHuddleOptions {
  onSuccess?: (data: UseStartAndJoinChannelHuddleSuccess) => void;
  onError?: (error: Error, step: "start" | "join") => void;
}

/**
 * Reusable hook that starts a channel huddle and automatically joins it with a room
 */
export function useStartAndJoinChannelHuddle() {
  const { mutate: createChannelHuddle } = useCreateChannelHuddle();
  const { mutate: joinChannelHuddle } = useJoinChannelHuddle();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentStep, setCurrentStep] = useState<
    "idle" | "starting" | "joining"
  >("idle");

  const startAndJoin = useCallback(
    async (
      props: UseStartAndJoinChannelHuddleProps,
      options?: UseStartAndJoinChannelHuddleOptions
    ) => {
      try {
        setIsPending(true);
        setError(null);
        setCurrentStep("starting");

        // Step 1: Create channel huddle (or get existing one)
        const huddleId = await new Promise<Id<"channelHuddles">>(
          (resolve, reject) => {
            createChannelHuddle(
              {
                workspaceId: props.workspaceId,
                channelId: props.channelId,
                startMuted: props.startMuted,
              },
              {
                onSuccess: (huddleId) => {
                  logger.debug("Channel huddle created successfully", {
                    channelHuddleId: huddleId,
                  });
                  resolve(huddleId);
                },
                onError: (error) => {
                  logger.error(
                    "Failed to create channel huddle",
                    error as Error
                  );
                  setError(error);
                  setCurrentStep("idle");
                  options?.onError?.(error, "start");
                  reject(error);
                },
              }
            );
          }
        );

        // Step 2: Join channel huddle with room
        setCurrentStep("joining");
        const joinResult =
          await new Promise<UseStartAndJoinChannelHuddleSuccess>(
            (resolve, reject) => {
              joinChannelHuddle(
                {
                  huddleId,
                  workspaceId: props.workspaceId,
                  channelId: props.channelId,
                  memberId: props.memberId,
                  participantName: props.participantName,
                  startMuted: props.startMuted,
                  roomId: props.roomId,
                },
                {
                  onSuccess: (data) => {
                    logger.debug("Channel huddle joined successfully", {
                      channelHuddleId: data.channelHuddleId,
                    });
                    resolve(data);
                  },
                  onError: (error) => {
                    logger.error(
                      "Failed to join channel huddle",
                      error as Error
                    );
                    setError(error);
                    setCurrentStep("idle");
                    options?.onError?.(error, "join");
                    reject(error);
                  },
                }
              );
            }
          );

        // Success - both steps completed
        setCurrentStep("idle");
        setIsPending(false);
        options?.onSuccess?.(joinResult);
        return joinResult;
      } catch (error) {
        setError(error as Error);
        setCurrentStep("idle");
        setIsPending(false);
        throw error;
      }
    },
    [createChannelHuddle, joinChannelHuddle]
  );

  return {
    startAndJoin,
    isPending,
    error,
    currentStep,
    isStarting: useMemo(() => currentStep === "starting", [currentStep]),
    isJoining: useMemo(() => currentStep === "joining", [currentStep]),
  };
}
