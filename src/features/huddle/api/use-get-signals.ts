import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetSignalsProps {
  huddleId: Id<"huddles"> | null;
}

export function useGetSignals({ huddleId }: UseGetSignalsProps) {
  const data = useQuery(
    api.huddles.getSignals,
    huddleId ? { huddleId } : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
