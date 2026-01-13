import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { HuddleSource } from "../store/use-huddle-state";

interface UseActiveHuddleProps {
  workspaceId?: Id<"workspaces">;
  sourceType: HuddleSource;
  sourceId: Id<"channels"> | Id<"conversations"> | Id<"members">;
}

export function useActiveHuddle({ workspaceId, sourceType, sourceId }: UseActiveHuddleProps) {
  const data = useQuery(
    api.huddles.getActiveHuddleBySource,
    sourceId
      ? {
          workspaceId,
          sourceType,
          sourceId,
        }
      : "skip"
  );
  const isLoading = data === undefined;
  return { data, isLoading };
}
