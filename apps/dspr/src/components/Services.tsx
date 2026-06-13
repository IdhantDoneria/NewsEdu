"use client";

import { useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

const SERVICES = [
  {
    num: "01",
    title: "Strategic PR & Media Relations",
    short: "Own the narrative. Own the room.",
    description:
      "End-to-end earned media campaigns crafted for maximum impact. We build relationships with tier-1 journalists and secure coverage that positions your brand as the definitive authority in your space.",
    deliverables: ["National & regional media placement", "Editorial board access", "Press release architecture", "Spokesperson training", "Media measurement & reporting"],
  },
  {
    num: "02",
    title: "Crisis Communications",
    short: "When it matters most, we're already there.",
    description:
      "Crises don't wait for business hours. Our rapid-response team is on call 24/7, equipped with battle-tested playbooks to protect, manage, and restore your reputation when everything is on the line.",
    deliverables: ["24/7 crisis hotline", "Dark site activation", "Holding statement prep", "Stakeholder comms", "Post-crisis reputation rebuild"],
  },
  {
    num: "03",
    title: "Influencer & Celebrity Marketing",
    short: "Authentic voices. Real impact.",
    description:
      "We don't just match brands with influencers — we engineer moments. Our network of 5,000+ verified creators and A-list celebrity relationships turns your campaign into a cultural event.",
    deliverables: ["Influencer vetting & matching", "Contract negotiation", "Creative direction", "Performance tracking", "Long-term ambassador programs"],
  },
  {
    num: "04",
    title: "Brand Positioning & Strategy",
    short: "Where you stand. How you're seen. Who you become.",
    description:
      "Deep-dive brand audits, competitive landscape mapping, and positioning workshops that crystallize your unique narrative and give your communications a coherent, compelling point of view.",
    deliverables: ["Brand audit", "Positioning workshops", "Messaging architecture", "Tone of voice guides", "Competitive intelligence"],
  },
  {
    num: "05",
    title: "Digital Amplification",
    short: "From print to pixels — dominance everywhere.",
    description:
      "Integrated digital PR strategies that amplify earned media across social channels, build SEO authority through links and coverage, and drive measurable business outcomes beyond vanity metrics.",
    deliverables: ["Social media amplification", "SEO-driven PR", "Content syndication", "Community building", "Digital reputation management"],
  },
  {
    num: "06",
    title: "Event & Launch PR",
    short: "Create moments the world can't look away from.",
    description:
      "From intimate press junkets to large-scale product launches, we orchestrate every detail — guest lists, media coverage, live buzz, and post-event follow-through that keeps the story alive.",
    deliverables: ["Event concept & design", "Media invitations & RSVPs", "Live coverage strategy", "Post-event PR burst", "Video & photo distribution"],
  },
];

export default function Services() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="services" ref={ref} className="py-32 px-6 relative">
      <div className="absolute left-0 bottom-0 w-[600px] h-[400px] bg-gold/4 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-20"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold/60" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase">What We Do</span>
            <div className="h-px w-8 bg-gold/60" />
          </div>
          <h2 className="font-display text-5xl md:text-6xl font-bold text-ivory">
            Services Built for{" "}
            <span className="gold-gradient">Dominance</span>
          </h2>
        </motion.div>

        <div className="space-y-1">
          {SERVICES.map((svc, i) => (
            <motion.div
              key={svc.num}
              initial={{ opacity: 0, x: -20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.07 }}
              onClick={() => setActive(active === i ? null : i)}
              className="border-b border-white/5 cursor-pointer group"
            >
              <div className="py-7 flex items-center justify-between gap-6">
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <span className="text-gold/40 font-display text-sm tracking-wider shrink-0">
                    {svc.num}
                  </span>
                  <div>
                    <h3 className="font-display text-xl md:text-2xl font-semibold text-ivory group-hover:text-gold transition-colors duration-300">
                      {svc.title}
                    </h3>
                    <p className="text-ivory-dim text-sm mt-1">{svc.short}</p>
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: active === i ? 45 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-gold/60 text-2xl shrink-0 group-hover:text-gold transition-colors duration-300"
                >
                  +
                </motion.div>
              </div>

              <AnimatePresence>
                {active === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pb-8 grid md:grid-cols-2 gap-8 pl-12">
                      <p className="text-ivory-dim leading-relaxed">{svc.description}</p>
                      <div>
                        <p className="text-xs text-gold tracking-[0.2em] uppercase mb-4">
                          Deliverables
                        </p>
                        <ul className="space-y-2">
                          {svc.deliverables.map((d) => (
                            <li key={d} className="flex items-center gap-3 text-ivory-dim text-sm">
                              <span className="w-1 h-1 bg-gold rounded-full shrink-0" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
