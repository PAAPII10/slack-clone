import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  workspaces: defineTable({
    name: v.string(),
    userId: v.id("users"),
    joinCode: v.string(),
  }),
  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  })
    .index("by_workspace_id", ["workspaceId"])
    .index("by_user_id", ["userId"])
    .index("by_workspace_id_user_id", ["workspaceId", "userId"]),
  channels: defineTable({
    name: v.string(),
    workspaceId: v.id("workspaces"),
    channelType: v.union(v.literal("public"), v.literal("private")),
  }).index("by_workspace_id", ["workspaceId"]),
  channelMembers: defineTable({
    channelId: v.id("channels"),
    memberId: v.id("members"),
    ownerId: v.optional(v.id("members")),
  })
    .index("by_channel_id", ["channelId"])
    .index("by_member_id", ["memberId"])
    .index("by_channel_id_member_id", ["channelId", "memberId"]),
  conversations: defineTable({
    workspaceId: v.id("workspaces"),
    memberOneId: v.id("members"),
    memberTwoId: v.id("members"),
  }).index("by_workspace_id", ["workspaceId"]),
  messages: defineTable({
    body: v.string(),
    attachments: v.optional(v.array(v.id("_storage"))),
    memberId: v.id("members"),
    workspaceId: v.id("workspaces"),
    channelId: v.optional(v.id("channels")),
    parentMessageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    updatedAt: v.optional(v.number()),
  })
    .index("by_workspace_id", ["workspaceId"])
    .index("by_member_id", ["memberId"])
    .index("by_channel_id", ["channelId"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_parent_message_id", ["parentMessageId"])
    .index("by_channel_id_parent_message_id_conversation_id", [
      "channelId",
      "parentMessageId",
      "conversationId",
    ]),
  reactions: defineTable({
    workspaceId: v.id("workspaces"),
    messageId: v.id("messages"),
    memberId: v.id("members"),
    value: v.string(),
  })
    .index("by_workspace_id", ["workspaceId"])
    .index("by_message_id", ["messageId"])
    .index("by_member_id", ["memberId"]),
  memberPreferences: defineTable({
    memberId: v.id("members"),
    workspaceId: v.id("workspaces"),
    soundType: v.union(
      v.literal("default"),
      v.literal("chime"),
      v.literal("bell"),
      v.literal("pop"),
      v.literal("ding"),
      v.literal("slack")
    ),
    volume: v.number(),
    enabled: v.boolean(),
    browserNotificationsEnabled: v.optional(v.boolean()),
    desktopNotificationsEnabled: v.optional(v.boolean()),
  })
    .index("by_member_id", ["memberId"])
    .index("by_workspace_id", ["workspaceId"]),
  presence: defineTable({
    memberId: v.id("members"),
    workspaceId: v.id("workspaces"),
    lastSeen: v.number(),
  })
    .index("by_member_id", ["memberId"])
    .index("by_workspace_id", ["workspaceId"])
    .index("by_workspace_id_member_id", ["workspaceId", "memberId"]),
  typing: defineTable({
    memberId: v.id("members"),
    workspaceId: v.id("workspaces"),
    channelId: v.optional(v.id("channels")),
    conversationId: v.optional(v.id("conversations")),
    lastTypingTime: v.number(),
  })
    .index("by_member_id", ["memberId"])
    .index("by_channel_id", ["channelId"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_channel_id_member_id", ["channelId", "memberId"])
    .index("by_conversation_id_member_id", ["conversationId", "memberId"]),
  channelReadState: defineTable({
    memberId: v.id("members"),
    channelId: v.id("channels"),
    lastReadMessageId: v.optional(v.id("messages")),
    lastReadAt: v.number(),
    unreadCount: v.number(),
  })
    .index("by_member_id", ["memberId"])
    .index("by_channel_id", ["channelId"])
    .index("by_member_id_channel_id", ["memberId", "channelId"]),
  conversationReadState: defineTable({
    memberId: v.id("members"),
    conversationId: v.id("conversations"),
    lastReadMessageId: v.optional(v.id("messages")),
    lastReadAt: v.number(),
    unreadCount: v.number(),
  })
    .index("by_member_id", ["memberId"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_member_id_conversation_id", ["memberId", "conversationId"]),
  userProfiles: defineTable({
    userId: v.id("users"),
    fullName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    title: v.optional(v.string()),
    pronunciation: v.optional(v.string()),
  }).index("by_user_id", ["userId"]),
  huddles: defineTable({
    workspaceId: v.id("workspaces"),
    sourceType: v.union(v.literal("channel"), v.literal("dm")),
    channelId: v.optional(v.id("channels")), // For channel huddles
    conversationId: v.optional(v.id("conversations")), // For DM huddles
    createdBy: v.id("members"),
    createdAt: v.number(),
    startedAt: v.number(), // When huddle actually started (when first participant joined)
    isActive: v.boolean(), // True when huddle is active (when status is started)
    endedAt: v.optional(v.number()), // When huddle ended (when isActive became false)
    status: v.union(
      v.literal("attempted"),
      v.literal("started"),
      v.literal("ended"),
      v.literal("declined")
    ), // True when huddle has no participants (everyone hung up)
  })
    .index("by_workspace_id", ["workspaceId"])
    .index("by_channel_id", ["channelId"])
    .index("by_conversation_id", ["conversationId"]),
  huddleParticipants: defineTable({
    huddleId: v.id("huddles"),
    memberId: v.id("members"),
    joinedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    isActive: v.boolean(), // True when participant is active (when leftAt is undefined)
    role: v.union(v.literal("host"), v.literal("participant")),
    status: v.union(
      v.literal("waiting"),
      v.literal("joined"),
      v.literal("left")
    ),
    isMuted: v.optional(v.boolean()), // Track whether participant is muted
  })
    .index("by_huddle_id", ["huddleId"])
    .index("by_member_id", ["memberId"])
    .index("by_huddle_id_member_id", ["huddleId", "memberId"]),
  // huddleSignals table removed - WebRTC signaling removed, will use LiveKit in Phase 2
});

export default schema;
