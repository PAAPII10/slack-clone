import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";

/**
 * Phase 4: LiveKit Token API Route
 *
 * Generates LiveKit access tokens for authenticated users
 * Token includes participant identity (memberId) and room permissions
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const isAuthenticated = await isAuthenticatedNextjs();
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const roomName = searchParams.get("room");
    const participantIdentity = searchParams.get("identity"); // memberId

    // Validate required parameters
    if (!roomName) {
      return NextResponse.json(
        { error: "Missing room parameter" },
        { status: 400 }
      );
    }

    if (!participantIdentity) {
      return NextResponse.json(
        { error: "Missing identity parameter" },
        { status: 400 }
      );
    }

    // Get LiveKit credentials from environment variables
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret) {
      console.error("LiveKit API credentials not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (!serverUrl) {
      console.error("LiveKit server URL not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create access token
    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: "1h", // Token valid for 1 hour
    });

    // Add grant for room permissions
    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    });

    // Generate JWT token
    const jwt = await accessToken.toJwt();

    return NextResponse.json({
      token: jwt,
      serverUrl,
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
