import { isHeicFile, convertHeicToJpeg } from "./heic-utils";

/**
 * Uploads a file, converting HEIC to JPEG if necessary
 * Returns the storage ID from Convex
 */
export async function uploadFile(
  file: File,
  generateUploadUrl: () => Promise<string | null>
): Promise<string> {
  let fileToUpload = file;

  // Convert HEIC files to JPEG before upload
  if (isHeicFile(file)) {
    fileToUpload = await convertHeicToJpeg(file);
  }

  const uploadUrl = await generateUploadUrl();
  if (!uploadUrl) {
    throw new Error("Failed to generate upload URL");
  }

  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": fileToUpload.type,
    },
    body: fileToUpload,
  });

  if (!result.ok) {
    throw new Error("Failed to upload file");
  }

  const { storageId } = await result.json();
  return storageId;
}
