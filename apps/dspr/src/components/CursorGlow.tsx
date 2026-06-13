"use client";

import { useEffect, useRef } from "react";

export default function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -200, y: -200 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
    };

    const draw = () => {
      if (el) {
        el.style.transform = `translate(${posRef.current.x - 200}px, ${posRef.current.y - 200}px)`;
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 w-[400px] h-[400px] rounded-full z-[9998]"
      style={{
        background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)",
        willChange: "transform",
      }}
    />
  );
}
