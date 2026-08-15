import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderNarrative } from '../narrative/src/render.mjs';

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

test('renderer source uses safe DOM construction and no executable HTML sinks', () => {
  const render = read('narrative/src/render.mjs');
  assert.match(render, /createElement/);
  assert.match(render, /textContent/);
  assert.match(render, /createDocumentFragment/);
  assert.match(render, /dataset\.action|setAttribute\('data-action'/);
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
