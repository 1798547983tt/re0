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

test('opening page exposes a persistent music toggle beside settings', () => {
  assert.match(APP, /const MUSIC_STORAGE_KEY = 're0\.creator\.music\.v1'/);
  assert.match(APP, /const OPENING_MUSIC_URL = 'https:\/\/raw\.githubusercontent\.com\/1798547983tt\/re0\/fbb2bde8ac7fe8ba894731cb33f6cdd85f62d968\/music\/MYTH%2B%26%2BROID%2B-%2BSTYX%2BHELIX\.mp3'/);
  assert.match(APP, /function ensureMusicAudio\(\)/);
  assert.match(APP, /audio\.loop = true/);
  assert.match(APP, /audio\.preload = 'metadata'/);
  assert.match(APP, /class="title-top-actions"[\s\S]*\$\{renderMusicButton\(\)\}[\s\S]*data-action="open-settings"/);
  assert.match(APP, /data-action="toggle-music"/);
  assert.match(CSS, /\.title-top-actions \{/);
  assert.match(CSS, /\.music-toggle\.is-playing/);
});

test('music starts enabled, remembers the preference, and retries after autoplay is blocked', () => {
  assert.match(APP, /enabled: true/);
  assert.match(APP, /audio\.play\(\)/);
  assert.match(APP, /safeWriteStorage\(MUSIC_STORAGE_KEY/);
  assert.match(APP, /addEventListener\(['"]pointerdown['"]/);
  assert.match(APP, /NotAllowedError|autoplay/i);
});

test('music play attempts cannot overwrite a later explicit pause', () => {
  assert.match(APP, /playAttempt: 0/);
  assert.match(APP, /const attempt = \+\+music\.playAttempt/);
  assert.match(APP, /attempt !== music\.playAttempt \|\| !music\.enabled \|\| error\?\.name === 'AbortError'/);
  assert.match(APP, /music\.playAttempt \+= 1/);
});

test('late media events cannot overwrite an explicit music opt-out', () => {
  assert.match(APP, /audio\.addEventListener\('play', \(\) => \{\s*if \(!music\.enabled \|\| audio\.paused\) return;/);
  assert.match(APP, /audio\.addEventListener\('pause', \(\) => \{\s*if \(musicIsPlaying\(\)\) return;/);
  assert.match(APP, /audio\.addEventListener\('error', \(\) => \{\s*if \(!music\.enabled \|\| musicIsPlaying\(\)\) \{\s*if \(!music\.enabled\) music\.status = 'paused';\s*music\.error = '';\s*updateMusicControls\(\);\s*return;/);
});

test('disabled music stays lazy and an errored source is reloaded before retry', () => {
  const initialize = APP.match(/async function initialize\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(initialize, /ensureMusicAudio\(\)/);
  assert.match(initialize, /render\(\);\s*if \(music\.enabled\) void attemptMusicPlayback/);
  assert.match(APP, /if \(music\.status === 'error'\) \{\s*audio\.load\(\)/);
});

test('blocked playback and narrow creator headers have visible, bounded states', () => {
  assert.match(CSS, /\.music-toggle\[data-music-state='blocked'\]/);
  assert.match(CSS, /\.music-toggle\[data-music-state='blocked'\]::after/);
  assert.match(CSS, /\.brand-copy strong, \.brand-copy span \{ overflow: hidden; text-overflow: ellipsis; \}/);
});

test('music activity animation honors the in-app reduced-motion setting', () => {
  assert.match(CSS, /\.title-screen\[data-motion='off'\] \.music-toggle \.music-glyph \{ animation: none !important; \}/);
});

test('title screen height stays intrinsic inside auto-sizing message iframes', () => {
  const titleScreenRules = [...CSS.matchAll(/\.title-screen\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .join('\n');
  const titleMainRules = [...CSS.matchAll(/\.title-main\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .join('\n');

  const sizingDeclarations = (rules) => [...rules.matchAll(/\b(?:min-|max-)?(?:height|block-size)\s*:\s*[^;]+/gi)]
    .map((match) => match[0].replace(/\s+/g, ' ').trim());

  assert.doesNotMatch(titleScreenRules, /(?:d|s|l)?vh|vmin|vmax/i);
  assert.doesNotMatch(titleMainRules, /(?:d|s|l)?vh|vmin|vmax/i);
  assert.deepEqual(sizingDeclarations(titleScreenRules), [
    'min-height: clamp(650px,66vw,760px)',
    'min-height: 0',
  ]);
  assert.deepEqual(sizingDeclarations(titleMainRules), [
    'min-height: clamp(560px,58vw,670px)',
    'min-height: 0',
  ]);
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
