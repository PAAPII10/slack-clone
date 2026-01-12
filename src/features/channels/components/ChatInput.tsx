import Quill from "quill";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { EditorValue } from "@/components/Editor";
import { useCreateMessage } from "@/features/messages/api/use-create-message";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useChannelId } from "@/hooks/use-channel-id";
import { toast } from "sonner";
import { useGenerateUploadUrl } from "@/features/upload/api/use-generate-upload-url";
import { Id } from "../../../../convex/_generated/dataModel";
import { useTyping } from "@/features/typing/api/use-typing";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

interface ChatInputProps {
  placeholder?: string;
}

type CreateMessageValue = {
  channelId: Id<"channels">;
  workspaceId: Id<"workspaces">;
  body: string;
  attachments?: Id<"_storage">[];
};
export function ChatInput({ placeholder }: ChatInputProps) {
  const [editorKey, setEditorKey] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();
  const { mutate: createMessage } = useCreateMessage();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();
  const { emitTypingStart, emitTypingStop } = useTyping({
    channelId,
    enabled: !!channelId,
  });

  const editorRef = useRef<Quill | null>(null);

  const onSubmit = async ({ attachments, body }: EditorValue) => {
    try {
      setIsPending(true);
      editorRef.current?.enable(false);

      const values: CreateMessageValue = {
        body,
        workspaceId,
        channelId,
        attachments: undefined,
      };

      if (attachments && attachments.length > 0) {
        // Upload all files
        const storageIds: Id<"_storage">[] = [];
        for (const attachment of attachments) {
          const uploadUrl = await generateUploadUrl({ throwError: true });

          if (!uploadUrl) {
            throw new Error("Url not found");
          }

          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Content-Type": attachment.type,
            },
            body: attachment,
          });

          if (!result.ok) {
            throw new Error("Failed to upload file");
          }

          const { storageId } = await result.json();
          storageIds.push(storageId);
        }

        values.attachments = storageIds;
      }

      await createMessage(values, {
        throwError: true,
      });

      // Stop typing when message is sent
      emitTypingStop();

      setEditorKey((prev) => prev + 1);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setIsPending(false);
      editorRef.current?.enable(true);
    }
  };

  return (
    <div className="w-full px-5">
      <Editor
        key={editorKey}
        channelId={channelId}
        placeholder={placeholder}
        disabled={isPending}
        innerRef={editorRef}
        onSubmit={onSubmit}
        onTypingStart={emitTypingStart}
        onTypingStop={emitTypingStop}
      />
    </div>
  );
}
