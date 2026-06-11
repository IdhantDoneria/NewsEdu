"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

interface MeResponse {
  email: string | null;
  paid: boolean;
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [authState, setAuthState] = useState<MeResponse>({ email: null, paid: false });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch auth state once on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json() as Promise<MeResponse>)
      .then((d) => setAuthState(d))
      .catch(() => {/* ignore network errors */});
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {/* ignore */}
    setAuthState({ email: null, paid: false });
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
          {authState.email ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="chip" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={authState.email}>
                {authState.email}
              </span>
              <button
                className="btn btn-sm"
                style={{ padding: "4px 10px" }}
                onClick={() => { void handleSignOut(); }}
              >
                Sign out
              </button>
            </span>
          ) : (
            <Link href="/login" className="nav-anchor">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
