import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { logger } from "@/lib/logger";

/**
 * PHASE 11: Room Management - Delete/Close Room
 *
 * This API route deletes/closes a LiveKit room.
 *
 * WHY server-side?
 * - Requires API credentials (must be kept secret)
 * - Ensures proper authorization before deletion
 * - Prevents unauthorized room deletion
 *
 * Request body:
 * {
 *   roomName: string (room to delete)
 * }
 *
 * Returns:
 * {
 *   success: boolean
 *   message: string
 * }
 */

export async function POST(request: NextRequest) {
  try {
    // Get environment variables
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    // Validate environment variables
    if (!apiKey || !apiSecret || !livekitUrl) {
      logger.error("Missing LiveKit environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { roomName } = body;

    // Validate required fields
    if (!roomName) {
      return NextResponse.json(
        { error: "Missing required field: roomName" },
        { status: 400 }
      );
    }

    // Validate room name (prevent injection attacks)
    if (!/^[a-zA-Z0-9_-]+$/.test(roomName)) {
      return NextResponse.json(
        {
          error:
            "Invalid room name. Only alphanumeric, underscore, and hyphen allowed",
        },
        { status: 400 }
      );
    }

    // Initialize RoomServiceClient
    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

    // Delete the room
    // This will forcibly disconnect all participants and remove the room
    await roomService.deleteRoom(roomName);

    logger.info("Room deleted successfully", {
      roomName,
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: `Room "${roomName}" has been deleted. All participants have been disconnected.`,
    });
  } catch (error) {
    logger.error("Error deleting room", error as Error, {
      errorType: error instanceof Error ? error.constructor.name : "Unknown",
    });

    // Check if room doesn't exist
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("does not exist"))
    ) {
      return NextResponse.json(
        { error: `Room does not exist` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete room" },
      { status: 500 }
    );
  }
}
