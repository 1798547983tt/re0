import registryData from '../data/character-registry.json' with { type: 'json' };

export const CHARACTER_REGISTRY = Object.freeze(registryData.map((entry) => Object.freeze({
  ...entry,
  aliases: Object.freeze([...entry.aliases]),
  identityTokens: Object.freeze([...entry.identityTokens]),
  bubbleTokens: Object.freeze([...entry.bubbleTokens]),
})));

const COMMON_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['middot', '·'],
  ['bull', '•'],
]);

export function decodeTextEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return COMMON_ENTITIES.get(lower) ?? match;
  });
}

export function normalizeAlias(value) {
  return decodeTextEntities(value).trim().replace(/[・•·]/gu, '·');
}

export function firstGrapheme(value) {
  const text = String(value ?? '').trim();
  if (!text) return '?';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' });
    return segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? '?';
  }
  return Array.from(text)[0] ?? '?';
}

function buildAliasIndex(registry = CHARACTER_REGISTRY) {
  const index = new Map();
  for (const entry of registry) {
    const aliases = new Set([entry.displayName, entry.rosterName, ...(entry.aliases || [])]);
    for (const alias of aliases) {
      const key = normalizeAlias(alias);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(entry);
    }
  }
  return index;
}

function genericSpeaker(name, reason = 'unknown') {
  const displayName = decodeTextEntities(name).trim() || '未知';
  return {
    kind: 'generic',
    reason,
    stableId: 'generic',
    displayName,
    portraitKey: 'generic',
    referenceFile: null,
    aliases: [displayName],
    identityTokens: ['role:generic', 'accent:generic', 'icon:archive'],
    bubbleTokens: ['code:generic', 'tone:neutral'],
    initial: firstGrapheme(displayName),
  };
}

export function resolveSpeaker(name, registry = CHARACTER_REGISTRY) {
  const displayName = decodeTextEntities(name).trim();
  const key = normalizeAlias(displayName);
  if (!key) return genericSpeaker(displayName, 'empty');
  const matches = buildAliasIndex(registry).get(key) || [];
  const unique = [...new Map(matches.map((entry) => [entry.stableId, entry])).values()];
  if (unique.length > 1) return genericSpeaker(displayName, 'ambiguous-alias');
  if (unique.length === 0) return genericSpeaker(displayName);
  const entry = unique[0];
  return {
    kind: 'character',
    ...entry,
    initial: firstGrapheme(entry.displayName),
  };
}
