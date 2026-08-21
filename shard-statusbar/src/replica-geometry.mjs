export const REPLICA_VIEWBOX = Object.freeze({ width: 1924, height: 1080 });

// One coordinate source drives the image clip, luminous outline, hit target,
// marker position, and detail-state shift. Coordinates are from the supplied
// 1924x1080 reference frame; they are intentionally not percentages.
export const REPLICA_PATHS = Object.freeze({
  1: 'M 570 0 L 950 0 L 972 266 L 842 350 L 594 284 L 548 92 Z',
  2: 'M 918 0 L 1314 0 L 1288 318 L 1055 364 L 878 232 Z',
  3: 'M 1312 0 L 1924 0 L 1924 510 L 1610 515 L 1280 360 Z',
  4: 'M 1266 556 L 1804 522 L 1750 968 L 1475 1080 L 1226 932 Z',
  5: 'M 778 558 L 1002 526 L 1228 872 L 1190 1080 L 760 1080 L 682 838 Z',
  6: 'M 320 512 L 688 382 L 1008 408 L 812 830 L 628 858 L 302 704 Z',
});

export const REPLICA_ANCHORS = Object.freeze({
  1: Object.freeze({ x: 690, y: 220 }),
  2: Object.freeze({ x: 1115, y: 205 }),
  3: Object.freeze({ x: 1585, y: 382 }),
  4: Object.freeze({ x: 1424, y: 858 }),
  5: Object.freeze({ x: 900, y: 870 }),
  6: Object.freeze({ x: 445, y: 760 }),
});

export function replicaPathFor(number) {
  return REPLICA_PATHS[String(number)] || '';
}
