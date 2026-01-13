import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseHuddleParticipantsProps {
  huddleId: Id<"huddles"> | null;
}

export function useHuddleParticipants({
  huddleId,
}: UseHuddleParticipantsProps) {
  const data = useQuery(
    api.huddles.getHuddleParticipants,
    huddleId ? { huddleId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
