import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc } from "../../../../convex/_generated/dataModel";

export function useGetUserProfile() {
  const data = useQuery(api.userProfiles.getCurrent) as Doc<"userProfiles"> | null | undefined;
  const isLoading = data === undefined;
  return { data, isLoading };
}
