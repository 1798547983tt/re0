import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');
export const OUTPUT = resolve(ROOT, 'dist', 'script-Re0·星屑碎片状态栏.json');
export const SCRIPT_ID = '0b5c5d3b-8e3a-4d4e-b2c7-9fdd5f0c7c44';

const MODULES = Object.freeze([
  ['schema', 'statusbar/src/schema-map.mjs'],
  ['core', 'statusbar/src/status-core.mjs'],
  ['registry', 'narrative/src/character-registry.mjs'],
  ['portraits', 'statusbar/src/portraits.mjs'],
  ['assets', 'shard-statusbar/src/assets.mjs'],
  ['model', 'shard-statusbar/src/model.mjs'],
  ['runtime', 'shard-statusbar/src/runtime.mjs'],
  ['orb', 'shard-statusbar/src/orb.mjs'],
  ['ui', 'shard-statusbar/src/ui.mjs'],
  ['host', 'shard-statusbar/src/host.mjs'],
]);

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
    .replace(/^\uFEFF/u, '')
    .replaceAll('\r\n', '\n');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function serialize(value) {
  return JSON.stringify(value)
    .replaceAll('</', '<\\/')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function stripModuleSyntax(source) {
  const output = [];
  let skippingImport = false;
  for (const line of source.split('\n')) {
    if (!skippingImport && /^\s*import\b/u.test(line)) {
      skippingImport = !line.includes(';');
      continue;
    }
    if (skippingImport) {
      if (line.includes(';')) skippingImport = false;
      continue;
    }
    output.push(line.replace(/^\s*export\s+/u, ''));
  }
  if (skippingImport) throw new Error('模块导入未闭合');
  return output.join('\n');
}

function wrapper(label, source, prelude, exports) {
  const body = stripModuleSyntax(source);
  const returnObject = exports.map((name) => `${name}: ${name}`).join(',\n');
  const script = `(() => {\n'use strict';\n// ${label}\n${prelude}\n${body}\nObject.assign(globalThis.Re0Shard, {\n${returnObject}\n});\n})();`;
  if (/^\s*(?:import|export)\s/mu.test(script)) throw new Error(`${label} 仍含模块语法`);
  if (script.toLowerCase().includes('</script')) throw new Error(`${label} 含危险 script 结束标记`);
  return script;
}

function buildBundle() {
  const shardManifest = readJson('shard-statusbar/assets/manifest.json');
  const narrativeManifest = readJson('narrative/assets/manifest.json');
  const registry = readJson('narrative/data/character-registry.json');
  const css = read('shard-statusbar/styles.css');
  if (css.toLowerCase().includes('</style')) throw new Error('样式包含危险 style 结束标记');

  const parts = [`(() => {\n'use strict';\nglobalThis.Re0Shard = Object.create(null);\n})();`];
  const sources = Object.fromEntries(MODULES.map(([label, path]) => [label, read(path)]));
  parts.push(wrapper(
    'schema-map',
    sources.schema,
    '',
    ['DECLARED_DOMAIN_COUNTS', 'ABILITY_CATEGORIES', 'FIELD_GROUPS', 'expandDeclaredPaths', 'isDeclaredPath'],
  ));
  parts.push(wrapper(
    'status-core',
    sources.core,
    'const { ABILITY_CATEGORIES, DECLARED_DOMAIN_COUNTS, isDeclaredPath } = globalThis.Re0Shard;',
    ['NAV_SECTIONS', 'asRecord', 'asList', 'asText', 'clampMeter', 'firstGrapheme', 'collectUnknownPaths', 'buildHudModel', 'resolveTheme'],
  ));
  parts.push(wrapper(
    'character-registry',
    sources.registry,
    `const registryData = ${serialize(registry)};`,
    ['CHARACTER_REGISTRY', 'decodeTextEntities', 'normalizeAlias', 'firstGrapheme', 'resolveSpeaker'],
  ));
  parts.push(wrapper(
    'portraits',
    sources.portraits,
    'const { firstGrapheme } = globalThis.Re0Shard;',
    ['normalizePortraitName', 'portraitKeys', 'portraitScopeOptions', 'validatePortraitUrl', 'resolvePortrait', 'createPortraitRepository', 'cropPortrait'],
  ));
  parts.push(wrapper(
    'asset-manifest',
    sources.assets,
    `const shardManifest = ${serialize(shardManifest)};\nconst narrativeManifest = ${serialize(narrativeManifest)};`,
    ['SHARD_ASSET_MANIFEST', 'NARRATIVE_ASSET_MANIFEST', 'NARRATIVE_ASSET_REVISION', 'isSafeAssetUrl', 'resolveShardAsset', 'resolvePortraitAsset', 'assetRevision'],
  ));
  parts.push(wrapper(
    'shard-model',
    sources.model,
    [
      'const { asList, asRecord, asText, buildHudModel, firstGrapheme } = globalThis.Re0Shard;',
      'const { DECLARED_DOMAIN_COUNTS, expandDeclaredPaths } = globalThis.Re0Shard;',
      'const { CHARACTER_REGISTRY, resolveSpeaker } = globalThis.Re0Shard;',
    ].join('\n'),
    ['SHARD_IDS', 'resolvePersonPortrait', 'buildShardModel'],
  ));
  parts.push(wrapper('shard-runtime', sources.runtime, '', ['createShardRuntime', 'discoverShardRuntimeScope']));
  parts.push(wrapper('orb-drag', sources.orb, '', ['DRAG_THRESHOLD', 'normalizeOrbPosition', 'createOrbDragController']));
  parts.push(wrapper(
    'shard-ui',
    sources.ui,
    [
      'const { asText, clampMeter } = globalThis.Re0Shard;',
      'const { portraitKeys, resolvePortrait } = globalThis.Re0Shard;',
      'const { isSafeAssetUrl, resolvePortraitAsset } = globalThis.Re0Shard;',
    ].join('\n'),
    ['createShardSurface', 'renderShardSurface', 'setSurfaceOpen', 'setSurfaceDragging', 'updateSurfacePortrait', 'TONES'],
  ));
  parts.push(wrapper(
    'host-shell',
    sources.host,
    [
      'const { buildShardModel } = globalThis.Re0Shard;',
      'const { resolveShardAsset } = globalThis.Re0Shard;',
      'const { createPortraitRepository, cropPortrait, portraitKeys, resolvePortrait, validatePortraitUrl } = globalThis.Re0Shard;',
      'const { createShardRuntime, discoverShardRuntimeScope } = globalThis.Re0Shard;',
      'const { createOrbDragController } = globalThis.Re0Shard;',
      'const { createShardSurface, renderShardSurface, setSurfaceDragging, setSurfaceOpen } = globalThis.Re0Shard;',
    ].join('\n'),
    ['startShardStatusBar', 'hostWindow', 'hostDocument', 'SINGLETON_KEY'],
  ));
  const cssLiteral = serialize(css);
  parts.push(`(() => {\n'use strict';\nconst cssText = ${cssLiteral};\nconst scope = globalThis;\nconst assetBase = globalThis.Re0ShardAssetBase || '';\nconst start = globalThis.Re0Shard.startShardStatusBar;\nif (typeof start === 'function') start({ scope, cssText, assetBase });\n})();`);
  return parts.join('\n\n');
}

export function buildArtifact() {
  return {
    type: 'script',
    enabled: true,
    name: 'Re:0·星屑碎片状态栏',
    id: SCRIPT_ID,
    content: buildBundle(),
    info: '宿主层悬浮球 + 可点击碎片状态栏；只读读取当前消息楼层 stat_data。',
    button: { enabled: true, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  };
}

export function buildSerializedArtifact() {
  return `${JSON.stringify(buildArtifact(), null, 2)}\n`;
}

function run() {
  const serialized = buildSerializedArtifact();
  if (process.argv.includes('--check')) {
    if (!existsSync(OUTPUT)) throw new Error(`产物不存在：${OUTPUT}`);
    if (readFileSync(OUTPUT, 'utf8') !== serialized) throw new Error(`产物不是当前源码生成：${OUTPUT}`);
    console.log(`shard-statusbar package is current: ${OUTPUT}`);
    return;
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, serialized, 'utf8');
  console.log(`shard-statusbar package written: ${OUTPUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
