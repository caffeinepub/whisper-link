import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  opacityDelta: number;
  isHeart: boolean;
  rotation: number;
  rotationSpeed: number;
}

interface Props {
  variant?: "visitor" | "admin";
  count?: number;
}

export default function ParticlesCanvas({
  variant = "visitor",
  count = 40,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    const createParticle = (): Particle => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height + canvas.height,
      size: Math.random() * 8 + 3,
      speedX: (Math.random() - 0.5) * 0.6,
      speedY: -(Math.random() * 0.8 + 0.3),
      opacity: Math.random() * 0.6 + 0.2,
      opacityDelta: (Math.random() - 0.5) * 0.005,
      isHeart: Math.random() > 0.3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    });

    resize();
    particlesRef.current = Array.from({ length: count }, createParticle).map(
      (p) => ({
        ...p,
        y: Math.random() * canvas.height,
      }),
    );

    const getColor = () => {
      if (variant === "visitor") {
        const hue = 330 + Math.random() * 30;
        const lightness = 0.65 + Math.random() * 0.2;
        return `oklch(${lightness} 0.18 ${hue})`;
      }
      const hue = 270 + Math.random() * 30;
      const lightness = 0.55 + Math.random() * 0.2;
      return `oklch(${lightness} 0.20 ${hue})`;
    };

    const colors = Array.from({ length: count }, getColor);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p, i) => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = colors[i % colors.length];

        if (p.isHeart) {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.beginPath();
          const s = p.size;
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-s / 2, -s / 2, -s, s / 4, 0, s);
          ctx.bezierCurveTo(s, s / 4, s / 2, -s / 2, 0, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Update
        p.x += p.speedX;
        p.y += p.speedY;
        p.opacity += p.opacityDelta;
        p.rotation += p.rotationSpeed;

        if (p.opacity > 0.85) p.opacityDelta = -Math.abs(p.opacityDelta);
        if (p.opacity < 0.1) p.opacityDelta = Math.abs(p.opacityDelta);

        // Reset when off screen
        if (p.y < -20) {
          p.y = canvas.height + 20;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
    };
  }, [variant, count]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
