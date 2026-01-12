import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseGetMessageProps {
  id: Id<"messages">;
}

export function useGetMessage({ id }: UseGetMessageProps) {
  const data = useQuery(api.messages.messageById, { id });
  const isLoading = data === undefined;
  return { data, isLoading };
}
