import { useEffect, useRef } from "react";

/**
 * Hook to manage document title that persists even when Next.js tries to override it
 */
export function useDocumentTitle(title: string | null | undefined) {
  const titleRef = useRef<string | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const targetTitle = title ? `${title} - Sync` : "Sync - Team Communication";
    
    // Only update if title actually changed
    if (titleRef.current === targetTitle) return;
    titleRef.current = targetTitle;

    const updateTitle = () => {
      if (document.title !== targetTitle) {
        document.title = targetTitle;
      }
    };

    // Update immediately
    updateTitle();

    // Set up MutationObserver to watch for title changes and re-apply
    if (!observerRef.current) {
      observerRef.current = new MutationObserver(() => {
        if (document.title !== targetTitle) {
          updateTitle();
        }
      });

      // Observe the title element
      const titleElement = document.querySelector("title");
      if (titleElement) {
        observerRef.current.observe(titleElement, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }

      // Also observe document.head for title element changes
      observerRef.current.observe(document.head, {
        childList: true,
        subtree: true,
      });
    }

    // Also update after delays to catch Next.js resets
    const timeout1 = setTimeout(updateTitle, 50);
    const timeout2 = setTimeout(updateTitle, 200);
    const timeout3 = setTimeout(updateTitle, 500);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [title]);
}
