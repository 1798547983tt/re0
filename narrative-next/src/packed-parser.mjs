const PACKED_PERIODS = new Set([
  '黎明', '清晨', '上午', '正午', '下午', '傍晚', '夜间', '深夜', '凌晨', '时段未详',
]);
const PACKED_LAYERS = new Set(['主线', '轮回分支', '历史回溯', '试炼幻境']);
const PACKED_BASES = new Set(['编辑演算', '历史估算']);
const PACKED_ABILITY_KINDS = new Set([
  '一般技能', '权能', '加护', '魔法', '精灵术', '种族能力', '武技',
]);
const PACKED_AFFINITIES = ['火', '水', '风', '土', '阴', '阳'];

function packedNormalize(value) {
  return String(value ?? '').normalize('NFC').replace(/\r\n?/gu, '\n');
}

function packedAttributes(raw, allowed, required = []) {
  const values = Object.create(null);
  const source = String(raw ?? '');
  const pattern = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gyu;
  let cursor = 0;
  while (cursor < source.length) {
    const whitespace = /^\s+/u.exec(source.slice(cursor));
    if (!whitespace) return null;
    cursor += whitespace[0].length;
    if (cursor === source.length) break;
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) return null;
    const key = match[1];
    if (!allowed.has(key) || Object.prototype.hasOwnProperty.call(values, key)) return null;
    values[key] = (match[2] ?? match[3] ?? '').trim();
    cursor = pattern.lastIndex;
  }
  for (const key of required) {
    if (!values[key]) return null;
  }
  return values;
}

function packedParagraphs(value) {
  return packedNormalize(value)
    .trim()
    .split(/\n\s*\n/gu)
    .map((part) => part.trim())
    .filter(Boolean);
}

function packedPushNarration(blocks, value) {
  for (const paragraph of packedParagraphs(value)) {
    blocks.push({ type: 'narration', text: paragraph });
  }
}

function packedInvalid(raw, reason) {
  return { type: 'invalid', text: String(raw ?? ''), raw: String(raw ?? ''), reason };
}

function packedReadBlock(source, start, openingEnd, tagName) {
  const closingPattern = new RegExp(`<\\/${tagName}\\s*>`, 'igu');
  closingPattern.lastIndex = openingEnd;
  const closing = closingPattern.exec(source);
  if (!closing) return null;
  return {
    body: source.slice(openingEnd, closing.index),
    end: closingPattern.lastIndex,
    raw: source.slice(start, closingPattern.lastIndex),
  };
}

function packedAbility(attributes, body, raw) {
  const allowed = new Set(['user', 'name', 'kind', 'affinity']);
  const values = packedAttributes(attributes, allowed, ['user', 'name', 'kind']);
  if (!values || !PACKED_ABILITY_KINDS.has(values.kind)) return packedInvalid(raw, '能力属性不完整');
  const match = body.match(/^\s*<effect>\s*([\s\S]*?)\s*<\/effect>\s*<description>\s*([\s\S]*?)\s*<\/description>\s*$/iu);
  if (!match || !match[1].trim() || !match[2].trim()) return packedInvalid(raw, '能力说明结构不完整');
  const affinities = values.affinity ? values.affinity.split(',').map((item) => item.trim()) : [];
  const ordered = affinities.every((item, index) => (
    PACKED_AFFINITIES.includes(item)
    && (index === 0 || PACKED_AFFINITIES.indexOf(affinities[index - 1]) < PACKED_AFFINITIES.indexOf(item))
  ));
  if (!ordered || new Set(affinities).size !== affinities.length) return packedInvalid(raw, '能力属性顺序无效');
  return {
    type: 'ability',
    user: values.user,
    name: values.name,
    kind: values.kind,
    affinities,
    effect: match[1].trim(),
    description: match[2].trim(),
  };
}

function packedStructuredBlock(type, attributes, body, raw) {
  if (/<\/?(?:scene|ability|check|restart)\b/iu.test(body)) {
    return packedInvalid(raw, '特殊模组不得嵌套');
  }
  if (type === 'ability') return packedAbility(attributes, body, raw);
  if (type === 'scene') {
    const values = packedAttributes(attributes, new Set(['location', 'time', 'mood']), ['location', 'time', 'mood']);
    return values && body.trim()
      ? { type: 'scene', ...values, text: body.trim() }
      : packedInvalid(raw, '场景属性不完整');
  }
  if (type === 'check') {
    const values = packedAttributes(attributes, new Set(['type', 'actor', 'target']), ['type', 'actor', 'target']);
    return values && body.trim()
      ? { type: 'check', checkType: values.type, actor: values.actor, target: values.target, text: body.trim() }
      : packedInvalid(raw, '检定属性不完整');
  }
  const values = packedAttributes(attributes, new Set(['deathId', 'checkpoint']), ['deathId', 'checkpoint']);
  return values && body.trim()
    ? { type: 'restart', deathId: values.deathId, checkpoint: values.checkpoint, text: body.trim() }
    : packedInvalid(raw, '世界重启属性不完整');
}

function packedPlot(value) {
  const source = packedNormalize(value);
  const blocks = [];
  const opener = /\{([^{}\r\n]{1,80})\}「|<(scene|ability|check|restart)\b([^>]*)>/giu;
  let cursor = 0;
  let match;
  while ((match = opener.exec(source))) {
    packedPushNarration(blocks, source.slice(cursor, match.index));
    if (match[1] !== undefined) {
      const closing = source.indexOf('」', opener.lastIndex);
      if (closing < 0) {
        packedPushNarration(blocks, source.slice(match.index));
        cursor = source.length;
        break;
      }
      const speaker = match[1].trim();
      const text = source.slice(opener.lastIndex, closing).trim();
      if (speaker && text) {
        blocks.push({ type: speaker === '#' ? 'player-dialogue' : 'dialogue', speaker, text });
      } else {
        blocks.push(packedInvalid(source.slice(match.index, closing + 1), '对白格式不完整'));
      }
      cursor = closing + 1;
      opener.lastIndex = cursor;
      continue;
    }
    const type = match[2].toLowerCase();
    const block = packedReadBlock(source, match.index, opener.lastIndex, type);
    if (!block) {
      packedPushNarration(blocks, source.slice(match.index));
      cursor = source.length;
      break;
    }
    blocks.push(packedStructuredBlock(type, match[3], block.body, block.raw));
    cursor = block.end;
    opener.lastIndex = cursor;
  }
  if (cursor < source.length) packedPushNarration(blocks, source.slice(cursor));
  return blocks;
}

function packedInnerSource(value) {
  const source = packedNormalize(value).trim();
  const opening = /^<content\b([^>]*)>/iu.exec(source);
  if (!opening) return { inner: source, player: '', streaming: false };
  const closingPattern = /<\/content\s*>\s*$/iu;
  const closing = closingPattern.exec(source);
  const rootAttributes = packedAttributes(opening[1], new Set(['player'])) || {};
  return {
    inner: source.slice(opening[0].length, closing ? closing.index : source.length),
    player: rootAttributes.player || '',
    streaming: !closing,
  };
}

export function parsePackedContentEnvelope(value) {
  const root = packedInnerSource(value);
  const source = root.inner;
  const storyOpen = /^\s*<story\b([^>]*)>\s*<\/story>/iu.exec(source);
  if (!storyOpen) {
    return { ok: false, streaming: root.streaming, player: root.player, story: null, time: null, blocks: [], errors: [{ code: 'missing-story', message: '缺少卷信息。' }] };
  }
  const storyAttributes = packedAttributes(storyOpen[1], new Set(['volume']), ['volume']);
  if (!storyAttributes || !/^(?:0[1-9]|[12]\d|3\d)$/u.test(storyAttributes.volume)) {
    return { ok: false, streaming: root.streaming, player: root.player, story: null, time: null, blocks: [], errors: [{ code: 'invalid-story', message: '卷号无效。' }] };
  }
  const afterStory = source.slice(storyOpen[0].length);
  const timeOpen = /^\s*<time\b([^>]*)>\s*([\s\S]*?)\s*<\/time>/iu.exec(afterStory);
  if (!timeOpen) {
    return { ok: false, streaming: root.streaming, player: root.player, story: { volume: storyAttributes.volume }, time: null, blocks: [], errors: [{ code: 'missing-time', message: '缺少时间信息。' }] };
  }
  const timeAttributes = packedAttributes(timeOpen[1], new Set(['period', 'layer', 'basis']), ['period', 'layer', 'basis']);
  if (!timeAttributes || !PACKED_PERIODS.has(timeAttributes.period) || !PACKED_LAYERS.has(timeAttributes.layer) || !PACKED_BASES.has(timeAttributes.basis)) {
    return { ok: false, streaming: root.streaming, player: root.player, story: { volume: storyAttributes.volume }, time: null, blocks: [], errors: [{ code: 'invalid-time', message: '时间属性无效。' }] };
  }
  const afterTime = afterStory.slice(timeOpen[0].length);
  const plotOpen = /^\s*<now_plot>\s*/iu.exec(afterTime);
  if (!plotOpen) {
    return { ok: false, streaming: root.streaming, player: root.player, story: { volume: storyAttributes.volume }, time: { ...timeAttributes, text: timeOpen[2].trim() }, blocks: [], errors: [{ code: 'missing-plot', message: '缺少正文。' }] };
  }
  const plotTail = afterTime.slice(plotOpen[0].length);
  const plotClose = /<\/now_plot>\s*$/iu.exec(plotTail);
  const streaming = root.streaming || !plotClose;
  const plot = plotClose ? plotTail.slice(0, plotClose.index) : plotTail;
  return {
    ok: true,
    streaming,
    complete: !streaming,
    player: root.player,
    story: { volume: storyAttributes.volume },
    time: { ...timeAttributes, text: timeOpen[2].trim() },
    blocks: packedPlot(plot),
    errors: [],
    progressText: streaming ? '正文生成中……' : '',
  };
}
