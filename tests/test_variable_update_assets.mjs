import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const assetPath = resolve(ROOT, 'variable-update/assets/fate-ledger-seal.webp');
const manifestPath = resolve(ROOT, 'variable-update/assets/manifest.json');

test('fate-ledger seal and its release manifest satisfy the asset contract', () => {
  assert.ok(existsSync(assetPath), 'fate-ledger-seal.webp must exist');
  assert.ok(existsSync(manifestPath), 'variable-update asset manifest must exist');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bytes = readFileSync(assetPath);
  const digest = createHash('sha256').update(bytes).digest('hex');

  assert.equal(manifest.schemaVersion, 1, 'manifest schemaVersion must be 1');
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ['asset', 'releaseRevision', 'schemaVersion'],
    'manifest top level must contain only schemaVersion, releaseRevision, and asset',
  );
  assert.match(manifest.releaseRevision, /^[a-f0-9]{40}$/);
  assert.ok(manifest.asset && typeof manifest.asset === 'object', 'manifest.asset must contain the asset metadata');

  const asset = manifest.asset;
  assert.deepEqual(
    Object.keys(asset).sort(),
    [
      'description',
      'generatedWith',
      'height',
      'id',
      'localPath',
      'mediaType',
      'releaseUrl',
      'sha256',
      'sourcePromptSummary',
      'width',
    ],
    'manifest.asset must contain the complete asset contract',
  );
  assert.equal(asset.id, 'fate-ledger-seal');
  assert.equal(
    asset.releaseUrl,
    `https://cdn.jsdelivr.net/gh/1798547983tt/re0@${manifest.releaseRevision}/variable-update/assets/fate-ledger-seal.webp`,
  );
  assert.equal(asset.localPath, 'assets/fate-ledger-seal.webp');
  assert.equal(asset.mediaType, 'image/webp');
  assert.equal(asset.width, 1024);
  assert.equal(asset.height, 1024);
  assert.equal(asset.sha256, digest, 'manifest sha256 must match the local WebP bytes');

  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', manifest.releaseRevision, 'HEAD'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(
    ancestry.status,
    0,
    `releaseRevision must be an ancestor of HEAD: ${ancestry.stderr || ancestry.error?.message || 'git returned a non-zero status'}`,
  );

  const releaseBytes = execFileSync(
    'git',
    ['show', `${manifest.releaseRevision}:variable-update/assets/fate-ledger-seal.webp`],
    { cwd: ROOT, encoding: null, maxBuffer: 10 * 1024 * 1024 },
  );
  const releaseDigest = createHash('sha256').update(releaseBytes).digest('hex');
  assert.equal(releaseDigest, digest, 'releaseRevision must pin the same WebP bytes as the local asset');
  assert.equal(releaseDigest, asset.sha256, 'releaseRevision WebP sha256 must match manifest.asset.sha256');

  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8L', 'WebP payload must use the lossless VP8L chunk');
  assert.equal(bytes[20], 0x2f, 'VP8L signature byte must be 0x2f');

  const featureBits = bytes.readUInt32LE(21);
  const actualWidth = (featureBits & 0x3fff) + 1;
  const actualHeight = ((featureBits >>> 14) & 0x3fff) + 1;
  const alphaUsed = (featureBits >>> 28) & 0x01;
  assert.equal(actualWidth, 1024, 'VP8L header width must be 1024');
  assert.equal(actualHeight, 1024, 'VP8L header height must be 1024');
  assert.equal(alphaUsed, 1, 'VP8L alpha-used flag must be set');

  for (const phrase of ['破碎钟盘', '闭合世界线', '暗红蜡封', '无文字', '无人物']) {
    assert.match(asset.description, new RegExp(phrase));
  }
});
