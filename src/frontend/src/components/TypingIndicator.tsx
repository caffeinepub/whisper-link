export default function TypingIndicator({
  label = "typing",
}: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div
        className="flex items-center gap-1 px-3 py-2 rounded-2xl"
        style={{
          background: "oklch(0.28 0.08 290 / 0.6)",
          backdropFilter: "blur(12px)",
          border: "1px solid oklch(0.45 0.12 310 / 0.3)",
        }}
      >
        <span className="text-xs text-muted-foreground mr-1">{label}</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-typing-dot"
            style={{
              background: "oklch(0.72 0.22 350)",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
