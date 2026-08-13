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
