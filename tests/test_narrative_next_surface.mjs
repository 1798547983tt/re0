import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseNarrative } from '../narrative-next/src/protocol.mjs';
import {
  dialogueSide,
  mergeAdjacentDialogue,
  renderNarrative,
} from '../narrative-next/src/renderer.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('dialogue presentation keeps NPC left and the structured player slot right', () => {
  assert.equal(dialogueSide({ type: 'dialogue', speaker: '蕾姆' }), 'npc');
  assert.equal(dialogueSide({ type: 'player-dialogue', speaker: '#' }), 'player');
});

test('only adjacent identical dialogue speakers merge', () => {
  const merged = mergeAdjacentDialogue([
    { type: 'dialogue', speaker: '蕾姆', text: '第一句。' },
    { type: 'dialogue', speaker: '雷姆', text: '第二句。' },
    { type: 'narration', text: '旁白。' },
    { type: 'dialogue', speaker: '蕾姆', text: '第三句。' },
    { type: 'player-dialogue', speaker: '#', text: '回答。' },
  ]);
  assert.deepEqual(merged.map((item) => item.type), [
    'dialogue', 'narration', 'dialogue', 'player-dialogue',
  ]);
  assert.equal(merged[0].text, '第一句。\n第二句。');
  assert.equal(merged[2].text, '第三句。');
});

test('showcase fixture parses all seven ability categories', () => {
  const parsed = parseNarrative(read('narrative-next/fixtures/showcase.xml'));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.blocks.filter((block) => block.type === 'ability').map((block) => block.kind), [
    '一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技',
  ]);
});

test('preview surface has one reader mount, inert source and development selectors', () => {
  const html = read('narrative-next/index.html');
  assert.equal((html.match(/data-re0v2-mount/g) || []).length, 1);
  assert.match(html, /id="re0v2-app"/);
  assert.match(html, /id="re0v2-source"/);
  assert.match(html, /data-preview-volume/);
  assert.match(html, /data-preview-character/);
  assert.match(html, /src="\.\/src\/preview\.mjs"/);
});

test('renderer constructs inert DOM and exposes settings, title, bubbles and open ability descriptions', () => {
  const source = read('narrative-next/src/renderer.mjs');
  assert.equal(typeof renderNarrative, 'function');
  assert.match(source, /createElement/);
  assert.match(source, /textContent/);
  assert.match(source, /replaceChildren/);
  assert.match(source, /splitEmphasizedName/);
  assert.match(source, /resolveCharacter/);
  assert.match(source, /resolveVolumeTitle\(parsed\.story\?\.heading\)/);
  assert.match(source, /details\.open\s*=\s*true/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /--re0v2-character-primary/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new Function/);
});

test('avatars open one local editor with file, HTTPS URL, reset and accessible dialog controls', () => {
  const source = read('narrative-next/src/renderer.mjs');
  const css = read('narrative-next/styles.css');
  assert.match(source, /data\.action\s*=\s*'edit-avatar'|button\([^)]*'edit-avatar'/);
  assert.doesNotMatch(source, /re0v2-avatar__edit|['"]✎['"]/);
  assert.doesNotMatch(css, /\.re0v2-avatar__edit/);
  assert.match(source, /type\s*=\s*'file'/);
  assert.match(source, /accept\s*=\s*['"]image\/png,image\/jpeg,image\/webp,image\/gif,image\/avif['"]/);
  assert.match(source, /type\s*=\s*'url'/);
  assert.match(source, /save-avatar-url/);
  assert.match(source, /save-avatar-file/);
  assert.match(source, /reset-avatar/);
  assert.match(source, /aria-modal/);
  assert.match(source, /avatarFileToDataUrl/);
  assert.match(source, /writeAvatarOverride/);
  assert.match(css, /\.re0v2-avatar-editor\s*\{/);
  assert.match(css, /\.re0v2-avatar-editor__panel\s*\{/);
});

test('styles contain the three themes, four font modes, four sizes and motion shutdown', () => {
  const css = read('narrative-next/styles.css');
  for (const theme of ['day', 'night', 'tea']) assert.match(css, new RegExp(`data-theme="${theme}"`));
  for (const font of ['serif', 'sans', 'wenkai', 'xiaowei']) assert.match(css, new RegExp(`data-font="${font}"`));
  for (const size of ['small', 'medium', 'large', 'xlarge']) assert.match(css, new RegExp(`data-size="${size}"`));
  assert.match(css, /data-static="true"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@container[^\{]*max-width:\s*420px/);
});

test('styles implement seven title families and seven distinct ability effects', () => {
  const css = read('narrative-next/styles.css');
  for (const family of ['single-focus', 'spotlight', 'rhythm', 'duet', 'redaction', 'calamity', 'departure']) {
    assert.match(css, new RegExp(`data-family="${family}"`));
  }
  for (const effect of ['steel-scan', 'broken-ring', 'blessing-halo', 'arcane-orbit', 'spirit-motes', 'bloodline-pulse', 'martial-slash']) {
    assert.match(css, new RegExp(`data-effect="${effect}"`));
  }
});

test('preview toolbar uses border-box sizing so mobile padding cannot cause horizontal overflow', () => {
  const css = read('narrative-next/styles.css');
  assert.match(css, /\.re0v2-preview-tools\s*\{[^}]*box-sizing:\s*border-box/s);
});
