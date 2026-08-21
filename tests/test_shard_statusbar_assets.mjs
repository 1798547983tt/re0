import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveShardAsset, resolvePortraitAsset } from '../shard-statusbar/src/assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('shard asset manifest declares generated local assets and pinned production URLs', () => {
  const manifestPath = resolve(ROOT, 'shard-statusbar/assets/manifest.json');
  assert.equal(existsSync(manifestPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.match(manifest.releaseRevision, /^[a-f0-9]{40}$/);
  const assets = manifest.assets || [];
  assert.ok(assets.some((asset) => asset.id === 'background:night'));
  assert.ok(assets.some((asset) => asset.id === 'orb:sigil'));
  assert.ok(assets.some((asset) => asset.id === 'scene:emilia'));
  assert.ok(assets.some((asset) => asset.id === 'scene:rem'));
  assert.ok(assets.some((asset) => asset.id === 'scene:natsuki-subaru'));
  for (const asset of assets) {
    const path = resolve(ROOT, 'shard-statusbar', asset.localPath);
    assert.equal(existsSync(path), true, asset.localPath);
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(hash, asset.sha256, asset.localPath);
    assert.match(asset.production, /^https:\/\/raw\.githubusercontent\.com\/1798547983tt\/re0\/[a-f0-9]{40}\//);
  }
});

test('asset resolver keeps local previews usable while production stays HTTPS', () => {
  assert.equal(
    resolveShardAsset('orb:sigil', {
      search: '?assets=local',
      base: 'http://127.0.0.1:4178/shard-statusbar/',
    }),
    'http://127.0.0.1:4178/shard-statusbar/assets/orb-sigil-transparent.png',
  );
  assert.match(resolvePortraitAsset('rem'), /^https:\/\/raw\.githubusercontent\.com\/1798547983tt\/re0\/[a-f0-9]{40}\//);
});
