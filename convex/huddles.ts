import { v } from "convex/values";
import {
  mutation,
  query,
  QueryCtx,
  MutationCtx,
  internalMutation,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

/**
 * Calculate huddle duration in milliseconds
 * @param startedAt - When the huddle started
 * @param endedAt - When the huddle ended (undefined if still active)
 * @returns Duration in milliseconds
 */
function calculateDuration(
  startedAt: number,
  endedAt: number | undefined
): number {
  const endTime = endedAt ?? Date.now();
  return endTime - startedAt;
}

/**
 * Helper function to get current member
 */
async function getCurrentMember(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
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

  return member;
}

/**
 * Helper function to validate channel access
 */
async function validateChannelAccess(
  ctx: QueryCtx,
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

  // For public channels, check if member is in channelMembers
  // For private channels, they must be in channelMembers
  const channelMember = await ctx.db
    .query("channelMembers")
    .withIndex("by_channel_id_member_id", (q) =>
      q.eq("channelId", channelId).eq("memberId", memberId)
    )
    .unique();

  return channelMember !== null;
}

/**
 * Helper function to validate conversation access
 */
async function validateConversationAccess(
  ctx: QueryCtx,
  memberId: Id<"members">,
  conversationId: Id<"conversations">
): Promise<boolean> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    return false;
  }

  // Check if member is in the workspace
  const member = await ctx.db.get(memberId);
  if (!member || member.workspaceId !== conversation.workspaceId) {
    return false;
  }

  // Check if member is part of the conversation
  return (
    conversation.memberOneId === memberId ||
    conversation.memberTwoId === memberId
  );
}

/**
 * Helper function to find active huddle by source
 */
/**
 * Helper function to find active huddle by source
 */
async function findConversationActiveHuddleByMemberId(
  ctx: QueryCtx,
  memberId: Id<"members">
) {
  const huddleParticipant = await ctx.db
    .query("huddleParticipants")
    .withIndex("by_member_id", (q) => q.eq("memberId", memberId))
    .filter((q) => q.eq(q.field("isActive"), true))
    .filter((q) => q.eq(q.field("status"), "joined"))
    .first();

  if (!huddleParticipant) {
    return null;
  }

  const huddle = await ctx.db.get(huddleParticipant.huddleId);
  if (!huddle) {
    return null;
  }

  return huddle;
}

/**
 * Helper function to find active huddle by source
 */
async function findActiveHuddleBySource(
  ctx: QueryCtx,
  sourceType: "channel" | "dm",
  sourceId: Id<"channels"> | Id<"conversations">
) {
  if (sourceType === "channel") {
    const channelId = sourceId as Id<"channels">;
    return await ctx.db
      .query("huddles")
      .withIndex("by_channel_id", (q) => q.eq("channelId", channelId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .filter((q) => q.eq(q.field("sourceType"), "channel"))
      .first();
  } else {
    const conversationId = sourceId as Id<"conversations">;
    return await ctx.db
      .query("huddles")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", conversationId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .filter((q) => q.eq(q.field("sourceType"), "dm"))
      .first();
  }
}

/**
 * Helper function to get active participants (not left)
 * Works with both QueryCtx and MutationCtx
 */
async function getActiveParticipants(
  ctx: QueryCtx | MutationCtx,
  huddleId: Id<"huddles">
): Promise<
  Array<{
    _id: Id<"huddleParticipants">;
    memberId: Id<"members">;
    role: "host" | "participant";
    joinedAt?: number;
    isMuted?: boolean;
  }>
> {
  const participants = await ctx.db
    .query("huddleParticipants")
    .withIndex("by_huddle_id", (q) => q.eq("huddleId", huddleId))
    .filter((q) => q.eq(q.field("leftAt"), undefined))
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
  huddleId: Id<"huddles">
): Promise<Id<"members"> | null> {
  const participants = await getActiveParticipants(ctx, huddleId);

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
 * Helper function to get or create conversation from memberId
 */
async function getOrCreateConversation(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  currentMemberId: Id<"members">,
  otherMemberId: Id<"members">
): Promise<Id<"conversations">> {
  // Find existing conversation
  const existingConversation = await ctx.db
    .query("conversations")
    .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
    .filter((q) =>
      q.or(
        q.and(
          q.eq(q.field("memberOneId"), currentMemberId),
          q.eq(q.field("memberTwoId"), otherMemberId)
        ),
        q.and(
          q.eq(q.field("memberOneId"), otherMemberId),
          q.eq(q.field("memberTwoId"), currentMemberId)
        )
      )
    )
    .first();

  if (existingConversation) {
    return existingConversation._id;
  }

  // Create new conversation
  const conversationId = await ctx.db.insert("conversations", {
    workspaceId,
    memberOneId: currentMemberId,
    memberTwoId: otherMemberId,
  });

  // Initialize read state for both participants
  const now = Date.now();
  await ctx.db.insert("conversationReadState", {
    memberId: currentMemberId,
    conversationId,
    lastReadAt: now,
    unreadCount: 0,
  });
  await ctx.db.insert("conversationReadState", {
    memberId: otherMemberId,
    conversationId,
    lastReadAt: now,
    unreadCount: 0,
  });

  return conversationId;
}

async function getConversationMembers(
  ctx: QueryCtx,
  conversationId: Id<"conversations">
): Promise<Array<Id<"members">>> {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("by_id", (q) => q.eq("_id", conversationId))
    .first();
  if (!conversation) {
    return [];
  }
  return [conversation.memberOneId, conversation.memberTwoId];
}

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
 * Create a huddle without a room
 */
export const createHuddleWithoutRoom = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    sourceType: v.union(v.literal("channel"), v.literal("dm")),
    sourceId: v.union(v.id("channels"), v.id("conversations"), v.id("members")),
    startMuted: v.optional(v.boolean()), // Whether to join with mic muted
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    // Before starting a new huddle, mark all existing huddle participants as left
    const existingParticipants = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .filter((q) => q.eq(q.field("leftAt"), undefined))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "joined"),
          q.eq(q.field("status"), "waiting"),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    const now = Date.now();
    for (const participant of existingParticipants) {
      const huddle = await ctx.db.get(participant.huddleId);
      if (huddle?.isActive) {
        const count = await ctx.db
          .query("huddleParticipants")
          .withIndex("by_huddle_id", (q) => q.eq("huddleId", huddle._id))
          .filter((q) => q.eq(q.field("leftAt"), undefined))
          .filter((q) => q.eq(q.field("status"), "joined"))
          .collect();
        if (count.length === 1) {
          await ctx.db.patch(huddle._id, {
            status: "ended",
            endedAt: now,
            isActive: false,
          });
        }
      }
      await ctx.db.patch(participant._id, {
        status: "left",
        isActive: true,
        leftAt: participant.leftAt ?? now,
      });

      // TODO: CHECK LOGIC here do i need to make active huddle id to undefined?
    }

    let actualSourceId: Id<"channels"> | Id<"conversations">;
    let channelId: Id<"channels"> | undefined;
    let conversationId: Id<"conversations"> | undefined;

    // Handle source ID conversion for DMs
    if (args.sourceType === "channel") {
      actualSourceId = args.sourceId as Id<"channels">;
      channelId = actualSourceId;

      // Validate access
      const hasAccess = await validateChannelAccess(
        ctx,
        member._id,
        actualSourceId
      );
      if (!hasAccess) {
        throw new Error("No access to channel");
      }
    } else {
      // For DMs, sourceId might be a memberId or conversationId
      // Try to get as conversationId first and validate access
      const asConversationId = args.sourceId as Id<"conversations">;
      const conversation = await ctx.db.get(asConversationId);

      if (conversation && conversation.workspaceId === args.workspaceId) {
        // Check if member has access to this conversation
        const hasAccess = await validateConversationAccess(
          ctx,
          member._id,
          asConversationId
        );

        if (hasAccess) {
          // It's a valid conversationId and member has access
          actualSourceId = asConversationId;
          conversationId = actualSourceId;
        } else {
          // Conversation exists but member doesn't have access
          // Treat it as a memberId instead
          const otherMemberId = args.sourceId as Id<"members">;
          const otherMember = await ctx.db.get(otherMemberId);
          if (!otherMember || otherMember.workspaceId !== args.workspaceId) {
            throw new Error("Member not found in workspace");
          }

          actualSourceId = await getOrCreateConversation(
            ctx,
            args.workspaceId,
            member._id,
            otherMemberId
          );
          conversationId = actualSourceId;
        }
      } else {
        // It's a memberId - get or create conversation
        const otherMemberId = args.sourceId as Id<"members">;
        const otherMember = await ctx.db.get(otherMemberId);
        if (!otherMember || otherMember.workspaceId !== args.workspaceId) {
          throw new Error("Member not found in workspace");
        }

        actualSourceId = await getOrCreateConversation(
          ctx,
          args.workspaceId,
          member._id,
          otherMemberId
        );
        conversationId = actualSourceId;
      }
    }

    const existingHuddle = await ctx.db
      .query("huddles")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .filter((q) => q.eq(q.field("sourceType"), args.sourceType))
      .filter((q) => q.eq(q.field("channelId"), channelId))
      .filter((q) => q.eq(q.field("conversationId"), conversationId))
      .first();

    if (!existingHuddle) {
      // Create new huddle
      const huddleId = await ctx.db.insert("huddles", {
        workspaceId: args.workspaceId,
        sourceType: args.sourceType,
        channelId,
        conversationId,
        createdBy: member._id,
        createdAt: now,
        startedAt: now,
        status: "created",
        isActive: true,
      });

      if (!huddleId) {
        throw new Error("Failed to create new huddle");
      }

      // Join as host
      if (args.sourceType === "dm") {
        const members = await getConversationMembers(
          ctx,
          actualSourceId as Id<"conversations">
        );

        for (const mId of members) {
          const memberDetails = await ctx.db.get(mId);

          if (memberDetails?.activeHuddleId) {
            throw new Error("Member already has an active huddle");
          }
          // Join as new participant
          await ctx.db.insert("huddleParticipants", {
            huddleId,
            memberId: mId,
            role: mId === member._id ? "host" : "participant",
            isMuted: args.startMuted ?? false,
            isActive: true,
            status: "waiting",
          });
        }
      }

      if (args.sourceType === "channel") {
        const memberDetails = await ctx.db.get(member._id);

        if (memberDetails?.activeHuddleId) {
          throw new Error("Member already has an active huddle");
        }

        const existingParticipants = await ctx.db
          .query("huddleParticipants")
          .withIndex("by_huddle_id", (q) => q.eq("huddleId", huddleId))
          .collect();

        // Join as new participant
        await ctx.db.insert("huddleParticipants", {
          huddleId,
          memberId: member._id,
          role: existingParticipants.length === 0 ? "host" : "participant",
          isMuted: args.startMuted ?? false,
          isActive: true,
          status: "waiting",
        });
      }

      return huddleId;
    }

    if (args.sourceType === "dm") {
      const members = await getConversationMembers(
        ctx,
        actualSourceId as Id<"conversations">
      );

      for (const mId of members) {
        const memberDetails = await ctx.db.get(mId);

        if (memberDetails?.activeHuddleId) {
          throw new Error("Member already has an active huddle");
        }
        // Join as new participant
        await ctx.db.insert("huddleParticipants", {
          huddleId: existingHuddle._id,
          memberId: mId,
          role: mId === member._id ? "host" : "participant",
          isMuted: args.startMuted ?? false,
          isActive: true,
          status: "waiting",
        });
      }
    }

    if (args.sourceType === "channel") {
      const memberDetails = await ctx.db.get(member._id);

      if (memberDetails?.activeHuddleId) {
        throw new Error("Member already has an active huddle");
      }

      const existingParticipant = await ctx.db
        .query("huddleParticipants")
        .withIndex("by_huddle_id", (q) => q.eq("huddleId", existingHuddle._id))
        .collect();

      // Join as new participant
      await ctx.db.insert("huddleParticipants", {
        huddleId: existingHuddle._id,
        memberId: member._id,
        role: existingParticipant.length === 0 ? "host" : "participant",
        isMuted: args.startMuted ?? false,
        isActive: true,
        status: "waiting",
      });
    }
    return existingHuddle._id;
  },
});

/**
 * Join a huddle with a room
 */
export const joinHuddleWithRoom = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) {
      throw new Error("Unauthorized");
    }

    const huddle = await ctx.db.get(args.huddleId);

    if (!huddle) {
      throw new Error("Huddle not found");
    }

    if (huddle.sourceType === "channel" && huddle.channelId) {
      const hasAccess = await validateChannelAccess(
        ctx,
        member._id,
        huddle.channelId
      );
      if (!hasAccess) {
        throw new Error("No access to channel");
      }
    }

    if (huddle.sourceType === "dm" && huddle.conversationId) {
      const hasAccess = await validateConversationAccess(
        ctx,
        member._id,
        huddle.conversationId
      );
      if (!hasAccess) {
        throw new Error("No access to conversation");
      }
    }

    const existingParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", member._id)
      )
      .unique();

    const roomId =
      huddle.roomId ?? generateRoomId({ prefix: "huddle_", length: 20 });

    if (existingParticipant) {
      await ctx.db.patch(args.huddleId, {
        roomId,
        status: "started",
        isActive: true,
      });

      await ctx.db.patch(existingParticipant._id, {
        leftAt: undefined,
        status: "joined",
        joinedAt: Date.now(),
      });

      await ctx.db.patch(member._id, {
        activeHuddleId: args.huddleId,
      });
    } else {
      await ctx.db.insert("huddleParticipants", {
        huddleId: args.huddleId,
        memberId: member._id,
        role: "participant",
        isMuted: false,
        isActive: true,
        status: "joined",
        joinedAt: Date.now(),
        leftAt: undefined,
      });

      await ctx.db.patch(member._id, {
        activeHuddleId: args.huddleId,
      });
    }

    return {
      huddleId: args.huddleId,
      roomId,
    };
  },
});

/**
 * Update participant mute status
 */
export const updateMuteStatus = mutation({
  args: {
    huddleId: v.id("huddles"),
    isMuted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const member = await getCurrentMember(ctx, huddle.workspaceId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    // Find participant record
    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", member._id)
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
 * Leave a huddle
 * - Set leftAt timestamp
 * - If host leaves and others exist → promote next member
 * - If last participant leaves → end huddle
 */
export const leaveHuddle = mutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const member = await getCurrentMember(ctx, huddle.workspaceId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    // Find participant record
    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", member._id)
      )
      .unique();

    if (!participant || participant.leftAt) {
      // Not a participant or already left
      return;
    }

    const isHost = participant.role === "host";
    const now = Date.now();

    // Mark as left
    await ctx.db.patch(participant._id, {
      leftAt: now,
      isActive: false,
      status: "left",
    });

    await ctx.db.patch(member._id, {
      activeHuddleId: undefined,
    });

    // Get remaining active participants
    const remainingParticipants = await getActiveParticipants(
      ctx,
      args.huddleId
    );

    // For 1-on-1 DM huddles, end huddle immediately
    if (huddle.sourceType === "dm") {
      if (remainingParticipants.length === 0) {
        await ctx.db.patch(args.huddleId, {
          status: "ended",
          endedAt: now,
          isActive: false,
        });
      }
    } else {
      // For channel huddles, use normal behavior
      if (isHost && remainingParticipants.length > 0) {
        // Promote next host
        await promoteNextHost(ctx, args.huddleId);
      } else if (remainingParticipants.length === 0) {
        await ctx.db.patch(args.huddleId, {
          status: "ended",
          endedAt: now,
          isActive: false,
        });
      }
    }
    return {
      huddleId: args.huddleId,
      roomId: huddle.roomId,
      participantsCount: remainingParticipants.length,
    };
  },
});

/**
 * Decline an incoming huddle invitation
 * Sets hungup: true and schedules deletion after 20 seconds
 */
export const declineHuddle = mutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle) {
      throw new Error("Huddle not found");
    }

    const member = await getCurrentMember(ctx, huddle.workspaceId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", member._id)
      )
      .unique();

    if (!participant) {
      throw new Error("Not a participant in this huddle");
    }

    await ctx.db.patch(participant._id, {
      status: "declined",
      leftAt: now,
      isActive: false,
    });

    await ctx.db.patch(member._id, {
      activeHuddleId: undefined,
    });

    const remainingParticipants = await getActiveParticipants(
      ctx,
      args.huddleId
    );

    if (remainingParticipants.length === 0) {
      await ctx.db.patch(args.huddleId, {
        status: "ended",
        endedAt: now,
        isActive: false,
      });
    }

    return args.huddleId;
  },
});

/**
 * Internal mutation to delete a huddle and all its data
 * Called by scheduler after 20 seconds when huddle is declined
 */
export const deleteHuddleData = internalMutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    // Delete all participants for this huddle
    const allParticipants = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id", (q) => q.eq("huddleId", args.huddleId))
      .collect();

    for (const participant of allParticipants) {
      await ctx.db.delete(participant._id);
    }

    // Delete the huddle itself
    await ctx.db.delete(args.huddleId);
  },
});

/**
 * Get active huddle by source
 *
 * Note: For DMs, sourceId can be either conversationId or memberId
 * If memberId is provided, workspaceId is required to resolve it
 */
export const getCurrentMemberActiveHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member || !member.activeHuddleId) {
      return null;
    }

    const huddle = await ctx.db.get(member.activeHuddleId);

    if (!huddle) {
      return null;
    }

    const participants = await getActiveParticipants(ctx, huddle._id);
    const populatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const member = await ctx.db.get(participant.memberId);
        if (!member) return null;
        const user = await populateUser(ctx, member.userId);
        if (!member) {
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
      _id: huddle._id,
      workspaceId: huddle.workspaceId,
      sourceType: huddle.sourceType,
      channelId: huddle.channelId,
      conversationId: huddle.conversationId,
      createdBy: huddle.createdBy,
      isActive: huddle.isActive,
      createdAt: huddle.createdAt,
      startedAt: huddle.startedAt,
      endedAt: huddle.endedAt,
      duration: calculateDuration(huddle.startedAt, huddle.endedAt),
      status: huddle.status,
      roomId: huddle.roomId,
      participants: populatedParticipants,
    };
  },
});

/**
 * Check if a huddle is hungup (by ID)
 * Used to detect when a call was declined
 */
export const getHuddleByMemberId = query({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const huddle = await findConversationActiveHuddleByMemberId(
      ctx,
      args.memberId
    );
    if (!huddle) {
      return null;
    }
    return huddle;
  },
});

/**
 * Get huddle by ID
 */
export const getHuddleById = query({
  args: {
    id: v.id("huddles"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) return null;

    const huddle = await ctx.db.get(args.id);

    if (!huddle) return null;

    return huddle;
  },
});

export const getActiveHuddleByChannelId = query({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) {
      return null;
    }

    const huddle = await findActiveHuddleBySource(
      ctx,
      "channel",
      args.channelId
    );

    if (!huddle) {
      return null;
    }

    return huddle;
  },
});

/**
 * Get huddle by ID
 */
export const getCurrentUserHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) {
      return null;
    }

    const huddle = await findConversationActiveHuddleByMemberId(
      ctx,
      member._id
    );
    if (!huddle) {
      return null;
    }
    const participants = await getActiveParticipants(ctx, huddle._id);
    const populatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const member = await ctx.db.get(participant.memberId);
        if (!member) return null;
        const user = await populateUser(ctx, member.userId);
        if (!member) {
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
 * Get huddle by ID
 */
export const getCurrentUserChannelHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
    huddleId: v.id("huddles"),
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) {
      return null;
    }

    const huddle = await ctx.db.get(args.huddleId);

    if (!huddle) {
      return null;
    }

    const participants = await getActiveParticipants(ctx, huddle._id);
    const populatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const member = await ctx.db.get(participant.memberId);
        if (!member) return null;
        const user = await populateUser(ctx, member.userId);
        if (!member) {
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
    image: user.image, // Include image field
  };
}

/**
 * Get huddle participants (active only, excluding those who left)
 */
export const getHuddleParticipants = query({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const participants = await getActiveParticipants(ctx, args.huddleId);

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

        // Get full participant record to include mute status
        const fullParticipant = await ctx.db.get(p._id);

        return {
          _id: p._id,
          memberId: p.memberId,
          role: p.role,
          joinedAt: p.joinedAt,
          isMuted: fullParticipant?.isMuted ?? false,
          isActive: fullParticipant?.isActive ?? true,
          user,
        };
      })
    );

    return participantsWithMembers.filter(Boolean) as Array<{
      _id: Id<"huddleParticipants">;
      memberId: Id<"members">;
      role: "host" | "participant";
      joinedAt: number;
      isMuted: boolean;
      isActive: boolean;
      user: {
        _id: Id<"users">;
        name: string;
        displayName?: string | null;
        fullName?: string | null;
        image?: string | null;
      };
    }>;
  },
});

/**
 * Get my active huddle in a workspace
 */
export const getMyActiveHuddleByChannelId = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveHuddleBySource(
      ctx,
      "channel",
      args.channelId
    );
    if (!huddle) {
      return null;
    }

    return huddle;
  },
});

/**
 * Get active huddle for a channel with participant count
 * Used to display "Join" button with member count in channel header
 */
export const getActiveChannelHuddleWithCount = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);

    if (!channel) {
      return null;
    }

    const huddle = await findActiveHuddleBySource(
      ctx,
      "channel",
      args.channelId
    );

    if (!huddle) {
      return null;
    }

    // Get count of joined participants (status === "joined" and leftAt is undefined)
    const participants = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id", (q) => q.eq("huddleId", huddle._id))
      .filter((q) => q.eq(q.field("status"), "joined"))
      .filter((q) => q.eq(q.field("leftAt"), undefined))
      .collect();

    return {
      huddleId: huddle._id,
      participantCount: participants.length,
    };
  },
});

// WebRTC signaling functions removed - sendSignal, getSignals, clearOldSignals
// Signaling will be handled by the media solution implementation

export const getIncomingHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);
    if (!member) {
      return null;
    }

    const huddleParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .filter((q) => q.eq(q.field("status"), "waiting"))
      .first();

    if (!huddleParticipant) {
      return null;
    }

    const huddle = await ctx.db.get(huddleParticipant.huddleId);
    if (!huddle) {
      return null;
    }

    // Only return DM huddles that are in "attempted" status (not started yet)
    // and belong to the correct workspace
    // Skip channel huddles - no notifications for channel huddles
    if (
      huddle.status !== "started" ||
      huddle.workspaceId !== args.workspaceId ||
      huddle.sourceType !== "dm"
    ) {
      return null;
    }

    const participants = await getActiveParticipants(ctx, huddle._id);

    // For DM huddles, find the other member ID (the caller)
    let otherMemberId: Id<"members"> | undefined;
    if (huddle.sourceType === "dm" && huddle.conversationId) {
      const conversation = await ctx.db.get(huddle.conversationId);
      if (conversation) {
        // Find the other member in the conversation
        otherMemberId =
          conversation.memberOneId === member._id
            ? conversation.memberTwoId
            : conversation.memberOneId;
      }
    }

    return {
      ...huddle,
      participants,
      otherMemberId, // For DM huddles, this is the other member (caller)
    };
  },
});

export const joinHuddleByHuddleId = mutation({
  args: {
    huddleId: v.id("huddles"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const member = await getCurrentMember(ctx, args.workspaceId);

    if (!member) {
      throw new Error("Unauthorized");
    }

    const huddle = await ctx.db.get(args.huddleId);

    if (!huddle) {
      throw new Error("Huddle not found");
    }

    if (huddle.workspaceId !== args.workspaceId) {
      throw new Error("Huddle not in workspace");
    }

    const huddleParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", member._id)
      )
      .unique();

    if (!huddleParticipant) {
      throw new Error("Not a participant in this huddle");
    }

    await ctx.db.patch(huddleParticipant._id, {
      leftAt: undefined,
      joinedAt: Date.now(),
      status: "joined",
      isActive: true,
    });

    return args.huddleId;
  },
});

export const closeChannelHuddleWhenNoParticipants = mutation({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveHuddleBySource(
      ctx,
      "channel",
      args.channelId
    );
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

export const getActiveChannelHuddleParticipants = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const huddle = await findActiveHuddleBySource(
      ctx,
      "channel",
      args.channelId
    );

    if (!huddle || !huddle.isActive) {
      return { participants: [], huddleId: null };
    }

    const participants = await getActiveParticipants(ctx, huddle._id);

    if (!participants) {
      return { participants: [], huddleId: huddle._id };
    }

    const populatedParticipants = await Promise.all(
      participants.map(async (participant) => {
        const member = await ctx.db.get(participant.memberId);
        if (!member) return null;
        const user = await populateUser(ctx, member.userId);
        if (!user) return null;
        return { ...participant, user };
      })
    );

    return {
      participants: populatedParticipants.filter(
        (p): p is NonNullable<typeof p> => p !== null
      ),
      huddleId: huddle._id,
    };
  },
});
