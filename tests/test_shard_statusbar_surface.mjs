import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('host surface is namespaced, accessible, and safe by construction', () => {
  const ui = read('shard-statusbar/src/ui.mjs');
  const host = read('shard-statusbar/src/host.mjs');
  const css = read('shard-statusbar/styles.css');
  assert.match(ui, /['"]button['"]/);
  assert.match(ui, /textContent/);
  assert.match(ui, /aria-modal/);
  assert.match(`${ui}\n${host}`, /Escape/);
  assert.match(ui, /\.type\s*=\s*['"]file['"]|setAttribute\(['"]type['"],\s*['"]file['"]\)/);
  assert.match(`${ui}\n${host}`, /re0-shard-statusbar-root/);
  assert.match(`${ui}\n${host}`, /dataset\.dragging|data-dragging/);
  assert.doesNotMatch(ui, /\.innerHTML\s*=/);
  assert.doesNotMatch(`${ui}\n${host}`, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /re0-shard-statusbar/);
  assert.match(css, /@media[^\{]*max-width:\s*720px/);
});
