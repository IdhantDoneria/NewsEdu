import { NextResponse } from 'next/server';
import { getEditionClusters } from '@/lib/ingest';
import { getIntelForCluster } from '@/lib/intelligence/extract.mjs';
import { generateRecallQuestions, buildKnowledgeMap } from '@/lib/intelligence/recall.mjs';
import { readJsonBounded } from '@/lib/intelligence/http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 20;

/**
 * Weekly Recall — the client POSTs its local reading history
 * ({ clusterId, kind, title }) plus previously asked questions; the server
 * generates understanding-level questions and the causal knowledge map from
 * the same stored intelligence objects that power story pages.
 */
export async function POST(request) {
  const read = await readJsonBounded(request);
  if (read.error) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body;

  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter((h) => h && typeof h.clusterId === 'string')
    .slice(0, MAX_HISTORY);
  const excludeQuestions = (Array.isArray(body?.askedQuestions) ? body.askedQuestions : [])
    .map(String)
    .slice(0, 30);
  const count = Math.min(8, Math.max(1, Number(body?.count) || 5));

  if (history.length === 0) {
    return NextResponse.json({
      questions: [],
      knowledgeMap: [],
      emptyHistory: true,
      generatedAt: Date.now(),
    });
  }

  const [geo, fin] = await Promise.all([
    getEditionClusters('geopolitics'),
    getEditionClusters('finance'),
  ]);
  const byId = new Map([...geo.clusters, ...fin.clusters].map((c) => [c.id, c]));

  // Resolve history entries against live clusters; expired stories are kept
  // for the knowledge map only if their intelligence is still stored.
  const entries = [];
  for (const h of history) {
    const cluster = byId.get(h.clusterId);
    if (!cluster) continue;
    const intelRecord = await getIntelForCluster(cluster);
    entries.push({ cluster, intelRecord, kind: h.kind || 'read' });
    if (entries.length >= 8) break;
  }

  const [questions, knowledgeMap] = [
    await generateRecallQuestions(entries, count, excludeQuestions),
    buildKnowledgeMap(entries),
  ];

  return NextResponse.json({
    questions: questions.map((q, i) => ({ id: `q${Date.now().toString(36)}${i}`, ...q })),
    knowledgeMap,
    resolvedStories: entries.length,
    requestedStories: history.length,
    generatedAt: Date.now(),
  });
}
