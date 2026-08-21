import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');

test('replica surface exposes reference landmarks and removes the card HUD', () => {
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
  assert.match(source, /replicaAvatarFile/);
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(css, /re0-replica-detail/);
  assert.match(css, /aspect-ratio|aspect-ratio/);
  assert.match(`${ui}\n${host}`, /Escape/);
  assert.match(ui, /portraitUrlFor/);
  assert.match(ui, /startsWith\('blob:'\)/);
  assert.match(host, /resolveCachedPortraitUrl/);
  assert.doesNotMatch(source, /re0-shard-panel|re0-shard-hero|re0-shard-stage/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(`${ui}\n${host}`, /replaceVariables|updateVariablesWith|insertOrAssignVariables|replaceMvuData/);
});
