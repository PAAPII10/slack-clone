/**
 * Shared Quill initialization
 * Registers Quill modules and blots that are needed across the application.
 *
 * This module ensures MentionBlot is registered only once, preventing
 * "Overwriting formats/mention" warnings.
 *
 * Import this file in any component that uses Quill:
 *   import "@/lib/quill-init";
 */

import Quill from "quill";
import { Mention, MentionBlot } from "quill-mention";

// Use a global flag to ensure registration happens only once
// This works across module boundaries
declare global {
  var __quillMentionRegistered: boolean | undefined;
}

// Only register if not already registered
if (typeof globalThis.__quillMentionRegistered === "undefined") {
  Quill.register("modules/mention", Mention);
  Quill.register(MentionBlot);
  globalThis.__quillMentionRegistered = true;
}
