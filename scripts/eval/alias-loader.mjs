/**
 * Node module-resolution hook that makes the Next.js `@/` alias (and extension-less imports of
 * .js/.mjs files) work outside Next, so the harness can import lib/ingest.js unchanged.
 * Registered by replay.mjs via `module.register`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.EVAL_CODE_ROOT
  ? path.resolve(process.env.EVAL_CODE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTS = ['', '.js', '.mjs', '/index.mjs', '/index.js'];

function tryResolve(base) {
  for (const ext of EXTS) {
    const p = base + ext;
    try {
      if (fs.statSync(p).isFile()) return pathToFileURL(p).href;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const hit = tryResolve(path.join(ROOT, specifier.slice(2)));
    if (hit) return nextResolve(hit, context);
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    // Extension-less relative imports inside lib/ (Next resolves these; bare node does not)
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!path.extname(base)) {
      const hit = tryResolve(base);
      if (hit) return nextResolve(hit, context);
    }
  }
  return nextResolve(specifier, context);
}
