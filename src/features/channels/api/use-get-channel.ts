import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { isValidConvexId } from "@/lib/utils";

interface UseGetChannelProps {
  id: Id<"channels">;
}

export function useGetChannel({ id }: UseGetChannelProps) {
  const shouldFetch = isValidConvexId(id);
  const data = useQuery(api.channels.getById, shouldFetch ? { id } : "skip");
  const isLoading = data === undefined;
  return { data, isLoading };
}
