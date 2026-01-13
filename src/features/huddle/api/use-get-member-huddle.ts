import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetMemberHuddleProps {
  memberId: Id<"members">;
}

export function useGetMemberHuddle({ memberId }: UseGetMemberHuddleProps) {
  const shouldFetch = isValidConvexId(memberId);
  const data = useQuery(
    api.huddles.getHuddleByMemberId,
    shouldFetch ? { memberId } : "skip"
  );
  const isLoading = data === undefined;
  const isInHuddle = data !== null && data !== undefined;
  return { data, isLoading, isInHuddle };
}
