import Quill from "quill";
import { useEffect, useRef, useState } from "react";
import type { Delta } from "quill/core";
import { Id } from "../../convex/_generated/dataModel";
import { usePanel } from "@/hooks/use-panel";

// MentionBlot is already registered in Editor.tsx
// No need to register again to avoid duplicate registration warning

interface RendererProps {
  value: string;
  currentMemberId?: Id<"members">; // Phase 4: For highlighting current user's mentions
  workspaceId?: Id<"workspaces">; // Phase 4: For opening user profiles
}

/**
 * Check if delta has any content (text, mentions, or other embeds)
 * Phase 2: Accounts for mentions which are embeds, not text
 */
function checkHasContent(delta: Delta | undefined): boolean {
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

export default function Renderer({ 
  value, 
  currentMemberId,
  workspaceId 
}: RendererProps) {
  const [isEmpty, setIsEmpty] = useState(false);
  const rendererRef = useRef<HTMLDivElement>(null);
  const { onOpenProfile } = usePanel();

  useEffect(() => {
    if (!rendererRef.current) return;

    const container = rendererRef.current;

    const quill = new Quill(document.createElement("div"), {
      theme: "snow",
    });

    quill.enable(false);
    const content = JSON.parse(value);
    quill.setContents(content);

    // Phase 2: Check for content including mentions (not just text)
    const delta = quill.getContents();
    const hasContent = checkHasContent(delta);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEmpty(!hasContent);

    container.innerHTML = quill.root.innerHTML;

    // Phase 4: Style and make mentions interactive
    // Each mention element has a unique data-id attribute (member ID)
    // When clicked, we get the specific mention's ID from that element
    const mentionElements = container.querySelectorAll('.mention[data-id]');
    const clickHandlers: Array<() => void> = [];
    
    mentionElements.forEach((mentionEl) => {
      const mentionElement = mentionEl as HTMLElement;
      // Get the member ID from this specific mention element's data attribute
      const mentionedMemberId = mentionElement.getAttribute('data-id');
      
      if (!mentionedMemberId) return;
      
      // Phase 4: Highlight mentions for current user
      // Compare: if this mention's member ID matches current user's member ID, highlight it
      if (currentMemberId && mentionedMemberId === currentMemberId) {
        mentionElement.classList.add('mention-current-user');
      }
      
      // Add click handler to open user profile for this specific mention
      // Each mention has its own click handler with its own member ID
      if (workspaceId) {
        mentionElement.classList.add('mention-clickable');
        const clickHandler = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          // Open profile for the specific member that was mentioned (this element's data-id)
          onOpenProfile(mentionedMemberId as Id<"members">);
        };
        mentionElement.addEventListener('click', clickHandler);
        clickHandlers.push(() => {
          mentionElement.removeEventListener('click', clickHandler);
        });
      }
    });

    return () => {
      // Cleanup event listeners
      clickHandlers.forEach(cleanup => cleanup());
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [value, currentMemberId, workspaceId, onOpenProfile]);

  if (isEmpty) return null;

  return <div ref={rendererRef} className=" ql-editor ql-renderer" />;
}
