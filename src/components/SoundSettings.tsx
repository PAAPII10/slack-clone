"use client";

import { useSoundPreferences } from "@/hooks/use-sound-preferences";
import { getAvailableSounds, playNotificationSound } from "@/lib/sound-manager";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Play } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function SoundSettings() {
  const { preferences, isLoading, setSoundType, setVolume, setEnabled } =
    useSoundPreferences();
  const availableSounds = getAvailableSounds();

  const handleTestSound = () => {
    playNotificationSound(preferences.soundType, preferences.volume);
  };

  if (isLoading) {
    return (
      <div className="px-5 py-4 bg-white rounded-lg border space-y-4">
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            Loading preferences...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-white rounded-lg border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Notification Sound</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose your preferred notification sound
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEnabled(!preferences.enabled)}
          title={preferences.enabled ? "Disable sounds" : "Enable sounds"}
          disabled={isLoading}
        >
          {preferences.enabled ? (
            <Volume2 className="size-4" />
          ) : (
            <VolumeX className="size-4" />
          )}
        </Button>
      </div>

      <Separator />

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Sound Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {availableSounds.map((sound) => (
              <button
                key={sound.type}
                onClick={() => {
                  setSoundType(sound.type);
                  // Play preview when selecting
                  if (preferences.enabled) {
                    playNotificationSound(sound.type, preferences.volume);
                  }
                }}
                disabled={isLoading}
                className={`px-3 py-2 text-sm rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  preferences.soundType === sound.type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-input"
                }`}
              >
                {sound.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">
              Volume
            </label>
            <span className="text-xs text-muted-foreground">
              {Math.round(preferences.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={preferences.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!preferences.enabled || isLoading}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleTestSound}
          disabled={!preferences.enabled || isLoading}
          className="w-full"
        >
          <Play className="size-4" />
          Test Sound
        </Button>
      </div>
    </div>
  );
}
