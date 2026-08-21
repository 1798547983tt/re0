import {
  asList,
  asRecord,
  asText,
  buildHudModel,
} from '../../statusbar/src/status-core.mjs';
import { CHARACTER_REGISTRY, resolveSpeaker } from '../../narrative/src/character-registry.mjs';

export const REPLICA_NAV_IDS = Object.freeze([
  'details',
  'world',
  'events',
  'assets',
  'loop',
  'info',
]);

const NAV_META = Object.freeze({
  details: { label: '档案', glyph: '✦', domain: 'protagonist' },
  world: { label: '世界', glyph: '▽', domain: 'world' },
  events: { label: '事件', glyph: '◌', domain: 'events' },
  assets: { label: '资产', glyph: '♧', domain: 'assets' },
  loop: { label: '轮回', glyph: '✣', domain: 'loop' },
  info: { label: '信息', glyph: '▣', domain: 'relations' },
});

const ICONS = Object.freeze(['✦', '◈', '◇', '◌', '✣', '▣']);
const REPLICA_CHARACTER_KEYS = Object.freeze({
  '艾米莉亚': 'emilia',
  '爱蜜莉雅': 'emilia',
  '菜月昴': 'natsuki-subaru',
  '蕾姆': 'rem',
});

function valueText(value, fallback = '未记录') {
  if (value === true) return '是';
  if (value === false) return '否';
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '无';
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '空记录';
    return entries.slice(0, 6).map(([key, child]) => `${key}：${valueText(child)}`).join('；');
  }
  return String(value);
}

function slot(number, title, detail, options = {}) {
  return Object.freeze({
    number,
    icon: options.icon || ICONS[number - 1] || '◇',
    title,
    summary: options.summary || valueText(detail),
    detail: valueText(detail),
    active: options.active !== false && valueText(detail) !== '未记录',
    generated: false,
    sourcePath: options.sourcePath || '',
    tone: options.tone || 'violet',
  });
}

function firstEntries(record, limit = 6) {
  return Object.entries(asRecord(record)).slice(0, limit);
}

function recordText(record, fields = []) {
  const root = asRecord(record);
  if (!fields.length) return valueText(root);
  return fields.map((field) => `${field}：${valueText(root[field])}`).join('；');
}

function personFromState(root, name, base) {
  const protagonist = asRecord(root.主角档案);
  if (name && name === protagonist.姓名) {
    const resolved = resolveSpeaker(name);
    return {
      name,
      category: '主角',
      portrait: { ...resolved, portraitKey: REPLICA_CHARACTER_KEYS[name] || resolved.portraitKey },
      state: protagonist,
    };
  }
  const people = base.relations.people || [];
  const found = people.find((person) => person.name === name);
  if (found) return { ...found, portrait: resolveSpeaker(found.name), state: found };
  const fallback = resolveSpeaker(name || protagonist.姓名 || '未知人物');
  return { name: name || fallback.displayName, category: '人物', portrait: fallback, state: {} };
}

function buildDetailsSlots(root, base, person) {
  const state = asRecord(person.state);
  const injury = firstEntries(state.伤势, 2).map(([id, item]) => `${id}：${recordText(item, ['部位', '程度', '描述'])}`).join('；');
  const abilities = base.protagonist.abilities.flatMap((group) => group.items)
    .slice(0, 8)
    .map((item) => `${item.category}/${item.id}：${valueText(item.状态)}`)
    .join('；');
  return [
    slot(1, '身份', recordText(state, ['姓名', '角色类型', '性别', '种族', '身份', '阵营']), { sourcePath: '主角档案' }),
    slot(2, '生存状态', recordText(state, ['生存状态', '生命', '体力', '魔力', '精神稳定']), { sourcePath: '主角档案.生存状态', tone: 'rose' }),
    slot(3, '当前目标', state.当前目标, { sourcePath: '主角档案.当前目标', tone: 'gold' }),
    slot(4, '伤势与异常', [injury, valueText(state.异常状态)].filter(Boolean).join('；'), { sourcePath: '主角档案.伤势', tone: 'ember' }),
    slot(5, '能力记录', abilities, { sourcePath: '主角档案.能力', tone: 'cyan' }),
    slot(6, '形态与战力', recordText(state, ['当前形态', '门状态', '门负荷', '魔女余香']), { sourcePath: '主角档案.当前形态', tone: 'mint' }),
  ];
}

function buildWorldSlots(root, base) {
  const world = asRecord(root.世界);
  const time = asRecord(world.当前时间);
  const location = asRecord(world.当前地点);
  const environment = asRecord(world.环境);
  const movement = firstEntries(world.动向, 3).map(([id, item]) => `${id}：${recordText(item, ['标题', '阶段', '类型', '地点', '描述'])}`).join('；');
  const factions = firstEntries(world.势力态势, 3).map(([id, item]) => `${id}：${recordText(item, ['立场', '状态', '描述'])}`).join('；');
  return [
    slot(1, '当前时间', recordText(time, ['规范日期', '时段', '时间层', '轮回分支']), { sourcePath: '世界.当前时间', tone: 'cyan' }),
    slot(2, '当前地点', recordText(location, ['国家', '地区', '场所', '具体位置']), { sourcePath: '世界.当前地点', tone: 'violet' }),
    slot(3, '环境', recordText(environment, ['天气', '光照', '描述']), { sourcePath: '世界.环境', tone: 'blue' }),
    slot(4, '危机等级', world.危机等级, { sourcePath: '世界.危机等级', tone: 'rose' }),
    slot(5, '世界动向', movement, { sourcePath: '世界.动向', tone: 'gold' }),
    slot(6, '势力态势', factions, { sourcePath: '世界.势力态势', tone: 'mint' }),
  ];
}

function buildEventSlots(root, base) {
  const events = asRecord(root.事件);
  const active = base.events.active || [];
  const recent = base.events.recent || [];
  const abilityGroups = base.protagonist.abilities || [];
  const activeText = active.map((item) => `${item.id}：${recordText(item, ['标题', '状态', '地点', '目标', '描述'])}`).join('；');
  const recentText = recent.map((item) => `${item.id}：${recordText(item, ['标题', '结果', '规范日期', '描述'])}`).join('；');
  const abilityText = abilityGroups.map((group) => `${group.category}：${group.items.map((item) => item.id).join('、') || '无'}`).join('；');
  return [
    slot(1, '进行中事件', activeText, { sourcePath: '事件.进行中', tone: 'rose' }),
    slot(2, '近期记录', recentText, { sourcePath: '事件.近期记录', tone: 'gold' }),
    slot(3, '当前行动', active.map((item) => item.参与者 || []).flat(), { sourcePath: '事件.进行中.参与者', tone: 'cyan' }),
    slot(4, '能力行迹', abilityText, { sourcePath: '主角档案.能力', tone: 'violet' }),
    slot(5, '事件阶段', active.map((item) => `${item.标题 || item.id}：${item.阶段 || '未记录'}`).join('；'), { sourcePath: '事件.进行中.阶段', tone: 'mint' }),
    slot(6, '事件目标', active.map((item) => item.目标 || '').filter(Boolean).join('；'), { sourcePath: '事件.进行中.目标', tone: 'blue' }),
  ];
}

function buildAssetSlots(root, base) {
  const assets = asRecord(root.资产);
  const currencies = firstEntries(assets.货币, 4).map(([id, item]) => `${id}：${recordText(item, ['数量', '持有者', '存放位置'])}`).join('；');
  const items = firstEntries(assets.物品, 4).map(([id, item]) => `${id}：${recordText(item, ['名称', '数量', '持有者', '存放位置', '描述'])}`).join('；');
  const equipment = firstEntries(assets.装备, 4).map(([id, item]) => `${id}：${recordText(item, ['名称', '装备状态', '损耗', '当前效果'])}`).join('；');
  const bases = firstEntries(assets.据点与存放, 4).map(([id, item]) => `${id}：${recordText(item, ['名称', '位置', '控制者', '状态'])}`).join('；');
  return [
    slot(1, '货币', currencies, { sourcePath: '资产.货币', tone: 'gold' }),
    slot(2, '物品', items, { sourcePath: '资产.物品', tone: 'cyan' }),
    slot(3, '装备', equipment, { sourcePath: '资产.装备', tone: 'violet' }),
    slot(4, '据点与存放', bases, { sourcePath: '资产.据点与存放', tone: 'mint' }),
    slot(5, '持有者', [...base.assets.items, ...base.assets.equipment].map((item) => item.持有者).filter(Boolean), { sourcePath: '资产', tone: 'blue' }),
    slot(6, '资产状态', [...base.assets.locations, ...base.assets.equipment].map((item) => item.状态 || item.装备状态).filter(Boolean), { sourcePath: '资产', tone: 'rose' }),
  ];
}

function buildLoopSlots(root, base) {
  const loop = asRecord(root.轮回);
  const checkpoint = asRecord(loop.存档点);
  const restart = asRecord(loop.最近一次重启);
  const deaths = firstEntries(loop.菜月昴死亡记录, 3).map(([id, item]) => `${id}：${recordText(item, ['重启编号', '死亡时规范日期与时段', '死亡时地点', '直接原因', '死亡经过与最后行动'])}`).join('；');
  const clues = asRecord(root.线索);
  return [
    slot(1, '轮回编号', recordText(loop, ['当前轮回编号', '世界重启次数']), { sourcePath: '轮回', tone: 'rose' }),
    slot(2, '存档点', recordText(checkpoint, ['有效', '创建时间']), { sourcePath: '轮回.存档点', tone: 'gold' }),
    slot(3, '最近一次重启', recordText(restart, ['死亡事件ID', '重启编号', '触发时间', '恢复结果']), { sourcePath: '轮回.最近一次重启', tone: 'violet' }),
    slot(4, '死亡记录', deaths, { sourcePath: '轮回.菜月昴死亡记录', tone: 'rose' }),
    slot(5, '当前线索', firstEntries(clues.当前线索, 4).map(([id, item]) => `${id}：${recordText(item, ['标题', '状态', '关联事件', '描述', '下一步'])}`).join('；'), { sourcePath: '线索.当前线索', tone: 'cyan' }),
    slot(6, '未解问题', asList(clues.未解问题), { sourcePath: '线索.未解问题', tone: 'mint' }),
  ];
}

function buildInfoSlots(root, base) {
  const relations = base.relations.people || [];
  const eventText = base.events.active.map((item) => `${item.标题 || item.id}：${item.状态 || '未记录'}`).join('；');
  const unknown = base.diagnostics.unknown || [];
  return [
    slot(1, '关系人物', relations.map((person) => `${person.name}：${person.关系阶段 || person.category}`).join('；'), { sourcePath: '关系', tone: 'violet' }),
    slot(2, '人物地点', relations.map((person) => `${person.name}：${person.当前地点 || '未记录'}`).join('；'), { sourcePath: '关系.人物.当前地点', tone: 'cyan' }),
    slot(3, '人物行动', relations.map((person) => `${person.name}：${person.当前行动 || '未记录'}`).join('；'), { sourcePath: '关系.人物.当前行动', tone: 'gold' }),
    slot(4, '关联事件', eventText, { sourcePath: '事件.进行中', tone: 'rose' }),
    slot(5, '协议状态', recordText(root.规则, ['schema版本', '初始化完成']), { sourcePath: '规则', tone: 'mint' }),
    slot(6, '未知字段', unknown.map((entry) => `${entry.path}：${valueText(entry.value)}`), { sourcePath: '诊断', tone: 'blue' }),
  ];
}

function buildPage(id, root, base, person) {
  const meta = NAV_META[id];
  let slots;
  if (id === 'details') slots = buildDetailsSlots(root, base, person);
  else if (id === 'world') slots = buildWorldSlots(root, base);
  else if (id === 'events') slots = buildEventSlots(root, base);
  else if (id === 'assets') slots = buildAssetSlots(root, base);
  else if (id === 'loop') slots = buildLoopSlots(root, base);
  else slots = buildInfoSlots(root, base);
  return Object.freeze({ id, label: meta.label, glyph: meta.glyph, domain: meta.domain, slots: Object.freeze(slots) });
}

function buildRail(root, base, activeName) {
  const entries = [];
  const protagonistName = asText(root.主角档案?.姓名, '主角');
  entries.push({ ...personFromState(root, protagonistName, base), active: protagonistName === activeName });
  for (const person of base.people || base.relations.people || []) {
    if (entries.some((entry) => entry.name === person.name)) continue;
    entries.push({ ...personFromState(root, person.name, base), active: person.name === activeName });
  }
  for (const entry of CHARACTER_REGISTRY) {
    if (entries.length >= 10) break;
    if (entries.some((item) => item.name === entry.displayName)) continue;
    entries.push({
      name: entry.displayName,
      category: '人物',
      portrait: entry,
      state: {},
      active: entry.displayName === activeName,
      fallback: true,
    });
  }
  return Object.freeze(entries.slice(0, 10));
}

export function buildReplicaModel(statData, options = {}) {
  const root = asRecord(statData);
  const base = buildHudModel(root, { themePreference: 'night' });
  const activeName = asText(options.personName || base.overview.protagonist.name, base.overview.protagonist.name);
  const activePerson = personFromState(root, activeName, base);
  const navigation = REPLICA_NAV_IDS.map((id) => buildPage(id, root, base, activePerson));
  const selectedPage = REPLICA_NAV_IDS.includes(options.pageId) ? options.pageId : 'details';
  return Object.freeze({
    readOnly: true,
    navigation: Object.freeze(navigation),
    selectedPage,
    activePerson: Object.freeze(activePerson),
    people: buildRail(root, base, activeName),
    activePill: '已激活',
    uid: asText(options.uid, `RE0-${asText(root.规则?.schema版本, 'STATE')}`),
    theme: 'night',
    coverage: base.diagnostics,
  });
}
