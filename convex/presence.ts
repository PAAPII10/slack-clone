import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Threshold in milliseconds - user is considered offline if last seen > 15 seconds ago
const OFFLINE_THRESHOLD_MS = 15 * 1000;

/**
 * Send a heartbeat to indicate the user is online
 */
export const heartbeat = mutation({
  args: {
    workspaceId: v.id("workspaces"),
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

    const now = Date.now();

    // Check if presence record exists
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_workspace_id_member_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("memberId", member._id)
      )
      .unique();

    if (existing) {
      // Update existing presence
      await ctx.db.patch(existing._id, {
        lastSeen: now,
      });
    } else {
      // Create new presence record
      await ctx.db.insert("presence", {
        memberId: member._id,
        workspaceId: args.workspaceId,
        lastSeen: now,
      });
    }

    return { success: true };
  },
});

/**
 * Clear presence when user leaves workspace or logs out
 */
export const clearPresence = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // If user is not authenticated, we can't clear their presence
      // This is fine - the threshold will handle it
      return { success: true };
    }

    // Find the member for this user in this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return { success: true };
    }

    // Delete the presence record
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_workspace_id_member_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("memberId", member._id)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});

/**
 * Get online status for all members in a workspace
 */
export const getOnlineStatus = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {};
    }

    // Verify user is a member of this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return {};
    }

    // Get all presence records for this workspace
    const presenceRecords = await ctx.db
      .query("presence")
      .withIndex("by_workspace_id", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect();

    const now = Date.now();
    const statusMap: Record<string, boolean> = {};

    for (const presence of presenceRecords) {
      const isOnline = now - presence.lastSeen < OFFLINE_THRESHOLD_MS;
      statusMap[presence.memberId] = isOnline;
    }

    return statusMap;
  },
});

/**
 * Get online status for a specific member
 */
export const getMemberOnlineStatus = query({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }

    const member = await ctx.db.get(args.memberId);
    if (!member) {
      return false;
    }

    // Verify user is a member of the same workspace
    const currentMember = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", member.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!currentMember) {
      return false;
    }

    const presence = await ctx.db
      .query("presence")
      .withIndex("by_workspace_id_member_id", (q) =>
        q.eq("workspaceId", member.workspaceId).eq("memberId", args.memberId)
      )
      .unique();

    if (!presence) {
      return false;
    }

    const now = Date.now();
    return now - presence.lastSeen < OFFLINE_THRESHOLD_MS;
  },
});
