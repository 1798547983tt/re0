import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT_PATH = resolve(ROOT, 'dist', 'regex-Re0·全变量状态栏.json');

test('status-bar artifact is an AI-display-only zero-width append package', () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
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
      findRegex: '/(?![\\s\\S])/g',
      markdownOnly: true,
      placement: [2],
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
    },
  );
  assert.match(artifact.scriptName, /^Re:0·全变量状态栏$/);
  assert.match(artifact.id, /^[a-f0-9-]{36}$/);
  assert.ok(artifact.replaceString.startsWith('```html\n<!doctype html>'));
  assert.ok(artifact.replaceString.endsWith('\n```'));
});

test('packaged HTML contains maintained modules in dependency order and no module syntax', () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
  const html = artifact.replaceString;
  const markers = [
    'const DECLARED_DOMAIN_COUNTS',
    'function firstGrapheme',
    'function createPortraitRepository',
    'function createRuntimeBridge',
    'const ASSET_MANIFEST',
    'function createStatusBar',
  ];
  let previous = -1;
  for (const marker of markers) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `${marker} is missing or out of dependency order`);
    previous = index;
  }
  assert.equal((html.match(/<!doctype html>/g) || []).length, 1);
  assert.equal((html.match(/<div data-re0-statusbar-mount>/g) || []).length, 1);
  assert.doesNotMatch(html, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(html, /data-sample-url/);
  assert.doesNotMatch(html, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
  assert.match(html, /75d39874e8b6246a0d5f9bd45779441cdaf743cf/);
  assert.match(html, /prefers-reduced-motion/);
});

test('zero-width replacement preserves message content and the update block byte-for-byte', () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
  const original = '剧情正文。\n<UpdateVariable>[{"op":"replace","path":"/世界/危机等级","value":"中"}]</UpdateVariable>';
  const output = original.replace(/(?![\s\S])/g, artifact.replaceString);
  assert.equal(output.slice(0, original.length), original);
  assert.equal(output.slice(original.length), artifact.replaceString);
  assert.equal((output.slice(0, original.length).match(/<UpdateVariable>/g) || []).length, 1);
});
