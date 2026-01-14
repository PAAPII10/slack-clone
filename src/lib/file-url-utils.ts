export function getSpecificFileTypeFromUrl(
  url: string
):
  | "pdf"
  | "excel"
  | "word"
  | "text"
  | "markdown"
  | "json"
  | "csv"
  | "powerpoint"
  | "zip"
  | "image"
  | "video"
  | "other" {
  const lowerUrl = url.toLowerCase();

  // Image extensions
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(lowerUrl)) {
    return "image";
  }

  // Video extensions
  if (/\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)$/i.test(lowerUrl)) {
    return "video";
  }

  // Specific document types
  if (/\.(pdf)$/i.test(lowerUrl)) {
    return "pdf";
  }
  if (/\.(xls|xlsx)$/i.test(lowerUrl)) {
    return "excel";
  }
  if (/\.(doc|docx)$/i.test(lowerUrl)) {
    return "word";
  }
  if (/\.(md|markdown)$/i.test(lowerUrl)) {
    return "markdown";
  }
  if (/\.(txt)$/i.test(lowerUrl)) {
    return "text";
  }
  if (/\.(json)$/i.test(lowerUrl)) {
    return "json";
  }
  if (/\.(csv)$/i.test(lowerUrl)) {
    return "csv";
  }
  if (/\.(ppt|pptx)$/i.test(lowerUrl)) {
    return "powerpoint";
  }
  if (/\.(zip|rar|7z)$/i.test(lowerUrl)) {
    return "zip";
  }

  return "other";
}

export function getFileNameFromUrl(url: string): string {
  try {
    // Try to extract filename from URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || "file";

    // If it's a storage URL without extension, try to get from query params or use generic name
    if (!filename.includes(".")) {
      return "attachment";
    }

    return decodeURIComponent(filename);
  } catch {
    // If URL parsing fails, try to extract from path
    const parts = url.split("/");
    const lastPart = parts[parts.length - 1]?.split("?")[0] || "attachment";
    return lastPart.includes(".") ? decodeURIComponent(lastPart) : "attachment";
  }
}

/**
 * Gets a human-readable description for a file type.
 * 
 * @param fileType - The file type to get description for
 * @returns A string description of the file type
 */
export function getFileTypeDescription(
  fileType:
    | "pdf"
    | "excel"
    | "word"
    | "text"
    | "markdown"
    | "json"
    | "csv"
    | "powerpoint"
    | "zip"
    | "image"
    | "video"
    | "other"
): string {
  switch (fileType) {
    case "pdf":
      return "PDF Document";
    case "excel":
      return "Excel Spreadsheet";
    case "word":
      return "Word Document";
    case "text":
      return "Text File";
    case "markdown":
      return "Markdown File";
    case "json":
      return "JSON File";
    case "csv":
      return "CSV File";
    case "powerpoint":
      return "PowerPoint Presentation";
    case "zip":
      return "ZIP Archive";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "other":
    default:
      return "File Attachment";
  }
}

/**
 * Download file with Sonner toast.promise showing progress
 * Uses toast.loading for progress updates, then shows success/error
 */
export const downloadFileWithToast = async ({
  url,
  fileName,
  loadingMessage = 'Preparing download...',
  successMessage,
  errorMessage = 'Failed to download file',
}: {
  url: string;
  fileName: string;
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
}) => {
  // Dynamic import to avoid SSR issues
  const { toast } = await import('sonner');

  let progressToastId: string | number | undefined;

  const downloadPromise = new Promise<void>((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';

      // Start with initial loading message
      progressToastId = toast.loading(loadingMessage);

      xhr.onprogress = (event) => {
        if (event.lengthComputable && progressToastId) {
          const percent = Math.round((event.loaded / event.total) * 100);
          toast.loading(`Downloading... ${percent}%`, {
            id: progressToastId,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;

          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);

          const filename = fileName || 'file';

          link.download = filename.replace(/"/g, '');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Dismiss progress toast and show success
          if (progressToastId) {
            toast.dismiss(progressToastId);
          }
          toast.success(successMessage || `Downloaded ${fileName} successfully!`);
          resolve();
        } else {
          console.error('Error downloading file. Status:', xhr.status);
          if (progressToastId) {
            toast.dismiss(progressToastId);
          }
          toast.error(errorMessage);
          reject(new Error(`Download failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        console.error('Network error while downloading file');
        if (progressToastId) {
          toast.dismiss(progressToastId);
        }
        toast.error(errorMessage);
        reject(new Error('Network error while downloading file'));
      };

      xhr.send();
    } catch (error) {
      console.error('Error downloading file:', error);
      if (progressToastId) {
        toast.dismiss(progressToastId);
      }
      toast.error(errorMessage);
      reject(error instanceof Error ? error : new Error('Unknown download error'));
    }
  });

  return downloadPromise;
};

/**
 * Downloads a file from a URL using XHR to track progress and shows progress via Sonner toast.
 * This is a convenience wrapper around downloadFileWithToast for backward compatibility.
 * 
 * @param url - The URL of the file to download
 * @param filename - Optional filename for the download. If not provided, will be extracted from URL
 * @returns Promise that resolves when download is completed
 */
export async function downloadFile(
  url: string,
  filename?: string
): Promise<void> {
  const downloadFilename = filename || getFileNameFromUrl(url);
  return downloadFileWithToast({
    url,
    fileName: downloadFilename,
    loadingMessage: `Preparing download...`,
    successMessage: `Downloaded ${downloadFilename} successfully!`,
    errorMessage: `Failed to download ${downloadFilename}`,
  });
}
