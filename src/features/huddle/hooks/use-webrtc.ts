"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "simple-peer";
import { Id } from "../../../../convex/_generated/dataModel";
import { useSendSignal } from "../api/use-send-signal";
import { useGetSignals } from "../api/use-get-signals";
import { useHuddleParticipants } from "../api/use-huddle-participants";
import { useCurrentMember } from "@/features/members/api/use-current-member";
import { useWorkspaceId } from "@/hooks/use-workspace-id";

// Type for Peer with internal _pc property exposed
interface PeerWithPc extends Peer.Instance {
  _pc?: RTCPeerConnection;
}

interface PeerConnection {
  peer: Peer.Instance;
  memberId: Id<"members">;
  stream?: MediaStream;
}

interface UseWebRTCOptions {
  huddleId: Id<"huddles"> | null;
  localStream: MediaStream | null;
  enabled: boolean;
}

/**
 * Hook to manage WebRTC peer connections using simple-peer
 * Implements mesh topology: each participant connects to every other participant
 */
export function useWebRTC({
  huddleId,
  localStream,
  enabled,
}: UseWebRTCOptions) {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const { data: participants } = useHuddleParticipants({ huddleId });
  const { data: signals } = useGetSignals({ huddleId });
  const { sendSignal } = useSendSignal();

  const peersRef = useRef<Map<Id<"members">, PeerConnection>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const [remoteStreams, setRemoteStreams] = useState<
    Map<Id<"members">, MediaStream>
  >(new Map());
  const [isConnecting, setIsConnecting] = useState(false);
  const [peerCount, setPeerCount] = useState(0);

  // Determine if current member should be initiator
  const isInitiator = useCallback(
    (memberId: Id<"members">, peerId: Id<"members">) => {
      // Deterministic: member with higher ID is initiator
      return memberId > peerId;
    },
    []
  );

  // Create a peer connection to another member
  const createPeer = useCallback(
    (
      memberId: Id<"members">,
      peerMemberId: Id<"members">,
      initiator: boolean
    ) => {
      if (!huddleId || !currentMember) return null;

      // Log local stream info
      if (localStream) {
        console.log(`Creating peer for ${peerMemberId} with local stream:`, {
          audioTracks: localStream.getAudioTracks().length,
          videoTracks: localStream.getVideoTracks().length,
          audioEnabled: localStream.getAudioTracks().filter(t => t.enabled).length,
          videoEnabled: localStream.getVideoTracks().filter(t => t.enabled).length,
        });
      }

      const peer = new Peer({
        initiator,
        trickle: true,
        stream: localStream || undefined,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      // Handle signal events - send to Convex
      peer.on("signal", (data) => {
        sendSignal({
          huddleId,
          toMemberId: peerMemberId,
          signal: data,
        });
      });

      // Handle stream events - store remote stream
      peer.on("stream", (stream) => {
        console.log(`Received remote stream from ${peerMemberId}:`, {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracksEnabled: stream.getAudioTracks().filter(t => t.enabled).length,
        });
        
        // Ensure audio tracks are enabled
        stream.getAudioTracks().forEach((track) => {
          if (!track.enabled) {
            track.enabled = true;
            console.log(`Enabled audio track from ${peerMemberId}`);
          }
        });
        
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerMemberId, stream);
          return next;
        });
      });

      // Handle connection events
      peer.on("connect", () => {
        console.log(`Connected to peer ${peerMemberId}`);
        setIsConnecting(false);
      });

      peer.on("error", (err) => {
        // Filter out "wrong state" errors as they're often recoverable
        if (err instanceof Error) {
          if (err.message.includes("wrong state") || err.message.includes("stable")) {
            console.warn(`Peer ${peerMemberId} state warning (may recover):`, err.message);
            return;
          }
        }
        console.error(`Peer error with ${peerMemberId}:`, err);
      });

      peer.on("close", () => {
        console.log(`Connection closed with ${peerMemberId}`);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(peerMemberId);
          return next;
        });
      });

      return { peer, memberId, stream: localStream || undefined };
    },
    [huddleId, currentMember, localStream, sendSignal]
  );

  // Apply incoming signal to the correct peer
  const applySignal = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (signal: any, fromMemberId: Id<"members">, toMemberId: Id<"members">, signalId?: string) => {
      if (!currentMember || toMemberId !== currentMember._id) return;

      // Create unique signal ID to prevent duplicate processing
      const uniqueSignalId = signalId || `${fromMemberId}-${JSON.stringify(signal).slice(0, 50)}`;
      if (processedSignalsRef.current.has(uniqueSignalId)) {
        return; // Already processed this signal
      }

      const peerConnection = peersRef.current.get(fromMemberId);
      if (!peerConnection) {
        // Peer doesn't exist yet - might be created later, or signal is stale
        console.log(`Peer connection not found for ${fromMemberId}, signal may be stale`);
        return;
      }

      // Check if peer is destroyed
      const peerWithPc = peerConnection.peer as PeerWithPc;
      if (!peerWithPc._pc) {
        console.log(`Peer ${fromMemberId} has no RTCPeerConnection, ignoring signal`);
        return;
      }

      const pc = peerWithPc._pc;
      // Check connection state - skip if disconnected, failed, or closed
      const connectionState = pc.connectionState;
      if (connectionState === "disconnected" || connectionState === "failed" || connectionState === "closed") {
        console.log(`Peer ${fromMemberId} connection is ${connectionState}, ignoring signal`);
        return;
      }

      try {
        // Mark signal as processed before applying
        processedSignalsRef.current.add(uniqueSignalId);
        peerConnection.peer.signal(signal);
      } catch (error) {
        // Remove from processed set if it failed
        processedSignalsRef.current.delete(uniqueSignalId);
        
        // Check if error is because peer is destroyed or in wrong state
        if (error instanceof Error) {
          if (error.message.includes("destroyed")) {
            console.log(`Peer ${fromMemberId} was destroyed, removing from map`);
            peersRef.current.delete(fromMemberId);
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.delete(fromMemberId);
              return next;
            });
          } else if (error.message.includes("wrong state") || error.message.includes("stable")) {
            // Peer is in wrong state - might be a race condition
            // Log but don't fail - the peer might recover
            console.warn(`Peer ${fromMemberId} in wrong state (${pc.signalingState}), signal may be out of order:`, error.message);
          } else {
            console.error(`Error applying signal from ${fromMemberId}:`, error);
          }
        }
      }
    },
    [currentMember]
  );

  // Initialize peer connections when participants change
  useEffect(() => {
    if (!enabled || !huddleId || !currentMember || !participants) {
      // Cleanup all peers if disabled
      if (!enabled) {
        peersRef.current.forEach((peerConnection) => {
          try {
            peerConnection.peer.destroy();
          } catch {
            // Peer might already be destroyed
            console.log("Peer already destroyed during cleanup");
          }
        });
        peersRef.current.clear();
        processedSignalsRef.current.clear();
        // Use setTimeout to avoid setState in effect
        setTimeout(() => {
          setRemoteStreams(new Map());
          setPeerCount(0);
        }, 0);
      }
      return;
    }

    const currentMemberId = currentMember._id;
    const activeParticipants = participants.filter(
      (p) => p.memberId !== currentMemberId
    );

    // Remove peer connections for participants who left
    const activeMemberIds = new Set(activeParticipants.map((p) => p.memberId));
    peersRef.current.forEach((peerConnection, memberId) => {
      if (!activeMemberIds.has(memberId)) {
        try {
          peerConnection.peer.destroy();
        } catch {
          // Peer might already be destroyed
          console.log(`Peer ${memberId} already destroyed`);
        }
        peersRef.current.delete(memberId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(memberId);
          return next;
        });
        setPeerCount(peersRef.current.size);
      }
    });

    // Create peer connections for new participants
    activeParticipants.forEach((participant) => {
      const peerMemberId = participant.memberId;

      // Skip if peer already exists
      if (peersRef.current.has(peerMemberId)) {
        // Check if existing peer is still valid
        const existingPeer = peersRef.current.get(peerMemberId);
        if (existingPeer) {
          const peerWithPc = existingPeer.peer as PeerWithPc;
          if (peerWithPc._pc && peerWithPc._pc.connectionState !== "closed") {
            return; // Peer is still valid
          } else {
            // Peer is destroyed, remove it
            peersRef.current.delete(peerMemberId);
          }
        }
      }

      const initiator = isInitiator(currentMemberId, peerMemberId);
      const peerConnection = createPeer(
        currentMemberId,
        peerMemberId,
        initiator
      );

      if (peerConnection) {
        peersRef.current.set(peerMemberId, peerConnection);
        setIsConnecting(true);
        setPeerCount(peersRef.current.size);
      }
    });
  }, [enabled, huddleId, currentMember, participants, isInitiator, createPeer]);

  // Apply incoming signals
  useEffect(() => {
    if (!signals || !currentMember || !enabled) return;

    // Process signals in order, but skip if peer doesn't exist yet
    // Use a small delay to ensure peers are created before signals are applied
    const timeoutId = setTimeout(() => {
      signals.forEach((signalData) => {
        // Only apply signals that are for the current member
        if (signalData.toMemberId === currentMember._id) {
          // Use signal _id as unique identifier
          const signalId = `${signalData._id}-${signalData.fromMemberId}`;
          applySignal(
            signalData.signal,
            signalData.fromMemberId,
            signalData.toMemberId,
            signalId
          );
        }
      });
    }, 100); // Small delay to ensure peer is ready

    return () => clearTimeout(timeoutId);
  }, [signals, currentMember, applySignal, enabled]);

  // Update local stream tracks for all peers
  useEffect(() => {
    if (!localStream) return;

    peersRef.current.forEach((peerConnection) => {
      // Access internal RTCPeerConnection from simple-peer
      const peerWithPc = peerConnection.peer as PeerWithPc;
      const pc = peerWithPc._pc;
      if (!pc) return;

      // Get current senders
      const senders = pc.getSenders();

      // Update or add tracks
      localStream.getTracks().forEach((track) => {
        const existingSender = senders.find(
          (sender) => sender.track?.kind === track.kind
        );

        if (existingSender && existingSender.track) {
          // Replace existing track
          existingSender.replaceTrack(track).catch((err) => {
            console.error("Error replacing track:", err);
          });
        } else {
          // Add new track
          pc.addTrack(track, localStream);
        }
      });

      // Remove tracks that are no longer in the stream
      senders.forEach((sender) => {
        if (sender.track && !localStream.getTracks().includes(sender.track)) {
          pc.removeTrack(sender);
        }
      });

      peerConnection.stream = localStream;
    });
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    const peers = peersRef.current;
    const processedSignals = processedSignalsRef.current;
    return () => {
      peers.forEach((peerConnection) => {
        try {
          peerConnection.peer.destroy();
        } catch {
          // Peer might already be destroyed
        }
      });
      peers.clear();
      processedSignals.clear();
      setRemoteStreams(new Map());
      setPeerCount(0);
    };
  }, []);

  return {
    remoteStreams,
    isConnecting,
    peerCount,
  };
}
