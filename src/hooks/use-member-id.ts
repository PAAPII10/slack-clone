import { useParams } from "next/navigation";
import { Id } from "../../convex/_generated/dataModel";

export function useMemberId() {
  const params = useParams();
  return params.memberId as Id<"members">;
}
