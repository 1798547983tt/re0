import test from 'node:test';
import assert from 'node:assert/strict';
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

  assert.match(manifest.releaseRevision, /^[a-f0-9]{40}$/);
  assert.equal(
    manifest.releaseUrl,
    `https://cdn.jsdelivr.net/gh/1798547983tt/re0@${manifest.releaseRevision}/variable-update/assets/fate-ledger-seal.webp`,
  );
  assert.equal(manifest.localPath, 'assets/fate-ledger-seal.webp');
  assert.equal(manifest.mediaType, 'image/webp');
  assert.equal(manifest.width, 1024);
  assert.equal(manifest.height, 1024);
  assert.equal(manifest.sha256, digest);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');

  for (const phrase of ['破碎钟盘', '闭合世界线', '暗红蜡封', '无文字', '无人物']) {
    assert.match(manifest.description, new RegExp(phrase));
  }
});
