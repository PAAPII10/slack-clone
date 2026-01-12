import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts plain text from a Quill Delta JSON string
 * Used for browser notifications and other text-only contexts
 */
export async function extractPlainTextFromQuill(quillDeltaJson: string): Promise<string> {
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
