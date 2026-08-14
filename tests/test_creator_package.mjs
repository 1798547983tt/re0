import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT = resolve(ROOT, 'dist', 'regex-Re0·魔女茶会创角向导.json');
const ASSET_COMMIT = 'a6aeb9cca0f0066bd10aec2aba0fd4b220301788';
const ASSET_NAMES = [
  'emilia-blue-tea.png',
  'emilia-snow-tea.png',
  'satella-moon.png',
  'rem-tea-rose.png',
  'witch-harp-rose.png',
  'witch-table-tea.png',
];

test('creator regex artifact is a complete importable self-contained package', () => {
  assert.ok(existsSync(ARTIFACT), '先运行封装命令生成完整 regex JSON');
  const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));

  assert.equal(artifact.disabled, false);
  assert.equal(artifact.findRegex, '/<start>([\\s\\S]*?)<\\/start>/gsi');
  assert.equal(artifact.markdownOnly, true);
  assert.deepEqual(artifact.placement, [1, 2]);
  assert.equal(artifact.promptOnly, false);
  assert.equal(artifact.runOnEdit, true);
  assert.equal(artifact.scriptName, 'Re:0·魔女茶会创角向导');
  assert.ok(artifact.replaceString.startsWith('```html\n<!doctype html>'));
  assert.ok(artifact.replaceString.endsWith('\n```'));
  assert.match(artifact.replaceString, /战力等阶/);
  assert.match(artifact.replaceString, /id="re0-creator-app"/);
  assert.match(artifact.replaceString, /data-re0-creator-mount/);
  assert.match(artifact.replaceString, /document\.currentScript/);
  assert.doesNotMatch(artifact.replaceString, /id="app"/);
  assert.match(artifact.replaceString, /1阶（基础）到7阶（顶点）/);
  assert.doesNotMatch(artifact.replaceString, /1阶（顶点）到7阶（基础）/);
  assert.match(artifact.replaceString, /path: 'combatTier\.level'/);
  assert.match(artifact.replaceString, /path: 'combatTier\.position'/);
  assert.match(artifact.replaceString, /data-screen="title"/);
  assert.match(artifact.replaceString, /data-action="start-new"/);
  assert.match(artifact.replaceString, /data-action="continue-draft"/);
  assert.match(artifact.replaceString, /data-action="fetch-models"/);
  assert.match(artifact.replaceString, /data-model-list/);
  assert.match(artifact.replaceString, /data-action="run-ai-all"/);
  assert.match(artifact.replaceString, /data-action="apply-ai-preview"/);
  assert.match(artifact.replaceString, /data-action="retry-ai"/);
  assert.match(artifact.replaceString, /requestTavernHelper/);
  assert.match(artifact.replaceString, /data-portrait-image/);
  assert.match(artifact.replaceString, /data-portrait-file/);
  assert.match(artifact.replaceString, /data-step-visual/);
  assert.match(artifact.replaceString, /Re0：从零开始的异世界生活/);
  assert.match(artifact.replaceString, /class="companion-bar"/);
  assert.match(artifact.replaceString, /data-arsenal-tab=/);
  assert.match(artifact.replaceString, /class="review-disclosure/);
  assert.doesNotMatch(artifact.replaceString, /data-path="protagonist\.ageStage"|ageStage:\s*'字符串'/);
  assert.doesNotMatch(artifact.replaceString, /class="title-footer"/);
  assert.doesNotMatch(artifact.replaceString, /portrait-presets/);
  assert.doesNotMatch(artifact.replaceString, /data-action="choose-portrait"/);
  assert.doesNotMatch(artifact.replaceString, /updateAiTrace\(\{ \.\.\.event/);
  assert.match(artifact.replaceString, /\.footer-nav \{ position: relative;/);
  assert.doesNotMatch(artifact.replaceString, /\.footer-nav \{ position: fixed;/);
  assert.doesNotMatch(artifact.replaceString, /src="\.\/src\/app\.mjs"/);
  assert.doesNotMatch(artifact.replaceString, /fetch\(['"]\.\/data\/story-index\.json/);

  for (const name of ASSET_NAMES) {
    const url = `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/frontend/assets/${name}`;
    assert.ok(artifact.replaceString.includes(url), `缺少固定图片链接：${name}`);
  }

  const storyMatch = artifact.replaceString.match(/const EMBEDDED_STORY_INDEX = (\[[\s\S]*?\]);\r?\n\r?\nconst ASSET_URLS/);
  assert.ok(storyMatch, '剧情索引必须直接嵌入 JSON 产物');
  const storyIndex = JSON.parse(storyMatch[1]);
  assert.equal(storyIndex.length, 39);
  assert.equal(storyIndex.reduce((sum, volume) => sum + volume.events.length, 0), 308);

  const sourceStoryIndex = JSON.parse(readFileSync(resolve(ROOT, 'frontend', 'data', 'story-index.json'), 'utf8'));
  assert.deepEqual(storyIndex, sourceStoryIndex, '封装内剧情索引必须与维护源完全一致');

  const scriptMatch = artifact.replaceString.match(/<script>\n([\s\S]*?)\n<\/script>/);
  assert.ok(scriptMatch, '完整产物必须内嵌可执行脚本');
  assert.doesNotThrow(() => new vm.Script(scriptMatch[1]));
});

test('creator script stays valid after Tavern Helper normalizes HTML entities', () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
  const scriptMatch = artifact.replaceString.match(/<script>\n([\s\S]*?)\n<\/script>/);
  assert.ok(scriptMatch, '包内必须存在可执行脚本');

  // The message iframe path serializes the body through HTML before srcdoc
  // execution. Reproduce the observed entity normalization that broke the
  // previous escapeHtml string literals in the live SillyTavern runtime.
  const normalizedByMessageIframe = scriptMatch[1]
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'");

  assert.doesNotThrow(() => new vm.Script(normalizedByMessageIframe));
});
