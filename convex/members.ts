import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function populateUser(ctx: QueryCtx, id: Id<"users">) {
  return ctx.db.get(id);
}

export const current = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();
    if (!member) {
      return null;
    }
    return member;
  },
});

export const get = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return [];
    }

    const data = await ctx.db
      .query("members")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect();

    const members = [];

    // Get all conversations for this workspace
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect();

    // Build a map of memberId -> conversationId for conversations involving current member
    const memberConversationMap = new Map<Id<"members">, Id<"conversations">>();
    for (const conversation of conversations) {
      if (conversation.memberOneId === member._id) {
        memberConversationMap.set(conversation.memberTwoId, conversation._id);
      } else if (conversation.memberTwoId === member._id) {
        memberConversationMap.set(conversation.memberOneId, conversation._id);
      }
    }

    // Get unread counts for all conversations involving current member
    const conversationUnreadCounts = new Map<Id<"conversations">, number>();
    const readStates = await ctx.db
      .query("conversationReadState")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Build map of conversationId -> unreadCount
    // Only include conversations that are in memberConversationMap (conversations with other members)
    const conversationIds = new Set(memberConversationMap.values());
    for (const readState of readStates) {
      if (conversationIds.has(readState.conversationId)) {
        conversationUnreadCounts.set(
          readState.conversationId,
          readState.unreadCount
        );
      }
    }

    for (const memberData of data) {
      // Skip current member
      if (memberData._id === member._id) {
        continue;
      }

      const user = await populateUser(ctx, memberData.userId);
      if (user) {
        // Get user profile for display name
        const userProfile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user_id", (q) => q.eq("userId", user._id))
          .unique();

        // Get conversation ID and unread count for this member
        const conversationId = memberConversationMap.get(memberData._id);
        const unreadCount = conversationId
          ? conversationUnreadCounts.get(conversationId) ?? 0
          : 0;

        members.push({
          ...memberData,
          user: {
            ...user,
            displayName: userProfile?.displayName,
            fullName: userProfile?.fullName,
          },
          unreadCount,
        });
      }
    }

    return members;
  },
});

export const getById = query({
  args: {
    id: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) return null;

    const member = await ctx.db.get(args.id);

    if (!member) return null;

    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", member.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) return null;

    const user = await populateUser(ctx, member.userId);

    if (!user) return null;

    // Get user profile for display name and additional fields
    const userProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    return {
      ...member,
      user: {
        ...user,
        displayName: userProfile?.displayName,
        fullName: userProfile?.fullName,
        title: userProfile?.title,
        pronunciation: userProfile?.pronunciation,
      },
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("members"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error("Unauthorized");

    const member = await ctx.db.get(args.id);

    if (!member) throw new Error("Member not found");

    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", member.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember || currentMember.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { role: args.role });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) throw new Error("Unauthorized");

    const member = await ctx.db.get(args.id);

    if (!member) throw new Error("Member not found");

    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", member.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) {
      throw new Error("Unauthorized");
    }

    if (member.role === "admin") {
      throw new Error("Cannot remove admin member");
    }

    if (currentMember._id === member._id && currentMember.role === "admin") {
      throw new Error("Cannot remove self if you are an admin");
    }

    const [messages, reactions, conversations] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db
        .query("reactions")
        .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
        .collect(),
      ctx.db
        .query("conversations")
        .filter((q) =>
          q.or(
            q.eq(q.field("memberOneId"), member._id),
            q.eq(q.field("memberTwoId"), member._id)
          )
        )
        .collect(),
    ]);

    for (const message of messages) {
      // Delete all attachments
      if (message.attachments) {
        for (const attachmentId of message.attachments) {
          await ctx.storage.delete(attachmentId);
        }
      }
      await ctx.db.delete(message._id);
    }

    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }

    for (const conversation of conversations) {
      await ctx.db.delete(conversation._id);
    }

    await ctx.db.delete(args.id);

    return args.id;
  },
});
