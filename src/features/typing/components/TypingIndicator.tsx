import { useTypingIndicator } from "../api/use-typing";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  channelId?: Id<"channels">;
  conversationId?: Id<"conversations">;
}

/**
 * Component to display typing indicators
 * Formats the indicator text based on the number of typing users
 */
export function TypingIndicator({
  channelId,
  conversationId,
}: TypingIndicatorProps) {
  const typingUsers = useTypingIndicator({
    channelId,
    conversationId,
  });

  const renderTypingText = () => {
    if (typingUsers.length === 1) {
      return (
        <p>
          <strong>{typingUsers[0].name}</strong> is typing…
        </p>
      );
    } else if (typingUsers.length === 2) {
      return (
        <p>
          <strong>{typingUsers[0].name}</strong> and{" "}
          <strong>{typingUsers[1].name}</strong> are typing…
        </p>
      );
    } else {
      return (
        <p>
          <strong>Several people</strong> are typing…
        </p>
      );
    }
  };

  return (
    <div
      className={cn(
        "text-[10px] text-muted-foreground opacity-0 transition italic",
        typingUsers.length > 0 && "opacity-100"
      )}
    >
      {typingUsers.length > 0 && renderTypingText()}
    </div>
  );
}
