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
      findRegex: '/<content>[\\s\\S]*?<\\/content>/g',
      markdownOnly: true,
      placement: [2],
      promptOnly: false,
      runOnEdit: true,
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
  assert.equal((html.match(/<div data-re0-narrative-mount/g) || []).length, 1);
  assert.doesNotMatch(html, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(html, /\bwith\s*\{\s*type:\s*['"]json['"]\s*\}/);
  assert.doesNotMatch(html, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData|stat_data\s*=/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /data-asset-fallback/);
});

test('replacement preserves a trailing UpdateVariable suffix byte-for-byte', () => {
  const artifact = buildArtifact();
  const original = '<content><story volume="01"></story><time>魔女历1000年01月01日</time><now_plot>正文</now_plot></content><UpdateVariable>{"sentinel":"保持"}</UpdateVariable>';
  const replaced = simulateReplacement(original, artifact);
  assert.ok(replaced.startsWith(artifact.replaceString));
  assert.ok(replaced.endsWith('<UpdateVariable>{"sentinel":"保持"}</UpdateVariable>'));
  assert.equal((replaced.match(/<UpdateVariable>/g) || []).length, 1);
  assert.equal(replaced.includes('<content><story'), false);
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
