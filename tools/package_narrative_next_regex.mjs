import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');

export const OUTPUTS = Object.freeze({
  main: resolve(ROOT, 'dist', 'regex-Re0·正文美化-v2.json'),
  streaming: resolve(ROOT, 'dist', 'regex-Re0·正文美化-v2-流式.json'),
  completed: resolve(ROOT, 'dist', 'regex-Re0·正文美化-v2-完成.json'),
  suite: resolve(ROOT, 'dist', 'regex-Re0·正文美化-v2-suite.json'),
});
export const PACKED_PREVIEW_OUTPUT = resolve(ROOT, 'reports', 'narrative-v2-packed-preview.html');

const MODULE_ORDER = Object.freeze([
  'narrative-next/src/entities.mjs',
  'narrative-next/src/inline-format.mjs',
  'narrative-next/src/protocol.mjs',
  'narrative-next/src/settings.mjs',
  'narrative-next/src/theme.mjs',
  'narrative-next/src/characters.mjs',
  'narrative-next/src/titles.mjs',
  'narrative-next/src/abilities.mjs',
  'narrative-next/src/visual-assets.mjs',
  'narrative-next/src/renderer.mjs',
]);

const SAFE_CONTENT_CHARACTER = '(?:(?!<\\/?(?:textarea|script)\\b)[\\s\\S])';
const PREFIX = '^(?![\\s\\S]*data-re0v2-mount)[\\t \\r\\n]*';
export const COMPLETED_FIND_REGEX = `/${PREFIX}(<content\\b${SAFE_CONTENT_CHARACTER}*?<\\/content>)/i`;
export const STREAMING_FIND_REGEX = `/${PREFIX}(<content\\b(?![\\s\\S]*<\\/content>)${SAFE_CONTENT_CHARACTER}*)$/i`;
export const MAIN_FIND_REGEX = `/${PREFIX}(<content\\b(?:${SAFE_CONTENT_CHARACTER}*?<\\/content>|(?![\\s\\S]*<\\/content>)${SAFE_CONTENT_CHARACTER}*$))/i`;

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
    .replace(/^\uFEFF/u, '')
    .replaceAll('\r\n', '\n');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('</', '<\\/')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function stripImports(source) {
  return source
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '')
    .replace(/^import\s+[^\n]+\s+from\s+['"][^'"]+['"](?:\s+with\s+\{[^}]+\})?;\s*/gm, '')
    .replace(/^export\s+\{[\s\S]*?\};\s*/gm, '')
    .replace(/^export\s+/gm, '');
}

function moduleSource(relativePath) {
  let source = read(relativePath);
  if (relativePath.endsWith('characters.mjs')) {
    source = source.replace(
      /^import\s+registryData[^\n]+;\s*/m,
      `const registryData = ${safeJson(readJson('narrative/data/character-registry.json'))};\n`,
    );
  }
  if (relativePath.endsWith('titles.mjs')) {
    source = source.replace(
      /^import\s+volumeData[^\n]+;\s*/m,
      `const volumeData = ${safeJson(readJson('narrative/data/volume-headings.json'))};\n`,
    );
  }
  if (relativePath.endsWith('settings.mjs')) {
    source = source
      .replace(/\bTHEMES\b/gu, 'SETTING_THEME_IDS')
      .replace(/\bFONTS\b/gu, 'SETTING_FONT_IDS')
      .replace(/\bSIZES\b/gu, 'SETTING_SIZE_IDS');
  }
  if (relativePath.endsWith('abilities.mjs')) {
    source = source.replaceAll('ABILITY_KINDS', 'PRESENTATION_ABILITY_KINDS');
  }
  return stripImports(source);
}

function assertEmbeddable(source, closingTag, label) {
  if (source.toLowerCase().includes(closingTag)) {
    throw new Error(`${label} contains an unsafe ${closingTag} terminator`);
  }
}

function buildRuntimeBundle() {
  const modules = MODULE_ORDER.map((path) => `\n/* ${path} */\n${moduleSource(path)}`).join('\n');
  const bundle = `(function () {\n'use strict';\n${modules}\n\n` +
    `function showRe0NarrativeFailure(mount, text) {\n` +
    `  const app = mount?.querySelector('[data-re0v2-app]') || document.querySelector('[data-re0v2-app]');\n` +
    `  if (!app) return;\n` +
    `  const message = document.createElement('p');\n` +
    `  message.className = 're0v2-loading';\n` +
    `  message.textContent = text;\n` +
    `  app.replaceChildren(message);\n` +
    `  app.setAttribute('aria-busy', 'false');\n` +
    `}\n` +
    `function bootRe0NarrativeV2() {\n` +
    `  const mount = document.querySelector('[data-re0v2-mount]');\n` +
    `  if (!mount || mount.dataset.re0v2Booted === 'true') return Boolean(mount);\n` +
    `  if (mount.dataset.re0v2Booting === 'true') return false;\n` +
    `  const carrier = mount.querySelector('[data-re0v2-source]');\n` +
    `  if (!carrier) {\n` +
    `    mount.dataset.re0v2Runtime = 'error';\n` +
    `    showRe0NarrativeFailure(mount, '正文启动失败：未找到正文载体。');\n` +
    `    return false;\n` +
    `  }\n` +
    `  mount.dataset.re0v2Booting = 'true';\n` +
    `  try {\n` +
    `    const source = String(carrier.value || carrier.textContent || '');\n` +
    `    renderNarrative(mount, source);\n` +
    `    mount.dataset.re0v2Booted = 'true';\n` +
    `    mount.dataset.re0v2Runtime = 'ready';\n` +
    `    return true;\n` +
    `  } catch (error) {\n` +
    `    mount.dataset.re0v2Runtime = 'error';\n` +
    `    showRe0NarrativeFailure(mount, '正文启动失败：请检查输出格式。');\n` +
    `    return false;\n` +
    `  } finally {\n` +
    `    delete mount.dataset.re0v2Booting;\n` +
    `  }\n` +
    `}\n` +
    `globalThis.Re0NarrativeV2 = Object.freeze({ boot: bootRe0NarrativeV2, renderNarrative, parseNarrative, parseStreamingNarrative });\n` +
    `const startRe0NarrativeV2 = () => bootRe0NarrativeV2();\n` +
    `if (document.readyState === 'loading') {\n` +
    `  document.addEventListener('DOMContentLoaded', startRe0NarrativeV2, { once: true });\n` +
    `}\n` +
    `setTimeout(startRe0NarrativeV2, 0);\n` +
    `})();`;
  assertEmbeddable(bundle, '</script', 'runtime bundle');
  return bundle;
}

function buildReplacement() {
  const css = read('narrative-next/styles.css');
  assertEmbeddable(css, '</style', 'stylesheet');
  const runtime = buildRuntimeBundle();
  return `\`\`\`html\n<!doctype html>\n<html lang="zh-CN">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n` +
    `<meta name="color-scheme" content="light dark">\n` +
    `<title>Re:0 · 正文美化 V2</title>\n` +
    `<style>\n${css}\n</style>\n</head>\n<body class="re0v2-preview-page">\n` +
    `<div class="re0v2-shell" data-re0v2-mount>\n` +
    `<main id="re0v2-app" data-re0v2-app aria-live="polite" aria-busy="true"><p class="re0v2-loading">正在展开露格尼卡档案……</p></main>\n` +
    `<textarea id="re0v2-source" data-re0v2-source hidden aria-hidden="true">$1</textarea>\n` +
    `</div>\n<script>\n${runtime}\n</script>\n` +
    `</body>\n</html>\n\`\`\``;
}

function regexArtifact({ id, scriptName, findRegex, replaceString }) {
  return {
    id,
    scriptName,
    findRegex,
    replaceString,
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: 0,
    maxDepth: null,
  };
}

export function buildArtifacts() {
  const replaceString = buildReplacement();
  const streaming = regexArtifact({
    id: '276754ad-04d4-4f99-b2b7-4a04b7d5a441',
    scriptName: 'Re:0·正文美化 V2｜流式',
    findRegex: STREAMING_FIND_REGEX,
    replaceString,
  });
  const completed = regexArtifact({
    id: '18e887ee-2036-4c88-9cbd-bdfa25ab0cb1',
    scriptName: 'Re:0·正文美化 V2｜完成',
    findRegex: COMPLETED_FIND_REGEX,
    replaceString,
  });
  const main = regexArtifact({
    id: '1aebca85-b7d0-40df-9cf9-93d7ea37fcba',
    scriptName: 'Re:0·正文美化 V2',
    findRegex: MAIN_FIND_REGEX,
    replaceString,
  });
  return { main, streaming, completed, suite: [streaming, completed] };
}

export function buildSerializedArtifacts() {
  const artifacts = buildArtifacts();
  return {
    main: `${JSON.stringify(artifacts.main, null, 2)}\n`,
    streaming: `${JSON.stringify(artifacts.streaming, null, 2)}\n`,
    completed: `${JSON.stringify(artifacts.completed, null, 2)}\n`,
    suite: `${JSON.stringify(artifacts.suite, null, 2)}\n`,
  };
}

export function buildPackedPreview(source = read('narrative-next/fixtures/showcase.xml')) {
  if (/<\/?script\b/iu.test(source)) throw new Error('Preview source cannot contain a script boundary');
  if (/<\/?textarea\b/iu.test(source)) throw new Error('Preview source cannot contain a textarea boundary');
  const replacement = buildArtifacts().main.replaceString;
  const html = replacement
    .replace(/^```html\n/u, '')
    .replace(/\n```$/u, '');
  return html.replace('$1', () => source);
}

function writeArtifacts({ check = false } = {}) {
  const serialized = buildSerializedArtifacts();
  for (const [key, path] of Object.entries(OUTPUTS)) {
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== serialized[key]) {
        throw new Error(`Outdated generated artifact: ${path}`);
      }
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized[key], 'utf8');
  }
  const preview = buildPackedPreview();
  if (check) {
    if (!existsSync(PACKED_PREVIEW_OUTPUT) || readFileSync(PACKED_PREVIEW_OUTPUT, 'utf8') !== preview) {
      throw new Error(`Outdated generated artifact: ${PACKED_PREVIEW_OUTPUT}`);
    }
  } else {
    mkdirSync(dirname(PACKED_PREVIEW_OUTPUT), { recursive: true });
    writeFileSync(PACKED_PREVIEW_OUTPUT, preview, 'utf8');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  writeArtifacts({ check });
  if (!check) process.stdout.write(`${OUTPUTS.main}\n`);
}
