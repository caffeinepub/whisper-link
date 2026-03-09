import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  isActive: boolean;
  variant?: "visitor" | "admin";
  className?: string;
}

export default function VoiceVisualizer({
  stream,
  isActive,
  variant = "visitor",
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      // Draw flat bars
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barCount = 12;
          const barWidth = canvas.width / barCount - 2;
          for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + 2);
            const h = 3;
            const y = (canvas.height - h) / 2;
            ctx.fillStyle =
              variant === "visitor"
                ? "oklch(0.72 0.22 350 / 0.3)"
                : "oklch(0.65 0.25 280 / 0.3)";
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, h, 2);
            ctx.fill();
          }
        }
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    audioCtxRef.current = new AudioCtx();
    analyserRef.current = audioCtxRef.current.createAnalyser();
    analyserRef.current.fftSize = 64;
    sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
    sourceRef.current.connect(analyserRef.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 12;
      const barWidth = Math.floor(canvas.width / barCount) - 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(3, value * canvas.height * 0.85);
        const x = i * (barWidth + 2);
        const y = (canvas.height - barHeight) / 2;

        const alpha = 0.4 + value * 0.6;
        if (variant === "visitor") {
          ctx.fillStyle = `oklch(0.72 0.22 350 / ${alpha})`;
        } else {
          ctx.fillStyle = `oklch(0.65 0.25 280 / ${alpha})`;
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stream, isActive, variant]);

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={36}
      className={`opacity-80 ${className}`}
    />
  );
}
