export const DRAG_THRESHOLD = 6;

export function normalizeOrbPosition(position = {}) {
  const x = Number(position.x);
  const y = Number(position.y);
  return {
    x: Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.82,
    y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 0.5,
  };
}

function distanceBetween(first, second) {
  return Math.hypot(second.clientX - first.startX, second.clientY - first.startY);
}

export function createOrbDragController({
  initial = { x: 0.82, y: 0.5 },
  threshold = DRAG_THRESHOLD,
  viewport = () => ({ width: globalThis.innerWidth || 1, height: globalThis.innerHeight || 1 }),
  onStateChange = () => {},
  onPositionChange = () => {},
  onClick = () => {},
} = {}) {
  let position = normalizeOrbPosition(initial);
  let gesture = null;

  const emit = (state) => onStateChange({
    dragging: Boolean(state.dragging),
    pressed: Boolean(state.pressed),
    position: { ...position },
  });

  const pointerDown = (event) => {
    if (!event || gesture || !Number.isFinite(Number(event.pointerId))) return false;
    gesture = {
      pointerId: Number(event.pointerId),
      startX: Number(event.clientX) || 0,
      startY: Number(event.clientY) || 0,
      startPosition: { ...position },
      dragging: false,
    };
    emit({ pressed: true, dragging: false });
    return true;
  };

  const pointerMove = (event) => {
    if (!gesture || Number(event?.pointerId) !== gesture.pointerId) return false;
    if (!gesture.dragging && distanceBetween(gesture, event) > threshold) {
      gesture.dragging = true;
      emit({ pressed: true, dragging: true });
    }
    if (!gesture.dragging) return false;
    const size = viewport() || {};
    const width = Math.max(1, Number(size.width) || 1);
    const height = Math.max(1, Number(size.height) || 1);
    position = normalizeOrbPosition({
      x: gesture.startPosition.x + ((Number(event.clientX) || 0) - gesture.startX) / width,
      y: gesture.startPosition.y + ((Number(event.clientY) || 0) - gesture.startY) / height,
    });
    emit({ pressed: true, dragging: true });
    onPositionChange({ ...position }, { phase: 'drag' });
    return true;
  };

  const finish = (event, cancelled = false) => {
    if (!gesture || Number(event?.pointerId) !== gesture.pointerId) return false;
    const wasDrag = gesture.dragging;
    gesture = null;
    emit({ pressed: false, dragging: false });
    if (cancelled) return true;
    if (wasDrag) onPositionChange({ ...position }, { phase: 'settle' });
    else onClick();
    return true;
  };

  return Object.freeze({
    pointerDown,
    pointerMove,
    pointerUp: (event) => finish(event, false),
    pointerCancel: (event) => finish(event, true),
    getPosition: () => ({ ...position }),
    setPosition: (next) => {
      position = normalizeOrbPosition(next);
      emit({ pressed: false, dragging: false });
    },
    isDragging: () => Boolean(gesture?.dragging),
  });
}
