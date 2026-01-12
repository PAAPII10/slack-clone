import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function populateUser(ctx: QueryCtx, id: Id<"users">) {
  return ctx.db.get(id);
}

// Typing state expires after 3 seconds of inactivity
const TYPING_EXPIRY_MS = 3 * 1000;

/**
 * Start or update typing indicator for a user in a channel or conversation
 */
export const startTyping = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.optional(v.id("channels")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Validate that either channelId or conversationId is provided, but not both
    if (!args.channelId && !args.conversationId) {
      throw new Error("Either channelId or conversationId must be provided");
    }
    if (args.channelId && args.conversationId) {
      throw new Error("Cannot provide both channelId and conversationId");
    }

    // Find the member for this user in this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      throw new Error("Member not found");
    }

    const now = Date.now();

    // Check if typing record already exists
    const existing = args.channelId
      ? await ctx.db
          .query("typing")
          .withIndex("by_channel_id_member_id", (q) =>
            q.eq("channelId", args.channelId).eq("memberId", member._id)
          )
          .unique()
      : await ctx.db
          .query("typing")
          .withIndex("by_conversation_id_member_id", (q) =>
            q
              .eq("conversationId", args.conversationId)
              .eq("memberId", member._id)
          )
          .unique();

    if (existing) {
      // Update existing typing record
      await ctx.db.patch(existing._id, {
        lastTypingTime: now,
      });
    } else {
      // Create new typing record
      await ctx.db.insert("typing", {
        memberId: member._id,
        workspaceId: args.workspaceId,
        channelId: args.channelId,
        conversationId: args.conversationId,
        lastTypingTime: now,
      });
    }

    return { success: true };
  },
});

/**
 * Stop typing indicator for a user
 */
export const stopTyping = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    channelId: v.optional(v.id("channels")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Find the member for this user in this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      throw new Error("Member not found");
    }

    // Find and delete typing record
    const existing = args.channelId
      ? await ctx.db
          .query("typing")
          .withIndex("by_channel_id_member_id", (q) =>
            q.eq("channelId", args.channelId).eq("memberId", member._id)
          )
          .unique()
      : await ctx.db
          .query("typing")
          .withIndex("by_conversation_id_member_id", (q) =>
            q
              .eq("conversationId", args.conversationId)
              .eq("memberId", member._id)
          )
          .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});

/**
 * Get all currently typing users for a channel or conversation
 * Automatically filters out expired typing states
 */
export const getTypingUsers = query({
  args: {
    channelId: v.optional(v.id("channels")),
    conversationId: v.optional(v.id("conversations")),
    currentMemberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    // Validate that either channelId or conversationId is provided, but not both
    if (!args.channelId && !args.conversationId) {
      return [];
    }
    if (args.channelId && args.conversationId) {
      return [];
    }

    // Verify the currentMemberId belongs to the authenticated user
    const currentMember = await ctx.db.get(args.currentMemberId);
    if (!currentMember || currentMember.userId !== userId) {
      return [];
    }

    // Verify user has access to the conversation or channel
    if (args.conversationId) {
      const conversation = await ctx.db.get(args.conversationId);
      if (!conversation) {
        return [];
      }

      // Verify user is part of this conversation
      if (
        conversation.memberOneId !== currentMember._id &&
        conversation.memberTwoId !== currentMember._id
      ) {
        return [];
      }
    } else if (args.channelId) {
      const channelId = args.channelId; // Type narrowing
      const channel = await ctx.db.get(channelId);
      if (!channel) {
        return [];
      }

      // Verify workspace matches
      if (channel.workspaceId !== currentMember.workspaceId) {
        return [];
      }

      // For private channels, verify the user is a member
      if (channel.channelType === "private") {
        const channelMember = await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_id_member_id", (q) =>
            q.eq("channelId", channelId).eq("memberId", currentMember._id)
          )
          .unique();

        if (!channelMember) {
          return [];
        }
      }
    }

    const now = Date.now();

    // Get all typing records for this channel or conversation
    let typingRecords;
    if (args.channelId) {
      typingRecords = await ctx.db
        .query("typing")
        .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
        .collect();
    } else if (args.conversationId) {
      typingRecords = await ctx.db
        .query("typing")
        .withIndex("by_conversation_id", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .collect();
    } else {
      return [];
    }

    // Filter out expired typing states and current user
    const activeTyping = typingRecords.filter((record) => {
      const isExpired = now - record.lastTypingTime > TYPING_EXPIRY_MS;
      const isCurrentUser = record.memberId === args.currentMemberId;
      return !isExpired && !isCurrentUser;
    });

    // Note: Expired records are filtered out but not deleted here
    // They will be cleaned up by stopTyping mutation or can be cleaned by a scheduled function

    // Fetch member and user details for each typing user
    const typingUsers = [];
    for (const record of activeTyping) {
      const member = await ctx.db.get(record.memberId);
      if (!member) continue;

      const user = await populateUser(ctx, member.userId);
      if (!user) continue;

      typingUsers.push({
        memberId: member._id,
        userId: user._id,
        name: user.name,
        image: user.image,
      });
    }

    return typingUsers;
  },
});
