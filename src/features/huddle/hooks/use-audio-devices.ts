"use client";

import { useState, useEffect, useCallback } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

/**
 * Hook to enumerate and monitor audio devices
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Request permission first by getting user media
      // This ensures device labels are available
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (permError) {
        // Permission denied - we can still enumerate but labels will be empty
        console.warn("Microphone permission not granted:", permError);
      }

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      
      const audioDevices: AudioDevice[] = deviceList
        .filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `${device.kind === "audioinput" ? "Microphone" : "Speaker"} ${device.deviceId.slice(0, 8)}`,
          kind: device.kind,
        }));

      setDevices(audioDevices);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to enumerate devices");
      setError(error);
      console.error("Error enumerating devices:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial enumeration
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [enumerateDevices]);

  const getInputDevices = useCallback(() => {
    return devices.filter((d) => d.kind === "audioinput");
  }, [devices]);

  const getOutputDevices = useCallback(() => {
    return devices.filter((d) => d.kind === "audiooutput");
  }, [devices]);

  return {
    devices,
    inputDevices: getInputDevices(),
    outputDevices: getOutputDevices(),
    isLoading,
    error,
    refresh: enumerateDevices,
  };
}
