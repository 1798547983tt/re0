import {
  ABILITY_CATEGORIES,
  DECLARED_DOMAIN_COUNTS,
  isDeclaredPath,
} from './schema-map.mjs';

export const NAV_SECTIONS = Object.freeze([
  { id: 'overview', label: '概览', glyph: '✦' },
  { id: 'protagonist', label: '主角', glyph: '♙' },
  { id: 'world', label: '世界', glyph: '⌖' },
  { id: 'relations', label: '人际', glyph: '♢' },
  { id: 'loop', label: '轮回', glyph: '∞' },
  { id: 'events', label: '事件', glyph: '◇' },
  { id: 'clues', label: '线索', glyph: '⌕' },
  { id: 'assets', label: '行囊', glyph: '▣' },
  { id: 'music', label: '音乐', glyph: '♫' },
]);

export function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function asText(value, fallback = '未记录') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function clampMeter(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

export function clampSignedMeter(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(-100, number)) : fallback;
}

export function resolveTheme(period, preference = 'auto') {
  const normalizedPeriod = asText(period, '时段未详');
  const transition = normalizedPeriod === '黎明'
    ? 'dawn'
    : normalizedPeriod === '傍晚'
      ? 'dusk'
      : 'steady';
  const automatic = ['夜间', '深夜', '凌晨'].includes(normalizedPeriod) ? 'night' : 'day';
  const normalizedPreference = ['day', 'night'].includes(preference) ? preference : 'auto';
  return {
    mode: normalizedPreference === 'auto' ? automatic : normalizedPreference,
    automatic,
    transition,
    preference: normalizedPreference,
    period: normalizedPeriod,
  };
}

export function firstGrapheme(name) {
  const normalized = asText(name, '').trim();
  if (!normalized) return '?';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segment = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
      .segment(normalized)[Symbol.iterator]().next().value;
    if (segment?.segment) return segment.segment;
  }
  return Array.from(normalized)[0] || '?';
}

function flattenLeaves(value, prefix = '', output = []) {
  if (Array.isArray(value)) {
    if (prefix) output.push({ path: prefix, value });
    return output;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flattenLeaves(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  if (prefix) output.push({ path: prefix, value });
  return output;
}

export function collectUnknownPaths(statData) {
  return flattenLeaves(asRecord(statData)).filter((entry) => !isDeclaredPath(entry.path));
}

function recordEntries(value, category) {
  return Object.entries(asRecord(value)).map(([id, item]) => ({
    id,
    category,
    ...asRecord(item),
  }));
}

function relationshipEntries(relations) {
  return [
    ...recordEntries(relations.伴侣, '伴侣').map((person) => ({ name: person.id, ...person })),
    ...recordEntries(relations.契约伙伴, '契约伙伴').map((person) => ({ name: person.id, ...person })),
    ...recordEntries(relations.人物, '人物').map((person) => ({ name: person.id, ...person })),
  ];
}

function buildInstruments(protagonist) {
  return [
    { id: 'life', label: '生命', value: clampMeter(protagonist.生命), tone: 'vital' },
    { id: 'stamina', label: '体力', value: clampMeter(protagonist.体力), tone: 'stamina' },
    { id: 'mana', label: '魔力', value: clampMeter(protagonist.魔力), tone: 'mana' },
    { id: 'spirit', label: '精神稳定', value: clampMeter(protagonist.精神稳定), tone: 'spirit' },
    { id: 'gate', label: '门负荷', value: clampMeter(protagonist.门负荷), tone: 'risk', inverse: true },
    { id: 'scent', label: '魔女余香', value: clampMeter(protagonist.魔女余香), tone: 'witch', inverse: true },
  ];
}

function buildAlerts(world, protagonist, events) {
  const alerts = [];
  if (!['无', '低'].includes(asText(world.危机等级, '无'))) {
    alerts.push({ kind: 'crisis', title: `${world.危机等级}危机`, detail: asText(world.环境?.描述, '周遭风险正在升高') });
  }
  for (const [id, injury] of Object.entries(asRecord(protagonist.伤势))) {
    const item = asRecord(injury);
    alerts.push({ kind: 'injury', title: `${asText(item.部位, id)} · ${asText(item.程度)}`, detail: asText(item.描述, '伤势详情未记录') });
  }
  for (const [id, abnormal] of Object.entries(asRecord(protagonist.异常状态))) {
    const item = asRecord(abnormal);
    alerts.push({ kind: 'abnormal', title: asText(item.类型, id), detail: asText(item.剩余表现) });
  }
  for (const [id, event] of Object.entries(asRecord(events.进行中))) {
    const item = asRecord(event);
    if (['紧急', '危险', '失控'].some((word) => asText(item.状态, '').includes(word))) {
      alerts.push({ kind: 'event', title: asText(item.标题, id), detail: asText(item.状态) });
    }
  }
  return alerts.slice(0, 3);
}

function buildOverview(world, protagonist, loop, events) {
  const time = asRecord(world.当前时间);
  const location = asRecord(world.当前地点);
  const environment = asRecord(world.环境);
  return {
    time: {
      date: asText(time.规范日期),
      period: asText(time.时段, '时段未详'),
      layer: asText(time.时间层, '主线'),
      branch: asText(time.轮回分支, 'B00'),
    },
    location: [location.国家, location.地区, location.场所, location.具体位置]
      .map((value) => asText(value, ''))
      .filter(Boolean),
    environment: {
      weather: asText(environment.天气),
      light: asText(environment.光照),
      description: asText(environment.描述),
    },
    crisis: asText(world.危机等级, '无'),
    protagonist: {
      name: asText(protagonist.姓名),
      identity: asText(protagonist.身份),
      status: asText(protagonist.生存状态, '存活'),
      form: asText(protagonist.当前形态, '常态'),
      locked: protagonist.主角锁定 === true,
    },
    instruments: buildInstruments(protagonist),
    target: asText(protagonist.当前目标, '无'),
    loop: {
      number: Math.max(0, Number(loop.当前轮回编号) || 0),
      restarts: Math.max(0, Number(loop.世界重启次数) || 0),
      checkpointValid: asRecord(loop.存档点).有效 === true,
    },
    alerts: buildAlerts(world, protagonist, events),
  };
}

function abilityGroups(protagonist) {
  const abilities = asRecord(protagonist.能力);
  return ABILITY_CATEGORIES.map((category) => ({
    category,
    items: recordEntries(abilities[category], category),
  }));
}

export function buildHudModel(statData, uiState = {}) {
  const root = asRecord(statData);
  const world = asRecord(root.世界);
  const protagonist = asRecord(root.主角档案);
  const loop = asRecord(root.轮回);
  const relations = asRecord(root.关系);
  const events = asRecord(root.事件);
  const clues = asRecord(root.线索);
  const assets = asRecord(root.资产);
  const rules = asRecord(root.规则);
  const time = asRecord(world.当前时间);

  return Object.freeze({
    readOnly: true,
    theme: resolveTheme(time.时段, uiState.themePreference),
    sections: NAV_SECTIONS,
    overview: buildOverview(world, protagonist, loop, events),
    protagonist: {
      raw: protagonist,
      injuries: recordEntries(protagonist.伤势, '伤势'),
      abnormalities: recordEntries(protagonist.异常状态, '异常状态'),
      abilities: abilityGroups(protagonist),
    },
    world: {
      raw: world,
      movements: recordEntries(world.动向, '动向'),
      factions: recordEntries(world.势力态势, '势力态势'),
    },
    loop: {
      raw: loop,
      deaths: recordEntries(loop.菜月昴死亡记录, '死亡记录'),
    },
    relations: {
      raw: relations,
      people: relationshipEntries(relations),
    },
    events: {
      raw: events,
      active: recordEntries(events.进行中, '进行中'),
      recent: recordEntries(events.近期记录, '近期记录'),
    },
    clues: {
      raw: clues,
      current: recordEntries(clues.当前线索, '当前线索'),
      questions: asList(clues.未解问题),
    },
    assets: {
      raw: assets,
      currencies: recordEntries(assets.货币, '货币'),
      items: recordEntries(assets.物品, '物品'),
      equipment: recordEntries(assets.装备, '装备'),
      locations: recordEntries(assets.据点与存放, '据点与存放'),
    },
    rules,
    diagnostics: {
      schemaVersion: asText(rules.schema版本),
      initialized: rules.初始化完成 === true,
      declaredDomainCounts: DECLARED_DOMAIN_COUNTS,
      unknown: collectUnknownPaths(root),
    },
  });
}
