import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const modulePath = resolve(ROOT, 'statusbar/src/ui-state.mjs');

test('UI state is chat-scoped, exclusive, and paginates records in 3 + 5 batches', async () => {
  assert.equal(existsSync(modulePath), true, 'statusbar/src/ui-state.mjs must exist');
  const ui = await import(pathToFileURL(modulePath));

  assert.notEqual(ui.uiStorageKey('chat-a'), ui.uiStorageKey('chat-b'));
  assert.match(ui.uiStorageKey('chat/a'), /^re0-statusbar:ui:v2:/);

  const defaults = ui.normalizeUiPreferences({}, {
    sectionIds: ['overview', 'world'],
    relationFilterIds: ['all', '人物'],
  });
  assert.deepEqual(defaults.openGroupBySection, {});
  assert.deepEqual(defaults.listLimits, {});
  assert.equal(ui.resolveOpenGroup(defaults.openGroupBySection, 'overview', 'pulse', { compact: false }), 'pulse');
  assert.equal(ui.resolveOpenGroup(defaults.openGroupBySection, 'overview', 'pulse', { compact: true }), '');

  const opened = ui.toggleOpenGroup(defaults.openGroupBySection, 'overview', 'alerts', 'pulse');
  assert.deepEqual(opened, { overview: 'alerts' });
  const closed = ui.toggleOpenGroup(opened, 'overview', 'alerts', 'alerts');
  assert.deepEqual(closed, { overview: '' });

  assert.equal(ui.visibleListLimit({}, 'events:recent', 12), 3);
  const grown = ui.growListLimit({}, 'events:recent', 12);
  assert.equal(ui.visibleListLimit(grown, 'events:recent', 12), 8);
  assert.equal(ui.visibleListLimit(ui.growListLimit(grown, 'events:recent', 12), 'events:recent', 12), 12);
  assert.equal(ui.visibleListLimit(ui.resetListLimit(grown, 'events:recent'), 'events:recent', 12), 3);
});
