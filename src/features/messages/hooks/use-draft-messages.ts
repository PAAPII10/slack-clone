"use client";

import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { Id } from "../../../../convex/_generated/dataModel";
import { logger } from "@/lib/logger";
import { Delta, Op } from "quill/core";
import { formatFileSize } from "@/lib/file-utils";

export interface DraftAttachment {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  data: string; // Data URL (e.g., "data:image/png;base64,...") for all file types
  isImage: boolean; // Whether this is an image file (useful for UI rendering)
}

export interface DraftMessage {
  body: string; // JSON stringified Delta from Quill
  mentions?: string[]; // Array of member IDs
  attachments?: DraftAttachment[]; // Array of attachment data
  updatedAt: number; // Timestamp
}

type DraftKey = `channel:${Id<"channels">}` | `member:${Id<"members">}`;

type DraftMessages = Record<DraftKey, DraftMessage>;

const STORAGE_KEY = "draft-messages";

/**
 * Check if a Delta/Op[] is empty (only contains empty paragraphs, newlines, or whitespace)
 * Quill returns <p><br /> for empty content, which we should not consider as a draft
 */
function isEmptyDelta(delta: Delta | Op[]): boolean {
  if (!delta) return true;

  const ops = Array.isArray(delta) ? delta : delta.ops;
  if (!ops || ops.length === 0) return true;

  // Check if there's any meaningful content
  for (const op of ops) {
    // Check for non-empty text content
    if (typeof op.insert === "string") {
      const text = op.insert.trim();
      // If text has content after trimming, it's not empty
      if (text.length > 0) {
        return false;
      }
    }
    // Check for mentions
    else if (
      op.insert &&
      typeof op.insert === "object" &&
      "mention" in op.insert
    ) {
      return false; // Has mentions, not empty
    }
    // Check for other embeds (images, etc.)
    else if (op.insert && typeof op.insert === "object") {
      return false; // Has embeds, not empty
    }
  }

  // All ops are empty (just newlines/whitespace)
  return true;
}

// Load initial drafts from localStorage and filter out empty ones
const loadDrafts = (): DraftMessages => {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const drafts = JSON.parse(stored) as DraftMessages;

      // Filter out empty drafts
      const cleanedDrafts: DraftMessages = {};
      for (const [key, draft] of Object.entries(drafts)) {
        try {
          const delta = JSON.parse(draft.body) as Delta | Op[];
          const hasAttachments =
            draft.attachments && draft.attachments.length > 0;

          // Keep draft if it has content or attachments
          if (!isEmptyDelta(delta) || hasAttachments) {
            cleanedDrafts[key as DraftKey] = draft;
          }
        } catch {
          // If parsing fails, keep the draft (better safe than sorry)
          cleanedDrafts[key as DraftKey] = draft;
        }
      }

      // If we cleaned up drafts, save the cleaned version
      if (Object.keys(cleanedDrafts).length !== Object.keys(drafts).length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedDrafts));
      }

      return cleanedDrafts;
    }
  } catch (error) {
    logger.error("Error loading draft messages", error as Error);
  }

  return {};
};

// Create Jotai atom with initial value from localStorage
const draftMessagesAtom = atom<DraftMessages>(loadDrafts());

/**
 * Convert File objects to storable DraftAttachment format
 * Images are stored as base64 data URLs, other files as base64 strings
 */
export async function filesToDraftAttachments(
  files: File[]
): Promise<DraftAttachment[]> {
  const attachments: DraftAttachment[] = [];

  for (const file of files) {
    try {
      const isImage = file.type.startsWith("image/");

      // For all files, use FileReader to get data URL
      // This makes reconstruction easier and consistent
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      attachments.push({
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        data,
        isImage,
      });
    } catch (error) {
      logger.error(
        `Error converting file ${file.name} to draft attachment`,
        error as Error
      );
      // Skip files that fail to convert
    }
  }

  return attachments;
}

/**
 * Convert DraftAttachment back to File objects
 */
/**
 * Convert DraftAttachment back to File objects
 * All files are stored as data URLs, so we extract the base64 data and mime type
 */
export function draftAttachmentsToFiles(
  attachments: DraftAttachment[]
): File[] {
  return attachments.map((attachment) => {
    // Extract base64 data and mime type from data URL
    // Format: "data:mime/type;base64,base64data"
    const dataUrlMatch = attachment.data.match(/^data:([^;]+);base64,(.+)$/);

    if (!dataUrlMatch) {
      // Fallback: if data URL format is invalid, try to use stored type
      logger.warn(
        `Invalid data URL format for file ${attachment.name}, attempting fallback`
      );
      const byteString = atob(attachment.data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: attachment.type });
      return new File([blob], attachment.name, {
        type: attachment.type,
        lastModified: attachment.lastModified,
      });
    }

    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeType });

    // Create File object from Blob
    return new File([blob], attachment.name, {
      type: mimeType,
      lastModified: attachment.lastModified,
    });
  });
}

/**
 * Hook to manage draft messages with localStorage persistence
 * Uses Jotai for shared state across all components
 */
export function useDraftMessages() {
  const [drafts, setDrafts] = useAtom(draftMessagesAtom);

  // Persist to localStorage whenever drafts change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      const err = error as Error;
      // Handle quota exceeded error specifically
      if (err.name === "QuotaExceededError" || err.message.includes("quota")) {
        logger.warn(
          "localStorage quota exceeded, attempting to clean up old drafts",
          { error: err }
        );

        // Try to save without attachments (text-only drafts)
        const textOnlyDrafts: DraftMessages = {};
        for (const [key, draft] of Object.entries(drafts)) {
          textOnlyDrafts[key as DraftKey] = {
            ...draft,
            attachments: undefined, // Remove attachments to save space
          };
        }

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnlyDrafts));
          logger.warn("Saved drafts without attachments due to quota limit");
        } catch (retryError) {
          // If still failing, try to clear oldest drafts
          logger.error(
            "Still exceeding quota after removing attachments, clearing all drafts",
            retryError as Error
          );
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Last resort - ignore
          }
        }
      } else {
        logger.error("Error saving draft messages", err);
      }
    }
  }, [drafts]);

  // Get draft key from channelId or memberId
  const getDraftKey = useCallback(
    (channelId?: Id<"channels">, memberId?: Id<"members">): DraftKey | null => {
      if (channelId) {
        return `channel:${channelId}`;
      }
      if (memberId) {
        return `member:${memberId}`;
      }
      return null;
    },
    []
  );

  // Get draft for a specific location
  const getDraft = useCallback(
    (
      channelId?: Id<"channels">,
      memberId?: Id<"members">
    ): DraftMessage | null => {
      const key = getDraftKey(channelId, memberId);
      if (!key) return null;
      const draft = drafts[key];
      if (!draft) return null;

      // Check if draft is empty (only whitespace/newlines)
      try {
        const delta = JSON.parse(draft.body) as Delta | Op[];
        if (isEmptyDelta(delta) && !draft.attachments?.length) {
          // Draft is empty, return null
          return null;
        }
      } catch {
        // If parsing fails, return the draft as-is
      }

      return draft;
    },
    [drafts, getDraftKey]
  );

  // Save draft for a specific location
  const saveDraft = useCallback(
    (
      draft: DraftMessage,
      channelId?: Id<"channels">,
      memberId?: Id<"members">
    ) => {
      const key = getDraftKey(channelId, memberId);
      if (!key) return;

      setDrafts((prev) => ({
        ...prev,
        [key]: {
          ...draft,
          updatedAt: Date.now(),
        },
      }));
    },
    [setDrafts, getDraftKey]
  );

  // Clear draft for a specific location
  const clearDraft = useCallback(
    (channelId?: Id<"channels">, memberId?: Id<"members">) => {
      const key = getDraftKey(channelId, memberId);
      if (!key) return;

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setDrafts, getDraftKey]
  );

  // Clear all drafts
  const clearAllDrafts = useCallback(() => {
    setDrafts({});
  }, [setDrafts]);

  return {
    getDraft,
    saveDraft,
    clearDraft,
    clearAllDrafts,
  };
}

/**
 * Hook to manage draft for a specific location (channel or member/conversation)
 * Provides convenient methods for a single draft location
 */
export function useDraftMessage(
  channelId?: Id<"channels">,
  memberId?: Id<"members">
) {
  const { getDraft, saveDraft, clearDraft } = useDraftMessages();

  const draft = useMemo(
    () => getDraft(channelId, memberId),
    [getDraft, channelId, memberId]
  );

  const save = useCallback(
    async (body: Delta | Op[], mentions?: string[], files?: File[]) => {
      // Don't save if content is empty (only whitespace/newlines) and no files
      if (isEmptyDelta(body) && (!files || files.length === 0)) {
        // Clear draft if it exists (user cleared the content)
        clearDraft(channelId, memberId);
        return;
      }

      let attachments: DraftAttachment[] | undefined;

      if (files && files.length > 0) {
        try {
          // Check total file size before converting (limit to 6MB total to avoid quota issues)
          const MAX_TOTAL_SIZE = 6 * 1024 * 1024; // 6MB
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);

          if (totalSize > MAX_TOTAL_SIZE) {
            logger.warn(
              `Total file size (${formatFileSize(
                totalSize
              )}) exceeds limit (${formatFileSize(
                MAX_TOTAL_SIZE
              )}). Skipping attachments in draft.`
            );
            // Save draft without attachments if files are too large
          } else {
            attachments = await filesToDraftAttachments(files);
          }
        } catch (error) {
          logger.error("Error saving attachments to draft", error as Error);
          // Continue without attachments if conversion fails
        }
      }

      // Convert Delta/Op[] to string for storage
      const bodyString = JSON.stringify(body);

      saveDraft(
        {
          body: bodyString,
          mentions,
          attachments,
          updatedAt: Date.now(),
        },
        channelId,
        memberId
      );
    },
    [saveDraft, clearDraft, channelId, memberId]
  );

  const clear = useCallback(() => {
    clearDraft(channelId, memberId);
  }, [clearDraft, channelId, memberId]);

  // Get files from draft (if any)
  const getFiles = useCallback((): File[] => {
    if (!draft?.attachments || draft.attachments.length === 0) {
      return [];
    }
    return draftAttachmentsToFiles(draft.attachments);
  }, [draft]);

  return {
    draft,
    save,
    clear,
    getFiles,
  };
}
