import volumeHeadings from '../data/volume-headings.json' with { type: 'json' };
import { decodeTextEntities, resolveSpeaker } from './character-registry.mjs';

export { resolveSpeaker } from './character-registry.mjs';

const VOLUMES = new Map(volumeHeadings.map((entry) => [entry.volume, entry]));
const DIRECT_TAGS = new Set(['scene', 'ability', 'check', 'restart']);
const REQUIRED_ATTRIBUTES = {
  scene: ['location'],
  ability: ['user', 'name', 'kind', 'desc'],
  check: ['type', 'actor'],
  restart: ['deathId', 'checkpoint'],
};
const ATTRIBUTE_WHITELISTS = {
  story: ['volume'],
  time: ['period', 'layer', 'basis'],
  scene: ['location', 'time', 'mood'],
  ability: ['user', 'name', 'kind', 'desc'],
  check: ['type', 'actor', 'target'],
  restart: ['deathId', 'checkpoint'],
};
const DIRECT_TAG_RE = /<\/?([A-Za-z][\w:-]*)\b[^>]*>/gu;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeVolume(value) {
  const digits = String(value ?? '').match(/\d{1,2}/)?.[0];
  return digits ? pad2(Number(digits)) : '00';
}

export function formatVolumeHeading(volume) {
  const key = normalizeVolume(volume);
  const entry = VOLUMES.get(key);
  if (!entry) return '第00卷 | 卷外记录';
  return `第${entry.volume}卷 | ${decodeTextEntities(entry.title)}`;
}

export function formatWitchCalendarDate({ year, month, day } = {}) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || y < 0 || y > 9999 || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new TypeError('魔女历日期必须包含整数 year/month/day');
  }
  if (m < 1 || m > 12) throw new RangeError('魔女历月份必须在 1..12');
  if (d < 1 || d > 30) throw new RangeError('魔女历日期必须在 1..30');
  return `魔女历${String(y).padStart(4, '0')}年${pad2(m)}月${pad2(d)}日`;
}

export function splitUpdateVariable(input) {
  const raw = String(input ?? '').trim();
  const matches = [...raw.matchAll(/<UpdateVariable\b[\s\S]*?<\/UpdateVariable>/giu)];
  if (matches.length === 0) return { narrative: raw, updateVariable: null, valid: true };
  if (matches.length !== 1) return { narrative: raw, updateVariable: null, valid: false };
  const match = matches[0];
  const suffix = match[0];
  if (match.index + suffix.length !== raw.length) return { narrative: raw, updateVariable: null, valid: false };
  return {
    narrative: raw.slice(0, match.index).trimEnd(),
    updateVariable: suffix,
    valid: true,
  };
}

function fallback(rawText, reason) {
  return { ok: false, type: 'fallback', reason, rawText: String(rawText ?? '') };
}

function parseAttributes(source, allowedNames = []) {
  const attributes = {};
  const allowed = new Set(allowedNames);
  const seenLower = new Set();
  const text = String(source || '');
  const re = /([A-Za-z_][\w:-]*)\s*=\s*"([^"]*)"/y;
  let index = 0;
  while (index < text.length) {
    const before = index;
    while (index < text.length && /\s/u.test(text[index])) index += 1;
    if (index >= text.length) break;
    if (index === before && before > 0) return null;
    re.lastIndex = index;
    const match = re.exec(text);
    if (!match) return null;
    const name = match[1];
    const lower = name.toLowerCase();
    if (!allowed.has(name)) return null;
    if (seenLower.has(lower)) return null;
    seenLower.add(lower);
    attributes[name] = decodeTextEntities(match[2]);
    index = re.lastIndex;
  }
  return attributes;
}

function parseTime(text, attributes) {
  const decoded = decodeTextEntities(text).trim();
  const match = decoded.match(/^魔女历(\d{4})年(\d{2})月(\d{2})日$/u);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  try {
    formatWitchCalendarDate(date);
  } catch (_error) {
    return null;
  }
  return {
    ...date,
    visible: formatWitchCalendarDate(date),
    metadata: {
      period: attributes.period || '',
      layer: attributes.layer || '',
      basis: attributes.basis || '',
    },
  };
}

function pushTextBlocks(blocks, text) {
  for (const paragraph of text.split(/\n\s*\n/gu)) {
    const value = decodeTextEntities(paragraph).trim();
    if (!value) continue;
    const dialogue = value.match(/^\{([^{}\n]+)\}「([\s\S]*)」$/u);
    if (dialogue) {
      const speakerName = decodeTextEntities(dialogue[1]).trim();
      const speaker = resolveSpeaker(speakerName);
      const dialogueText = decodeTextEntities(dialogue[2]).trim();
      const previous = blocks.at(-1);
      const sameSpeaker = previous?.type === 'dialogue'
        && previous.speaker.kind === speaker.kind
        && (speaker.kind === 'character'
          ? previous.speaker.stableId === speaker.stableId
          : previous.speaker.displayName === speaker.displayName);
      if (sameSpeaker) {
        previous.text = `${previous.text}\n${dialogueText}`;
        continue;
      }
      blocks.push({
        type: 'dialogue',
        speakerName,
        speaker,
        text: dialogueText,
      });
    } else {
      blocks.push({ type: 'narration', text: value });
    }
  }
}

function parsePlot(plot) {
  const blocks = [];
  let cursor = 0;
  while (cursor < plot.length) {
    DIRECT_TAG_RE.lastIndex = cursor;
    const match = DIRECT_TAG_RE.exec(plot);
    if (!match) {
      pushTextBlocks(blocks, plot.slice(cursor));
      return blocks;
    }
    const [rawTag, type] = match;
    if (!DIRECT_TAGS.has(type)) return null;
    if (rawTag.startsWith('</')) return null;
    const openStart = match.index;
    const openEnd = DIRECT_TAG_RE.lastIndex;
    const closeTag = `</${type}>`;
    const closeIndex = plot.indexOf(closeTag, openEnd);
    if (closeIndex < 0) return null;
    pushTextBlocks(blocks, plot.slice(cursor, openStart));
    const innerText = plot.slice(openEnd, closeIndex);
    DIRECT_TAG_RE.lastIndex = 0;
    if (DIRECT_TAG_RE.test(innerText)) return null;
    DIRECT_TAG_RE.lastIndex = 0;
    const attributes = parseAttributes(rawTag.slice(type.length + 1, -1), ATTRIBUTE_WHITELISTS[type]);
    if (!attributes) return null;
    if ((REQUIRED_ATTRIBUTES[type] || []).some((name) => !String(attributes[name] || '').trim())) return null;
    blocks.push({
      type,
      attributes,
      text: decodeTextEntities(innerText).trim(),
    });
    cursor = closeIndex + closeTag.length;
  }
  return blocks;
}

export function parseNarrativeResponse(input) {
  const raw = String(input ?? '').trim();
  const split = splitUpdateVariable(raw);
  if (!split.valid) return fallback(raw, 'invalid-update-variable');
  const root = split.narrative.match(/^<content>\s*<story\b([^>]*)>([\s\S]*?)<\/story>\s*<time\b([^>]*)>([\s\S]*?)<\/time>\s*<now_plot>\s*([\s\S]*?)\s*<\/now_plot>\s*<\/content>$/u);
  if (!root) return fallback(raw, 'invalid-root-order');

  const storyAttributes = parseAttributes(root[1], ATTRIBUTE_WHITELISTS.story);
  if (!storyAttributes) return fallback(raw, 'invalid-story-attributes');
  const storyText = decodeTextEntities(root[2]).trim();
  const storyVolume = normalizeVolume(storyAttributes.volume || storyText);
  const entry = VOLUMES.get(storyVolume) || null;
  const timeAttributes = parseAttributes(root[3], ATTRIBUTE_WHITELISTS.time);
  if (!timeAttributes) return fallback(raw, 'invalid-time-attributes');
  const time = parseTime(root[4], timeAttributes);
  if (!time) return fallback(raw, 'invalid-time');
  const blocks = parsePlot(root[5]);
  if (!blocks) return fallback(raw, 'invalid-plot-tags');

  return {
    ok: true,
    type: 'narrative',
    story: {
      volume: entry?.volume || '00',
      kind: entry?.kind || '',
      title: entry?.title || '卷外记录',
      sourceText: storyText,
    },
    time,
    visible: {
      heading: formatVolumeHeading(entry?.volume || storyVolume),
      date: time.visible,
    },
    blocks,
    updateVariable: split.updateVariable,
  };
}
