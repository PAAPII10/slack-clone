/* eslint-disable @next/next/no-img-element */

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { MouseEvent, useEffect, useState } from "react";
import {
  getSpecificFileTypeFromUrl,
  getFileNameFromUrl,
  downloadFile,
  getFileTypeDescription,
} from "@/lib/file-url-utils";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/file-utils";
import { Hint } from "@/components/Hint";
import { isHeicFile } from "@/lib/heic-utils";

interface ThumbnailProps {
  url: string | null | undefined;
  size?: number | null;
}

function renderFileIcon(specificType: string) {
  switch (specificType) {
    case "pdf":
      return <img src="/pdf-icon.svg" alt="PDF" className="size-8" />;
    case "excel":
      return <img src="/excel-icon.svg" alt="Excel" className="size-8" />;
    case "word":
      return <img src="/word-icon.svg" alt="Word" className="size-8" />;
    case "text":
      return <img src="/text-file.svg" alt="Text" className="size-8" />;
    case "markdown":
      return <img src="/md-icon.svg" alt="Markdown" className="size-8" />;
    case "json":
      return <img src="/json-icon.svg" alt="JSON" className="size-8" />;
    case "csv":
      return <img src="/excel-icon.svg" alt="CSV" className="size-8" />;
    case "powerpoint":
      return <img src="/ppt-icon.svg" alt="PowerPoint" className="size-8" />;
    case "zip":
      return <img src="/zip-icon.svg" alt="ZIP" className="size-8" />;
    default:
      return <img src="/file.svg" alt="File" className="size-8" />;
  }
}

async function detectFileTypeFromContentType(
  url: string
): Promise<
  | "image"
  | "video"
  | "pdf"
  | "excel"
  | "word"
  | "text"
  | "markdown"
  | "json"
  | "csv"
  | "powerpoint"
  | "zip"
  | "other"
> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const contentType = response.headers.get("content-type");

    if (contentType) {
      if (contentType.startsWith("image/")) {
        return "image";
      }
      if (contentType.startsWith("video/")) {
        return "video";
      }
      if (contentType.includes("pdf")) {
        return "pdf";
      }
      if (
        contentType.includes("excel") ||
        contentType.includes("spreadsheet")
      ) {
        return "excel";
      }
      if (
        contentType.includes("word") ||
        (contentType.includes("document") && !contentType.includes("pdf"))
      ) {
        return "word";
      }
      if (contentType.includes("markdown")) {
        return "markdown";
      }
      if (contentType.startsWith("text/")) {
        // Check if it's markdown by URL extension
        if (
          url.toLowerCase().endsWith(".md") ||
          url.toLowerCase().endsWith(".markdown")
        ) {
          return "markdown";
        }
        return "text";
      }
      if (contentType.includes("json")) {
        return "json";
      }
      if (contentType.includes("csv")) {
        return "csv";
      }
      if (
        contentType.includes("powerpoint") ||
        contentType.includes("presentation")
      ) {
        return "powerpoint";
      }
      if (contentType.includes("zip") || contentType.includes("compressed")) {
        return "zip";
      }
    }
  } catch (error) {
    // If HEAD request fails, try to detect by attempting to load as image
    console.warn("Failed to detect file type from Content-Type:", error);
  }

  // Fallback: try to detect if it's an image by loading it
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve("image");
    img.onerror = () => resolve("other");
    img.src = url;
    // Timeout after 2 seconds
    setTimeout(() => resolve("other"), 2000);
  });
}

export function Thumbnail({ url, size }: ThumbnailProps) {
  // Determine initial file type - handle HEIC files as images
  const getInitialFileType = ():
    | "image"
    | "video"
    | "pdf"
    | "excel"
    | "word"
    | "text"
    | "markdown"
    | "json"
    | "csv"
    | "powerpoint"
    | "zip"
    | "other" => {
    if (!url) return "other";
    // HEIC files should already be converted server-side, but handle edge case
    if (isHeicFile(url)) return "image";
    return getSpecificFileTypeFromUrl(url);
  };

  const [fileType, setFileType] = useState(getInitialFileType);
  const [fileSize, setFileSize] = useState<number | null>(size ?? null);

  useEffect(() => {
    if (!url) {
      return;
    }

    // If we couldn't determine from URL, detect from Content-Type
    const urlType = getSpecificFileTypeFromUrl(url);
    if (urlType === "other" && !isHeicFile(url)) {
      detectFileTypeFromContentType(url).then(setFileType);
    }
  }, [url]);

  // Fetch file size for non-image files if not provided from storage
  useEffect(() => {
    if (!url || fileType === "image" || size !== undefined) {
      return;
    }

    const fetchFileSize = async () => {
      try {
        const response = await fetch(url, { method: "HEAD" });
        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          setFileSize(parseInt(contentLength, 10));
        }
      } catch (error) {
        console.warn("Failed to fetch file size:", error);
        setFileSize(null);
      }
    };

    fetchFileSize();
  }, [url, fileType, size]);

  if (!url) return null;

  const fileName = getFileNameFromUrl(url);

  const handleDownload = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    await downloadFile(url, fileName);
  };

  if (fileType === "image") {
    return (
      <div className="relative max-w-[360px] my-2 group">
        <Dialog>
          <DialogTrigger asChild>
            <div className="relative overflow-hidden border rounded-lg cursor-zoom-in">
              <img
                src={url}
                alt="Message attachment"
                className="rounded-md object-contain max-w-full max-h-[300px] w-auto h-auto"
              />
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-[800px] border-none p-0 bg-transparent shadow-none">
            <DialogTitle className="sr-only">
              Image preview: {fileName}
            </DialogTitle>
            <div className="relative">
              <img
                src={url}
                alt="Message attachment"
                className="rounded-md object-cover w-full h-full"
              />
              <div className="absolute bottom-2 right-2">
                <Hint label="Download">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-black/70 hover:bg-black/90 text-white"
                    onClick={handleDownload}
                  >
                    <DownloadIcon className="size-4" />
                  </Button>
                </Hint>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Hint label="Download">
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/70 hover:bg-black/90 text-white"
              onClick={handleDownload}
            >
              <DownloadIcon className="size-4" />
            </Button>
          </Hint>
        </div>
      </div>
    );
  }

  if (fileType === "video") {
    return (
      <div className="relative overflow-hidden max-w-[360px] border rounded-lg my-2 group">
        <video
          src={url}
          controls
          className="rounded-md object-cover w-full max-h-[400px]"
        >
          Your browser does not support the video tag.
        </video>
        {fileSize !== null && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {formatFileSize(fileSize)}
          </div>
        )}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Hint label="Download">
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/70 hover:bg-black/90 text-white"
              onClick={handleDownload}
            >
              <DownloadIcon className="size-4" />
            </Button>
          </Hint>
        </div>
      </div>
    );
  }

  // For documents and other files, show a nice preview card with download option
  return (
    <div className="relative overflow-hidden max-w-[360px] border rounded-lg my-2 p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-14 bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
          {renderFileIcon(fileType)}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium text-slate-900 truncate"
            title={fileName}
          >
            {fileName}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {getFileTypeDescription(fileType)}
            {fileSize !== null && ` • ${formatFileSize(fileSize)}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Hint label="Download">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleDownload}
            >
              <DownloadIcon className="size-4 text-slate-600" />
            </Button>
          </Hint>
          <Hint label="Open">
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLinkIcon className="size-4 text-slate-600" />
              </a>
            </Button>
          </Hint>
        </div>
      </div>
    </div>
  );
}
