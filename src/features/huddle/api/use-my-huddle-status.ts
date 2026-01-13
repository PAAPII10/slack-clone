import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseMyHuddleStatusProps {
  workspaceId: Id<"workspaces">;
}

export function useMyHuddleStatus({ workspaceId }: UseMyHuddleStatusProps) {
  const data = useQuery(api.huddles.getMyActiveHuddle, { workspaceId });
  const isLoading = data === undefined;
  return { data, isLoading };
}
