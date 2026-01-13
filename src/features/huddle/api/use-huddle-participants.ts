import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseHuddleParticipantsProps {
  huddleId?: Id<"huddles"> | null;
}

export function useHuddleParticipants({
  huddleId,
}: UseHuddleParticipantsProps) {
  const shouldFetch = isValidConvexId(huddleId);
  const data = useQuery(
    api.huddles.getHuddleParticipants,
    shouldFetch ? { huddleId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
