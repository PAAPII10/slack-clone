import dynamic from "next/dynamic";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { format, isToday, isYesterday } from "date-fns";
import { Hint } from "@/components/Hint";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Thumbnail } from "./Thumbnail";
import { Toolbar } from "@/components/Toolbar";
import { useUpdateMessage } from "../api/use-update-message";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRemoveMessage } from "../api/use-remove-message";
import { useConfirm } from "@/hooks/use-confirm";
import { useToggleReaction } from "@/features/reactions/api/use-toggle-reaction";
import { Reactions } from "@/features/reactions/components/Reactions";
import { usePanel } from "@/hooks/use-panel";
import { ThreadBar } from "./ThreadBar";

const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
});
const Renderer = dynamic(() => import("@/components/Renderer"), {
  ssr: false,
});

interface MessageProps {
  id: Id<"messages">;
  memberId: Id<"members">;
  authorImage?: string;
  authorName?: string;
  isAuthor: boolean;
  reactions: Array<
    Omit<Doc<"reactions">, "memberId"> & {
      count: number;
      memberIds: Id<"members">[];
      memberNames?: string[];
    }
  >;
  body: Doc<"messages">["body"];
  attachments?: Array<{ url: string; size: number | null }>;
  image?: string | null | undefined; // Keep for backward compatibility
  updatedAt: Doc<"messages">["updatedAt"];
  createdAt: Doc<"messages">["_creationTime"];
  isEditing: boolean;
  isCompact?: boolean;
  setEditingId: (id: Id<"messages"> | null) => void;
  hideThreadButton?: boolean;
  threadName?: string;
  threadCount?: number;
  threadImage?: string;
  threadTimestamp?: number;
}

export function Message({
  id,
  memberId,
  authorImage,
  authorName = "Member",
  isAuthor,
  reactions,
  body,
  attachments,
  image,
  updatedAt,
  createdAt,
  isEditing,
  isCompact,
  setEditingId,
  hideThreadButton,
  threadName,
  threadCount,
  threadImage,
  threadTimestamp,
}: MessageProps) {
  const { parentMessageId, onOpenMessage, onCloseMessage, onOpenProfile } =
    usePanel();
  const [ConfirmDialog, confirm] = useConfirm({
    title: "Delete message",
    message:
      "Are you sure you want to delete this message? This action cannot be undone.",
  });

  const { mutate: updateMessage, isPending: isUpdatingMessage } =
    useUpdateMessage();
  const { mutate: removeMessage, isPending: isRemovingMessage } =
    useRemoveMessage();
  const { mutate: toggleReaction, isPending: isTogglingReaction } =
    useToggleReaction();

  const isPending = isUpdatingMessage || isTogglingReaction;

  const handleReaction = (value: string) => {
    toggleReaction(
      { messageId: id, value },
      {
        onError: () => {
          toast.error("Failed to toggle reaction");
        },
      }
    );
  };

  const handleUpdate = ({ body }: { body: string }) => {
    updateMessage(
      { id, body },
      {
        onSuccess: () => {
          toast.success("Message updated");
          setEditingId(null);
        },
        onError: () => {
          toast.error("Failed to update message");
        },
      }
    );
  };

  const handleRemove = async () => {
    const ok = await confirm();

    if (!ok) return;

    removeMessage(
      { id },
      {
        onSuccess: () => {
          toast.success("Message deleted");

          if (parentMessageId === id) {
            onCloseMessage();
          }
        },
        onError: () => {
          toast.error("Failed to delete message");
        },
      }
    );
  };
  if (isCompact) {
    return (
      <>
        <ConfirmDialog />
        <div
          className={cn(
            "flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60 group relative",
            isEditing && "bg-[#f2c74433] hover:bg-[#f2c74433]",
            isRemovingMessage &&
              "bg-rose-500/50 transform transition-all scale-y-0 origin-bottom duration-200"
          )}
        >
          <div className="flex items-center gap-1">
            <Hint label={formatFullTime(new Date(createdAt))}>
              <button className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 w-[38px] leading-[22px] text-center hover:underline">
                {format(new Date(createdAt), "HH:mm")}
              </button>
            </Hint>
            {isEditing ? (
              <div className="w-full h-full">
                <Editor
                  variant="update"
                  disabled={isPending}
                  defaultValue={JSON.parse(body)}
                  onCancel={() => setEditingId(null)}
                  onSubmit={handleUpdate}
                />
              </div>
            ) : (
              <div className="flex flex-col w-full">
                <Renderer value={body} />
                {attachments && attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2 my-2">
                    {attachments.map((attachment, index) => (
                      <Thumbnail
                        key={index}
                        url={attachment.url}
                        size={attachment.size ?? undefined}
                      />
                    ))}
                  </div>
                ) : image ? (
                  <Thumbnail url={image} />
                ) : null}
                {updatedAt ? (
                  <span className="text-xs text-muted-foreground">
                    (edited)
                  </span>
                ) : null}
                <Reactions data={reactions} onChange={handleReaction} />
                <ThreadBar
                  count={threadCount}
                  image={threadImage}
                  timestamp={threadTimestamp}
                  onClick={() => onOpenMessage(id)}
                />
              </div>
            )}
          </div>
          {!isEditing && (
            <Toolbar
              isAuthor={isAuthor}
              isPending={isPending}
              handleEdit={() => setEditingId(id)}
              handleThread={() => onOpenMessage(id)}
              handleDelete={handleRemove}
              handleReaction={handleReaction}
              hideThreadButton={hideThreadButton}
            />
          )}
        </div>
      </>
    );
  }

  const avatarFallback = authorName.charAt(0).toUpperCase();
  return (
    <>
      <ConfirmDialog />
      <div
        className={cn(
          "flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60 group relative",
          isEditing && "bg-[#f2c74433] hover:bg-[#f2c74433]",
          isRemovingMessage &&
            "bg-rose-500/50 transform transition-all scale-y-0 origin-bottom duration-200"
        )}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={() => onOpenProfile(memberId)}
            className="cursor-pointer"
          >
            <Avatar>
              <AvatarImage src={authorImage} />
              <AvatarFallback>{avatarFallback}</AvatarFallback>
            </Avatar>
          </button>
          {isEditing ? (
            <div className="w-full h-full">
              <Editor
                variant="update"
                disabled={isPending}
                defaultValue={JSON.parse(body)}
                onCancel={() => setEditingId(null)}
                onSubmit={handleUpdate}
              />
            </div>
          ) : (
            <div className="flex flex-col w-full overflow-hidden">
              <div className="text-sm">
                <button
                  className="font-bold text-primary hover:underline cursor-pointer"
                  onClick={() => onOpenProfile(memberId)}
                >
                  {authorName}
                </button>
                <span>&nbsp;</span>
                <Hint label={formatFullTime(new Date(createdAt))}>
                  <button className="text-xs text-muted-foreground hover:underline">
                    {format(new Date(createdAt), "h:mm a")}
                  </button>
                </Hint>
              </div>
              <Renderer value={body} />
              {attachments && attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2 my-2">
                  {attachments.map((attachment, index) => (
                    <Thumbnail
                      key={index}
                      url={
                        typeof attachment === "string"
                          ? attachment
                          : attachment.url
                      }
                      size={
                        typeof attachment === "string"
                          ? undefined
                          : attachment.size ?? undefined
                      }
                    />
                  ))}
                </div>
              ) : image ? (
                <Thumbnail url={image} />
              ) : null}
              {updatedAt ? (
                <span className="text-xs text-muted-foreground">(edited)</span>
              ) : null}
              <Reactions data={reactions} onChange={handleReaction} />
              <ThreadBar
                name={threadName}
                count={threadCount}
                image={threadImage}
                timestamp={threadTimestamp}
                onClick={() => onOpenMessage(id)}
              />
            </div>
          )}
        </div>
        {!isEditing && (
          <Toolbar
            isAuthor={isAuthor}
            isPending={isPending}
            handleEdit={() => setEditingId(id)}
            handleThread={() => onOpenMessage(id)}
            handleDelete={handleRemove}
            handleReaction={handleReaction}
            hideThreadButton={hideThreadButton}
          />
        )}
      </div>
    </>
  );
}

function formatFullTime(date: Date) {
  const atTime = format(date, "HH:mm:ss a");
  if (isToday(date)) return `Today at ${atTime}`;
  if (isYesterday(date)) return `Yesterday at ${atTime}`;
  return `${format(date, "MMMM d, yyyy")} at ${atTime}`;
}
