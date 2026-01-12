import { MessageSquareTextIcon, Pencil, Smile, Trash } from "lucide-react";
import { Button } from "./ui/button";
import { Hint } from "./Hint";
import { EmojiPopover } from "./emoji-popover";

interface ToolbarProps {
  isAuthor: boolean;
  isPending: boolean;
  handleEdit: () => void;
  handleThread: () => void;
  handleDelete: () => void;
  handleReaction: (value: string) => void;
  hideThreadButton?: boolean;
}

// Default emoji reactions like Slack
const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥"];

export function Toolbar({
  isAuthor,
  isPending,
  handleEdit,
  handleThread,
  handleDelete,
  handleReaction,
  hideThreadButton,
}: ToolbarProps) {
  return (
    <div className="absolute top-0 right-5">
      <div className="group-hover:opacity-100 opacity-0 transition-opacity border bg-white rounded-md shadow-sm flex items-center">
        {/* Default emoji quick reactions */}
        {DEFAULT_EMOJIS.map((emoji) => (
          <Hint key={emoji} label={`React with ${emoji}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() => handleReaction(emoji)}
              className="h-7 w-7 p-0 hover:bg-slate-100"
            >
              <span className="text-base leading-none">{emoji}</span>
            </Button>
          </Hint>
        ))}
        {/* Emoji picker for more options */}
        <EmojiPopover
          hint="Add reaction"
          onEmojiSelect={(emoji) => handleReaction(emoji)}
        >
          <Button variant="ghost" size="icon-sm" disabled={isPending}>
            <Smile className="size-4" />
          </Button>
        </EmojiPopover>
        {/* Visual separator */}
        <div className="h-4 w-px bg-slate-200 mx-0.5" />
        {!hideThreadButton && (
          <Hint label="Reply in thread">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={handleThread}
            >
              <MessageSquareTextIcon className="size-4" />
            </Button>
          </Hint>
        )}
        {isAuthor && (
          <Hint label="Edit message">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={handleEdit}
            >
              <Pencil className="size-4" />
            </Button>
          </Hint>
        )}
        {isAuthor && (
          <Hint label="Delete message">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={handleDelete}
            >
              <Trash className="size-4" />
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
}
