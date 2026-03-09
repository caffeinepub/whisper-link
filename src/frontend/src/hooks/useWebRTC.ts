import { useCallback, useEffect, useRef, useState } from "react";
import { getBackend } from "../utils/getBackend";

interface UseWebRTCOptions {
  role: "visitor" | "admin";
  enabled?: boolean;
  /** Pre-captured stream to use instead of requesting getUserMedia again */
  existingStream?: MediaStream | null;
}

interface WebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  error: string | null;
}

export function useWebRTC({
  role,
  enabled = false,
  existingStream,
}: UseWebRTCOptions) {
  const [state, setState] = useState<WebRTCState>({
    isConnected: false,
    isConnecting: false,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    error: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalSinceRef = useRef<bigint>(BigInt(0));
  const signalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Track if we already processed an offer to avoid duplicate handling
  const offerProcessedRef = useRef(false);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          const candidatePayload = JSON.stringify({
            type: "ice",
            candidate: event.candidate.toJSON(),
          });
          const targetRole = role === "visitor" ? "admin" : "visitor";
          const b = await getBackend();
          await b.postSignal(targetRole, candidatePayload);
        } catch (err) {
          console.error("Error posting ICE candidate:", err);
        }
      }
    };

    pc.ontrack = (event) => {
      if (!mountedRef.current) return;
      const remoteStream = event.streams[0];
      setState((prev) => ({ ...prev, remoteStream }));

      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(console.error);
    };

    pc.onconnectionstatechange = () => {
      if (!mountedRef.current) return;
      const s = pc.connectionState;
      if (s === "connected") {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
        }));
      } else if (s === "disconnected" || s === "failed" || s === "closed") {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
        }));
      }
    };

    pcRef.current = pc;
    return pc;
  }, [role]);

  /**
   * Get a local audio stream. Prefers the existingStream passed in props
   * to avoid prompting the user twice.
   */
  const getLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    // Use pre-captured stream if available
    if (existingStream?.active) {
      localStreamRef.current = existingStream;
      setState((prev) => ({ ...prev, localStream: existingStream }));
      return existingStream;
    }
    // Re-use already captured stream
    if (localStreamRef.current?.active) {
      return localStreamRef.current;
    }
    // Fall back to requesting a new stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setState((prev) => ({ ...prev, localStream: stream }));
      return stream;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Microphone access denied";
      setState((prev) => ({ ...prev, error: errorMsg }));
      return null;
    }
  }, [existingStream]);

  const startSignalPolling = useCallback(() => {
    if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);

    signalIntervalRef.current = setInterval(async () => {
      try {
        const b = await getBackend();
        const signals = await b.getSignals(role, signalSinceRef.current);
        if (signals.length > 0) {
          for (const signal of signals) {
            try {
              await processSignal(signal.payload);
            } catch (e) {
              console.error("Error processing signal:", e);
            }
            if (signal.id > signalSinceRef.current) {
              signalSinceRef.current = signal.id;
            }
          }
        }
      } catch (err) {
        console.error("Error polling signals:", err);
      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const processSignal = useCallback(
    async (payload: string) => {
      let data: { type: string; sdp?: string; candidate?: RTCIceCandidateInit };
      try {
        data = JSON.parse(payload);
      } catch {
        return;
      }

      if (data.type === "offer" && role === "visitor") {
        // Avoid processing the same offer multiple times
        if (offerProcessedRef.current) return;

        // Create peer connection if it doesn't exist
        const pc = pcRef.current ?? createPeerConnection();

        const stream = await getLocalStream();
        if (!stream) {
          console.warn("No local stream available for WebRTC offer");
          // Still try to answer without audio track
        }

        try {
          if (stream) {
            for (const track of stream.getTracks()) {
              // Avoid adding duplicate tracks
              const senders = pc.getSenders();
              const alreadyAdded = senders.some(
                (s) => s.track?.id === track.id,
              );
              if (!alreadyAdded) {
                pc.addTrack(track, stream);
              }
            }
          }

          if (pc.signalingState !== "stable") {
            console.warn(
              "PC not in stable state, skipping offer",
              pc.signalingState,
            );
            return;
          }

          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: data.sdp }),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const b = await getBackend();
          await b.postSignal(
            "admin",
            JSON.stringify({ type: "answer", sdp: answer.sdp }),
          );
          offerProcessedRef.current = true;
          setState((prev) => ({ ...prev, isConnecting: true }));
        } catch (err) {
          console.error("Error processing offer:", err);
          offerProcessedRef.current = false;
        }
      } else if (data.type === "answer" && role === "admin") {
        if (!pcRef.current) return;
        if (pcRef.current.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: data.sdp }),
          );
        }
      } else if (data.type === "ice" && data.candidate) {
        if (!pcRef.current) return;
        try {
          if (
            pcRef.current.remoteDescription &&
            pcRef.current.signalingState !== "closed"
          ) {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate),
            );
          }
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, getLocalStream, createPeerConnection],
  );

  // Admin: start a voice session (create offer)
  const startVoiceSession = useCallback(async () => {
    if (role !== "admin") return;
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    const stream = await getLocalStream();
    if (!stream) {
      setState((prev) => ({ ...prev, isConnecting: false }));
      return;
    }

    const pc = createPeerConnection();
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const b = await getBackend();
      await b.postSignal(
        "visitor",
        JSON.stringify({ type: "offer", sdp: offer.sdp }),
      );

      startSignalPolling();
    } catch (err) {
      console.error("Error creating offer:", err);
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: "Failed to start voice session",
      }));
    }
  }, [role, createPeerConnection, getLocalStream, startSignalPolling]);

  // Visitor: passively listen for signals once enabled
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when enabled toggles; createPeerConnection/startSignalPolling/role are stable for the lifetime of the visitor role
  useEffect(() => {
    if (role !== "visitor" || !enabled) return;
    mountedRef.current = true;
    offerProcessedRef.current = false;
    createPeerConnection();
    startSignalPolling();
    return () => {
      mountedRef.current = false;
      if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);
    };
  }, [enabled]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current ?? existingStream;
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      for (const track of audioTracks) {
        track.enabled = !track.enabled;
      }
      setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, [existingStream]);

  const endSession = useCallback(async () => {
    if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    offerProcessedRef.current = false;
    setState({
      isConnected: false,
      isConnecting: false,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      error: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      if (pcRef.current) pcRef.current.close();
    };
  }, []);

  return {
    ...state,
    startVoiceSession,
    toggleMute,
    endSession,
    startSignalPolling,
  };
}
