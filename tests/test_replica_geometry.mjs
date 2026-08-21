import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLICA_ANCHORS,
  REPLICA_PATHS,
  REPLICA_VIEWBOX,
  replicaPathFor,
} from '../shard-statusbar/src/replica-geometry.mjs';

function parsePolygon(path) {
  const tokens = path.trim().split(/\s+/u);
  const points = [];
  for (let index = 0; index < tokens.length;) {
    if (tokens[index] === 'M' || tokens[index] === 'L') {
      points.push([Number(tokens[index + 1]), Number(tokens[index + 2])]);
      index += 3;
    } else {
      index += 1;
    }
  }
  return points;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function properSegmentIntersection(start, end, otherStart, otherEnd) {
  const first = cross(start, end, otherStart);
  const second = cross(start, end, otherEnd);
  const third = cross(otherStart, otherEnd, start);
  const fourth = cross(otherStart, otherEnd, end);
  return first * second < 0 && third * fourth < 0;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if ((current[1] > point[1]) !== (prior[1] > point[1])) {
      const boundaryX = ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0];
      if (point[0] < boundaryX) inside = !inside;
    }
  }
  return inside;
}

function polygonsOverlap(first, second) {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (properSegmentIntersection(firstStart, firstEnd, second[secondIndex], second[(secondIndex + 1) % second.length])) return true;
    }
  }
  return first.some((point) => pointInPolygon(point, second)) || second.some((point) => pointInPolygon(point, first));
}

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

test('the lower-left slot 6 and center-lower slot 5 keep a visible separation', () => {
  const slotFive = parsePolygon(REPLICA_PATHS[5]);
  const slotSix = parsePolygon(REPLICA_PATHS[6]);
  assert.equal(polygonsOverlap(slotFive, slotSix), false, 'slot 5 and slot 6 must not share a filled area');
});
