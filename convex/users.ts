import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updates: {
      name?: string;
      image?: string;
    } = {};

    if (args.name !== undefined) {
      updates.name = args.name;
    }

    if (args.image !== undefined) {
      if (args.image === null) {
        // Remove image - set to undefined to remove the field in Convex
        // Type assertion needed because TypeScript doesn't allow undefined in optional fields
        updates.image = undefined;
      } else {
        // Get the URL for the image storage ID
        const imageUrl = await ctx.storage.getUrl(args.image);
        if (imageUrl) {
          updates.image = imageUrl;
        }
      }
    }

    // Patch with updates (undefined values will remove fields in Convex)
    await ctx.db.patch(userId, updates);

    return userId;
  },
});
