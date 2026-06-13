"use client";

import { useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

const CASES = [
  {
    tag: "Brand Launch",
    client: "Apex Ventures",
    headline: "Taking a ₹0-to-₹500Cr startup public without a single paid ad",
    result: "₹42Cr earned media value • 380+ stories • Featured in Forbes, ET, Inc42",
    color: "from-gold/20 to-transparent",
    index: "01",
  },
  {
    tag: "Crisis Recovery",
    client: "Heritage Foods",
    headline: "Rescuing a 60-year legacy brand from a social media wildfire",
    result: "Sentiment recovered in 72hrs • 18% brand lift post-crisis • Zero leadership exit",
    color: "from-crimson/15 to-transparent",
    index: "02",
  },
  {
    tag: "IPO PR",
    client: "NovaTech Systems",
    headline: "Engineering the most-hyped IPO in the Indian SaaS sector",
    result: "47x oversubscribed • Covered in WSJ, Bloomberg, Mint • ₹3,200Cr raised",
    color: "from-blue-900/20 to-transparent",
    index: "03",
  },
  {
    tag: "Celebrity Campaign",
    client: "Lumière Jewels",
    headline: "Redefining luxury with a 3-city influencer takeover",
    result: "220M+ impressions in 48hrs • 3 national TV placements • 40% revenue spike",
    color: "from-purple-900/15 to-transparent",
    index: "04",
  },
];

export default function CaseStudies() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section id="work" ref={ref} className="py-32 px-6 bg-carbon/50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-20"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold/60" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase">Our Work</span>
            <div className="h-px w-8 bg-gold/60" />
          </div>
          <h2 className="font-display text-5xl md:text-6xl font-bold text-ivory">
            Results That
            <br />
            <span className="gold-gradient">Speak for Themselves</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {CASES.map((c, i) => (
            <motion.div
              key={c.index}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.12 }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="relative overflow-hidden rounded-sm gold-border hover:border-gold/60 transition-all duration-500 group cursor-pointer"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${c.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              <div className="relative p-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs text-gold tracking-[0.25em] uppercase px-3 py-1 border border-gold/30 rounded-full">
                    {c.tag}
                  </span>
                  <span className="font-display text-3xl font-bold text-white/5 group-hover:text-white/10 transition-colors duration-500">
                    {c.index}
                  </span>
                </div>
                <p className="text-ivory-dim text-xs tracking-widest uppercase mb-3">{c.client}</p>
                <h3 className="font-display text-2xl font-bold text-ivory mb-6 leading-tight group-hover:text-gold transition-colors duration-300">
                  {c.headline}
                </h3>
                <div className="h-px bg-white/5 mb-5" />
                <p className="text-ivory-dim text-sm leading-relaxed">{c.result}</p>

                <motion.div
                  animate={{ x: hovered === i ? 0 : -10, opacity: hovered === i ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2 mt-6 text-gold text-xs tracking-widest uppercase"
                >
                  <span>Read Case Study</span>
                  <div className="w-4 h-px bg-gold" />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
