import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MODULE_ORDER,
  OUTPUT,
  buildArtifact,
  buildSerializedArtifact,
  simulateReplacement,
} from '../tools/package_narrative_regex.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function applyTavernRegex(raw, artifact, { isEdit = false } = {}) {
  if (isEdit && !artifact.runOnEdit) return raw;
  const match = artifact.findRegex.match(/^\/(.*)\/([a-z]*)$/is);
  assert.ok(match, 'findRegex must use /pattern/flags form');
  const regex = new RegExp(match[1], match[2]);
  return String(raw).replace(regex, (...args) => artifact.replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_token, number, name) => {
    const value = number ? args[Number(number)] : args.at(-1)?.[name];
    return value == null ? '' : String(value);
  }));
}

test('narrative regex artifact follows AI-output conventions and content-only matching', () => {
  const artifact = JSON.parse(readFileSync(resolve(ROOT, 'dist/regex-Re0·正文美化.json'), 'utf8'));
  assert.deepEqual(
    {
      disabled: artifact.disabled,
      findRegex: artifact.findRegex,
      markdownOnly: artifact.markdownOnly,
      placement: artifact.placement,
      promptOnly: artifact.promptOnly,
      runOnEdit: artifact.runOnEdit,
      substituteRegex: artifact.substituteRegex,
    },
    {
      disabled: false,
      findRegex: '/(?![\\s\\S]*data-re0-narrative-mount)(<content>(?:(?!<\\/?textarea\\b)[\\s\\S])*?<\\/content>)/is',
      markdownOnly: true,
      placement: [2],
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
    },
  );
  assert.equal(artifact.scriptName, 'Re:0·正文美化');
  assert.match(artifact.id, /^[a-f0-9-]{36}$/);
  assert.notEqual(artifact.id, 'a10f2484-0ec0-4bdf-b02c-7f797f2bd39d');
  assert.notEqual(artifact.id, 'e5c76073-a3a2-4c4b-a5db-d38fbdc5a77e');
  assert.ok(artifact.replaceString.startsWith('```html\n<!doctype html>'));
  assert.ok(artifact.replaceString.endsWith('\n```'));
  assert.equal((artifact.replaceString.match(/```html/g) || []).length, 1);
  assert.match(artifact.replaceString, /<textarea id="re0-narrative-source"[^>]*data-re0-source="content"[^>]*>\$1<\/textarea>/);
  assert.equal((artifact.replaceString.match(/\$1/g) || []).length, 1, 'the replacement token must only occur in the carrier');
  for (const token of [/\$`/g, /\$'/g, /\$&/g, /\$</g, /\$\$/g]) {
    assert.equal((artifact.replaceString.match(token) || []).length, 0, `replacement token ${token} must not occur in bundled code`);
  }
});

test('packaged HTML embeds maintained narrative sources in dependency order without module syntax', () => {
  const artifact = buildArtifact();
  const html = artifact.replaceString;
  const markers = [
    'const EMBEDDED_VOLUME_HEADINGS',
    'const EMBEDDED_CHARACTER_REGISTRY',
    'const EMBEDDED_ASSET_MANIFEST',
    'function decodeTextEntities',
    'function resolveTheme',
    'function formatVolumeHeading',
    'function resolveNarrativeAsset',
    'function renderNarrative',
  ];
  let previous = -1;
  for (const marker of markers) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `${marker} is missing or out of order`);
    previous = index;
  }
  for (const modulePath of MODULE_ORDER) assert.match(html, new RegExp(modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal((html.match(/<!doctype html>/g) || []).length, 1);
  assert.equal((html.match(/<div[^>]*data-re0-narrative-mount\b/g) || []).length, 1);
  assert.doesNotMatch(html, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(html, /\bwith\s*\{\s*type:\s*['"]json['"]\s*\}/);
  assert.doesNotMatch(html, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData|stat_data\s*=/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /data-asset-fallback/);
});

test('packaged message carries a static reader shell before script hydration', () => {
  const html = buildArtifact().replaceString;
  assert.match(html, /<main id="re0-narrative-app"[^>]*>[\s\S]*?<article class="re0-narrative-card">[\s\S]*?<header class="re0-title-plate">[\s\S]*?<h1>正文协议读取中<\/h1>/);
  assert.match(html, /<section class="re0-story-flow"[^>]*>\s*<p class="re0-narration">正文正在载入/);
  assert.match(html, /<textarea id="re0-narrative-source"[^>]*data-re0-source="content"[^>]*>\$1<\/textarea>/);
  assert.ok(html.indexOf('</noscript>') < html.indexOf('<textarea id="re0-narrative-source"'), 'source carrier must stay at the end of the static reader shell');
});

test('replacement preserves a trailing UpdateVariable suffix byte-for-byte', () => {
  const artifact = buildArtifact();
  const content = '<content><story volume="38"></story><time>魔女历1234年05月06日</time><now_plot>{菜月昴}「必须显示这段正文。」</now_plot></content>';
  const original = `${content}<UpdateVariable>{"sentinel":"保持"}</UpdateVariable>`;
  const replaced = simulateReplacement(original, artifact);
  const carrier = replaced.match(/<textarea id="re0-narrative-source"[^>]*data-re0-source="content"[^>]*>([\s\S]*?)<\/textarea>/);
  assert.ok(carrier, 'the matched protocol must be carried into the message iframe');
  assert.equal(carrier[1], content);
  assert.match(replaced, /function readNarrativeSource/);
  assert.match(replaced, /const source = readNarrativeSource\(mount\)/);
  assert.ok(replaced.endsWith('<UpdateVariable>{"sentinel":"保持"}</UpdateVariable>'));
  assert.equal((replaced.match(/<UpdateVariable>/g) || []).length, 1);
});

test('generated narrative HTML is not recursively replaced during edit or rerender', () => {
  const artifact = buildArtifact();
  const content = '<content><story volume="38"></story><time>魔女历1234年05月06日</time><now_plot>{菜月昴}「正文只出现一次。」</now_plot></content>';
  const first = applyTavernRegex(content, artifact);
  const edited = applyTavernRegex(first, artifact, { isEdit: true });
  const rerendered = applyTavernRegex(first, artifact);
  assert.equal(edited, first, '编辑路径必须保留既有 mount');
  assert.equal(rerendered, first, '幂等保护必须阻止对已生成 HTML 的再次包裹');
  assert.equal((first.match(/<div[^>]*data-re0-narrative-mount\b/g) || []).length, 1);
  assert.equal((first.match(/<nav class="re0-theme-toolbar"/g) || []).length, 1);
});

test('packaged renderer boots before Tavern Helper measures the iframe', () => {
  const html = buildArtifact().replaceString;
  assert.match(html, /const start = globalThis\.Re0NarrativeCore\?\.boot/);
  assert.match(html, /if \(typeof document !== ['"]undefined['"] && typeof start === ['"]function['"]\)/);
  assert.doesNotMatch(html, /addEventListener\(['"]DOMContentLoaded['"],\s*boot/);
});

test('packaged renderer uses a reference-style staged script boundary', () => {
  const html = buildArtifact().replaceString;
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)];
  assert.ok(scripts.length >= 3, 'the reader must not depend on one monolithic script block');
  assert.match(html, /globalThis\.Re0NarrativeBoot/);
  assert.match(html, /globalThis\.Re0NarrativeCore/);
  assert.match(html, /globalThis\.Re0NarrativeBoot\??\./);
});

test('each staged script is independently parseable and the entry is last', () => {
  const html = buildArtifact().replaceString;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(scripts.length >= 3);
  for (const [index, source] of scripts.entries()) {
    assert.doesNotThrow(() => new Function(source), `staged script ${index + 1} must parse`);
  }
  assert.match(scripts.at(-1), /Re0NarrativeCore\?\.boot/);
  assert.match(scripts[0], /dataset\.re0ScriptSeen/);
});

test('packaged renderer asks Tavern Helper to resize after dynamic content is painted', () => {
  const html = buildArtifact().replaceString;
  assert.match(html, /function requestMessageFrameResize/);
  assert.match(html, /frameElement[\s\S]*?style[\s\S]*?height/);
  assert.match(html, /requestMessageFrameResize\(\)/);
});

test('unsafe textarea terminators cannot escape the inert protocol carrier', () => {
  const artifact = buildArtifact();
  const hostile = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot></textarea><script>globalThis.pwned=1</script></now_plot></content>';
  assert.equal(simulateReplacement(hostile, artifact), hostile);
});

test('packager rejects dangerous embedded closing tags and serializes deterministically', () => {
  assert.throws(() => buildArtifact({ cssOverride: 'x</style>y' }), /提前结束|closing/i);
  assert.throws(() => buildArtifact({ moduleOverrides: { 'narrative/src/render.mjs': 'console.log("</script>")' } }), /提前结束|closing/i);
  assert.equal(buildSerializedArtifact(), buildSerializedArtifact());
});

test('checked artifact is byte-for-byte current and check mode has not written elsewhere', () => {
  assert.ok(existsSync(OUTPUT));
  const current = readFileSync(OUTPUT, 'utf8');
  assert.equal(current, buildSerializedArtifact());
  assert.equal(existsSync(resolve(ROOT, 'dist/regex-Re0·魔女茶会创角向导.json')), true);
  assert.equal(existsSync(resolve(ROOT, 'dist/regex-Re0·全变量状态栏.json')), true);
});

test('narrative source and artifact line endings are pinned for deterministic Windows checkouts', () => {
  const attributes = readFileSync(resolve(ROOT, '.gitattributes'), 'utf8');
  for (const rule of [
    '/narrative/**/*.mjs text eol=lf',
    '/narrative/**/*.json text eol=lf',
    '/narrative/*.css text eol=lf',
    '/dist/regex-Re0·正文美化.json text eol=lf',
    '/tools/package_narrative_regex.mjs text eol=lf',
    '/tests/test_narrative_*.mjs text eol=lf',
  ]) assert.ok(attributes.includes(rule), `missing .gitattributes rule: ${rule}`);
});
