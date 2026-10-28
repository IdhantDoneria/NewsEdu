'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Read-aloud via the browser's built-in speech synthesis (no server, no cost).
 * Text is cut into sentence-sized chunks and queued one at a time: long single
 * utterances stall in some browsers.
 */

const MAX_CHUNK = 220;

export function toChunks(text, max = MAX_CHUNK) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/);
  const out = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (const s of sentences) {
    if (s.length > max) {
      push();
      // A very long sentence: break on commas/semicolons, then on spaces.
      for (const part of s.split(/(?<=[,;:])\s+/)) {
        if (cur && (cur + ' ' + part).length > max) push();
        cur = cur ? `${cur} ${part}` : part;
        while (cur.length > max) {
          const cut = cur.lastIndexOf(' ', max);
          out.push(cur.slice(0, cut > 0 ? cut : max).trim());
          cur = cur.slice(cut > 0 ? cut : max).trim();
        }
      }
      continue;
    }
    if (cur && (cur + ' ' + s).length > max) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/** Strip UI markup (citation markers, bold) so it isn't read out. */
export function speakable(text) {
  return String(text || '')
    .replace(/\[\d{1,2}\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState('idle'); // idle | speaking | paused
  const token = useRef(0);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    return () => {
      token.current++;
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    token.current++;
    window.speechSynthesis?.cancel();
    setState('idle');
  }, []);

  /** texts: array of strings read in order. */
  const speak = useCallback((texts, { rate = 1 } = {}) => {
    if (!('speechSynthesis' in window)) return;
    token.current++;
    window.speechSynthesis.cancel();
    const mine = token.current;
    const queue = texts.flatMap((t) => toChunks(t));
    if (queue.length === 0) return;
    let i = 0;
    const next = () => {
      if (mine !== token.current) return;
      if (i >= queue.length) {
        setState('idle');
        return;
      }
      const u = new SpeechSynthesisUtterance(queue[i++]);
      u.rate = rate;
      u.onend = next;
      u.onerror = () => {
        if (mine === token.current) setState('idle');
      };
      window.speechSynthesis.speak(u);
    };
    setState('speaking');
    next();
  }, []);

  const pause = useCallback(() => {
    window.speechSynthesis?.pause();
    setState('paused');
  }, []);
  const resume = useCallback(() => {
    window.speechSynthesis?.resume();
    setState('speaking');
  }, []);

  return { supported, state, speak, stop, pause, resume };
}
