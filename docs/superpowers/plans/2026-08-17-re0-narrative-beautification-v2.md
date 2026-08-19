# RE0 正文美化 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing narrative renderer with a from-scratch SillyTavern prose beautification system that presents three reading themes, seven ability effects, data-driven cinematic volume headings, and individually recognizable character bubbles while preserving a safe low-noise model protocol.

**Architecture:** Keep the old `narrative/` tree read-only while building `narrative-next/`. A strict parser converts one unversioned `<content>` response into inert normalized blocks; pure registries resolve player/character/title/theme/ability identities; a DOM-only renderer owns all visual output and local reading preferences; a packager emits one import file containing paired streaming and completed Regex definitions with the entire executable core embedded. Remote URLs are restricted to immutable image/font assets and always have non-network fallbacks.

**Tech Stack:** ECMAScript modules, Node built-in test runner, semantic HTML, scoped CSS, SillyTavern 1.17+ Regex definitions, Tavern Helper message iframe runtime, browser `localStorage`, ImageGen raster backgrounds, immutable jsDelivr/raw-GitHub assets.

---

## Phase A — representative visual slice

### Task 1: Record the replacement contract without touching legacy implementation

**Files:**
- Modify: `CONTEXT.md`
- Create: `docs/adr/0009-正文美化采用全新实现.md`
- Create: `docs/adr/0010-新正文协议保留花括号对白.md`
- Create: `docs/adr/0011-新版正文只读兼容旧协议.md`
- Create: `docs/adr/0012-正文正则内嵌核心并区分流式状态.md`
- Create: `narrative-next/README.md`
- Create: `narrative-next/rules/正文输出格式.md`

- [ ] **Step 1: Apply the confirmed glossary terms**

Add compact definitions for `人物短显示名`, `姓名强调位`, `人物气泡风格`, `正文主题`, `静态模式`, `能力演出`, `结构化对白`, `玩家对白`, and `正文协议降级`. Preserve every unrelated existing glossary edit.

- [ ] **Step 2: Add the four accepted ADRs**

Record these stable decisions exactly: new implementation rather than incremental patching; unversioned content root plus `{人物}「对白」`; read-only legacy parsing; one import bundle with paired streaming/completed Regex definitions and embedded core.

- [ ] **Step 3: Write the new model-visible protocol**

Use this canonical fixture and prohibit raw HTML, links, code fences, nested direct blocks, duplicate attributes, or more than one trailing update block:

```xml
<content player="菜月昴">
  <story volume="01"></story>
  <time period="下午" layer="主线" basis="编辑演算">魔女历1000年01月01日</time>
  <now_plot>
旁白自然段。

{人物}「人物对白」

{#}「玩家对白」

<scene location="王都" time="下午" mood="不安">转场文本。</scene>

<ability user="贝亚特丽丝" name="阴魔法" kind="魔法" affinity="阴">
  <effect>发动过程与实际结果。</effect>
  <description>一至三句能力介绍。</description>
</ability>

<check type="闪避" actor="菜月昴" target="艾尔莎">1d20=14｜情境+2｜DC15｜成功｜后果</check>

<restart deathId="loop-001" checkpoint="赃物库前">世界重启叙述。</restart>
  </now_plot>
</content>
<UpdateVariable>...</UpdateVariable>
```

- [ ] **Step 4: Write the source/artifact boundary**

State in `narrative-next/README.md` that `narrative-next/` is maintained source, `dist/regex-Re0·正文美化-v2.json` is generated, legacy `narrative/` stays unchanged until cutover, and Phase A intentionally contains eight completed character skins plus seven completed title recipes for visual acceptance.

- [ ] **Step 5: Verify docs and commit**

Run: `git diff --check -- CONTEXT.md docs/adr narrative-next`

Expected: exit 0 and no whitespace errors.

Commit: `git add CONTEXT.md docs/adr narrative-next/README.md narrative-next/rules/正文输出格式.md && git commit -m "docs: define narrative beautification v2 contract"`

### Task 2: Build the new parser and legacy read adapter with TDD

**Files:**
- Create: `tests/test_narrative_next_protocol.mjs`
- Create: `narrative-next/src/entities.mjs`
- Create: `narrative-next/src/inline-format.mjs`
- Create: `narrative-next/src/protocol.mjs`
- Create: `narrative-next/fixtures/complete.xml`
- Create: `narrative-next/fixtures/streaming.xml`
- Create: `narrative-next/fixtures/legacy.xml`

- [ ] **Step 1: Write failing protocol tests**

Cover one behavior per test using these public seams:

```js
import {
  parseNarrative,
  parseStreamingNarrative,
  splitUpdateVariable,
} from '../narrative-next/src/protocol.mjs';
import { tokenizeInlineText } from '../narrative-next/src/inline-format.mjs';

test('parses the unversioned root and keeps plain narration', () => {
  const result = parseNarrative(COMPLETE_FIXTURE);
  assert.equal(result.ok, true);
  assert.equal(result.story.volume, '01');
  assert.equal(result.player, '菜月昴');
  assert.equal(result.blocks[0].type, 'narration');
});

test('treats the brace slot as the only speaker evidence', () => {
  const result = parseNarrative(COMPLETE_FIXTURE);
  assert.equal(result.blocks.find(block => block.type === 'dialogue').speaker, '人物');
  assert.equal(result.blocks.find(block => block.type === 'player-dialogue').speaker, '#');
});

test('accepts six ordered affinities and rejects unknown values', () => {
  assert.deepEqual(parseNarrative(abilityFixture('火,风')).blocks[0].affinities, ['火', '风']);
  assert.equal(parseNarrative(abilityFixture('冰')).blocks[0].status, 'invalid');
});

test('keeps one malformed block inert without discarding valid siblings', () => {
  const result = parseNarrative(MIXED_VALIDITY_FIXTURE);
  assert.deepEqual(result.blocks.map(block => block.type), ['narration', 'invalid', 'dialogue']);
});

test('reads legacy desc attributes but never emits legacy normalized shape', () => {
  const ability = parseNarrative(LEGACY_FIXTURE).blocks.find(block => block.type === 'ability');
  assert.equal(ability.description, '旧说明');
  assert.equal(ability.protocol, 'legacy-readonly');
});

test('tokenizes only strong and emphasis markers as inert text tokens', () => {
  assert.deepEqual(tokenizeInlineText('**重点**与*低语*<img>'), [
    { type: 'strong', text: '重点' },
    { type: 'text', text: '与' },
    { type: 'em', text: '低语' },
    { type: 'text', text: '<img>' },
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/test_narrative_next_protocol.mjs`

Expected: FAIL because `narrative-next/src/protocol.mjs` does not exist.

- [ ] **Step 3: Implement strict entity and attribute decoding**

Decode only named/numeric text entities, reject duplicate or case-smuggled attributes, whitelist attributes per tag, cap source and block lengths, and never use an HTML parser that executes content.

- [ ] **Step 4: Implement the complete parser**

Expose normalized blocks for `narration`, `dialogue`, `player-dialogue`, `scene`, `ability`, `check`, `restart`, and `invalid`. Keep `<UpdateVariable>` byte-for-byte outside display content. Normalize affinities to the canonical sequence `火,水,风,土,阴,阳`; omitted means unknown/not applicable.

- [ ] **Step 5: Implement streaming parsing**

`parseStreamingNarrative()` must accept an open `<content>`/`<now_plot>` tail, return completed safe blocks, and expose the unfinished tail only as inert progress text. It must never treat an unfinished ability as a completed effect.

- [ ] **Step 6: Implement minimal inline formatting**

Return text/strong/em tokens for paired `**...**` and `*...*`; malformed markers and all HTML-like text remain ordinary text.

- [ ] **Step 7: Run focused tests and commit**

Run: `node --test tests/test_narrative_next_protocol.mjs`

Expected: all protocol tests pass.

Commit: `git add tests/test_narrative_next_protocol.mjs narrative-next/src narrative-next/fixtures && git commit -m "feat: add narrative v2 protocol parser"`

### Task 3: Define settings, themes, title recipes, and slice registries with TDD

**Files:**
- Create: `tests/test_narrative_next_design.mjs`
- Create: `narrative-next/src/settings.mjs`
- Create: `narrative-next/src/theme.mjs`
- Create: `narrative-next/src/titles.mjs`
- Create: `narrative-next/src/characters.mjs`
- Create: `narrative-next/src/abilities.mjs`
- Create: `narrative-next/data/volume-titles.json`
- Create: `narrative-next/data/title-recipes.slice.json`
- Create: `narrative-next/data/characters.slice.json`
- Create: `narrative-next/data/ability-kinds.json`

- [ ] **Step 1: Write failing pure-design tests**

Assert:

```js
test('auto theme chooses day or night while tea stays manual', () => {
  assert.equal(resolveTheme({ preference: 'auto', period: '下午' }).name, 'day');
  assert.equal(resolveTheme({ preference: 'auto', period: '深夜' }).name, 'night');
  assert.equal(resolveTheme({ preference: 'tea', period: '深夜' }).name, 'tea');
});

test('reading settings expose four fonts and four exact size levels', () => {
  assert.deepEqual(READING_FONTS.map(item => item.id), ['serif', 'sans', 'wenkai', 'xiaowei']);
  assert.deepEqual(READING_SIZES.map(item => item.px), [15, 17, 19, 22]);
});

test('name emphasis uses first only for two-three graphemes and first-third otherwise', () => {
  assert.deepEqual(emphasisIndexes('蕾姆'), [0]);
  assert.deepEqual(emphasisIndexes('艾姬多娜'), [0, 2]);
  assert.deepEqual(emphasisIndexes('培提尔其乌斯'), [0, 2]);
});

test('the slice contains eight unique skins and seven title families', () => {
  assert.equal(CHARACTER_SLICE.length, 8);
  assert.equal(new Set(CHARACTER_SLICE.map(item => item.skinId)).size, 8);
  assert.equal(new Set(TITLE_SLICE.map(item => item.family)).size, 7);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/test_narrative_next_design.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement reading settings**

Use namespaced keys `re0:narrative-v2:theme`, `:font`, `:size`, and `:static`. Export immutable option arrays and tolerant readers that reject unknown stored values.

- [ ] **Step 4: Implement the three visual identities**

Encode:

```js
day:   { label: '日', name: '雪原档案', accent: '#5aa9d6' }
night: { label: '夜', name: '妒影残响', accent: '#c24768' }
tea:   { label: '茶', name: '魔女茶席', accent: '#6e8b58' }
```

Each theme must also provide high-contrast ink/surface/muted/border/focus tokens. `auto` may resolve only to day/night.

- [ ] **Step 5: Add all 39 factual titles and seven slice recipes**

Keep the supplied 39 volume/title/kind records verbatim. Complete Phase A recipes for volumes `01`, `05`, `12`, `20`, `25`, `35`, and `39`, one per family: `duet`, `single-focus`, `rhythm`, `spotlight`, `redaction`, `calamity`, `departure`. Recipes contain explicit segments, emphasis levels, accent slots, and layout positions; they never synthesize Japanese translations.

- [ ] **Step 6: Add the eight representative characters**

Use `菜月昴`, `艾姬多娜`, `蕾姆`, `莱茵哈鲁特`, `培提尔其乌斯`, `碧翠丝`, `艾尔莎`, and `普莉希拉`. Each record must include stable ID, short display name, exact safe aliases, immutable remote filename, palette, edge shape, texture, symbol path ID, and motion signature.

- [ ] **Step 7: Add seven ability semantics**

Map `一般技能`, `权能`, `加护`, `魔法`, `精灵术`, `种族能力`, and `武技` to stable CSS tokens and accessible labels. Unknown kinds return an invalid-block token rather than silently becoming a general skill.

- [ ] **Step 8: Run tests and commit**

Run: `node --test tests/test_narrative_next_design.mjs tests/test_narrative_next_protocol.mjs`

Expected: all focused tests pass.

Commit: `git add tests/test_narrative_next_design.mjs narrative-next/src narrative-next/data && git commit -m "feat: add narrative v2 design registries"`

### Task 4: Build the accessible renderer and seven effects with TDD

**Files:**
- Create: `tests/test_narrative_next_surface.mjs`
- Create: `narrative-next/src/dom.mjs`
- Create: `narrative-next/src/renderer.mjs`
- Create: `narrative-next/src/boot.mjs`
- Create: `narrative-next/src/preview.mjs`
- Create: `narrative-next/styles/tokens.css`
- Create: `narrative-next/styles/layout.css`
- Create: `narrative-next/styles/titles.css`
- Create: `narrative-next/styles/bubbles.css`
- Create: `narrative-next/styles/abilities.css`
- Create: `narrative-next/styles/motion.css`
- Create: `narrative-next/index.html`
- Create: `narrative-next/fixtures/showcase.xml`

- [ ] **Step 1: Write failing surface tests**

Static/source tests must assert no `innerHTML`, inline event handlers, `eval`, remote scripts, or unnamespaced storage keys. DOM tests must assert one header, one logo, the selected title recipe, left NPC/right `{#}` dialogue, split emphasized name spans, one visible symbol, default-open ability descriptions, theme/font/size/static controls with ARIA state, and one local overlay root.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/test_narrative_next_surface.mjs`

Expected: FAIL because renderer and surface files do not exist.

- [ ] **Step 3: Implement safe DOM primitives**

Use `createElement`, `textContent`, validated `setAttribute`, and token-to-element conversion only. Centralize focus restoration, event delegation, cleanup, and frame resize. No model value may reach `innerHTML`, `outerHTML`, `insertAdjacentHTML`, CSS text, URL, or an event attribute.

- [ ] **Step 4: Implement non-sticky message header and settings drawer**

Place Logo top-left and theme/settings controls top-right. On containers below 420px, keep the Logo and collapse quick controls into one 44×44 settings button. Font and size affect narration/dialogue/description only; title recipes retain their own typography.

- [ ] **Step 5: Implement cinematic titles**

Render real text segments from recipe data with an accessible full heading. Use large negative space, asymmetric baselines, mixed size/weight, one or two accents, and restrained CSS texture. Map the representative volumes explicitly: `01 → single-focus`, `05 → spotlight`, `12 → rhythm`, `20 → duet`, `25 → redaction`, `35 → calamity`, and `39 → departure`. Do not put the seven reference screenshots into the app.

- [ ] **Step 6: Implement dialogue bubbles**

Render shared semantic markup with per-character CSS variables and data tokens. Show short names, apply name emphasis indexes, display an inline SVG symbol, use a slow palette-constrained text sheen, merge only adjacent identical resolved speakers, and derive unknown-character fallback colors from a contrast-bounded name hash.

- [ ] **Step 7: Implement seven ability effects**

Use distinct static geometry plus optional motion: steel scan line, broken authority ring, blessing halo, affinity magic circle, spirit motes, bloodline pulse, and martial slash. Render `<effect>` first and a default-open `<details>` description after it. Static mode must preserve all text and category identity.

- [ ] **Step 8: Implement reduced-motion and local static mode**

`prefers-reduced-motion: reduce` wins over stored preference. Static mode disables title, bubble, background, and ability animations but preserves gradients, borders, symbols, and contrast.

- [ ] **Step 9: Implement the development-only acceptance showcase**

Keep `preview.mjs` outside the packaging dependency list. It may switch among the seven representative volumes and render the eight character skins, seven ability kinds, long dialogue, unknown-character fallback, and malformed-block fallback from inert fixture text. It must use the same public parser/renderer seams as the packaged runtime and contain no second production template.

- [ ] **Step 10: Run tests and commit**

Run: `node --test tests/test_narrative_next_surface.mjs tests/test_narrative_next_design.mjs tests/test_narrative_next_protocol.mjs`

Expected: all focused tests pass with no console-writing test fixtures.

Commit: `git add tests/test_narrative_next_surface.mjs narrative-next/src narrative-next/styles narrative-next/index.html && git commit -m "feat: render narrative v2 visual slice"`

### Task 5: Generate the three new backgrounds and define immutable asset/font delivery

**Files:**
- Create: `tests/test_narrative_next_assets.mjs`
- Create: `narrative-next/src/assets.mjs`
- Create: `narrative-next/data/assets.json`
- Create: `narrative-next/assets/background-day.webp`
- Create: `narrative-next/assets/background-night.webp`
- Create: `narrative-next/assets/background-tea.webp`
- Create: `narrative-next/assets/licenses/OFL-SourceHanSerif.txt`
- Create: `narrative-next/assets/licenses/OFL-SourceHanSans.txt`
- Create: `narrative-next/assets/licenses/OFL-LXGWWenKai.txt`
- Create: `narrative-next/assets/licenses/OFL-ZCOOLXiaoWei.txt`
- Create: `narrative-next/assets/README.md`

- [ ] **Step 1: Write failing asset tests**

Assert three real textless backgrounds with true MIME/dimensions, exactly 44 immutable avatar mappings, one exact Logo mapping, explicit `primaryUrl`/`fallbackUrl`/CSS fallback, full 40-character commit pins, four font definitions with license paths and lazy-load flags, and rejection of floating `main` URLs.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/test_narrative_next_assets.mjs`

Expected: FAIL because the new asset manifest does not exist.

- [ ] **Step 3: Generate three backgrounds with ImageGen**

Generate 16:9 textless/no-character backgrounds for `雪原档案`, `妒影残响`, and `魔女茶席`. Keep the center reading zone quiet, avoid official emblems and screenshots, inspect each image visually, and convert selected outputs to WebP without changing composition.

- [ ] **Step 4: Define immutable avatar and Logo URLs**

Use current source commit `d011efa6a5351dd984e00ef8462db3689cbb358b`: jsDelivr full-SHA URL first, raw-GitHub full-SHA URL second, then generated initial/CSS. Explicitly map `约书亚` to `约书亚webp.webp`; never derive a filename from display text.

- [ ] **Step 5: Define lazy font assets and licensing**

Use official Simplified-Chinese subsets where available, attach original OFL text, and load only the selected font. Prototype may use immutable official URLs; Phase B copies the exact checked binaries into the project release commit before public delivery.

- [ ] **Step 6: Implement guarded asset loading**

Validate `https:` plus immutable revision, time out remote probes, fall back in order, and expose a readable diagnostic token without logging user content.

- [ ] **Step 7: Run tests and commit**

Run: `node --test tests/test_narrative_next_assets.mjs tests/test_narrative_next_surface.mjs`

Expected: all focused tests pass.

Commit: `git add tests/test_narrative_next_assets.mjs narrative-next/src/assets.mjs narrative-next/data/assets.json narrative-next/assets && git commit -m "feat: add narrative v2 visual assets"`

### Task 6: Package paired Regex definitions and produce the acceptance preview

**Files:**
- Create: `tests/test_narrative_next_package.mjs`
- Create: `tools/package_narrative_next_regex.mjs`
- Create: `dist/regex-Re0·正文美化-v2.json`
- Create: `reports/narrative-v2-slice-qa.md`

- [ ] **Step 1: Write failing package tests**

Assert one SillyTavern-1.17-compatible import JSON array with exactly two definitions named `Re:0·正文美化·生成中` and `Re:0·正文美化·完成`; both affect AI output/display only, preserve raw chat text, have deterministic source IDs and ordering, avoid recursive mounts, keep `$1` only in inert carriers, embed no remote executable code, and leave a trailing `<UpdateVariable>` byte-for-byte unchanged. Record that SillyTavern assigns fresh runtime UUIDs during import, so deterministic IDs are an artifact/source invariant rather than a post-import identity promise.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/test_narrative_next_package.mjs`

Expected: FAIL because the packager and artifact do not exist.

- [ ] **Step 3: Implement deterministic packaging**

Read JSON data, modules, and CSS in declared dependency order; transform ESM exports/imports into namespaced IIFEs; reject unsafe closing carriers, duplicate IDs, floating URLs, missing licenses, or unrecognized source files. Provide `--check` and `--audit-assets --strict` as read-only modes; unknown flags must exit nonzero.

- [ ] **Step 4: Build the slice artifact**

Run: `node tools/package_narrative_next_regex.mjs`

Expected: writes only `dist/regex-Re0·正文美化-v2.json` and reports both script IDs.

- [ ] **Step 5: Run offline visual QA**

Serve `narrative-next/`, inspect all three themes, four fonts, four sizes, static mode, seven title recipes, eight skins, seven ability effects, long dialogue, `{#}` right alignment, missing assets, malformed blocks, approximately 320px width, 200% zoom, and reduced motion. Capture screenshots and console output in `reports/narrative-v2-slice-qa.md`.

- [ ] **Step 6: Run the Phase A gate**

Run:

```powershell
node --test tests/test_narrative_next_*.mjs
node tools/package_narrative_next_regex.mjs --check
node tools/package_narrative_next_regex.mjs --audit-assets --strict
git diff --check
```

Expected: zero failed tests, current artifact, complete slice assets, no whitespace errors.

- [ ] **Step 7: Commit the candidate**

Commit: `git add tests/test_narrative_next_package.mjs tools/package_narrative_next_regex.mjs dist/regex-Re0·正文美化-v2.json reports/narrative-v2-slice-qa.md && git commit -m "feat: package narrative v2 visual slice"`

### Visual acceptance checkpoint — mandatory stop

Show the user the wide and narrow screenshots plus the importable candidate. Do not expand recipes/skins, replace `narrative/`, update Issue #6, push, or open a PR until the user approves the visual language.

---

## Phase B — full expansion after visual approval

### Task 7: Expand the accepted system to all 44 characters and all 39 volumes

**Files:**
- Create: `tests/test_narrative_next_full_roster.mjs`
- Replace: `narrative-next/data/characters.slice.json` with `narrative-next/data/characters.json`
- Replace: `narrative-next/data/title-recipes.slice.json` with `narrative-next/data/title-recipes.json`
- Modify: `narrative-next/styles/bubbles.css`
- Modify: `narrative-next/styles/titles.css`

- [ ] Write failing coverage tests for exactly 44 stable IDs, 44 unique visible skin signatures, all safe aliases, 39 explicit recipes, longest-name/longest-title wrapping, and the `约书亚webp.webp` mapping.
- [ ] Run the full-roster test and verify RED against the eight/seven slice.
- [ ] Author the remaining 36 character skins and 32 title recipes using the accepted design grammar; no fallback may masquerade as a completed dedicated skin.
- [ ] Run full-roster, protocol, design, surface, and asset tests until green.
- [ ] Commit: `git commit -m "feat: complete narrative character and title catalog"`.

### Task 8: Cut over maintained source, finalize assets, and run real-runtime acceptance

**Files:**
- Replace: `narrative/` from the accepted `narrative-next/` source
- Replace: `tools/package_narrative_regex.mjs`
- Replace: `dist/regex-Re0·正文美化.json`
- Remove: `narrative-next/` after verified parity
- Create: `reports/narrative-v2-runtime-handoff.md`
- Update: `narrative/README.md`

- [ ] Write a failing cutover test that rejects legacy theme names/files and requires the final artifact to match accepted V2 source.
- [ ] Copy exact reviewed font/background binaries and license files into final asset paths; refresh hashes and pin the new full commit after it exists.
- [ ] Replace legacy source atomically, rebuild, and prove the old generated artifact no longer matches.
- [ ] Run all Node tests, all Python tests, package checks, asset audit, source/artifact parity, and `git diff --check`.
- [ ] Import into real SillyTavern 1.17+ with the detected Tavern Helper; verify generation-in-progress, completed render, edit, swipe, rerender, reload, chat switch, all settings, static/reduced motion, offline fallback, and console cleanliness.
- [ ] Record exact versions, artifact SHA-256, screenshots, console/network evidence, and any genuinely pending host gates.
- [ ] Commit: `git commit -m "feat: replace legacy narrative renderer with v2"`.

### Task 9: Publish the reviewed branch and align the issue tracker

**Files/External:**
- Update: GitHub Issue #6 by comment only
- Push: `codex/narrative-beautification-v2`
- Create: pull request against `main`

- [ ] Run the complete verification gate fresh and record outputs.
- [ ] Dispatch a final spec review and code-quality review; resolve every critical/important finding and re-run verification.
- [ ] Comment on Issue #6 that ADR 0009–0012 and the accepted V2 contract supersede the old visual implementation; do not erase the original issue body.
- [ ] Push the feature branch, verify immutable asset URLs against the pushed commit, rebuild if the final commit pin changes, and push the deterministic rebuild.
- [ ] Open a PR describing scope, dependency ledger, test evidence, asset licenses, runtime evidence, and any pending host acceptance.

---

## Plan self-review

- **Spec coverage:** full rewrite; unversioned root; brace dialogue and `{#}`; natural narration; local malformed-block degradation; read-only old protocol; three themes; four fonts/sizes; global static mode; subtle colored text motion; 44 unique skins, name emphasis and symbols; 39 explicit cinematic title recipes; seven category effects with visible descriptions; new generated backgrounds; fixed commit remote assets; paired streaming/completed Regex definitions; visual checkpoint; full offline/runtime/PR gates.
- **Scope exclusions:** no reference screenshots, invented Japanese subtitles, evidence/argument/image-picker UI, remote executable loader, full character-card/PNG packaging, or unrelated profile/state regeneration.
- **Type consistency:** `parseNarrative` feeds normalized blocks to `renderer`; settings IDs are `auto/day/night/tea`, `serif/sans/wenkai/xiaowei`, `15/17/19/22`, and `static`; ability affinity is an ordered subset of `火/水/风/土/阴/阳`; character identity uses stable ID plus explicit remote filename.
- **Checkpoint:** Phase A deliberately stops after an importable eight-character/seven-title candidate; Phase B requires explicit visual approval already agreed with the user.
