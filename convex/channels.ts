import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";

async function populateUser(ctx: QueryCtx, id: Id<"users">) {
  const user = await ctx.db.get(id);
  if (!user) return null;

  // Get user profile for display name
  const userProfile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", id))
    .unique();

  return {
    ...user,
    displayName: userProfile?.displayName,
    fullName: userProfile?.fullName,
  };
}

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

    const publicChannels = await ctx.db
      .query("channels")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .filter((q) => q.eq(q.field("channelType"), "public"))
      .collect();

    // Get private channel memberships for this member
    const channelMemberships = await ctx.db
      .query("channelMembers")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .collect();

    // Fetch private channels via memberships
    const privateChannels = await Promise.all(
      channelMemberships.map(async (cm) => {
        const channel = await ctx.db.get(cm.channelId);
        if (
          channel &&
          channel.workspaceId === args.workspaceId &&
          channel.channelType === "private"
        ) {
          return channel;
        }
        return null;
      })
    );

    const allChannels = [
      ...publicChannels,
      ...privateChannels.filter(Boolean),
    ] as Doc<"channels">[];

    // Get unread counts for all channels
    const channelsWithUnread = await Promise.all(
      allChannels.map(async (channel) => {
        const readState = await ctx.db
          .query("channelReadState")
          .withIndex("by_member_id_channel_id", (q) =>
            q.eq("memberId", member._id).eq("channelId", channel._id)
          )
          .unique();

        return {
          ...channel,
          unreadCount: readState?.unreadCount ?? 0,
        };
      })
    );

    return channelsWithUnread;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    workspaceId: v.id("workspaces"),
    channelType: v.union(v.literal("public"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      throw new Error("Unauthorized");
    }

    const parsedName = args.name.replace(/\s+/g, "-").toLowerCase();

    const channelId = await ctx.db.insert("channels", {
      name: parsedName,
      workspaceId: args.workspaceId,
      channelType: args.channelType,
    });

    await ctx.db.insert("channelMembers", {
      channelId,
      memberId: member._id,
      ownerId: member._id,
    });

    // Initialize read state for creator - all existing messages (none) are considered read
    const now = Date.now();
    await ctx.db.insert("channelReadState", {
      memberId: member._id,
      channelId,
      lastReadAt: now,
      unreadCount: 0,
    });

    return channelId;
  },
});

export const getById = query({
  args: {
    id: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return null;
    }

    const channel = await ctx.db.get(args.id);

    if (!channel) {
      return null;
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return null;
    }

    // For private channels, verify the user is a member of the channel
    if (channel.channelType === "private") {
      const channelMember = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel_id_member_id", (q) =>
          q.eq("channelId", args.id).eq("memberId", member._id)
        )
        .unique();

      if (!channelMember) {
        return null; // User is not a member of this private channel
      }
    }

    return channel;
  },
});

export const update = mutation({
  args: {
    id: v.id("channels"),
    name: v.string(),
    channelType: v.union(v.literal("public"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.id);

    if (!channel) {
      throw new Error("Channel not found");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const parsedName = args.name.replace(/\s+/g, "-").toLowerCase();

    await ctx.db.patch(args.id, {
      name: parsedName,
      channelType: args.channelType,
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.id);

    if (!channel) {
      throw new Error("Channel not found");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const [messages] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_channel_id", (q) => q.eq("channelId", args.id))
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

    await ctx.db.delete(args.id);

    return args.id;
  },
});

export const getChannelMembers = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return [];
    }

    // Verify user is a member of the workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return [];
    }

    // Get channel members from channelMembers table (works for both public and private)
    const channelMembers = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Create a map of memberId to ownerId for quick lookup
    const memberOwnerMap = new Map(
      channelMembers.map((cm) => [cm.memberId, cm.ownerId])
    );

    const memberIds = channelMembers.map((cm) => cm.memberId);
    const members = await Promise.all(
      memberIds.map((memberId) => ctx.db.get(memberId))
    );

    const validMembers = members.filter(
      (m): m is NonNullable<typeof m> => m !== null
    );

    const membersWithUsers = [];
    for (const member of validMembers) {
      const user = await populateUser(ctx, member.userId);
      if (user) {
        // Get display name (displayName || fullName || name)
        const userDisplayName = user.displayName || user.fullName || user.name;
        const ownerId = memberOwnerMap.get(member._id);
        membersWithUsers.push({
          ...member,
          user: {
            ...user,
            name: userDisplayName, // Use display name as the primary name
          },
          ownerId,
        });
      }
    }

    return membersWithUsers;
  },
});

export const inviteMember = mutation({
  args: {
    channelId: v.id("channels"),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Verify user is a member of the workspace
    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) {
      throw new Error("Unauthorized");
    }

    // Verify the target member is in the same workspace
    const targetMember = await ctx.db.get(args.memberId);
    if (!targetMember || targetMember.workspaceId !== channel.workspaceId) {
      throw new Error("Member not found in workspace");
    }

    // Check if member is already in the channel
    const existingMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", args.memberId)
      )
      .unique();

    if (existingMembership) {
      throw new Error("Member is already in this channel");
    }

    // For private channels, check if there's already an owner and set ownerId if needed
    // For public channels, ownerId should be undefined
    let ownerId: Id<"members"> | undefined = undefined;

    if (channel.channelType === "private") {
      const allChannelMembers = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
        .collect();

      // Owner is indicated by ownerId being set and equal to memberId
      const hasOwner = allChannelMembers.some(
        (cm) => cm.ownerId !== undefined && cm.ownerId === cm.memberId
      );

      // Only set ownerId if there's no existing owner
      ownerId = hasOwner ? undefined : currentMember._id;
    }

    // Add member to channel
    await ctx.db.insert("channelMembers", {
      channelId: args.channelId,
      memberId: args.memberId,
      ownerId,
    });

    // Initialize read state - all existing messages are considered read
    // Only future messages will be unread
    const now = Date.now();
    await ctx.db.insert("channelReadState", {
      memberId: args.memberId,
      channelId: args.channelId,
      lastReadAt: now,
      unreadCount: 0,
    });

    return args.memberId;
  },
});

export const removeChannelMember = mutation({
  args: {
    channelId: v.id("channels"),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Verify user is a member of the workspace
    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) {
      throw new Error("Unauthorized");
    }

    // Allow removing from both public and private channels
    // For public channels, only allow self-removal (leaving)
    // For private channels, allow admin removal or self-removal

    // Find and remove the channel membership
    const channelMember = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", args.memberId)
      )
      .unique();

    if (!channelMember) {
      throw new Error("Member is not in this channel");
    }

    // Only admins can remove other members
    // Regular members can only remove themselves (leave)
    if (currentMember._id !== args.memberId) {
      // Removing someone else - must be admin
      if (currentMember.role !== "admin") {
        throw new Error("Only admins can remove other members");
      }
    }
    // If removing themselves, allow (anyone can leave)

    await ctx.db.delete(channelMember._id);

    // Clean up read state when member is removed
    const readState = await ctx.db
      .query("channelReadState")
      .withIndex("by_member_id_channel_id", (q) =>
        q.eq("memberId", args.memberId).eq("channelId", args.channelId)
      )
      .unique();

    if (readState) {
      await ctx.db.delete(readState._id);
    }

    return args.memberId;
  },
});

export const getChannelOwner = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return null;
    }

    // Verify user is a member of the workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return null;
    }

    // Find the channel member who is the owner
    const allChannelMembers = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Find the member who is the owner (ownerId equals memberId)
    const ownerMembership = allChannelMembers.find(
      (cm) => cm.ownerId !== undefined && cm.ownerId === cm.memberId
    );

    if (!ownerMembership || !ownerMembership.ownerId) {
      return null;
    }

    const ownerMember = await ctx.db.get(ownerMembership.ownerId);
    if (!ownerMember) {
      return null;
    }

    const ownerUser = await populateUser(ctx, ownerMember.userId);
    if (!ownerUser) {
      return null;
    }

    return {
      ...ownerMember,
      user: ownerUser,
    };
  },
});

export const transferOwnership = mutation({
  args: {
    channelId: v.id("channels"),
    newOwnerMemberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Verify user is a member of the workspace
    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) {
      throw new Error("Unauthorized");
    }

    // Only allow for private channels
    if (channel.channelType !== "private") {
      throw new Error("Can only transfer ownership of private channels");
    }

    // Verify the new owner is in the same workspace
    const newOwnerMember = await ctx.db.get(args.newOwnerMemberId);
    if (!newOwnerMember || newOwnerMember.workspaceId !== channel.workspaceId) {
      throw new Error("Member not found in workspace");
    }

    // Verify the new owner is already a member of the channel
    const newOwnerMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", args.newOwnerMemberId)
      )
      .unique();

    if (!newOwnerMembership) {
      throw new Error("New owner must be a member of the channel");
    }

    // Find current owner (if any)
    const allChannelMembers = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id", (q) => q.eq("channelId", args.channelId))
      .collect();

    // Find the current owner's membership (if exists)
    // Owner is indicated by ownerId being set and equal to memberId
    const existingOwnerMembership = allChannelMembers.find(
      (cm) => cm.ownerId !== undefined && cm.ownerId === cm.memberId
    );

    // Remove ownership from current owner (if exists)
    if (existingOwnerMembership) {
      await ctx.db.patch(existingOwnerMembership._id, {
        ownerId: undefined,
      });
    }

    // Set new owner - ownerId should equal memberId to indicate this member is the owner
    await ctx.db.patch(newOwnerMembership._id, {
      ownerId: args.newOwnerMemberId,
    });

    return args.newOwnerMemberId;
  },
});

export const isChannelMember = query({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      return false;
    }

    // Verify user is a member of the workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return false;
    }

    // For public channels, check if user is in channelMembers
    // For private channels, they must be in channelMembers to see it
    const channelMember = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", member._id)
      )
      .unique();

    return channelMember !== null;
  },
});

export const joinChannel = mutation({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const channel = await ctx.db.get(args.channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Verify user is a member of the workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      throw new Error("Unauthorized");
    }

    // Only allow joining public channels
    if (channel.channelType !== "public") {
      throw new Error("Can only join public channels");
    }

    // Check if member is already in the channel
    const existingMembership = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel_id_member_id", (q) =>
        q.eq("channelId", args.channelId).eq("memberId", member._id)
      )
      .unique();

    if (existingMembership) {
      throw new Error("Already a member of this channel");
    }

    // Add member to channel (no owner for public channels)
    await ctx.db.insert("channelMembers", {
      channelId: args.channelId,
      memberId: member._id,
      ownerId: undefined,
    });

    // Initialize read state - all existing messages are considered read
    // Only future messages will be unread
    const now = Date.now();
    await ctx.db.insert("channelReadState", {
      memberId: member._id,
      channelId: args.channelId,
      lastReadAt: now,
      unreadCount: 0,
    });

    return args.channelId;
  },
});
