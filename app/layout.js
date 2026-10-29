import './globals.css';
import localFont from 'next/font/local';
import ChatLoader from '@/components/ChatLoader';
import PwaRegister from '@/components/PwaRegister';

// Self-hosted variable fonts (Latin subset) committed to the repo, so the build
// makes no network request to Google. Each exposes a CSS variable used in
// globals.css; characters outside Latin fall back to the system serif/sans.
const playfair = localFont({
  src: [
    { path: './fonts/playfair-display-latin.woff2', style: 'normal', weight: '400 900' },
    { path: './fonts/playfair-display-italic-latin.woff2', style: 'italic', weight: '400 900' },
  ],
  display: 'swap',
  variable: '--font-playfair',
});
const sourceSerif = localFont({
  src: [
    { path: './fonts/source-serif-4-latin.woff2', style: 'normal', weight: '200 900' },
    { path: './fonts/source-serif-4-italic-latin.woff2', style: 'italic', weight: '200 900' },
  ],
  display: 'swap',
  variable: '--font-source-serif',
});
const inter = localFont({
  src: [{ path: './fonts/inter-latin.woff2', style: 'normal', weight: '100 900' }],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport = {
  themeColor: '#181511',
};

export const metadata = {
  title: 'The Meridian Brief — Geopolitics & Finance, Ranked',
  description:
    'A news intelligence dashboard that ranks geopolitics and finance coverage with a transparent point-based scoring algorithm.',
  applicationName: 'The Meridian Brief',
  appleWebApp: { capable: true, title: 'Meridian', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${playfair.variable} ${sourceSerif.variable} ${inter.variable}`}>
      <body>
        {children}
        <ChatLoader />
        <PwaRegister />
      </body>
    </html>
  );
}
