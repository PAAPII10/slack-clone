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

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

interface ChatInputProps {
  placeholder?: string;
}

type CreateMessageValue = {
  channelId: Id<"channels">;
  workspaceId: Id<"workspaces">;
  body: string;
  image?: Id<"_storage">;
};
export function ChatInput({ placeholder }: ChatInputProps) {
  const [editorKey, setEditorKey] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();
  const { mutate: createMessage } = useCreateMessage();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();

  const editorRef = useRef<Quill | null>(null);

  const onSubmit = async ({ image, body }: EditorValue) => {
    try {
      setIsPending(true);
      editorRef.current?.enable(false);

      const values: CreateMessageValue = {
        body,
        workspaceId,
        channelId,
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

      setEditorKey((prev) => prev + 1);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setIsPending(false);
      editorRef.current?.enable(true);
    }
  };

  return (
    <div className="px-5 w-full">
      <Editor
        key={editorKey}
        placeholder={placeholder}
        disabled={isPending}
        innerRef={editorRef}
        onSubmit={onSubmit}
      />
    </div>
  );
}
