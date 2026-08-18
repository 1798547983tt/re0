import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BUILT_IN_PORTRAITS,
  BUILT_IN_TRACKS,
  MEDIA_REVISION,
  builtInPortraitForName,
  mediaAssetUrl,
} from '../statusbar/src/builtin-media.mjs';

const ROOT = resolve(import.meta.dirname, '..');

test('bundled media pins four songs and all 45 character portraits', () => {
  assert.match(MEDIA_REVISION, /^[a-f0-9]{40}$/u);
  assert.equal(BUILT_IN_TRACKS.length, 4);
  assert.equal(BUILT_IN_PORTRAITS.length, 45);
  assert.equal(new Set(BUILT_IN_TRACKS.map((track) => track.id)).size, 4);
  assert.equal(new Set(BUILT_IN_PORTRAITS.map((portrait) => portrait.stableId)).size, 45);

  for (const track of BUILT_IN_TRACKS) {
    assert.equal(existsSync(resolve(ROOT, 'music', track.file)), true, `missing music/${track.file}`);
  }
  for (const portrait of BUILT_IN_PORTRAITS) {
    assert.equal(existsSync(resolve(ROOT, 'avatars', portrait.referenceFile)), true, `missing avatars/${portrait.referenceFile}`);
    assert.ok(portrait.aliases.length > 0, `${portrait.stableId} must expose at least one alias`);
  }
});

test('portrait aliases resolve to the matching bundled artwork', () => {
  assert.equal(builtInPortraitForName('爱蜜莉雅')?.referenceFile, '爱蜜莉雅.png');
  assert.equal(builtInPortraitForName('艾米莉亚')?.referenceFile, '爱蜜莉雅.png');
  assert.equal(builtInPortraitForName('雷姆')?.referenceFile, '蕾姆.webp');
  assert.equal(builtInPortraitForName('贝亚特丽丝')?.referenceFile, '碧翠丝.webp');
  assert.equal(builtInPortraitForName('【剑圣】莱因哈鲁特')?.referenceFile, '莱茵哈鲁特.webp');
  assert.equal(builtInPortraitForName('完全不存在的人物'), null);
});

test('media URLs use local preview paths only when explicitly requested', () => {
  assert.equal(
    mediaAssetUrl('music', 'Memento.mp3', { search: '?assets=local' }),
    '../music/Memento.mp3',
  );
  assert.equal(
    mediaAssetUrl('avatars', '爱蜜莉雅.png', { search: '?assets=local' }),
    '../avatars/%E7%88%B1%E8%9C%9C%E8%8E%89%E9%9B%85.png',
  );
  const production = mediaAssetUrl('music', '好喜欢你.mp3', { search: '' });
  assert.equal(
    production,
    `https://raw.githubusercontent.com/1798547983tt/re0/${MEDIA_REVISION}/music/%E5%A5%BD%E5%96%9C%E6%AC%A2%E4%BD%A0.mp3`,
  );
  assert.throws(() => mediaAssetUrl('scripts', 'x.js'), /媒体目录/u);
});

