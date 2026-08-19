import volumeData from '../../narrative/data/volume-headings.json' with { type: 'json' };

export const TITLE_FAMILIES = Object.freeze([
  'single-focus',
  'spotlight',
  'rhythm',
  'duet',
  'redaction',
  'calamity',
  'departure',
]);

export const VOLUME_TITLES = Object.freeze(volumeData.map((entry) => Object.freeze({ ...entry })));

const SPECIAL_FAMILIES = Object.freeze({
  '01': 'single-focus',
  '05': 'spotlight',
  '12': 'rhythm',
  '20': 'duet',
  '25': 'redaction',
  '35': 'calamity',
  '39': 'departure',
});

function normalizeVolume(value) {
  const number = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(number) || number < 1 || number > 39) return '01';
  return String(number).padStart(2, '0');
}

export function formatStoryHeading(value) {
  const normalized = normalizeVolume(typeof value === 'object' ? value?.volume : value);
  const record = typeof value === 'object'
    ? value
    : VOLUME_TITLES.find((entry) => entry.volume === normalized) ?? VOLUME_TITLES[0];
  return `第${record.volume}卷｜${record.title}`;
}

export function matchesStoryHeading(volume, heading) {
  const normalizedVolume = String(volume ?? '').trim();
  const record = VOLUME_TITLES.find((entry) => entry.volume === normalizedVolume);
  return Boolean(record && String(heading ?? '').trim() === formatStoryHeading(record));
}

function hashText(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function accentIndexes(characters, volume) {
  const candidates = characters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => !/[\s·•—─，。！？、：；]/u.test(character))
    .map(({ index }) => index);
  if (!candidates.length) return [0];
  const seed = hashText(`${volume}:${characters.join('')}`);
  const first = candidates[seed % candidates.length];
  if (candidates.length < 4) return [first];
  let second = candidates[(seed + Math.max(2, Math.floor(candidates.length / 2))) % candidates.length];
  if (second === first) second = candidates[(candidates.indexOf(first) + 1) % candidates.length];
  return [first, second].sort((a, b) => a - b);
}

export function resolveVolumeTitle(volume) {
  const lookup = String(volume ?? '').trim();
  const headingRecord = VOLUME_TITLES.find((entry) => formatStoryHeading(entry) === lookup);
  const normalized = headingRecord?.volume ?? normalizeVolume(lookup);
  const record = headingRecord ?? VOLUME_TITLES.find((entry) => entry.volume === normalized) ?? VOLUME_TITLES[0];
  const numeric = Number.parseInt(normalized, 10);
  const family = SPECIAL_FAMILIES[normalized] ?? TITLE_FAMILIES[(numeric - 1) % TITLE_FAMILIES.length];
  const characters = Array.from(record.title);
  return {
    ...record,
    heading: formatStoryHeading(record),
    family,
    characters,
    accentIndexes: accentIndexes(characters, normalized),
    ariaLabel: `第${numeric}卷，${record.kind}，${record.title}`,
  };
}
