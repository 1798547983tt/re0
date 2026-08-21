import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLICA_ANCHORS,
  REPLICA_PATHS,
  REPLICA_VIEWBOX,
  replicaPathFor,
} from '../shard-statusbar/src/replica-geometry.mjs';

test('reference geometry has one canonical path and anchor for each of six slots', () => {
  assert.deepEqual(REPLICA_VIEWBOX, { width: 1924, height: 1080 });
  assert.deepEqual(Object.keys(REPLICA_PATHS), ['1', '2', '3', '4', '5', '6']);
  for (const number of [1, 2, 3, 4, 5, 6]) {
    assert.match(replicaPathFor(number), /^M\s/);
    assert.ok(REPLICA_ANCHORS[number].x >= 0 && REPLICA_ANCHORS[number].x <= 1924);
    assert.ok(REPLICA_ANCHORS[number].y >= 0 && REPLICA_ANCHORS[number].y <= 1080);
  }
});

test('paths are the shared source for clip, outline, and hit testing', () => {
  assert.equal(replicaPathFor(0), '');
  assert.equal(replicaPathFor(7), '');
  assert.equal(new Set(Object.values(REPLICA_PATHS)).size, 6);
});
