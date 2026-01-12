import Quill from "quill";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { EditorValue } from "@/components/Editor";
import { useCreateMessage } from "@/features/messages/api/use-create-message";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

import { toast } from "sonner";
import { useGenerateUploadUrl } from "@/features/upload/api/use-generate-upload-url";
import { Id } from "../../../../convex/_generated/dataModel";
import { useTyping } from "@/features/typing/api/use-typing";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

interface ChatInputProps {
  placeholder?: string;
  conversationId: Id<"conversations">;
}

type CreateMessageValue = {
  conversationId: Id<"conversations">;
  workspaceId: Id<"workspaces">;
  body: string;
  image?: Id<"_storage">;
};

export function ChatInput({ placeholder, conversationId }: ChatInputProps) {
  const [editorKey, setEditorKey] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const workspaceId = useWorkspaceId();

  const { mutate: createMessage } = useCreateMessage();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();
  const { emitTypingStart, emitTypingStop } = useTyping({
    conversationId,
    enabled: !!conversationId,
  });

  const editorRef = useRef<Quill | null>(null);

  const onSubmit = async ({ image, body }: EditorValue) => {
    try {
      setIsPending(true);
      editorRef.current?.enable(false);

      const values: CreateMessageValue = {
        body,
        workspaceId,
        conversationId,
        image: undefined,
      };

      if (image) {
        const uploadUrl = await generateUploadUrl({ throwError: true });

        if (!uploadUrl) {
          throw new Error("Url not found");
        }

        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": image.type,
          },
          body: image,
        });

        if (!result.ok) {
          throw new Error("Failed to upload image");
        }

        const { storageId } = await result.json();

        values.image = storageId;
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
        conversationId={conversationId}
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
