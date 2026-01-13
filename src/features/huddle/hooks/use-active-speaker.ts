"use client";

import { useState, useEffect, useRef } from "react";
import { Id } from "../../../../convex/_generated/dataModel";

interface UseActiveSpeakerOptions {
  isHuddleActive: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<Id<"members">, MediaStream>;
  currentMemberId: Id<"members"> | null;
}

/**
 * Hook to detect the active speaker in a huddle using Web Audio API
 * Returns the memberId of the participant who is currently speaking
 */
export function useActiveSpeaker({
  isHuddleActive,
  localStream,
  remoteStreams,
  currentMemberId,
}: UseActiveSpeakerOptions): Id<"members"> | null {
  const [activeSpeakerId, setActiveSpeakerId] = useState<Id<"members"> | null>(null);
  const audioContextsRef = useRef<
    Map<
      Id<"members">,
      { context: AudioContext; analyser: AnalyserNode; source: MediaStreamAudioSourceNode }
    >
  >(new Map());

  useEffect(() => {
    // Copy ref at the start for cleanup
    const contexts = audioContextsRef.current;

    if (!isHuddleActive) {
      // Cleanup all audio contexts
      contexts.forEach(({ context }) => {
        try {
          context.close();
        } catch {
          // Ignore errors
        }
      });
      contexts.clear();
      setTimeout(() => setActiveSpeakerId(null), 0);
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext not available for active speaker detection");
      return;
    }

    // Setup audio analysis for local stream
    if (localStream && currentMemberId) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks.some((t) => t.enabled)) {
        try {
          const existing = contexts.get(currentMemberId);
          if (!existing) {
            const context = new AudioContextClass();
            const source = context.createMediaStreamSource(localStream);
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            contexts.set(currentMemberId, { context, analyser, source });
          }
        } catch (error) {
          console.warn("Failed to setup local audio analysis:", error);
        }
      }
    }

    // Setup audio analysis for remote streams
    remoteStreams.forEach((stream, memberId) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks.some((t) => t.enabled)) {
        try {
          const existing = contexts.get(memberId);
          if (!existing) {
            const context = new AudioContextClass();
            const source = context.createMediaStreamSource(stream);
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            contexts.set(memberId, { context, analyser, source });
          }
        } catch (error) {
          console.warn(`Failed to setup audio analysis for ${memberId}:`, error);
        }
      }
    });

    // Cleanup removed streams
    const currentMemberIds = new Set([
      ...(currentMemberId ? [currentMemberId] : []),
      ...remoteStreams.keys(),
    ]);
    contexts.forEach(({ context }, memberId) => {
      if (!currentMemberIds.has(memberId)) {
        try {
          context.close();
        } catch {
          // Ignore errors
        }
        contexts.delete(memberId);
      }
    });

    // Analyze audio levels periodically
    const interval = setInterval(() => {
      let maxVolume = -Infinity;
      let activeSpeaker: Id<"members"> | null = null;

      contexts.forEach(({ analyser }, memberId) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume (focus on mid-range frequencies for voice)
        const midRangeStart = Math.floor(dataArray.length * 0.1); // Skip low frequencies
        const midRangeEnd = Math.floor(dataArray.length * 0.6); // Focus on mid frequencies
        const midRangeData = dataArray.slice(midRangeStart, midRangeEnd);
        const average =
          midRangeData.reduce((sum, value) => sum + value, 0) / midRangeData.length;

        // Adaptive threshold based on recent activity
        const SPEAKING_THRESHOLD = 8;

        if (average > SPEAKING_THRESHOLD && average > maxVolume) {
          maxVolume = average;
          activeSpeaker = memberId;
        }
      });

      setActiveSpeakerId(activeSpeaker);
    }, 200); // Check every 200ms for responsive detection

    return () => {
      clearInterval(interval);
      // Cleanup on unmount - use the contexts variable from effect start
      contexts.forEach(({ context }) => {
        try {
          context.close();
        } catch {
          // Ignore errors
        }
      });
      contexts.clear();
    };
  }, [isHuddleActive, localStream, remoteStreams, currentMemberId]);

  return activeSpeakerId;
}
