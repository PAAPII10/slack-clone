"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { isHeicFile, convertHeicForPreview } from "@/lib/heic-utils";

interface HeicImagePreviewProps {
  file: File;
  alt?: string;
  fill?: boolean;
  className?: string;
}

/**
 * Component that handles HEIC image preview with loading state
 * Automatically converts HEIC files to JPEG for preview using heic2any
 */
export function HeicImagePreview({
  file,
  alt = "Preview",
  fill = false,
  className = "",
}: HeicImagePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let currentUrl: string | null = null;
    let isMounted = true;

    const loadPreview = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        // Check if it's a HEIC file
        if (isHeicFile(file)) {
          // Convert HEIC to JPEG for preview
          const convertedUrl = await convertHeicForPreview(file);
          if (isMounted) {
            currentUrl = convertedUrl;
            setPreviewUrl(convertedUrl);
            setIsLoading(false);
          }
        } else {
          // For non-HEIC files, use object URL directly
          const objectUrl = URL.createObjectURL(file);
          if (isMounted) {
            currentUrl = objectUrl;
            setPreviewUrl(objectUrl);
            setIsLoading(false);
          } else {
            // If component unmounted, clean up immediately
            URL.revokeObjectURL(objectUrl);
          }
        }
      } catch (error) {
        console.error("Failed to load image preview:", error);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
          // Fallback to object URL even if conversion fails
          try {
            const objectUrl = URL.createObjectURL(file);
            if (isMounted) {
              currentUrl = objectUrl;
              setPreviewUrl(objectUrl);
            } else {
              URL.revokeObjectURL(objectUrl);
            }
          } catch {
            // If even object URL fails, show error state
          }
        }
      }
    };

    loadPreview();

    // Cleanup function
    return () => {
      isMounted = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [file]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 rounded-xl border ${className}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-5 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  // Error state
  if (hasError || !previewUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 rounded-xl border ${className}`}
        style={fill ? { position: "absolute", inset: 0 } : undefined}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-slate-500">Preview unavailable</span>
        </div>
      </div>
    );
  }

  // Show image preview
  if (fill) {
    return (
      <Image
        src={previewUrl}
        alt={alt}
        fill
        className={className}
        unoptimized
      />
    );
  }

  return (
    <Image
      src={previewUrl}
      alt={alt}
      width={62}
      height={62}
      className={className}
      unoptimized
    />
  );
}
