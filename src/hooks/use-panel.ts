import { useParentMessageId } from "@/features/messages/store/use-parent-message-id";
import { useProfileMemberId } from "@/features/members/store/use-profile-member-id";
import { useHuddleId } from "@/features/huddle/store/use-huddle-id";

export function usePanel() {
  const [parentMessageId, setParentMessageId] = useParentMessageId();
  const [profileMemberId, setProfileMemberId] = useProfileMemberId();
  const [huddleId, setHuddleId] = useHuddleId();

  function onOpenMessage(messageId: string) {
    setParentMessageId(messageId);
    onCloseProfile();
  }

  function onOpenProfile(memberId: string) {
    setProfileMemberId(memberId);
    onCloseMessage();
  }

  function onCloseMessage() {
    setParentMessageId(null);
  }

  function onCloseProfile() {
    setProfileMemberId(null);
  }

  function onOpenHuddle(huddleId: string) {
    setHuddleId(huddleId);
  }

  function onCloseHuddle() {
    setHuddleId(null);
  }

  return {
    huddleId,
    parentMessageId,
    profileMemberId,
    onOpenMessage,
    onCloseMessage,
    onOpenProfile,
    onCloseProfile,
    onOpenHuddle,
    onCloseHuddle,
  };
}
