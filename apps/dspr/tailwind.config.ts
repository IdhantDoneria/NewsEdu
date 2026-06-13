import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#0a0a0a",
        carbon: "#111111",
        graphite: "#1a1a1a",
        gold: "#c9a84c",
        "gold-light": "#e8c97a",
        "gold-dim": "#8a6f2e",
        ivory: "#f5f0e8",
        "ivory-dim": "#c8c0b0",
        crimson: "#c41e3a",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      animation: {
        "fade-up": "fadeUp 0.7s ease forwards",
        "slide-in": "slideIn 0.6s ease forwards",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
        marquee: "marquee 25s linear infinite",
        "spin-slow": "spin 12s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(201,168,76,0.2)" },
          "50%": { boxShadow: "0 0 60px rgba(201,168,76,0.5)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
