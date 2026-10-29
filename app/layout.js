import './globals.css';
import { Inter, Playfair_Display, Source_Serif_4 } from 'next/font/google';
import ChatLoader from '@/components/ChatLoader';
import PwaRegister from '@/components/PwaRegister';

// Self-hosted (downloaded at build time) and preloaded: no render-blocking
// request to Google Fonts. Each exposes a CSS variable used in globals.css.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-playfair',
});
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-source-serif',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
