import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('status bar source exposes the complete read-only accessible surface', () => {
  const html = read('statusbar/index.html');
  const app = read('statusbar/src/app.mjs');
  const css = read('statusbar/styles.css');

  assert.equal((html.match(/data-re0-statusbar-mount/g) || []).length, 1);
  assert.match(html, /id="re0-statusbar-app"/);
  assert.match(html, /id="re0-statusbar-overlay-root"/);
  assert.match(html, /aria-live="polite"/);

  for (const id of [
    'overview', 'protagonist', 'world', 'relations', 'loop',
    'events', 'clues', 'assets', 'music',
  ]) {
    assert.ok(app.includes(`'${id}'`), `missing section ${id}`);
  }
  for (const renderer of [
    'renderOverview', 'renderProtagonist', 'renderWorld', 'renderRelations',
    'renderLoop', 'renderEvents', 'renderClues', 'renderAssets', 'renderMusic',
  ]) {
    assert.match(app, new RegExp(`function ${renderer}\\b`));
  }

  assert.match(app, /textContent/);
  assert.match(app, /createElement\(['"]button['"]\)/);
  assert.match(app, /data-action|dataset\.action/);
  assert.match(app, /edit-portrait/);
  assert.match(app, /toggle-snapshot/);
  assert.match(app, /toggle-group/);
  assert.match(app, /show-more/);
  assert.match(app, /collapse-list/);
  assert.match(app, /restore-auto-theme/);
  assert.match(app, /re0-detail-toolbar/);
  assert.match(app, /re0-compact-theme/);
  assert.match(app, /data-music-file/);
  assert.match(app, /data-music-url/);
  assert.match(app, /single/);
  assert.match(app, /sequence/);
  assert.doesNotMatch(app, /function renderDiagnostics\b/);
  assert.match(app, /aria-modal/);
  assert.match(app, /Escape/);
  assert.doesNotMatch(app, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);

  const hydrateStart = app.indexOf('const hydrateAvatar');
  const hydrateEnd = app.indexOf('const queuePortraits', hydrateStart);
  const hydrateSource = app.slice(hydrateStart, hydrateEnd);
  assert.ok(
    hydrateSource.indexOf('builtInPortraitForName') < hydrateSource.indexOf('await Promise.all'),
    'bundled portraits must render before optional IndexedDB overrides are read',
  );

  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container[^\{]*\(max-width:\s*700px\)/);
  assert.match(css, /@container[^\{]*\(max-width:\s*420px\)[\s\S]*?\.re0-navigation\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/s);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.re0-navigation::\-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.re0-navigation::\-webkit-scrollbar\s*\{[^}]*block-size:\s*0/s);
  assert.match(css, /\.re0-navigation::\-webkit-scrollbar\s*\{[^}]*inline-size:\s*0/s);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /data-theme="day"/);
  assert.match(css, /data-theme="night"/);
  assert.match(css, /min-(?:inline-)?size:\s*44px|min-height:\s*44px/);
  assert.match(
    css,
    /#re0-statusbar-app\[data-details-open="true"\]\[data-theme="day"\]\s*\{[^}]*--re0-scene:\s*var\(--re0-day-art-mobile/s,
  );
  assert.match(
    css,
    /#re0-statusbar-app\[data-details-open="true"\]\[data-theme="night"\]\s*\{[^}]*--re0-scene:\s*var\(--re0-night-art-mobile/s,
  );
  assert.match(
    css,
    /\.re0-statusbar\s*\{[^}]*isolation:\s*isolate/s,
    'the status bar must own the artwork stacking context',
  );
  assert.match(
    css,
    /\.re0-statusbar::before\s*\{[^}]*z-index:\s*0[^}]*opacity:\s*1[^}]*pointer-events:\s*none/s,
    'scene artwork must paint above the opaque shell background without intercepting input',
  );
  assert.doesNotMatch(
    css,
    /\.re0-statusbar::(?:before|after)\s*\{[^}]*z-index:\s*-/s,
    'status-bar artwork and ornaments must not sit behind the opaque shell background',
  );
  assert.match(
    css,
    /#re0-statusbar-overlay-root\s*\{[^}]*--re0-panel-strong:/s,
    'overlay must own theme tokens because it is a sibling of the app root',
  );

  const headerSource = app.match(/const renderHeader\s*=\s*\(model\)\s*=>\s*\{[\s\S]*?return header;\s*\};/)?.[0] || '';
  assert.doesNotMatch(headerSource, /re0-header-controls|re0-theme-button/, 'large theme controls belong in the detail heading');
  assert.doesNotMatch(css, /\.re0-details\s*\{[^}]*min-block-size:\s*480px/s, 'expanded details must size to their visible group');
  assert.match(css, /\.re0-section-panel\s*\{[^}]*--re0-panel-alpha:\s*22%/s, 'the detail scene should remain plainly visible');
});

test('the nine sections expose every declared state domain and sensitive folds', () => {
  const app = read('statusbar/src/app.mjs');
  for (const domain of ['世界', '主角档案', '轮回', '关系', '事件', '线索', '资产', '规则']) {
    assert.ok(app.includes(domain), `missing domain ${domain}`);
  }
  for (const sensitive of ['菜月昴死亡记录', '状态快照', '容貌', '衣着']) {
    assert.ok(app.includes(sensitive), `missing sensitive field ${sensitive}`);
  }
});
