"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import FloatingParticles from "@/components/FloatingParticles";
import AnimatedCounter from "@/components/AnimatedCounter";
import { useMouseParallax } from "@/hooks/useMouseParallax";

const ROTATING_WORDS = ["Stories.", "Movements.", "Legacies.", "Impact.", "Culture."];

const STATS = [
  { value: "200+", label: "Campaigns" },
  { value: "98%", label: "Client Retention" },
  { value: "₹50Cr+", label: "Media Value" },
];

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const mouse = useMouseParallax(30);

  const [wordIndex, setWordIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % ROTATING_WORDS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Floating gold particles */}
      <FloatingParticles />

      {/* Ambient orbs — mouse parallax */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          style={{ x: mouse.x * -1.6, y: mouse.y * -1.6 }}
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gold/10 blur-[120px]"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          style={{ x: mouse.x * 2.2, y: mouse.y * 2.2 }}
          className="absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full bg-gold/8 blur-[140px]"
        />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          style={{ translateX: mouse.x * 1.2, translateY: mouse.y * 1.2 }}
          className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-crimson/5 blur-[80px]"
        />
      </div>

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <motion.div
        style={{ y, opacity }}
        className="relative z-10 max-w-6xl mx-auto px-6 text-center"
      >
        {/* Pre-title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex items-center justify-center gap-3 mb-8"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="h-px w-12 bg-gold/60 origin-right"
          />
          <span className="text-gold text-xs tracking-[0.35em] uppercase font-medium">
            Strategic Communications
          </span>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="h-px w-12 bg-gold/60 origin-left"
          />
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="font-display text-6xl md:text-8xl lg:text-9xl font-bold leading-[0.9] tracking-tight mb-6"
        >
          <span className="block text-ivory">We Don&apos;t Tell</span>
          <span className="block text-ivory">Your Story.</span>
          <span className="block mt-2">
            <span className="text-ivory">We Make </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIndex}
                initial={{ opacity: 0, y: 30, rotateX: -90 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -30, rotateX: 90 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="inline-block gold-gradient"
              >
                {ROTATING_WORDS[wordIndex]}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="text-ivory-dim text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          DSPR is the communications agency that elite brands trust to shape culture,
          command attention, and turn bold visions into undeniable realities.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#contact"
            className="group relative overflow-hidden px-8 py-4 bg-gold text-obsidian text-sm tracking-widest uppercase font-bold hover:shadow-[0_0_50px_rgba(201,168,76,0.5)] transition-all duration-500"
          >
            <span className="relative z-10">Start Your Campaign</span>
            <div className="absolute inset-0 bg-gold-light translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
          </a>
          <a
            href="#work"
            className="group flex items-center gap-3 text-ivory-dim text-sm tracking-widest uppercase hover:text-ivory transition-colors duration-300"
          >
            <span>View Our Work</span>
            <div className="w-6 h-px bg-ivory-dim group-hover:w-10 group-hover:bg-gold transition-all duration-300" />
          </a>
        </motion.div>

        {/* Stats strip — with animated counters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
          className="mt-20 grid grid-cols-3 gap-8 max-w-lg mx-auto"
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 + i * 0.1 }}
              className="text-center group"
            >
              <div className="font-display text-2xl font-bold gold-gradient mb-1">
                <AnimatedCounter value={stat.value} />
              </div>
              <div className="text-ivory-dim text-xs tracking-widest uppercase">
                {stat.label}
              </div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 1.6 + i * 0.1, duration: 0.5 }}
                className="mt-2 h-px bg-gold/20 origin-left"
              />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <div className="text-ivory-dim text-[10px] tracking-[0.3em] uppercase">Scroll</div>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-8 bg-gradient-to-b from-gold/60 to-transparent"
        />
      </motion.div>
    </section>
  );
}
