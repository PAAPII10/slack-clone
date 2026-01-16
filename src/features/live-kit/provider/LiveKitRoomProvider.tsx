import { LiveKitRoom } from "@livekit/components-react";
import { useLiveKitToken } from "../store/use-live-kit-token";
import { useHuddleAudioSettings } from "@/features/huddle/hooks/use-huddle-audio-settings";

export function LiveKitRoomProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { settings } = useHuddleAudioSettings();
  const [liveKitToken, setLiveKitToken] = useLiveKitToken();

  const handleDisconnect = () => {
    setLiveKitToken(null);
  };

  const hasToken = !!(liveKitToken?.token && liveKitToken?.url);

  return (
    <LiveKitRoom
      key="livekit-room-provider"
      video={settings.startWithCamera}
      audio={!settings.startMuted}
      token={liveKitToken?.token || ""}
      serverUrl={liveKitToken?.url || ""}
      data-lk-theme="default"
      onDisconnected={handleDisconnect}
      className="h-screen w-screen"
      connect={hasToken}
    >
      {children}
    </LiveKitRoom>
  );
}
