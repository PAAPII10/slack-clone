import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCallback, useMemo } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

type RequestType = {
  huddleId: Id<"huddles">;
  isMuted: boolean;
};
type ResponseType = Id<"huddles"> | null;

export function useUpdateMuteStatus() {
  const mutation = useMutation(api.huddles.updateMuteStatus);

  const mutate = useCallback(
    async (values: RequestType): Promise<ResponseType> => {
      return await mutation(values);
    },
    [mutation]
  );

  return useMemo(
    () => ({
      mutate,
    }),
    [mutate]
  );
}
