import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { selectPreviewFixture } from '../statusbar/src/preview.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sample = JSON.parse(readFileSync(resolve(ROOT, 'statusbar/data/sample-state.json'), 'utf8')).stat_data;

test('preview fixtures isolate empty, malformed, stale and hostile states', () => {
  const empty = selectPreviewFixture(sample, 'empty');
  assert.deepEqual(empty.statData, {});
  assert.equal(empty.status, 'preview');

  const malformed = selectPreviewFixture(sample, 'malformed');
  assert.equal(malformed.statData.世界, '损坏的世界域');
  assert.equal(malformed.statData.主角档案.生命, 'not-a-number');

  const stale = selectPreviewFixture(sample, 'stale');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.statData.主角档案.姓名, '艾米莉亚');

  const hostile = selectPreviewFixture(sample, 'hostile');
  assert.equal(hostile.statData.主角档案.自定义印记, '<img src=x onerror=alert(1)>');
  assert.equal(hostile.statData.事件.进行中['EVT-MANSION-01'].标题, '<script>window.pwned=true</script>');
  assert.equal(globalThis.pwned, undefined);
  assert.notEqual(hostile.statData, sample);
});

test('unknown fixture names keep a cloned sample without mutating the source', () => {
  const normal = selectPreviewFixture(sample, 'normal');
  normal.statData.主角档案.姓名 = '已修改';
  assert.equal(sample.主角档案.姓名, '艾米莉亚');
  assert.equal(normal.status, 'preview');
});
