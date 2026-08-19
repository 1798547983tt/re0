import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  READING_FONTS,
  READING_SIZES,
  normalizeReadingSettings,
  readReadingSettings,
  writeReadingSettings,
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

const ROOT = resolve(import.meta.dirname, '..');

test('reading settings expose three layouts, four fonts, four sizes, indentation and static mode', () => {
  assert.deepEqual(READING_FONTS.map((item) => item.id), ['serif', 'sans', 'wenkai', 'xiaowei']);
  assert.deepEqual(READING_SIZES.map((item) => item.px), [15, 17, 19, 22]);
  assert.deepEqual(normalizeReadingSettings({
    theme: 'tea',
    font: 'wenkai',
    size: 'large',
    indent: true,
    staticMode: true,
  }), {
    theme: 'tea',
    font: 'wenkai',
    size: 'large',
    indent: true,
    staticMode: true,
  });
  assert.deepEqual(normalizeReadingSettings({ theme: 'purple', font: 'comic', size: '99' }), {
    theme: 'auto',
    font: 'serif',
    size: 'medium',
    indent: false,
    staticMode: false,
  });
});

test('indentation preference persists through the reading settings store', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const written = writeReadingSettings({ indent: true }, storage);
  assert.equal(written.indent, true);
  assert.equal(readReadingSettings(storage).indent, true);
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

test('all 45 named characters have a unique visual identity and aliases resolve safely', () => {
  assert.equal(CHARACTER_REGISTRY.length, 45);
  assert.equal(new Set(CHARACTER_REGISTRY.map((item) => item.skinId)).size, 45);
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
  assert.equal(resolveCharacter('爱蜜莉雅').stableId, 'emilia');
  assert.equal(resolveCharacter('艾米莉亚').stableId, 'emilia');
  const fallback = resolveCharacter('路人骑士');
  assert.equal(fallback.kind, 'generic');
  assert.equal(fallback.initial, '路');
});

test('Emilia uses the supplied pinned portrait and a unique silver-violet identity', () => {
  const emilia = resolveCharacter('爱蜜莉雅');
  assert.equal(emilia.rosterName, '爱蜜莉雅');
  assert.equal(emilia.symbol, '❅');
  assert.equal(emilia.shape, 'crystal-flower');
  assert.match(emilia.primary, /^#[0-9a-f]{6}$/i);
  assert.match(emilia.avatar.primaryUrl, /fe81357cba2b5df6d1ada34bb9e825c755202c67\/avatars\/%E7%88%B1%E8%9C%9C%E8%8E%89%E9%9B%85\.png$/);
  const portrait = resolve(ROOT, 'narrative/assets/avatars/emilia.webp');
  assert.equal(existsSync(portrait), true);
  const bytes = readFileSync(portrait);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
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

test('a canonical story heading resolves the matching beautified volume title', () => {
  const resolved = resolveVolumeTitle('第20卷｜月下狂想曲');

  assert.equal(resolved.volume, '20');
  assert.equal(resolved.title, '月下狂想曲');
  assert.equal(resolved.heading, '第20卷｜月下狂想曲');
});

test('seven ability categories retain distinct effect identities and unknown kinds fail closed', () => {
  assert.deepEqual(ABILITY_KINDS.map((item) => item.kind), [
    '一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技',
  ]);
  assert.equal(new Set(ABILITY_KINDS.map((item) => item.effect)).size, 7);
  assert.equal(resolveAbilityKind('魔法').effect, 'arcane-orbit');
  assert.equal(resolveAbilityKind('未知').valid, false);
});
