import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getThemeButtonState,
  renderNarrative,
  resolveDialogueSide,
} from '../narrative/src/render.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('narrative surface exposes one namespaced mount, overlay, logo slot and accessible theme controls', () => {
  const html = read('narrative/index.html');
  assert.equal(typeof renderNarrative, 'function');
  assert.equal((html.match(/data-re0-narrative-mount/g) || []).length, 1);
  assert.match(html, /id="re0-narrative-app"/);
  assert.match(html, /id="re0-narrative-overlay-root"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-logo-slot/);
  for (const action of ['theme-auto', 'theme-day', 'theme-night', 'theme-beige']) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
  assert.match(html, /aria-label="自动主题"/);
  assert.match(html, /aria-label="日间主题"/);
  assert.match(html, /aria-label="夜间主题"/);
  assert.match(html, /aria-label="羊皮纸主题"/);
  assert.match(html, /<script type="module" src="\.\/src\/render\.mjs"><\/script>/);
});

test('theme button helper marks aria-pressed for auto and manual states', () => {
  assert.equal(getThemeButtonState('theme-auto', { preference: 'auto', themeName: 'night' }).ariaPressed, 'true');
  assert.equal(getThemeButtonState('theme-night', { preference: 'auto', themeName: 'night' }).ariaPressed, 'false');
  assert.equal(getThemeButtonState('theme-beige', { preference: 'beige', themeName: 'beige' }).ariaPressed, 'true');
  assert.equal(getThemeButtonState('theme-day', { preference: 'day', themeName: 'day' }).ariaPressed, 'true');
});

test('dialogue side uses exact structured playerName only and never prose inference', () => {
  assert.equal(resolveDialogueSide({ speakerName: '菜月昴', text: '对白' }, { playerName: '菜月昴' }), 'player');
  assert.equal(resolveDialogueSide({ speakerName: '菜月·昴', text: '对白' }, { playerName: '菜月昴' }), 'npc');
  assert.equal(resolveDialogueSide({ text: '菜月昴在旁白里出现' }, { playerName: '菜月昴' }), 'npc');
  assert.equal(resolveDialogueSide({ speakerName: '艾尔莎', text: '对白' }, { playerName: '菜月昴' }), 'npc');
});

test('renderer source uses safe DOM construction and no executable HTML sinks', () => {
  const render = read('narrative/src/render.mjs');
  assert.match(render, /createElement/);
  assert.match(render, /textContent/);
  assert.match(render, /createDocumentFragment/);
  assert.match(render, /dataset\.action|setAttribute\('data-action'/);
  assert.match(render, /data-re0-theme-bound|AbortController/);
  assert.match(render, /aria-pressed/);
  assert.match(render, /resolveDialogueSide/);
  assert.match(render, /dataset\.side|setAttribute\('data-side'/);
  assert.match(render, /dataset\.role|setAttribute\('data-role'/);
  assert.match(render, /dataset\.accent|setAttribute\('data-accent'/);
  assert.match(render, /dataset\.code|setAttribute\('data-code'/);
  assert.match(render, /style\.setProperty\('--re0-bubble-accent'/);
  assert.match(render, /style\.setProperty\('--re0-bubble-motif'/);
  assert.match(render, /renderDialogue/);
  assert.match(render, /renderScene/);
  assert.match(render, /renderAbility/);
  assert.match(render, /renderCheck/);
  assert.match(render, /renderRestart/);
  assert.match(render, /renderFallback/);
  assert.doesNotMatch(render, /\.innerHTML\s*=/);
  assert.doesNotMatch(render, /insertAdjacentHTML/);
  assert.doesNotMatch(render, /\beval\s*\(/);
  assert.doesNotMatch(render, /new Function/);
  assert.doesNotMatch(render, /\son[a-z]+\s*=/i);
});

test('protocol and renderer never rely on HTML execution or inline handlers', () => {
  for (const path of ['narrative/src/protocol.mjs', 'narrative/src/character-registry.mjs', 'narrative/src/theme-core.mjs', 'narrative/index.html']) {
    const source = read(path);
    assert.doesNotMatch(source, /\.innerHTML\s*=/, `${path} has innerHTML assignment`);
    assert.doesNotMatch(source, /insertAdjacentHTML/, `${path} has insertAdjacentHTML`);
    assert.doesNotMatch(source, /\beval\s*\(/, `${path} has eval`);
    assert.doesNotMatch(source, /new Function/, `${path} has Function constructor`);
    assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${path} has inline event handler`);
  }
});

test('CSS is scoped, responsive to 320px, and honors reduced motion', () => {
  const css = read('narrative/styles.css');
  assert.match(css, /\[data-re0-narrative-mount\]/);
  assert.match(css, /#re0-narrative-overlay-root/);
  assert.match(
    css,
    /#re0-narrative-overlay-root\[hidden\]\s*\{[^}]*display:\s*none/,
    'the hidden detail overlay must not intercept theme controls',
  );
  assert.match(css, /--re0-card-wash:/, 'each theme needs a readable background wash');
  assert.match(
    css,
    /\.re0-narrative-card\s*\{[^}]*var\(--re0-card-wash\)/s,
    'the card must use the active theme wash',
  );
  for (const theme of ['night', 'beige']) {
    assert.match(
      css,
      new RegExp(`#re0-narrative-app\\[data-theme="${theme}"\\] \\.re0-title-plate\\s*\\{[^}]*var\\(--re0-title-plate-image\\)`, 's'),
      `${theme} must retain its generated title plate`,
    );
  }
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container[^\{]*\(max-width:\s*420px\)/);
  assert.match(css, /@container[^\{]*\(max-width:\s*340px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-theme="day"/);
  assert.match(css, /data-theme="night"/);
  assert.match(css, /data-theme="beige"/);
  assert.match(css, /min-(?:inline-)?size:\s*44px|min-height:\s*44px/);
  assert.match(css, /\.re0-narrative-card/);
  assert.match(css, /\.re0-title-plate/);
  assert.match(css, /\.re0-dialogue/);
  for (const role of ['witch', 'archbishop', 'knight', 'maid', 'spirit', 'merchant', 'returner', 'assassin', 'warrior', 'healer', 'lord', 'guardian', 'attendant', 'generic']) {
    assert.match(css, new RegExp(`data-role="${role}"`), `missing CSS for role ${role}`);
  }
  assert.match(css, /--re0-bubble-accent/);
  assert.match(css, /--re0-bubble-motif/);
  assert.match(css, /--re0-avatar-accent/);
  assert.doesNotMatch(css, /^body\s*\{/m);
  assert.doesNotMatch(css, /^html\s*\{/m);
  assert.doesNotMatch(css, /(^|[\s,{])\.card\b/);
});

test('maintained output-format rules describe the exact model protocol and safety boundaries', () => {
  const rules = read('narrative/rules/正文输出格式.md');
  for (const phrase of [
    '<content><story>',
    '<time>',
    '<now_plot>',
    '第XX卷 | 标题',
    '魔女历YYYY年MM月DD日',
    '{规范显示名}「对白」',
    '<scene location=',
    '<ability user=',
    '<check type=',
    '<restart deathId=',
    '行动叙述 → <check> → 结果叙述',
    '<UpdateVariable>',
  ]) {
    assert.match(rules, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(rules, /不得嵌套/);
  assert.match(rules, /不得输出\s*&lt;script&gt;|不要输出\s*&lt;script&gt;/);
  assert.doesNotMatch(rules, /<script[\s>]/i);
});
