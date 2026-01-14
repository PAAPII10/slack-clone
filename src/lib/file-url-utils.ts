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
