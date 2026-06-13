"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

const TESTIMONIALS = [
  {
    quote:
      "DSPR didn't just manage our launch PR — they engineered a moment. Three days after they started, we were in Economic Times, Mint, and on CNBC. That's not PR. That's wizardry.",
    name: "Vikram Anand",
    title: "CEO, Apex Ventures",
  },
  {
    quote:
      "When our brand faced its darkest 48 hours, DSPR was the only calm voice in the room. They had a plan before I even finished explaining the crisis. We came out stronger than we went in.",
    name: "Sunita Reddy",
    title: "Managing Director, Heritage Foods",
  },
  {
    quote:
      "The ROI on working with DSPR is difficult to overstate. ₹42 crore in earned media value for a fraction of what we'd have spent on paid. They're the smartest investment we've ever made.",
    name: "Rahul Bose",
    title: "CMO, NovaTech Systems",
  },
  {
    quote:
      "Digisha and her team have an almost supernatural ability to find the angle that makes editors say yes. We went from zero coverage to 200+ stories in one quarter. Nothing short of remarkable.",
    name: "Ananya Khanna",
    title: "Founder, Lumière Jewels",
  },
];

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((v) => (v + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <section ref={ref} className="py-32 px-6 bg-graphite/40 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gold/5 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          className="mb-16"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold/60" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase">Client Voices</span>
            <div className="h-px w-8 bg-gold/60" />
          </div>
          <h2 className="font-display text-5xl font-bold text-ivory">
            What Our Clients <span className="gold-gradient">Say</span>
          </h2>
        </motion.div>

        <div className="relative min-h-[260px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.5 }}
              className="absolute w-full"
            >
              <div className="text-gold/40 font-display text-8xl leading-none mb-4">&ldquo;</div>
              <p className="font-display text-2xl md:text-3xl text-ivory leading-relaxed mb-8 italic">
                {TESTIMONIALS[active].quote}
              </p>
              <div>
                <p className="text-ivory font-semibold">{TESTIMONIALS[active].name}</p>
                <p className="text-gold text-sm tracking-wider">{TESTIMONIALS[active].title}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`w-8 h-px transition-all duration-300 ${
                i === active ? "bg-gold w-12" : "bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
