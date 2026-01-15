import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/**
 * Generate a unique room ID for LiveKit
 */
function generateRoomId(options?: {
  prefix?: string;
  length?: number;
}): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

  const length = options?.length ?? 16;
  const prefix = options?.prefix ? `${options.prefix}_` : "";

  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix}${id}`;
}

/**
 * Helper function to get current member
 */
async function getCurrentMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Id<"members"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_id_user_id", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique();

  return member?._id ?? null;
}

/**
 * Helper function to validate channel access
 */
async function validateChannelAccess(
  ctx: QueryCtx | MutationCtx,
  memberId: Id<"members">,
  channelId: Id<"channels">
): Promise<boolean> {
  const channel = await ctx.db.get(channelId);
  if (!channel) {
    return false;
  }

  // Check if member is in the workspace
  const member = await ctx.db.get(memberId);
  if (!member || member.workspaceId !== channel.workspaceId) {
    return false;
  }

  // Check if member is in channelMembers
  const channelMember = await ctx.db
    .query("channelMembers")
    .withIndex("by_channel_id_member_id", (q) =>
      q.eq("channelId", channelId).eq("memberId", memberId)
    )
    .unique();

  return channelMember !== null;
}

/**
 * Helper function to find active channel huddle
 */
async function findActiveChannelHuddle(
  ctx: QueryCtx | MutationCtx,
  channelId: Id<"channels">
) {
  return await ctx.db
    .query("channelHuddles")
    .withIndex("by_channel_id_is_active", (q) =>
      q.eq("channelId", channelId).eq("isActive", true)
    )
    .first();
}

/**
 * Helper function to get active participants (not left)
 */
async function getActiveChannelHuddleParticipants(
  ctx: QueryCtx | MutationCtx,
  channelHuddleId: Id<"channelHuddles">
): Promise<
  Array<{
    _id: Id<"channelHuddleParticipants">;
    memberId: Id<"members">;
    role: "host" | "participant";
    joinedAt?: number;
    isMuted?: boolean;
  }>
> {
  const participants = await ctx.db
    .query("channelHuddleParticipants")
    .withIndex("by_channel_huddle_id_is_active", (q) =>
      q.eq("channelHuddleId", channelHuddleId).eq("isActive", true)
    )
    .filter((q) => q.eq(q.field("leftAt"), undefined))
    .filter((q) => q.eq(q.field("status"), "joined"))
    .collect();

  return participants.map((p) => ({
    _id: p._id,
    memberId: p.memberId,
    role: p.role,
    joinedAt: p.joinedAt,
    isMuted: p.isMuted,
  }));
}

/**
 * Helper function to promote next participant to host
 */
async function promoteNextHost(
  ctx: MutationCtx,
  channelHuddleId: Id<"channelHuddles">
): Promise<Id<"members"> | null> {
  const participants = await getActiveChannelHuddleParticipants(
    ctx,
    channelHuddleId
  );

  if (participants.length === 0) {
    return null;
  }

  // Find first participant (oldest join time) and promote to host
  const nextHost = participants.sort(
    (a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  )[0];

  const participantDoc = await ctx.db.get(nextHost._id);
  if (participantDoc) {
    await ctx.db.patch(nextHost._id, { role: "host" });
  }

  return nextHost.memberId;
}

/**
 * Helper function to populate user with profile
 */
async function populateUser(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  const userProfile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();

  return {
    ...user,
    displayName: userProfile?.displayName,
    fullName: userProfile?.fullName,
    image: user.image,
  };
}

/**
 * Create a new channel huddle
 * Note: One channel can only have one active huddle at a time.
 * If an active huddle exists, the user will be joined to it instead.
 */
export const createChannelHuddle = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.id("channels"),
    startMuted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Validate channel access
    const hasAccess = await validateChannelAccess(
      ctx,
      memberId,
      args.channelId
    );
    if (!hasAccess) {
      throw new Error("No access to channel");
    }

    // Check if there's already an active huddle for this channel
    // One channel = one active huddle
    const existingHuddle = await findActiveChannelHuddle(ctx, args.channelId);
    if (existingHuddle) {
      // Check if user is already a participant
      const existingParticipant = await ctx.db
        .query("channelHuddleParticipants")
        .withIndex("by_channel_huddle_id_member_id", (q) =>
          q.eq("channelHuddleId", existingHuddle._id).eq("memberId", memberId)
        )
        .unique();

      if (existingParticipant) {
        // User is already a participant
        if (!existingParticipant.leftAt) {
          // Already active participant, return existing huddle
          return existingHuddle._id;
        } else {
          // User left before, rejoin them
          await ctx.db.patch(existingParticipant._id, {
            leftAt: undefined,
            joinedAt: Date.now(),
            isMuted: args.startMuted ?? false,
            status: "joined",
            isActive: true,
          });
          return existingHuddle._id;
        }
      } else {
        // User is not a participant, join them to the existing huddle
        await ctx.db.insert("channelHuddleParticipants", {
          channelHuddleId: existingHuddle._id,
          memberId,
          joinedAt: Date.now(),
          role: "participant",
          isMuted: args.startMuted ?? false,
          isActive: true,
          status: "joined",
        });
        return existingHuddle._id;
      }
    }

    // No active huddle exists, create a new one
    const now = Date.now();

    const channelHuddleId = await ctx.db.insert("channelHuddles", {
      channelId: args.channelId,
      workspaceId: args.workspaceId,
      createdBy: memberId,
      createdAt: now,
      startedAt: now,
      status: "created",
      isActive: true,
    });

    if (!channelHuddleId) {
      throw new Error("Failed to create channel huddle");
    }

    // Join as host
    await ctx.db.insert("channelHuddleParticipants", {
      channelHuddleId,
      memberId,
      joinedAt: now,
      role: "host",
      isMuted: args.startMuted ?? false,
      isActive: true,
      status: "joined",
    });

    return channelHuddleId;
  },
});

/**
 * Join an existing channel huddle
 */
export const joinChannelHuddle = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.id("channels"),
    startMuted: v.optional(v.boolean()),
    roomId: v.optional(v.string()),
    huddleId: v.id("channelHuddles"),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Validate channel access
    const hasAccess = await validateChannelAccess(
      ctx,
      memberId,
      args.channelId
    );
    if (!hasAccess) {
      throw new Error("No access to channel");
    }

    const huddle = await ctx.db.get(args.huddleId);

    if (!huddle || huddle.channelId !== args.channelId || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    // Generate or use provided roomId
    const roomId =
      args.roomId ??
      huddle.roomId ??
      generateRoomId({ prefix: "channel_huddle_", length: 20 });

    // Update huddle with roomId if not set
    if (!huddle.roomId) {
      await ctx.db.patch(huddle._id, {
        roomId,
        status: "started",
        isActive: true,
      });
    }

    // Check if already a participant
    const existingParticipant = await ctx.db
      .query("channelHuddleParticipants")
      .withIndex("by_channel_huddle_id_member_id", (q) =>
        q.eq("channelHuddleId", huddle._id).eq("memberId", memberId)
      )
      .unique();

    if (existingParticipant) {
      if (existingParticipant.leftAt) {
        // Rejoin
        await ctx.db.patch(existingParticipant._id, {
          leftAt: undefined,
          joinedAt: Date.now(),
          isMuted: args.startMuted ?? false,
          status: "joined",
          isActive: true,
        });

        // Update huddle status if needed
        if (huddle.status === "created") {
          await ctx.db.patch(huddle._id, {
            status: "started",
            isActive: true,
          });
        }
      }
      return {
        channelHuddleId: huddle._id,
        roomId: huddle.roomId ?? roomId,
      };
    }

    // Join as new participant
    await ctx.db.insert("channelHuddleParticipants", {
      channelHuddleId: huddle._id,
      memberId,
      joinedAt: Date.now(),
      role: "participant",
      isMuted: args.startMuted ?? false,
      isActive: true,
      status: "joined",
    });

    // Update huddle status if needed
    if (huddle.status === "created") {
      await ctx.db.patch(huddle._id, {
        status: "started",
        isActive: true,
      });
    }

    return {
      channelHuddleId: huddle._id,
      roomId: huddle.roomId ?? roomId,
    };
  },
});

/**
 * Leave a channel huddle
 */
export const leaveChannelHuddle = mutation({
  args: {
    channelHuddleId: v.id("channelHuddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.channelHuddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Find participant record
    const participant = await ctx.db
      .query("channelHuddleParticipants")
      .withIndex("by_channel_huddle_id_member_id", (q) =>
        q.eq("channelHuddleId", args.channelHuddleId).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.leftAt) {
      const participantCount = await ctx.db
        .query("channelHuddleParticipants")
        .withIndex("by_channel_huddle_id", (q) =>
          q.eq("channelHuddleId", args.channelHuddleId)
        )
        .filter((q) => q.eq(q.field("leftAt"), undefined))
        .filter((q) => q.eq(q.field("status"), "joined"))
        .collect();
      return {
        channelHuddleId: args.channelHuddleId,
        participantCount: participantCount.length,
        roomId: huddle.roomId,
      };
    }

    const isHost = participant.role === "host";

    const now = Date.now();

    // Mark as left
    await ctx.db.patch(participant._id, {
      leftAt: now,
      isActive: false,
      status: "left",
    });

    // Get remaining active participants
    const remainingParticipants = await getActiveChannelHuddleParticipants(
      ctx,
      args.channelHuddleId
    );

    if (isHost && remainingParticipants.length > 0) {
      // Promote next host
      await promoteNextHost(ctx, args.channelHuddleId);
    } else if (remainingParticipants.length === 0) {
      // No participants left, end the huddle
      await ctx.db.patch(args.channelHuddleId, {
        status: "ended",
        endedAt: now,
        isActive: false,
      });
    }
    const participantCount = await ctx.db
      .query("channelHuddleParticipants")
      .withIndex("by_channel_huddle_id", (q) =>
        q.eq("channelHuddleId", args.channelHuddleId)
      )
      .filter((q) => q.eq(q.field("leftAt"), undefined))
      .filter((q) => q.eq(q.field("status"), "joined"))
      .collect();
    return {
      channelHuddleId: args.channelHuddleId,
      roomId: huddle.roomId,
      participantCount: participantCount.length,
    };
  },
});

/**
 * Update participant mute status
 */
export const updateChannelHuddleMuteStatus = mutation({
  args: {
    channelHuddleId: v.id("channelHuddles"),
    isMuted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.channelHuddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Find participant record
    const participant = await ctx.db
      .query("channelHuddleParticipants")
      .withIndex("by_channel_huddle_id_member_id", (q) =>
        q.eq("channelHuddleId", args.channelHuddleId).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.leftAt) {
      throw new Error("Not an active participant");
    }

    // Update mute status
    await ctx.db.patch(participant._id, {
      isMuted: args.isMuted,
    });
  },
});

/**
 * Get active channel huddle for a channel
 */
export const getActiveChannelHuddle = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveChannelHuddle(ctx, args.channelId);
    if (!huddle) {
      return null;
    }

    return huddle;
  },
});

/**
 * Get active channel huddle with participant count
 */
export const getActiveChannelHuddleWithCount = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveChannelHuddle(ctx, args.channelId);
    if (!huddle) {
      return null;
    }

    // Get count of joined participants
    const participants = await getActiveChannelHuddleParticipants(
      ctx,
      huddle._id
    );

    return {
      channelHuddleId: huddle._id,
      participantCount: participants.length,
    };
  },
});

/**
 * Get channel huddle participants
 */
export const getChannelHuddleParticipants = query({
  args: {
    channelHuddleId: v.id("channelHuddles"),
  },
  handler: async (ctx, args) => {
    const participants = await getActiveChannelHuddleParticipants(
      ctx,
      args.channelHuddleId
    );

    // Populate member and user information
    const participantsWithMembers = await Promise.all(
      participants.map(async (p) => {
        const member = await ctx.db.get(p.memberId);
        if (!member) {
          return null;
        }

        const user = await populateUser(ctx, member.userId);
        if (!user) {
          return null;
        }

        // Get full participant record
        const fullParticipant = await ctx.db.get(p._id);

        return {
          _id: p._id,
          memberId: p.memberId,
          role: p.role,
          joinedAt: p.joinedAt,
          isMuted: fullParticipant?.isMuted ?? false,
          isActive: fullParticipant?.isActive ?? true,
          user,
          member,
        };
      })
    );

    return participantsWithMembers.filter(Boolean) as Array<{
      _id: Id<"channelHuddleParticipants">;
      memberId: Id<"members">;
      role: "host" | "participant";
      joinedAt?: number;
      isMuted: boolean;
      isActive: boolean;
      user: {
        _id: Id<"users">;
        name: string;
        displayName?: string | null;
        fullName?: string | null;
        image?: string | null;
      };
      member: {
        _id: Id<"members">;
        workspaceId: Id<"workspaces">;
        userId: Id<"users">;
        role: "admin" | "member";
      };
    }>;
  },
});

/**
 * Get current user's channel huddle
 */
export const getCurrentUserChannelHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      return null;
    }

    const huddle = await findActiveChannelHuddle(ctx, args.channelId);
    if (!huddle) {
      return null;
    }

    // Check if user is a participant
    const participant = await ctx.db
      .query("channelHuddleParticipants")
      .withIndex("by_channel_huddle_id_member_id", (q) =>
        q.eq("channelHuddleId", huddle._id).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.leftAt) {
      return null;
    }

    const participants = await getActiveChannelHuddleParticipants(
      ctx,
      huddle._id
    );
    const populatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const member = await ctx.db.get(participant.memberId);
        if (!member) return null;
        const user = await populateUser(ctx, member.userId);
        if (!user) {
          return null;
        }
        // Get full participant record to include status
        const fullParticipant = await ctx.db.get(participant._id);
        return {
          ...fullParticipant,
          user: user,
          member,
        };
      })
    );
    return {
      ...huddle,
      participants: populatedParticipants,
    };
  },
});

/**
 * Close channel huddle when no participants
 */
export const closeChannelHuddleWhenNoParticipants = mutation({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveChannelHuddle(ctx, args.channelId);
    if (!huddle) {
      throw new Error("Huddle not found");
    }

    await ctx.db.patch(huddle._id, {
      status: "ended",
      endedAt: Date.now(),
      isActive: false,
    });

    return huddle._id;
  },
});

/**
 * Update room ID for channel huddle
 */
export const updateChannelHuddleRoomId = mutation({
  args: {
    channelHuddleId: v.id("channelHuddles"),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.channelHuddleId);
    if (!huddle) {
      throw new Error("Huddle not found");
    }

    await ctx.db.patch(args.channelHuddleId, {
      roomId: args.roomId,
      status: "started",
      isActive: true,
    });

    return args.channelHuddleId;
  },
});
