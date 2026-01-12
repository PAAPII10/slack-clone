import { useParentMessageId } from "@/features/messages/store/use-parent-message-id";
import { useProfileMemberId } from "@/features/members/store/use-profile-member-id";

export function usePanel() {
  const [parentMessageId, setParentMessageId] = useParentMessageId();
  const [profileMemberId, setProfileMemberId] = useProfileMemberId();

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

  return {
    parentMessageId,
    profileMemberId,
    onOpenMessage,
    onCloseMessage,
    onOpenProfile,
    onCloseProfile,
  };
}
