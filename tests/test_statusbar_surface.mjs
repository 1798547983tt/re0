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
    'events', 'clues', 'assets', 'diagnostics',
  ]) {
    assert.ok(app.includes(`'${id}'`), `missing section ${id}`);
  }
  for (const renderer of [
    'renderOverview', 'renderProtagonist', 'renderWorld', 'renderRelations',
    'renderLoop', 'renderEvents', 'renderClues', 'renderAssets', 'renderDiagnostics',
  ]) {
    assert.match(app, new RegExp(`function ${renderer}\\b`));
  }

  assert.match(app, /textContent/);
  assert.match(app, /createElement\(['"]button['"]\)/);
  assert.match(app, /data-action|dataset\.action/);
  assert.match(app, /edit-portrait/);
  assert.match(app, /toggle-snapshot/);
  assert.match(app, /toggle-details/);
  assert.match(app, /restore-auto-theme/);
  assert.match(app, /aria-modal/);
  assert.match(app, /Escape/);
  assert.doesNotMatch(app, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);

  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container[^\{]*\(max-width:\s*700px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /data-theme="day"/);
  assert.match(css, /data-theme="night"/);
  assert.match(css, /min-(?:inline-)?size:\s*44px|min-height:\s*44px/);
  assert.match(
    css,
    /#re0-statusbar-overlay-root\s*\{[^}]*--re0-panel-strong:/s,
    'overlay must own theme tokens because it is a sibling of the app root',
  );
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
