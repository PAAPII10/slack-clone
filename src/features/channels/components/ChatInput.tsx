import Quill from "quill";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Delta, Op } from "quill/core";
import { debounce } from "lodash";
import { useDraftMessage } from "@/features/messages/hooks/use-draft-messages";

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

  const { draft, save, clear, getFiles } = useDraftMessage(channelId);

  const editorRef = useRef<Quill | null>(null);

  // Convert draft attachments to File[] for defaultFiles prop
  const defaultFiles = useMemo(() => {
    const files = getFiles();
    return files.length > 0 ? files : undefined;
  }, [getFiles]);

  const defaultValue = useMemo(() => {
    try {
      if (draft?.body) {
        return JSON.parse(draft.body) as Delta | Op[];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [draft]);

  // We use useMemo (not useCallback) because:
  // - useCallback is for memoizing a function you define
  // - useMemo is for memoizing the result of a computation/function call
  // - debounce() is a function call that returns a debounced function
  // - We need to memoize the result (the debounced function), not wrap a function definition
  const onChange = useMemo(
    () =>
      debounce(
        async ({
          delta,
          files,
          mentions,
        }: {
          delta: Delta | Op[];
          files: File[];
          mentions: string[];
        }) => {
          await save(delta, mentions, files);
        },
        500
      ),
    [save]
  );

  // Cleanup: cancel pending debounced calls on unmount
  useEffect(() => {
    return () => {
      onChange.cancel();
    };
  }, [onChange]);

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
          const storageId = await uploadFile(attachment, async () => {
            const url = await generateUploadUrl({ throwError: true });
            return url ?? null;
          });
          storageIds.push(storageId as Id<"_storage">);
        }

        values.attachments = storageIds;
      }

      await createMessage(values, {
        throwError: true,
      });

      // Stop typing when message is sent
      emitTypingStop();

      // Clear draft after successful send
      clear();

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
        defaultValue={defaultValue}
        defaultFiles={defaultFiles}
        placeholder={placeholder}
        disabled={isPending}
        innerRef={editorRef}
        onSubmit={onSubmit}
        onChange={onChange}
        onTypingStart={emitTypingStart}
        onTypingStop={emitTypingStop}
      />
    </div>
  );
}
