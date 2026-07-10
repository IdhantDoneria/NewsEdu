import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeadline, stripTrailingSource } from '../lib/text.mjs';

test('normalizeHeadline converts straight double quotes to curly', () => {
  const out = normalizeHeadline('Trump says "it is over"');
  assert.equal(out, 'Trump says “it is over”');
});

test('normalizeHeadline converts straight apostrophes to curly', () => {
  const out = normalizeHeadline("Nato chief tells BBC that Trump comments are like 'family argument'");
  assert.equal(out, 'Nato chief tells BBC that Trump comments are like ‘family argument’');
});

test('normalizeHeadline handles possessive apostrophes (no adjacent quote pair)', () => {
  const out = normalizeHeadline("Khamenei's coffin carried through Shia shrines");
  assert.equal(out, 'Khamenei’s coffin carried through Shia shrines');
});

test('normalizeHeadline collapses whitespace and trims', () => {
  const out = normalizeHeadline('  Too   many    spaces here  ');
  assert.equal(out, 'Too many spaces here');
});

test('normalizeHeadline does not alter word casing', () => {
  const out = normalizeHeadline('US launches strikes on Iran');
  assert.equal(out, 'US launches strikes on Iran');
  const out2 = normalizeHeadline('Trump Hands NATO a Mixed Bag');
  assert.equal(out2, 'Trump Hands NATO a Mixed Bag');
});

test('normalizeHeadline degrades safely for non-string / empty input', () => {
  assert.equal(normalizeHeadline(null), '');
  assert.equal(normalizeHeadline(undefined), '');
  assert.equal(normalizeHeadline(''), '');
  assert.equal(normalizeHeadline(42), '');
});

test('stripTrailingSource removes an exact trailing " - Source" match', () => {
  const out = stripTrailingSource(
    'US stock markets fall amid Iran strikes - The Guardian',
    'The Guardian'
  );
  assert.equal(out, 'US stock markets fall amid Iran strikes');
});

test('stripTrailingSource handles en dash and em dash separators', () => {
  assert.equal(
    stripTrailingSource('Stocks rally – Reuters', 'Reuters'),
    'Stocks rally'
  );
  assert.equal(
    stripTrailingSource('Stocks rally — Reuters', 'Reuters'),
    'Stocks rally'
  );
});

test('stripTrailingSource is case-insensitive', () => {
  assert.equal(
    stripTrailingSource('Stocks rally - reuters', 'Reuters'),
    'Stocks rally'
  );
});

test('stripTrailingSource leaves title untouched when source does not match the suffix', () => {
  const title = 'Fed holds rates steady - marketwatch.com/live';
  assert.equal(stripTrailingSource(title, 'MarketWatch'), title);
});

test('stripTrailingSource leaves a mid-title dash-separated clause alone', () => {
  const title = 'Fed holds rates - a surprise to markets - Bloomberg';
  assert.equal(stripTrailingSource(title, 'Bloomberg'), 'Fed holds rates - a surprise to markets');
});

test('stripTrailingSource degrades safely for missing title/source', () => {
  assert.equal(stripTrailingSource('', 'Reuters'), '');
  assert.equal(stripTrailingSource(null, 'Reuters'), '');
  assert.equal(stripTrailingSource('Headline', ''), 'Headline');
  assert.equal(stripTrailingSource('Headline', null), 'Headline');
});
