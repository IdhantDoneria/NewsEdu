"use client";

import { useRef, useCallback } from "react";

export function useTilt(maxDeg = 8) {
  const cardRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = ((e.clientY - cy) / (rect.height / 2)) * -maxDeg;
      const ry = ((e.clientX - cx) / (rect.width / 2)) * maxDeg;
      el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
    },
    [maxDeg]
  );

  const onMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    el.style.transition = "transform 0.5s ease";
    setTimeout(() => {
      if (el) el.style.transition = "";
    }, 500);
  }, []);

  return { cardRef, onMouseMove, onMouseLeave };
}
