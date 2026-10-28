'use client';

/**
 * Local-first storage for the chat's memory. Like the rest of the profile
 * (userState.js), it lives only in this browser's localStorage and is sent to
 * the server transiently, inside the request that needs it.
 */

import { pruneMemory } from '@/lib/intelligence/memory.mjs';

const MEMORY_KEY = 'meridian.chat.memory.v1';
const LEARN_KEY = 'meridian.chat.learn.v1';

export function loadMemory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MEMORY_KEY) || '[]');
    return pruneMemory(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function saveMemory(list) {
  try {
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: memory just won't persist */
  }
}

/** Learning is on by default; the reader can switch it off. */
export function loadLearn() {
  try {
    return window.localStorage.getItem(LEARN_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveLearn(on) {
  try {
    window.localStorage.setItem(LEARN_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
