import { query, mutation, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const getOrCreateProfile = async (ctx: MutationCtx, userId: Id<"users">) => {
  const existing = await ctx.db
    .query("userProfiles")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();

  if (existing) {
    return existing;
  }

  // Create new profile
  const profileId = await ctx.db.insert("userProfiles", {
    userId,
  });

  return await ctx.db.get(profileId);
};

export const get = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .unique();
    return existing;
  },
});

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .unique();
    return existing;
  },
});

export const update = mutation({
  args: {
    fullName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    title: v.optional(v.string()),
    pronunciation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const profile = await getOrCreateProfile(ctx, userId);

    if (!profile) {
      throw new Error("Failed to get or create profile");
    }

    const updates: {
      fullName?: string;
      displayName?: string;
      title?: string;
      pronunciation?: string;
    } = {};

    if (args.fullName !== undefined) {
      updates.fullName = args.fullName;
    }
    if (args.displayName !== undefined) {
      updates.displayName = args.displayName;
    }
    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.pronunciation !== undefined) {
      updates.pronunciation = args.pronunciation;
    }

    await ctx.db.patch(profile._id, updates);

    return profile._id;
  },
});
