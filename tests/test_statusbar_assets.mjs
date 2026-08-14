import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ASSET_MANIFEST, assetUrl } from '../statusbar/src/assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET_NAMES = [
  'day-archive-wide.webp',
  'day-archive-mobile.webp',
  'night-tea-wide.webp',
  'night-tea-mobile.webp',
];

function webpDimensions(buffer) {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WEBP');
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

test('four generated status-bar scenes are valid purpose-shaped WebP images', () => {
  for (const name of ASSET_NAMES) {
    const path = resolve(ROOT, 'statusbar/assets', name);
    const bytes = readFileSync(path);
    assert.ok(bytes.length > 50_000, `${name} is unexpectedly small`);
    const { width, height } = webpDimensions(bytes);
    if (name.includes('wide')) {
      assert.ok(width / height >= 2.8, `${name} must be a wide HUD scene`);
    } else {
      assert.ok(height / width >= 1.2, `${name} must be recomposed for narrow screens`);
    }
  }
});

test('asset manifest pins GitHub production URLs and keeps explicit local fallbacks', () => {
  const revision = ASSET_MANIFEST.revision;
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(ASSET_MANIFEST.assets).sort(), [...ASSET_NAMES].sort());
  for (const [name, entry] of Object.entries(ASSET_MANIFEST.assets)) {
    assert.equal(entry.local, `./assets/${name}`);
    assert.equal(
      entry.production,
      `https://raw.githubusercontent.com/1798547983tt/re0/${revision}/statusbar/assets/${name}`,
    );
  }
  assert.equal(assetUrl('day-archive-wide.webp', { search: '?assets=local' }), './assets/day-archive-wide.webp');
  assert.equal(assetUrl('day-archive-wide.webp', { search: '' }), ASSET_MANIFEST.assets['day-archive-wide.webp'].production);
  assert.throws(() => assetUrl('missing.webp', { search: '' }), /未知状态栏素材/);
});
