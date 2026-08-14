import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');
const OUTPUT = resolve(ROOT, 'dist', 'regex-Re0·全变量状态栏.json');
const MODULES = Object.freeze([
  'statusbar/src/schema-map.mjs',
  'statusbar/src/status-core.mjs',
  'statusbar/src/portraits.mjs',
  'statusbar/src/runtime.mjs',
  'statusbar/src/assets.mjs',
  'statusbar/src/preview.mjs',
  'statusbar/src/app.mjs',
]);

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '')
    .replace(/^import\s+[^\n]+\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export\s+/gm, '');
}

function assertSafeEmbeddedSource(source, closingTag, label) {
  if (source.toLowerCase().includes(closingTag)) {
    throw new Error(`${label} 包含会提前结束 ${closingTag.slice(2)} 的文本`);
  }
}

function buildJavascript() {
  const sources = MODULES.map((path) => stripModuleSyntax(read(path)));
  const bundled = ["'use strict';", ...sources].join('\n\n');
  if (/^\s*(?:import|export)\s/m.test(bundled)) throw new Error('封装脚本仍含模块语法');
  assertSafeEmbeddedSource(bundled, '</script', '封装脚本');
  return `(() => {\n${bundled}\n})();`;
}

function buildHtml() {
  const css = read('statusbar/styles.css');
  assertSafeEmbeddedSource(css, '</style', '状态栏样式');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#101827">
<title>Re:0 · 全变量状态栏</title>
<style>
${css}
</style>
</head>
<body>
<div data-re0-statusbar-mount>
<main id="re0-statusbar-app" aria-live="polite" aria-busy="true"></main>
<div id="re0-statusbar-overlay-root" hidden></div>
<noscript>此状态栏需要启用 JavaScript。</noscript>
</div>
<script>
${buildJavascript()}
</script>
</body>
</html>`;
}

function buildArtifact() {
  return {
    disabled: false,
    findRegex: '/(?![\\s\\S])/g',
    id: 'e5c76073-a3a2-4c4b-a5db-d38fbdc5a77e',
    markdownOnly: true,
    maxDepth: null,
    minDepth: null,
    placement: [2],
    promptOnly: false,
    replaceString: `\`\`\`html\n${buildHtml()}\n\`\`\``,
    runOnEdit: true,
    scriptName: 'Re:0·全变量状态栏',
    substituteRegex: 0,
    trimStrings: [],
  };
}

const serialized = `${JSON.stringify(buildArtifact(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!existsSync(OUTPUT)) throw new Error(`产物不存在：${OUTPUT}`);
  if (readFileSync(OUTPUT, 'utf8') !== serialized) throw new Error(`产物不是当前源码生成：${OUTPUT}`);
  console.log(`statusbar-regex package is current: ${OUTPUT}`);
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(`statusbar-regex package written: ${OUTPUT}`);
}
