"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-inner">
        <Link href="/" className="logo" aria-label="YojanaScan home">
          <span className="logo-mark">₹</span>
          <span>
            Yojana<span style={{ color: "var(--saffron)" }}>Scan</span>
          </span>
        </Link>
        <nav className="nav-links">
          <a href="/#how" className="nav-anchor">How it works</a>
          <a href="/#schemes" className="nav-anchor">Schemes</a>
          <a href="/#pricing" className="nav-anchor">Pricing</a>
          <Link href="/scan" className="btn btn-primary btn-sm">
            Free scan
          </Link>
        </nav>
      </div>
    </header>
  );
}
