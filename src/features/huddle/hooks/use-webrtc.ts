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

      // Ensure local stream audio tracks are enabled before creating peer
      if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        console.log(`Creating peer for ${peerMemberId} with local stream:`, {
          audioTracks: localStream.getAudioTracks().length,
          videoTracks: localStream.getVideoTracks().length,
          audioEnabled: localStream.getAudioTracks().filter((t) => t.enabled)
            .length,
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
        console.error(`Peer error with ${peerMemberId}:`, err);

        // Handle abrupt disconnections (e.g., page reload, browser close)
        if (
          err.message?.includes("User-Initiated Abort") ||
          err.message?.includes("Close called")
        ) {
          console.log(
            `Peer ${peerMemberId} disconnected abruptly, cleaning up`
          );
          // Don't log as error - this is expected behavior
          peersRef.current.delete(peerMemberId);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(peerMemberId);
            return next;
          });
        }
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
    (signal: any, fromMemberId: Id<"members">, toMemberId: Id<"members">) => {
      if (!currentMember || toMemberId !== currentMember._id) return;

      const peerConnection = peersRef.current.get(fromMemberId);
      if (!peerConnection) {
        // Peer doesn't exist yet - might be created later, or signal is stale
        return;
      }

      // Check if peer is destroyed
      const peerWithPc = peerConnection.peer as PeerWithPc;
      if (!peerWithPc._pc) {
        // Peer has no RTCPeerConnection, it's likely destroyed
        console.log(
          `Peer ${fromMemberId} has no RTCPeerConnection, ignoring signal`
        );
        return;
      }

      const pc = peerWithPc._pc;
      // Check connection state - skip if disconnected, failed, or closed
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        console.log(
          `Peer ${fromMemberId} connection is ${pc.connectionState}, ignoring signal`
        );
        return;
      }

      // Check signaling state to avoid applying signals in wrong state
      const signalingState = pc.signalingState;

      // Detect signal type
      const isOffer = signal.type === "offer";
      const isAnswer = signal.type === "answer";

      // Validate signal against current state
      if (isAnswer && signalingState !== "have-local-offer") {
        // Received answer but not waiting for one - likely stale signal
        console.log(
          `Ignoring answer from ${fromMemberId}: signaling state is ${signalingState}, expected have-local-offer`
        );
        return;
      }

      if (isOffer && signalingState !== "stable") {
        // Received offer but not in stable state - connection might be negotiating
        console.log(
          `Ignoring offer from ${fromMemberId}: signaling state is ${signalingState}, expected stable`
        );
        return;
      }

      try {
        peerConnection.peer.signal(signal);
      } catch (error) {
        // Check if error is because peer is destroyed
        if (error instanceof Error && error.message.includes("destroyed")) {
          console.log(`Peer ${fromMemberId} was destroyed, removing from map`);
          peersRef.current.delete(fromMemberId);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(fromMemberId);
            return next;
          });
        } else {
          console.error(`Error applying signal from ${fromMemberId}:`, error);
        }
      }
    },
    [currentMember]
  );

  // Initialize peer connections when participants change or local stream becomes available
  useEffect(() => {
    if (!enabled || !huddleId || !currentMember || !participants) return;

    const currentMemberId = currentMember._id;
    const activeParticipants = participants.filter(
      (p) => p.memberId !== currentMemberId
    );

    // Create peer connections for new participants
    activeParticipants.forEach((participant) => {
      const peerMemberId = participant.memberId;

      // Skip if peer already exists
      if (peersRef.current.has(peerMemberId)) return;

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

    // Remove peer connections for participants who left
    const activeMemberIds = new Set(activeParticipants.map((p) => p.memberId));
    peersRef.current.forEach((peerConnection, memberId) => {
      if (!activeMemberIds.has(memberId)) {
        peerConnection.peer.destroy();
        peersRef.current.delete(memberId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(memberId);
          return next;
        });
        setPeerCount(peersRef.current.size);
      }
    });
  }, [
    enabled,
    huddleId,
    currentMember,
    participants,
    isInitiator,
    createPeer,
    localStream,
  ]);

  // Apply incoming signals
  useEffect(() => {
    if (!signals || !currentMember || !enabled) return;

    // Use a small delay to ensure peers are created before signals are applied
    const timeoutId = setTimeout(() => {
      signals.forEach((signalData) => {
        // Only apply signals that are for the current member
        if (signalData.toMemberId === currentMember._id) {
          // Check if peer exists before applying signal
          const peerConnection = peersRef.current.get(signalData.fromMemberId);
          if (peerConnection) {
            applySignal(
              signalData.signal,
              signalData.fromMemberId,
              signalData.toMemberId
            );
          }
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
    return () => {
      peers.forEach((peerConnection) => {
        peerConnection.peer.destroy();
      });
      peers.clear();
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
