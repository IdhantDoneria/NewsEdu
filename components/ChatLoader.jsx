'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// The chat is large and not needed for first paint: load it once the browser is idle.
const ChatWidget = dynamic(() => import('./ChatWidget'), { ssr: false });

export default function ChatLoader() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const go = () => setReady(true);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(go, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(go, 1500);
    return () => clearTimeout(t);
  }, []);

  return ready ? <ChatWidget /> : null;
}
