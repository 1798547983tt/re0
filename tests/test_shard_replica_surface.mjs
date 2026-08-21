import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('replica UI owns the reference landmarks and removes the previous card surface', () => {
  const ui = read('shard-statusbar/src/ui.mjs');
  const host = read('shard-statusbar/src/host.mjs');
  const css = read('shard-statusbar/styles.css');
  const source = `${ui}\n${host}\n${css}`;
  for (const marker of [
    're0-replica-scene',
    'data-replica-slot',
    'data-replica-detail',
    'back-to-replica',
    'select-replica-nav',
    'select-replica-person',
    'data-replica-uid',
    'data-replica-active',
    're0-replica-left-rail',
    're0-replica-person-rail',
  ]) assert.match(source, new RegExp(marker), marker);
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(ui, /replicaDetailTransform/);
  assert.match(css, /data-detail-shift/);
  assert.match(css, /re0-replica-detail/);
  assert.match(ui, /root\.dataset\.open = 'false'/);
  assert.match(css, /data-open="true"[\s\S]*?\.re0-replica-scene/);
  assert.match(css, /data-open="true"[\s\S]*?pointer-events:\s*auto/);
  assert.match(css, /:not\(\[data-open="true"\]\)[\s\S]*?\.re0-replica-scene/);
  assert.match(host, /event\.key === 'Enter'/);
  assert.match(host, /event\.key === ' '/);
  assert.match(host, /role="button"\]\[tabindex\]/);
  assert.match(host, /resolveCachedPortraitUrl/);
  assert.match(ui, /portraitUrlFor/);
  assert.match(ui, /startsWith\('blob:'\)/);
  assert.match(ui, /re0-replica-avatar__initial/);
  assert.match(css, /@media[^\{]*aspect-ratio|@media[^\{]*max-width/);
  assert.doesNotMatch(source, /re0-shard-panel|re0-shard-hero|re0-shard-stage/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('each fragment and its hit target share a phase-shifted floating motion', () => {
  const ui = read('shard-statusbar/src/ui.mjs');
  const css = read('shard-statusbar/styles.css');
  assert.match(ui, /re0-replica-float/);
  assert.match(ui, /re0-replica-float-state/);
  assert.match(ui, /floatState\.append\(hit\)/);
  assert.match(ui, /floatGroup\.append\(floatState\)/);
  assert.match(css, /@keyframes\s+re0-replica-float/);
  for (const number of [1, 2, 3, 4, 5, 6]) {
    assert.match(css, new RegExp(`re0-replica-float--${number}`));
  }
  assert.match(css, /prefers-reduced-motion/);
});

test('the character rail has a full runway and stays above the fragment stage', () => {
  const css = read('shard-statusbar/styles.css');
  assert.match(css, /\.re0-replica-person-rail-mount\s*\{[^}]*inset:\s*2\.2%\s+1\.7%\s+auto\s+21\.5%/su);
  assert.match(css, /\.re0-replica-person-rail-mount\s*\{[^}]*z-index:\s*12/su);
  assert.match(css, /\.re0-replica-person-rail__list\s*\{[^}]*overflow:\s*visible/su);
  assert.match(css, /\.re0-replica-stage-mount\s*\{[^}]*z-index:\s*2/su);
  assert.match(css, /@media\s*\(max-aspect-ratio:\s*4\s*\/\s*3\)[\s\S]*?\.re0-replica-person-rail-mount\s*\{[^}]*inset-inline-start:\s*19%[^}]*inset-inline-end:\s*0/su);
  assert.match(css, /@media\s*\(max-aspect-ratio:\s*4\s*\/\s*3\)[\s\S]*?\.re0-replica-scene\s*\{[^}]*block-size:\s*100vh/su);
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.re0-replica-scene\s*\{[^}]*inline-size:\s*100vw[^}]*block-size:\s*100vh/su);
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.re0-replica-person\s*\{[^}]*clamp\(24px/isu);
});
