import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  REPLICA_NAV_IDS,
  buildReplicaModel,
} from '../shard-statusbar/src/replica-model.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const sample = JSON.parse(
  readFileSync(resolve(ROOT, 'statusbar/data/sample-state.json'), 'utf8'),
);

test('replica model keeps six fixed slots for every reference navigation page', () => {
  const model = buildReplicaModel(sample.stat_data, { personName: '艾米莉亚' });
  assert.deepEqual(model.navigation.map((item) => item.id), REPLICA_NAV_IDS);
  assert.equal(model.navigation.length, 6);
  for (const page of model.navigation) {
    assert.equal(page.slots.length, 6, page.id);
    assert.deepEqual(page.slots.map((slot) => slot.number), [1, 2, 3, 4, 5, 6]);
    assert.ok(page.slots.every((slot) => slot.title && slot.icon && slot.detail));
  }
  assert.equal(model.activePerson.name, '艾米莉亚');
  assert.equal(model.activePill, '已激活');
});

test('replica slot descriptions are formatted state values, not generated prose', () => {
  const model = buildReplicaModel(sample.stat_data, { personName: '艾米莉亚', pageId: 'world' });
  const locationSlot = model.navigation.find((page) => page.id === 'world').slots
    .find((slot) => slot.title.includes('地点'));
  assert.match(locationSlot.detail, /罗兹瓦尔宅邸/);
  assert.equal(locationSlot.generated, false);
  assert.equal(model.readOnly, true);
});
