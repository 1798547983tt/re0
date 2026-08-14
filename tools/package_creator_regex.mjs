import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');
const OUTPUT = resolve(ROOT, 'dist', 'regex-Re0·魔女茶会创角向导.json');
const ASSET_COMMIT = 'a6aeb9cca0f0066bd10aec2aba0fd4b220301788';
const ASSET_NAMES = [
  'emilia-blue-tea.png',
  'emilia-snow-tea.png',
  'satella-moon.png',
  'rem-tea-rose.png',
  'witch-harp-rose.png',
  'witch-table-tea.png',
];

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n');
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '')
    .replace(/^import\s+[^\n]+\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export\s+/gm, '');
}

function serializeJavascript(value) {
  return JSON.stringify(value)
    .replaceAll('</', '<\\/')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function buildJavascript() {
  const storyIndex = JSON.parse(read('frontend/data/story-index.json'));
  const assetUrls = Object.fromEntries(ASSET_NAMES.map((name) => [
    name,
    `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/frontend/assets/${name}`,
  ]));
  const creatorCore = stripModuleSyntax(read('frontend/src/creator-core.mjs'));
  const aiProvider = stripModuleSyntax(read('frontend/src/ai-provider.mjs'))
    .replaceAll(/\basText\b/g, 'asAiText');
  const app = stripModuleSyntax(read('frontend/src/app.mjs'));
  const bundled = [
    "'use strict';",
    `const EMBEDDED_STORY_INDEX = ${serializeJavascript(storyIndex)};`,
    `const ASSET_URLS = Object.freeze(${serializeJavascript(assetUrls)});`,
    `const ASSET_COMMIT = '${ASSET_COMMIT}';`,
    "function assetUrl(filename) { return ASSET_URLS[filename] || `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/frontend/assets/${encodeURIComponent(filename)}`; }",
    'async function loadStoryIndex() { return normalizeStoryIndex(EMBEDDED_STORY_INDEX); }',
    creatorCore,
    aiProvider,
    app,
  ].join('\n\n');
  if (/^\s*(?:import|export)\s/m.test(bundled)) throw new Error('封装脚本仍含模块语法');
  if (bundled.toLowerCase().includes('</script')) throw new Error('封装脚本包含会提前结束 script 的文本');
  return `(() => {\n${bundled}\n})();`;
}

function buildHtml() {
  const css = read('frontend/styles.css');
  if (css.toLowerCase().includes('</style')) throw new Error('样式包含会提前结束 style 的文本');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#160e1d">
<title>Re:0 · 魔女茶会创角向导</title>
<style>
${css}
</style>
</head>
<body>
<div data-re0-creator-mount>
<main id="re0-creator-app" aria-live="polite"></main>
<noscript>此创角向导需要启用 JavaScript。</noscript>
<script>
${buildJavascript()}
</script>
</div>
</body>
</html>`;
}

function buildArtifact() {
  return {
    disabled: false,
    findRegex: '/<start>([\\s\\S]*?)<\\/start>/gsi',
    id: 'a10f2484-0ec0-4bdf-b02c-7f797f2bd39d',
    markdownOnly: true,
    maxDepth: null,
    minDepth: null,
    placement: [1, 2],
    promptOnly: false,
    replaceString: `\`\`\`html\n${buildHtml()}\n\`\`\``,
    runOnEdit: true,
    scriptName: 'Re:0·魔女茶会创角向导',
    substituteRegex: 0,
    trimStrings: [],
  };
}

const serialized = `${JSON.stringify(buildArtifact(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!existsSync(OUTPUT)) throw new Error(`产物不存在：${OUTPUT}`);
  if (readFileSync(OUTPUT, 'utf8') !== serialized) throw new Error(`产物不是当前源码生成：${OUTPUT}`);
  console.log(`creator-regex package is current: ${OUTPUT}`);
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(`creator-regex package written: ${OUTPUT}`);
}
