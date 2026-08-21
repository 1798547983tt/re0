import {
  asList,
  asRecord,
  asText,
  buildHudModel,
  firstGrapheme,
} from '../../statusbar/src/status-core.mjs';
import {
  DECLARED_DOMAIN_COUNTS,
  expandDeclaredPaths,
} from '../../statusbar/src/schema-map.mjs';
import {
  CHARACTER_REGISTRY,
  resolveSpeaker,
} from '../../narrative/src/character-registry.mjs';

export const SHARD_IDS = Object.freeze([
  'protagonist',
  'world',
  'loop',
  'relations',
  'events',
  'clues',
  'assets',
  'rules',
]);

const SHARD_META = Object.freeze({
  protagonist: { title: '主角档案', eyebrow: 'IDENTITY', glyph: '♙', tone: 'violet' },
  world: { title: '世界脉络', eyebrow: 'WORLD', glyph: '⌖', tone: 'cyan' },
  loop: { title: '轮回账本', eyebrow: 'RETURN', glyph: '∞', tone: 'rose' },
  relations: { title: '人际星图', eyebrow: 'BONDS', glyph: '♢', tone: 'gold' },
  events: { title: '事件余波', eyebrow: 'EVENTS', glyph: '◇', tone: 'ember' },
  clues: { title: '线索碎片', eyebrow: 'CLUES', glyph: '⌕', tone: 'mint' },
  assets: { title: '行囊与据点', eyebrow: 'ASSETS', glyph: '▣', tone: 'blue' },
  rules: { title: '协议诊断', eyebrow: 'PROTOCOL', glyph: '⚙', tone: 'slate' },
});

const DOMAIN_BY_SHARD = Object.freeze({
  protagonist: '主角档案',
  world: '世界',
  loop: '轮回',
  relations: '关系',
  events: '事件',
  clues: '线索',
  assets: '资产',
  rules: '规则',
});

function valueLabel(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === null || value === undefined || value === '') return '未记录';
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '无';
  if (typeof value === 'object') return `${Object.keys(value).length} 项`;
  return String(value);
}

function flattenFields(value, prefix = '', output = [], depth = 0) {
  if (depth > 8) {
    output.push({ path: prefix, value: '层级过深，已折叠' });
    return output;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) output.push({ path: prefix, value: '无' });
    else value.forEach((item, index) => flattenFields(item, `${prefix}[${index}]`, output, depth + 1));
    return output;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) output.push({ path: prefix, value: '空记录' });
    else entries.forEach(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenFields(child, path, output, depth + 1);
    });
    return output;
  }
  output.push({ path: prefix, value: valueLabel(value) });
  return output;
}

function makeGroups(source) {
  const record = asRecord(source);
  return Object.entries(record).map(([key, value]) => ({
    id: key,
    title: key,
    summary: valueLabel(value),
    fields: flattenFields(value, key),
  }));
}

function recordList(value, category) {
  return Object.entries(asRecord(value)).map(([id, item]) => ({
    id,
    category,
    ...asRecord(item),
  }));
}

function relationshipList(relations) {
  const root = asRecord(relations);
  return [
    ...recordList(root.伴侣, '伴侣'),
    ...recordList(root.契约伙伴, '契约伙伴'),
    ...recordList(root.人物, '人物'),
  ].map((person) => ({
    ...person,
    name: person.id,
    portrait: resolvePersonPortrait(person.id),
  }));
}

function makeShard(id, source, options = {}) {
  const meta = SHARD_META[id];
  const record = asRecord(source);
  return Object.freeze({
    id,
    ...meta,
    domain: DOMAIN_BY_SHARD[id],
    summary: options.summary || `${Object.keys(record).length} 个记录组`,
    metric: options.metric ?? Object.keys(record).length,
    records: Object.freeze(options.records || []),
    groups: Object.freeze(makeGroups(record)),
    raw: record,
  });
}

export function resolvePersonPortrait(name) {
  return resolveSpeaker(asText(name, '未知人物'), CHARACTER_REGISTRY);
}

export function buildShardModel(statData, uiState = {}) {
  const root = asRecord(statData);
  const hud = buildHudModel(root, uiState);
  const world = asRecord(root.世界);
  const protagonist = asRecord(root.主角档案);
  const loop = asRecord(root.轮回);
  const relations = asRecord(root.关系);
  const events = asRecord(root.事件);
  const clues = asRecord(root.线索);
  const assets = asRecord(root.资产);
  const rules = asRecord(root.规则);
  const people = relationshipList(relations);
  const activeEvents = recordList(events.进行中, '进行中');
  const recentEvents = recordList(events.近期记录, '近期记录');
  const currentClues = recordList(clues.当前线索, '当前线索');
  const currencies = recordList(assets.货币, '货币');
  const items = recordList(assets.物品, '物品');
  const equipment = recordList(assets.装备, '装备');
  const locations = recordList(assets.据点与存放, '据点与存放');

  const shards = [
    makeShard('protagonist', protagonist, {
      summary: `${asText(protagonist.姓名, '未命名')} · ${asText(protagonist.生存状态, '未知')}`,
      metric: hud.overview.instruments.length,
      records: [
        ...hud.protagonist.injuries,
        ...hud.protagonist.abnormalities,
        ...hud.protagonist.abilities.flatMap((group) => group.items),
      ],
    }),
    makeShard('world', world, {
      summary: `${hud.overview.location.filter(Boolean).join(' · ') || '地点未记录'} · ${hud.overview.crisis}危机`,
      metric: hud.world.movements.length + hud.world.factions.length,
      records: [...hud.world.movements, ...hud.world.factions],
    }),
    makeShard('loop', loop, {
      summary: `第 ${hud.overview.loop.number || 0} 轮 · 重启 ${hud.overview.loop.restarts || 0} 次`,
      metric: hud.loop.deaths.length,
      records: hud.loop.deaths,
    }),
    makeShard('relations', relations, {
      summary: `${people.length} 位关系人物在线`,
      metric: people.length,
      records: people,
    }),
    makeShard('events', events, {
      summary: `${activeEvents.length} 个进行中 · ${recentEvents.length} 条近期记录`,
      metric: activeEvents.length,
      records: [...activeEvents, ...recentEvents],
    }),
    makeShard('clues', clues, {
      summary: `${currentClues.length} 条线索 · ${asList(clues.未解问题).length} 个未解问题`,
      metric: currentClues.length,
      records: currentClues,
    }),
    makeShard('assets', assets, {
      summary: `${items.length + equipment.length} 件物品/装备 · ${locations.length} 个据点`,
      metric: items.length + equipment.length + currencies.length,
      records: [...currencies, ...items, ...equipment, ...locations],
    }),
    makeShard('rules', rules, {
      summary: hud.diagnostics.unknown.length ? `${hud.diagnostics.unknown.length} 个未知字段` : '协议正常',
      metric: hud.diagnostics.unknown.length,
      records: hud.diagnostics.unknown,
    }),
  ];

  return Object.freeze({
    readOnly: true,
    theme: hud.theme,
    overview: hud.overview,
    protagonist: hud.protagonist,
    people: Object.freeze(people),
    shards: Object.freeze(shards),
    diagnostics: Object.freeze({
      unknown: Object.freeze(hud.diagnostics.unknown),
      declaredLeafCount: expandDeclaredPaths().length,
      domainCounts: DECLARED_DOMAIN_COUNTS,
    }),
    coverage: Object.freeze({
      declaredLeafCount: expandDeclaredPaths().length,
      domainCounts: DECLARED_DOMAIN_COUNTS,
    }),
    initials: Object.freeze({
      protagonist: firstGrapheme(protagonist.姓名),
    }),
  });
}
