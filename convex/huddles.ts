import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
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
async function getCurrentMember(
  ctx: QueryCtx,
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
    joinedAt: number;
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
  const nextHost = participants.sort((a, b) => a.joinedAt - b.joinedAt)[0];

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

/**
 * Start or join a huddle
 * - If active huddle exists for source → join it
 * - Else → create new huddle + join as host
 *
 * Note: For DMs, sourceId can be either:
 * - conversationId (if already known)
 * - memberId (will be converted to conversationId)
 */
export const startOrJoinHuddle = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    sourceType: v.union(v.literal("channel"), v.literal("dm")),
    sourceId: v.union(v.id("channels"), v.id("conversations"), v.id("members")),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
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
        memberId,
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
          memberId,
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
            memberId,
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
          memberId,
          otherMemberId
        );
        conversationId = actualSourceId;
      }
    }

    // Find active huddle
    const existingHuddle = await findActiveHuddleBySource(
      ctx,
      args.sourceType,
      actualSourceId
    );

    if (existingHuddle) {
      // Join existing huddle
      // Check if already a participant
      const existingParticipant = await ctx.db
        .query("huddleParticipants")
        .withIndex("by_huddle_id_member_id", (q) =>
          q.eq("huddleId", existingHuddle._id).eq("memberId", memberId)
        )
        .unique();

      if (existingParticipant) {
        // Already a participant - if they left, rejoin
        if (existingParticipant.leftAt) {
          await ctx.db.patch(existingParticipant._id, {
            leftAt: undefined,
            joinedAt: Date.now(),
          });
        }
        return existingHuddle._id;
      }

      // Join as new participant
      await ctx.db.insert("huddleParticipants", {
        huddleId: existingHuddle._id,
        memberId,
        joinedAt: Date.now(),
        role: "participant",
      });

      return existingHuddle._id;
    }

    // Create new huddle
    const now = Date.now();
    const huddleId = await ctx.db.insert("huddles", {
      workspaceId: args.workspaceId,
      sourceType: args.sourceType,
      channelId,
      conversationId,
      createdBy: memberId,
      isActive: true,
      createdAt: now,
      startedAt: now,
    });

    // Join as host
    await ctx.db.insert("huddleParticipants", {
      huddleId,
      memberId,
      joinedAt: Date.now(),
      role: "host",
    });

    return huddleId;
  },
});

/**
 * Join a huddle by huddleId
 */
export const joinHuddle = mutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Validate access based on source type
    if (huddle.sourceType === "channel" && huddle.channelId) {
      const hasAccess = await validateChannelAccess(
        ctx,
        memberId,
        huddle.channelId
      );
      if (!hasAccess) {
        throw new Error("No access to channel");
      }
    } else if (huddle.sourceType === "dm" && huddle.conversationId) {
      const hasAccess = await validateConversationAccess(
        ctx,
        memberId,
        huddle.conversationId
      );
      if (!hasAccess) {
        throw new Error("No access to conversation");
      }
    }

    // Check if already a participant
    const existingParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", memberId)
      )
      .unique();

    if (existingParticipant) {
      if (existingParticipant.leftAt) {
        // Rejoin
        await ctx.db.patch(existingParticipant._id, {
          leftAt: undefined,
          joinedAt: Date.now(),
        });
      }
      // Already a participant
      return args.huddleId;
    }

    // Join as new participant
    await ctx.db.insert("huddleParticipants", {
      huddleId: args.huddleId,
      memberId,
      joinedAt: Date.now(),
      role: "participant",
    });

    return args.huddleId;
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

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Find participant record
    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.leftAt) {
      // Not a participant or already left
      return;
    }

    const isHost = participant.role === "host";
    const now = Date.now();

    // Mark as left
    await ctx.db.patch(participant._id, { leftAt: now });

    // Get remaining active participants
    const remainingParticipants = await getActiveParticipants(
      ctx,
      args.huddleId
    );

    if (isHost && remainingParticipants.length > 0) {
      // Promote next host
      await promoteNextHost(ctx, args.huddleId);
    } else if (remainingParticipants.length === 0) {
      // Last participant left - end huddle
      await ctx.db.patch(args.huddleId, {
        isActive: false,
        endedAt: now,
      });
    }
  },
});

/**
 * End a huddle (host only)
 */
export const endHuddle = mutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Check if user is host
    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.role !== "host" || participant.leftAt) {
      throw new Error("Only host can end huddle");
    }

    // End huddle
    await ctx.db.patch(args.huddleId, {
      isActive: false,
      endedAt: Date.now(),
    });
  },
});

/**
 * Get active huddle by source
 *
 * Note: For DMs, sourceId can be either conversationId or memberId
 * If memberId is provided, workspaceId is required to resolve it
 */
export const getActiveHuddleBySource = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    sourceType: v.union(v.literal("channel"), v.literal("dm")),
    sourceId: v.union(v.id("channels"), v.id("conversations"), v.id("members")),
  },
  handler: async (ctx, args) => {
    let actualSourceId: Id<"channels"> | Id<"conversations">;

    if (args.sourceType === "channel") {
      actualSourceId = args.sourceId as Id<"channels">;
    } else {
      // For DMs, try to resolve memberId to conversationId
      const asConversationId = args.sourceId as Id<"conversations">;
      const conversation = await ctx.db.get(asConversationId);

      if (conversation) {
        actualSourceId = asConversationId;
      } else if (args.workspaceId) {
        // It's a memberId - need to find existing conversation
        const memberId = await getCurrentMember(ctx, args.workspaceId);
        if (!memberId) {
          return null;
        }

        const otherMemberId = args.sourceId as Id<"members">;
        // Find existing conversation (don't create in query)
        const existingConversation = await ctx.db
          .query("conversations")
          .filter((q) => q.eq(q.field("workspaceId"), args.workspaceId))
          .filter((q) =>
            q.or(
              q.and(
                q.eq(q.field("memberOneId"), memberId),
                q.eq(q.field("memberTwoId"), otherMemberId)
              ),
              q.and(
                q.eq(q.field("memberOneId"), otherMemberId),
                q.eq(q.field("memberTwoId"), memberId)
              )
            )
          )
          .first();

        if (!existingConversation) {
          // Conversation doesn't exist yet - can't find huddle
          return null;
        }

        actualSourceId = existingConversation._id;
      } else {
        // Can't resolve memberId without workspaceId
        return null;
      }
    }

    const huddle = await findActiveHuddleBySource(
      ctx,
      args.sourceType,
      actualSourceId
    );
    if (!huddle) {
      return null;
    }

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

        return {
          _id: p._id,
          memberId: p.memberId,
          role: p.role,
          joinedAt: p.joinedAt,
          user,
        };
      })
    );

    return participantsWithMembers.filter(Boolean) as Array<{
      _id: Id<"huddleParticipants">;
      memberId: Id<"members">;
      role: "host" | "participant";
      joinedAt: number;
      user: {
        _id: Id<"users">;
        name: string;
        displayName?: string | null;
        fullName?: string | null;
      };
    }>;
  },
});

/**
 * Get my active huddle in a workspace
 */
export const getMyActiveHuddle = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      return null;
    }

    // Find all active participants for this member
    const myParticipants = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_member_id", (q) => q.eq("memberId", memberId))
      .filter((q) => q.eq(q.field("leftAt"), undefined))
      .collect();

    // Find active huddles
    for (const participant of myParticipants) {
      const huddle = await ctx.db.get(participant.huddleId);
      if (
        huddle &&
        huddle.isActive &&
        huddle.workspaceId === args.workspaceId
      ) {
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
          myRole: participant.role,
        };
      }
    }

    return null;
  },
});

/**
 * Get all active huddles in a workspace
 * Used for notifications - returns huddles the user might want to join
 */
export const getActiveHuddlesForWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const memberId = await getCurrentMember(ctx, args.workspaceId);
    if (!memberId) {
      return [];
    }

    // Get all active huddles in the workspace
    const activeHuddles = await ctx.db
      .query("huddles")
      .withIndex("by_workspace_id", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter to only huddles the user has access to
    const accessibleHuddles = [];
    for (const huddle of activeHuddles) {
      let hasAccess = false;

      if (huddle.sourceType === "channel" && huddle.channelId) {
        // Check if user is a member of the channel
        const channelMembership = await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_id_member_id", (q) =>
            q.eq("channelId", huddle.channelId!).eq("memberId", memberId)
          )
          .unique();
        hasAccess = !!channelMembership;
      } else if (huddle.sourceType === "dm" && huddle.conversationId) {
        // Check if user is a participant in the conversation
        const conversation = await ctx.db.get(huddle.conversationId);
        hasAccess =
          !!conversation &&
          (conversation.memberOneId === memberId ||
            conversation.memberTwoId === memberId);
      }

      if (hasAccess) {
        // For DM huddles, get the other member's ID
        let otherMemberId: Id<"members"> | undefined;
        if (huddle.sourceType === "dm" && huddle.conversationId) {
          const conversation = await ctx.db.get(huddle.conversationId);
          if (conversation) {
            // Get the other member (not the current member)
            otherMemberId = conversation.memberOneId === memberId
              ? conversation.memberTwoId
              : conversation.memberOneId;
          }
        }

        accessibleHuddles.push({
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
          otherMemberId, // For DM huddles, the other member's ID
        });
      }
    }

    return accessibleHuddles;
  },
});

/**
 * Send a WebRTC signal (offer, answer, or ICE candidate)
 * Signals are ephemeral and used only for peer connection establishment
 */
export const sendSignal = mutation({
  args: {
    huddleId: v.id("huddles"),
    toMemberId: v.id("members"),
    signal: v.any(), // WebRTC signal object
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      throw new Error("Huddle not found or not active");
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Verify sender is a participant
    const senderParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", memberId)
      )
      .unique();

    if (!senderParticipant || senderParticipant.leftAt) {
      throw new Error("Not a participant in this huddle");
    }

    // Verify receiver is a participant
    const receiverParticipant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", args.toMemberId)
      )
      .unique();

    if (!receiverParticipant || receiverParticipant.leftAt) {
      throw new Error("Target member is not a participant");
    }

    // Insert signal
    await ctx.db.insert("huddleSignals", {
      huddleId: args.huddleId,
      fromMemberId: memberId,
      toMemberId: args.toMemberId,
      signal: args.signal,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get signals for the current member in a huddle
 * Returns signals that are less than 30 seconds old
 */
export const getSignals = query({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle || !huddle.isActive) {
      return [];
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      return [];
    }

    // Get signals sent to this member
    const now = Date.now();
    const maxAge = 30000; // 30 seconds
    const cutoffTime = now - maxAge;

    const signals = await ctx.db
      .query("huddleSignals")
      .withIndex("by_huddle_id_to_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("toMemberId", memberId)
      )
      .filter((q) => q.gte(q.field("createdAt"), cutoffTime))
      .collect();

    // Return signals sorted by creation time
    return signals
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({
        _id: s._id,
        fromMemberId: s.fromMemberId,
        toMemberId: s.toMemberId,
        signal: s.signal,
        createdAt: s.createdAt,
      }));
  },
});

/**
 * Clear old signals for a huddle (cleanup)
 * Signals older than 1 minute are automatically ignored, but this helps with cleanup
 */
export const clearOldSignals = mutation({
  args: {
    huddleId: v.id("huddles"),
  },
  handler: async (ctx, args) => {
    const huddle = await ctx.db.get(args.huddleId);
    if (!huddle) {
      return;
    }

    const memberId = await getCurrentMember(ctx, huddle.workspaceId);
    if (!memberId) {
      throw new Error("Unauthorized");
    }

    // Only host can clear signals
    const participant = await ctx.db
      .query("huddleParticipants")
      .withIndex("by_huddle_id_member_id", (q) =>
        q.eq("huddleId", args.huddleId).eq("memberId", memberId)
      )
      .unique();

    if (!participant || participant.role !== "host" || participant.leftAt) {
      throw new Error("Only host can clear signals");
    }

    // Delete signals older than 1 minute
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    const cutoffTime = now - maxAge;

    const oldSignals = await ctx.db
      .query("huddleSignals")
      .withIndex("by_huddle_id", (q) => q.eq("huddleId", args.huddleId))
      .filter((q) => q.lt(q.field("createdAt"), cutoffTime))
      .collect();

    for (const signal of oldSignals) {
      await ctx.db.delete(signal._id);
    }
  },
});
