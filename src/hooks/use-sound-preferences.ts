import { useMemo } from "react";
import { SoundType } from "@/lib/sound-manager";
import { useGetSoundPreferences } from "@/features/userPreferences/api/use-get-sound-preferences";
import { useUpdateSoundPreferences } from "@/features/userPreferences/api/use-update-sound-preferences";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

export interface SoundPreferences {
  soundType: SoundType;
  volume: number; // 0.0 to 1.0
  enabled: boolean;
}

const DEFAULT_PREFERENCES: SoundPreferences = {
  soundType: "default",
  volume: 0.5,
  enabled: true,
};

/**
 * Hook to manage sound preferences using Convex (workspace/member-based)
 */
export function useSoundPreferences() {
  const workspaceId = useWorkspaceId();
  const { data, isLoading } = useGetSoundPreferences({
    workspaceId: workspaceId!,
  });
  const { mutate: updatePreferencesMutation } = useUpdateSoundPreferences();

  const preferences: SoundPreferences = useMemo(() => {
    return data ?? DEFAULT_PREFERENCES;
  }, [data]);

  const setSoundType = (soundType: SoundType) => {
    if (!workspaceId) return;
    updatePreferencesMutation({ workspaceId, soundType });
  };

  const setVolume = (volume: number) => {
    if (!workspaceId) return;
    updatePreferencesMutation({
      workspaceId,
      volume: Math.max(0, Math.min(1, volume)),
    });
  };

  const setEnabled = (enabled: boolean) => {
    if (!workspaceId) return;
    updatePreferencesMutation({ workspaceId, enabled });
  };

  const updatePreferences = (updates: Partial<SoundPreferences>) => {
    if (!workspaceId) return;
    updatePreferencesMutation({ workspaceId, ...updates });
  };

  return {
    preferences,
    isLoading,
    setSoundType,
    setVolume,
    setEnabled,
    updatePreferences,
  };
}
