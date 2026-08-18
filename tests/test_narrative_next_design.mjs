import test from 'node:test';
import assert from 'node:assert/strict';

import {
  READING_FONTS,
  READING_SIZES,
  normalizeReadingSettings,
} from '../narrative-next/src/settings.mjs';
import { resolveTheme } from '../narrative-next/src/theme.mjs';
import {
  CHARACTER_REGISTRY,
  emphasisIndexes,
  resolveCharacter,
} from '../narrative-next/src/characters.mjs';
import {
  TITLE_FAMILIES,
  VOLUME_TITLES,
  resolveVolumeTitle,
} from '../narrative-next/src/titles.mjs';
import {
  ABILITY_KINDS,
  resolveAbilityKind,
} from '../narrative-next/src/abilities.mjs';

test('reading settings expose three layouts, four fonts, four sizes and static mode', () => {
  assert.deepEqual(READING_FONTS.map((item) => item.id), ['serif', 'sans', 'wenkai', 'xiaowei']);
  assert.deepEqual(READING_SIZES.map((item) => item.px), [15, 17, 19, 22]);
  assert.deepEqual(normalizeReadingSettings({
    theme: 'tea',
    font: 'wenkai',
    size: 'large',
    staticMode: true,
  }), {
    theme: 'tea',
    font: 'wenkai',
    size: 'large',
    staticMode: true,
  });
  assert.deepEqual(normalizeReadingSettings({ theme: 'purple', font: 'comic', size: '99' }), {
    theme: 'auto',
    font: 'serif',
    size: 'medium',
    staticMode: false,
  });
});

test('auto theme resolves only to day or night while tea remains manual', () => {
  assert.equal(resolveTheme({ preference: 'auto', period: '下午' }).id, 'day');
  assert.equal(resolveTheme({ preference: 'auto', period: '深夜' }).id, 'night');
  assert.equal(resolveTheme({ preference: 'tea', period: '深夜' }).id, 'tea');
});

test('name emphasis follows the requested first and first-third rule', () => {
  assert.deepEqual(emphasisIndexes('蕾姆'), [0]);
  assert.deepEqual(emphasisIndexes('菜月昴'), [0]);
  assert.deepEqual(emphasisIndexes('艾姬多娜'), [0, 2]);
  assert.deepEqual(emphasisIndexes('莱茵哈鲁特'), [0, 2]);
});

test('all 44 named characters have a unique visual identity and aliases resolve safely', () => {
  assert.equal(CHARACTER_REGISTRY.length, 44);
  assert.equal(new Set(CHARACTER_REGISTRY.map((item) => item.skinId)).size, 44);
  for (const character of CHARACTER_REGISTRY) {
    assert.match(character.primary, /^#[0-9a-f]{6}$/i);
    assert.match(character.secondary, /^#[0-9a-f]{6}$/i);
    assert.ok(character.symbol);
    assert.ok(character.shape);
    assert.ok(character.texture);
    assert.ok(character.avatar.localUrl.endsWith(`${character.portraitKey}.webp`));
  }
  assert.equal(resolveCharacter('雷姆').stableId, 'rem');
  assert.equal(resolveCharacter('碧翠丝').stableId, 'beatrice');
  const fallback = resolveCharacter('路人骑士');
  assert.equal(fallback.kind, 'generic');
  assert.equal(fallback.initial, '路');
});

test('all 39 supplied volume titles resolve through seven kinetic families', () => {
  assert.equal(VOLUME_TITLES.length, 39);
  assert.equal(TITLE_FAMILIES.length, 7);
  assert.equal(new Set(VOLUME_TITLES.map((item) => resolveVolumeTitle(item.volume).family)).size, 7);
  for (const record of VOLUME_TITLES) {
    const resolved = resolveVolumeTitle(record.volume);
    assert.equal(resolved.title, record.title);
    assert.ok(resolved.characters.length > 0);
    assert.ok(resolved.accentIndexes.length >= 1);
  }
  assert.equal(resolveVolumeTitle('01').family, 'single-focus');
  assert.equal(resolveVolumeTitle('20').family, 'duet');
  assert.equal(resolveVolumeTitle('39').family, 'departure');
});

test('seven ability categories retain distinct effect identities and unknown kinds fail closed', () => {
  assert.deepEqual(ABILITY_KINDS.map((item) => item.kind), [
    '一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技',
  ]);
  assert.equal(new Set(ABILITY_KINDS.map((item) => item.effect)).size, 7);
  assert.equal(resolveAbilityKind('魔法').effect, 'arcane-orbit');
  assert.equal(resolveAbilityKind('未知').valid, false);
});
