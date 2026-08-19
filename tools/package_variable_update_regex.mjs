import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOL_DIR, '..');
const ASSET_TOKEN = '__RE0_FATE_LEDGER_SEAL__';
const MANIFEST_PATH = resolve(ROOT, 'variable-update/assets/manifest.json');
const SOURCE_PATHS = Object.freeze({
  pending: resolve(ROOT, 'variable-update/pending.html'),
  complete: resolve(ROOT, 'variable-update/complete.html'),
  css: resolve(ROOT, 'variable-update/styles.css'),
});

export const PENDING_FIND_REGEX = String.raw`/<UpdateVariable>(?![\s\S]*<\/UpdateVariable>)[\s\S]*$/g`;
export const COMPLETE_FIND_REGEX = String.raw`/<UpdateVariable>\s*<(?:[Aa]nalysis|[Aa]nalyze)>\s*((?:(?!<|\x60{3}|~{3})[\s\S])*?)\s*<\/(?:[Aa]nalysis|[Aa]nalyze)>\s*<JSONPatch>\s*(\[(?:(?!<|\x60{3}|~{3})[\s\S])*?\])\s*<\/JSONPatch>\s*<\/UpdateVariable>/g`;

export const OUTPUTS = Object.freeze({
  pending: resolve(ROOT, 'dist/regex-Re0·变量更新中.json'),
  complete: resolve(ROOT, 'dist/regex-Re0·完整变量更新.json'),
});

const ARTIFACT_CONFIG = Object.freeze({
  pending: Object.freeze({
    id: 'b3382080-9fb0-4c94-a16c-14d4fa7e8b67',
    placement: Object.freeze([2]),
    scriptName: '[美化]Re:Zero·变量更新中',
  }),
  complete: Object.freeze({
    id: '4f84f2b6-57e9-45a9-9b51-1ed99c6c53ce',
    placement: Object.freeze([1, 2]),
    scriptName: '[美化]Re:Zero·完整变量更新',
  }),
});

function read(path) {
  return readFileSync(path, 'utf8')
    .replace(/^\uFEFF/u, '')
    .replaceAll('\r\n', '\n');
}

export function validateAssetManifest(manifest) {
  const releaseUrl = manifest?.asset?.releaseUrl;
  const revision = manifest?.releaseRevision;
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/u.test(revision)) {
    throw new Error('asset releaseRevision must be exactly 40 lowercase hexadecimal characters');
  }
  const expectedUrl = `https://cdn.jsdelivr.net/gh/1798547983tt/re0@${revision}/variable-update/assets/fate-ledger-seal.webp`;
  if (releaseUrl !== expectedUrl) throw new Error('asset release URL must match the pinned jsDelivr path');
  return { releaseUrl };
}

function readManifest() {
  return validateAssetManifest(JSON.parse(read(MANIFEST_PATH)));
}

export function assertSafeProductionSource(fragment, css) {
  const source = `${fragment}\n${css}`;
  if (/<script\b|(?:[\s/<])on[a-z][\w:-]*\s*=|javascript\s*:/iu.test(source)) {
    throw new Error('production source must remain script-free');
  }
  const externalUrl = /https?:\/\/|\/\/[^\s"'<>),;]+/iu;
  if (/@import\b|@font-face\b/iu.test(source) || externalUrl.test(source)) {
    throw new Error('production source must not load external code or fonts');
  }
  if (css.toLowerCase().includes('</style')) {
    throw new Error('CSS must not contain a closing style tag');
  }
}

function buildReplacement(fragment, css, releaseUrl) {
  assertSafeProductionSource(fragment, css);
  if (!css.includes(ASSET_TOKEN)) throw new Error('CSS asset token must exist');
  const resolvedCss = css.replaceAll(ASSET_TOKEN, releaseUrl);
  if (resolvedCss.includes(ASSET_TOKEN)) throw new Error('CSS asset token must be fully replaced');
  return `${fragment.trim()}\n<style>\n${resolvedCss.trim()}\n</style>`;
}

function buildArtifact({ findRegex, fragment, css, releaseUrl, config }) {
  return {
    disabled: false,
    findRegex,
    id: config.id,
    markdownOnly: true,
    maxDepth: null,
    minDepth: null,
    placement: [...config.placement],
    promptOnly: false,
    replaceString: buildReplacement(fragment, css, releaseUrl),
    runOnEdit: false,
    scriptName: config.scriptName,
    substituteRegex: 0,
    trimStrings: [],
  };
}

export function buildArtifacts() {
  const css = read(SOURCE_PATHS.css);
  const { releaseUrl } = readManifest();
  return {
    pending: buildArtifact({
      findRegex: PENDING_FIND_REGEX,
      fragment: read(SOURCE_PATHS.pending),
      css,
      releaseUrl,
      config: ARTIFACT_CONFIG.pending,
    }),
    complete: buildArtifact({
      findRegex: COMPLETE_FIND_REGEX,
      fragment: read(SOURCE_PATHS.complete),
      css,
      releaseUrl,
      config: ARTIFACT_CONFIG.complete,
    }),
  };
}

export function serializeArtifacts() {
  const artifacts = buildArtifacts();
  return {
    pending: `${JSON.stringify(artifacts.pending, null, 2)}\n`,
    complete: `${JSON.stringify(artifacts.complete, null, 2)}\n`,
  };
}

function parseRegexLiteral(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new Error('findRegex must use /pattern/flags form');
  const delimiter = value.lastIndexOf('/');
  if (delimiter === 0) throw new Error('findRegex must include a closing delimiter');
  return new RegExp(value.slice(1, delimiter), value.slice(delimiter + 1));
}

export function simulateReplacement(original, artifact) {
  return String(original).replace(parseRegexLiteral(artifact.findRegex), artifact.replaceString);
}

function writeArtifacts() {
  const serialized = serializeArtifacts();
  mkdirSync(dirname(OUTPUTS.pending), { recursive: true });
  for (const state of ['pending', 'complete']) {
    writeFileSync(OUTPUTS[state], serialized[state], 'utf8');
    console.log(`variable-update regex package written: ${OUTPUTS[state]}`);
  }
}

function checkArtifacts() {
  const serialized = serializeArtifacts();
  for (const state of ['pending', 'complete']) {
    if (!existsSync(OUTPUTS[state])) throw new Error(`artifact does not exist: ${OUTPUTS[state]}`);
    if (readFileSync(OUTPUTS[state], 'utf8') !== serialized[state]) {
      throw new Error(`artifact is not current: ${OUTPUTS[state]}`);
    }
    console.log(`variable-update regex package is current: ${OUTPUTS[state]}`);
  }
}

function runCli() {
  if (process.argv.includes('--check')) checkArtifacts();
  else writeArtifacts();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
