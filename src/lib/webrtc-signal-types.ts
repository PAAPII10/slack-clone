/**
 * Type definitions for WebRTC signals from simple-peer
 * Signals are JSON-serializable objects that can be SDP offers/answers or ICE candidates
 * 
 * simple-peer uses RTCSessionDescriptionInit and RTCIceCandidateInit types
 * We use a more permissive type to accept these WebRTC types
 */

// Simple-peer signal type - accepts the actual WebRTC types used by simple-peer
// Using a union that includes the WebRTC types directly
export type WebRTCSignal =
  | RTCSessionDescriptionInit
  | RTCIceCandidateInit
  | {
      type: "offer" | "answer";
      sdp: string;
    }
  | {
      type: "candidate";
      candidate: string;
      sdpMLineIndex?: number | null;
      sdpMid?: string | null;
    }
  | { [key: string]: unknown }; // Fallback with index signature for other signal types
