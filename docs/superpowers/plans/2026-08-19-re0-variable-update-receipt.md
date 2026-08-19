# Re:Zero 变量更新回执 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a two-regex Re:Zero variable-update receipt whose pending and complete matchers remain byte-for-byte identical to the two supplied references.

**Architecture:** Maintain one shared namespaced CSS source plus one semantic HTML fragment per lifecycle state. A deterministic Node packager combines those sources with a pinned GitHub-hosted original seal asset into two standalone SillyTavern regex JSON artifacts; a development-only preview reuses the same fragments and stylesheet, while tests lock the matchers, configuration, capture placement, safety boundary, responsive contract, and artifact parity.

**Tech Stack:** Semantic HTML, modern CSS with defensive fallbacks, Node.js 24 built-in test runner and filesystem APIs, built-in ImageGen, bundled Pillow for WebP conversion and visual inspection, GitHub/jsDelivr pinned asset delivery.

---

### Task 1: Record the accepted domain boundary and adapter

**Files:**
- Modify: `CONTEXT.md`
- Create: `variable-update/README.md`

- [ ] **Step 1: Add the canonical glossary term**

Add this exact term under `## 变量系统词汇`:

```markdown
**变量更新回执**：将每轮 `<UpdateVariable>` 的生成中状态或完整更新依据与 JSON Patch 呈现为消息内只读记录的双阶段界面；它只改变显示，不验证、执行或改写补丁，也不替代状态栏。
_避免_：状态栏、变量编辑器、补丁校验器、把“已生成”写成“已执行”
```

- [ ] **Step 2: Document source ownership and dependency classes**

Create `variable-update/README.md` with:

```markdown
# Re:Zero 变量更新回执

两条配套的 SillyTavern AI 输出显示正则：未闭合 `<UpdateVariable>` 使用“命运演算中”，完整块使用“世界线记录已闭合”。两条 `findRegex` 来自用户提供的参考文件并由测试锁定；HTML、CSS、文案和素材均为本项目新实现。

## 维护与打包

- `pending.html`：生成中语义结构，不插入模型文本。
- `complete.html`：完整回执结构，`$1` 仅承载更新依据，`$2` 仅承载原始 JSON Patch。
- `styles.css`：两态共享样式；生产依赖只有一张固定提交的 HTTPS WebP。
- `assets/manifest.json`：本地素材、内容哈希和固定发布 URL。
- `preview.html` / `preview.mjs`：开发期离线预览，不进入打包产物。
- `tools/package_variable_update_regex.mjs`：唯一产物生成入口。

运行 `node tools/package_variable_update_regex.mjs` 写入两个 `dist/` JSON；运行 `node tools/package_variable_update_regex.mjs --check` 只读核对产物是否为当前源码生成。

## 运行依赖

- 宿主提供：SillyTavern 正则扩展的 AI 输出显示替换。
- 远程加载：固定 Git 提交的原创命运徽记 WebP；网络失败时保留纯 CSS 徽记。
- 开发期：Node.js 测试/打包、本地静态服务器、浏览器视觉检查。
- 不需要：远程脚本、远程字体、MVU JavaScript API 或变量写入权限。

离线检查不能替代真实 SillyTavern 导入、流式切换、主题覆盖和 WebView 兼容验收。
```

- [ ] **Step 3: Record the discovered adapter in the README**

Record `package-json` as `node tools/package_variable_update_regex.mjs`, its `--check` dry-run, exact two `dist/` outputs, create-or-replace-only-those-two collision policy, and exit-code-zero success. Record `validate-source` as `node --test tests/test_variable_update_*.mjs`. Cite the packager source and tests as provenance.

- [ ] **Step 4: Check documentation whitespace**

Run: `git diff --check -- CONTEXT.md variable-update/README.md`

Expected: exit 0 with no output.

### Task 2: Lock the asset contract before generating the asset

**Files:**
- Create: `tests/test_variable_update_assets.mjs`
- Create: `variable-update/assets/fate-ledger-seal.webp`
- Create: `variable-update/assets/manifest.json`

- [ ] **Step 1: Write the failing asset test**

Create a Node test that asserts, before reading either file, that both planned paths exist. Once present it must assert:

```js
assert.equal(manifest.releaseRevision.length, 40);
assert.match(manifest.asset.releaseUrl, new RegExp(`@${manifest.releaseRevision}/`));
assert.equal(manifest.asset.localPath, 'assets/fate-ledger-seal.webp');
assert.equal(manifest.asset.mediaType, 'image/webp');
assert.equal(manifest.asset.width, 1024);
assert.equal(manifest.asset.height, 1024);
assert.equal(manifest.asset.sha256, createHash('sha256').update(assetBytes).digest('hex'));
assert.equal(assetBytes.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(assetBytes.subarray(8, 12).toString('ascii'), 'WEBP');
```

Also require an asset description containing `破碎钟盘`, `闭合世界线`, `暗红蜡封`, `无文字`, and `无人物`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/test_variable_update_assets.mjs`

Expected: FAIL with `fate-ledger-seal.webp must exist`.

- [ ] **Step 3: Generate and inspect the original seal**

Use built-in ImageGen with this production prompt:

```text
Use case: stylized-concept
Asset type: transparent ornamental UI seal for a dark fantasy variable-update receipt
Primary request: an original circular fate-ledger emblem combining a broken antique clock dial, one luminous worldline thread that loops back and closes, and a restrained dark-crimson wax seal fracture
Subject: centered single emblem with a strong readable silhouette and delicate engraved ledger geometry
Style/medium: hand-finished dark fantasy game UI ornament, aged silver metal, bone-white etched lines, translucent ice-blue mana glow, restrained oxblood wax accents
Composition/framing: square, centered, generous transparent padding, radial balance, readable at 96px
Lighting/mood: cold moonlit rim light, solemn archival mood, subtle depth without a background scene
Constraints: genuinely transparent background; no people; no characters; no official Re:Zero logo; no words, letters, numbers, signature, watermark, or mockup; original design only
Avoid: purple gradient, generic magic circle, anime character art, photorealistic table scene, busy outer particles, rectangular frame
```

Inspect the PNG, then use bundled Pillow to preserve alpha, resize only if needed, and save lossless WebP at exactly 1024×1024. Create a local manifest with an empty release revision before the asset commit.

- [ ] **Step 4: Commit and push the asset identity**

Commit only the generated WebP as the asset-identity commit; leave the still-red test and unpublished manifest unstaged. Push the branch, capture the 40-character commit SHA, then update `manifest.json` so `releaseRevision` and the jsDelivr URL both use that immutable asset commit. This avoids a self-referential commit hash while keeping the final contract commit green.

- [ ] **Step 5: Run the asset test and verify GREEN**

Run: `node --test tests/test_variable_update_assets.mjs`

Expected: 1 test, 1 pass, 0 fail.

### Task 3: Lock the package contract before implementing the packager

**Files:**
- Create: `tests/test_variable_update_package.mjs`
- Create: `tools/package_variable_update_regex.mjs`
- Create: `variable-update/pending.html`
- Create: `variable-update/complete.html`
- Create: `variable-update/styles.css`
- Create: `dist/regex-Re0·变量更新中.json`
- Create: `dist/regex-Re0·完整变量更新.json`

- [ ] **Step 1: Write the failing package-contract tests**

Assert that `tools/package_variable_update_regex.mjs` exists before dynamically importing it, then require exports `PENDING_FIND_REGEX`, `COMPLETE_FIND_REGEX`, `buildArtifacts`, `simulateReplacement`, and `serializeArtifacts`. Pin these exact values:

```js
const PENDING = String.raw`/<UpdateVariable>(?![\s\S]*<\/UpdateVariable>)[\s\S]*$/g`;
const COMPLETE = String.raw`/<UpdateVariable>\s*<(?:[Aa]nalysis|[Aa]nalyze)>\s*((?:(?!<|\x60{3}|~{3})[\s\S])*?)\s*<\/(?:[Aa]nalysis|[Aa]nalyze)>\s*<JSONPatch>\s*(\[(?:(?!<|\x60{3}|~{3})[\s\S])*?\])\s*<\/JSONPatch>\s*<\/UpdateVariable>/g`;
assert.equal(sha256(PENDING), '1b598efa5914e3ad62eba4b08c78cc9a664ecd27250eb17de46a549b3af31729');
assert.equal(sha256(COMPLETE), '54b5c28cd55eab43892a6173ce5cfe26b425ea3a5c3fa03d77e0f1a570c678d7');
```

Require pending configuration `{ placement:[2], markdownOnly:true, promptOnly:false, runOnEdit:false, substituteRegex:0 }`, complete placement `[1,2]` with the same remaining flags, unique IDs, and namespaced Re:Zero script names. Require exactly zero replacement tokens in pending and exactly one `$1` plus one `$2` in complete.

Simulate replacement of an incomplete block and a complete fixture. Assert that pending removes all partial model text, complete renders the captured analysis and patch once each, non-matching prose remains unchanged, and no artifact mutates the matcher.

- [ ] **Step 2: Run the package test and verify RED**

Run: `node --test tests/test_variable_update_package.mjs`

Expected: FAIL with `package_variable_update_regex.mjs must exist`.

- [ ] **Step 3: Implement the minimal semantic fragments and deterministic packager**

Use a single root namespace, `data-re0-vu-*`. `pending.html` contains one closed outer `<details>` with `aria-busy="true"`, the `命运演算中` title, explanatory body, and protocol labels. `complete.html` contains one closed outer `<details>`, `世界线记录已闭合`, one `<pre>` whose sole text is `$1`, and one nested closed `<details>` whose `<pre>` sole text is `$2`.

The packager must:

```js
const OUTPUTS = Object.freeze({
  pending: resolve(ROOT, 'dist', 'regex-Re0·变量更新中.json'),
  complete: resolve(ROOT, 'dist', 'regex-Re0·完整变量更新.json'),
});

function buildReplacement(fragment, css, releaseUrl) {
  if (!releaseUrl.startsWith('https://')) throw new Error('asset release URL must be HTTPS');
  if (/<script\b|on\w+\s*=|javascript:/iu.test(`${fragment}\n${css}`)) throw new Error('production source must remain script-free');
  return `${fragment}\n<style>\n${css.replaceAll('__RE0_FATE_LEDGER_SEAL__', releaseUrl)}\n</style>`;
}
```

Serialize each artifact with `JSON.stringify(value, null, 2) + '\n'`. Normal mode may write only the two declared outputs. `--check` must compare both files byte-for-byte and must not write.

- [ ] **Step 4: Run the package test and verify GREEN**

Run: `node --test tests/test_variable_update_package.mjs`

Expected: all package tests pass.

### Task 4: Drive the distinctive responsive surface with tests

**Files:**
- Create: `tests/test_variable_update_surface.mjs`
- Modify: `variable-update/pending.html`
- Modify: `variable-update/complete.html`
- Modify: `variable-update/styles.css`
- Create: `variable-update/preview.html`
- Create: `variable-update/preview.mjs`

- [ ] **Step 1: Write the failing surface tests**

Require both fragments to have logical summary heading order, distinct pending/complete state attributes, native details controls, visible Chinese titles and subtitles, and the eight protocol labels `世界、主角、轮回、关系、事件、线索、资产、规则`. Require the complete source to keep `$1` and `$2` inside focusable readonly `<pre>` elements.

Require CSS to contain namespaced tokens, asset token, focus-visible rules, `prefers-reduced-motion`, a maximum-width container, a narrow `@container` or media query at or below 360px, CJK wrapping, overflow handling, local font stacks, CSS-only asset fallback, and no `@import`, external font URL, unnamespaced keyframe, or global element selector.

- [ ] **Step 2: Run the surface test and verify RED**

Run: `node --test tests/test_variable_update_surface.mjs`

Expected: FAIL on the first missing visual/accessibility contract.

- [ ] **Step 3: Implement the visual system**

Use the accepted palette and lifecycle:

```css
[data-re0-vu-root] {
  --re0-vu-void: #08090d;
  --re0-vu-ink: #eee7d9;
  --re0-vu-muted: #a69d90;
  --re0-vu-silver: #b9c1c9;
  --re0-vu-ice: #8fd6e8;
  --re0-vu-blood: #9b3041;
  --re0-vu-seal-image: url("__RE0_FATE_LEDGER_SEAL__");
}
```

Build one dramatic but compact summary: CSS clock orbit beneath the generated seal, asymmetric ledger ruling, monospaced microcopy, state chip, and native chevron. Pending uses one slow ice-blue worldline scan and pulse; complete uses one restrained oxblood seal-settle entrance. Expanded content uses separators rather than nested generic cards. Preserve motion meaning when animation is disabled, and keep the 320px state readable without horizontal page overflow.

Create a development preview that fetches the maintained fragments, substitutes inert sample Analysis/JSON text, links the maintained CSS, and supports `?state=pending|complete|both`. The preview script is development-only and must never enter either JSON artifact.

- [ ] **Step 4: Run all focused tests and package**

Run:

```powershell
node --test tests/test_variable_update_assets.mjs tests/test_variable_update_package.mjs tests/test_variable_update_surface.mjs
node tools/package_variable_update_regex.mjs
node tools/package_variable_update_regex.mjs --check
```

Expected: all focused tests pass; package writes exactly two JSON files; check reports both current.

### Task 5: Perform visual and release-candidate QA

**Files:**
- Create: `reports/variable-update-wide.png`
- Create: `reports/variable-update-narrow.png`
- Create: `reports/variable-update-offline-qa.md`
- Modify: `variable-update/styles.css`
- Regenerate: both `dist/regex-Re0·*.json` files

- [ ] **Step 1: Run the local preview**

Run `python -m http.server 4176 --directory variable-update` and open `http://127.0.0.1:4176/preview.html?state=both`.

- [ ] **Step 2: Inspect wide and narrow states**

Capture an approximately 1440px-wide screenshot and a 320–390px narrow screenshot. Open the outer and nested details with pointer and keyboard. Inspect focus, long CJK wrapping, long JSON paths, remote-asset success, CSS fallback by blocking or overriding the asset, reduced motion, and no horizontal page overflow.

- [ ] **Step 3: Fix only evidenced defects and rerun checks**

For each defect, first add or tighten a failing surface test where automation can express it, then modify maintained source, regenerate both artifacts, and rerun focused tests and `--check`.

- [ ] **Step 4: Write the offline QA receipt**

Record exact artifact hashes and sizes, screenshots, viewport widths, interactions exercised, dependency classification, asset URL and fallback, browser evidence, API provenance (`SillyTavern 1.18.0` / core commit recorded in `statusbar/RUNTIME.md`), and explicitly mark real SillyTavern import/streaming/theme acceptance as pending unless performed against that runtime.

### Task 6: Verify, review, commit, and publish

**Files:**
- All files listed above

- [ ] **Step 1: Run the complete applicable verification**

Run:

```powershell
node --test tests/test_variable_update_*.mjs
node tools/package_variable_update_regex.mjs --check
git diff --check
git status --short
```

Then rerun the adjacent regression baseline:

```powershell
node --test tests/test_statusbar_package.mjs tests/test_narrative_package.mjs
```

Expected: zero failures, byte-for-byte current artifacts, no whitespace errors, and only declared files changed.

- [ ] **Step 2: Review the diff against the accepted contract**

Check each matcher/hash, runtime flag, capture location, no-script boundary, asset pin, offline fallback, responsive evidence, and reference-code exclusion. Treat real-host execution as pending unless separately evidenced.

- [ ] **Step 3: Commit only the feature scope**

Stage explicit paths only. Commit maintained sources, docs, tests, reports, and generated artifacts without staging any unrelated path.

- [ ] **Step 4: Push and verify GitHub delivery**

Push `codex/re0-variable-update-receipt`, verify both artifact URLs and the pinned asset return HTTP 200, then report the branch/commit links, exact downloadable JSON paths, checks run, and the remaining real-SillyTavern acceptance gate.
