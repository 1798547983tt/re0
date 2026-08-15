import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPinnedReleaseUrl } from '../narrative/src/assets.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');
export const OUTPUT = resolve(ROOT, 'dist', 'regex-Re0·正文美化.json');
const MANIFEST_PATH = resolve(ROOT, 'narrative/assets/manifest.json');
const SCRIPT_ID = '77df7cab-215d-42f5-b9a0-5ec7a60c9d6c';
// The capture group is deliberately carried into the inert textarea below.
// Tavern Helper expands `$1` while applying the regex replacement; the
// renderer then reads that captured protocol instead of falling back to its
// development sample. The leading guard makes the display transform
// idempotent if a host re-runs regexes over an already-rendered message.
export const NARRATIVE_FIND_REGEX = '/(?![\\s\\S]*data-re0-narrative-mount)(<content>(?:(?!<\\/?textarea\\b)[\\s\\S])*?<\\/content>)/is';

export const MODULE_ORDER = Object.freeze([
  'narrative/src/character-registry.mjs',
  'narrative/src/theme-core.mjs',
  'narrative/src/protocol.mjs',
  'narrative/src/assets.mjs',
  'narrative/src/render.mjs',
]);

const FIXED_ASSETS = Object.freeze([
  ['logo:transparent', 'logo', './assets/logo-transparent.png', 'transparent RE0 archive logo cutout', 'brand mark', 'RE0 王都档案透明标识'],
  ['titlePlate:day', 'titlePlate', './assets/title-plate-day.png', 'cold silver-blue archive title plate without text', 'title plate', 'day title plate'],
  ['titlePlate:night', 'titlePlate', './assets/title-plate-night.png', 'obsidian dark-gold purple-red title plate without text', 'title plate', 'night title plate'],
  ['titlePlate:beige', 'titlePlate', './assets/title-plate-beige.png', 'warm parchment red-brown title plate without text', 'title plate', 'beige title plate'],
  ['background:day', 'background', './assets/background-day.webp', 'low-detail cold archive background with quiet text zones', 'background', 'day background'],
  ['background:night', 'background', './assets/background-night.webp', 'low-detail obsidian witch-residue background with quiet text zones', 'background', 'night background'],
  ['background:beige', 'background', './assets/background-beige.webp', 'low-detail parchment archive background with quiet text zones', 'background', 'beige background'],
]);

export const EXPECTED_ASSET_COUNT = 51;

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function serializeJavascript(value) {
  return JSON.stringify(value)
    .replaceAll('</', '<\\/')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function stripModuleSyntax(source) {
  return source
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '')
    .replace(/^import\s+[^\n]+\s+from\s+['"][^'"]+['"](?:\s+with\s+\{\s*type:\s*['"]json['"]\s*\})?;\s*/gm, '')
    .replace(/^export\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace(/^export\s+/gm, '');
}

function assertSafeEmbeddedSource(source, closingTag, label) {
  if (source.toLowerCase().includes(closingTag)) {
    throw new Error(`${label} 包含会提前结束 ${closingTag.slice(2)} 的文本`);
  }
}

function mimeFromPath(path) {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) throw new Error('PNG 文件过短');
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('不是 PNG 文件');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('不是 WebP 文件');
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunk === 'VP8X' && data + 10 <= buffer.length) {
      return { width: readUInt24LE(buffer, data + 4) + 1, height: readUInt24LE(buffer, data + 7) + 1 };
    }
    if (chunk === 'VP8 ' && data + 10 <= buffer.length) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (chunk === 'VP8L' && data + 5 <= buffer.length) {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = data + size + (size % 2);
  }
  throw new Error('无法读取 WebP 尺寸');
}

function imageDimensions(path, buffer) {
  if (path.endsWith('.png')) return pngDimensions(buffer);
  if (path.endsWith('.webp')) return webpDimensions(buffer);
  return null;
}

function assetFilePath(localPath) {
  return resolve(ROOT, 'narrative', localPath.slice(2));
}

function metadataFor(localPath) {
  const path = assetFilePath(localPath);
  if (!existsSync(path)) return { mime: null, dimensions: null, sha256: null };
  const buffer = readFileSync(path);
  return {
    mime: mimeFromPath(localPath),
    dimensions: imageDimensions(localPath, buffer),
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function baseAsset({ id, kind, localPath, prompt, sourceRole, reference, portraitKey = null }) {
  return {
    id,
    kind,
    portraitKey,
    localPath,
    releaseUrl: '',
    mime: null,
    dimensions: null,
    sha256: null,
    prompt,
    sourceRole,
    reference,
  };
}

export function buildDefaultManifest() {
  const registry = readJson('narrative/data/character-registry.json');
  const fixed = FIXED_ASSETS.map(([id, kind, localPath, prompt, sourceRole, reference]) => baseAsset({
    id,
    kind,
    localPath,
    prompt,
    sourceRole,
    reference,
  }));
  const avatars = registry.map((entry) => baseAsset({
    id: `avatar:${entry.portraitKey}`,
    kind: 'avatar',
    portraitKey: entry.portraitKey,
    localPath: `./assets/avatars/${entry.portraitKey}.webp`,
    prompt: `static square portrait for ${entry.displayName}, RE0 dossier style, derived from supplied reference only`,
    sourceRole: 'avatar',
    reference: entry.referenceFile,
  }));
  return {
    schemaVersion: 1,
    generatedBy: 'tools/package_narrative_regex.mjs --refresh-manifest',
    releaseRevision: '',
    notes: 'Missing binaries keep null mime/dimensions/sha256 until refreshed from real files.',
    assets: [...fixed, ...avatars].map((asset) => ({ ...asset, ...metadataFor(asset.localPath) })),
  };
}

export function refreshManifestData({ write = false } = {}) {
  const manifest = buildDefaultManifest();
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (write) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, serialized, 'utf8');
  }
  return manifest;
}

export function auditManifest(manifest = readJson('narrative/assets/manifest.json')) {
  const missing = [];
  const incomplete = [];
  const insecureReleaseUrls = [];
  const unpinnedReleaseUrls = [];
  for (const asset of manifest.assets || []) {
    const exists = existsSync(assetFilePath(asset.localPath || ''));
    if (!exists) missing.push(asset);
    if (exists && (!asset.mime || !asset.dimensions || !asset.sha256)) incomplete.push(asset);
    if (asset.releaseUrl) {
      try {
        if (new URL(asset.releaseUrl).protocol !== 'https:') insecureReleaseUrls.push(asset);
        else if (!isPinnedReleaseUrl(asset.releaseUrl, manifest.releaseRevision)) unpinnedReleaseUrls.push(asset);
      } catch (_error) {
        insecureReleaseUrls.push(asset);
      }
    }
  }
  return {
    total: manifest.assets?.length || 0,
    missing,
    incomplete,
    insecureReleaseUrls,
    unpinnedReleaseUrls,
    ready: missing.length === 0
      && incomplete.length === 0
      && insecureReleaseUrls.length === 0
      && unpinnedReleaseUrls.length === 0,
  };
}

function moduleBody(path, moduleOverrides) {
  const source = moduleOverrides[path] ?? read(path);
  assertSafeEmbeddedSource(source, '</script', path);
  return stripModuleSyntax(source);
}

function moduleWrapper({ path, prelude = '', exports, source }) {
  const body = source ?? moduleBody(path, {});
  const returnBody = exports.map((name) => `${name}: ${name}`).join(',\n');
  const script = `(() => {
'use strict';
// ${path}
${prelude}
const api = (() => {
${body}
return {
${returnBody}
};
})();
Object.assign(globalThis.Re0NarrativeCore, api);
})();`;
  assertSafeEmbeddedSource(script, '</script', `${path} staged wrapper`);
  return script;
}

function buildJavascriptParts({ moduleOverrides = {} } = {}) {
  const volumeHeadings = readJson('narrative/data/volume-headings.json');
  const characterRegistry = readJson('narrative/data/character-registry.json');
  const assetManifest = existsSync(MANIFEST_PATH) ? readJson('narrative/assets/manifest.json') : refreshManifestData();
  const config = `(() => {
'use strict';
globalThis.Re0NarrativeCore = Object.create(null);
const EMBEDDED_VOLUME_HEADINGS = ${serializeJavascript(volumeHeadings)};
const EMBEDDED_CHARACTER_REGISTRY = ${serializeJavascript(characterRegistry)};
const EMBEDDED_ASSET_MANIFEST = ${serializeJavascript(assetManifest)};
globalThis.Re0NarrativeBoot = Object.freeze({
  version: 're0-narrative-staged-v1',
  volumeHeadings: EMBEDDED_VOLUME_HEADINGS,
  characterRegistry: EMBEDDED_CHARACTER_REGISTRY,
  assetManifest: EMBEDDED_ASSET_MANIFEST,
});
const mount = document.querySelector('[data-re0-narrative-mount]');
if (mount) mount.dataset.re0ScriptSeen = 'true';
})();`;

  const character = moduleWrapper({
    path: 'narrative/src/character-registry.mjs',
    prelude: 'const registryData = globalThis.Re0NarrativeBoot.characterRegistry;',
    exports: ['CHARACTER_REGISTRY', 'decodeTextEntities', 'normalizeAlias', 'firstGrapheme', 'resolveSpeaker'],
    source: moduleBody('narrative/src/character-registry.mjs', moduleOverrides),
  });
  const theme = moduleWrapper({
    path: 'narrative/src/theme-core.mjs',
    prelude: 'const { resolveSpeaker } = globalThis.Re0NarrativeCore;',
    exports: ['NARRATIVE_THEMES', 'ROLE_MOTIFS', 'resolveTheme', 'resolveBubble'],
    source: moduleBody('narrative/src/theme-core.mjs', moduleOverrides),
  });
  const protocol = moduleWrapper({
    path: 'narrative/src/protocol.mjs',
    prelude: [
      'const volumeHeadings = globalThis.Re0NarrativeBoot.volumeHeadings;',
      'const { decodeTextEntities, resolveSpeaker } = globalThis.Re0NarrativeCore;',
    ].join('\n'),
    exports: ['formatVolumeHeading', 'formatWitchCalendarDate', 'splitUpdateVariable', 'parseNarrativeResponse'],
    source: moduleBody('narrative/src/protocol.mjs', moduleOverrides),
  });
  const assets = moduleWrapper({
    path: 'narrative/src/assets.mjs',
    prelude: 'const EMBEDDED_ASSET_MANIFEST = globalThis.Re0NarrativeBoot.assetManifest;',
    exports: ['isHttpsReleaseUrl', 'isPinnedReleaseUrl', 'findNarrativeAsset', 'resolveNarrativeAsset', 'applyCssImageAsset', 'loadNarrativeAssetManifest', 'themeAssetId'],
    source: moduleBody('narrative/src/assets.mjs', moduleOverrides),
  });
  const renderSource = moduleBody('narrative/src/render.mjs', moduleOverrides)
    .replace(/\nif \(typeof document !== 'undefined'\) boot\(\);\s*$/u, '');
  const render = moduleWrapper({
    path: 'narrative/src/render.mjs',
    prelude: [
      'const { parseNarrativeResponse } = globalThis.Re0NarrativeCore;',
      'const { resolveBubble, resolveTheme } = globalThis.Re0NarrativeCore;',
      'const { applyCssImageAsset, loadNarrativeAssetManifest, resolveNarrativeAsset, themeAssetId } = globalThis.Re0NarrativeCore;',
    ].join('\n'),
    exports: ['resolveDialogueSide', 'getThemeButtonState', 'applyNarrativeAssets', 'renderNarrative', 'boot'],
    source: renderSource,
  });
  const entry = `(() => {
'use strict';
const start = globalThis.Re0NarrativeCore?.boot;
if (typeof document !== 'undefined' && typeof start === 'function') {
  try { start(); }
  catch (_error) {
    const mount = document.querySelector('[data-re0-narrative-mount]');
    if (mount) mount.dataset.re0Runtime = 'error';
  }
}
})();`;
  const parts = [config, character, theme, protocol, assets, render, entry];
  for (const [index, part] of parts.entries()) {
    if (/^\s*(?:import|export)\s/m.test(part)) throw new Error(`封装脚本仍含模块语法：第${index + 1}段`);
    if (/\bwith\s*\{\s*type:\s*['"]json['"]\s*\}/u.test(part)) throw new Error(`封装脚本仍含 JSON import assertion：第${index + 1}段`);
    assertSafeEmbeddedSource(part, '</script', `封装脚本第${index + 1}段`);
  }
  return parts;
}

function buildHtml({ cssOverride = null, moduleOverrides = {} } = {}) {
  const css = cssOverride ?? read('narrative/styles.css');
  assertSafeEmbeddedSource(css, '</style', '正文样式');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#111827">
<title>Re:0 · 正文美化</title>
<style>
${css}
</style>
</head>
<body>
<div class="re0-reader" data-re0-narrative-mount data-re0-root data-asset-manifest-url="./assets/manifest.json">
<nav class="re0-theme-toolbar" aria-label="正文主题">
<button type="button" data-action="theme-auto" aria-label="自动主题" title="自动主题">◐</button>
<button type="button" data-action="theme-day" aria-label="日间主题" title="日间主题">☼</button>
<button type="button" data-action="theme-night" aria-label="夜间主题" title="夜间主题">☾</button>
<button type="button" data-action="theme-beige" aria-label="羊皮纸主题" title="羊皮纸主题">▤</button>
</nav>
<main id="re0-narrative-app" aria-live="polite" aria-busy="true">
<article class="re0-narrative-card">
<header class="re0-title-plate">
<div class="re0-logo-slot" data-logo-slot="message-card" aria-hidden="true"><span>RE0</span></div>
<div class="re0-title-plate__text">
<p class="re0-title-plate__kicker">王都档案 × 魔女残香</p>
<h1>正文协议读取中</h1>
<time>魔女历1000年01月01日</time>
</div>
</header>
<section class="re0-story-flow" data-re0-content aria-label="剧情正文">
<p class="re0-narration">正文正在载入……</p>
</section>
</article>
</main>
<div id="re0-narrative-overlay-root" hidden></div>
<noscript>此正文渲染器需要 JavaScript 才能展示协议内容。</noscript>
<textarea id="re0-narrative-source" data-re0-source="content" inert hidden aria-hidden="true">$1</textarea>
</div>
${buildJavascriptParts({ moduleOverrides }).map((part) => `<script>\n${part}\n</script>`).join('\n')}
</body>
</html>`;
}

export function buildArtifact(options = {}) {
  return {
    disabled: false,
    findRegex: NARRATIVE_FIND_REGEX,
    id: SCRIPT_ID,
    markdownOnly: true,
    maxDepth: null,
    minDepth: null,
    placement: [2],
    promptOnly: false,
    replaceString: `\`\`\`html\n${buildHtml(options)}\n\`\`\``,
    // The source message remains the canonical input. Re-running this
    // display-only wrapper over generated HTML nests scripts and mounts.
    runOnEdit: false,
    scriptName: 'Re:0·正文美化',
    substituteRegex: 0,
    trimStrings: [],
  };
}

export function buildSerializedArtifact(options = {}) {
  return `${JSON.stringify(buildArtifact(options), null, 2)}\n`;
}

export function simulateReplacement(original, artifact = buildArtifact()) {
  return String(original).replace(
    /(?![\s\S]*data-re0-narrative-mount)(<content>(?:(?!<\/?textarea\b)[\s\S])*?<\/content>)/is,
    artifact.replaceString,
  );
}

function writeArtifact() {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, buildSerializedArtifact(), 'utf8');
  const audit = auditManifest(existsSync(MANIFEST_PATH) ? readJson('narrative/assets/manifest.json') : refreshManifestData());
  console.log(`narrative-regex package written: ${OUTPUT}`);
  console.log(`asset audit: missing=${audit.missing.length}, incomplete=${audit.incomplete.length}`);
}

function checkArtifact() {
  if (!existsSync(OUTPUT)) throw new Error(`产物不存在：${OUTPUT}`);
  if (readFileSync(OUTPUT, 'utf8') !== buildSerializedArtifact()) throw new Error(`产物不是当前源码生成：${OUTPUT}`);
  const audit = auditManifest(existsSync(MANIFEST_PATH) ? readJson('narrative/assets/manifest.json') : refreshManifestData());
  console.log(`narrative-regex package is current: ${OUTPUT}`);
  console.log(`asset audit: missing=${audit.missing.length}, incomplete=${audit.incomplete.length}`);
}

function printAudit({ strict = false } = {}) {
  const audit = auditManifest(existsSync(MANIFEST_PATH) ? readJson('narrative/assets/manifest.json') : refreshManifestData());
  console.log(JSON.stringify({
    total: audit.total,
    missing: audit.missing.map((asset) => asset.localPath),
    incomplete: audit.incomplete.map((asset) => asset.localPath),
    insecureReleaseUrls: audit.insecureReleaseUrls.map((asset) => asset.localPath),
    unpinnedReleaseUrls: audit.unpinnedReleaseUrls.map((asset) => asset.localPath),
    ready: audit.ready,
  }, null, 2));
  if (strict && !audit.ready) process.exitCode = 1;
}

function runCli() {
  if (process.argv.includes('--refresh-manifest')) {
    refreshManifestData({ write: true });
    console.log(`narrative asset manifest refreshed: ${MANIFEST_PATH}`);
    printAudit();
    return;
  }
  if (process.argv.includes('--audit-assets')) {
    printAudit({ strict: process.argv.includes('--strict') });
    return;
  }
  if (process.argv.includes('--check')) checkArtifact();
  else writeArtifact();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
