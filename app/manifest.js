export default function manifest() {
  return {
    name: 'The Meridian Brief',
    short_name: 'Meridian',
    description: 'Geopolitics and finance news, ranked by a transparent score.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f3ea',
    theme_color: '#181511',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Your Briefing', url: '/briefing' },
      { name: 'Search', url: '/search' },
      { name: 'Following', url: '/following' },
    ],
  };
}
