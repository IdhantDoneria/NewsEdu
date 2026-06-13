"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

export default function Contact() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [formState, setFormState] = useState({ name: "", company: "", email: "", message: "", budget: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" ref={ref} className="py-32 px-6 relative overflow-hidden">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[600px] h-[300px] bg-gold/6 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-20">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-8 bg-gold/60" />
              <span className="text-gold text-xs tracking-[0.3em] uppercase">Get In Touch</span>
            </div>
            <h2 className="font-display text-5xl md:text-6xl font-bold text-ivory mb-8 leading-tight">
              Ready to
              <br />
              <span className="gold-gradient">Dominate</span>
              <br />
              Your Market?
            </h2>
            <p className="text-ivory-dim text-lg leading-relaxed mb-10">
              Every exceptional campaign starts with a conversation. Tell us about your brand,
              your ambitions, and the story you want the world to hear. We&apos;ll tell you
              exactly how to make it impossible to ignore.
            </p>

            <div className="space-y-5">
              {[
                { icon: "✉", label: "hello@dspr.in" },
                { icon: "📞", label: "+91 98765 43210" },
                { icon: "📍", label: "Mumbai · Delhi · Bangalore" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-4">
                  <div className="w-10 h-10 glass rounded-sm gold-border flex items-center justify-center text-sm">
                    {item.icon}
                  </div>
                  <span className="text-ivory-dim">{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center text-center glass rounded-sm gold-border p-12"
              >
                <div className="text-5xl mb-6">✦</div>
                <h3 className="font-display text-2xl font-bold text-gold mb-4">
                  Message Received
                </h3>
                <p className="text-ivory-dim leading-relaxed">
                  We&apos;ll review your brief and reach out within 24 hours.
                  Prepare to be impressed.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="glass rounded-sm gold-border p-8 space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  {(["name", "company"] as const).map((field) => (
                    <div key={field}>
                      <label className="text-xs text-ivory-dim tracking-[0.2em] uppercase block mb-2">
                        {field === "name" ? "Your Name" : "Company"}
                      </label>
                      <input
                        type="text"
                        required={field === "name"}
                        value={formState[field]}
                        onChange={(e) => setFormState((s) => ({ ...s, [field]: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold/50 transition-colors duration-200 text-sm"
                        placeholder={field === "name" ? "Jane Smith" : "Acme Corp"}
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-xs text-ivory-dim tracking-[0.2em] uppercase block mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState((s) => ({ ...s, email: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold/50 transition-colors duration-200 text-sm"
                    placeholder="jane@acme.com"
                  />
                </div>

                <div>
                  <label className="text-xs text-ivory-dim tracking-[0.2em] uppercase block mb-2">
                    Monthly Budget
                  </label>
                  <select
                    value={formState.budget}
                    onChange={(e) => setFormState((s) => ({ ...s, budget: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-ivory focus:outline-none focus:border-gold/50 transition-colors duration-200 text-sm"
                  >
                    <option value="" className="bg-carbon">Select range</option>
                    <option value="1-3L" className="bg-carbon">₹1L – ₹3L</option>
                    <option value="3-10L" className="bg-carbon">₹3L – ₹10L</option>
                    <option value="10L+" className="bg-carbon">₹10L+</option>
                    <option value="custom" className="bg-carbon">Let&apos;s discuss</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-ivory-dim tracking-[0.2em] uppercase block mb-2">
                    Your Brief
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={formState.message}
                    onChange={(e) => setFormState((s) => ({ ...s, message: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm px-4 py-3 text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold/50 transition-colors duration-200 text-sm resize-none"
                    placeholder="Tell us about your brand and what you're trying to achieve..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-gold text-obsidian text-sm tracking-widest uppercase font-bold hover:bg-gold-light transition-colors duration-300 relative overflow-hidden group"
                >
                  <span className="relative z-10">Send Brief</span>
                  <motion.div
                    className="absolute inset-0 bg-gold-light"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.4 }}
                  />
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
