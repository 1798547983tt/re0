import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGER_PATH = resolve(ROOT, 'tools/package_variable_update_regex.mjs');
const MANIFEST_PATH = resolve(ROOT, 'variable-update/assets/manifest.json');
const EXPECTED_OUTPUTS = Object.freeze({
  pending: resolve(ROOT, 'dist/regex-Re0·变量更新中.json'),
  complete: resolve(ROOT, 'dist/regex-Re0·完整变量更新.json'),
});
const EXPECTED_FIELDS = [
  'disabled',
  'findRegex',
  'id',
  'markdownOnly',
  'maxDepth',
  'minDepth',
  'placement',
  'promptOnly',
  'replaceString',
  'runOnEdit',
  'scriptName',
  'substituteRegex',
  'trimStrings',
];
const PENDING = String.raw`/<UpdateVariable>(?![\s\S]*<\/UpdateVariable>)[\s\S]*$/g`;
const COMPLETE = String.raw`/<UpdateVariable>\s*<(?:[Aa]nalysis|[Aa]nalyze)>\s*((?:(?!<|\x60{3}|~{3})[\s\S])*?)\s*<\/(?:[Aa]nalysis|[Aa]nalyze)>\s*<JSONPatch>\s*(\[(?:(?!<|\x60{3}|~{3})[\s\S])*?\])\s*<\/JSONPatch>\s*<\/UpdateVariable>/g`;

assert.ok(existsSync(PACKAGER_PATH), 'package_variable_update_regex.mjs must exist');

const packager = await import('../tools/package_variable_update_regex.mjs');
const {
  PENDING_FIND_REGEX,
  COMPLETE_FIND_REGEX,
  OUTPUTS,
  buildArtifacts,
  serializeArtifacts,
  simulateReplacement,
} = packager;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function snapshot(path) {
  const bytes = readFileSync(path);
  return {
    hash: sha256(bytes),
    mtimeMs: statSync(path).mtimeMs,
  };
}

test('packager exports the complete variable-update package API', () => {
  for (const name of [
    'PENDING_FIND_REGEX',
    'COMPLETE_FIND_REGEX',
    'OUTPUTS',
    'buildArtifacts',
    'serializeArtifacts',
    'simulateReplacement',
  ]) assert.ok(name in packager, `${name} must be exported`);
  assert.equal(typeof buildArtifacts, 'function');
  assert.equal(typeof serializeArtifacts, 'function');
  assert.equal(typeof simulateReplacement, 'function');
});

test('findRegex constants remain byte-for-byte identical to the reference matchers', () => {
  assert.equal(PENDING_FIND_REGEX, PENDING);
  assert.equal(PENDING_FIND_REGEX.length, 56);
  assert.equal(sha256(PENDING_FIND_REGEX), '1b598efa5914e3ad62eba4b08c78cc9a664ecd27250eb17de46a549b3af31729');

  assert.equal(COMPLETE_FIND_REGEX, COMPLETE);
  assert.equal(COMPLETE_FIND_REGEX.length, 208);
  assert.equal(sha256(COMPLETE_FIND_REGEX), '54b5c28cd55eab43892a6173ce5cfe26b425ea3a5c3fa03d77e0f1a570c678d7');
});

test('both artifacts expose exactly the SillyTavern 13-field display contract', () => {
  const { pending, complete } = buildArtifacts();
  for (const artifact of [pending, complete]) {
    assert.deepEqual(Object.keys(artifact).sort(), [...EXPECTED_FIELDS].sort());
    assert.equal(artifact.disabled, false);
    assert.equal(artifact.markdownOnly, true);
    assert.equal(artifact.maxDepth, null);
    assert.equal(artifact.minDepth, null);
    assert.equal(artifact.promptOnly, false);
    assert.equal(artifact.runOnEdit, false);
    assert.equal(artifact.substituteRegex, 0);
    assert.deepEqual(artifact.trimStrings, []);
    assert.match(artifact.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.match(artifact.scriptName, /Re:Zero/);
  }
  assert.deepEqual(pending.placement, [2]);
  assert.deepEqual(complete.placement, [1, 2]);
  assert.notEqual(pending.id, complete.id);
  assert.notEqual(pending.scriptName, complete.scriptName);
  assert.match(pending.scriptName, /变量更新中/);
  assert.match(complete.scriptName, /完整变量更新/);
});

test('replacement payloads use only their declared capture tokens and fixed safe asset URL', () => {
  const { pending, complete } = buildArtifacts();
  const releaseUrl = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).asset.releaseUrl;

  for (const artifact of [pending, complete]) {
    assert.ok(artifact.replaceString.includes(releaseUrl));
    assert.doesNotMatch(artifact.replaceString, /<script\b/iu);
    assert.doesNotMatch(artifact.replaceString, /\son[a-z]+\s*=/iu);
    assert.doesNotMatch(artifact.replaceString, /javascript\s*:/iu);
    assert.doesNotMatch(artifact.replaceString, /@import\b/iu);
    assert.doesNotMatch(artifact.replaceString, /@font-face|fonts\.(?:googleapis|gstatic)|\.(?:woff2?|ttf|otf)(?:[?"')])/iu);
  }

  for (const token of ['$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8', '$9', '$&']) {
    assert.equal(occurrences(pending.replaceString, token), 0, `pending must not contain ${token}`);
  }
  assert.equal(occurrences(complete.replaceString, '$1'), 1);
  assert.equal(occurrences(complete.replaceString, '$2'), 1);
  for (const token of ['$3', '$4', '$5', '$6', '$7', '$8', '$9', '$&']) {
    assert.equal(occurrences(complete.replaceString, token), 0, `complete must not contain ${token}`);
  }
});

test('pending replacement consumes the unfinished block without leaking partial model text', () => {
  const { pending } = buildArtifacts();
  const prose = '正文保留。\n';
  const unfinished = '<UpdateVariable>\n<Analysis>半截依据\n<JSONPatch>[{"op":"replace"';
  const rendered = simulateReplacement(`${prose}${unfinished}`, pending);

  assert.ok(rendered.startsWith(prose));
  assert.equal(occurrences(rendered, pending.replaceString), 1);
  assert.doesNotMatch(rendered, /半截依据|JSONPatch|<UpdateVariable>/);
});

test('complete replacement shows analysis and JSON Patch once and removes protocol tags', () => {
  const { complete } = buildArtifacts();
  const analysis = '天气转为雪，记录 /slash 事实。';
  const patch = '[{"op":"replace","path":"/世界/天气","value":"雪"}]';
  const fixture = `<UpdateVariable>\n<Analyze>\n${analysis}\n</Analyze>\n<JSONPatch>\n${patch}\n</JSONPatch>\n</UpdateVariable>`;
  const rendered = simulateReplacement(fixture, complete);

  assert.equal(occurrences(rendered, analysis), 1);
  assert.equal(occurrences(rendered, patch), 1);
  assert.doesNotMatch(rendered, /<\/?(?:UpdateVariable|Analyze|JSONPatch)>/);
});

test('non-matches are preserved and pending never consumes a closed update block', () => {
  const artifacts = buildArtifacts();
  const prose = '普通叙事。\r\n字节与换行都应保持。';
  const closed = '<UpdateVariable><Analysis>依据</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>';

  assert.equal(simulateReplacement(prose, artifacts.pending), prose);
  assert.equal(simulateReplacement(prose, artifacts.complete), prose);
  assert.equal(simulateReplacement(closed, artifacts.pending), closed);
});

test('rebuilding and simulation never mutate either findRegex', () => {
  const first = buildArtifacts();
  simulateReplacement('<UpdateVariable>still streaming', first.pending);
  simulateReplacement('<UpdateVariable><Analysis>x</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>', first.complete);
  const second = buildArtifacts();

  assert.equal(first.pending.findRegex, PENDING);
  assert.equal(first.complete.findRegex, COMPLETE);
  assert.equal(second.pending.findRegex, PENDING);
  assert.equal(second.complete.findRegex, COMPLETE);
});

test('serialization is deterministic pretty JSON with LF endings and matches both outputs', () => {
  assert.deepEqual(OUTPUTS, EXPECTED_OUTPUTS);
  const serialized = serializeArtifacts();
  assert.deepEqual(Object.keys(serialized).sort(), ['complete', 'pending']);

  for (const state of ['pending', 'complete']) {
    const value = serialized[state];
    assert.ok(value.endsWith('\n'));
    assert.doesNotMatch(value, /\r/);
    assert.match(value, /\n  "disabled": false,/);
    assert.equal(value, `${JSON.stringify(JSON.parse(value), null, 2)}\n`);
    assert.equal(readFileSync(OUTPUTS[state], 'utf8'), value);
  }
});

test('--check is read-only and leaves current artifacts byte-for-byte untouched', () => {
  const before = Object.fromEntries(Object.entries(OUTPUTS).map(([state, path]) => [state, snapshot(path)]));
  const result = spawnSync(process.execPath, [PACKAGER_PATH, '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const after = Object.fromEntries(Object.entries(OUTPUTS).map(([state, path]) => [state, snapshot(path)]));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(after, before);
});
