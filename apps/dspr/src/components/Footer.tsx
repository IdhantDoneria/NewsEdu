"use client";

import { motion } from "framer-motion";

const NAV = {
  Services: ["Media Relations", "Crisis PR", "Influencer Marketing", "Brand Strategy", "Digital PR", "Event PR"],
  Company: ["About Us", "Case Studies", "Our Team", "Careers", "News"],
  Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
};

export default function Footer() {
  return (
    <footer className="bg-carbon border-t border-white/5 pt-20 pb-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 bg-gold rounded-sm rotate-45" />
                <div className="absolute inset-[3px] bg-carbon rounded-sm rotate-45" />
                <div className="absolute inset-[5px] bg-gold rounded-sm rotate-45" />
              </div>
              <span className="font-display text-xl font-bold gold-gradient">DSPR</span>
            </div>
            <p className="text-ivory-dim text-sm leading-relaxed max-w-xs mb-6">
              Elite PR and strategic communications. We don&apos;t just tell your story —
              we make the world stop and listen.
            </p>
            <div className="flex items-center gap-4">
              {["𝕏", "in", "ig", "yt"].map((s) => (
                <button
                  key={s}
                  className="w-9 h-9 glass rounded-sm gold-border text-xs text-ivory-dim hover:text-gold hover:border-gold/60 transition-all duration-300 flex items-center justify-center font-bold"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {Object.entries(NAV).map(([title, items]) => (
            <div key={title}>
              <h4 className="text-xs text-gold tracking-[0.25em] uppercase mb-5">{title}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-ivory-dim text-sm hover:text-ivory transition-colors duration-200">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="section-line mb-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-ivory-dim text-xs tracking-wider">
          <span>© {new Date().getFullYear()} DSPR Communications Pvt. Ltd. All rights reserved.</span>
          <span className="gold-gradient font-medium">Built to Dominate</span>
        </div>
      </div>
    </footer>
  );
}
