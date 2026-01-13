import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

type RequestType = { huddleId: Id<"huddles"> };
type ResponseType = Id<"huddles"> | null;

export function useDeclineHuddle() {
  const mutation = useMutation(api.huddles.declineHuddle);
  const mutate = async (
    values: RequestType,
    options?: {
      onSuccess?: (data: ResponseType) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    try {
      const data = await mutation(values);
      options?.onSuccess?.(data ?? null);
      return data;
    } catch (error) {
      options?.onError?.(error as Error);
      throw error;
    }
  };
  return { mutate };
}
