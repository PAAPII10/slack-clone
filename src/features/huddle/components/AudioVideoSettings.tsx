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
import { Volume2, Mic } from "lucide-react";
import { useMemo } from "react";
import { getAudioContextConstructor } from "@/lib/audio-context-types";

/**
 * Audio & Video Settings Content Component
 *
 * Extracted from HuddleSettingsDialog for use in unified settings
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
            onValueChange={(value) =>
              updateSettings({
                selectedMicId: value === "default" ? null : value,
              })
            }
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
            disabled={devicesLoading}
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
              onCheckedChange={(checked) =>
                updateSettings({ echoCancellation: checked })
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
              onCheckedChange={(checked) =>
                updateSettings({ noiseSuppression: checked })
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
              onCheckedChange={(checked) =>
                updateSettings({ autoGainControl: checked })
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
              onValueChange={(value) =>
                updateSettings({
                  selectedSpeakerId: value === "default" ? null : value,
                })
              }
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
