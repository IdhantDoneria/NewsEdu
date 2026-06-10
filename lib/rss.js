import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MeridianBrief/1.0',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
};

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return text(node['#text'] ?? node['@_href'] ?? '');
  return '';
}

function stripHtml(html) {
  return text(html)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function atomLink(entry) {
  const links = Array.isArray(entry.link) ? entry.link : [entry.link];
  const alternate =
    links.find((l) => l && l['@_rel'] === 'alternate') ||
    links.find((l) => l && l['@_href']) ||
    links[0];
  return text(alternate);
}

/**
 * Fetch and normalise one RSS 2.0 / Atom 1.0 / RDF feed into
 * { title, link, summary, publishedAt } items. Throws on network or
 * parse failure — callers aggregate with Promise.allSettled.
 */
export async function fetchFeed(url, { timeoutMs = 10000 } = {}) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const xml = await res.text();
  const doc = parser.parse(xml);

  let items = [];
  if (doc.rss?.channel) {
    const ch = doc.rss.channel;
    items = (Array.isArray(ch.item) ? ch.item : ch.item ? [ch.item] : []).map((it) => ({
      title: stripHtml(it.title),
      link: text(it.link).trim(),
      summary: stripHtml(it.description ?? it['content:encoded'] ?? ''),
      publishedAt: Date.parse(text(it.pubDate ?? it['dc:date'] ?? '')) || null,
    }));
  } else if (doc.feed?.entry) {
    const entries = Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry];
    items = entries.map((it) => ({
      title: stripHtml(it.title),
      link: atomLink(it).trim(),
      summary: stripHtml(it.summary ?? it.content ?? ''),
      publishedAt: Date.parse(text(it.published ?? it.updated ?? '')) || null,
    }));
  } else if (doc['rdf:RDF']?.item) {
    const entries = Array.isArray(doc['rdf:RDF'].item)
      ? doc['rdf:RDF'].item
      : [doc['rdf:RDF'].item];
    items = entries.map((it) => ({
      title: stripHtml(it.title),
      link: text(it.link).trim(),
      summary: stripHtml(it.description ?? ''),
      publishedAt: Date.parse(text(it['dc:date'] ?? '')) || null,
    }));
  }

  return items.filter((it) => it.title && it.link && it.publishedAt);
}
