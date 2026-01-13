"use client";

import { useCallback, useEffect, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { Track, LocalAudioTrack } from "livekit-client";
import { useHuddleAudioSettings } from "./use-huddle-audio-settings";

interface LiveKitAudioState {
  isMicEnabled: boolean;
  isConnected: boolean;
  currentMicDevice: string | null;
  currentSpeakerDevice: string | null;
  availableMics: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
}

/**
 * Hook to manage LiveKit audio settings
 * Provides functions to control mic, speakers, and audio processing
 */
export function useLiveKitAudio() {
  const { settings, updateSettings } = useHuddleAudioSettings();
  const [state, setState] = useState<LiveKitAudioState>({
    isMicEnabled: false,
    isConnected: false,
    currentMicDevice: null,
    currentSpeakerDevice: null,
    availableMics: [],
    availableSpeakers: [],
  });

  // Try to get room context (may not be available if not in LiveKitRoom)
  let room: ReturnType<typeof useRoomContext> | null = null;
  let localParticipant: ReturnType<typeof useLocalParticipant> | null = null;

  try {
    room = useRoomContext();
    localParticipant = useLocalParticipant();
  } catch {
    // Not inside LiveKitRoom context
  }

  // Enumerate available devices
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      const speakers = devices.filter((d) => d.kind === "audiooutput");

      setState((prev) => ({
        ...prev,
        availableMics: mics,
        availableSpeakers: speakers,
      }));
    } catch (err) {
      console.error("Error enumerating devices:", err);
    }
  }, []);

  // Update state based on room/participant
  useEffect(() => {
    if (!room) return;

    setState((prev) => ({
      ...prev,
      isConnected: room.state === "connected",
      isMicEnabled: localParticipant?.isMicrophoneEnabled ?? false,
    }));
  }, [room, room?.state, localParticipant?.isMicrophoneEnabled]);

  // Initial device enumeration
  useEffect(() => {
    refreshDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  // Switch microphone device
  const switchMicrophone = useCallback(
    async (deviceId: string | null) => {
      if (!room) {
        // Just update settings if not connected
        updateSettings({ selectedMicId: deviceId });
        return;
      }

      try {
        if (deviceId) {
          await room.switchActiveDevice("audioinput", deviceId);
          console.log("Switched microphone to:", deviceId);
        }
        updateSettings({ selectedMicId: deviceId });
        setState((prev) => ({ ...prev, currentMicDevice: deviceId }));
      } catch (err) {
        console.error("Error switching microphone:", err);
        throw err;
      }
    },
    [room, updateSettings]
  );

  // Switch speaker device
  const switchSpeaker = useCallback(
    async (deviceId: string | null) => {
      if (!room) {
        // Just update settings if not connected
        updateSettings({ selectedSpeakerId: deviceId });
        return;
      }

      try {
        if (deviceId) {
          await room.switchActiveDevice("audiooutput", deviceId);
          console.log("Switched speaker to:", deviceId);
        }
        updateSettings({ selectedSpeakerId: deviceId });
        setState((prev) => ({ ...prev, currentSpeakerDevice: deviceId }));
      } catch (err) {
        console.error("Error switching speaker:", err);
        throw err;
      }
    },
    [room, updateSettings]
  );

  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    if (!room || !localParticipant?.localParticipant) {
      console.warn("Cannot toggle mic: not connected to LiveKit");
      return;
    }

    const newEnabled = !localParticipant.isMicrophoneEnabled;
    await localParticipant.localParticipant.setMicrophoneEnabled(newEnabled);
  }, [room, localParticipant]);

  // Set microphone gain (volume)
  const setMicGain = useCallback(
    async (gain: number) => {
      updateSettings({ micGain: gain });

      // LiveKit doesn't have a direct gain control, but we can apply constraints
      // The gain is handled through Web Audio API in HuddleMediaProvider
      console.log("Mic gain updated:", gain);
    },
    [updateSettings]
  );

  // Set output volume
  const setOutputVolume = useCallback(
    (volume: number) => {
      updateSettings({ outputVolume: volume });
      console.log("Output volume updated:", volume);
    },
    [updateSettings]
  );

  // Update audio processing options
  const setAudioProcessing = useCallback(
    async (options: {
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
    }) => {
      updateSettings(options);

      // Apply to current track if connected
      if (!room || !localParticipant?.localParticipant) return;

      try {
        const micPub = localParticipant.localParticipant.getTrackPublication(
          Track.Source.Microphone
        );
        if (!micPub?.track) return;

        const mediaTrack = (micPub.track as LocalAudioTrack).mediaStreamTrack;
        if (mediaTrack && "applyConstraints" in mediaTrack) {
          await mediaTrack.applyConstraints({
            echoCancellation: options.echoCancellation ?? settings.echoCancellation,
            noiseSuppression: options.noiseSuppression ?? settings.noiseSuppression,
            autoGainControl: options.autoGainControl ?? settings.autoGainControl,
          });
          console.log("Applied audio processing constraints");
        }
      } catch (err) {
        console.warn("Error applying audio processing:", err);
      }
    },
    [room, localParticipant, settings, updateSettings]
  );

  // Restart audio track with new settings
  const restartAudioTrack = useCallback(async () => {
    if (!room || !localParticipant?.localParticipant) {
      console.warn("Cannot restart track: not connected");
      return;
    }

    try {
      // Disable and re-enable mic to apply new settings
      await localParticipant.localParticipant.setMicrophoneEnabled(false);
      
      // Short delay to ensure track is fully stopped
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Re-enable with current settings (will use room options)
      await localParticipant.localParticipant.setMicrophoneEnabled(true, {
        deviceId: settings.selectedMicId || undefined,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      });
      
      console.log("Restarted audio track with new settings");
    } catch (err) {
      console.error("Error restarting audio track:", err);
    }
  }, [room, localParticipant, settings]);

  return {
    // State
    ...state,
    settings,

    // Device management
    switchMicrophone,
    switchSpeaker,
    refreshDevices,

    // Audio control
    toggleMicrophone,
    setMicGain,
    setOutputVolume,
    setAudioProcessing,
    restartAudioTrack,
  };
}
