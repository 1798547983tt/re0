import volumeHeadings from '../data/volume-headings.json' with { type: 'json' };
import { decodeTextEntities, resolveSpeaker } from './character-registry.mjs';

const VOLUMES = new Map(volumeHeadings.map((entry) => [entry.volume, entry]));
const DIRECT_TAGS = new Set(['scene', 'ability', 'check', 'restart']);
const REQUIRED_ATTRIBUTES = {
  scene: ['location'],
  ability: ['user', 'name', 'kind', 'desc'],
  check: ['type', 'actor'],
  restart: ['deathId', 'checkpoint'],
};

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
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new TypeError('魔女历日期必须包含整数 year/month/day');
  }
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

function parseAttributes(source) {
  const attributes = {};
  const re = /([A-Za-z_][\w:-]*)\s*=\s*"([^"]*)"/gu;
  for (const match of source.matchAll(re)) attributes[match[1]] = decodeTextEntities(match[2]);
  return attributes;
}

function parseTime(text, attributes) {
  const decoded = decodeTextEntities(text).trim();
  const match = decoded.match(/^魔女历(\d{4})年(\d{2})月(\d{2})日$/u);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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

function validateTagSurface(plot) {
  for (const match of plot.matchAll(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/gu)) {
    if (!DIRECT_TAGS.has(match[1])) return false;
  }
  return true;
}

function pushTextBlocks(blocks, text) {
  for (const paragraph of text.split(/\n\s*\n/gu)) {
    const value = decodeTextEntities(paragraph).trim();
    if (!value) continue;
    const dialogue = value.match(/^\{([^{}\n]+)\}「([\s\S]*)」$/u);
    if (dialogue) {
      const speakerName = decodeTextEntities(dialogue[1]).trim();
      blocks.push({
        type: 'dialogue',
        speakerName,
        speaker: resolveSpeaker(speakerName),
        text: decodeTextEntities(dialogue[2]).trim(),
      });
    } else {
      blocks.push({ type: 'narration', text: value });
    }
  }
}

function parsePlot(plot) {
  if (!validateTagSurface(plot)) return null;
  const blocks = [];
  const tagRe = /<(scene|ability|check|restart)\b([^>]*)>([\s\S]*?)<\/\1>/giu;
  let cursor = 0;
  for (const match of plot.matchAll(tagRe)) {
    pushTextBlocks(blocks, plot.slice(cursor, match.index));
    const type = match[1];
    const attributes = parseAttributes(match[2]);
    if ((REQUIRED_ATTRIBUTES[type] || []).some((name) => !String(attributes[name] || '').trim())) return null;
    if (validateTagSurface(match[3]) && /<\/?(scene|ability|check|restart)\b/iu.test(match[3])) return null;
    blocks.push({
      type,
      attributes,
      text: decodeTextEntities(match[3]).trim(),
    });
    cursor = match.index + match[0].length;
  }
  const rest = plot.slice(cursor);
  if (/<\/?(scene|ability|check|restart)\b/iu.test(rest)) return null;
  pushTextBlocks(blocks, rest);
  return blocks;
}

export function parseNarrativeResponse(input) {
  const raw = String(input ?? '').trim();
  const split = splitUpdateVariable(raw);
  if (!split.valid) return fallback(raw, 'invalid-update-variable');
  const root = split.narrative.match(/^<content>\s*<story\b([^>]*)>([\s\S]*?)<\/story>\s*<time\b([^>]*)>([\s\S]*?)<\/time>\s*<now_plot>\s*([\s\S]*?)\s*<\/now_plot>\s*<\/content>$/u);
  if (!root) return fallback(raw, 'invalid-root-order');

  const storyAttributes = parseAttributes(root[1]);
  const storyText = decodeTextEntities(root[2]).trim();
  const storyVolume = normalizeVolume(storyAttributes.volume || storyText);
  const entry = VOLUMES.get(storyVolume) || null;
  const time = parseTime(root[4], parseAttributes(root[3]));
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
