import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

const getMember = async (
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">
) => {
  return ctx.db
    .query("members")
    .withIndex("by_workspace_id_user_id", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique();
};

/**
 * Get or create read state for a member and channel
 */
async function getOrCreateReadState(
  ctx: MutationCtx,
  memberId: Id<"members">,
  channelId: Id<"channels">
) {
  const existing = await ctx.db
    .query("channelReadState")
    .withIndex("by_member_id_channel_id", (q) =>
      q.eq("memberId", memberId).eq("channelId", channelId)
    )
    .unique();

  if (existing) {
    return existing;
  }

  // Create new read state - member just joined, so all existing messages are considered read
  // We'll set lastReadAt to now, so only future messages will be unread
  const now = Date.now();
  const readStateId = await ctx.db.insert("channelReadState", {
    memberId,
    channelId,
    lastReadAt: now,
    unreadCount: 0,
  });

  return await ctx.db.get(readStateId);
}

/**
 * Get or create read state for a member and conversation
 */
async function getOrCreateConversationReadState(
  ctx: MutationCtx,
  memberId: Id<"members">,
  conversationId: Id<"conversations">
) {
  const existing = await ctx.db
    .query("conversationReadState")
    .withIndex("by_member_id_conversation_id", (q) =>
      q.eq("memberId", memberId).eq("conversationId", conversationId)
    )
    .unique();

  if (existing) {
    return existing;
  }

  // Create new read state - all existing messages are considered read
  const now = Date.now();
  const readStateId = await ctx.db.insert("conversationReadState", {
    memberId,
    conversationId,
    lastReadAt: now,
    unreadCount: 0,
  });

  return await ctx.db.get(readStateId);
}

/**
 * Increment unread count for all channel members except the sender
 * Called when a new message is created
 */
export const incrementUnread = mutation({
  args: {
    channelId: v.id("channels"),
    messageId: v.id("messages"),
    senderMemberId: v.id("members"),
    activeMemberIds: v.optional(v.array(v.id("members"))),
  },
  handler: async (ctx, args) => {
    // Get all channel members
    const channelMembers = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
      .collect();

    const activeMemberSet = new Set(args.activeMemberIds || []);

    // Increment unread count for each member (except sender and active members)
    for (const channelMember of channelMembers) {
      // Skip sender
      if (channelMember.memberId === args.senderMemberId) {
        continue;
      }

      // Skip if channel is currently active for this member
      if (activeMemberSet.has(channelMember.memberId)) {
        continue;
      }

      // Get or create read state
      const readState = await getOrCreateReadState(
        ctx,
        channelMember.memberId,
        args.channelId
      );

      if (readState) {
        // Increment unread count
        await ctx.db.patch(readState._id, {
          unreadCount: readState.unreadCount + 1,
        });
      }
    }
  },
});

/**
 * Mark a channel as read for a member
 * Called when user opens a channel
 */
export const markChannelAsRead = mutation({
  args: {
    channelId: v.id("channels"),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Get channel to find workspace
    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Get current member
    const member = await getMember(ctx, channel.workspaceId, userId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    // Verify member is part of the channel
    const channelMember = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", member._id)
      )
      .unique();

    if (!channelMember) {
      throw new Error("Not a member of this channel");
    }

    // Get or create read state
    const readState = await getOrCreateReadState(ctx, member._id, args.channelId);

    if (!readState) {
      throw new Error("Failed to get or create read state");
    }

    const now = Date.now();

    // Update read state
    await ctx.db.patch(readState._id, {
      lastReadMessageId: args.messageId,
      lastReadAt: now,
      unreadCount: 0,
    });
  },
});

/**
 * Get unread counts for all channels for a member
 */
export const getUnreadCounts = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return {};
    }

    const member = await getMember(ctx, args.workspaceId, userId);
    if (!member) {
      return {};
    }

    // Get all read states for this member
    const readStates = await ctx.db
      .query("channelReadState")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Filter to only channels in this workspace and build map
    const unreadCounts: Record<string, number> = {};

    for (const readState of readStates) {
      const channel = await ctx.db.get(readState.channelId);
      if (channel && channel.workspaceId === args.workspaceId) {
        unreadCounts[readState.channelId] = readState.unreadCount;
      }
    }

    return unreadCounts;
  },
});

/**
 * Get aggregated unread count for a member across all channels and conversations in a workspace
 */
export const getAggregatedUnreadCount = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return 0;
    }

    const member = await getMember(ctx, args.workspaceId, userId);
    if (!member) {
      return 0;
    }

    // Get all channel read states for this member
    const channelReadStates = await ctx.db
      .query("channelReadState")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Sum up unread counts for channels in this workspace
    let total = 0;
    for (const readState of channelReadStates) {
      const channel = await ctx.db.get(readState.channelId);
      if (channel && channel.workspaceId === args.workspaceId) {
        total += readState.unreadCount;
      }
    }

    // Get all conversation read states for this member
    const conversationReadStates = await ctx.db
      .query("conversationReadState")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Sum up unread counts for conversations in this workspace
    for (const readState of conversationReadStates) {
      const conversation = await ctx.db.get(readState.conversationId);
      if (conversation && conversation.workspaceId === args.workspaceId) {
        total += readState.unreadCount;
      }
    }

    return total;
  },
});

/**
 * Get unread count for a specific channel
 */
export const getChannelUnreadCount = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return 0;
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return 0;
    }

    const member = await getMember(ctx, channel.workspaceId, userId);
    if (!member) {
      return 0;
    }

    const readState = await ctx.db
      .query("channelReadState")
      .withIndex("by_member_id_channel_id", (q) =>
        q.eq("memberId", member._id).eq("channelId", args.channelId)
      )
      .unique();

    return readState?.unreadCount ?? 0;
  },
});

/**
 * Mark a conversation as read for a member
 * Called when user opens a conversation
 */
export const markConversationAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Get conversation to find workspace
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Get current member
    const member = await getMember(ctx, conversation.workspaceId, userId);
    if (!member) {
      throw new Error("Unauthorized");
    }

    // Verify member is part of the conversation
    if (
      conversation.memberOneId !== member._id &&
      conversation.memberTwoId !== member._id
    ) {
      throw new Error("Not a participant in this conversation");
    }

    // Get or create read state
    const readState = await getOrCreateConversationReadState(
      ctx,
      member._id,
      args.conversationId
    );

    if (!readState) {
      throw new Error("Failed to get or create read state");
    }

    const now = Date.now();

    // Update read state
    await ctx.db.patch(readState._id, {
      lastReadMessageId: args.messageId,
      lastReadAt: now,
      unreadCount: 0,
    });
  },
});

/**
 * Get unread count for a specific conversation
 */
export const getConversationUnreadCount = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return 0;
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      return 0;
    }

    const member = await getMember(ctx, conversation.workspaceId, userId);
    if (!member) {
      return 0;
    }

    const readState = await ctx.db
      .query("conversationReadState")
      .withIndex("by_member_id_conversation_id", (q) =>
        q.eq("memberId", member._id).eq("conversationId", args.conversationId)
      )
      .unique();

    return readState?.unreadCount ?? 0;
  },
});

/**
 * Get unread counts for all conversations for a member
 */
export const getConversationUnreadCounts = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return {};
    }

    const member = await getMember(ctx, args.workspaceId, userId);
    if (!member) {
      return {};
    }

    // Get all conversation read states for this member
    const readStates = await ctx.db
      .query("conversationReadState")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Filter to only conversations in this workspace and build map
    const unreadCounts: Record<string, number> = {};

    for (const readState of readStates) {
      const conversation = await ctx.db.get(readState.conversationId);
      if (conversation && conversation.workspaceId === args.workspaceId) {
        unreadCounts[readState.conversationId] = readState.unreadCount;
      }
    }

    return unreadCounts;
  },
});
