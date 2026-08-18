import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const MODULE_PATH = resolve(ROOT, 'narrative-next/src/packed-parser.mjs');

async function loadPackedParser() {
  assert.equal(existsSync(MODULE_PATH), true, 'packed parser module is missing');
  return import(pathToFileURL(MODULE_PATH).href);
}

function showcaseInner() {
  const source = readFileSync(resolve(ROOT, 'narrative-next/fixtures/showcase.xml'), 'utf8');
  const match = source.match(/^<content\b[^>]*>([\s\S]*?)<\/content>\s*$/i);
  assert.ok(match, 'showcase fixture has no content envelope');
  return match[1];
}

test('lightweight packed parser reads the captured inner content', async () => {
  const { parsePackedContentEnvelope } = await loadPackedParser();
  const parsed = parsePackedContentEnvelope(showcaseInner());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.story.volume, '20');
  assert.equal(parsed.time.period, '深夜');
  assert.equal(parsed.time.text, '魔女历1000年08月17日');
  assert.equal(parsed.blocks.filter((block) => block.type === 'ability').length, 7);
  assert.ok(parsed.blocks.some((block) => block.type === 'scene'));
  assert.ok(parsed.blocks.some((block) => block.type === 'check'));
  assert.ok(parsed.blocks.some((block) => block.type === 'restart'));
});

test('lightweight packed parser keeps player and named dialogue structured', async () => {
  const { parsePackedContentEnvelope } = await loadPackedParser();
  const inner = '<story volume="01"></story><time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time><now_plot>{蕾姆}「你好。」\n\n{#}「出发。」</now_plot>';
  const parsed = parsePackedContentEnvelope(inner);
  assert.deepEqual(parsed.blocks.map((block) => block.type), ['dialogue', 'player-dialogue']);
  assert.equal(parsed.blocks[0].speaker, '蕾姆');
  assert.equal(parsed.blocks[1].speaker, '#');
});

test('lightweight packed parser fails visibly without inventing missing metadata', async () => {
  const { parsePackedContentEnvelope } = await loadPackedParser();
  const parsed = parsePackedContentEnvelope('<now_plot>只有正文。</now_plot>');
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.length > 0);
});

test('packed parser source cannot contain a literal rematchable content envelope', async () => {
  await loadPackedParser();
  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.doesNotMatch(source, /<content>/i);
  assert.doesNotMatch(source, /<\/content>/i);
});
