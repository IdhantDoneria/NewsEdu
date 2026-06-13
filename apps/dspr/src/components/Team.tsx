"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const TEAM = [
  {
    name: "Digisha Shah",
    role: "Founder & CEO",
    bio: "15 years transforming India's most ambitious brands. Former Head of Communications at three Fortune 500 companies. The architect behind DSPR's fearless approach.",
    initials: "DS",
    accent: "gold",
  },
  {
    name: "Arjun Mehra",
    role: "Chief Strategy Officer",
    bio: "Ex-McKinsey communications consultant turned narrative engineer. Arjun builds the strategic frameworks that make our campaigns structurally unbeatable.",
    initials: "AM",
    accent: "crimson",
  },
  {
    name: "Priya Nair",
    role: "Head of Media Relations",
    bio: "Journalist-turned-communicator with 12 years building relationships with India's most influential editors and broadcasters. She knows what makes a story irresistible.",
    initials: "PN",
    accent: "blue-700",
  },
  {
    name: "Rohan Kapoor",
    role: "Digital & Influencer Lead",
    bio: "Pioneer of India's influencer marketing space. Rohan has executed over 300 creator campaigns and built a network of 5,000+ vetted voices across every category.",
    initials: "RK",
    accent: "purple-700",
  },
];

export default function Team() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="team" ref={ref} className="py-32 px-6 relative">
      <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-gold/4 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-20"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold/60" />
            <span className="text-gold text-xs tracking-[0.3em] uppercase">The Team</span>
            <div className="h-px w-8 bg-gold/60" />
          </div>
          <h2 className="font-display text-5xl md:text-6xl font-bold text-ivory">
            The Minds That
            <br />
            <span className="gold-gradient">Move Markets</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TEAM.map((member, i) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -8 }}
              className="group glass rounded-sm p-6 gold-border hover:border-gold/60 transition-all duration-500"
            >
              <div className="mb-6 relative">
                <div className={`w-16 h-16 rounded-sm bg-${member.accent}/20 border border-${member.accent}/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <span className="font-display text-xl font-bold text-ivory">
                    {member.initials}
                  </span>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0, 0.3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                  className="absolute top-0 left-0 w-16 h-16 rounded-sm bg-gold blur-md"
                />
              </div>
              <h3 className="font-display text-lg font-bold text-ivory mb-1">
                {member.name}
              </h3>
              <p className="text-gold text-xs tracking-[0.2em] uppercase mb-4">
                {member.role}
              </p>
              <p className="text-ivory-dim text-sm leading-relaxed">{member.bio}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
