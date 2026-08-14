import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DECLARED_DOMAIN_COUNTS,
  expandDeclaredPaths,
  isDeclaredPath,
} from '../statusbar/src/schema-map.mjs';
import {
  buildHudModel,
  collectUnknownPaths,
  firstGrapheme,
  resolveTheme,
} from '../statusbar/src/status-core.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sample = JSON.parse(
  readFileSync(resolve(ROOT, 'statusbar/data/sample-state.json'), 'utf8'),
);

test('schema registry expands all 172 declared leaf paths', () => {
  assert.deepEqual(DECLARED_DOMAIN_COUNTS, {
    世界: 20,
    主角档案: 58,
    轮回: 25,
    关系: 31,
    事件: 13,
    线索: 6,
    资产: 17,
    规则: 2,
  });

  const paths = expandDeclaredPaths();
  assert.equal(paths.length, 172);
  assert.equal(new Set(paths).size, 172);
  assert.equal(isDeclaredPath('关系.人物.蕾姆.好感'), true);
  assert.equal(isDeclaredPath('轮回.存档点.状态快照.世界.任意.深层.字段'), true);
  assert.equal(isDeclaredPath('主角档案.自定义印记'), false);
});

test('view model exposes overview, nine sections and relationship categories', () => {
  const model = buildHudModel(sample.stat_data, { themePreference: 'auto' });
  assert.deepEqual(
    model.sections.map((section) => section.id),
    [
      'overview',
      'protagonist',
      'world',
      'relations',
      'loop',
      'events',
      'clues',
      'assets',
      'diagnostics',
    ],
  );
  assert.equal(model.overview.protagonist.name, '艾米莉亚');
  assert.equal(model.relations.people.length, 3);
  assert.equal(model.overview.instruments.length, 6);
  assert.equal(model.readOnly, true);
});

test('theme derives from world period but honors a manual override', () => {
  assert.equal(resolveTheme('上午', 'auto').mode, 'day');
  assert.equal(resolveTheme('深夜', 'auto').mode, 'night');
  assert.equal(resolveTheme('上午', 'night').mode, 'night');
  assert.equal(resolveTheme('黎明', 'auto').transition, 'dawn');
  assert.equal(resolveTheme('傍晚', 'auto').transition, 'dusk');
  assert.equal(resolveTheme('未知时段', 'auto').mode, 'day');
});

test('unknown passthrough leaves remain available to diagnostics', () => {
  const state = structuredClone(sample.stat_data);
  state.主角档案.自定义印记 = '<img src=x onerror=alert(1)>';
  assert.deepEqual(collectUnknownPaths(state), [
    {
      path: '主角档案.自定义印记',
      value: '<img src=x onerror=alert(1)>',
    },
  ]);
});

test('first grapheme supports CJK and emoji sequences', () => {
  assert.equal(firstGrapheme(' 艾米莉亚 '), '艾');
  assert.equal(firstGrapheme('👩‍🚀星野'), '👩‍🚀');
  assert.equal(firstGrapheme(''), '?');
});
