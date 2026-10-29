import Dashboard from '@/components/Dashboard';
import { getEditionBrief } from '@/lib/ingest';

// The front page is rendered with the geopolitics brief already in it and
// re-generated in the background every 5 minutes, so first paint does not wait
// on JavaScript plus a second round trip for the stories.
export const revalidate = 300;

/** Only the fields the dashboard renders or ranks on: keeps the HTML small. */
function slimBrief(brief) {
  return {
    edition: brief.edition,
    generatedAt: brief.generatedAt,
    noiseFloor: brief.noiseFloor,
    feeds: brief.feeds,
    articles: brief.articles.map((a) => ({
      id: a.id,
      title: a.title,
      summary: (a.summary || '').slice(0, 400),
      link: a.link,
      image: a.image || null,
      sourceName: a.sourceName,
      publishedAt: a.publishedAt,
      ageHours: a.ageHours,
      score: a.score,
      scoreBreakdown: a.scoreBreakdown,
      clusterId: a.clusterId || null,
      metrics: { sourceTrust: a.metrics?.sourceTrust },
    })),
  };
}

export default async function Page() {
  let initialData = null;
  try {
    const brief = await getEditionBrief('geopolitics');
    if (brief.articles.length > 0) initialData = slimBrief(brief);
  } catch {
    /* the client falls back to fetching /api/news */
  }

  return <Dashboard initialData={initialData} />;
}
