import test from 'node:test';
import assert from 'node:assert/strict';

import { detectMarkets, isMarketKey, marketSources } from '../lib/intelligence/marketsctx.mjs';
import { answerChat } from '../lib/intelligence/chat.mjs';
import { cacheKey } from '../lib/intelligence/chatcache.mjs';

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

test('detects the market a question is about', () => {
  assert.deepEqual(detectMarkets("What's going on in the Indian markets today?"), ['India']);
  assert.deepEqual(detectMarkets('How did Nifty and the Nikkei do?'), ['India', 'Japan']);
  assert.deepEqual(detectMarkets('Is the DAX rallying after the ECB?'), ['Germany']);
  assert.deepEqual(detectMarkets('how are Wall Street stocks doing'), ['US']);
});

test('a country alone is not a markets question', () => {
  assert.deepEqual(detectMarkets('India China border talks resume'), []);
  assert.deepEqual(detectMarkets('What did the Japanese PM say about Taiwan?'), []);
});

test('the Markets tab default applies only when the question names no market', () => {
  assert.deepEqual(detectMarkets('how is it doing today?', { defaultMarket: 'Japan', force: true }), ['Japan']);
  assert.deepEqual(detectMarkets('and how is India?', { defaultMarket: 'Japan', force: true }), ['India']);
  assert.deepEqual(detectMarkets('how is it doing?', { defaultMarket: 'Atlantis', force: true }), []);
  assert.ok(isMarketKey('South Korea') && !isMarketKey('Narnia'));
});

const ctx = {
  articles: [
    { title: 'Sensex plunges 1,045 points as oil prices surge', link: 'https://example.com/a', publishedAt: new Date().toUTCString(), source: 'Reuters' },
    { title: 'Nifty hits 2026 low', link: 'https://example.com/b', publishedAt: 'not a date', source: 'Moneycontrol' },
  ],
  snapshot: { symbol: '^BSESN', name: 'BSE Sensex', currency: 'INR', price: 79210.5, change: -1045.2, changePercent: -1.3, asOf: Date.UTC(2026, 9, 29, 10, 0) },
};

test('market sources include the index level and headlines, shaped like articles', () => {
  const s = marketSources('India', ctx);
  assert.equal(s.length, 3);
  assert.equal(s[0].sourceName, 'Yahoo Finance');
  assert.match(s[0].summary, /down 1,045\.20 points/);
  assert.equal(s[0].link, 'https://finance.yahoo.com/quote/%5EBSESN');
  assert.equal(s[1].sourceName, 'Reuters');
  assert.ok(s.every((x) => x.id.startsWith('mkt-india-') && x.clusterId === null && Number.isFinite(x.publishedAt)));
  assert.deepEqual(marketSources('India', { articles: [], snapshot: null }), []);
});

test('chat answers a markets question from pinned market sources the finance wire lacks', async () => {
  const wire = [{ id: 'w1', title: 'Apple earnings beat', summary: 'iPhone sales rose.', link: 'https://example.com/w', sourceName: 'CNBC', publishedAt: Date.now(), score: 80, clusterId: null }];
  const res = await answerChat({
    articles: wire, edition: 'finance', message: "What's going on in the Indian markets today?",
    pinned: marketSources('India', ctx),
  });
  const titles = res.citations.map((c) => c.title).join(' | ');
  assert.match(titles, /Sensex|Nifty/);
  assert.ok(!/does not contain/i.test(res.answer));
});

test('the answer cache key separates markets and time buckets', () => {
  const base = { edition: 'finance', question: 'how are markets?', memory: [], learn: false };
  assert.notEqual(cacheKey({ ...base, briefVersion: '1|India|5' }), cacheKey({ ...base, briefVersion: '1|Japan|5' }));
  assert.notEqual(cacheKey({ ...base, briefVersion: '1|India|5' }), cacheKey({ ...base, briefVersion: '1|India|6' }));
});

test('maxHeadlines leaves room for a second market in the pinned budget', () => {
  const many = { ...ctx, articles: Array.from({ length: 10 }, (_, i) => ({ title: `Headline ${i}`, link: `https://example.com/${i}`, publishedAt: new Date().toUTCString(), source: 'S' })) };
  assert.equal(marketSources('India', many).length, 9); // index + 8 headlines
  const shared = [...marketSources('India', many, Date.now(), { maxHeadlines: 3 }), ...marketSources('Japan', many, Date.now(), { maxHeadlines: 3 })];
  assert.equal(shared.length, 8);
  assert.ok(shared.some((s) => s.id.startsWith('mkt-japan')) && shared.length <= 9);
});
