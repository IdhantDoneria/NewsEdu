import { useStore } from './store';
import type { PageDoc } from './types';

export interface SearchHit {
  page: PageDoc;
  score: number;
  /** matched body excerpt, if the hit was in content */
  excerpt?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ');
}

/** lightweight fuzzy-ish scoring: exact > prefix > word > substring; recency boost */
export function searchWorkspace(query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase();
  const { pages, blocks } = useStore.getState();
  if (!q) {
    // recents
    return Object.values(pages)
      .filter((p) => !p.deletedAt && !p.databaseId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((page) => ({ page, score: 0 }));
  }
  const hits: SearchHit[] = [];
  const bodyMatch: Record<string, string> = {};
  for (const id in blocks) {
    const b = blocks[id];
    if (!b.html) continue;
    const text = stripHtml(b.html).toLowerCase();
    const idx = text.indexOf(q);
    if (idx >= 0 && !bodyMatch[b.pageId]) {
      const raw = stripHtml(b.html);
      const at = raw.toLowerCase().indexOf(q);
      bodyMatch[b.pageId] = raw.slice(Math.max(0, at - 32), at + q.length + 48).trim();
    }
  }
  for (const id in pages) {
    const p = pages[id];
    if (p.deletedAt) continue;
    const title = (p.title || 'untitled').toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
    else if (title.includes(q)) score = 40;
    else if (bodyMatch[id]) score = 20;
    if (score > 0) {
      const recency = Math.max(0, 10 - (Date.now() - p.updatedAt) / (1000 * 60 * 60 * 24));
      hits.push({ page: p, score: score + recency, excerpt: score <= 20 ? bodyMatch[id] : bodyMatch[id] });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
