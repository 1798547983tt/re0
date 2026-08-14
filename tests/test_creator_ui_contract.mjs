import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = readFileSync(resolve(ROOT, 'frontend', 'src', 'app.mjs'), 'utf8');
const CORE = readFileSync(resolve(ROOT, 'frontend', 'src', 'creator-core.mjs'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'frontend', 'styles.css'), 'utf8');

function stringArray(source, name) {
  const body = source.match(new RegExp(`(?:export )?const ${name} = \\[([^\\]]*)\\]`))?.[1];
  assert.ok(body, `${name} should be declared as an array`);
  return [...body.matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

test('title screen keeps one Re:0 title, uniform menu arrows, and no status footer', () => {
  assert.match(APP, /Re0：从零开始的异世界生活/);
  assert.doesNotMatch(APP, /RE:ZERO \/ ANOTHER CHRONICLE/);
  assert.doesNotMatch(APP, /从零开始的异世界生活 · 角色档案/);
  assert.doesNotMatch(APP, /RETURN BY DEATH · WITCH'S TEA PARTY/);
  assert.doesNotMatch(APP, /在命运翻页以前/);
  assert.doesNotMatch(APP, /class="title-footer"/);
  assert.doesNotMatch(APP, /<i>↥<\/i>|<i>↓<\/i>/);
  assert.match(CSS, /--title-menu-glass:/);
});

test('creator topbar keeps only settings while utilities live inside settings', () => {
  const topActions = APP.match(/<div class="top-actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(topActions, /data-action="open-settings"/);
  assert.doesNotMatch(topActions, /save-draft|data-import-draft|open-help/);

  const settings = APP.match(/function renderSettingsModal\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(settings, /data-action="save-draft"/);
  assert.match(settings, /data-import-draft/);
  assert.match(settings, /data-action="open-help"/);
});

test('creator uses preset-first controls with custom entry and quick inspiration', () => {
  assert.match(APP, /data-preset-path/);
  assert.match(APP, /自由填写/);
  assert.match(APP, /data-inspiration-path/);
  assert.doesNotMatch(APP, /protagonist\.ageStage/);
  assert.match(CORE, /加护.*权能.*魔法.*精灵术.*种族能力.*武技.*一般技能/s);
});

test('preset catalogs keep the confirmed choices', () => {
  assert.deepEqual(stringArray(APP, 'IDENTITY_OPTIONS'), ['平民', '旅人', '冒险者', '佣兵', '骑士', '商人', '贵族', '学者', '教会人员']);
  assert.deepEqual(stringArray(APP, 'GENDER_OPTIONS'), ['女性', '男性', '非二元', '不公开']);
  assert.deepEqual(stringArray(APP, 'RACE_OPTIONS'), ['人类', '半精灵', '精灵', '鬼族', '兽人', '亚人']);
  assert.deepEqual(stringArray(APP, 'LOCATION_OPTIONS'), ['王都', '贵族宅邸', '城镇街区', '森林或荒野', '战场', '边境地区']);
  assert.deepEqual(stringArray(APP, 'ENTRY_CONTEXT_OPTIONS'), ['街道', '室内', '庭院', '森林', '战场边缘', '城门附近']);
  assert.deepEqual(stringArray(APP, 'ABILITY_STATUS_OPTIONS'), ['可用', '受限', '封印', '失控', '冷却中']);
  assert.deepEqual(stringArray(APP, 'ABILITY_COST_OPTIONS'), ['无', '体力', '魔力', '精神', '生命', '条件触发']);
  assert.deepEqual(stringArray(APP, 'RELATION_TYPE_OPTIONS'), ['同伴', '亲属', '主从', '师徒', '盟友', '宿敌', '陌生人']);
  assert.deepEqual(stringArray(CORE, 'ABILITY_CATEGORIES'), ['加护', '权能', '魔法', '精灵术', '种族能力', '武技', '一般技能']);
  assert.match(APP, /FACTIONS\.filter\(\(value\) => value !== '其他'\)/);
});

test('companion strip appears before the form and exposes a collapsed AI disclosure', () => {
  const companion = APP.indexOf('${renderCompanionBar()}');
  const workspace = APP.indexOf('<div class="workspace">');
  assert.ok(companion >= 0 && companion < workspace);
  assert.match(APP, /class="companion-bar"/);
  assert.match(APP, /<details class="ai-disclosure"/);
});

test('arsenal and review use progressive disclosure instead of one long page', () => {
  assert.match(APP, /role="tablist"[^>]*aria-label="羁绊栏目"/);
  assert.match(APP, /id: 'combat'.*id: 'abilities'.*id: 'relationships'.*id: 'assets'/s);
  assert.match(APP, /data-arsenal-tab=/);
  assert.match(APP, /class="review-disclosure/);
});

test('visual tokens use restrained panel radii', () => {
  assert.match(CSS, /--radius-panel:\s*10px/);
  assert.match(CSS, /--radius-control:\s*7px/);
  assert.match(CSS, /\.companion-bar \{ grid-template-columns: 118px minmax\(0,1fr\); min-height: 176px;/);
});
