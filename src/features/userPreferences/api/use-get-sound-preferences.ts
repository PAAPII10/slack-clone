import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetSoundPreferencesProps {
  workspaceId: Id<"workspaces">;
}

export function useGetSoundPreferences({
  workspaceId,
}: UseGetSoundPreferencesProps) {
  const data = useQuery(api.userPreferences.get, { workspaceId });
  const isLoading = data === undefined;

  return {
    data,
    isLoading,
  };
}
