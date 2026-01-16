/**
 * Utility functions for HEIC image handling
 */

/**
 * Checks if a file is a HEIC/HEIF image
 */
export function isHeicFile(file: File | string): boolean {
  if (typeof file === "string") {
    // Check by URL/extension
    const lower = file.toLowerCase();
    return lower.endsWith(".heic") || lower.endsWith(".heif");
  }

  // Check by MIME type or extension
  const type = file.type?.toLowerCase() || "";
  const name = file.name?.toLowerCase() || "";

  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Converts a HEIC file to JPEG on the server
 * Returns a File object with JPEG content
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload/convert-heic", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Failed to convert HEIC image" }));
    throw new Error(error.message || "Failed to convert HEIC image");
  }

  const result = await response.json();

  // Convert base64 data URL back to File
  const base64Response = await fetch(result.dataUrl);
  const blob = await base64Response.blob();

  // Create a new File with JPEG extension
  const fileName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], fileName, { type: "image/jpeg" });
}

/**
 * Converts a HEIC file to JPEG for preview using heic2any (client-side only)
 * This is used for preview purposes before upload
 */
export async function convertHeicForPreview(file: File): Promise<string> {
  // Dynamic import to avoid SSR issues
  const heic2any = (await import("heic2any")).default;

  const convertedBlob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  // heic2any can return an array or a single blob
  const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

  if (!blob) {
    throw new Error("Failed to convert HEIC image: no blob returned");
  }

  return URL.createObjectURL(blob);
}
