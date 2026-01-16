export function getFileType(
  file: File
): "image" | "video" | "document" | "other" {
  // Check for HEIC/HEIF files
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif");

  if (file.type.startsWith("image/") || isHeic) {
    return "image";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  // Common document types
  if (
    file.type.startsWith("application/pdf") ||
    file.type.includes("word") ||
    file.type.includes("excel") ||
    file.type.includes("powerpoint") ||
    file.type.includes("text/") ||
    file.type.includes("document") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("presentation") ||
    file.name.endsWith(".pdf") ||
    file.name.endsWith(".doc") ||
    file.name.endsWith(".docx") ||
    file.name.endsWith(".xls") ||
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".ppt") ||
    file.name.endsWith(".pptx") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".csv")
  ) {
    return "document";
  }
  return "other";
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function getSpecificFileType(
  file: File
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
  | "other" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (name.endsWith(".pdf") || type.includes("pdf")) {
    return "pdf";
  }
  if (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    type.includes("excel") ||
    type.includes("spreadsheet")
  ) {
    return "excel";
  }
  if (
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    type.includes("word") ||
    (type.includes("document") && !type.includes("pdf"))
  ) {
    return "word";
  }
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return "markdown";
  }
  if (name.endsWith(".txt") || type.startsWith("text/")) {
    return "text";
  }
  if (name.endsWith(".json") || type.includes("json")) {
    return "json";
  }
  if (name.endsWith(".csv") || type.includes("csv")) {
    return "csv";
  }
  if (
    name.endsWith(".ppt") ||
    name.endsWith(".pptx") ||
    type.includes("powerpoint") ||
    type.includes("presentation")
  ) {
    return "powerpoint";
  }
  if (
    name.endsWith(".zip") ||
    name.endsWith(".rar") ||
    name.endsWith(".7z") ||
    type.includes("zip") ||
    type.includes("compressed")
  ) {
    return "zip";
  }
  return "other";
}
