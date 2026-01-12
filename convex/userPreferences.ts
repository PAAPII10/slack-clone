import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const get = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    // Get the current member for this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      return null;
    }

    // Get preferences for this member
    const preferences = await ctx.db
      .query("memberPreferences")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .unique();

    // Return default preferences if none exist
    if (!preferences) {
      return {
        soundType: "default" as const,
        volume: 0.5,
        enabled: true,
      };
    }

    return {
      soundType: preferences.soundType,
      volume: preferences.volume,
      enabled: preferences.enabled,
    };
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    soundType: v.optional(
      v.union(
        v.literal("default"),
        v.literal("chime"),
        v.literal("bell"),
        v.literal("pop"),
        v.literal("ding"),
        v.literal("slack")
      )
    ),
    volume: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Get the current member for this workspace
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_id_user_id", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", userId)
      )
      .unique();

    if (!member) {
      throw new Error("Member not found in workspace");
    }

    // Validate volume range
    if (args.volume !== undefined) {
      if (args.volume < 0 || args.volume > 1) {
        throw new Error("Volume must be between 0 and 1");
      }
    }

    const existing = await ctx.db
      .query("memberPreferences")
      .withIndex("by_member_id", (q) => q.eq("memberId", member._id))
      .unique();

    const updates: {
      soundType?: typeof args.soundType;
      volume?: number;
      enabled?: boolean;
    } = {};

    if (args.soundType !== undefined) {
      updates.soundType = args.soundType;
    }
    if (args.volume !== undefined) {
      updates.volume = args.volume;
    }
    if (args.enabled !== undefined) {
      updates.enabled = args.enabled;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      // Create new preferences with defaults
      const newPreferences = {
        memberId: member._id,
        workspaceId: args.workspaceId,
        soundType: args.soundType ?? "default",
        volume: args.volume ?? 0.5,
        enabled: args.enabled ?? true,
      };
      return await ctx.db.insert("memberPreferences", newPreferences);
    }
  },
});
