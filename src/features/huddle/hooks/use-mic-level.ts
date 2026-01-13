"use client";

import { useEffect, useState, useRef } from "react";
import { getAudioContextConstructor } from "@/lib/audio-context-types";

/**
 * Hook to measure microphone input level (VU meter)
 * Returns level from 0.0 to 1.0
 */
export function useMicLevel(stream: MediaStream | null, enabled: boolean = true) {
  const [level, setLevel] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      setIsClipping(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      setIsClipping(false);
      return;
    }

    try {
      // Create AudioContext if needed
      const AudioContextClass = getAudioContextConstructor();
      if (!AudioContextClass) {
        console.warn("AudioContext not supported");
        return;
      }

      const audioContext = audioContextRef.current || new AudioContextClass();
      if (!audioContextRef.current) {
        audioContextRef.current = audioContext;
      }

      // Resume if suspended (required by some browsers)
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      // Create analyser node
      const analyser = analyserRef.current || audioContext.createAnalyser();
      if (!analyserRef.current) {
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
      }

      // Connect stream to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Analyze audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS (root mean square) for more accurate level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Normalize to 0-1 range (0-128 is typical range for byte data)
        const normalizedLevel = Math.min(rms / 128, 1.0);
        
        setLevel(normalizedLevel);
        setIsClipping(normalizedLevel > 0.95);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        source.disconnect();
        // Don't close audioContext as it might be reused
      };
    } catch (error) {
      console.error("Error setting up mic level monitoring:", error);
      setLevel(0);
      setIsClipping(false);
    }
  }, [stream, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return { level, isClipping };
}
