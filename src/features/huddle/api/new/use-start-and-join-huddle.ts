import { useCallback, useState, useMemo } from "react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useStartHuddleWithoutRoom } from "./use-start-huddle-without-room";
import { useJoinHuddle } from "./use-join-huddle";
import { HuddleSource } from "../../store/use-huddle-state";
import { logger } from "@/lib/logger";

// Type for join huddle response (includes roomId from mutation)
type UseJoinHuddleSuccess = {
  huddleId: Id<"huddles">;
  roomId: string;
  token: string;
  url: string;
};

interface UseStartAndJoinHuddleProps {
  workspaceId: Id<"workspaces">;
  sourceType: HuddleSource;
  sourceId: Id<"channels"> | Id<"conversations"> | Id<"members">;
  memberId: Id<"members">;
  participantName: string;
  startMuted?: boolean;
  roomId?: string;
}

interface UseStartAndJoinHuddleOptions {
  onSuccess?: (data: {
    huddleId: Id<"huddles">;
    roomId: string;
    token: string;
    url: string;
  }) => void;
  onError?: (error: Error, step: "start" | "join") => void;
}

/**
 * Reusable hook that starts a huddle and automatically joins it with a room
 *
 * This hook combines the two-step process:
 * 1. Create huddle without room (createHuddleWithoutRoom)
 * 2. Join huddle with room (joinHuddleWithRoom)
 *
 * @example
 * ```tsx
 * const { startAndJoin, isPending } = useStartAndJoinHuddle();
 *
 * const handleStart = () => {
 *   startAndJoin({
 *     workspaceId,
 *     sourceType: "dm",
 *     sourceId: memberId,
 *     memberId: currentMember._id,
 *     participantName: "John Doe",
 *     startMuted: false,
 *   }, {
 *     onSuccess: (data) => {
 *       console.log("Huddle started and joined:", data);
 *     },
 *   });
 * };
 * ```
 */
export function useStartAndJoinHuddle() {
  const { mutate: startHuddleWithoutRoom } = useStartHuddleWithoutRoom();
  const { mutate: joinHuddle } = useJoinHuddle();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentStep, setCurrentStep] = useState<
    "idle" | "starting" | "joining"
  >("idle");

  const startAndJoin = useCallback(
    async (
      props: UseStartAndJoinHuddleProps,
      options?: UseStartAndJoinHuddleOptions
    ) => {
      try {
        setIsPending(true);
        setError(null);
        setCurrentStep("starting");

        // Step 1: Start huddle without room
        const huddleId = await new Promise<Id<"huddles">>((resolve, reject) => {
          startHuddleWithoutRoom(
            {
              workspaceId: props.workspaceId,
              sourceType: props.sourceType,
              sourceId: props.sourceId,
              startMuted: props.startMuted,
            },
            {
              onSuccess: (huddleId) => {
                logger.debug("Huddle started successfully", { huddleId });
                resolve(huddleId);
              },
              onError: (error) => {
                logger.error("Failed to start huddle", error as Error);
                setError(error);
                setCurrentStep("idle");
                options?.onError?.(error, "start");
                reject(error);
              },
            }
          );
        });

        // Step 2: Join huddle with room
        setCurrentStep("joining");
        const joinResult = await new Promise<{
          huddleId: Id<"huddles">;
          roomId: string;
          token: string;
          url: string;
        }>((resolve, reject) => {
          joinHuddle(
            {
              huddleId,
              workspaceId: props.workspaceId,
              memberId: props.memberId,
              participantName: props.participantName,
            },
            {
              onSuccess: (data) => {
                logger.debug("Huddle joined successfully", {
                  huddleId: data.huddleId,
                });
                const response = data as UseJoinHuddleSuccess;
                resolve({
                  huddleId: response.huddleId,
                  roomId: response.roomId || props.roomId || "",
                  token: response.token,
                  url: response.url,
                });
              },
              onError: (error) => {
                logger.error("Failed to join huddle", error as Error);
                setError(error);
                setCurrentStep("idle");
                options?.onError?.(error, "join");
                reject(error);
              },
            }
          );
        });

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
    [startHuddleWithoutRoom, joinHuddle]
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
