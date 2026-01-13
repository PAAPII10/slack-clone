"use client";

import { atom, useAtom } from "jotai";
import { useEffect, useCallback } from "react";

interface HuddleAudioSettings {
  selectedMicId: string | null;
  selectedSpeakerId: string | null;
  micGain: number; // 0.0 to 1.0, default 0.6
  outputVolume: number; // 0.0 to 1.0, default 1.0
  echoCancellation: boolean; // default true
  noiseSuppression: boolean; // default true
  autoGainControl: boolean; // default true
  startMuted: boolean; // default false - join huddles with mic muted
}

const STORAGE_KEY = "huddle-audio-settings";
const DEFAULT_SETTINGS: HuddleAudioSettings = {
  selectedMicId: null,
  selectedSpeakerId: null,
  micGain: 0.6,
  outputVolume: 1.0,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true, // Enable by default for better noise handling
  startMuted: false,
};

// Load initial settings from localStorage
const loadSettings = (): HuddleAudioSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error("Error loading audio settings:", error);
  }

  return DEFAULT_SETTINGS;
};

// Create Jotai atom with initial value from localStorage
const huddleAudioSettingsAtom = atom<HuddleAudioSettings>(loadSettings());

/**
 * Hook to manage huddle audio settings with localStorage persistence
 * Uses Jotai for shared state across all components
 */
export function useHuddleAudioSettings() {
  const [settings, setSettings] = useAtom(huddleAudioSettingsAtom);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Error saving audio settings:", error);
    }
  }, [settings]);

  const updateSettings = useCallback(
    (updates: Partial<HuddleAudioSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    [setSettings]
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, [setSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
