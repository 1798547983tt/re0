import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PATHS = Object.freeze({
  pending: resolve(ROOT, 'variable-update/pending.html'),
  complete: resolve(ROOT, 'variable-update/complete.html'),
  css: resolve(ROOT, 'variable-update/styles.css'),
  previewHtml: resolve(ROOT, 'variable-update/preview.html'),
  previewJs: resolve(ROOT, 'variable-update/preview.mjs'),
  manifest: resolve(ROOT, 'variable-update/assets/manifest.json'),
  pendingArtifact: resolve(ROOT, 'dist/regex-Re0·变量更新中.json'),
  completeArtifact: resolve(ROOT, 'dist/regex-Re0·完整变量更新.json'),
});

const source = Object.freeze({
  pending: readFileSync(PATHS.pending, 'utf8'),
  complete: readFileSync(PATHS.complete, 'utf8'),
  css: readFileSync(PATHS.css, 'utf8'),
});

const FORBIDDEN_COPY = /NØRMA|CASSIOPEIA|龙族|NEW-Dragon-Raja|完整性已验证|校验通过|已执行|写入成功/u;
const DOMAINS = ['世界', '主角', '轮回', '关系', '事件', '线索', '资产', '规则'];

function occurrences(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function stripTags(value) {
  return value.replace(/<[^>]*>/gu, '').trim();
}

function openingTags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'giu'))].map((match) => match[1]);
}

function hasAttribute(attributes, name, value) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, 'iu'));
  if (!match) return false;
  if (value === undefined) return true;
  return (match[1] ?? match[2] ?? match[3] ?? '') === value;
}

function classTokens(html) {
  return [...html.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)]
    .flatMap((match) => (match[1] ?? match[2]).trim().split(/\s+/u))
    .filter(Boolean);
}

function rootBlock(css) {
  const match = css.match(/^\[data-re0-vu-root\]\s*\{([\s\S]*?)^\}/mu);
  assert.ok(match, 'CSS must begin with a [data-re0-vu-root] token/root block');
  return match[1];
}

function ruleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'u'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/gu).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenHex(block, name) {
  const match = block.match(new RegExp(`--re0-vu-${name}:\\s*(#[0-9a-f]{6})`, 'iu'));
  assert.ok(match, `missing exact hexadecimal ${name} token`);
  return match[1].toLowerCase();
}

function assertSingleRoot(html, state, label) {
  const roots = openingTags(html, 'section').filter((attrs) => hasAttribute(attrs, 'data-re0-vu-root'));
  assert.equal(roots.length, 1, `${state} must contain one data-re0-vu-root section`);
  assert.ok(hasAttribute(roots[0], 'data-re0-vu-state', state), `${state} root must expose its exact state`);
  assert.ok(hasAttribute(roots[0], 'aria-label', label), `${state} root must expose a distinct direct accessible label`);
}

test('fragments remain multi-message safe without fixed IDs or ID references', () => {
  for (const [state, html] of Object.entries({ pending: source.pending, complete: source.complete })) {
    assert.doesNotMatch(html, /\sid\s*=/iu, `${state} must not duplicate fixed IDs across messages`);
    assert.doesNotMatch(html, /\saria-labelledby\s*=/iu, `${state} must use direct accessible names`);
  }
  assertSingleRoot(source.pending, 'pending', '变量更新回执：命运演算中');
  assertSingleRoot(source.complete, 'complete', '变量更新回执：世界线记录已闭合');
});

test('summary anatomy adds a fallback-safe fate sigil, heading group, state code, and chevron', () => {
  for (const [state, html] of Object.entries({ pending: source.pending, complete: source.complete })) {
    assert.match(
      html,
      /class="re0-vu-sigil"[^>]*aria-hidden="true"/u,
      `${state} summary must include an aria-hidden fate sigil`,
    );
    assert.match(html, /class="re0-vu-sigil-ring"/u, `${state} sigil must keep a CSS fallback ring`);
    assert.match(html, /class="re0-vu-sigil-hand"/u, `${state} sigil must keep a CSS fallback broken clock hand`);
    assert.match(html, /class="re0-vu-sigil-art"/u, `${state} generated art must use a separate layer`);
    assert.match(html, /class="re0-vu-heading"/u, `${state} summary must group its headings`);
    assert.match(html, /class="re0-vu-side"/u, `${state} summary must reserve a side region`);
    assert.match(html, /class="re0-vu-state-chip"/u, `${state} summary must include a state chip`);
    assert.match(html, /class="re0-vu-state-code"/u, `${state} summary must include a state code`);
    assert.match(html, /class="re0-vu-chevron"[^>]*aria-hidden="true"/u, `${state} summary must include a decorative chevron`);
    const title = html.match(/<([a-z][\w-]*)\b([^>]*class="[^"]*re0-vu-title[^"]*"[^>]*)>/iu);
    assert.ok(title, `${state} summary must include its title phrasing element`);
    assert.notEqual(title[1].toLowerCase(), 'h2', `${state} summary title must remain phrasing content`);
    assert.ok(hasAttribute(title[2], 'role', 'heading'), `${state} summary title must expose heading semantics`);
    assert.ok(hasAttribute(title[2], 'aria-level', '2'), `${state} summary title must be heading level 2`);
  }
});

test('fragments use one closed native details tree with exact pending and complete state contracts', () => {
  const pendingDetails = openingTags(source.pending, 'details');
  const completeDetails = openingTags(source.complete, 'details');
  assert.equal(pendingDetails.length, 1, 'pending has only the outer receipt details');
  assert.equal(completeDetails.length, 2, 'complete has the outer receipt and nested raw patch details');
  for (const attrs of [...pendingDetails, ...completeDetails]) {
    assert.equal(hasAttribute(attrs, 'open'), false, 'all details must be closed by default');
  }
  assert.ok(hasAttribute(pendingDetails[0], 'aria-busy', 'true'), 'pending outer details must expose aria-busy=true');
  assert.equal(hasAttribute(completeDetails[0], 'aria-busy'), false, 'complete outer details must not remain busy');
  assert.equal(openingTags(source.pending, 'summary').length, 1, 'pending details has its native summary');
  assert.equal(openingTags(source.complete, 'summary').length, 2, 'each complete details has its native summary');
});

test('visible copy is exact, original, and never overstates validation or execution', () => {
  assert.match(source.pending, />\s*命运演算中\s*</u);
  assert.match(source.pending, />\s*正在核对本轮可持久化事实\s*</u);
  assert.match(source.complete, />\s*世界线记录已闭合\s*</u);
  assert.match(source.complete, />\s*本轮更新依据与补丁已完整生成\s*</u);
  for (const html of [source.pending, source.complete]) {
    assert.match(html, />\s*RE:0 · FATE LEDGER\s*</u);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
  }
  assert.match(source.complete, />\s*更新依据\s*</u);
  assert.match(source.complete, />\s*原始 JSON Patch\s*</u);
});

test('both states expose the eight protocol domains once as a semantic ledger rail', () => {
  for (const [state, html] of Object.entries({ pending: source.pending, complete: source.complete })) {
    assert.doesNotMatch(html, /<nav\b/iu, `${state} domain index must not create a navigation landmark without links`);
    assert.match(html, /<(?:section|div)\b[^>]*class="[^"]*re0-vu-domain-index[^"]*"[^>]*aria-label="状态协议八域"/iu);
    const rail = html.match(/<(?:ol|ul)\b[^>]*class="[^"]*re0-vu-domain-rail[^"]*"[^>]*>([\s\S]*?)<\/(?:ol|ul)>/iu);
    assert.ok(rail, `${state} must use an ol or ul domain rail`);
    const items = [...rail[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)].map((match) => stripTags(match[1]));
    assert.deepEqual(items, DOMAINS, `${state} domain rail must contain eight ordered semantic items`);
    for (const domain of DOMAINS) {
      assert.equal(occurrences(html, new RegExp(`>\\s*${domain}\\s*<`, 'gu')), 1, `${state} must show ${domain} once`);
    }
  }
});

test('indexed bodies disclose rationale before a separately focusable raw patch', () => {
  assert.match(source.pending, /data-re0-vu-section="00"/u);
  assert.match(source.pending, />\s*00\s*</u);
  assert.match(source.pending, />\s*FATE TRACE IN PROGRESS\s*</u);
  assert.match(source.complete, /data-re0-vu-section="01"/u);
  assert.match(source.complete, />\s*01\s*</u);
  assert.match(source.complete, />\s*UPDATE RATIONALE\s*</u);
  assert.match(source.complete, /data-re0-vu-section="02"/u);
  assert.match(source.complete, />\s*02\s*</u);
  assert.match(source.complete, />\s*RAW JSON PATCH\s*</u);
  assert.match(source.pending, /<h3\b[^>]*class="re0-vu-section-title"[^>]*>\s*世界线尚未落笔\s*<\/h3>/u);
  assert.match(source.complete, /<h3\b[^>]*class="re0-vu-section-title"[^>]*>\s*更新依据\s*<\/h3>/u);
  assert.match(
    source.complete,
    /class="re0-vu-section-title"[^>]*role="heading"[^>]*aria-level="3"[^>]*>\s*原始 JSON Patch\s*</u,
  );

  const completePres = [...source.complete.matchAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/giu)];
  assert.equal(completePres.length, 2, 'complete must expose exactly two readonly pre regions');
  assert.deepEqual(completePres.map((match) => match[2]), ['$1', '$2']);
  for (const [index, match] of completePres.entries()) {
    assert.ok(hasAttribute(match[1], 'role', 'textbox'), `pre ${index + 1} must use role=textbox`);
    assert.ok(hasAttribute(match[1], 'aria-readonly', 'true'), `pre ${index + 1} must be aria-readonly`);
    assert.ok(hasAttribute(match[1], 'tabindex', '0'), `pre ${index + 1} must be focusable`);
    assert.equal(hasAttribute(match[1], 'readonly'), false, `pre ${index + 1} must not use the invalid readonly HTML attribute`);
  }
  assert.ok(hasAttribute(completePres[0][1], 'aria-label', '本轮变量更新依据'));
  assert.ok(hasAttribute(completePres[1][1], 'aria-label', '原始 JSON Patch'));
  assert.doesNotMatch(source.pending, /\$(?:1|2)/u, 'pending must never contain replacement tokens');
});

test('root tokens and containment establish the bounded dark ledger surface', () => {
  const root = rootBlock(source.css);
  for (const [name, value] of [
    ['void', '#08090d'],
    ['ink', '#eee7d9'],
    ['ice', '#8fd6e8'],
    ['blood', '#9b3041'],
  ]) assert.match(root, new RegExp(`--re0-vu-${name}:\\s*${value}`, 'iu'));
  for (const name of ['muted', 'silver', 'panel', 'line', 'shadow']) {
    assert.match(root, new RegExp(`--re0-vu-${name}:`, 'u'), `missing ${name} token`);
  }
  assert.equal(occurrences(source.css, /__RE0_FATE_LEDGER_SEAL__/gu), 1, 'CSS has one packager asset token');
  assert.match(root, /--re0-vu-seal-image:\s*url\(["']__RE0_FATE_LEDGER_SEAL__["']\)/u);
  assert.match(root, /box-sizing:\s*border-box/u);
  assert.match(root, /width:\s*100%/u);
  assert.match(root, /min-width:\s*0/u);
  const maxWidth = root.match(/max-width:\s*([\d.]+)rem/u);
  assert.ok(maxWidth && Number(maxWidth[1]) <= 48, 'root max-width must not exceed 48rem');
  assert.match(root, /container-type:\s*inline-size/u);
  assert.match(root, /isolation:\s*isolate/u);
  assert.match(root, /color-scheme:\s*dark/u);
  assert.match(source.css, /\[data-re0-vu-root\],\s*\[data-re0-vu-root\] \*,\s*\[data-re0-vu-root\] \*::before,\s*\[data-re0-vu-root\] \*::after/u);
  assert.doesNotMatch(source.css, /contain\s*:\s*paint|backdrop-filter|@import|@font-face|https?:\/\/|url\(\s*['"]?\/\//iu);
});

test('local typography pairs a Chinese serif face with a compact mono ledger face', () => {
  assert.match(source.css, /font-family:[^;]*(?:Songti|STSong|Noto Serif|Source Han|Iowan|Georgia)/iu);
  assert.match(source.css, /--re0-vu-mono:[^;]*(?:Cascadia|SFMono|Consolas|Liberation Mono)/iu);
  assert.doesNotMatch(source.css, /\bArial\b|\bRoboto\b|\bInter\b|Space Grotesk|system-ui/iu);
});

test('complete state microcopy uses a WCAG-readable bright seal color', () => {
  const root = rootBlock(source.css);
  const panel = tokenHex(root, 'panel');
  const bright = tokenHex(root, 'blood-bright');
  assert.equal(panel, '#101116');
  assert.equal(bright, '#d47a87');
  assert.ok(contrastRatio(bright, panel) >= 4.5, 'bright seal text must reach 4.5:1 against the ledger panel');

  const completeChip = ruleBlock(
    source.css,
    '[data-re0-vu-root][data-re0-vu-state="complete"] .re0-vu-state-chip',
  );
  assert.match(completeChip, /color:\s*var\(--re0-vu-blood-bright\)/u);
  assert.doesNotMatch(completeChip, /var\(--re0-vu-blood\)/u, 'dark blood is decorative, not complete-state microcopy');
});

test('native disclosure and readonly sheets remain touchable, focusable, and overflow-safe', () => {
  const summary = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-summary');
  const nestedSummary = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-patch-summary');
  for (const [label, block] of [['summary', summary], ['nested summary', nestedSummary]]) {
    assert.match(block, /min-height:\s*(?:44px|2\.75rem)/u, `${label} must meet the 44px touch target`);
    assert.match(block, /cursor:\s*pointer/u, `${label} must expose pointer affordance`);
  }
  assert.match(source.css, /\.re0-vu-summary::?-webkit-details-marker[^\{]*\{[^}]*display:\s*none/isu);
  assert.match(source.css, /\.re0-vu-summary::marker[^\{]*\{[^}]*content:\s*["']{2}/isu);
  assert.match(source.css, /\.re0-vu-patch-summary::?-webkit-details-marker[^\{]*\{[^}]*display:\s*none/isu);
  assert.match(source.css, /\.re0-vu-patch-summary::marker[^\{]*\{[^}]*content:\s*["']{2}/isu);
  assert.match(source.css, /\.re0-vu-summary:focus-visible/u);
  assert.match(source.css, /\.re0-vu-source:focus-visible/u);
  const pre = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-source');
  assert.match(pre, /white-space:\s*pre-wrap/u);
  assert.match(pre, /overflow:\s*auto/u);
  assert.match(pre, /overflow-wrap:\s*anywhere/u);
  assert.match(pre, /max-height:/u);
  assert.match(pre, /resize:\s*vertical/u);
  assert.match(source.css, /line-break:\s*strict/u, 'CJK copy must use strict logical wrapping');
  assert.match(source.css, /\.re0-vu-receipt\[open\]\s*>\s*\.re0-vu-body/u, 'open body needs an explicit separator');
  assert.doesNotMatch(source.css, /\bwidth:\s*(?:[5-9]\d{2,}|\d{4,})px/u, 'no fixed width may force horizontal overflow');
});

test('container and viewport fallbacks reflow the summary, side code, rail, and raw sheets', () => {
  const container = source.css.match(/@container[^\{]*\(max-width:\s*([\d.]+)px\)\s*\{([\s\S]*?)\n\}/u);
  assert.ok(container && Number(container[1]) <= 360, 'a <=360px container query is required');
  const media = source.css.match(/@media[^\{]*\(max-width:\s*([\d.]+)px\)\s*\{([\s\S]*?)\n\}/u);
  assert.ok(media && Number(media[1]) <= 480, 'a <=480px viewport fallback is required');
  for (const [label, block] of [['container query', container[2]], ['media fallback', media[2]]]) {
    assert.match(block, /\.re0-vu-summary/u, `${label} must reflow the summary`);
    assert.match(block, /\.re0-vu-side/u, `${label} must move the side state away from the heading`);
    assert.match(block, /\.re0-vu-domain-rail/u, `${label} must compact the domain rail`);
    assert.match(block, /\.re0-vu-source/u, `${label} must tune raw sheet type or spacing`);
  }
});

test('state motion is semantic, decorative, namespaced, and fully removable', () => {
  const keyframes = [...source.css.matchAll(/@keyframes\s+([\w-]+)/gu)].map((match) => match[1]);
  for (const name of keyframes) assert.match(name, /^re0-vu-/u, `keyframe ${name} must be namespaced`);
  for (const semantic of ['orbit', 'worldline', 'pulse', 'trace', 'seal-settle', 'reveal']) {
    assert.ok(keyframes.some((name) => name.includes(semantic)), `missing ${semantic} motion`);
  }
  assert.match(source.css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation(?:-name)?:\s*none\s*!important[\s\S]*transition:\s*none\s*!important/u);
});

test('sigil fallback geometry remains visible below the optional generated asset layer', () => {
  const sigil = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-sigil');
  const ring = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-sigil-ring');
  const hand = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-sigil-hand');
  const art = ruleBlock(source.css, '[data-re0-vu-root] .re0-vu-sigil-art');
  assert.match(sigil, /position:\s*relative/u);
  assert.match(ring, /border:/u);
  assert.match(hand, /background:/u);
  assert.doesNotMatch(`${ring}\n${hand}`, /seal-image|background-image:\s*var/u, 'fallback geometry cannot depend on the asset');
  assert.match(art, /background-image:\s*var\(--re0-vu-seal-image\)/u);
  assert.match(art, /position:\s*absolute/u);
  assert.doesNotMatch(source.css, /(?:linear|radial)-gradient\([^;}]*(?:rgba?\([^)]*,\s*(?:0\.[89]|1)\)|#[0-9a-f]{8})[^;}]*(?:100%|inset:\s*0)/iu, 'no high-intensity full-cover image mask');
});

test('production identifiers are namespaced, compact, and script-free', () => {
  for (const html of [source.pending, source.complete]) {
    for (const token of classTokens(html)) assert.match(token, /^re0-vu-/u, `class ${token} must be namespaced`);
    for (const attr of [...html.matchAll(/\b(data-[\w-]+)\s*(?:=|>)/gu)].map((match) => match[1])) {
      assert.match(attr, /^data-re0-vu(?:-|$)/u, `data attribute ${attr} must be namespaced`);
    }
    assert.doesNotMatch(html, /<script\b|\son[a-z][\w:-]*\s*=/iu);
  }
  const selectorLines = source.css.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('{') && !line.startsWith('@') && !/^(?:from|to|\d+%)\s*\{$/u.test(line));
  for (const line of selectorLines) {
    for (const selector of line.slice(0, -1).split(',')) {
      assert.match(selector.trim(), /^\[data-re0-vu-root\]/u, `selector must remain root-scoped: ${selector.trim()}`);
    }
  }
  assert.ok(statSync(PATHS.css).size < 30 * 1024, 'production CSS must remain below 30KB');
});

test('development preview supports both states, forced disclosure, long inert samples, and readable failure', () => {
  assert.ok(existsSync(PATHS.previewHtml), 'preview.html must exist');
  assert.ok(existsSync(PATHS.previewJs), 'preview.mjs must exist');
  const html = readFileSync(PATHS.previewHtml, 'utf8');
  const js = readFileSync(PATHS.previewJs, 'utf8');
  assert.match(html, /<link[^>]+href="\.\/styles\.css"/u);
  assert.match(html, /--re0-vu-seal-image:\s*url\(["']\.\/assets\/fate-ledger-seal\.webp["']\)/u);
  assert.match(html, /data-re0-vu-preview-mount/u);
  assert.match(html, /<script\s+type="module"\s+src="\.\/preview\.mjs"/u);
  assert.match(js, /pending:\s*["']\.\/pending\.html["']/u);
  assert.match(js, /complete:\s*["']\.\/complete\.html["']/u);
  assert.match(js, /URLSearchParams/u);
  assert.match(js, /state/u);
  assert.match(js, /pending/u);
  assert.match(js, /complete/u);
  assert.match(js, /both/u);
  assert.match(js, /open/u);
  assert.match(js, /all/u);
  assert.match(js, /states\.map\(/u, 'preview must fetch only the requested state set');
  assert.match(js, /fetch\(FRAGMENT_PATHS\[fragmentState\]/u);
  assert.match(js, /querySelectorAll\(["']details["']\)/u);
  assert.match(js, /\.innerHTML\s*=\s*fragmentSource/u, 'preview may parse only its trusted local fragment source');
  assert.doesNotMatch(js, /mount\.innerHTML|\.split\(["']\$[12]/u, 'sample values must not be spliced into HTML strings');
  assert.match(js, /querySelector\(["']\.re0-vu-analysis-source["']\)/u);
  assert.match(js, /querySelector\(["']\.re0-vu-patch-source["']\)/u);
  assert.match(js, /analysisSource\.textContent\s*=\s*SAMPLE_ANALYSIS/u);
  assert.match(js, /patchSource\.textContent\s*=\s*SAMPLE_PATCH/u);
  assert.match(js, /textContent/u, 'preview errors must render as inert readable text');
  assert.match(js, /[\u4e00-\u9fff][\s\S]{180,}/u, 'preview must include a long CJK stress sample');
  assert.match(js, /JSON\.stringify|"op"|\/世界\//u, 'preview must include a JSON patch stress sample');
  assert.doesNotMatch(js, /<script|onerror\s*=|onclick\s*=/iu);
});

test('packaged artifacts pin the release asset and exclude preview-only code', () => {
  const releaseUrl = JSON.parse(readFileSync(PATHS.manifest, 'utf8')).asset.releaseUrl;
  for (const [state, path] of [['pending', PATHS.pendingArtifact], ['complete', PATHS.completeArtifact]]) {
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(artifact.replaceString.includes(releaseUrl), `${state} artifact must contain the pinned asset URL`);
    assert.doesNotMatch(artifact.replaceString, /__RE0_FATE_LEDGER_SEAL__/u);
    assert.doesNotMatch(artifact.replaceString, /preview\.mjs|data-re0-vu-preview-mount|<script\b/iu);
  }
});
