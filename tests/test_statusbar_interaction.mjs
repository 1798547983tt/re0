import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('status bar uses a local interaction path instead of rebuilding the whole frame', () => {
  const app = read('statusbar/src/app.mjs');
  const css = read('statusbar/styles.css');

  assert.match(app, /updatePanelView/);
  assert.match(app, /updateGroupView/);
  assert.match(app, /action === 'toggle-group'[\s\S]*?updateGroupView\(groupId\)/);
  assert.match(app, /setDetailsOpen/);
  assert.match(app, /app\.dataset\.detailsOpen/);
  assert.match(app, /data-music-player-summary/);
  assert.match(app, /data-music-library-summary/);
  assert.match(app, /data-shell-toggle/);
  assert.match(app, /startViewTransition/);
  assert.doesNotMatch(app, /展开档案/);
  assert.doesNotMatch(app, /re0-expand-button/);
  assert.match(css, /re0-details__inner/);
  assert.match(css, /grid-template-rows:\s*0fr/);
  assert.match(css, /re0-panel-enter/);
  assert.match(css, /re0-panel-leave/);
  assert.match(css, /re0-accordion-group__body-shell/);
  assert.match(css, /grid-template-rows:\s*auto\s+0fr/);

  const toggleSource = app.match(/const toggleDetails\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\};/)?.[0] || '';
  assert.ok(
    toggleSource.indexOf('setDetailsOpen') < toggleSource.indexOf('persist()'),
    'the new open state must be stored after it is applied',
  );
});

test('embedded preview leaves the host background transparent while local surfaces stay readable', () => {
  const css = read('statusbar/styles.css');

  assert.match(css, /html\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /body\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.re0-statusbar\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.re0-statusbar__header\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.re0-compact\s*\{[^}]*background:\s*transparent/s);
});
