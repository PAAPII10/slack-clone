import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useGetChannel } from "../../api/use-get-channel";
import { getUserDisplayName } from "@/lib/user-utils";
import { Headphones, Loader2 } from "lucide-react";
import { useChannelId } from "@/hooks/use-channel-id";
import { useGetChannelHuddle } from "@/features/huddle/api/channel/use-get-channel-huddle";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useStartAndJoinChannelHuddle } from "@/features/huddle/api/channel/use-start-and-join-channel-huddle";
import { useShowChannelHuddleDialog } from "@/features/huddle/components/channel/store/use-show-channel-huddle-dialog";
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { useGetChannelHuddleParticipants } from "@/features/huddle/api/channel/use-get-channel-huddle-participants";

export function ChannelHuddleJoinScreen({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();
  const [, setLiveKitToken] = useLiveKitToken();
  const [, setShowChannelHuddleDialog] = useShowChannelHuddleDialog();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: channel } = useGetChannel({
    id: channelId || ("" as Id<"channels">),
  });

  const {
    data: channelHuddle,
    isLoading: isLoadingChannelHuddle,
    hasActiveHuddle,
  } = useGetChannelHuddle({
    channelId,
  });

  const { data: participants, isLoading: isLoadingParticipants } =
    useGetChannelHuddleParticipants({
      channelHuddleId: channelHuddle?.channelHuddleId,
    });

  const {
    startAndJoin: startAndJoinHuddle,
    isPending: isJoiningHuddle,
    currentStep,
  } = useStartAndJoinChannelHuddle();

  const huddleTitle = channel ? `# ${channel.name}` : "Channel Huddle";

  const displayParticipants =
    participants
      ?.filter((p) => p.user && p.memberId)
      .map((p) => ({
        id: p.memberId,
        name: getUserDisplayName(p.user),
        image: p.user.image || undefined,
        isYou: p.memberId === currentMember?._id,
        role: p.role,
        isMuted: p.isMuted ?? false,
        status: "joined" as const,
      })) || [];

  const handleJoin = () => {
    if (!channelId || !workspaceId || !currentMember?._id) return;

    startAndJoinHuddle(
      {
        workspaceId,
        channelId,
        memberId: currentMember._id,
        participantName: currentMember.user?.name ?? "Anonymous",
      },
      {
        onSuccess: (data) => {
          setLiveKitToken({ token: data.token, url: data.url });
          setShowChannelHuddleDialog(true);
          logger.debug("Channel huddle started and joined successfully", {
            channelHuddleId: data.channelHuddleId,
          });
          onOpenChange(false);
        },
        onError: (error, step) => {
          logger.error(`Failed to ${step} channel huddle`, error as Error);
          setLiveKitToken(null);
        },
      }
    );
  };

  const isLoading = isLoadingChannelHuddle || isLoadingParticipants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">Huddle in {huddleTitle}</DialogTitle>
        <div className="flex flex-col">
          {/* Join Header */}
          <div className="bg-[#5E2C5F] px-6 py-4 flex items-center justify-between gap-3 rounded-t-lg">
            <div className="flex items-center gap-3">
              <Headphones className="size-6 text-white" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Huddle in {huddleTitle}
              </h2>
            </div>
          </div>

          {/* Participant Preview */}
          <div className="p-4 bg-gray-50 min-h-[320px] flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="size-8 text-gray-500 animate-spin" />
            ) : displayParticipants.length > 0 ? (
              <div
                className={cn(
                  "w-full h-full max-w-7xl mx-auto",
                  displayParticipants.length === 1
                    ? "flex items-center justify-center h-full"
                    : displayParticipants.length === 2
                    ? "grid grid-cols-2 gap-4 h-full"
                    : displayParticipants.length === 3
                    ? "grid grid-cols-2 gap-4 auto-rows-fr"
                    : displayParticipants.length === 4
                    ? "grid grid-cols-2 gap-4"
                    : "grid grid-cols-3 gap-4"
                )}
              >
                {displayParticipants.map((participant, index) => {
                  // For 2 participants, fill height; for 3+, use aspect ratio
                  const participantCount = displayParticipants.length;
                  const shouldFillHeight = participantCount === 2;

                  // For 3 participants, third participant spans 2 columns
                  const isThirdParticipant =
                    participantCount === 3 && index === 2;

                  return (
                    <div
                      key={participant.id}
                      className={cn(
                        "relative flex flex-col items-center justify-center overflow-hidden rounded-lg bg-gray-200 transition-all",
                        participantCount === 1
                          ? "w-full h-full max-w-md"
                          : shouldFillHeight
                          ? "h-full"
                          : participantCount === 3 && isThirdParticipant
                          ? "col-span-2 aspect-video"
                          : "aspect-video"
                      )}
                    >
                      {/* Avatar that fills the area */}
                      <div className="absolute inset-0 w-full h-full">
                        <Avatar className="w-full h-full rounded-lg">
                          <AvatarImage
                            src={participant.image || undefined}
                            className="w-full h-full object-cover"
                          />
                          <AvatarFallback className="w-full h-full text-6xl font-bold bg-linear-to-br from-sky-400 to-purple-500 text-white flex items-center justify-center rounded-lg">
                            {participant.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>

                      {/* Participant Name and Status */}
                      <div className="absolute bottom-2 left-2 right-2 flex items-center bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-md z-10">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-white font-medium truncate">
                            {participant.isYou ? "You" : participant.name}
                          </span>
                          {participant.role === "host" && (
                            <span className="text-xs text-yellow-300 font-semibold shrink-0">
                              Host
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Headphones className="size-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No participants yet</p>
                </div>
              </div>
            )}
          </div>

          {/* Join Button */}
          <div className="px-6 py-5 bg-white border-t rounded-b-lg">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => onOpenChange(false)}
                disabled={isJoiningHuddle}
                variant="outline"
                className="flex-1 font-semibold py-6 text-base transition-all disabled:opacity-50"
                size="lg"
              >
                Cancel
              </Button>
              {hasActiveHuddle ? (
                <Button
                  onClick={handleJoin}
                  disabled={isJoiningHuddle}
                  className="flex-1 bg-[#5E2C5F] hover:bg-[#481349] text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  size="lg"
                >
                  <Headphones className="size-5 mr-2" />
                  {isJoiningHuddle &&
                  (currentStep === "joining" || currentStep === "starting")
                    ? "Joining..."
                    : "Join Huddle"}
                </Button>
              ) : (
                <Button
                  onClick={handleJoin}
                  disabled={isJoiningHuddle}
                  className="flex-1 bg-[#5E2C5F] hover:bg-[#481349] text-white font-semibold py-6 text-base shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  size="lg"
                >
                  <Headphones className="size-5 mr-2" />
                  Start Huddle
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
