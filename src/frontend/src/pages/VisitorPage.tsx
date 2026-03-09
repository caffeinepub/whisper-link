import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Mic, MicOff, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage, SenderType } from "../backend";
import ParticlesCanvas from "../components/ParticlesCanvas";
import TypingIndicator from "../components/TypingIndicator";
import VoiceVisualizer from "../components/VoiceVisualizer";
import { useMessages } from "../hooks/useMessages";
import { useSessionState } from "../hooks/useSessionState";
import { useWebRTC } from "../hooks/useWebRTC";
import { getBackend } from "../utils/getBackend";

// --- Intro sequence words ---
const introWords = [
  "Hey\u2026",
  "I've",
  "been",
  "waiting",
  "to",
  "hear",
  "your",
  "voice",
  "\u2764\uFE0F",
];

function formatTimestamp(ts: bigint): string {
  const nowMs = Date.now();
  const msgMs = Number(ts) / 1_000_000; // nanoseconds → ms
  const diffSec = Math.floor((nowMs - msgMs) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isVisitor = msg.sender === SenderType.visitor;
  const isAI = msg.sender === SenderType.ai;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex ${isVisitor ? "justify-end" : "justify-start"} mb-2 px-2`}
    >
      <div
        className={`max-w-[75%] ${isVisitor ? "items-end" : "items-start"} flex flex-col gap-1`}
      >
        {isAI && (
          <Badge
            className="self-start text-[10px] px-1.5 py-0"
            style={{
              background: "oklch(0.45 0.18 295 / 0.8)",
              color: "oklch(0.95 0.02 320)",
              border: "1px solid oklch(0.55 0.18 295 / 0.4)",
            }}
          >
            AI
          </Badge>
        )}
        <div
          className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
          style={
            isVisitor
              ? {
                  background:
                    "linear-gradient(135deg, oklch(0.65 0.20 350) 0%, oklch(0.58 0.22 330) 100%)",
                  color: "oklch(0.98 0.01 0)",
                  boxShadow: "0 2px 12px oklch(0.60 0.22 350 / 0.3)",
                  borderBottomRightRadius: "4px",
                }
              : {
                  background: "oklch(0.28 0.10 290 / 0.75)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid oklch(0.45 0.12 305 / 0.35)",
                  color: "oklch(0.94 0.03 320)",
                  boxShadow: "0 2px 12px oklch(0.10 0.03 290 / 0.3)",
                  borderBottomLeftRadius: "4px",
                }
          }
        >
          {msg.text}
        </div>
        <span className="text-[10px] text-muted-foreground opacity-60 px-1">
          {formatTimestamp(msg.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

type Stage = "intro" | "permission" | "connected";

export default function VisitorPage() {
  const [stage, setStage] = useState<Stage>("intro");
  const [wordIndex, setWordIndex] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [isAdminTyping, setIsAdminTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const signalSinceRef = useRef<bigint>(BigInt(0));
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, isLoading, sendMessage } = useMessages(2000);
  const sessionState = useSessionState(3000);

  // Pass the captured stream so WebRTC doesn't re-request mic permission
  useWebRTC({
    role: "visitor",
    enabled: stage === "connected",
    existingStream: micStream,
  });

  // Intro animation: reveal words
  useEffect(() => {
    if (stage !== "intro") return;
    if (wordIndex < introWords.length) {
      const timer = setTimeout(() => {
        setWordIndex((prev) => prev + 1);
      }, 220);
      return () => clearTimeout(timer);
    }
    // Show CTA after all words + 0.8s
    const timer = setTimeout(() => setShowCTA(true), 800);
    return () => clearTimeout(timer);
  }, [wordIndex, stage]);

  // Poll for typing signals
  useEffect(() => {
    if (stage !== "connected") return;
    const interval = setInterval(async () => {
      try {
        const b = await getBackend();
        const signals = await b.getSignals("visitor", signalSinceRef.current);
        for (const signal of signals) {
          try {
            const data = JSON.parse(signal.payload);
            if (data.type === "typing") {
              setIsAdminTyping(true);
              if (typingTimeoutRef.current)
                clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(
                () => setIsAdminTyping(false),
                3000,
              );
            }
          } catch {
            /* ignore non-JSON signals */
          }
          if (signal.id > signalSinceRef.current) {
            signalSinceRef.current = signal.id;
          }
        }
      } catch (err) {
        console.error("Error polling signals:", err);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [stage]);

  // Auto-scroll chat
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolling on data change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isAdminTyping]);

  // Set visitor online on page load
  useEffect(() => {
    getBackend()
      .then((b) => b.setVisitorOnline(true))
      .catch(console.error);
    return () => {
      getBackend()
        .then((b) => b.setVisitorOnline(false))
        .catch(console.error);
    };
  }, []);

  const requestMicPermission = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Store the captured stream — WebRTC hook will reuse it, not request again
      setMicStream(stream);
    } catch (err) {
      // Mic denied or unavailable — still allow chat-only mode
      const msg = err instanceof Error ? err.message : "Microphone unavailable";
      setMicError(msg);
      console.warn("Mic permission denied, continuing in chat-only mode:", msg);
    }
    // Always proceed to connected stage regardless of mic outcome
    try {
      const b = await getBackend();
      await b.setVisitorOnline(true);
    } catch {
      // ignore backend errors during transition
    }
    setStage("connected");
  }, []);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput("");
    await sendMessage(text, SenderType.visitor);
  }, [chatInput, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMic = useCallback(() => {
    if (micStream) {
      for (const t of micStream.getAudioTracks()) {
        t.enabled = !t.enabled;
      }
      setIsMuted((prev) => !prev);
    }
  }, [micStream]);

  const isMicActive = !!micStream && !isMuted;

  return (
    <div className="relative min-h-screen overflow-hidden visitor-bg animate-gradient-shift">
      {/* Particles layer */}
      <div className="absolute inset-0 z-0">
        <ParticlesCanvas variant="visitor" count={45} />
      </div>

      {/* Cinematic intro overlay */}
      <AnimatePresence>
        {stage === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.10 0.06 340) 0%, oklch(0.16 0.09 310) 50%, oklch(0.10 0.05 265) 100%)",
            }}
          >
            <ParticlesCanvas variant="visitor" count={30} />

            <div className="relative z-10 flex flex-wrap justify-center gap-2 mb-8 max-w-lg text-center">
              {introWords.map((word, i) => (
                <motion.span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static array, stable order
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={
                    i < wordIndex ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }
                  }
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="font-display text-3xl sm:text-4xl md:text-5xl text-white"
                  style={{
                    textShadow: "0 2px 30px oklch(0.72 0.22 350 / 0.5)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </div>

            <AnimatePresence>
              {showCTA && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="relative z-10 flex flex-col items-center gap-4"
                >
                  <p
                    className="font-body text-base sm:text-lg text-center"
                    style={{ color: "oklch(0.85 0.08 330)" }}
                  >
                    Let me hear your voice\u2026
                  </p>
                  <Button
                    data-ocid="visitor.primary_button"
                    onClick={requestMicPermission}
                    className="relative px-8 py-6 text-base font-semibold rounded-full transition-all duration-300"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.65 0.22 350) 0%, oklch(0.55 0.20 320) 100%)",
                      color: "oklch(0.98 0.01 0)",
                      boxShadow: "0 0 30px oklch(0.65 0.22 350 / 0.5)",
                      border: "1px solid oklch(0.75 0.18 350 / 0.4)",
                    }}
                  >
                    <Mic className="mr-2 h-5 w-5" />
                    Allow Microphone
                  </Button>

                  {micError && (
                    <p
                      className="text-xs text-center mt-1"
                      style={{ color: "oklch(0.75 0.15 30)" }}
                    >
                      Mic unavailable \u2014 you can still chat
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main communication view */}
      <AnimatePresence>
        {stage === "connected" && (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative z-10 min-h-screen flex flex-col items-center justify-between px-4 py-6 sm:py-8"
          >
            {/* Connection status */}
            <motion.div
              data-ocid="connection.panel"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="w-full max-w-md flex items-center justify-center gap-2 mb-4"
            >
              <div
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm"
                style={{
                  background: "oklch(0.18 0.06 320 / 0.6)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid oklch(0.45 0.12 330 / 0.3)",
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    sessionState.adminOnline ? "bg-green-400" : "bg-yellow-400"
                  }`}
                  style={{
                    boxShadow: sessionState.adminOnline
                      ? "0 0 8px 2px oklch(0.75 0.25 150 / 0.7)"
                      : "0 0 8px 2px oklch(0.85 0.20 80 / 0.7)",
                  }}
                />
                <span style={{ color: "oklch(0.88 0.05 330)" }}>
                  {sessionState.adminOnline
                    ? "Connected \u2764\uFE0F"
                    : "Waiting for connection\u2026"}
                </span>
              </div>
            </motion.div>

            {/* Chat card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="w-full max-w-md flex-1 flex flex-col rounded-3xl shadow-glass overflow-hidden"
              style={{
                background: "oklch(0.18 0.06 320 / 0.4)",
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                border: "1px solid oklch(0.50 0.15 330 / 0.25)",
                maxHeight: "calc(100vh - 240px)",
                minHeight: "300px",
              }}
            >
              {/* Chat messages */}
              <div
                data-ocid="chat.list"
                ref={scrollRef}
                className="flex-1 overflow-y-auto chat-scroll py-4"
              >
                {isLoading && (
                  <div
                    data-ocid="chat.loading_state"
                    className="flex justify-center py-8"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full animate-typing-dot"
                          style={{
                            background: "oklch(0.72 0.22 350)",
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!isLoading && messages.length === 0 && (
                  <div
                    data-ocid="chat.empty_state"
                    className="flex flex-col items-center justify-center h-full py-12 gap-3"
                  >
                    <Heart
                      className="w-10 h-10 animate-heartbeat"
                      style={{ color: "oklch(0.72 0.22 350 / 0.6)" }}
                    />
                    <p
                      className="text-sm text-center"
                      style={{ color: "oklch(0.65 0.08 330)" }}
                    >
                      Your conversation will appear here\u2026
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <MessageBubble key={String(msg.id)} msg={msg} />
                ))}

                {isAdminTyping && <TypingIndicator label="typing" />}
              </div>

              {/* Input row */}
              <div
                className="flex items-center gap-2 p-3 border-t"
                style={{ borderColor: "oklch(0.40 0.10 320 / 0.25)" }}
              >
                <Input
                  data-ocid="visitor.textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write a message\u2026"
                  className="flex-1 rounded-full border-0 text-sm"
                  style={{
                    background: "oklch(0.25 0.07 315 / 0.6)",
                    color: "oklch(0.95 0.02 345)",
                    caretColor: "oklch(0.72 0.22 350)",
                  }}
                />
                <Button
                  data-ocid="visitor.submit_button"
                  onClick={handleSend}
                  disabled={!chatInput.trim()}
                  size="icon"
                  className="rounded-full shrink-0 transition-all duration-200"
                  style={{
                    background: chatInput.trim()
                      ? "linear-gradient(135deg, oklch(0.65 0.22 350), oklch(0.55 0.20 320))"
                      : "oklch(0.25 0.05 315 / 0.5)",
                    color: "oklch(0.98 0.01 0)",
                    border: "none",
                    boxShadow: chatInput.trim()
                      ? "0 0 16px oklch(0.65 0.22 350 / 0.4)"
                      : "none",
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>

            {/* Mic section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center gap-3 mt-6"
            >
              {/* Voice visualizer */}
              {micStream && (
                <VoiceVisualizer
                  stream={micStream}
                  isActive={isMicActive}
                  variant="visitor"
                />
              )}

              {/* Mic button — only show if mic is available */}
              {micStream ? (
                <div className="relative">
                  {/* Ripple rings */}
                  {isMicActive && (
                    <>
                      <div
                        className="absolute inset-0 rounded-full animate-ripple"
                        style={{ background: "oklch(0.72 0.22 350 / 0.2)" }}
                      />
                      <div
                        className="absolute inset-0 rounded-full animate-ripple"
                        style={{
                          background: "oklch(0.72 0.22 350 / 0.15)",
                          animationDelay: "0.5s",
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    data-ocid="mic.button"
                    onClick={toggleMic}
                    className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      background: isMuted
                        ? "oklch(0.22 0.05 310 / 0.8)"
                        : "linear-gradient(135deg, oklch(0.68 0.22 350) 0%, oklch(0.58 0.22 320) 100%)",
                      boxShadow:
                        !isMuted && isMicActive
                          ? "0 0 30px oklch(0.70 0.22 350 / 0.6), 0 0 60px oklch(0.60 0.20 320 / 0.3)"
                          : "0 4px 20px oklch(0.10 0.04 330 / 0.5)",
                      border: "2px solid oklch(0.75 0.18 350 / 0.3)",
                    }}
                  >
                    {isMuted ? (
                      <MicOff
                        className="w-7 h-7"
                        style={{ color: "oklch(0.70 0.08 330)" }}
                      />
                    ) : (
                      <Mic
                        className="w-7 h-7"
                        style={{ color: "oklch(0.98 0.01 0)" }}
                      />
                    )}
                  </button>
                </div>
              ) : (
                // Chat-only mode indicator
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                  style={{
                    background: "oklch(0.20 0.05 310 / 0.5)",
                    border: "1px solid oklch(0.38 0.08 320 / 0.3)",
                    color: "oklch(0.65 0.06 330)",
                  }}
                >
                  <MicOff className="w-3.5 h-3.5" />
                  Chat mode
                </div>
              )}

              {/* Mute toggle label */}
              {micStream && (
                <button
                  type="button"
                  data-ocid="visitor.toggle"
                  onClick={toggleMic}
                  className="text-xs transition-colors duration-200"
                  style={{ color: "oklch(0.65 0.08 330)" }}
                >
                  {isMuted
                    ? "Tap to unmute"
                    : isMicActive
                      ? "Listening\u2026"
                      : "Tap to speak"}
                </button>
              )}
            </motion.div>

            {/* Footer */}
            <footer className="mt-6 text-center">
              <p className="text-xs" style={{ color: "oklch(0.45 0.05 310)" }}>
                \u00A9 {new Date().getFullYear()}.{" "}
                <a
                  href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-70 transition-opacity"
                >
                  Built with \u2764\uFE0F using caffeine.ai
                </a>
              </p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
