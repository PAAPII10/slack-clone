import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { MutationCtx } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";

const CustomPassword = Password<DataModel>({
  profile(params) {
    return {
      email: params.email as string,
      name: params.name as string,
    };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [CustomPassword, GitHub, Google],
  callbacks: {
    async createOrUpdateUser(ctx: MutationCtx, args) {
      // If user already exists, preserve their existing image if they have one
      if (args.existingUserId) {
        const existingUser = await ctx.db.get(args.existingUserId);
        
        // Type guard to ensure it's a user document
        if (
          existingUser &&
          "_id" in existingUser &&
          existingUser._id === args.existingUserId &&
          "image" in existingUser &&
          existingUser.image
        ) {
          // User already has an image - preserve it
          const userId = args.existingUserId;
          
          // Update user with profile data, but preserve existing image
          await ctx.db.patch(userId, {
            name: (args.profile.name as string) ?? undefined,
            email: (args.profile.email as string) ?? undefined,
            image: existingUser.image as string, // Preserve existing image
          });
          
          return userId;
        }
      }

      // For new users or existing users without an image, use the default behavior
      if (args.existingUserId) {
        return args.existingUserId;
      }

      // Create new user
      return await ctx.db.insert("users", {
        name: (args.profile.name as string) ?? "",
        email: (args.profile.email as string) ?? "",
        image: (args.profile.image as string) ?? undefined,
      });
    },
  },
});
