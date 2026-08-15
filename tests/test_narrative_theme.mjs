import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  NARRATIVE_THEMES,
  resolveBubble,
  resolveTheme,
} from '../narrative/src/theme-core.mjs';
import { resolveSpeaker } from '../narrative/src/character-registry.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const registry = JSON.parse(readFileSync(resolve(ROOT, 'narrative/data/character-registry.json'), 'utf8'));

test('character registry contains exactly 44 stable portrait-backed entries', () => {
  assert.equal(registry.length, 44);
  for (const field of ['stableId', 'displayName', 'referenceFile', 'portraitKey', 'aliases', 'identityTokens', 'bubbleTokens']) {
    assert.ok(registry.every((entry) => Object.hasOwn(entry, field)), `missing ${field}`);
  }
  assert.equal(new Set(registry.map((entry) => entry.stableId)).size, 44);
  assert.equal(new Set(registry.map((entry) => entry.portraitKey)).size, 44);
  assert.equal(new Set(registry.map((entry) => entry.referenceFile)).size, 44);
  for (const entry of registry) {
    assert.ok(entry.aliases.includes(entry.displayName) || entry.aliases.includes(entry.rosterName), `${entry.displayName} must be exact-match addressable`);
    assert.ok(entry.identityTokens.length >= 2, `${entry.displayName} needs role and individual tokens`);
    assert.ok(entry.bubbleTokens.length >= 2, `${entry.displayName} needs bubble code tokens`);
    assert.ok(entry.identityTokens.some((token) => token.startsWith('accent:') && token !== 'accent:generic'), `${entry.displayName} needs an individual accent token`);
    assert.doesNotMatch(entry.aliases.join('|'), /丝琵卡阶段|及其分身|回廊投影/);
  }
  assert.equal(new Set(registry.map((entry) => entry.identityTokens.find((token) => token.startsWith('accent:')))).size, 44);
});

test('required roster names resolve to dedicated portraits and source files', () => {
  const expected = new Map([
    ['阿尔', '阿尔.webp'],
    ['艾尔莎', '艾尔莎.webp'],
    ['艾姬多娜', '艾姬多娜 强欲魔女.webp'],
    ['安娜塔西亚', '安娜塔西亚.webp'],
    ['八重', '八重.webp'],
    ['碧翠丝', '碧翠丝.webp'],
    ['菜月昴', '菜月昴.webp'],
    ['达芙妮', '达芙妮 暴食魔女.webp'],
    ['赫克托尔', '赫克托尔 忧郁魔人.webp'],
    ['卡蜜拉', '卡蜜拉 色欲魔女.webp'],
    ['雷德', '雷德 初代剑圣.webp'],
    ['蕾姆', '蕾姆.webp'],
    ['密涅瓦', '密涅瓦 愤怒魔女.webp'],
    ['潘多拉', '潘多拉 虚饰魔女.webp'],
    ['培提尔其乌斯', '培提尔其乌斯 怠惰大司教.webp'],
    ['塞赫麦特', '塞赫麦特 怠惰魔女.webp'],
    ['莎缇拉', '莎缇拉 嫉妒魔女.webp'],
    ['缇丰', '缇丰 傲慢魔女.webp'],
    ['约书亚', '约书亚webp.webp'],
  ]);
  for (const [alias, referenceFile] of expected) {
    const speaker = resolveSpeaker(alias);
    assert.notEqual(speaker.kind, 'generic', `${alias} should resolve`);
    assert.equal(speaker.referenceFile, referenceFile);
  }
});

test('theme resolver supports day, night and manual-only beige', () => {
  assert.deepEqual(Object.keys(NARRATIVE_THEMES).sort(), ['beige', 'day', 'night']);
  assert.equal(resolveTheme({ preference: 'auto', period: '上午' }).name, 'day');
  assert.equal(resolveTheme({ preference: 'auto', period: '深夜' }).name, 'night');
  assert.equal(resolveTheme({ preference: 'auto', period: '傍晚' }).name, 'night');
  assert.equal(resolveTheme({ preference: 'auto', period: '羊皮纸' }).name, 'day');
  assert.equal(resolveTheme({ preference: 'night', period: '上午' }).name, 'night');
  assert.equal(resolveTheme({ preference: 'beige', period: '深夜' }).name, 'beige');
  assert.equal(resolveTheme({ preference: 'auto', period: '深夜' }).source, 'auto');
  assert.equal(resolveTheme({ preference: 'beige', period: '上午' }).source, 'manual');
});

test('theme token sets carry RE0 archive and witch-residue visual language', () => {
  assert.equal(NARRATIVE_THEMES.day.plate, 'cold-silver-blue-crystal-archive');
  assert.equal(NARRATIVE_THEMES.night.plate, 'obsidian-darkgold-purple-red');
  assert.equal(NARRATIVE_THEMES.beige.plate, 'warm-parchment-red-brown');
  for (const theme of Object.values(NARRATIVE_THEMES)) {
    assert.match(theme.background, /archive|witch|parchment|obsidian/);
    assert.ok(theme.contrast.text.length > 0);
    assert.ok(theme.contrast.surface.length > 0);
  }
});

test('bubble resolver combines theme contrast with identity and code tokens', () => {
  const subaru = resolveBubble(resolveSpeaker('菜月昴'), 'day');
  assert.equal(subaru.portraitKey, 'natsuki-subaru');
  assert.ok(subaru.classNames.includes('bubble-role-returner'));
  assert.ok(subaru.classNames.includes('bubble-accent-subaru'));
  assert.equal(subaru.contrast.text, NARRATIVE_THEMES.day.contrast.text);
  assert.match(subaru.border, /crystal|silver|archive/);
  assert.match(subaru.icon, /return|restart|archive/);
  assert.equal(subaru.role, 'returner');
  assert.equal(subaru.accent, 'subaru');
  assert.ok(subaru.motif.length > 0);
  assert.match(subaru.styleProperties['--re0-bubble-accent'], /^#[0-9a-f]{6}$/i);
  assert.match(subaru.styleProperties['--re0-bubble-motif'], /linear-gradient|radial-gradient|repeating-linear-gradient/);

  const witch = resolveBubble(resolveSpeaker('艾姬多娜'), 'night');
  assert.ok(witch.classNames.includes('bubble-role-witch'));
  assert.match(witch.texture, /witch|residue|obsidian/);
  assert.equal(witch.contrast.text, NARRATIVE_THEMES.night.contrast.text);

  const unknown = resolveBubble(resolveSpeaker('陌生旅人'), 'beige');
  assert.equal(unknown.portraitKey, 'generic');
  assert.ok(unknown.classNames.includes('bubble-role-generic'));
  assert.equal(unknown.initial, '陌');
  assert.equal(unknown.contrast.text, NARRATIVE_THEMES.beige.contrast.text);
});

test('all 44 registry entries produce CSS-consumable role, accent and motif values', () => {
  for (const entry of registry) {
    const bubble = resolveBubble(resolveSpeaker(entry.displayName), 'day');
    assert.notEqual(bubble.role, 'generic', `${entry.displayName} should keep its role`);
    assert.notEqual(bubble.accent, 'generic', `${entry.displayName} should keep its individual accent`);
    assert.match(bubble.classNames.join(' '), new RegExp(`bubble-accent-${bubble.accent}`));
    assert.match(bubble.styleProperties['--re0-bubble-accent'], /^#[0-9a-f]{6}$/i);
    assert.match(bubble.styleProperties['--re0-avatar-accent'], /^#[0-9a-f]{6}$/i);
    assert.ok(bubble.motif && bubble.styleProperties['--re0-bubble-motif']);
  }
});
