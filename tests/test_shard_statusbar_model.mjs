import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  SHARD_IDS,
  buildShardModel,
  resolvePersonPortrait,
} from '../shard-statusbar/src/model.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sample = JSON.parse(
  readFileSync(resolve(ROOT, 'statusbar/data/sample-state.json'), 'utf8'),
);

test('shard model exposes every state domain without write affordances', () => {
  const model = buildShardModel(sample.stat_data);
  assert.deepEqual(model.shards.map((shard) => shard.id), SHARD_IDS);
  assert.equal(model.readOnly, true);
  assert.equal(model.coverage.declaredLeafCount, 172);
  assert.equal(model.shards.find((shard) => shard.id === 'relations').records.length, 3);
  assert.ok(model.shards.every((shard) => Array.isArray(shard.groups)));
  assert.equal('updateVariables' in model, false);
});

test('NPC aliases resolve through the shared narrative portrait registry', () => {
  const result = resolvePersonPortrait(' 雷姆 ');
  assert.equal(result.kind, 'character');
  assert.equal(result.portraitKey, 'rem');
  assert.equal(result.stableId, 'rem');

  const unknown = resolvePersonPortrait('临时旅人');
  assert.equal(unknown.kind, 'generic');
  assert.equal(unknown.portraitKey, 'generic');
  assert.equal(unknown.initial, '临');
});

test('unknown state leaves remain visible in diagnostics', () => {
  const state = structuredClone(sample.stat_data);
  state.主角档案.自定义印记 = '<img src=x onerror=alert(1)>';
  const model = buildShardModel(state);
  assert.deepEqual(model.diagnostics.unknown, [
    { path: '主角档案.自定义印记', value: '<img src=x onerror=alert(1)>' },
  ]);
});
