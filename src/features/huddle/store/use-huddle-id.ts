import { useQueryState } from "nuqs";

export function useHuddleId() {
  return useQueryState("huddleId");
}
