import { NextRequest, NextResponse } from "next/server";
// @ts-expect-error - heic-convert doesn't have TypeScript types
import convert from "heic-convert";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * API route to convert HEIC images to JPEG server-side
 * This ensures HEIC files are never persisted - only converted formats are stored
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Verify it's a HEIC file
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif");

    if (!isHeic) {
      return NextResponse.json(
        { error: "File is not a HEIC image" },
        { status: 400 }
      );
    }

    // Convert HEIC to JPEG using heic-convert
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Convert HEIC to JPEG
    const outputBuffer = (await convert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.9,
    })) as Buffer;

    // Return the converted image as base64 data URL for the client to handle
    const base64 = outputBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      contentType: "image/jpeg",
      size: outputBuffer.length,
    });
  } catch (error) {
    console.error("Error converting HEIC image:", error);
    return NextResponse.json(
      {
        error: "Failed to convert HEIC image",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
