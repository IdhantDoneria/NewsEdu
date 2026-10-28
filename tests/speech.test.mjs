import test from 'node:test';
import assert from 'node:assert/strict';

// speech.js is a client module; import only its pure helpers via a dynamic
// import with the React hooks stubbed out by the test runner's module graph.
const { toChunks, speakable } = await import('../lib/client/speech.js');

test('toChunks keeps short text whole and splits on sentence boundaries', () => {
  assert.deepEqual(toChunks('One. Two. Three.', 20), ['One. Two. Three.']);
  const long = 'First sentence is here. Second sentence follows it. Third one ends this.';
  const chunks = toChunks(long, 30);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 30));
  assert.equal(chunks.join(' '), long);
});

test('toChunks breaks a very long sentence without losing words', () => {
  const sentence = 'word '.repeat(120).trim() + '.';
  const chunks = toChunks(sentence, 100);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunks.join(' ').split(' ').length, 120);
  assert.deepEqual(toChunks('   '), []);
});

test('speakable removes citation markers, bold and bullets', () => {
  assert.equal(speakable('Rates **held** steady [1][2].\n- Inflation stays high [3].'), 'Rates held steady. Inflation stays high.');
});
