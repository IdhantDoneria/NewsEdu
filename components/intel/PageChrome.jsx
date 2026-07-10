'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Front Page' },
  { href: '/briefing', label: 'Your Briefing' },
  { href: '/following', label: 'Following' },
  { href: '/recall', label: 'Recall' },
];

function todayLine() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Shared chrome for intelligence pages — same broadsheet shell as the front
 * page, with the product-wide navigation strip.
 */
export default function PageChrome({ kicker, title, edition = 'geopolitics', children, actions }) {
  const pathname = usePathname();
  return (
    <div data-edition={edition}>
      <div className="shell">
        <div className="topbar">
          <span>{todayLine()}</span>
          <nav className="intel-nav" aria-label="Meridian sections">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={pathname === n.href ? 'on' : ''}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        <header className="masthead sub-masthead">
          <Link href="/" className="masthead-home">
            The Meridian Brief
          </Link>
          {kicker && <div className="sub-kicker">{kicker}</div>}
          {title && <h1 className="sub-title">{title}</h1>}
          {actions}
        </header>

        {children}

        <footer className="footer">
          <span>The Meridian Brief — news intelligence, ranked and scored</span>
          <span>Personal data stays in this browser · No tracking · No paywalls</span>
        </footer>
      </div>
    </div>
  );
}
