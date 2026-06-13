"use client";

import { motion } from "framer-motion";

const ITEMS = [
  "Brand Strategy", "Media Relations", "Crisis Communications",
  "Influencer Marketing", "Event PR", "Digital Amplification",
  "Reputation Management", "Thought Leadership", "Investor Relations",
  "Celebrity Endorsements",
];

export default function MarqueeStrip() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="relative overflow-hidden py-5 border-y border-white/5 bg-graphite/50 my-4">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        className="flex items-center gap-0 w-max"
      >
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center shrink-0">
            <span className="text-ivory-dim text-xs tracking-[0.3em] uppercase font-medium px-8 whitespace-nowrap">
              {item}
            </span>
            <span className="text-gold/50 text-lg">◆</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
