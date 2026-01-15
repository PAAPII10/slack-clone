import { NextRequest, NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { logger } from "@/lib/logger";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";

/**
 * Generates LiveKit access tokens for authenticated users
 * Token includes participant identity (memberId) and room permissions
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const isAuthenticated = await isAuthenticatedNextjs();
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
    const { identity, roomName, participantName } = body;

    // Validate required fields
    if (!identity || !roomName) {
      return NextResponse.json(
        { error: "Missing required fields: identity and roomName" },
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

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: identity,
      name: participantName || identity,
    });

    // Grant permissions
    // CanPublish: Can publish audio/video tracks
    // CanSubscribe: Can receive tracks from others
    // CanPublishData: Can send data messages
    // CanPublishSources: Can publish camera, microphone, and screen share
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [
        TrackSource.CAMERA,
        TrackSource.MICROPHONE,
        TrackSource.SCREEN_SHARE,
      ],
      canUpdateOwnMetadata: true,
    });

    // Set token expiration (6 hours) using ttl
    at.ttl = "6h";

    // Generate JWT token
    const token = await at.toJwt();

    logger.info("Generated LiveKit token", {
      roomName,
      identity,
      hasParticipantName: !!participantName,
    });

    // Return token and URL to client
    return NextResponse.json({
      token,
      url: livekitUrl,
    });
  } catch (error) {
    logger.error("Error generating LiveKit token", error as Error, {
      errorType: error instanceof Error ? error.constructor.name : "Unknown",
    });
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
