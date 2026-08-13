import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_COMMIT, PINNED_GITHUB_ASSET_BASE, assetUrl } from '../frontend/src/assets.mjs';

test('asset URLs default to the pinned GitHub commit and allow an explicit local mode', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { search: '' } };
  try {
    assert.equal(assetUrl('emilia-blue-tea.png'), `${PINNED_GITHUB_ASSET_BASE}emilia-blue-tea.png`);
    assert.equal(ASSET_COMMIT, 'a6aeb9cca0f0066bd10aec2aba0fd4b220301788');
    globalThis.window.location.search = '?assets=local';
    assert.match(assetUrl('emilia-blue-tea.png'), /[\\/]assets[\\/]emilia-blue-tea\.png$/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
