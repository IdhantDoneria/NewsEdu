"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";

const PILLARS = [
  {
    icon: "⚡",
    title: "Speed of Culture",
    body: "We move at the speed of relevance. News cycles wait for no one — our 24/7 war room ensures your brand is always first, always right.",
  },
  {
    icon: "🎯",
    title: "Precision Targeting",
    body: "Data-driven strategies that put your message in front of the exact journalists, influencers, and audiences that matter most to your business.",
  },
  {
    icon: "🔥",
    title: "Narrative Power",
    body: "We build narratives that don't just inform — they move people. Stories that create emotional resonance and drive genuine cultural impact.",
  },
  {
    icon: "👑",
    title: "Elite Access",
    body: "Relationships built over decades with India's top editors, broadcasters, and digital tastemakers — your unfair advantage in a crowded media landscape.",
  },
];

function PillarCard({ p, delay }: { p: typeof PILLARS[0]; delay: number }) {
  const { cardRef, onMouseMove, onMouseLeave } = useTilt(6);
  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ willChange: "transform", transition: "transform 0.1s ease" }}
      className="glass rounded-sm p-6 gold-border hover:border-gold/60 cursor-default"
    >
      <div className="text-3xl mb-4">{p.icon}</div>
      <h3 className="font-display text-lg font-semibold text-ivory mb-2">{p.title}</h3>
      <p className="text-ivory-dim text-sm leading-relaxed">{p.body}</p>
      {/* Shine overlay */}
      <div className="absolute inset-0 rounded-sm opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.06) 0%, transparent 60%)" }} />
    </div>
  );
}

export default function About() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="about" ref={ref} className="py-32 px-6 relative overflow-hidden">
      <div className="absolute right-0 top-1/4 w-[500px] h-[500px] bg-gold/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.7 }}
              className="flex items-center gap-3 mb-6"
            >
              <div className="h-px w-8 bg-gold/60" />
              <span className="text-gold text-xs tracking-[0.3em] uppercase">About DSPR</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="font-display text-5xl md:text-6xl font-bold text-ivory mb-8 leading-tight"
            >
              The Agency
              <br />
              <span className="gold-gradient">Brands Fear</span>
              <br />
              to Compete With
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="text-ivory-dim text-lg leading-relaxed mb-6"
            >
              Founded with a singular obsession: making brands impossible to ignore.
              DSPR was built by communicators who understand that in today&apos;s
              fractured media landscape, attention is the only currency that matters.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="text-ivory-dim text-lg leading-relaxed mb-10"
            >
              We&apos;ve built reputations for startups that became unicorns, brought
              legacy brands roaring back to relevance, and navigated crises that
              would have ended lesser brands. We&apos;re not just your PR agency —
              we&apos;re your strategic communications partner.
            </motion.p>

            <motion.a
              href="#contact"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.5 }}
              className="inline-flex items-center gap-3 text-gold text-sm tracking-widest uppercase font-medium group"
            >
              <span>Work With Us</span>
              <div className="w-8 h-px bg-gold group-hover:w-14 transition-all duration-300" />
            </motion.a>
          </div>

          {/* Right pillars with 3D tilt */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PILLARS.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.15 + i * 0.1 }}
                className="relative"
              >
                <PillarCard p={p} delay={i} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
