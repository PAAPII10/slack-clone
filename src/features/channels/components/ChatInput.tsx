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
import { uploadFile } from "@/lib/upload-utils";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

interface ChatInputProps {
  placeholder?: string;
}

type CreateMessageValue = {
  channelId: Id<"channels">;
  workspaceId: Id<"workspaces">;
  body: string;
  attachments?: Id<"_storage">[];
  mentions?: Id<"members">[]; // Phase 5: Array of mentioned member IDs
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

  const onSubmit = async ({ attachments, body, mentions }: EditorValue) => {
    try {
      setIsPending(true);
      editorRef.current?.enable(false);

      const values: CreateMessageValue = {
        body,
        workspaceId,
        channelId,
        attachments: undefined,
        mentions: mentions as Id<"members">[], // Phase 5: Pass mentions from editor
      };

      if (attachments && attachments.length > 0) {
        // Upload all files (HEIC files will be converted to JPEG)
        const storageIds: Id<"_storage">[] = [];
        for (const attachment of attachments) {
          const storageId = await uploadFile(
            attachment,
            async () => await generateUploadUrl({ throwError: true })
          );
          storageIds.push(storageId as Id<"_storage">);
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
