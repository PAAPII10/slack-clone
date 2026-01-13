import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/Hint";
import { EmojiPopover } from "@/components/emoji-popover";
import { MdOutlineAddReaction } from "react-icons/md";

interface ReactionsProps {
  data: Array<
    Omit<Doc<"reactions">, "memberId"> & {
      count: number;
      memberIds: Id<"members">[];
      memberNames?: string[];
    }
  >;
  onChange: (value: string) => void;
}

function processMemberNames(
  memberNames: string[],
  memberIds: Id<"members">[],
  currentMemberId: Id<"members">
): string[] {
  const names = [...memberNames];
  const hasCurrentUser = memberIds.includes(currentMemberId);

  if (!hasCurrentUser) {
    return names;
  }

  const currentUserIndex = memberIds.findIndex((id) => id === currentMemberId);

  if (currentUserIndex < 0) {
    return names;
  }

  let displayNames: string[];

  if (names.length === memberIds.length) {
    // Arrays are aligned, replace at the same index
    displayNames = [...names];
    displayNames[currentUserIndex] = "You";
  } else if (names.length > 0) {
    // Arrays might not be aligned (some names filtered out)
    // Prepend "You" since we can't reliably match which name is the current user's
    displayNames = ["You", ...names];
  } else {
    // No names available, but user reacted
    displayNames = ["You"];
  }

  // Move "You" to the front for better UX (in case it was inserted elsewhere)
  const youIndex = displayNames.indexOf("You");
  if (youIndex > 0) {
    displayNames = ["You", ...displayNames.filter((name) => name !== "You")];
  }

  return displayNames;
}

function formatReactionLabel(
  names: string[],
  count: number,
  emoji: string
): string {
  if (names.length === 0) {
    return `${count} ${count === 1 ? "person" : "people"} reacted with ${emoji}`;
  }

  if (names.length === 1) {
    if (count === 1) {
      return `${names[0]} reacted with ${emoji}`;
    }
    return `${names[0]} and ${count - 1} other${
      count - 1 === 1 ? "" : "s"
    } reacted with ${emoji}`;
  }

  if (names.length === 2) {
    if (count === 2) {
      return `${names[0]} and ${names[1]} reacted with ${emoji}`;
    }
    return `${names[0]}, ${names[1]}, and ${count - 2} other${
      count - 2 === 1 ? "" : "s"
    } reacted with ${emoji}`;
  }

  if (names.length === count) {
    // Show all names when we have all of them
    return `${names.slice(0, -1).join(", ")}, and ${
      names[names.length - 1]
    } reacted with ${emoji}`;
  }

  // Show up to 3 names, then "and X more"
  const namesToShow = Math.min(3, names.length);
  const remaining = count - namesToShow;
  return `${names.slice(0, namesToShow).join(", ")}, and ${remaining} more reacted with ${emoji}`;
}

export function Reactions({ data, onChange }: ReactionsProps) {
  const workspaceId = useWorkspaceId();

  const { data: currentMember } = useCurrentMember({ workspaceId });

  const currentMemberId = currentMember?._id;

  if (data.length === 0 || !currentMemberId) return null;

  // Process reactions data before rendering
  const processedReactions = data.map((reaction) => {
    const memberNames = reaction.memberNames || [];
    const displayNames = processMemberNames(
      memberNames,
      reaction.memberIds,
      currentMemberId
    );
    const label = formatReactionLabel(
      displayNames,
      reaction.count,
      reaction.value
    );

    return {
      ...reaction,
      label,
      hasCurrentUser: reaction.memberIds.includes(currentMemberId),
    };
  });

  return (
    <div className="flex items-center gap-1 mt-1 mb-1">
      {processedReactions.map((reaction) => (
        <Hint key={reaction._id} label={reaction.label}>
          <button
            onClick={() => onChange(reaction.value)}
            className={cn(
              "h-6 px-2 rounded-full bg-slate-200/70 border border-transparent hover:border-slate-500 text-slate-800 flex items-center gap-x-1",
              reaction.hasCurrentUser &&
                "bg-blue-100/70 border-blue-500 text-white"
            )}
          >
            {reaction.value}
            <span
              className={cn(
                "text-xs font-semibold text-muted-foreground",
                reaction.hasCurrentUser && "text-blue-500"
              )}
            >
              {reaction.count}
            </span>
          </button>
        </Hint>
      ))}
      <EmojiPopover
        hint="Add reaction"
        onEmojiSelect={(emoji) => onChange(emoji)}
      >
        <button className="h-7 px-3 rounded-full bg-slate-200/70 border border-transparent hover:border-slate-500 text-slate-800 flex items-center gap-x-1">
          <MdOutlineAddReaction className="size-4" />
        </button>
      </EmojiPopover>
    </div>
  );
}
