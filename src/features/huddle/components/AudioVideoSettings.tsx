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
import { useLiveKitToken } from "@/features/live-kit/store/use-live-kit-token";
import { Volume2, Mic, Video, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  Component,
  ReactNode,
} from "react";
import {
  useLocalParticipant,
  useMediaDevices,
} from "@livekit/components-react";
import {
  LocalAudioTrack,
  LocalVideoTrack,
  createLocalAudioTrack,
  TrackProcessor,
  Track,
} from "livekit-client";

/**
 * Audio & Video Settings Content Component
 *
 * Full implementation with all features from communication-channel:
 * - Microphone: Device selection, volume control, noise suppression, echo cancellation, auto gain
 * - Speaker: Device selection, volume control
 * - Camera: Device selection
 */
/**
 * Wrapper component that only uses LiveKit hooks when in room context
 * This component MUST be rendered inside LiveKitRoom context
 * The error boundary will catch errors if not in context
 */
function AudioVideoSettingsContent() {
  const { settings, updateSettings } = useHuddleAudioSettings();

  // Always call hooks unconditionally (React rules)
  // These will throw if not in room context - error boundary will catch it
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  // Get available devices using LiveKit hook
  const audioInputDevices = useMediaDevices({ kind: "audioinput" });
  const audioOutputDevices = useMediaDevices({ kind: "audiooutput" });
  const videoInputDevices = useMediaDevices({ kind: "videoinput" });

  // State for device selection
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>("");
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");
  const [isApplying, setIsApplying] = useState(false);

  // Helper to get audio track
  const getAudioTrack = useCallback((): LocalAudioTrack | null => {
    if (!localParticipant) return null;
    for (const publication of localParticipant.audioTrackPublications.values()) {
      if (publication.track instanceof LocalAudioTrack) {
        return publication.track;
      }
    }
    return null;
  }, [localParticipant]);

  // Helper to get video track
  const getVideoTrack = useCallback((): LocalVideoTrack | null => {
    if (!localParticipant) return null;
    for (const publication of localParticipant.videoTrackPublications.values()) {
      if (publication.track instanceof LocalVideoTrack) {
        return publication.track;
      }
    }
    return null;
  }, [localParticipant]);

  // Track if we're recreating to avoid loops
  const isRecreatingRef = useRef(false);
  // Track previous constraint values to only recreate when they actually change
  const prevConstraintsRef = useRef<{
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  } | null>(null);
  // Track previous volume to only recreate when it changes significantly
  const prevVolumeRef = useRef<number | null>(null);
  // Store gain node reference for volume control
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Get current device IDs
  useEffect(() => {
    const updateCurrentDevices = async () => {
      const audioTrack = getAudioTrack();
      if (audioTrack) {
        try {
          const deviceId = await audioTrack.getDeviceId();
          if (deviceId) setSelectedAudioInput(deviceId);
        } catch (e) {
          logger.error("Failed to get audio input device", e as Error);
        }
      }

      const videoTrack = getVideoTrack();
      if (videoTrack) {
        try {
          const deviceId = await videoTrack.getDeviceId();
          if (deviceId) setSelectedVideoInput(deviceId);
        } catch (e) {
          logger.error("Failed to get video input device", e as Error);
        }
      }
    };

    if (localParticipant) {
      updateCurrentDevices();
    }
  }, [localParticipant, getAudioTrack, getVideoTrack]);

  // Create a gain processor for volume control
  const createGainProcessor = useCallback(
    (volume: number): TrackProcessor<Track.Kind.Audio> => {
      let sourceNode: MediaStreamAudioSourceNode | null = null;
      let gainNode: GainNode | null = null;
      let destination: MediaStreamAudioDestinationNode | null = null;
      let processorAudioContext: AudioContext | null = null;

      const processor: TrackProcessor<Track.Kind.Audio> = {
        name: "volume-gain-processor",
        async init(opts) {
          if (!opts.audioContext) {
            throw new Error("AudioContext is required");
          }
          processorAudioContext = opts.audioContext;
          const stream = new MediaStream([opts.track]);
          sourceNode = processorAudioContext.createMediaStreamSource(stream);
          gainNode = processorAudioContext.createGain();
          destination = processorAudioContext.createMediaStreamDestination();

          // Apply volume directly - allow 0 when input is 0%
          const maxGain = 1.0; // 100% maximum
          const normalizedVolume = volume; // Already 0-1
          const adjustedGain = normalizedVolume * maxGain; // Can be 0 when input is 0%

          gainNode.gain.value = adjustedGain;
          sourceNode.connect(gainNode);
          gainNode.connect(destination);

          // Store reference for dynamic updates
          gainNodeRef.current = gainNode;
          audioContextRef.current = processorAudioContext;

          // Set processed track
          processor.processedTrack = destination.stream.getAudioTracks()[0];
        },
        async restart(opts) {
          await processor.destroy();
          await processor.init(opts);
        },
        async destroy() {
          if (sourceNode) {
            try {
              sourceNode.disconnect();
            } catch {
              // Ignore disconnect errors
            }
            sourceNode = null;
          }
          if (gainNode) {
            try {
              gainNode.disconnect();
            } catch {
              // Ignore disconnect errors
            }
            gainNode = null;
          }
          if (destination) {
            try {
              destination.stream.getTracks().forEach((track) => track.stop());
            } catch {
              // Ignore stop errors
            }
            destination = null;
          }
          gainNodeRef.current = null;
          audioContextRef.current = null;
        },
      };
      return processor;
    },
    []
  );

  // Initialize processor on existing track immediately when available
  useEffect(() => {
    const initializeProcessor = async () => {
      const audioTrack = getAudioTrack();
      if (!audioTrack || !isMicrophoneEnabled || !localParticipant) {
        return;
      }

      // Check if track already has a processor
      if (audioTrack.getProcessor() || gainNodeRef.current) {
        return;
      }

      try {
        // Create AudioContext for processor
        const AudioContextClass =
          window.AudioContext ||
          (window as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) {
          return;
        }

        const audioContext = new AudioContextClass({
          latencyHint: "interactive",
        });

        // Ensure AudioContext is running
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        // Set AudioContext on the track
        audioTrack.setAudioContext(audioContext);

        // Create gain processor for volume control
        const processor = createGainProcessor(settings.micGain);

        // Set the processor (this will initialize it)
        await audioTrack.setProcessor(processor);

        logger.debug("Initialized volume processor on existing track");
      } catch (error) {
        logger.error("Failed to initialize volume processor", error as Error);
      }
    };

    // Run immediately when track becomes available
    if (localParticipant) {
      initializeProcessor();
    }
  }, [
    localParticipant,
    isMicrophoneEnabled,
    settings.micGain,
    getAudioTrack,
    createGainProcessor,
  ]);

  // Recreate audio track with new constraints and volume
  const recreateAudioTrack = useCallback(async () => {
    const currentTrack = getAudioTrack();
    if (!currentTrack || !isMicrophoneEnabled || !localParticipant) return;

    try {
      setIsApplying(true);
      // Get current device ID
      const currentDeviceId =
        selectedAudioInput || (await currentTrack.getDeviceId());

      // Unpublish old track
      const publication = Array.from(
        localParticipant.audioTrackPublications.values()
      ).find((pub) => pub.track === currentTrack);
      if (publication) {
        await localParticipant.unpublishTrack(currentTrack, true);
      }

      // Create AudioContext for processor
      const AudioContextClass =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("AudioContext is not supported in this browser");
      }
      const audioContext = new AudioContextClass({
        latencyHint: "interactive",
      });

      // Ensure AudioContext is running
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Create new track WITHOUT processor first
      const newTrack = await createLocalAudioTrack({
        deviceId: currentDeviceId || undefined,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      });

      // Set AudioContext on the track (required before setting processor)
      newTrack.setAudioContext(audioContext);

      // Create gain processor for volume control
      const processor = createGainProcessor(settings.micGain);

      // Now set the processor (this will initialize it with the AudioContext)
      await newTrack.setProcessor(processor);

      // Publish new track
      await localParticipant.publishTrack(newTrack);

      // Update selected device
      const newDeviceId = await newTrack.getDeviceId();
      if (newDeviceId) setSelectedAudioInput(newDeviceId);

      logger.debug("Recreated audio track with constraints and volume", {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        micGain: settings.micGain,
      });
    } catch (error) {
      logger.error("Failed to recreate audio track", error as Error);
      alert("Failed to apply audio settings. Please try again.");
    } finally {
      setIsApplying(false);
    }
  }, [
    localParticipant,
    isMicrophoneEnabled,
    selectedAudioInput,
    settings.echoCancellation,
    settings.noiseSuppression,
    settings.autoGainControl,
    settings.micGain,
    getAudioTrack,
    createGainProcessor,
  ]);

  // Recreate track when constraints change (but not on initial panel open)
  useEffect(() => {
    // Skip if we're already recreating
    if (isRecreatingRef.current) {
      isRecreatingRef.current = false;
      return;
    }

    // Skip if panel just opened (initial state)
    if (!prevConstraintsRef.current) {
      prevConstraintsRef.current = {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      };
      return;
    }

    // Only recreate if constraints actually changed
    const constraintsChanged =
      prevConstraintsRef.current.echoCancellation !==
        settings.echoCancellation ||
      prevConstraintsRef.current.noiseSuppression !==
        settings.noiseSuppression ||
      prevConstraintsRef.current.autoGainControl !== settings.autoGainControl;

    if (!constraintsChanged) {
      return;
    }

    // Update previous constraints
    prevConstraintsRef.current = {
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    };

    const audioTrack = getAudioTrack();
    if (audioTrack && isMicrophoneEnabled && localParticipant) {
      // Debounce to avoid recreating on every change
      const timeoutId = setTimeout(() => {
        recreateAudioTrack();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [
    settings.noiseSuppression,
    settings.echoCancellation,
    settings.autoGainControl,
    isMicrophoneEnabled,
    localParticipant,
    recreateAudioTrack,
    getAudioTrack,
  ]);

  // Apply input volume - Update gain node if it exists, otherwise recreate track
  useEffect(() => {
    const audioTrack = getAudioTrack();
    if (!audioTrack || !isMicrophoneEnabled || !localParticipant) {
      return;
    }

    // If gain node exists (from processor), update it directly
    if (gainNodeRef.current) {
      try {
        // Apply volume directly - allow 0 when input is 0%
        const maxGain = 1.0; // 100% maximum
        const normalizedVolume = settings.micGain;
        const adjustedGain = normalizedVolume * maxGain; // Can be 0 when input is 0%

        gainNodeRef.current.gain.value = adjustedGain;
        logger.debug("Updated input volume", {
          inputVolume: `${Math.round(settings.micGain * 100)}%`,
          adjustedGain,
        });
        return;
      } catch (error) {
        logger.error("Failed to update gain node", error as Error);
      }
    }

    // If no gain node exists and volume changed significantly, recreate track
    const volumeChanged =
      prevVolumeRef.current === null ||
      Math.abs((prevVolumeRef.current || 0) - settings.micGain) > 0.05; // Only recreate if change > 5%

    if (volumeChanged && localParticipant) {
      prevVolumeRef.current = settings.micGain;
      // Debounce to avoid recreating on every slider movement
      const timeoutId = setTimeout(() => {
        isRecreatingRef.current = true;
        recreateAudioTrack();
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [
    settings.micGain,
    isMicrophoneEnabled,
    localParticipant,
    getAudioTrack,
    recreateAudioTrack,
  ]);

  // Switch microphone - save setting and switch device
  const handleMicChange = useCallback(
    async (deviceId: string) => {
      const actualDeviceId = deviceId === "default" ? null : deviceId;
      updateSettings({ selectedMicId: actualDeviceId });
      setSelectedAudioInput(deviceId);

      try {
        const audioTrack = getAudioTrack();
        if (audioTrack && localParticipant) {
          // Unpublish old track
          const publication = Array.from(
            localParticipant.audioTrackPublications.values()
          ).find((pub) => pub.track === audioTrack);
          if (publication) {
            await localParticipant.unpublishTrack(audioTrack, true);
          }

          // Create new track with new device and current constraints
          isRecreatingRef.current = true;
          const newTrack = await createLocalAudioTrack({
            deviceId: actualDeviceId || undefined,
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
          });

          // Set AudioContext and processor if needed
          const AudioContextClass =
            window.AudioContext ||
            (window as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass({
              latencyHint: "interactive",
            });
            if (audioContext.state === "suspended") {
              await audioContext.resume();
            }
            newTrack.setAudioContext(audioContext);
            const processor = createGainProcessor(settings.micGain);
            await newTrack.setProcessor(processor);
          }

          // Publish new track
          await localParticipant.publishTrack(newTrack);
          setSelectedAudioInput(deviceId);
        } else {
          alert("No audio track found. Please enable your microphone first.");
        }
      } catch (error) {
        logger.error("Failed to switch audio input device", error as Error);
        alert("Failed to switch microphone. Please try again.");
      }
    },
    [
      updateSettings,
      getAudioTrack,
      localParticipant,
      settings,
      createGainProcessor,
    ]
  );

  // Switch speaker - save setting and switch device
  const handleSpeakerChange = useCallback(
    async (deviceId: string) => {
      const actualDeviceId = deviceId === "default" ? null : deviceId;
      updateSettings({ selectedSpeakerId: actualDeviceId });
      setSelectedAudioOutput(deviceId);

      try {
        // Use setSinkId on all audio elements (used by RoomAudioRenderer)
        const audioElements = document.querySelectorAll("audio");
        if (audioElements.length === 0) {
          alert("No audio elements found. Audio may not be playing yet.");
          return;
        }

        const promises = Array.from(audioElements).map(async (audio) => {
          if (
            "setSinkId" in audio &&
            typeof (
              audio as HTMLAudioElement & {
                setSinkId?: (id: string) => Promise<void>;
              }
            ).setSinkId === "function"
          ) {
            try {
              await (
                audio as HTMLAudioElement & {
                  setSinkId: (id: string) => Promise<void>;
                }
              ).setSinkId(deviceId);
              logger.debug("Set audio output device", { deviceId });
            } catch (e) {
              logger.error("Failed to set sink ID", e as Error);
              throw e;
            }
          } else {
            logger.warn("setSinkId not supported on this browser");
          }
        });

        await Promise.all(promises);
      } catch (error) {
        logger.error("Failed to switch audio output device", error as Error);
        alert(
          "Failed to switch speaker. Browser may not support this feature or audio is not playing."
        );
      }
    },
    [updateSettings]
  );

  // Switch video device
  const handleVideoChange = useCallback(
    async (deviceId: string) => {
      try {
        const videoTrack = getVideoTrack();
        if (videoTrack) {
          await videoTrack.setDeviceId(deviceId);
          setSelectedVideoInput(deviceId);
        } else {
          alert("No video track found. Please enable your camera first.");
        }
      } catch (error) {
        logger.error("Failed to switch video input device", error as Error);
        alert("Failed to switch camera. Please try again.");
      }
    },
    [getVideoTrack]
  );

  // Apply audio processing settings
  const applyAudioProcessing = useCallback(
    async (updates: {
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
    }) => {
      // Always update settings
      updateSettings(updates);
      // Track recreation will happen via useEffect
    },
    [updateSettings]
  );

  // Apply output volume
  useEffect(() => {
    // Set volume on all audio elements (used by RoomAudioRenderer)
    const audioElements = document.querySelectorAll("audio");
    if (audioElements.length > 0) {
      audioElements.forEach((audio) => {
        audio.volume = settings.outputVolume;
      });
      logger.debug("Output volume set", {
        outputVolume: `${Math.round(settings.outputVolume * 100)}%`,
      });
    }
  }, [settings.outputVolume]);

  // Test sound for speaker output
  const handleTestSound = () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      logger.warn("AudioContext not supported");
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

  // Check if connected to LiveKit room
  const isConnected = !!localParticipant;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      {isConnected && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded">
          <div className="size-2 rounded-full bg-green-500" />
          Connected - changes apply immediately
        </div>
      )}

      {/* Microphone Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Microphone</h3>
          {isConnected && (
            <div
              className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                isMicrophoneEnabled
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {isMicrophoneEnabled ? "On" : "Off"}
            </div>
          )}
        </div>

        {/* Microphone Device Selector */}
        <div className="space-y-2">
          <Label htmlFor="mic-device">Input Device</Label>
          <Select
            value={selectedAudioInput || settings.selectedMicId || "default"}
            onValueChange={handleMicChange}
            disabled={isApplying || !isConnected}
          >
            <SelectTrigger id="mic-device" className="w-full min-w-0">
              <SelectValue
                placeholder="Select microphone"
                className="truncate"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Microphone</SelectItem>
              {audioInputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            disabled={!isConnected || !isMicrophoneEnabled}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Adjust your microphone input volume. Minimum 10% to preserve
            speaking detection.
          </p>
        </div>

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
              disabled={isApplying || !isConnected}
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
              disabled={isApplying || !isConnected}
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
              disabled={isApplying || !isConnected}
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
              onClick={recreateAudioTrack}
              disabled={isApplying}
              className="w-full mt-2"
            >
              <RefreshCw
                className={`size-3 mr-2 ${isApplying ? "animate-spin" : ""}`}
              />
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
        {audioOutputDevices.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="speaker-device">Output Device</Label>
            <Select
              value={
                selectedAudioOutput || settings.selectedSpeakerId || "default"
              }
              onValueChange={handleSpeakerChange}
              disabled={isApplying || !isConnected}
            >
              <SelectTrigger id="speaker-device" className="w-full min-w-0">
                <SelectValue
                  placeholder="Select speaker"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Speaker</SelectItem>
                {audioOutputDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Output device switching requires browser support (Chrome/Edge)
            </p>
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
            disabled={!isConnected}
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

      {/* Camera Section */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Video className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Camera</h3>
          {isConnected && (
            <div
              className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                isCameraEnabled
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {isCameraEnabled ? "On" : "Off"}
            </div>
          )}
        </div>

        {/* Camera Device Selector */}
        <div className="space-y-2">
          <Label htmlFor="camera-device">Video Device</Label>
          <Select
            value={selectedVideoInput || "default"}
            onValueChange={handleVideoChange}
            disabled={isApplying || !isConnected || !isCameraEnabled}
          >
            <SelectTrigger id="camera-device" className="w-full min-w-0">
              <SelectValue placeholder="Select camera" className="truncate" />
            </SelectTrigger>
            <SelectContent>
              {videoInputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Resolution is automatically optimized based on your connection and
            device capabilities.
          </p>
        </div>

        {/* Start with Camera Toggle */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="start-with-camera">Start with Camera</Label>
              <p className="text-xs text-muted-foreground">
                Join huddles with camera enabled by default
              </p>
            </div>
            <Switch
              id="start-with-camera"
              checked={settings.startWithCamera}
              onCheckedChange={(checked) =>
                updateSettings({ startWithCamera: checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Error boundary component to catch LiveKit hook errors
 */
class AudioSettingsErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Log error but don't show to user - we'll show fallback
    if (error.message.includes("No room provided")) {
      logger.debug("Not in LiveKit room context for settings");
    } else {
      logger.error("Error in AudioVideoSettings", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Main export - wraps content and handles room context check
 */
export function AudioVideoSettings() {
  const [liveKitToken] = useLiveKitToken();
  const isInRoom = !!liveKitToken?.token && !!liveKitToken?.url;

  const fallbackUI = (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
        <div className="size-2 rounded-full bg-amber-500" />
        Settings require an active huddle connection
      </div>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Please join a huddle to access audio and video settings.
        </p>
      </div>
    </div>
  );

  // If not in room, show message
  if (!isInRoom) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
          <div className="size-2 rounded-full bg-amber-500" />
          Not connected to a huddle - join a huddle to configure audio/video
          settings
        </div>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Audio and video settings are only available when you are in an
            active huddle. Join a huddle to configure your microphone, camera,
            and other media settings.
          </p>
        </div>
      </div>
    );
  }

  // If in room, render with error boundary to catch hook errors
  // The error boundary will catch "No room provided" errors
  return (
    <AudioSettingsErrorBoundary fallback={fallbackUI}>
      <AudioVideoSettingsContent />
    </AudioSettingsErrorBoundary>
  );
}
