import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXPECTED_ASSET_COUNT,
  auditManifest,
  refreshManifestData,
} from '../tools/package_narrative_regex.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const manifestPath = resolve(ROOT, 'narrative/assets/manifest.json');
const registry = JSON.parse(readFileSync(resolve(ROOT, 'narrative/data/character-registry.json'), 'utf8'));

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

test('asset manifest lists logo, title plates, backgrounds, and 44 dedicated avatars', () => {
  const manifest = readManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.assets.length, EXPECTED_ASSET_COUNT);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'logo').length, 1);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'titlePlate').length, 3);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'background').length, 3);
  assert.equal(manifest.assets.filter((asset) => asset.kind === 'avatar').length, 44);

  const avatarKeys = new Set(manifest.assets.filter((asset) => asset.kind === 'avatar').map((asset) => asset.portraitKey));
  assert.deepEqual(avatarKeys, new Set(registry.map((entry) => entry.portraitKey)));
});

test('manifest entries expose honest metadata fields and never fabricate missing binaries', () => {
  const manifest = readManifest();
  const refreshed = refreshManifestData({ write: false });
  assert.equal(refreshed.assets.length, manifest.assets.length);

  for (const asset of manifest.assets) {
    for (const field of ['id', 'kind', 'localPath', 'releaseUrl', 'mime', 'dimensions', 'sha256', 'prompt', 'sourceRole', 'reference']) {
      assert.ok(Object.hasOwn(asset, field), `${asset.id} missing ${field}`);
    }
    assert.match(asset.localPath, /^\.\/assets\//);
    assert.equal(asset.releaseUrl, '');
    assert.doesNotMatch(JSON.stringify(asset), /api[_-]?key|token|secret|password|<content>|UpdateVariable/i);

    const onDisk = existsSync(resolve(ROOT, 'narrative', asset.localPath.slice(2)));
    if (onDisk) {
      assert.match(asset.mime, /^image\/(png|webp)$/);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isInteger(asset.dimensions.width) && asset.dimensions.width > 0);
      assert.ok(Number.isInteger(asset.dimensions.height) && asset.dimensions.height > 0);
    } else {
      assert.equal(asset.mime, null);
      assert.equal(asset.dimensions, null);
      assert.equal(asset.sha256, null);
    }
  }
});

test('asset audit clearly reports the currently missing avatar binaries', () => {
  const manifest = readManifest();
  const audit = auditManifest(manifest);
  const expectedMissing = manifest.assets.filter((asset) => !existsSync(resolve(ROOT, 'narrative', asset.localPath.slice(2))));
  assert.equal(audit.total, EXPECTED_ASSET_COUNT);
  assert.equal(audit.missing.length, expectedMissing.length);
  assert.ok(audit.missing.every((asset) => asset.kind === 'avatar'));
  assert.equal(audit.ready, expectedMissing.length === 0);
});

test('manifest refresh is deterministic and leaves check mode non-writing', () => {
  const before = readFileSync(manifestPath, 'utf8');
  const refreshed = refreshManifestData({ write: false });
  const after = readFileSync(manifestPath, 'utf8');
  assert.equal(after, before);
  assert.equal(refreshed.assets.length, EXPECTED_ASSET_COUNT);
  const expectedMissing = refreshed.assets.filter((asset) => !existsSync(resolve(ROOT, 'narrative', asset.localPath.slice(2))));
  assert.equal(auditManifest(refreshed).missing.length, expectedMissing.length);
});

test('renderer and CSS include asset resolver hooks plus graceful fallbacks', () => {
  const render = readFileSync(resolve(ROOT, 'narrative/src/render.mjs'), 'utf8');
  const css = readFileSync(resolve(ROOT, 'narrative/styles.css'), 'utf8');
  const html = readFileSync(resolve(ROOT, 'narrative/index.html'), 'utf8');
  assert.match(render, /resolveNarrativeAsset/);
  assert.match(render, /applyNarrativeAssets/);
  assert.match(render, /onerror/);
  assert.match(render, /data-asset-fallback/);
  assert.match(css, /--re0-background-image/);
  assert.match(css, /--re0-title-plate-image/);
  assert.match(css, /--re0-logo-image/);
  assert.match(css, /data-asset-fallback/);
  assert.match(html, /data-asset-manifest-url="\.\/assets\/manifest\.json"/);
});
