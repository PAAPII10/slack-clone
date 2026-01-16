"use client";

import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Delta, Op } from "quill/core";
import Quill, { QuillOptions } from "quill";
import { Mention, MentionBlot } from "quill-mention";
import "quill-mention/dist/quill.mention.css";
import { useDropzone, type FileRejection } from "react-dropzone";

import { PiTextAa } from "react-icons/pi";
import { MdSend } from "react-icons/md";

import { Button } from "./ui/button";
import "quill/dist/quill.snow.css";
import { Paperclip, Smile, VideoIcon, XIcon } from "lucide-react";
import { Hint } from "./Hint";
import { cn, trimEmptyLinesFromOps } from "@/lib/utils";
import { EmojiPopover } from "./emoji-popover";
import { Id } from "../../convex/_generated/dataModel";
import { HeicImagePreview } from "./HeicImagePreview";
import { TypingIndicator } from "@/features/typing/components/TypingIndicator";
import { useGetMemberBySource } from "@/features/members/api/use-get-member-by-source";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import {
  getFileType,
  getSpecificFileType,
  formatFileSize,
} from "@/lib/file-utils";
import { useChannelId } from "@/hooks/use-channel-id";

// Register both the Mention module and MentionBlot
Quill.register("modules/mention", Mention);
Quill.register(MentionBlot);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export type EditorValue = {
  attachments: File[];
  body: string;
  mentions?: string[];
};

interface EditorProps {
  variant?: "create" | "update";
  placeholder?: string;
  defaultValue?: Delta | Op[];
  disabled?: boolean;
  innerRef?: RefObject<Quill | null>;
  onCancel?: () => void;
  onSubmit: ({ attachments, body, mentions }: EditorValue) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  conversationId?: Id<"conversations">;
}

type MentionItem = {
  id: string;
  value: string;
  image?: string; // Optional image URL for avatar
};

export default function Editor({
  variant = "create",
  placeholder = "Write a something...",
  defaultValue = [],
  disabled = false,
  innerRef,
  onCancel,
  onSubmit,
  onTypingStart,
  onTypingStop,
  conversationId,
}: EditorProps) {
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();

  const { data: members } = useGetMemberBySource({
    conversationId,
    channelId,
    workspaceId,
  });

  // Convert members to MentionItem format
  const mentionUsers: MentionItem[] = useMemo(() => {
    if (!members || members.length === 0) return [];

    return members.map((member) => {
      const user = member.user;
      const displayName =
        user?.displayName || user?.fullName || user?.name || "Unknown";

      return {
        id: member._id, // Use member ID
        value: displayName,
        image: user?.image || undefined,
      };
    });
  }, [members]);

  // Store mentionUsers in a ref so the source function always has the latest data
  const mentionUsersRef = useRef<MentionItem[]>(mentionUsers);

  useEffect(() => {
    mentionUsersRef.current = mentionUsers;
  }, [mentionUsers]);

  const [files, setFiles] = useState<File[]>([]);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [hasEditorContent, setHasEditorContent] = useState(false);
  const savedSelectionRef = useRef<number | null>(null);

  const submitRef = useRef(onSubmit);
  const placeholderRef = useRef(placeholder);
  const quillRef = useRef<Quill | null>(null);
  const defaultValueRef = useRef(defaultValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const disabledRef = useRef(disabled);
  const filesRef = useRef<File[]>([]);
  const onTypingStartRef = useRef(onTypingStart);
  const onTypingStopRef = useRef(onTypingStop);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled) {
        // Validate all files
        const validFiles: File[] = [];
        for (const file of acceptedFiles) {
          if (file.size > MAX_FILE_SIZE) {
            toast.error(
              `File "${
                file.name
              }" exceeds 10MB limit. Your file is ${formatFileSize(file.size)}.`
            );
            continue;
          }
          validFiles.push(file);
        }

        if (validFiles.length > 0) {
          setFiles((prev) => [...prev, ...validFiles]);
          // Focus the editor after files are selected
          setTimeout(() => {
            quillRef.current?.focus();
          }, 100);
        }
      }
    },
    [disabled]
  );

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      const hasSizeError = rejection.errors.some(
        (error) => error.code === "file-too-large"
      );
      const hasTypeError = rejection.errors.some(
        (error) => error.code === "file-invalid-type"
      );

      if (hasSizeError) {
        toast.error(
          `File "${rejection.file.name}" exceeds 10MB limit. Please choose a smaller file.`
        );
      } else if (hasTypeError) {
        toast.error(
          `File type not supported for "${rejection.file.name}". Please choose a different file.`
        );
      } else {
        toast.error("Failed to upload file. Please try again.");
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "image/*": [
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".svg",
        ".heic",
        ".heif",
      ],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
      "video/*": [".mp4", ".webm", ".ogg", ".mov", ".avi"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        [".pptx"],
      "text/*": [".txt", ".csv"],
      "text/markdown": [".md", ".markdown"],
      "application/json": [".json"],
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
      "application/x-rar-compressed": [".rar"],
      "application/x-7z-compressed": [".7z"],
    },
    maxFiles: 10,
    maxSize: MAX_FILE_SIZE,
    disabled,
    noClick: true,
    noKeyboard: true,
  });

  useLayoutEffect(() => {
    submitRef.current = onSubmit;
    placeholderRef.current = placeholder;
    defaultValueRef.current = defaultValue;
    disabledRef.current = disabled;
    filesRef.current = files;
    onTypingStartRef.current = onTypingStart;
    onTypingStopRef.current = onTypingStop;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const editorContainer = container.appendChild(
      container.ownerDocument.createElement("div")
    );

    // Only include mention module if we have channelId or conversationId
    const hasMentionSource = !!(channelId || conversationId);

    const options: QuillOptions = {
      theme: "snow",
      placeholder: placeholderRef.current,
      modules: {
        toolbar: [
          ["bold", "italic", "strike"],
          ["link"],
          [{ list: "ordered" }, { list: "bullet" }],
        ],
        ...(hasMentionSource && {
          mention: {
            allowedChars: /^[A-Za-z\s]*$/,
            mentionDenotationChars: ["@"],
            positioningStrategy: "fixed", // Use fixed positioning to avoid clipping
            defaultMenuOrientation: "bottom", // Show below by default
            source: function (
              searchTerm: string,
              renderList: (data: MentionItem[], searchTerm: string) => void
            ) {
              // Use current mentionUsers from ref (always up-to-date)
              const currentMentionUsers = mentionUsersRef.current;
              const filtered = currentMentionUsers.filter((user: MentionItem) =>
                user.value.toLowerCase().includes(searchTerm.toLowerCase())
              );
              renderList(filtered, searchTerm);
            },
            renderItem: (item: MentionItem) => {
              // Create a div element with avatar and name - compact design
              const container = document.createElement("div");
              container.className = "mention-item-container";
              container.style.display = "flex";
              container.style.alignItems = "center";
              container.style.gap = "8px";
              container.style.padding = "4px 8px";
              container.style.minHeight = "28px";

              // Helper function to get initials from name
              const getInitials = (name: string): string => {
                if (!name || name.trim().length === 0) return "?";
                const parts = name.trim().split(/\s+/);
                if (parts.length === 1) {
                  return parts[0].charAt(0).toUpperCase();
                }
                // Get first letter of first name and first letter of last name
                return parts[0].charAt(0).charAt(0).toUpperCase();
              };

              // Avatar - always show fallback if image is missing or fails to load
              const avatarWrapper = document.createElement("div");
              avatarWrapper.style.position = "relative";
              avatarWrapper.style.width = "24px";
              avatarWrapper.style.height = "24px";
              avatarWrapper.style.flexShrink = "0";

              if (item.image) {
                const avatar = document.createElement("img");
                avatar.src = item.image;
                avatar.alt = item.value;
                avatar.className = "mention-avatar";
                avatar.style.width = "24px";
                avatar.style.height = "24px";
                avatar.style.borderRadius = "50%";
                avatar.style.objectFit = "cover";
                avatar.style.display = "block";

                // Show fallback if image fails to load
                avatar.onerror = () => {
                  avatar.style.display = "none";
                  const fallback = avatarWrapper.querySelector(
                    ".mention-avatar-fallback"
                  ) as HTMLElement;
                  if (fallback) {
                    fallback.style.display = "flex";
                  }
                };

                avatarWrapper.appendChild(avatar);
              }

              // Fallback: show initials in a circle (always create, show if no image or image fails)
              const avatarFallback = document.createElement("div");
              avatarFallback.className = "mention-avatar-fallback";
              avatarFallback.style.width = "24px";
              avatarFallback.style.height = "24px";
              avatarFallback.style.borderRadius = "50%";
              avatarFallback.style.backgroundColor = "#1264a3";
              avatarFallback.style.color = "white";
              avatarFallback.style.display = item.image ? "none" : "flex";
              avatarFallback.style.alignItems = "center";
              avatarFallback.style.justifyContent = "center";
              avatarFallback.style.fontSize = "10px";
              avatarFallback.style.fontWeight = "600";
              avatarFallback.style.position = item.image
                ? "absolute"
                : "relative";
              avatarFallback.style.top = item.image ? "0" : "auto";
              avatarFallback.style.left = item.image ? "0" : "auto";
              avatarFallback.textContent = getInitials(item.value);
              avatarWrapper.appendChild(avatarFallback);

              container.appendChild(avatarWrapper);

              // Name
              const name = document.createElement("span");
              name.className = "mention-name";
              name.style.fontSize = "14px";
              name.style.color = "#1d1c1d";
              name.style.lineHeight = "1.2";
              name.textContent = item.value;
              container.appendChild(name);

              return container;
            },
            // Custom onSelect to ensure proper data structure
            // Phase 2: Mentions stored as { insert: { mention: { id, value } } }
            // Note: quill-mention uses 'value' instead of 'label', but serves the same purpose
            onSelect: (
              item: DOMStringMap,
              insertItem: (data: Record<string, unknown>) => void
            ) => {
              // Ensure we're inserting with id and value (label)
              const mentionData = {
                id: item.id || "",
                value: item.value || "", // This is the label/display name
                denotationChar: "@",
              };
              insertItem(mentionData);
            },
          },
        }),
        keyboard: {
          bindings: {
            enter: {
              key: "Enter",
              handler: () => {
                const currentFiles = filesRef.current;
                const messageDelta = quill.getContents();

                // Phase 2: Check for content including mentions (not just text)
                if (!checkHasContent(messageDelta, currentFiles)) return;

                // Stop typing when message is sent
                if (variant === "create" && onTypingStopRef.current) {
                  onTypingStopRef.current();
                }
                // Trim leading/trailing empty lines before submitting
                const trimmedOps = trimEmptyLinesFromOps(
                  messageDelta.ops || []
                );
                const cleanedDelta = new Delta(trimmedOps as Op[]);
                const mentionedUserIds = extractMentions(cleanedDelta);
                submitRef.current?.({
                  attachments: currentFiles,
                  body: JSON.stringify(cleanedDelta),
                  mentions: mentionedUserIds,
                });
              },
            },
            shift_enter: {
              key: "Enter",
              shiftKey: true,
              handler: () => {
                quill.insertText(quill.getSelection()?.index || 0, "\n");
              },
            },
          },
        },
      },
    };
    const quill = new Quill(editorContainer, options);

    quillRef.current = quill;
    quillRef.current.focus();

    if (innerRef) {
      innerRef.current = quill;
    }

    quill.setContents(defaultValueRef.current);

    // Phase 2: Initialize content state
    const initialDelta = quill.getContents();
    setHasEditorContent(checkHasContent(initialDelta, filesRef.current));

    // URL detection regex - matches http, https, www, and common domains
    const urlRegex =
      /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;

    // Function to detect and convert URLs to links
    const convertUrlsToLinks = () => {
      const text = quill.getText();

      // Find all URLs in the text
      const matches = Array.from(text.matchAll(urlRegex));

      if (matches.length === 0) return;

      // Process matches in reverse order to maintain correct indices
      matches.reverse().forEach((match) => {
        if (!match.index && match.index !== 0) return;

        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;

        // Check if this range already has a link format
        const format = quill.getFormat(startIndex, endIndex - startIndex);
        if (format.link) return; // Already a link, skip

        // Get the URL text
        const urlText = match[0];
        // Ensure URL has protocol
        let url = urlText;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }

        // Apply link format
        quill.formatText(
          startIndex,
          endIndex - startIndex,
          "link",
          url,
          "user"
        );
      });
    };

    // Handle file paste from clipboard
    const handlePaste = async (e: Event) => {
      const clipboardEvent = e as ClipboardEvent;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Support both images and other files
        if (item.kind === "file") {
          clipboardEvent.preventDefault();
          clipboardEvent.stopPropagation();
          const blob = item.getAsFile();
          if (blob) {
            const fileName =
              item.type.startsWith("image/") ||
              blob.type === "image/heic" ||
              blob.type === "image/heif"
                ? `pasted-image-${Date.now()}.png`
                : `pasted-file-${Date.now()}`;
            const pastedFile = new File([blob], fileName, {
              type: blob.type || "application/octet-stream",
            });
            setFiles((prev) => [...prev, pastedFile]);
          }
          return;
        }
      }
    };

    // Listen to paste event on the editor element (use capture phase to intercept before Quill)
    const editorElement = editorContainer.querySelector(
      ".ql-editor"
    ) as HTMLElement | null;
    if (editorElement) {
      editorElement.addEventListener("paste", handlePaste, true);
    }

    // Also handle text-change to remove any images that might have been inserted
    const handleTextChange = () => {
      const delta = quill.getContents();
      const hasImage = delta.ops?.some(
        (op: Op) =>
          op.insert && typeof op.insert === "object" && "image" in op.insert
      );
      if (hasImage) {
        // Remove image ops and keep only text
        const filteredOps = delta.ops?.filter(
          (op: Op) =>
            !(
              op.insert &&
              typeof op.insert === "object" &&
              "image" in op.insert
            )
        );
        if (filteredOps && filteredOps.length !== delta.ops?.length) {
          quill.setContents(filteredOps);
        }
      }
    };

    quill.on(Quill.events.TEXT_CHANGE, (_delta, _oldDelta, source) => {
      handleTextChange();

      // Phase 2: Update content state including mentions
      const delta = quill.getContents();
      const hasContent = checkHasContent(delta, filesRef.current);
      setHasEditorContent(hasContent);

      // Convert URLs to links when user types (not when programmatically changed)
      if (source === "user") {
        // Use setTimeout to allow the text to be inserted first
        setTimeout(() => {
          convertUrlsToLinks();
        }, 0);
      }

      // Emit typing start event when user types
      if (variant === "create" && onTypingStartRef.current) {
        onTypingStartRef.current();
      }
    });

    // Close mention popup helper function
    const closeMentionPopup = () => {
      const mentionContainer = document.querySelector(
        ".ql-mention-list-container"
      ) as HTMLElement | null;
      if (mentionContainer) {
        mentionContainer.style.display = "none";
      }
    };

    // Handle Escape key to close mention popup
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const mentionContainer = document.querySelector(
          ".ql-mention-list-container"
        ) as HTMLElement | null;
        if (mentionContainer && mentionContainer.style.display !== "none") {
          closeMentionPopup();
          // Blur editor to remove focus
          if (quillRef.current) {
            quillRef.current.blur();
          }
        }
      }
    };

    // Handle clicks outside mention popup to close it
    const handleClickOutside = (e: MouseEvent) => {
      const mentionContainer = document.querySelector(
        ".ql-mention-list-container"
      ) as HTMLElement | null;

      if (mentionContainer && mentionContainer.style.display !== "none") {
        // Check if click is outside the mention container and editor
        const target = e.target as HTMLElement;
        const editorElement = editorContainer.querySelector(
          ".ql-editor"
        ) as HTMLElement | null;

        if (
          mentionContainer &&
          !mentionContainer.contains(target) &&
          editorElement &&
          !editorElement.contains(target)
        ) {
          closeMentionPopup();
        }
      }
    };

    // Add event listeners
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      quill.off(Quill.events.TEXT_CHANGE);
      const editorElement = editorContainer.querySelector(
        ".ql-editor"
      ) as HTMLElement | null;
      if (editorElement) {
        editorElement.removeEventListener("paste", handlePaste, true);
      }

      // Remove event listeners
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);

      // Close mention popup if it's open
      closeMentionPopup();

      if (container) {
        container.innerHTML = "";
      }
      if (quillRef.current) {
        quillRef.current = null;
      }
      if (innerRef) {
        innerRef.current = null;
      }
    };
  }, [innerRef, variant, channelId, conversationId, mentionUsers]);

  const toggleToolbar = () => {
    setIsToolbarVisible((prev) => !prev);
    const toolbarElement = containerRef.current?.querySelector(".ql-toolbar");

    if (toolbarElement) {
      toolbarElement.classList.toggle("hidden");
    }
  };

  // Save cursor position before emoji popover opens
  const handleEmojiButtonClick = () => {
    const quill = quillRef.current;
    if (quill) {
      const selection = quill.getSelection();
      savedSelectionRef.current = selection?.index ?? null;
    }
  };

  const onEmojiSelect = (emoji: string) => {
    const quill = quillRef.current;
    if (!quill) return;

    // Get current selection or use saved position
    const selection = quill.getSelection();
    const index = selection?.index ?? savedSelectionRef.current ?? 0;

    // Insert emoji at cursor position
    quill.insertText(index, emoji, "user");

    // Move cursor after the emoji
    quill.setSelection(index + emoji.length);

    // Focus the editor
    quill.focus();

    // Clear saved selection
    savedSelectionRef.current = null;
  };

  // Phase 2: Check for content including mentions (not just text)
  const isEmpty = !hasEditorContent && files.length === 0;

  return (
    <div className="flex flex-col" {...getRootProps()}>
      <input {...getInputProps()} />
      <div
        className={cn(
          "flex flex-col border border-slate-200 rounded-md overflow-hidden focus-within:border-slate-300 focus-within:shadow-sm transition bg-white",
          disabled && "opacity-50",
          isDragActive && "border-blue-400 bg-blue-50/50"
        )}
      >
        <div ref={containerRef} className="h-full ql-custom" />
        {files.length > 0 && (
          <div className="p-2">
            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => {
                const fileType = getFileType(file);
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="relative flex flex-col items-start gap-1 group/file"
                  >
                    <div className="relative size-[62px] flex items-center justify-center">
                      <Hint label="Remove file">
                        <button
                          onClick={() => {
                            setFiles((prev) =>
                              prev.filter((_, i) => i !== index)
                            );
                          }}
                          className="hidden group-hover/file:flex rounded-full bg-black/70 hover:bg-black absolute -top-2.5 -right-2.5 text-white size-6 z-4 border-2 border-white items-center justify-center"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </Hint>
                      <Hint label={file.name}>
                        {fileType === "image" ? (
                          <HeicImagePreview
                            file={file}
                            alt={file.name}
                            fill
                            className="rounded-xl overflow-hidden border object-cover"
                          />
                        ) : fileType === "video" ? (
                          <div className="size-full flex items-center justify-center bg-slate-200 rounded-xl border">
                            <VideoIcon className="size-6 text-slate-600" />
                          </div>
                        ) : (
                          <div className="size-full flex items-center justify-center bg-slate-200 rounded-xl border">
                            {renderFileIcon(file)}
                          </div>
                        )}
                      </Hint>
                    </div>
                    <p className="text-[10px] text-slate-500 max-w-[62px] truncate">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex px-2 pb-2 z-5">
          <Hint
            label={isToolbarVisible ? "Hide formatting" : "Show formatting"}
          >
            <Button
              disabled={disabled}
              size="icon-sm"
              variant="ghost"
              onClick={toggleToolbar}
            >
              <PiTextAa className="size-4" />
            </Button>
          </Hint>
          <EmojiPopover hint="Emoji" onEmojiSelect={onEmojiSelect}>
            <Button
              disabled={disabled}
              size="icon-sm"
              variant="ghost"
              onClick={handleEmojiButtonClick}
            >
              <Smile className="size-4" />
            </Button>
          </EmojiPopover>
          {variant === "create" && (
            <Hint label="Attachment">
              <Button
                disabled={disabled}
                size="icon-sm"
                variant="ghost"
                onClick={(e) => {
                  (e.currentTarget as HTMLButtonElement).blur();
                  open();
                }}
              >
                <Paperclip className="size-4" />
              </Button>
            </Hint>
          )}
          {variant === "update" && (
            <div className="ml-auto flex items-center gap-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={disabled}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const delta = quillRef.current?.getContents();
                  if (!delta) return;
                  // Trim leading/trailing empty lines before submitting
                  const trimmedOps = trimEmptyLinesFromOps(delta.ops || []);
                  const cleanedDelta = new Delta(trimmedOps as Op[]);
                  const mentionedUserIds = extractMentions(cleanedDelta);
                  onSubmit({
                    attachments: files,
                    body: JSON.stringify(cleanedDelta),
                    mentions: mentionedUserIds,
                  });
                }}
                disabled={disabled || isEmpty}
                className="bg-[#007a5a] hover:bg-[#007a5a]/80 text-white"
              >
                Save
              </Button>
            </div>
          )}
          {variant === "create" && (
            <Button
              className={cn(
                "ml-auto",
                isEmpty
                  ? "bg-white hover:bg-white text-muted-foreground"
                  : "bg-[#007a5a] hover:bg-[#007a5a]/80 text-white"
              )}
              disabled={disabled || isEmpty}
              size="icon-sm"
              onClick={() => {
                // Stop typing when message is sent
                if (onTypingStopRef.current) {
                  onTypingStopRef.current();
                }
                const delta = quillRef.current?.getContents();
                if (!delta) return;
                // Trim leading/trailing empty lines before submitting
                const trimmedOps = trimEmptyLinesFromOps(delta.ops || []);
                const cleanedDelta = new Delta(trimmedOps as Op[]);
                const mentionedUserIds = extractMentions(cleanedDelta);
                onSubmit({
                  attachments: files,
                  body: JSON.stringify(cleanedDelta),
                  mentions: mentionedUserIds,
                });
              }}
            >
              <MdSend className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {variant === "create" && (
        <div className="flex items-center justify-between p-2">
          {(conversationId || channelId) && (
            <TypingIndicator
              conversationId={conversationId}
              channelId={channelId}
            />
          )}
          <div
            className={cn(
              "text-[10px] text-muted-foreground opacity-0 transition",
              !isEmpty && "opacity-100"
            )}
          >
            <p>
              <strong>Shift + Enter</strong> to add a new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */
function renderFileIcon(file: File) {
  const specificType = getSpecificFileType(file);

  switch (specificType) {
    case "pdf":
      return <img src="/pdf-icon.svg" alt="PDF file" className="size-6" />;
    case "excel":
      return <img src="/excel-icon.svg" alt="Excel file" className="size-6" />;
    case "word":
      return <img src="/word-icon.svg" alt="Word file" className="size-6" />;
    case "text":
      return <img src="/text-file.svg" alt="Text file" className="size-6" />;
    case "markdown":
      return <img src="/md-icon.svg" alt="Markdown file" className="size-6" />;
    case "json":
      return <img src="/json-icon.svg" alt="JSON file" className="size-6" />;
    case "csv":
      return <img src="/excel-icon.svg" alt="CSV file" className="size-6" />;
    case "powerpoint":
      return (
        <img src="/ppt-icon.svg" alt="PowerPoint file" className="size-6" />
      );
    case "zip":
      return <img src="/zip-icon.svg" alt="ZIP file" className="size-6" />;
    default:
      return <img src="/file.svg" alt="File" className="size-6" />;
  }
}

/**
 * Check if delta has any content (text, mentions, or other embeds)
 * Phase 2: Accounts for mentions which are embeds, not text
 */
function checkHasContent(delta: Delta | undefined, files: File[]): boolean {
  if (files.length > 0) return true;
  if (!delta || !delta.ops || delta.ops.length === 0) return false;

  // Check if there's any meaningful content
  for (const op of delta.ops) {
    // Check for text content
    if (typeof op.insert === "string" && op.insert.trim().length > 0) {
      return true;
    }
    // Check for mentions (Phase 2)
    if (op.insert && typeof op.insert === "object" && "mention" in op.insert) {
      return true;
    }
    // Check for other embeds (images, etc.)
    if (op.insert && typeof op.insert === "object") {
      return true;
    }
  }

  return false;
}

/**
 * Phase 2 & 3: Extract mentions from Delta ops
 * Mentions are stored as: { insert: { mention: { id: string, value: string } } }
 * Returns array of mention IDs
 */
function extractMentions(delta: Delta | undefined): string[] {
  if (!delta) return [];
  return (
    delta.ops
      ?.filter(
        (op: Op) =>
          op.insert && typeof op.insert === "object" && "mention" in op.insert
      )
      .map((op: Op) => {
        const insert = op.insert as { mention: { id: string; value?: string } };
        // Phase 2: Mentions have id and value (label)
        return insert.mention.id;
      }) || []
  );
}
