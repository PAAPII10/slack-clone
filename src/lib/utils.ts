import { clsx, type ClassValue } from "clsx";
import { Op } from "quill";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts plain text from a Quill Delta JSON string
 * Used for browser notifications and other text-only contexts
 */
export async function extractPlainTextFromQuill(
  quillDeltaJson: string
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }

  try {
    // Dynamically import Quill to avoid SSR issues
    const Quill = (await import("quill")).default;
    const delta = JSON.parse(quillDeltaJson);
    const tempDiv = document.createElement("div");
    const quill = new Quill(tempDiv, {
      theme: "snow",
    });
    quill.setContents(delta);
    const text = quill.getText().trim();
    return text;
  } catch {
    // If parsing fails, try to extract text from the delta structure directly
    try {
      const delta = JSON.parse(quillDeltaJson);
      if (Array.isArray(delta.ops)) {
        return delta.ops
          .map((op: { insert: string }) => {
            if (typeof op.insert === "string") {
              return op.insert;
            }
            return "";
          })
          .join("")
          .trim();
      }
    } catch {
      // Last resort: return empty string
    }
    return "";
  }
}

export function isValidConvexId(value: unknown): value is string {
  if (!value || typeof value !== "string") return false;

  // Convex Ids are base64url, usually 17–32 chars
  const CONVEX_ID_REGEX = /^[a-zA-Z0-9_-]{17,32}$/;

  return CONVEX_ID_REGEX.test(value);
}

/**
 * Simple utility to trim leading and trailing empty lines from Delta ops array
 * Removes standalone { insert: "\n" } operations from start and end
 */
export function trimEmptyLinesFromOps(ops: Op[]): Op[] {
  if (!ops.length) return [];

  let start = 0;
  let end = ops.length;

  const isPureNewline = (op: Op) =>
    typeof op.insert === "string" &&
    op.insert.replace(/\n/g, "").trim() === "" &&
    !op.attributes;

  // Trim start
  while (start < end && isPureNewline(ops[start])) {
    start++;
  }

  // Trim end
  while (end > start && isPureNewline(ops[end - 1])) {
    end--;
  }

  const trimmed = ops.slice(start, end);

  // Clean leading newline chars from first text op
  if (trimmed.length && typeof trimmed[0].insert === "string") {
    trimmed[0] = {
      ...trimmed[0],
      insert: trimmed[0].insert.replace(/^\n+/, ""),
    };
  }

  // Clean trailing newline chars from last text op
  // BUT preserve newline if it's part of a list (bullet/ordered) to maintain formatting
  const lastIndex = trimmed.length - 1;
  if (lastIndex >= 0 && typeof trimmed[lastIndex].insert === "string") {
    const lastOp = trimmed[lastIndex];
    const hasListAttribute =
      lastOp.attributes &&
      typeof lastOp.attributes === "object" &&
      ("list" in lastOp.attributes || "bullet" in lastOp.attributes);
    
    // Only remove trailing newlines if it's NOT a list item
    if (!hasListAttribute) {
      trimmed[lastIndex] = {
        ...trimmed[lastIndex],
        insert: trimmed[lastIndex].insert.replace(/\n+$/, ""),
      };
    }
  }

  return trimmed.filter(
    (op) => !(typeof op.insert === "string" && op.insert.length === 0)
  );
}
