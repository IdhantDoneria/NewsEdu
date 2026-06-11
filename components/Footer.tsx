import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div style={{ maxWidth: 380 }}>
          <div className="logo" style={{ marginBottom: 12 }}>
            <span className="logo-mark">₹</span>
            <span>YojanaScan</span>
          </div>
          <p style={{ margin: 0 }}>
            Deterministic government-scheme eligibility for Indian MSMEs.
            Hand-encoded rules, verified against official sources — no AI
            guesswork in the verdict.
          </p>
          <p style={{ margin: "10px 0 0", fontWeight: 700, color: "var(--text-2)" }}>
            Independent tool — not a government website.
          </p>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <strong style={{ color: "var(--text-2)" }}>Product</strong>
          <Link href="/scan">Run a free scan</Link>
          <a href="/#schemes">Scheme coverage</a>
          <a href="/#pricing">Pricing</a>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <strong style={{ color: "var(--text-2)" }}>Official portals</strong>
          <a href="https://udyamregistration.gov.in" target="_blank" rel="noopener noreferrer">Udyam Registration</a>
          <a href="https://www.kviconline.gov.in/pmegpeportal/jsp/pmegponline.jsp" target="_blank" rel="noopener noreferrer">PMEGP e-Portal</a>
          <a href="https://www.cmegp.gov.in" target="_blank" rel="noopener noreferrer">CMEGP Maharashtra</a>
        </div>
        <div style={{ maxWidth: 300 }}>
          <strong style={{ color: "var(--text-2)" }}>Disclaimer</strong>
          <p style={{ margin: "8px 0 0" }}>
            YojanaScan is an independent eligibility-screening tool, not a
            government body. Final eligibility rests with the implementing
            agency. Each scheme card shows its last-verified date.
          </p>
        </div>
      </div>
    </footer>
  );
}
