"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useHuddleAudioSettings } from "../hooks/use-huddle-audio-settings";
import { useAudioDevices } from "../hooks/use-audio-devices";
import { useMicLevel } from "../hooks/use-mic-level";
import { useHuddleMedia } from "./HuddleMediaProvider";
import { Volume2, Mic, RefreshCw } from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { getAudioContextConstructor } from "@/lib/audio-context-types";
import { useRoomContext } from "@livekit/components-react";
import { Track, LocalAudioTrack } from "livekit-client";

/**
 * Audio & Video Settings Content Component
 *
 * Uses LiveKit's device and audio processing APIs when connected,
 * falls back to settings storage when not connected.
 */
export function AudioVideoSettings() {
  const { settings, updateSettings } = useHuddleAudioSettings();
  const {
    inputDevices,
    outputDevices,
    isLoading: devicesLoading,
    refresh: refreshDevices,
  } = useAudioDevices();
  const { localStream } = useHuddleMedia();
  const { level: micLevel, isClipping } = useMicLevel(localStream, true);
  const [isApplying, setIsApplying] = useState(false);

  // Try to get room context (may not be available if not in LiveKitRoom)
  let room: ReturnType<typeof useRoomContext> | null = null;
  try {
    room = useRoomContext();
  } catch {
    // Not inside LiveKitRoom context
  }

  const isConnected = room?.state === "connected";

  // Switch microphone using LiveKit or just save setting
  const handleMicChange = useCallback(
    async (deviceId: string) => {
      const actualDeviceId = deviceId === "default" ? null : deviceId;
      
      if (isConnected && room) {
        try {
          setIsApplying(true);
          if (actualDeviceId) {
            await room.switchActiveDevice("audioinput", actualDeviceId);
          }
          updateSettings({ selectedMicId: actualDeviceId });
          console.log("Switched microphone to:", actualDeviceId);
        } catch (err) {
          console.error("Error switching microphone:", err);
        } finally {
          setIsApplying(false);
        }
      } else {
        updateSettings({ selectedMicId: actualDeviceId });
      }
    },
    [isConnected, room, updateSettings]
  );

  // Switch speaker using LiveKit or just save setting
  const handleSpeakerChange = useCallback(
    async (deviceId: string) => {
      const actualDeviceId = deviceId === "default" ? null : deviceId;
      
      if (isConnected && room) {
        try {
          setIsApplying(true);
          if (actualDeviceId) {
            await room.switchActiveDevice("audiooutput", actualDeviceId);
          }
          updateSettings({ selectedSpeakerId: actualDeviceId });
          console.log("Switched speaker to:", actualDeviceId);
        } catch (err) {
          console.error("Error switching speaker:", err);
        } finally {
          setIsApplying(false);
        }
      } else {
        updateSettings({ selectedSpeakerId: actualDeviceId });
      }
    },
    [isConnected, room, updateSettings]
  );

  // Apply audio processing settings to LiveKit track
  const applyAudioProcessing = useCallback(
    async (updates: {
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
    }) => {
      // Always update settings
      updateSettings(updates);

      // If connected, apply to track
      if (isConnected && room?.localParticipant) {
        try {
          setIsApplying(true);
          const micPub = room.localParticipant.getTrackPublication(
            Track.Source.Microphone
          );
          if (micPub?.track) {
            const mediaTrack = (micPub.track as LocalAudioTrack).mediaStreamTrack;
            if (mediaTrack && "applyConstraints" in mediaTrack) {
              await mediaTrack.applyConstraints({
                echoCancellation: updates.echoCancellation ?? settings.echoCancellation,
                noiseSuppression: updates.noiseSuppression ?? settings.noiseSuppression,
                autoGainControl: updates.autoGainControl ?? settings.autoGainControl,
              });
              console.log("Applied audio constraints:", updates);
            }
          }
        } catch (err) {
          console.warn("Error applying audio processing:", err);
        } finally {
          setIsApplying(false);
        }
      }
    },
    [isConnected, room, settings, updateSettings]
  );

  // Restart audio track to apply all settings
  const handleRestartTrack = useCallback(async () => {
    if (!isConnected || !room?.localParticipant) {
      console.log("Not connected, settings will apply on next connection");
      return;
    }

    try {
      setIsApplying(true);
      
      // Disable and re-enable mic with new settings
      await room.localParticipant.setMicrophoneEnabled(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      await room.localParticipant.setMicrophoneEnabled(true, {
        deviceId: settings.selectedMicId || undefined,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      });
      
      console.log("Restarted audio track with new settings");
    } catch (err) {
      console.error("Error restarting audio track:", err);
    } finally {
      setIsApplying(false);
    }
  }, [isConnected, room, settings]);

  // Test sound for speaker output
  const handleTestSound = () => {
    // Create a simple beep sound
    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      console.warn("AudioContext not supported");
      return;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 440; // A4 note
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      settings.outputVolume * 0.3,
      audioContext.currentTime + 0.01
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.2
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  };

  // Mic level visualization
  const micLevelPercent = Math.round(micLevel * 100);
  const micLevelBars = useMemo(() => {
    const bars = 20;
    const filledBars = Math.round(micLevel * bars);
    return Array.from({ length: bars }, (_, i) => i < filledBars);
  }, [micLevel]);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded">
          <div className="size-2 rounded-full bg-green-500" />
          Connected to LiveKit - changes apply immediately
        </div>
      )}

      {/* Microphone Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Microphone</h3>
        </div>

        {/* Microphone Device Selector */}
        <div className="space-y-2">
          <Label htmlFor="mic-device">Input Device</Label>
          <Select
            value={settings.selectedMicId || "default"}
            onValueChange={handleMicChange}
            disabled={isApplying}
          >
            <SelectTrigger id="mic-device" className="w-full min-w-0">
              <SelectValue
                placeholder="Select microphone"
                className="truncate"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Microphone</SelectItem>
              {inputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshDevices}
            className="text-xs"
            disabled={devicesLoading || isApplying}
          >
            {devicesLoading ? "Refreshing..." : "Refresh Devices"}
          </Button>
        </div>

        {/* Microphone Gain Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="mic-gain">Input Volume</Label>
            <span className="text-xs text-muted-foreground">
              {Math.round(settings.micGain * 100)}%
            </span>
          </div>
          <Slider
            id="mic-gain"
            min={0}
            max={100}
            step={1}
            value={[settings.micGain * 100]}
            onValueChange={([value]) =>
              updateSettings({ micGain: value / 100 })
            }
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Adjust your microphone input volume. Default: 60%
          </p>
        </div>

        {/* Live Mic Level Meter */}
        {localStream && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Microphone Level</Label>
              <span
                className={`text-xs font-mono ${
                  isClipping
                    ? "text-red-500 font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                {micLevelPercent}%{isClipping && " (CLIPPING)"}
              </span>
            </div>
            <div className="flex gap-0.5 h-4">
              {micLevelBars.map((filled, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-colors ${
                    isClipping
                      ? "bg-red-500"
                      : i < micLevelBars.length * 0.7
                      ? filled
                        ? "bg-green-500"
                        : "bg-gray-200"
                      : i < micLevelBars.length * 0.9
                      ? filled
                        ? "bg-yellow-500"
                        : "bg-gray-200"
                      : filled
                      ? "bg-red-500"
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Speak into your microphone to see the level
            </p>
          </div>
        )}

        {/* Audio Processing Toggles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="echo-cancellation">Echo Cancellation</Label>
              <p className="text-xs text-muted-foreground">
                Reduces echo from speakers
              </p>
            </div>
            <Switch
              id="echo-cancellation"
              checked={settings.echoCancellation}
              disabled={isApplying}
              onCheckedChange={(checked) =>
                applyAudioProcessing({ echoCancellation: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="noise-suppression">Noise Suppression</Label>
              <p className="text-xs text-muted-foreground">
                Reduces background noise (strongly recommended)
              </p>
            </div>
            <Switch
              id="noise-suppression"
              checked={settings.noiseSuppression}
              disabled={isApplying}
              onCheckedChange={(checked) =>
                applyAudioProcessing({ noiseSuppression: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-gain">Auto Gain Control</Label>
              <p className="text-xs text-muted-foreground">
                Automatically adjusts volume and helps reduce noise
              </p>
            </div>
            <Switch
              id="auto-gain"
              checked={settings.autoGainControl}
              disabled={isApplying}
              onCheckedChange={(checked) =>
                applyAudioProcessing({ autoGainControl: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-muted">Start Muted</Label>
              <p className="text-xs text-muted-foreground">
                Join huddles with microphone muted by default
              </p>
            </div>
            <Switch
              id="start-muted"
              checked={settings.startMuted}
              onCheckedChange={(checked) =>
                updateSettings({ startMuted: checked })
              }
            />
          </div>

          {/* Apply Settings Button - for restarting track with all settings */}
          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestartTrack}
              disabled={isApplying}
              className="w-full mt-2"
            >
              <RefreshCw className={`size-3 mr-2 ${isApplying ? "animate-spin" : ""}`} />
              {isApplying ? "Applying..." : "Apply All Audio Settings"}
            </Button>
          )}
        </div>
      </div>

      {/* Speaker Section */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Volume2 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Speaker</h3>
        </div>

        {/* Speaker Device Selector */}
        {outputDevices.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="speaker-device">Output Device</Label>
            <Select
              value={settings.selectedSpeakerId || "default"}
              onValueChange={handleSpeakerChange}
              disabled={isApplying}
            >
              <SelectTrigger id="speaker-device" className="w-full min-w-0">
                <SelectValue
                  placeholder="Select speaker"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Speaker</SelectItem>
                {outputDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="speaker-device">Output Device</Label>
            <p className="text-xs text-muted-foreground">
              Speaker selection not supported in this browser
            </p>
          </div>
        )}

        {/* Output Volume Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="output-volume">Output Volume</Label>
            <span className="text-xs text-muted-foreground">
              {Math.round(settings.outputVolume * 100)}%
            </span>
          </div>
          <Slider
            id="output-volume"
            min={0}
            max={100}
            step={1}
            value={[settings.outputVolume * 100]}
            onValueChange={([value]) =>
              updateSettings({ outputVolume: value / 100 })
            }
            className="w-full"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestSound}
              className="text-xs"
            >
              <Volume2 className="size-3 mr-1" />
              Test Sound
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
