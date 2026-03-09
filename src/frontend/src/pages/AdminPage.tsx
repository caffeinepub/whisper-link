import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  Send,
  Settings2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ChatMessage, SenderType } from "../backend";
import ParticlesCanvas from "../components/ParticlesCanvas";
import TypingIndicator from "../components/TypingIndicator";
import VoiceVisualizer from "../components/VoiceVisualizer";
import { useAdminSettings } from "../hooks/useAdminSettings";
import { useMessages } from "../hooks/useMessages";
import { useSessionState } from "../hooks/useSessionState";
import { useWebRTC } from "../hooks/useWebRTC";
import { getBackend } from "../utils/getBackend";

function formatTimestamp(ts: bigint): string {
  const nowMs = Date.now();
  const msgMs = Number(ts) / 1_000_000;
  const diffSec = Math.floor((nowMs - msgMs) / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function AdminMessageBubble({ msg }: { msg: ChatMessage }) {
  const isAdmin = msg.sender === SenderType.admin;
  const isAI = msg.sender === SenderType.ai;
  const isRight = isAdmin || isAI;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex ${isRight ? "justify-end" : "justify-start"} mb-2 px-2`}
    >
      <div
        className={`max-w-[75%] flex flex-col gap-1 ${isRight ? "items-end" : "items-start"}`}
      >
        {isAI && (
          <Badge
            className="self-end text-[10px] px-1.5 py-0"
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
            isRight
              ? {
                  background:
                    "linear-gradient(135deg, oklch(0.60 0.22 280) 0%, oklch(0.50 0.20 260) 100%)",
                  color: "oklch(0.97 0.01 0)",
                  boxShadow: "0 2px 12px oklch(0.50 0.22 280 / 0.35)",
                  borderBottomRightRadius: "4px",
                }
              : {
                  background: "oklch(0.22 0.05 275 / 0.75)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid oklch(0.40 0.10 280 / 0.35)",
                  color: "oklch(0.90 0.03 310)",
                  boxShadow: "0 2px 12px oklch(0.05 0.02 280 / 0.3)",
                  borderBottomLeftRadius: "4px",
                }
          }
        >
          {msg.text}
        </div>
        <span
          className="text-[10px] opacity-50 px-1"
          style={{ color: "oklch(0.60 0.05 280)" }}
        >
          {formatTimestamp(msg.timestamp)}
        </span>
      </div>
    </motion.div>
  );
}

// --- AI Processing ---
async function fetchAIResponse(
  messages: ChatMessage[],
  openAIKey: string,
): Promise<string> {
  const systemPrompt =
    "You are a warm, affectionate person having a private conversation. Respond naturally and emotionally. Keep responses to 1-3 sentences.";
  const chatHistory = messages.slice(-10).map((m) => ({
    role: m.sender === SenderType.visitor ? "user" : "assistant",
    content: m.text,
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
      max_tokens: 150,
      temperature: 0.85,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() ?? "I'm here with you… ❤️";
}

async function playElevenLabsTTS(
  text: string,
  elevenLabsKey: string,
  voiceId = "21m00Tcm4TlvDq8ikWAM",
) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": elevenLabsKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

// ═══════════════════════════════════
//   PIN Login Gate
// ═══════════════════════════════════
function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const b = await getBackend();
      const valid = await b.verifyAdminPin(pin);
      if (valid) {
        onSuccess();
      } else {
        setError("Invalid PIN. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        setPin("");
      }
    } catch {
      setError("Connection error. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden admin-bg animate-gradient-shift flex items-center justify-center px-4">
      <ParticlesCanvas variant="admin" count={25} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={`relative z-10 w-full max-w-sm ${shake ? "animate-shake" : ""}`}
      >
        <div
          className="rounded-3xl p-8 shadow-glass-admin"
          style={{
            background: "oklch(0.14 0.04 275 / 0.65)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            border: "1px solid oklch(0.40 0.12 280 / 0.3)",
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.60 0.22 280), oklch(0.50 0.20 260))",
                boxShadow: "0 0 30px oklch(0.60 0.22 280 / 0.4)",
              }}
            >
              <Radio
                className="w-7 h-7"
                style={{ color: "oklch(0.97 0.01 0)" }}
              />
            </div>
            <h1
              className="font-display text-2xl font-bold mb-1"
              style={{ color: "oklch(0.95 0.03 300)" }}
            >
              Whisper Link
            </h1>
            <p className="text-sm" style={{ color: "oklch(0.55 0.06 280)" }}>
              Admin Dashboard — Enter PIN
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin" style={{ color: "oklch(0.70 0.08 280)" }}>
                Access PIN
              </Label>
              <Input
                id="pin"
                data-ocid="admin.input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN…"
                className="text-center tracking-widest text-lg rounded-xl border-0 h-12"
                style={{
                  background: "oklch(0.20 0.05 278 / 0.7)",
                  color: "oklch(0.92 0.03 290)",
                  caretColor: "oklch(0.65 0.25 280)",
                }}
                autoFocus
              />
            </div>

            {error && (
              <motion.p
                data-ocid="admin.error_state"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-center rounded-lg px-3 py-2"
                style={{
                  color: "oklch(0.75 0.18 25)",
                  background: "oklch(0.60 0.22 25 / 0.15)",
                  border: "1px solid oklch(0.60 0.22 25 / 0.25)",
                }}
              >
                {error}
              </motion.p>
            )}

            <Button
              data-ocid="admin.submit_button"
              type="submit"
              disabled={isLoading || !pin.trim()}
              className="w-full h-12 rounded-xl font-semibold text-base"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.62 0.22 280), oklch(0.52 0.20 260))",
                color: "oklch(0.97 0.01 0)",
                border: "none",
                boxShadow: "0 0 20px oklch(0.60 0.22 280 / 0.3)",
              }}
            >
              {isLoading ? "Verifying…" : "Enter Dashboard"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════
//   Admin Dashboard
// ═══════════════════════════════════
function AdminDashboard() {
  const [chatInput, setChatInput] = useState("");
  const [openAIKey, setOpenAIKey] = useState(
    () => sessionStorage.getItem("openai_key") || "",
  );
  const [elevenLabsKey, setElevenLabsKey] = useState(
    () => sessionStorage.getItem("elevenlabs_key") || "",
  );
  const [showKeys, setShowKeys] = useState(false);
  const [isMarkingTyping, setIsMarkingTyping] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [respondedIds] = useState<Set<string>>(() => new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, isLoading, sendMessage } = useMessages(2000);
  const sessionState = useSessionState(3000);
  const { settings, updateSettings } = useAdminSettings();

  const {
    isConnected: isVoiceConnected,
    isConnecting: isVoiceConnecting,
    localStream,
    isMuted: isVoiceMuted,
    startVoiceSession,
    toggleMute: toggleVoiceMute,
    endSession: endVoiceSession,
  } = useWebRTC({ role: "admin" });

  // Online status
  useEffect(() => {
    getBackend()
      .then((b) => b.setAdminOnline(true))
      .catch(console.error);
    return () => {
      getBackend()
        .then((b) => b.setAdminOnline(false))
        .catch(console.error);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolling on data change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // AI auto-response
  useEffect(() => {
    if (!settings.aiMode || !openAIKey.trim()) return;

    const newVisitorMessages = messages.filter(
      (m) => m.sender === SenderType.visitor && !respondedIds.has(String(m.id)),
    );

    if (newVisitorMessages.length === 0) return;

    const processMessages = async () => {
      for (const msg of newVisitorMessages) {
        respondedIds.add(String(msg.id));
        setAiProcessing(true);
        try {
          const aiResponse = await fetchAIResponse(messages, openAIKey);
          const b = await getBackend();
          await b.sendMessage(aiResponse, SenderType.ai);

          if (settings.aiVoice && elevenLabsKey.trim()) {
            await playElevenLabsTTS(aiResponse, elevenLabsKey);
          }
        } catch (err) {
          console.error("AI response error:", err);
        } finally {
          setAiProcessing(false);
        }
      }
    };

    processMessages();
  }, [
    messages,
    settings.aiMode,
    settings.aiVoice,
    openAIKey,
    elevenLabsKey,
    respondedIds,
  ]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput("");
    await sendMessage(text, SenderType.admin);
  }, [chatInput, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTypingSignal = useCallback(async () => {
    if (isMarkingTyping) return;
    setIsMarkingTyping(true);
    try {
      const b = await getBackend();
      await b.postSignal(
        "visitor",
        JSON.stringify({ type: "typing", value: true }),
      );
    } catch (err) {
      console.error("Error sending typing signal:", err);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(
      () => setIsMarkingTyping(false),
      3000,
    );
  }, [isMarkingTyping]);

  const saveKeys = () => {
    sessionStorage.setItem("openai_key", openAIKey);
    sessionStorage.setItem("elevenlabs_key", elevenLabsKey);
    setShowKeys(false);
  };

  const cardStyle = {
    background: "oklch(0.14 0.04 275 / 0.55)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid oklch(0.35 0.10 280 / 0.3)",
  };

  return (
    <div className="relative min-h-screen overflow-hidden admin-bg animate-gradient-shift">
      <ParticlesCanvas variant="admin" count={20} />

      <div
        data-ocid="admin.panel"
        className="relative z-10 min-h-screen flex flex-col max-w-5xl mx-auto px-4 py-4"
      >
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.60 0.22 280), oklch(0.50 0.20 260))",
                boxShadow: "0 0 20px oklch(0.60 0.22 280 / 0.35)",
              }}
            >
              <Radio
                className="w-5 h-5"
                style={{ color: "oklch(0.97 0.01 0)" }}
              />
            </div>
            <h1
              className="font-display text-xl font-bold"
              style={{ color: "oklch(0.93 0.04 290)" }}
            >
              Whisper Link — Admin
            </h1>
          </div>

          <div data-ocid="connection.panel" className="flex items-center gap-3">
            {/* Visitor status */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: "oklch(0.18 0.05 278 / 0.7)",
                border: "1px solid oklch(0.35 0.08 280 / 0.35)",
                color: "oklch(0.80 0.05 285)",
              }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${sessionState.visitorOnline ? "bg-emerald-400" : "bg-slate-500"}`}
              />
              Visitor {sessionState.visitorOnline ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-4 flex-1">
          {/* Left column: Controls */}
          <div className="lg:w-72 flex flex-col gap-4">
            {/* Mode control */}
            <div className="rounded-2xl p-4" style={cardStyle}>
              <div className="flex items-center gap-2 mb-3">
                <Settings2
                  className="w-4 h-4"
                  style={{ color: "oklch(0.65 0.15 280)" }}
                />
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "oklch(0.80 0.06 285)" }}
                >
                  Response Mode
                </h2>
              </div>

              {/* AI Mode toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "oklch(0.88 0.04 285)" }}
                  >
                    {settings.aiMode ? "AI Mode" : "Live Mode"}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "oklch(0.55 0.05 278)" }}
                  >
                    {settings.aiMode
                      ? "AI responds automatically"
                      : "You respond manually"}
                  </p>
                </div>
                <Switch
                  data-ocid="admin.toggle"
                  checked={settings.aiMode}
                  onCheckedChange={(v) => updateSettings(v, settings.aiVoice)}
                  style={
                    {
                      "--switch-bg": settings.aiMode
                        ? "oklch(0.60 0.22 280)"
                        : undefined,
                    } as React.CSSProperties
                  }
                />
              </div>

              {/* Mode badge */}
              <div
                className="mt-1 px-3 py-1.5 rounded-xl text-center text-xs font-medium"
                style={
                  settings.aiMode
                    ? {
                        background: "oklch(0.55 0.18 280 / 0.25)",
                        color: "oklch(0.75 0.18 280)",
                        border: "1px solid oklch(0.55 0.18 280 / 0.3)",
                      }
                    : {
                        background: "oklch(0.60 0.18 150 / 0.2)",
                        color: "oklch(0.70 0.18 150)",
                        border: "1px solid oklch(0.60 0.18 150 / 0.3)",
                      }
                }
              >
                {settings.aiMode ? (
                  <>
                    <Bot className="inline w-3 h-3 mr-1" />
                    AI Mode Active
                  </>
                ) : (
                  <>
                    <Radio className="inline w-3 h-3 mr-1" />
                    Live Mode
                  </>
                )}
              </div>

              {/* AI Voice sub-toggle */}
              <AnimatePresence>
                {settings.aiMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Separator
                      className="my-3"
                      style={{ background: "oklch(0.30 0.06 278 / 0.5)" }}
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: "oklch(0.85 0.04 285)" }}
                        >
                          AI Voice
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "oklch(0.50 0.05 278)" }}
                        >
                          ElevenLabs TTS
                        </p>
                      </div>
                      <Switch
                        data-ocid="admin.secondary_button"
                        checked={settings.aiVoice}
                        onCheckedChange={(v) =>
                          updateSettings(settings.aiMode, v)
                        }
                      />
                    </div>

                    {aiProcessing && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg"
                        style={{
                          background: "oklch(0.50 0.18 280 / 0.2)",
                          border: "1px solid oklch(0.50 0.18 280 / 0.3)",
                        }}
                      >
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="w-1 h-1 rounded-full animate-typing-dot"
                              style={{
                                background: "oklch(0.65 0.22 280)",
                                animationDelay: `${i * 0.15}s`,
                              }}
                            />
                          ))}
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "oklch(0.65 0.12 280)" }}
                        >
                          AI is processing…
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* API Keys */}
            <div className="rounded-2xl p-4" style={cardStyle}>
              <button
                type="button"
                onClick={() => setShowKeys((v) => !v)}
                className="flex items-center justify-between w-full"
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: "oklch(0.80 0.06 285)" }}
                >
                  API Keys
                </span>
                {showKeys ? (
                  <EyeOff
                    className="w-4 h-4"
                    style={{ color: "oklch(0.55 0.06 280)" }}
                  />
                ) : (
                  <Eye
                    className="w-4 h-4"
                    style={{ color: "oklch(0.55 0.06 280)" }}
                  />
                )}
              </button>

              <AnimatePresence>
                {showKeys && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-3 space-y-3"
                  >
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs"
                        style={{ color: "oklch(0.60 0.06 280)" }}
                      >
                        OpenAI API Key
                      </Label>
                      <Input
                        type="password"
                        value={openAIKey}
                        onChange={(e) => setOpenAIKey(e.target.value)}
                        placeholder="sk-..."
                        className="text-xs h-9 rounded-lg border-0"
                        style={{
                          background: "oklch(0.18 0.05 278 / 0.7)",
                          color: "oklch(0.88 0.03 290)",
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs"
                        style={{ color: "oklch(0.60 0.06 280)" }}
                      >
                        ElevenLabs API Key
                      </Label>
                      <Input
                        type="password"
                        value={elevenLabsKey}
                        onChange={(e) => setElevenLabsKey(e.target.value)}
                        placeholder="xi-api-key..."
                        className="text-xs h-9 rounded-lg border-0"
                        style={{
                          background: "oklch(0.18 0.05 278 / 0.7)",
                          color: "oklch(0.88 0.03 290)",
                        }}
                      />
                    </div>
                    <Button
                      data-ocid="admin.save_button"
                      onClick={saveKeys}
                      size="sm"
                      className="w-full h-8 text-xs rounded-lg"
                      style={{
                        background: "oklch(0.55 0.18 280)",
                        color: "oklch(0.97 0.01 0)",
                        border: "none",
                      }}
                    >
                      Save Keys
                    </Button>
                    <p
                      className="text-[10px] text-center"
                      style={{ color: "oklch(0.45 0.04 278)" }}
                    >
                      Keys stored in session memory only
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice panel */}
            <div className="rounded-2xl p-4" style={cardStyle}>
              <div className="flex items-center gap-2 mb-3">
                <Mic
                  className="w-4 h-4"
                  style={{ color: "oklch(0.65 0.15 280)" }}
                />
                <h2
                  className="text-sm font-semibold"
                  style={{ color: "oklch(0.80 0.06 285)" }}
                >
                  Voice Session
                </h2>
              </div>

              <div
                className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-lg text-xs"
                style={{
                  background: isVoiceConnected
                    ? "oklch(0.60 0.18 150 / 0.2)"
                    : isVoiceConnecting
                      ? "oklch(0.70 0.18 80 / 0.2)"
                      : "oklch(0.22 0.04 278 / 0.5)",
                  color: isVoiceConnected
                    ? "oklch(0.72 0.18 150)"
                    : isVoiceConnecting
                      ? "oklch(0.78 0.18 80)"
                      : "oklch(0.55 0.05 280)",
                }}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isVoiceConnected
                      ? "bg-emerald-400"
                      : isVoiceConnecting
                        ? "bg-yellow-400"
                        : "bg-slate-600"
                  }`}
                />
                {isVoiceConnected
                  ? "Voice Connected"
                  : isVoiceConnecting
                    ? "Connecting…"
                    : "Not connected"}
              </div>

              {/* Voice visualizer */}
              {localStream && (
                <div className="mb-3 flex justify-center">
                  <VoiceVisualizer
                    stream={localStream}
                    isActive={!isVoiceMuted}
                    variant="admin"
                  />
                </div>
              )}

              <div className="flex gap-2">
                {!isVoiceConnected && !isVoiceConnecting ? (
                  <Button
                    data-ocid="admin.primary_button"
                    onClick={startVoiceSession}
                    className="flex-1 h-9 text-xs rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.60 0.22 280), oklch(0.50 0.20 260))",
                      color: "oklch(0.97 0.01 0)",
                      border: "none",
                      boxShadow: "0 0 16px oklch(0.58 0.22 280 / 0.3)",
                    }}
                  >
                    <Phone className="w-3.5 h-3.5 mr-1.5" />
                    Start Voice
                  </Button>
                ) : (
                  <Button
                    onClick={endVoiceSession}
                    className="flex-1 h-9 text-xs rounded-xl"
                    style={{
                      background: "oklch(0.55 0.20 25 / 0.8)",
                      color: "oklch(0.97 0.01 0)",
                      border: "1px solid oklch(0.60 0.20 25 / 0.4)",
                    }}
                  >
                    <PhoneOff className="w-3.5 h-3.5 mr-1.5" />
                    End
                  </Button>
                )}

                <Button
                  data-ocid="admin.button"
                  onClick={toggleVoiceMute}
                  disabled={!localStream}
                  size="icon"
                  className="h-9 w-9 rounded-xl shrink-0"
                  style={{
                    background: isVoiceMuted
                      ? "oklch(0.55 0.20 25 / 0.7)"
                      : "oklch(0.22 0.05 278 / 0.8)",
                    border: "1px solid oklch(0.38 0.08 280 / 0.35)",
                    color: "oklch(0.88 0.04 285)",
                  }}
                >
                  {isVoiceMuted ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Right column: Chat */}
          <div className="flex-1 flex flex-col min-h-[400px]">
            <div
              className="flex-1 rounded-2xl flex flex-col overflow-hidden shadow-glass-admin"
              style={cardStyle}
            >
              {/* Chat header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: "oklch(0.28 0.06 278 / 0.4)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: sessionState.visitorOnline
                        ? "oklch(0.72 0.20 150)"
                        : "oklch(0.45 0.04 278)",
                      boxShadow: sessionState.visitorOnline
                        ? "0 0 8px oklch(0.72 0.20 150 / 0.7)"
                        : "none",
                    }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "oklch(0.82 0.05 285)" }}
                  >
                    Private Channel
                  </span>
                  {settings.aiMode && (
                    <Badge
                      className="text-[10px] px-1.5 py-0"
                      style={{
                        background: "oklch(0.50 0.18 280 / 0.3)",
                        color: "oklch(0.72 0.18 280)",
                        border: "1px solid oklch(0.50 0.18 280 / 0.4)",
                      }}
                    >
                      <Bot className="inline w-2.5 h-2.5 mr-0.5" />
                      AI Active
                    </Badge>
                  )}
                </div>

                {/* Live typing signal */}
                {!settings.aiMode && (
                  <button
                    type="button"
                    onClick={handleTypingSignal}
                    className="text-xs px-2 py-1 rounded-lg transition-all"
                    style={{
                      background: isMarkingTyping
                        ? "oklch(0.55 0.18 280 / 0.3)"
                        : "oklch(0.20 0.04 278 / 0.5)",
                      color: isMarkingTyping
                        ? "oklch(0.72 0.18 280)"
                        : "oklch(0.55 0.05 278)",
                      border: "1px solid oklch(0.35 0.08 280 / 0.3)",
                    }}
                  >
                    {isMarkingTyping
                      ? "● Typing signal sent"
                      : "Send typing signal"}
                  </button>
                )}
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto admin-scroll py-4"
                style={{ minHeight: "200px" }}
              >
                {isLoading && (
                  <div
                    data-ocid="admin.loading_state"
                    className="flex justify-center py-8"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full animate-typing-dot"
                          style={{
                            background: "oklch(0.62 0.20 280)",
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!isLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <Radio
                      className="w-8 h-8 opacity-30"
                      style={{ color: "oklch(0.60 0.15 280)" }}
                    />
                    <p
                      className="text-sm"
                      style={{ color: "oklch(0.45 0.04 278)" }}
                    >
                      Waiting for messages…
                    </p>
                  </div>
                )}

                {messages.map((msg) => (
                  <AdminMessageBubble key={String(msg.id)} msg={msg} />
                ))}

                {aiProcessing && <TypingIndicator label="AI" />}
              </div>

              {/* Input row */}
              <div
                className="flex items-center gap-2 p-3 border-t"
                style={{ borderColor: "oklch(0.28 0.06 278 / 0.4)" }}
              >
                <Input
                  data-ocid="admin.textarea"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    settings.aiMode
                      ? "AI is handling responses…"
                      : "Type a message…"
                  }
                  disabled={settings.aiMode}
                  className="flex-1 rounded-full border-0 text-sm h-10"
                  style={{
                    background: "oklch(0.18 0.04 278 / 0.7)",
                    color: "oklch(0.90 0.03 285)",
                    caretColor: "oklch(0.62 0.22 280)",
                    opacity: settings.aiMode ? 0.5 : 1,
                  }}
                />
                <Button
                  data-ocid="chat.submit_button"
                  onClick={handleSend}
                  disabled={!chatInput.trim() || settings.aiMode}
                  size="icon"
                  className="rounded-full shrink-0 transition-all duration-200 h-10 w-10"
                  style={{
                    background:
                      chatInput.trim() && !settings.aiMode
                        ? "linear-gradient(135deg, oklch(0.62 0.22 280), oklch(0.52 0.20 260))"
                        : "oklch(0.20 0.04 278 / 0.5)",
                    color: "oklch(0.97 0.01 0)",
                    border: "none",
                    boxShadow:
                      chatInput.trim() && !settings.aiMode
                        ? "0 0 16px oklch(0.60 0.22 280 / 0.4)"
                        : "none",
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center">
          <p className="text-xs" style={{ color: "oklch(0.35 0.04 278)" }}>
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity"
            >
              Built with ❤️ using caffeine.ai
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════
//   Export: PIN gate wrapping dashboard
// ═══════════════════════════════════
export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <PinGate onSuccess={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
