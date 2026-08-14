# Re:Zero 全变量日夜动态状态栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a read-only, message-inline Re:Zero HUD that maps every declared state path, supports distinct day/night presentations, and stores user-selected portraits locally.

**Architecture:** Keep the status bar independent from the creator wizard. A pure schema registry and view-model core own field coverage and normalization; browser modules own runtime discovery, IndexedDB portraits, safe DOM rendering, and lifecycle cleanup. A project-local packager concatenates the dependency-ordered modules into one AI-output regex artifact whose zero-width end-of-message replacement preserves the original message and `<UpdateVariable>` block.

**Tech Stack:** Build-free semantic HTML, CSS, ECMAScript modules, Node.js built-in test runner, IndexedDB, Canvas, SillyTavern regex 1.18.0 contract, Tavern Helper 4.8.19 declaration baseline, MVU pinned declaration snapshot, built-in ImageGen.

---

### Task 1: Record the accepted domain and architecture decisions

**Files:**
- Modify: `CONTEXT.md`
- Create: `docs/adr/0006-状态栏只读状态与本地个性化分离.md`
- Create: `docs/adr/0007-状态栏采用消息内双层界面.md`

- [x] **Step 1: Add the canonical status-bar vocabulary**

Add these exact concepts under the variable-system vocabulary:

```markdown
**状态栏**：贴近聊天消息、用于反复扫读当前状态的只读两层界面；常驻概览展示高频信息，分区详情通过选项切换完整浏览各变量领域，但不写入状态协议，也不承担创角或世界资料维护。
_避免_：控制中心、角色编辑器、变量修改器、把全部变量同时平铺的长页面

**完整状态映射**：状态协议中每个正式字段都有明确的展示位置，动态记录可逐项浏览，协议允许的未知字段可在诊断视图中回查；默认折叠敏感或庞大的数据仍属于完整映射。
_避免_：只展示当前非空字段、把原始状态树直接平铺

**状态栏头像**：状态栏中主角档案和关系人物的本地视觉标识；没有自定义图像时显示姓名首字，用户可从本地文件或图片 URL 替换。
_避免_：把头像当作人物资料来源、把固定作品角色图当作当前主角身份

**状态栏界面模式**：状态栏的日间或夜间完整视觉呈现，默认随世界时段选择，并允许用户在界面中覆盖或恢复自动选择；模式变化包含场景、层次和动态表现，但不修改世界时间。
_避免_：只替换色板、把界面选择写入状态协议

**状态栏头像库**：由用户在浏览器本地维护的姓名与头像映射，同名人物可跨聊天复用，并允许当前聊天单独覆盖；它属于界面个性化信息，不属于人物档案或状态协议。
_避免_：人物资料库、自动上传的公开图库
```

- [x] **Step 2: Add the two accepted ADRs**

Use the exact accepted decision paragraphs from the planning conversation: one ADR for read-only state versus browser-local personalization and one ADR for the message-inline two-layer surface.

- [x] **Step 3: Validate documentation whitespace**

Run: `git diff --check -- CONTEXT.md docs/adr/0006-状态栏只读状态与本地个性化分离.md docs/adr/0007-状态栏采用消息内双层界面.md`

Expected: exit 0 with no whitespace-error lines.

- [x] **Step 4: Commit the decision record**

```powershell
git add CONTEXT.md docs/adr/0006-状态栏只读状态与本地个性化分离.md docs/adr/0007-状态栏采用消息内双层界面.md docs/superpowers/plans/2026-08-14-re0-statusbar.md
git commit -m "docs: record status bar architecture"
```

### Task 2: Build the schema coverage registry and read-only view model

**Files:**
- Create: `tests/test_statusbar_core.mjs`
- Create: `statusbar/src/schema-map.mjs`
- Create: `statusbar/src/status-core.mjs`
- Create: `statusbar/data/sample-state.json`

- [x] **Step 1: Write the failing core tests**

Create tests that import the planned public functions before their modules exist:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DECLARED_DOMAIN_COUNTS, expandDeclaredPaths } from '../statusbar/src/schema-map.mjs';
import { buildHudModel, collectUnknownPaths, resolveTheme, firstGrapheme } from '../statusbar/src/status-core.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sample = JSON.parse(readFileSync(resolve(ROOT, 'statusbar/data/sample-state.json'), 'utf8'));

test('schema registry expands all 172 declared leaf paths', () => {
  assert.deepEqual(DECLARED_DOMAIN_COUNTS, { 世界: 20, 主角档案: 58, 轮回: 25, 关系: 31, 事件: 13, 线索: 6, 资产: 17, 规则: 2 });
  assert.equal(expandDeclaredPaths().length, 172);
});

test('view model exposes overview, nine sections and relationship categories', () => {
  const model = buildHudModel(sample.stat_data, { themePreference: 'auto' });
  assert.deepEqual(model.sections.map(section => section.id), ['overview', 'protagonist', 'world', 'relations', 'loop', 'events', 'clues', 'assets', 'diagnostics']);
  assert.equal(model.overview.protagonist.name, '艾米莉亚');
  assert.equal(model.relations.people.length, 3);
  assert.equal(model.readOnly, true);
});

test('theme derives from world period but honors a manual override', () => {
  assert.equal(resolveTheme('上午', 'auto').mode, 'day');
  assert.equal(resolveTheme('深夜', 'auto').mode, 'night');
  assert.equal(resolveTheme('上午', 'night').mode, 'night');
  assert.equal(resolveTheme('傍晚', 'auto').transition, 'dusk');
});

test('unknown passthrough leaves remain available to diagnostics', () => {
  const state = structuredClone(sample.stat_data);
  state.主角档案.自定义印记 = '<img src=x onerror=alert(1)>';
  assert.deepEqual(collectUnknownPaths(state), [{ path: '主角档案.自定义印记', value: '<img src=x onerror=alert(1)>' }]);
});

test('first grapheme supports CJK and emoji sequences', () => {
  assert.equal(firstGrapheme(' 艾米莉亚 '), '艾');
  assert.equal(firstGrapheme('👩‍🚀星野'), '👩‍🚀');
  assert.equal(firstGrapheme(''), '?');
});
```

- [x] **Step 2: Run the core tests and verify RED**

Run: `node --test tests/test_statusbar_core.mjs`

Expected: FAIL with module-not-found for `statusbar/src/schema-map.mjs`.

- [x] **Step 3: Implement the declarative registry**

Export `FIELD_GROUPS`, `DECLARED_DOMAIN_COUNTS`, `expandDeclaredPaths()`, and `isDeclaredPath(path)`. Represent repeated fields with explicit variants so seven ability categories expand to 28 leaves. Treat checkpoint snapshot descendants as declared through a terminal deep wildcard while keeping its six explicit domain roots in the 172 count.

```js
export const DECLARED_DOMAIN_COUNTS = Object.freeze({ 世界: 20, 主角档案: 58, 轮回: 25, 关系: 31, 事件: 13, 线索: 6, 资产: 17, 规则: 2 });

export const FIELD_GROUPS = Object.freeze([
  { domain: '世界', base: '世界.当前时间', fields: ['规范日期', '时段', '时间层', '轮回分支'] },
  { domain: '世界', base: '世界.当前地点', fields: ['国家', '地区', '场所', '具体位置'] },
  { domain: '世界', base: '世界.环境', fields: ['天气', '光照', '描述'] },
  { domain: '世界', base: '世界', fields: ['危机等级'] },
  { domain: '世界', base: '世界.动向.{事件ID}', fields: ['标题', '阶段', '类型', '地点', '描述'] },
  { domain: '世界', base: '世界.势力态势.{势力名}', fields: ['立场', '状态', '描述'] },
  { domain: '主角档案', base: '主角档案', fields: ['主角锁定', '姓名', '角色类型', '性别', '年龄阶段', '种族', '身份', '阵营', '容貌', '衣着', '生存状态', '生命', '体力', '魔力', '精神稳定', '门状态', '门负荷', '魔女余香'] },
  { domain: '主角档案', base: '主角档案.伤势.{伤势ID}', fields: ['部位', '程度', '描述'] },
  { domain: '主角档案', base: '主角档案.异常状态.{状态ID}', fields: ['类型', '剩余表现', '描述'] },
  { domain: '主角档案', base: '主角档案', fields: ['当前形态'] },
  { domain: '主角档案', base: '主角档案.战力等阶', fields: ['阶数', '位阶', '可战状态', '生效条件'] },
  { domain: '主角档案', base: '主角档案.能力.{类别}.{能力ID}', fields: ['状态', '可用性', '消耗或冷却', '描述'], variants: { 类别: ['加护', '权能', '魔法', '精灵术', '种族能力', '武技', '一般技能'] } },
  { domain: '主角档案', base: '主角档案', fields: ['当前目标'] },
  { domain: '轮回', base: '轮回', fields: ['世界重启次数', '当前轮回编号'] },
  { domain: '轮回', base: '轮回.存档点', fields: ['有效', '创建时间'] },
  { domain: '轮回', base: '轮回.存档点.状态快照.{快照域}', fields: ['{任意键}'], variants: { 快照域: ['世界', '主角档案', '关系', '事件', '线索', '资产'] }, deep: true },
  { domain: '轮回', base: '轮回.最近一次重启', fields: ['死亡事件ID', '重启编号', '触发时间', '恢复结果'] },
  { domain: '轮回', base: '轮回.菜月昴死亡记录.{死亡ID}', fields: ['重启编号', '死亡时规范日期与时段', '死亡时地点', '直接原因', '死亡经过与最后行动', '在场或相关人物', '触发前轮回分支', '本轮遗留情报'] },
  { domain: '轮回', base: '轮回.最近一次死亡', fields: ['死亡ID', '直接原因', '死亡经过'] },
  { domain: '关系', base: '关系.伴侣.{姓名}', fields: ['关系阶段', '亲密度', '立场', '生存状态', '当前地点', '当前行动'] },
  { domain: '关系', base: '关系.契约伙伴.{姓名}', fields: ['契约状态', '关系阶段', '信任', '立场', '生存状态', '当前地点', '当前行动'] },
  { domain: '关系', base: '关系.人物.{姓名}', fields: ['身份', '阵营', '关系阶段', '立场', '好感', '信任', '生存状态', '生命', '魔力', '当前地点', '当前行动', '当前形态'] },
  { domain: '关系', base: '关系.人物.{姓名}.伤势.{伤势ID}', fields: ['部位', '程度', '描述'] },
  { domain: '关系', base: '关系.人物.{姓名}.异常状态.{状态ID}', fields: ['类型', '剩余表现', '描述'] },
  { domain: '事件', base: '事件.进行中.{事件ID}', fields: ['标题', '类型', '阶段', '状态', '地点', '参与者', '目标', '描述'] },
  { domain: '事件', base: '事件.近期记录.{事件ID}', fields: ['标题', '结果', '规范日期', '参与者', '描述'] },
  { domain: '线索', base: '线索.当前线索.{线索ID}', fields: ['标题', '状态', '关联事件', '描述', '下一步'] },
  { domain: '线索', base: '线索', fields: ['未解问题'] },
  { domain: '资产', base: '资产.货币.{货币类型}', fields: ['数量', '持有者', '存放位置'] },
  { domain: '资产', base: '资产.物品.{物品ID}', fields: ['名称', '数量', '持有者', '存放位置', '描述'] },
  { domain: '资产', base: '资产.装备.{装备ID}', fields: ['名称', '持有者', '装备状态', '损耗', '当前效果'] },
  { domain: '资产', base: '资产.据点与存放.{据点ID}', fields: ['名称', '位置', '控制者', '状态'] },
  { domain: '规则', base: '规则', fields: ['schema版本', '初始化完成'] },
]);
```

- [x] **Step 4: Implement normalization and the HUD model**

Export these stable interfaces:

```js
export function asRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
export function asList(value) { return Array.isArray(value) ? value : []; }
export function asText(value, fallback = '未记录') { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
export function clampMeter(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback; }
export function resolveTheme(period, preference = 'auto') {
  const transition = period === '黎明' ? 'dawn' : period === '傍晚' ? 'dusk' : 'steady';
  const automatic = ['夜间', '深夜', '凌晨'].includes(period) ? 'night' : 'day';
  const mode = preference === 'day' || preference === 'night' ? preference : automatic;
  return { mode, transition, preference: preference === 'day' || preference === 'night' ? preference : 'auto' };
}
export function firstGrapheme(name) {
  const normalized = asText(name, '').trim();
  if (!normalized) return '?';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') return new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(normalized)[Symbol.iterator]().next().value.segment;
  return Array.from(normalized)[0] || '?';
}
export function collectUnknownPaths(statData) {
  return flattenLeaves(asRecord(statData)).filter(entry => !isDeclaredPath(entry.path));
}
export function buildHudModel(statData, uiState = {}) {
  const root = asRecord(statData);
  const world = asRecord(root.世界);
  const protagonist = asRecord(root.主角档案);
  const loop = asRecord(root.轮回);
  const relations = asRecord(root.关系);
  const time = asRecord(world.当前时间);
  const people = [
    ...Object.entries(asRecord(relations.伴侣)).map(([name, value]) => ({ name, category: '伴侣', ...asRecord(value) })),
    ...Object.entries(asRecord(relations.契约伙伴)).map(([name, value]) => ({ name, category: '契约伙伴', ...asRecord(value) })),
    ...Object.entries(asRecord(relations.人物)).map(([name, value]) => ({ name, category: '人物', ...asRecord(value) })),
  ];
  return Object.freeze({
    readOnly: true,
    theme: resolveTheme(time.时段, uiState.themePreference),
    sections: NAV_SECTIONS,
    overview: buildOverview(world, protagonist, loop),
    protagonist,
    world,
    loop,
    relations: { people },
    events: asRecord(root.事件), clues: asRecord(root.线索), assets: asRecord(root.资产), rules: asRecord(root.规则),
    diagnostics: { unknown: collectUnknownPaths(root) },
  });
}
```

`buildOverview` returns the formatted world strip, protagonist identity, six clamped instruments, target, loop identity, restart count, and at most three injury/abnormal/event alerts. `flattenLeaves` treats arrays as one inert leaf and recursively walks plain objects. `NAV_SECTIONS` is the frozen nine-entry array asserted by the test.

- [x] **Step 5: Add a representative full fixture**

Create `{ "stat_data": { ... } }` with all eight domains, at least one entry in every dynamic record category, one item in each ability category, three relationship categories, one death record, one active and recent event, one clue, one unresolved question, each asset type, and a passthrough value under a dedicated test-only branch.

- [x] **Step 6: Run the core tests and verify GREEN**

Run: `node --test tests/test_statusbar_core.mjs`

Expected: 5 passing tests, 0 failures.

- [x] **Step 7: Commit the core**

```powershell
git add tests/test_statusbar_core.mjs statusbar/src/schema-map.mjs statusbar/src/status-core.mjs statusbar/data/sample-state.json
git commit -m "feat: map Re Zero status data"
```

### Task 3: Add the version-aware, read-only Tavern Helper and MVU bridge

**Files:**
- Create: `tests/test_statusbar_runtime.mjs`
- Create: `statusbar/src/runtime.mjs`
- Create: `statusbar/RUNTIME.md`

- [x] **Step 1: Write the failing runtime tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeBridge } from '../statusbar/src/runtime.mjs';

test('runtime reads stat_data from the iframe message floor without writing', async () => {
  const calls = [];
  const scope = {
    getCurrentMessageId: () => 7,
    getVariables: options => { calls.push(options); return { stat_data: { 规则: { 初始化完成: true } } }; },
    getTavernVersion: () => '1.18.0',
    getTavernHelperVersion: () => '4.8.19',
  };
  const bridge = createRuntimeBridge(scope);
  const result = await bridge.read();
  assert.deepEqual(calls, [{ type: 'message', message_id: 7 }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.statData.规则.初始化完成, true);
  assert.equal('replaceVariables' in bridge, false);
});

test('runtime subscribes through exported MVU constants and cleans up', () => {
  const stopped = [];
  const listened = [];
  const scope = {
    Mvu: { events: { VARIABLE_INITIALIZED: 'init', VARIABLE_UPDATE_ENDED: 'ended' } },
    eventOn: event => { listened.push(event); return { stop: () => stopped.push(event) }; },
  };
  const dispose = createRuntimeBridge(scope).subscribe(() => {});
  assert.deepEqual(listened, ['init', 'ended']);
  dispose();
  assert.deepEqual(stopped, ['init', 'ended']);
});

test('runtime exposes an unavailable result instead of guessing missing APIs', async () => {
  const result = await createRuntimeBridge({}).read();
  assert.equal(result.status, 'unavailable');
  assert.match(result.message, /Tavern Helper|MVU/);
});
```

- [x] **Step 2: Run the runtime tests and verify RED**

Run: `node --test tests/test_statusbar_runtime.mjs`

Expected: FAIL with module-not-found for `statusbar/src/runtime.mjs`.

- [x] **Step 3: Implement the capability bridge**

```js
export function createRuntimeBridge(scope = globalThis) {
  const callable = name => typeof scope[name] === 'function' ? scope[name].bind(scope) : typeof scope.TavernHelper?.[name] === 'function' ? scope.TavernHelper[name].bind(scope.TavernHelper) : null;
  const messageId = () => { try { return callable('getCurrentMessageId')?.(); } catch { return null; } };
  return Object.freeze({
    probe() { return { tavern: safeVersion(callable('getTavernVersion')), helper: safeVersion(callable('getTavernHelperVersion')), messageId: messageId(), hasGetVariables: !!callable('getVariables'), hasMvu: !!scope.Mvu }; },
    async read(lastGood = null) {
      const id = messageId();
      try {
        const getVariables = callable('getVariables');
        const data = getVariables?.({ type: 'message', ...(Number.isInteger(id) ? { message_id: id } : { message_id: 'latest' }) });
        if (data?.stat_data && typeof data.stat_data === 'object') return { status: 'ready', statData: data.stat_data, source: 'getVariables' };
      } catch (error) { if (!scope.Mvu && lastGood) return { status: 'stale', statData: lastGood, message: String(error) }; }
      try {
        const data = scope.Mvu?.getMvuData?.({ type: 'message', message_id: Number.isInteger(id) ? id : 'latest' });
        if (data?.stat_data && typeof data.stat_data === 'object') return { status: 'ready', statData: data.stat_data, source: 'Mvu.getMvuData' };
      } catch (error) { if (lastGood) return { status: 'stale', statData: lastGood, message: String(error) }; }
      return lastGood ? { status: 'stale', statData: lastGood, message: '变量接口暂不可用' } : { status: 'unavailable', statData: {}, message: '未检测到可用的 Tavern Helper 或 MVU 消息变量接口' };
    },
    subscribe(refresh) {
      const on = callable('eventOn');
      const events = scope.Mvu?.events;
      if (!on || !events) return () => {};
      const stops = [events.VARIABLE_INITIALIZED, events.VARIABLE_UPDATE_ENDED].filter(Boolean).map(event => on(event, refresh));
      return () => stops.forEach(handle => { try { handle?.stop?.(); } catch {} });
    },
  });
}
```

- [x] **Step 4: Record dependency provenance**

Document SillyTavern 1.18.0 regex engine commit, Tavern Helper 4.8.19 declaration commit, MVU declaration/event snapshot, the card-embedded loader identity, remote loader URL, confidence, and the exact runtime checks still pending.

- [x] **Step 5: Run the runtime tests and verify GREEN**

Run: `node --test tests/test_statusbar_runtime.mjs`

Expected: 3 passing tests, 0 failures.

- [x] **Step 6: Commit the runtime adapter**

```powershell
git add tests/test_statusbar_runtime.mjs statusbar/src/runtime.mjs statusbar/RUNTIME.md
git commit -m "feat: add read only MVU runtime bridge"
```

### Task 4: Add portrait identity, HTTPS validation, IndexedDB persistence, and crop output

**Files:**
- Create: `tests/test_statusbar_portraits.mjs`
- Create: `statusbar/src/portraits.mjs`

- [x] **Step 1: Write the failing portrait tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortraitName, portraitKeys, validatePortraitUrl, resolvePortrait } from '../statusbar/src/portraits.mjs';

test('portrait keys separate protagonist, shared person and chat override', () => {
  assert.deepEqual(portraitKeys({ namespace: 'person', name: ' 艾米莉亚 ', chatId: 'chat/1' }), {
    shared: 'person:艾米莉亚', override: 'chat:chat%2F1:person:艾米莉亚',
  });
  assert.equal(normalizePortraitName('  雷  姆 '), '雷 姆');
});

test('portrait URLs accept HTTPS only', () => {
  assert.equal(validatePortraitUrl('https://example.com/a.png').ok, true);
  assert.equal(validatePortraitUrl('http://example.com/a.png').ok, false);
  assert.equal(validatePortraitUrl('javascript:alert(1)').ok, false);
  assert.equal(validatePortraitUrl('data:image/png;base64,AA').ok, false);
});

test('portrait resolution prefers chat override, then shared, then initial', () => {
  assert.equal(resolvePortrait({ name: '蕾姆', shared: { kind: 'url', value: 'https://a.test/a.png' }, override: { kind: 'url', value: 'https://b.test/b.png' } }).value, 'https://b.test/b.png');
  assert.equal(resolvePortrait({ name: '蕾姆' }).initial, '蕾');
});
```

- [x] **Step 2: Run the portrait tests and verify RED**

Run: `node --test tests/test_statusbar_portraits.mjs`

Expected: FAIL with module-not-found for `statusbar/src/portraits.mjs`.

- [x] **Step 3: Implement the portrait core and browser repository**

Export the tested pure functions plus `createPortraitRepository({ indexedDB, databaseName })` and `cropPortrait({ source, zoom, offsetX, offsetY, size, document })`. The repository creates one `portraits` object store keyed by the strings from `portraitKeys`, stores blobs or validated URLs with crop metadata, and exposes `get`, `put`, and `remove`. `cropPortrait` draws a centered square to Canvas and resolves a bounded WebP blob; it rejects non-image inputs and preserves the previous record on failure.

- [x] **Step 4: Run the portrait tests and verify GREEN**

Run: `node --test tests/test_statusbar_portraits.mjs`

Expected: 3 passing tests, 0 failures.

- [x] **Step 5: Commit the portrait domain**

```powershell
git add tests/test_statusbar_portraits.mjs statusbar/src/portraits.mjs
git commit -m "feat: add local portrait library"
```

### Task 5: Build the semantic HUD shell and all nine section renderers

**Files:**
- Create: `tests/test_statusbar_surface.mjs`
- Create: `statusbar/index.html`
- Create: `statusbar/styles.css`
- Create: `statusbar/src/app.mjs`
- Create: `statusbar/README.md`

- [x] **Step 1: Write the failing surface contract**

Test that the maintained HTML contains one namespaced mount and overlay root, the CSS includes container-based narrow layout and reduced-motion handling, and the app source contains the nine stable section IDs, real button creation, `textContent`, avatar actions, a dialog/drawer close path, and no `replaceVariables` or model-derived `innerHTML`.

```js
test('status bar source exposes the complete read-only accessible surface', () => {
  assert.match(html, /data-re0-statusbar-mount/);
  assert.match(html, /id="re0-statusbar-app"/);
  assert.match(html, /id="re0-statusbar-overlay-root"/);
  for (const id of ['overview','protagonist','world','relations','loop','events','clues','assets','diagnostics']) assert.ok(app.includes(`'${id}'`));
  assert.match(app, /textContent/);
  assert.match(app, /createElement\(['"]button['"]\)/);
  assert.doesNotMatch(app, /replaceVariables|updateVariablesWith|insertOrAssignVariables/);
  assert.doesNotMatch(app, /\.innerHTML\s*=\s*[^'"`]/);
  assert.match(css, /@container/);
  assert.match(css, /prefers-reduced-motion/);
});
```

- [x] **Step 2: Run the surface test and verify RED**

Run: `node --test tests/test_statusbar_surface.mjs`

Expected: FAIL because the status-bar surface files do not exist.

- [x] **Step 3: Create the static shell**

Use one mount, one `main` with `aria-live="polite"`, one overlay root, a no-script message, the stylesheet, and one module entry. Keep the same IDs when packaged so the offline and regex builds share one binder.

- [x] **Step 4: Implement safe DOM rendering**

`app.mjs` must construct every dynamic node with DOM methods and `textContent`. Implement `renderOverview`, `renderProtagonist`, `renderWorld`, `renderRelations`, `renderLoop`, `renderEvents`, `renderClues`, `renderAssets`, and `renderDiagnostics`; each consumes the stable model and uses reusable `meter`, `fieldList`, `recordCards`, `emptyState`, and `diagnosticTree` builders.

- [x] **Step 5: Implement interactions and lifecycle**

Use delegated `data-action` handlers for expand/collapse, section selection, relationship filters, person drawer, death-book disclosure, snapshot confirmation, theme cycle, restore automatic theme, portrait edit, retry, and close. Preserve the active section and expanded keys across data refresh; clean up listeners, observers, object URLs, event subscriptions, and scheduled renders in one `destroy()` path.

- [x] **Step 6: Implement the two visual systems**

Day mode uses porcelain, parchment, honey-gold light, ice-blue details, arch geometry, floating dust, and steam. Night mode uses ink navy, antique silver, spectral cyan, restrained witch-violet, crystal facets, chess/rune geometry, snow, mist, and butterfly light. Navigation stays stable; content composition, background art, surface materials, ornament, and ambient layers change. Use `container-type: inline-size`, a desktop side rail/two-column detail layout, and a narrow horizontal rail/single-column layout at 700px and below.

- [x] **Step 7: Implement avatar editing UI**

The modal provides file input, HTTPS URL input, preview, zoom, horizontal and vertical position controls, shared-versus-current-chat target, save, remove, reset, Escape, backdrop close, focus trapping, and focus return. Show quota/decode/URL errors through an `aria-live` message and never discard the existing portrait until the replacement succeeds.

- [x] **Step 8: Run the surface and core suites**

Run: `node --test tests/test_statusbar_core.mjs tests/test_statusbar_runtime.mjs tests/test_statusbar_portraits.mjs tests/test_statusbar_surface.mjs`

Expected: all status-bar tests pass with no warnings.

- [x] **Step 9: Commit the complete offline HUD**

```powershell
git add tests/test_statusbar_surface.mjs statusbar/index.html statusbar/styles.css statusbar/src/app.mjs statusbar/README.md
git commit -m "feat: build Re Zero status bar interface"
```

### Task 6: Generate and publish purpose-built day and night artwork

**Files:**
- Create: `tests/test_statusbar_assets.mjs`
- Create: `statusbar/assets/day-archive-wide.webp`
- Create: `statusbar/assets/day-archive-mobile.webp`
- Create: `statusbar/assets/night-tea-wide.webp`
- Create: `statusbar/assets/night-tea-mobile.webp`
- Create: `statusbar/assets/manifest.json`
- Create: `statusbar/src/assets.mjs`
- Create: `statusbar/assets/README.md`

- [x] **Step 1: Write the failing asset contract**

Assert that all four files exist, decode as non-empty images, the manifest lists matching local paths and fallbacks, every production URL targets `1798547983tt/re0` at a 40-character commit, and `assetUrl(name)` switches to local mode when `?assets=local` is present.

- [x] **Step 2: Run the asset test and verify RED**

Run: `node --test tests/test_statusbar_assets.mjs`

Expected: FAIL because the four generated assets and manifest do not exist.

- [x] **Step 3: Generate four project-bound assets with built-in ImageGen**

Use four distinct calls. Wide day: 3:1 sunlit mansion archive, frosted arches, silver tea service, restrained Emilia and Rem cameos at the far right, at least 55% quiet data space, no text or watermark. Mobile day: portrait mansion window and tea table, characters in the upper third, quiet lower-middle data space. Wide night: 3:1 ice forest and Witch's Tea Party observatory, restrained Emilia and Echidna cameos at the far right, luminous butterflies and chess motifs, 55% quiet data space. Mobile night: portrait moonlit tea observatory with upper-edge cameos and quiet center. Save each selected final into `statusbar/assets/` and inspect it before use.

- [x] **Step 4: Commit and push the binary asset checkpoint**

```powershell
git add statusbar/assets/day-archive-wide.webp statusbar/assets/day-archive-mobile.webp statusbar/assets/night-tea-wide.webp statusbar/assets/night-tea-mobile.webp
git commit -m "assets: add generated status bar scenes"
git push -u origin codex/re0-statusbar
```

Record the resulting 40-character commit as the immutable asset revision.

- [x] **Step 5: Add the asset manifest and resolver**

Use the recorded commit in four raw GitHub URLs. `assetUrl` returns a local `../assets/<name>` URL only when the preview query explicitly requests local assets; otherwise it returns the manifest's pinned URL. CSS retains its gradient fallback when an image fails.

- [x] **Step 6: Run the asset test and verify GREEN**

Run: `node --test tests/test_statusbar_assets.mjs`

Expected: 1 passing asset contract test, 0 failures.

- [x] **Step 7: Commit the pinned manifest**

```powershell
git add tests/test_statusbar_assets.mjs statusbar/assets/manifest.json statusbar/src/assets.mjs statusbar/assets/README.md statusbar/styles.css
git commit -m "feat: pin status bar artwork"
```

### Task 7: Package the HUD as an AI-output regex artifact

**Files:**
- Create: `tests/test_statusbar_package.mjs`
- Create: `tools/package_statusbar_regex.mjs`
- Create: `dist/regex-Re0·全变量状态栏.json`
- Modify: `statusbar/README.md`

- [x] **Step 1: Write the failing package contract**

Assert the artifact has `disabled=false`, `findRegex='/(?![\\s\\S])/g'`, `placement=[2]`, `markdownOnly=true`, `promptOnly=false`, `runOnEdit=true`, and a namespaced script name. Assert its replacement is one complete HTML code block, includes every maintained module in dependency order, contains the pinned asset URLs, contains no module syntax, has no state-writing APIs, and leaves a sentinel `<UpdateVariable>[]</UpdateVariable>` unchanged when the regex replacement is simulated.

- [x] **Step 2: Run the package test and verify RED**

Run: `node --test tests/test_statusbar_package.mjs`

Expected: FAIL because the packaged artifact does not exist.

- [x] **Step 3: Implement the packager**

Read CSS and modules in this order: schema map, status core, portraits, runtime, assets, app. Strip `import` and `export`, serialize pinned data safely, reject `</script` and `</style` in sources, and write one JSON object. `--check` builds in memory and performs exact byte comparison without writing.

```js
const artifact = {
  disabled: false,
  findRegex: '/(?![\\s\\S])/g',
  id: 'e5c76073-a3a2-4c4b-a5db-d38fbdc5a77e',
  markdownOnly: true,
  maxDepth: null,
  minDepth: null,
  placement: [2],
  promptOnly: false,
  replaceString: `\`\`\`html\n${buildHtml()}\n\`\`\``,
  runOnEdit: true,
  scriptName: 'Re:0·全变量状态栏',
  substituteRegex: 0,
  trimStrings: [],
};
```

- [x] **Step 4: Generate and validate the artifact**

Run: `node tools/package_statusbar_regex.mjs`

Expected: `statusbar-regex package written:` followed by the exact distribution path.

Run: `node tools/package_statusbar_regex.mjs --check`

Expected: `statusbar-regex package is current:` followed by the same path.

- [x] **Step 5: Run package and existing creator regression tests**

Run: `node --test tests/test_statusbar_package.mjs tests/test_creator_package.mjs tests/test_assets.mjs`

Expected: all tests pass; creator artifact and creator asset revision remain unchanged.

- [x] **Step 6: Commit the importable artifact**

```powershell
git add tests/test_statusbar_package.mjs tools/package_statusbar_regex.mjs dist/regex-Re0·全变量状态栏.json statusbar/README.md
git commit -m "feat: package importable status bar regex"
```

### Task 8: Perform offline browser QA and close discovered defects test-first

**Files:**
- Modify only when a failing regression test requires it: `statusbar/src/*.mjs`, `statusbar/styles.css`, `tests/test_statusbar_*.mjs`
- Create: `reports/statusbar-offline-qa.md`

- [x] **Step 1: Start the documented static preview**

Run: `python -m http.server 4174 --directory statusbar`

Expected: the server remains active and `http://127.0.0.1:4174/?assets=local` returns the preview.

- [x] **Step 2: Inspect wide desktop behavior**

Verify the compact overview, all nine sections, day/night/auto control, relationship filters, character drawer, death-book disclosure, snapshot confirmation, portrait modal, keyboard focus, and absence of console errors at a wide viewport. Capture a screenshot for the QA report.

- [x] **Step 3: Inspect narrow and reduced-motion behavior**

Verify approximately 320px width, 200% zoom/reflow, horizontal navigation, single-column cards, in-component bottom drawer, long CJK strings, 44px primary targets, no horizontal document overflow, and reduced-motion styles. Capture a narrow screenshot.

- [x] **Step 4: Inspect resilience and security fixtures**

Load empty, malformed, stale, and hostile-string fixtures through the preview query. Confirm empty states, isolated errors, stale marker, inert hostile text, broken remote portrait fallback, and retry behavior.

- [x] **Step 5: Fix each discovered defect through RED-GREEN**

For every defect, add the smallest failing Node contract or fixture assertion, run it to observe the intended failure, change the production source minimally, rerun the targeted test, then rerun the status-bar suite.

- [x] **Step 6: Write the offline QA report and stop the server**

Record viewport sizes, screenshots, checked interactions, console state, limitations, and the exact commit. Stop the static-server process cleanly.

- [x] **Step 7: Commit verified polish**

```powershell
git add statusbar tests reports/statusbar-offline-qa.md
git commit -m "test: verify status bar browser experience"
```

### Task 9: Run the offline release gate and prepare real-SillyTavern handoff

**Files:**
- Create: `reports/statusbar-runtime-handoff.md`
- Modify: `statusbar/RUNTIME.md`

- [x] **Step 1: Run every automated test**

Run: `node --test tests/test_creator_core.mjs tests/test_ai_provider.mjs tests/test_assets.mjs tests/test_creator_package.mjs tests/test_statusbar_core.mjs tests/test_statusbar_runtime.mjs tests/test_statusbar_portraits.mjs tests/test_statusbar_surface.mjs tests/test_statusbar_assets.mjs tests/test_statusbar_package.mjs`

Expected: all Node tests pass with 0 failures.

Run: `python -m unittest discover -s tests -p 'test_*.py' -v`

Expected: all Python tests pass with 0 failures.

- [x] **Step 2: Re-run package parity and source checks**

Run: `node tools/package_creator_regex.mjs --check`

Expected: creator package is current.

Run: `node tools/package_statusbar_regex.mjs --check`

Expected: status-bar package is current.

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 3: Record artifact identity**

Record the regex JSON byte size and SHA-256, the pinned artwork commit, every artwork byte size and SHA-256, and the current source commit. Confirm there are no unexpected writes outside `statusbar/`, its dedicated tests/tool/artifact, the two ADRs, glossary, plan, and reports.

- [x] **Step 4: Prepare the runtime-debug handoff**

Request real-runtime evidence for fresh chat, initialization, correct message floor, update event, swipe, edit, rerender, reload, chat switch, duplicate prevention, all three theme states, uploaded and URL portraits, keyboard focus, 320px layout, 200% zoom, reduced motion, broken asset network, missing MVU, and console cleanliness. Mark every host-dependent case pending unless the exact packaged artifact is actually exercised.

- [x] **Step 5: Commit the handoff report and push the branch**

```powershell
git add statusbar/RUNTIME.md reports/statusbar-runtime-handoff.md
git commit -m "docs: prepare status bar runtime handoff"
git push
```

- [x] **Step 6: Finish the branch**

Use `superpowers:verification-before-completion`, `superpowers:requesting-code-review`, and `superpowers:finishing-a-development-branch`. Do not claim real-SillyTavern acceptance unless the runtime-debug evidence names the exact regex artifact hash.
