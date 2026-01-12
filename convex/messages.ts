import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";

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
 * Increment unread count for all channel members except the sender
 */
async function incrementUnreadForChannel(
  ctx: MutationCtx,
  channelId: Id<"channels">,
  messageId: Id<"messages">,
  senderMemberId: Id<"members">
) {
  // Get all channel members
  const channelMembers = await ctx.db
    .query("channelMembers")
    .withIndex("by_channel_id", (q) => q.eq("channelId", channelId))
    .collect();

  // Increment unread count for each member (except sender)
  // Note: Active channel check will be handled client-side
  for (const channelMember of channelMembers) {
    // Skip sender
    if (channelMember.memberId === senderMemberId) {
      continue;
    }

    // Get or create read state
    const readState = await getOrCreateReadState(
      ctx,
      channelMember.memberId,
      channelId
    );

    if (readState) {
      // Increment unread count
      await ctx.db.patch(readState._id, {
        unreadCount: readState.unreadCount + 1,
      });
    }
  }
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
 * Increment unread count for conversation participants except the sender
 */
async function incrementUnreadForConversation(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">,
  senderMemberId: Id<"members">
) {
  // Get conversation to find participants
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    return;
  }

  // Get the other participant (not the sender)
  const otherMemberId =
    conversation.memberOneId === senderMemberId
      ? conversation.memberTwoId
      : conversation.memberOneId;

  // Get or create read state for the other participant
  const readState = await getOrCreateConversationReadState(
    ctx,
    otherMemberId,
    conversationId
  );

  if (readState) {
    // Increment unread count
    await ctx.db.patch(readState._id, {
      unreadCount: readState.unreadCount + 1,
    });
  }
}

function populateUser(ctx: QueryCtx, id: Id<"users">) {
  return ctx.db.get(id);
}

function populateMember(ctx: QueryCtx, id: Id<"members">) {
  return ctx.db.get(id);
}

function populateReactions(ctx: QueryCtx, messageId: Id<"messages">) {
  return ctx.db
    .query("reactions")
    .withIndex("by_message_id", (q) => q.eq("messageId", messageId))
    .collect();
}

async function populateThread(ctx: QueryCtx, messageId: Id<"messages">) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_parent_message_id", (q) =>
      q.eq("parentMessageId", messageId)
    )
    .collect();

  if (messages.length === 0) {
    return {
      count: 0,
      image: undefined,
      name: undefined,
      timestamp: 0,
    };
  }

  const lastMessage = messages[messages.length - 1];
  const lastMessageMember = await populateMember(ctx, lastMessage.memberId);

  if (!lastMessageMember) {
    return {
      count: 0,
      image: undefined,
      name: undefined,
      timestamp: 0,
    };
  }

  const lastMessageUser = await populateUser(ctx, lastMessageMember.userId);

  if (!lastMessageUser) {
    return {
      count: 0,
      image: undefined,
      name: undefined,
      timestamp: 0,
    };
  }

  return {
    count: messages.length,
    image: lastMessageUser?.image,
    name: lastMessageUser?.name,
    timestamp: lastMessage._creationTime,
  };
}

export const create = mutation({
  args: {
    body: v.string(),
    image: v.optional(v.id("_storage")),
    workspaceId: v.id("workspaces"),
    channelId: v.optional(v.id("channels")),
    parentMessageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const member = await getMember(ctx, args.workspaceId, userId);

    if (!member) {
      throw new Error("Unauthorized");
    }

    let _conversationId = args.conversationId;

    // Only possible if we are replying in a thread in 1:1 conversation
    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);

      if (!parentMessage) {
        throw new Error("Parent message not found");
      }

      _conversationId = parentMessage.conversationId;
    }

    const messageId = await ctx.db.insert("messages", {
      ...args,
      memberId: member._id,
      conversationId: _conversationId,
    });

    // Increment unread count for channel messages (not threads or conversations)
    // Thread replies don't increment unread - only top-level messages
    if (args.channelId && !args.parentMessageId) {
      await incrementUnreadForChannel(ctx, args.channelId, messageId, member._id);
    }

    // Increment unread count for conversation messages (not threads)
    if (_conversationId && !args.parentMessageId) {
      await incrementUnreadForConversation(
        ctx,
        _conversationId,
        messageId,
        member._id
      );
    }

    return messageId;
  },
});

export const get = query({
  args: {
    channelId: v.optional(v.id("channels")),
    conversationId: v.optional(v.id("conversations")),
    parentMessageId: v.optional(v.id("messages")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    let _conversationId = args.conversationId;

    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);

      if (!parentMessage) {
        throw new Error("Parent message not found");
      }

      _conversationId = parentMessage.conversationId;
    }

    const results = await ctx.db
      .query("messages")
      .withIndex("by_channel_id_parent_message_id_conversation_id", (q) =>
        q
          .eq("channelId", args.channelId)
          .eq("parentMessageId", args.parentMessageId)
          .eq("conversationId", _conversationId)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: (
        await Promise.all(
          results.page.map(async (message) => {
            const member = await populateMember(ctx, message.memberId);
            const user = member ? await populateUser(ctx, member.userId) : null;

            if (!member || !user) {
              return null;
            }

            const reactions = await populateReactions(ctx, message._id);

            const thread = await populateThread(ctx, message._id);

            const image = message.image
              ? await ctx.storage.getUrl(message.image)
              : undefined;

            const reactionsWithCounts = reactions.map((reaction) => {
              return {
                ...reaction,
                count: reactions.filter((r) => r.value === reaction.value)
                  .length,
              };
            });

            const dedupedReactions = reactionsWithCounts.reduce(
              (acc, reaction) => {
                const existingReaction = acc.find(
                  (r) => r.value === reaction.value
                );
                if (existingReaction) {
                  existingReaction.memberIds = Array.from(
                    new Set([...existingReaction.memberIds, reaction.memberId])
                  );
                } else {
                  acc.push({ ...reaction, memberIds: [reaction.memberId] });
                }
                return acc;
              },
              [] as (Doc<"reactions"> & {
                count: number;
                memberIds: Id<"members">[];
              })[]
            );

            const reactionWithoutMemberIdProperty = dedupedReactions.map(
              ({ memberId, ...rest }) => rest
            );

            return {
              ...message,
              image,
              member,
              user,
              reactions: reactionWithoutMemberIdProperty,
              threadCount: thread.count,
              threadImage: thread.image,
              threadTimestamp: thread.timestamp,
              threadName: thread.name,
            };
          })
        )
      ).filter((message) => message !== null),
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("messages"),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      throw new Error("Message not found");
    }

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { body: args.body, updatedAt: Date.now() });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      throw new Error("Message not found");
    }

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) {
      throw new Error("Unauthorized");
    }

    if (message.image) {
      await ctx.storage.delete(message.image);
    }

    await ctx.db.delete(args.id);

    return args.id;
  },
});

export const messageById = query({
  args: {
    id: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return null;
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      return null;
    }

    const currentMember = await getMember(ctx, message.workspaceId, userId);

    if (!currentMember) {
      return null;
    }

    const member = await populateMember(ctx, message.memberId);

    if (!member) {
      return null;
    }

    const user = await populateUser(ctx, member.userId);

    if (!user) {
      return null;
    }

    const reactions = await populateReactions(ctx, message._id);

    const reactionsWithCounts = reactions.map((reaction) => {
      return {
        ...reaction,
        count: reactions.filter((r) => r.value === reaction.value).length,
      };
    });

    const dedupedReactions = reactionsWithCounts.reduce(
      (acc, reaction) => {
        const existingReaction = acc.find((r) => r.value === reaction.value);
        if (existingReaction) {
          existingReaction.memberIds = Array.from(
            new Set([...existingReaction.memberIds, reaction.memberId])
          );
        } else {
          acc.push({ ...reaction, memberIds: [reaction.memberId] });
        }
        return acc;
      },
      [] as (Doc<"reactions"> & {
        count: number;
        memberIds: Id<"members">[];
      })[]
    );

    const reactionWithoutMemberIdProperty = dedupedReactions.map(
      ({ memberId, ...rest }) => rest
    );

    return {
      ...message,
      image: message.image
        ? await ctx.storage.getUrl(message.image)
        : undefined,
      member,
      user,
      reactions: reactionWithoutMemberIdProperty,
    };
  },
});

/**
 * Get recent messages for notifications
 * Returns messages from the workspace that the current user should be notified about
 */
export const getRecentForNotifications = query({
  args: {
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    const currentMember = await getMember(ctx, args.workspaceId, userId);

    if (!currentMember) {
      return [];
    }

    const limit = args.limit ?? 50;

    // Get all recent messages in the workspace
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_workspace_id", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(limit * 2); // Get more to filter out user's own messages

    // Filter messages:
    // 1. Exclude messages sent by the current user
    // 2. Exclude thread replies
    // 3. For conversation messages, only include if current member is a participant
    const relevantMessages = [];
    for (const message of allMessages) {
      // Skip messages sent by current user
      if (message.memberId === currentMember._id) {
        continue;
      }
      
      // Skip thread replies
      if (message.parentMessageId) {
        continue;
      }

      // If it's a channel message, check if current member is part of the channel
      const channelId = message.channelId;
      if (channelId) {
        // Check if the current member is in the channel
        const channelMembership = await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_id_member_id", (q) =>
            q.eq("channelId", channelId).eq("memberId", currentMember._id)
          )
          .unique();
        
        // Only include if member is part of the channel
        if (channelMembership) {
          relevantMessages.push(message);
        }
        continue;
      }

      // If it's a conversation message, check if current member is a participant
      if (message.conversationId) {
        const conversation = await ctx.db.get(message.conversationId);
        if (
          conversation &&
          (conversation.memberOneId === currentMember._id ||
            conversation.memberTwoId === currentMember._id)
        ) {
          relevantMessages.push(message);
        }
        // If conversation doesn't exist or current member is not a participant, skip it
        continue;
      }

      // If message has neither channelId nor conversationId, skip it (shouldn't happen, but be safe)
    }

    // Take only the limit
    const messages = relevantMessages.slice(0, limit);

    // Populate user info for notifications
    const messagesWithUsers = await Promise.all(
      messages.map(async (message) => {
        const member = await populateMember(ctx, message.memberId);
        const user = member ? await populateUser(ctx, member.userId) : null;

        if (!member || !user) {
          return null;
        }

        return {
          _id: message._id,
          body: message.body,
          memberId: message.memberId,
          channelId: message.channelId,
          conversationId: message.conversationId,
          _creationTime: message._creationTime,
          user: {
            name: user.name,
            image: user.image,
          },
        };
      })
    );

    return messagesWithUsers.filter((msg) => msg !== null);
  },
});
