// STUB — replaced by the Templates agent with a polished first-run workspace.
// Contract: ensureSeed() runs once after boot; if the workspace is empty it
// creates the welcome content and returns the page id to open, else null.
import { kvGet, kvSet } from './lib/db';
import { createBlock, createPage, useStore } from './lib/store';

export async function ensureSeed(): Promise<string | null> {
  const seeded = await kvGet<boolean>('seeded');
  if (seeded || Object.keys(useStore.getState().pages).length > 0) return null;
  await kvSet('seeded', true);
  const id = createPage({ title: 'Welcome to Zenith', icon: '🏔️', empty: true });
  createBlock(id, { type: 'h2', html: 'Peak thought. Zero friction.' });
  createBlock(id, { type: 'paragraph', html: "Press <code>/</code> anywhere to see everything Zenith can do." });
  createBlock(id, { type: 'todo', html: 'Write your first note' });
  createBlock(id, { type: 'todo', html: 'Build a database with <b>/table</b>' });
  return id;
}
