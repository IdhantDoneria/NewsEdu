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

function decodeEntities(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripHtml(html) {
  return decodeEntities(
    text(html)
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, ' ')
  )
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

const IMG_TAG = /<img[^>]+src=["']([^"']+)["']/i;

/**
 * Feed content is untrusted; anything rendered into an href/src must be a
 * real http(s) URL. Returns the URL string or null.
 */
export function safeHttpUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Best-effort image extraction: media:content, media:thumbnail, enclosure, or first <img> in the body HTML. */
function extractImage(it) {
  const media = it['media:content'];
  const mediaList = Array.isArray(media) ? media : media ? [media] : [];
  const mediaImg = mediaList.find(
    (m) => m && (!m['@_medium'] || m['@_medium'] === 'image') && m['@_url']
  );
  if (mediaImg) return mediaImg['@_url'];

  const thumb = it['media:thumbnail'];
  const thumbList = Array.isArray(thumb) ? thumb : thumb ? [thumb] : [];
  if (thumbList[0]?.['@_url']) return thumbList[0]['@_url'];

  const enclosure = it.enclosure;
  const enclosureList = Array.isArray(enclosure) ? enclosure : enclosure ? [enclosure] : [];
  const enclosureImg = enclosureList.find(
    (e) => e && e['@_url'] && /^image\//.test(e['@_type'] || '')
  );
  if (enclosureImg) return enclosureImg['@_url'];

  const html = text(it.description ?? it['content:encoded'] ?? '');
  const match = html.match(IMG_TAG);
  return match ? match[1] : null;
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
      image: extractImage(it),
    }));
  } else if (doc.feed?.entry) {
    const entries = Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry];
    items = entries.map((it) => ({
      title: stripHtml(it.title),
      link: atomLink(it).trim(),
      summary: stripHtml(it.summary ?? it.content ?? ''),
      publishedAt: Date.parse(text(it.published ?? it.updated ?? '')) || null,
      image: extractImage(it),
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
      image: extractImage(it),
    }));
  }

  return items
    .map((it) => ({ ...it, link: safeHttpUrl(it.link), image: safeHttpUrl(it.image) }))
    .filter((it) => it.title && it.link && it.publishedAt);
}
