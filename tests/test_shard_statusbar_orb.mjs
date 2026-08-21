import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOrbDragController,
  normalizeOrbPosition,
} from '../shard-statusbar/src/orb.mjs';

test('orb drag keeps a free position and emits a visible drag state', () => {
  const states = [];
  const clicks = [];
  const positions = [];
  const controller = createOrbDragController({
    initial: { x: 0.42, y: 0.38 },
    viewport: () => ({ width: 1000, height: 800 }),
    onStateChange: (state) => states.push(state),
    onClick: () => clicks.push(true),
    onPositionChange: (position) => positions.push(position),
  });

  controller.pointerDown({ pointerId: 1, clientX: 420, clientY: 304 });
  controller.pointerMove({ pointerId: 1, clientX: 560, clientY: 404 });
  controller.pointerUp({ pointerId: 1, clientX: 560, clientY: 404 });

  assert.equal(clicks.length, 0);
  assert.ok(states.some((state) => state.dragging === true));
  assert.equal(states.at(-1).dragging, false);
  assert.ok(positions.at(-1).x > 0.42);
  assert.ok(positions.at(-1).y > 0.38);
  assert.ok(positions.at(-1).x < 0.9, 'position must not auto-snap to the edge');
});

test('orb click remains distinct from a short pointer sequence', () => {
  let clicks = 0;
  const controller = createOrbDragController({
    initial: { x: 0.5, y: 0.5 },
    viewport: () => ({ width: 800, height: 600 }),
    onClick: () => { clicks += 1; },
  });
  controller.pointerDown({ pointerId: 2, clientX: 400, clientY: 300 });
  controller.pointerUp({ pointerId: 2, clientX: 402, clientY: 301 });
  assert.equal(clicks, 1);
});

test('position normalization only clamps to the viewport, never snaps to a side', () => {
  assert.deepEqual(
    normalizeOrbPosition({ x: 0.36, y: 0.64 }),
    { x: 0.36, y: 0.64 },
  );
  assert.deepEqual(
    normalizeOrbPosition({ x: -1, y: 4 }),
    { x: 0, y: 1 },
  );
});
