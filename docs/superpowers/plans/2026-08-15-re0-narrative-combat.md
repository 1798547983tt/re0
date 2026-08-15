# RE0 战斗规则与正文美化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tested RE0 combat/prose protocol and an importable three-theme SillyTavern renderer without creating a full character card or publishing assets.

**Architecture:** A deep narrative seam accepts one model response and returns a normalized protocol model plus a safe themed DOM rendering plan. A pure combat module owns deterministic d20 consumption and state transitions; a separate state adapter owns the existing eight-domain JSON contract; registry and asset modules own alias safety and visual tokens; a project packager composes the maintained sources into one AI-output regex artifact.

**Tech Stack:** ECMAScript modules, Node built-in test runner, JSON/text protocol sources, semantic HTML/CSS, existing SillyTavern regex JSON shape, ZOD/MVU schema text, built-in ImageGen for project-bound raster assets.

---

### Task 1: Implement deterministic RE0 combat rules

**Files:**
- Create: `tests/test_narrative_combat.mjs`
- Create: `narrative/src/combat-core.mjs`
- Create: `narrative/data/combat-defaults.json`
- Create: `narrative/rules/战斗规则.md`

- [ ] **Step 1: Write the failing combat contract tests**

Import the planned pure interfaces and assert these external behaviors:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeRoll,
  deriveTierValue,
  resolveCheck,
  resolveDefense,
  resolveDamage,
  resolveDying,
  createBattleState,
  finishBattle,
} from '../narrative/src/combat-core.mjs';

test('consumes a supplied d20 pool from left to right and reports exhaustion', () => {
  const first = consumeRoll([7, 19]);
  assert.deepEqual(first, { roll: 7, remaining: [19] });
  assert.throws(() => consumeRoll([]), /骰池耗尽/);
});

test('derives seven-level lower and upper tier values without inventing unknown values', () => {
  assert.equal(deriveTierValue({ level: 1, position: '下位' }), 1);
  assert.equal(deriveTierValue({ level: 7, position: '上位' }), 14);
  assert.equal(deriveTierValue({ level: '未知', position: '未知' }), null);
});

test('resolves margin grades and natural one/twenty deterministically', () => {
  assert.equal(resolveCheck({ roll: 14, dc: 12, modifiers: [{ label: '情境', value: 2 }] }).grade, '强成功');
  assert.equal(resolveCheck({ roll: 1, dc: 2, modifiers: [] }).grade, '失败');
  assert.equal(resolveCheck({ roll: 20, dc: 30, modifiers: [] }).grade, '失败');
  assert.equal(resolveCheck({ roll: 20, dc: 10, modifiers: [] }).grade, '暴击');
});

test('defense reaction changes attack DC or damage without a second roll', () => {
  assert.deepEqual(resolveDefense('闪避'), { dcModifier: 2, damageMultiplier: 0, counterWindow: false });
  assert.deepEqual(resolveDefense('格挡'), { dcModifier: 0, damageMultiplier: 0.5, counterWindow: false });
  assert.deepEqual(resolveDefense('反击'), { dcModifier: -2, damageMultiplier: 1, counterWindow: true });
});

test('break-tier gate prevents damage without an explicit qualification', () => {
  const result = resolveDamage({ grade: '暴击', baseDamage: 10, defenderTierGap: 4, breakQualified: false });
  assert.equal(result.damage, 0);
  assert.equal(result.reason, '无法破阶');
});

test('dying state requires three successes or three failures and handles natural rolls', () => {
  assert.deepEqual(resolveDying({ successes: 2, failures: 0, roll: 14 }), { successes: 3, failures: 0, state: '昏迷' });
  assert.deepEqual(resolveDying({ successes: 0, failures: 0, roll: 20 }), { successes: 0, failures: 0, state: '存活', hp: 1 });
  assert.deepEqual(resolveDying({ successes: 0, failures: 0, roll: 1 }), { successes: 0, failures: 2, state: '濒死' });
});

test('battle state keeps short-lived scene data and clears it at the end', () => {
  const active = createBattleState({ id: 'b-1', participants: ['昴', '艾尔莎'] });
  assert.equal(active.进行中, true);
  assert.deepEqual(finishBattle(active), { 进行中: false, 轮数: 0, 参战者: [], 行动顺序: [], 当前行动者: '', 行动额度: {}, 距离: {}, 掩体: {}, 持续效果: {}, 濒死计数: {}, 最近一次检定: null });
});
```

- [ ] **Step 2: Run the combat tests and verify RED**

Run: `node --test tests/test_narrative_combat.mjs`

Expected: FAIL with module-not-found for `narrative/src/combat-core.mjs`.

- [ ] **Step 3: Implement the smallest pure combat module**

Export only the functions used by the tests. Keep randomness outside the module: `consumeRoll` accepts a supplied pool, while a future prompt adapter may generate the twelve d20 values. Use the seven-level lower/upper mapping, margin grades, natural-roll rules, defense reactions, damage multipliers, break-tier gating, dying counters, and explicit battle cleanup. Keep every returned object JSON-serializable and avoid mutating caller-owned arrays or state.

- [ ] **Step 4: Add model-visible combat rules and defaults**

Write the same invariants in `narrative/rules/战斗规则.md`: twelve-roll pool, action timing, DC formula, seven-tier comparison, break qualification, damage bands, life/injury/load thresholds, dying checks, Subaru death-return boundary, and cleanup order. Store numeric defaults in `combat-defaults.json`; the rule text must not contain executable script.

- [ ] **Step 5: Run the focused combat tests and then the existing Node suite**

Run: `node --test tests/test_narrative_combat.mjs tests/test_creator_core.mjs tests/test_statusbar_core.mjs`

Expected: all selected tests pass with zero failures.

- [ ] **Step 6: Commit Task 1**

Run: `git add tests/test_narrative_combat.mjs narrative/src/combat-core.mjs narrative/data/combat-defaults.json narrative/rules/战斗规则.md && git commit -m "feat: add deterministic Re Zero combat rules"`

### Task 2: Extend the existing state contract without adding a ninth root

**Files:**
- Create: `tests/test_narrative_state_contract.mjs`
- Modify: `变量/脚本/酒馆助手脚本-ZOD.json`
- Modify: `变量/世界书/[initvar] 初始.txt`
- Modify: `变量/世界书/[mvu_update]变量输出格式.txt`
- Modify: `变量/世界书/[mvu_update]变量更新规则.txt`
- Create: `narrative/rules/状态字段映射.md`

- [ ] **Step 1: Write failing schema/initialization contract tests**

The tests must parse the JSON script and text protocols, then assert that the maintained sources contain these paths and no ninth root: shared combat fields for protagonist/partner/contracted-partner/person records; optional ability metadata; equipment combat metadata; and `事件.当前战斗` with active, id, round, phase, participants, initiative, current actor, action quotas, distance, cover, ongoing effects, dying counters, and last check. Assert that the dice pool and full combat log are absent from the persistent schema.

- [ ] **Step 2: Run the state tests and verify RED**

Run: `node --test tests/test_narrative_state_contract.mjs`

Expected: FAIL because the current ZOD and MVU text contain none of the combat paths.

- [ ] **Step 3: Add schema fields with safe defaults and passthrough descriptions**

Extend the shared actor shape without changing the eight root names. Use bounded numbers for meters, existing survival enums, the existing seven ability categories, and optional structured combat metadata for abilities/equipment. Define the event battle object as short-lived state and leave the d20 pool/log out of it. Preserve existing fields, remote loader identity, and export metadata.

- [ ] **Step 4: Add initialization and update rules**

Initialize empty battle state and shared actor defaults. Document add/replace/remove/move operations, JSON Pointer escaping, battle-start snapshot, battle-end cleanup, and write-back of persistent life/resources/injuries. State that the model must never write a dice pool or a complete battle log.

- [ ] **Step 5: Run focused state tests and all existing JavaScript/Python tests**

Run: `node --test tests/test_narrative_state_contract.mjs tests/test_narrative_combat.mjs tests/*.mjs`; then `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all tests pass; any old package parity drift is reported separately and not regenerated.

- [ ] **Step 6: Commit Task 2**

Run: `git add tests/test_narrative_state_contract.mjs 变量/脚本/酒馆助手脚本-ZOD.json 变量/世界书/[initvar] 初始.txt 变量/世界书/[mvu_update]变量输出格式.txt 变量/世界书/[mvu_update]变量更新规则.txt narrative/rules/状态字段映射.md && git commit -m "feat: extend Re Zero combat state contract"`

### Task 3: Build the deep narrative protocol, alias registry, and themed renderer

**Files:**
- Create: `tests/test_narrative_protocol.mjs`
- Create: `tests/test_narrative_theme.mjs`
- Create: `tests/test_narrative_surface.mjs`
- Create: `narrative/src/protocol.mjs`
- Create: `narrative/src/character-registry.mjs`
- Create: `narrative/src/theme-core.mjs`
- Create: `narrative/src/render.mjs`
- Create: `narrative/index.html`
- Create: `narrative/styles.css`
- Create: `narrative/data/volume-headings.json`
- Create: `narrative/data/character-registry.json`
- Create: `narrative/rules/正文输出格式.md`

- [ ] **Step 1: Write failing protocol and registry tests**

Assert that the parser accepts the root order content/story/time/now_plot, formats the visible heading as `第01卷 | 开始的余温`, formats the visible date as `魔女历1000年01月01日`, keeps period/layer/basis metadata, parses curly-brace dialogue plus scene/ability/check/restart blocks, separates an UpdateVariable suffix, and returns raw fallback for malformed content. Assert that only exact structured speaker values trigger aliases, conflict short names are rejected, 44 registered names resolve to dedicated portraits, and every other name returns the first grapheme fallback.

- [ ] **Step 2: Run protocol/theme/surface tests and verify RED**

Run: `node --test tests/test_narrative_protocol.mjs tests/test_narrative_theme.mjs tests/test_narrative_surface.mjs`

Expected: FAIL with module-not-found for the new narrative modules and missing surface files.

- [ ] **Step 3: Implement protocol normalization**

Export `parseNarrativeResponse`, `formatVolumeHeading`, `formatWitchCalendarDate`, `resolveSpeaker`, and `splitUpdateVariable`. Normalize HTML entities and middle-dot variants for matching, preserve exact displayed title text, decode the volume-25 bullet, and never infer speakers from ordinary prose. Keep malformed input visible and inert.

- [ ] **Step 4: Add volume and character data**

Store all 39 first chapter/prologue headings with volume numbers and heading kinds. Store the 44 reference-character stable IDs, display names, safe aliases, identity tokens, portrait keys, and bubble tokens. Do not register stage labels, group terms, or ambiguous short names as global aliases.

- [ ] **Step 5: Implement theme and bubble-token resolution**

Export three theme token sets (day, night, beige), automatic day/night selection from world period, manual override, and a pure resolver that combines identity tokens (role, faction, profession/ability) with theme tokens into accent, border, texture, icon, and contrast values. Unknown characters receive a generic token set.

- [ ] **Step 6: Implement safe DOM rendering**

Create one namespaced mount and one overlay root. Build dynamic text with DOM methods and textContent; never insert model-derived HTML. Render the persistent logo slot, volume/date header, scenes, dialogue bubbles, ability cards, check cards, restart cards, and raw fallback. Use data attributes for actions, preserve the three-theme switch, respect reduced motion, keep 320px layouts readable, and make all controls keyboard accessible.

- [ ] **Step 7: Add the maintained output-format rules**

Write model-visible rules for tag order, exact heading/date formats, dialogue names, scene/ability/check/restart constraints, action-before-check-after-result ordering, and UpdateVariable separation. Do not include executable script or hidden developer commentary.

- [ ] **Step 8: Run focused tests and commit Task 3**

Run: `node --test tests/test_narrative_protocol.mjs tests/test_narrative_theme.mjs tests/test_narrative_surface.mjs tests/test_narrative_combat.mjs tests/test_narrative_state_contract.mjs`

Expected: all selected tests pass with no warnings.

Commit: `git add tests/test_narrative_protocol.mjs tests/test_narrative_theme.mjs tests/test_narrative_surface.mjs narrative && git commit -m "feat: add Re Zero narrative protocol and themes"`

### Task 4: Generate project-bound artwork and package the renderer

**Files:**
- Create: `tests/test_narrative_assets.mjs`
- Create: `tests/test_narrative_package.mjs`
- Create: `narrative/assets/manifest.json`
- Create: `narrative/assets/README.md`
- Create: `narrative/assets/logo-transparent.png`
- Create: `narrative/assets/title-plate-day.png`
- Create: `narrative/assets/title-plate-night.png`
- Create: `narrative/assets/title-plate-beige.png`
- Create: `narrative/assets/background-day.webp`
- Create: `narrative/assets/background-night.webp`
- Create: `narrative/assets/background-beige.webp`
- Create: `narrative/assets/avatars/*.webp`
- Create: `tools/package_narrative_regex.mjs`
- Create: `dist/regex-Re0·正文美化.json`

- [ ] **Step 1: Write failing asset and package contracts**

Assert that the manifest lists the transparent logo, three title plates, three backgrounds, and exactly 44 dedicated avatars with true MIME, dimensions, local fallback, and a release URL slot. Assert that the package has a unique script ID, markdown-only/run-on-edit settings, a content matcher, one complete HTML code block, all maintained modules in dependency order, no import/export syntax, no state-writing API, and a sentinel UpdateVariable block preserved by simulated replacement.

- [ ] **Step 2: Run asset/package tests and verify RED**

Run: `node --test tests/test_narrative_assets.mjs tests/test_narrative_package.mjs`

Expected: FAIL because the new assets, manifest and packager do not exist.

- [ ] **Step 3: Generate and inspect the raster assets**

Use the built-in ImageGen path. Generate one transparent-logo cutout, three textless title plates, three low-detail RE0 environment backgrounds with quiet text zones, and 44 static square character portraits derived from the supplied reference images. Save every selected final into the worktree, inspect alpha/size/composition, and record prompt, source role, MIME, dimensions and hash in the manifest. Do not use remote upload or overwrite existing user assets.

- [ ] **Step 4: Implement asset resolver and CSS fallbacks**

Resolve fixed-version remote URLs only when a release revision is configured; otherwise use local preview paths. Enforce HTTPS for remote assets, show a pure CSS/first-grapheme fallback on load failure, keep backgrounds at low opacity with local text masks, and never expose secrets or user chat content in the asset manifest.

- [ ] **Step 5: Implement the project packager**

Read the maintained narrative modules and stylesheet in dependency order, strip module syntax, reject unsafe closing tags, embed volume/character data safely, and emit one regex JSON object. The check mode must compare in-memory serialization byte-for-byte without writing. Use the existing AI-output regex conventions, `runOnEdit: true`, and preserve the original message plus UpdateVariable suffix.

- [ ] **Step 6: Run focused asset/package tests and all offline tests**

Run: `node --test tests/test_narrative_assets.mjs tests/test_narrative_package.mjs tests/test_narrative_*.mjs tests/test_creator_core.mjs tests/test_creator_package.mjs tests/test_statusbar_*.mjs`; then `python -m unittest discover -s tests -p 'test_*.py' -v` and `git diff --check`.

Expected: all selected tests pass; old creator/statusbar package parity checks are reported without overwriting their artifacts.

- [ ] **Step 7: Commit Task 4**

Run: `git add tests/test_narrative_assets.mjs tests/test_narrative_package.mjs narrative tools/package_narrative_regex.mjs dist/regex-Re0·正文美化.json && git commit -m "feat: package Re Zero narrative renderer"`

### Task 5: Offline QA and runtime handoff

**Files:**
- Create: `reports/narrative-offline-qa.md`
- Create: `reports/narrative-runtime-handoff.md`
- Modify: `narrative/README.md`

- [ ] **Step 1: Run the local narrative preview**

Run: `python -m http.server 4175 --directory narrative`

Check wide, approximately 320px, 200% zoom, reduced-motion, all themes, longest headings, hostile text, malformed protocol, missing assets, 44 dedicated aliases, generic fallback, and repeated message rerender. Record screenshots and console results.

- [ ] **Step 2: Run the release checks**

Run the narrative Node suite, Python unittest suite, package check, MIME/hash audit, and `git diff --check`. Record exact artifact size/hash and any pre-existing package drift separately.

- [ ] **Step 3: Prepare the real-runtime handoff**

Document pending checks for exact SillyTavern/MVU/ZOD/prompt-template versions: fresh message, edit, swipe, reload, chat switch, theme persistence, check rendering, MVU update, dice input, missing dependency, remote asset failure, keyboard focus, 320px layout, and console cleanliness. Do not claim host acceptance from static preview.

- [ ] **Step 4: Commit QA documentation**

Run: `git add reports/narrative-offline-qa.md reports/narrative-runtime-handoff.md narrative/README.md && git commit -m "docs: record narrative renderer QA handoff"`

---

## Plan self-review

- Spec coverage: combat mechanics, state contract, exact title/date output, 39 headings, 44 aliases/avatars, generic fallback, code-generated bubbles, three themes, backgrounds, transparent logo, safe regex packaging, offline QA and real-runtime handoff are mapped to Tasks 1–5.
- No full card/PNG/worldbook packaging, remote publishing, unrelated profile regeneration or age-stage migration is included.
- The public seams are stable: combat-core accepts explicit pools, protocol parses one response, theme/registry resolve pure data, renderer receives normalized blocks, and the packager consumes maintained sources.
