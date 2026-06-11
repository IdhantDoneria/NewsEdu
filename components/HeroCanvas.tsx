"use client";

/**
 * Client-only mount for the 3D hero. Keeps three.js out of SSR, respects
 * prefers-reduced-motion, and degrades to the ambient CSS background if
 * WebGL is unavailable.
 */

import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";

const HeroScene = dynamic(() => import("./three/HeroScene"), {
  ssr: false,
  loading: () => null,
});

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HeroCanvas() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="hero-canvas">
      {mounted && (
        <WebGLBoundary>
          <HeroScene reducedMotion={reducedMotion} />
        </WebGLBoundary>
      )}
    </div>
  );
}
