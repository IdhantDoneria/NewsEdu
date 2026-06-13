"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const ITEMS = [
  "Brand Strategy", "Media Relations", "Crisis Communications",
  "Influencer Marketing", "Event PR", "Digital Amplification",
  "Reputation Management", "Thought Leadership", "Investor Relations",
  "Celebrity Endorsements",
];

export default function MarqueeStrip() {
  const doubled = [...ITEMS, ...ITEMS];
  const [paused, setPaused] = useState(false);

  return (
    <div
      className="relative overflow-hidden py-5 border-y border-white/5 bg-graphite/50 my-4 cursor-default"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <motion.div
        animate={{ x: paused ? undefined : ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        className="flex items-center gap-0 w-max"
      >
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center shrink-0">
            <motion.span
              animate={paused ? { color: "#c9a84c" } : { color: "#c8c0b0" }}
              transition={{ duration: 0.3 }}
              className="text-xs tracking-[0.3em] uppercase font-medium px-8 whitespace-nowrap"
            >
              {item}
            </motion.span>
            <span className="text-gold/50 text-lg">◆</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
