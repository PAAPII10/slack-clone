import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetMemberProps {
  id: Id<"members">;
}

export function useGetMember({ id }: UseGetMemberProps) {
  const shouldFetch = isValidConvexId(id);
  const data = useQuery(api.members.getById, shouldFetch ? { id } : "skip");
  const isLoading = data === undefined;
  return { data, isLoading };
}
