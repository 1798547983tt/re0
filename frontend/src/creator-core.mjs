export const DRAFT_VERSION = 're0-creator-draft-v1';

export const STEP_DEFINITIONS = [
  { id: 'identity', index: 1, label: '身份', title: '先让世界记住你的名字', kicker: 'IDENTITY / NAME' },
  { id: 'origin', index: 2, label: '出身', title: '从哪里来，决定你看见什么', kicker: 'ORIGIN / FACTION' },
  { id: 'heart', index: 3, label: '内心', title: '愿望与底线会互相拉扯', kicker: 'HEART / BOUNDARY' },
  { id: 'arsenal', index: 4, label: '羁绊', title: '把能力与重要的人带上路', kicker: 'BONDS / ARSENAL' },
  { id: 'review', index: 5, label: '启程', title: '在第一页之前，确认你是谁', kicker: 'REVIEW / DEPARTURE' },
];

export const ROLE_TYPES = ['原创角色', '原作人物', '异界来客'];
export const FACTIONS = ['中立', '爱蜜莉雅阵营', '库珥修阵营', '安娜塔西亚阵营', '普莉希拉阵营', '露格尼卡王国', '沃拉基亚帝国', '魔女教', '其他'];
export const RELATION_STANCES = ['友方', '中立', '戒备', '敌对', '未知'];
export const ABILITY_CATEGORIES = ['加护', '权能', '魔法', '精灵术', '种族能力', '武技', '一般技能'];
export const COMBAT_TIER_LEVELS = ['1阶', '2阶', '3阶', '4阶', '5阶', '6阶', '7阶'];
export const COMBAT_TIER_POSITIONS = ['上位', '下位'];
export const COMBAT_STATUSES = ['可战', '受限', '无法战斗', '未知'];

const EMPTY_COMBAT_TIER = {
  level: '',
  position: '',
  combatStatus: '未知',
  condition: '',
};

const EMPTY_ANCHOR = {
  volumeNumber: null,
  volumeTitle: '',
  eventId: null,
  eventTitle: '',
  eventTime: '',
  date: '',
  period: '',
  layer: '',
  note: '',
};

export function createDefaultDraft() {
  return {
    version: DRAFT_VERSION,
    protagonist: {
      name: '',
      roleType: '',
      gender: '',
      race: '',
      identity: '',
      faction: '中立',
      appearance: '',
      clothing: '',
      survival: '存活',
      currentGoal: '',
    },
    storyAnchor: { ...EMPTY_ANCHOR },
    combatTier: { ...EMPTY_COMBAT_TIER },
    personality: {
      traits: [],
      wish: '',
      fear: '',
      desire: '',
      boundary: '',
      speechStyle: '',
      habits: '',
      secret: '',
    },
    abilities: [],
    relationships: [],
    assets: {
      currency: [],
      items: [],
      equipment: [],
    },
    world: {
      currentLocation: '',
      entryContext: '',
      difficulty: '标准',
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value == null ? '' : String(value).trim();
}

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeStoryIndex(raw) {
  return asArray(raw)
    .map((volume) => ({
      number: Number(volume.number),
      title: asText(volume.title),
      displayTitle: asText(volume.displayTitle) || asText(volume.events?.[0]?.title),
      events: asArray(volume.events).map((event) => ({
        id: Number(event.id),
        title: asText(event.title),
        time: asText(event.time),
        date: asText(event.date),
        period: asText(event.period),
        layer: asText(event.layer),
        note: asText(event.note),
        timeDescription: asText(event.timeDescription),
      })).filter((event) => Number.isFinite(event.id) && event.title),
    }))
    .filter((volume) => Number.isFinite(volume.number) && volume.title)
    .sort((left, right) => left.number - right.number);
}

export function getStoryVolume(storyIndex, volumeNumber) {
  const target = Number(volumeNumber);
  return normalizeStoryIndex(storyIndex).find((volume) => volume.number === target) ?? null;
}

export function getStoryEvent(storyIndex, volumeNumber, eventId) {
  const volume = getStoryVolume(storyIndex, volumeNumber);
  if (!volume) return null;
  const target = Number(eventId);
  return volume.events.find((event) => event.id === target) ?? null;
}

function error(path, message) {
  return { path, message };
}

export function validateDraft(draft) {
  const value = draft ?? {};
  const errors = [];
  if (!asText(value.protagonist?.name)) errors.push(error('protagonist.name', '请先写下角色名'));
  if (!ROLE_TYPES.includes(asText(value.protagonist?.roleType))) errors.push(error('protagonist.roleType', '请选择角色类型'));
  if (value.storyAnchor?.volumeNumber == null || value.storyAnchor.volumeNumber === '' || !Number.isFinite(Number(value.storyAnchor.volumeNumber))) errors.push(error('storyAnchor.volumeNumber', '请选择剧情卷数'));
  if (value.storyAnchor?.eventId == null || value.storyAnchor.eventId === '' || !Number.isFinite(Number(value.storyAnchor.eventId))) errors.push(error('storyAnchor.eventId', '请选择剧情事件'));
  if (!asText(value.personality?.wish)) errors.push(error('personality.wish', '请写下一句话愿望'));
  if (!COMBAT_TIER_LEVELS.includes(asText(value.combatTier?.level))) errors.push(error('combatTier.level', '请选择1至7阶战力'));
  if (!COMBAT_TIER_POSITIONS.includes(asText(value.combatTier?.position))) errors.push(error('combatTier.position', '请选择上位或下位'));
  return { ok: errors.length === 0, errors };
}

function normalizeCombatTier(combatTier) {
  const level = asText(combatTier?.level);
  const position = asText(combatTier?.position);
  const combatStatus = asText(combatTier?.combatStatus);
  return {
    level: COMBAT_TIER_LEVELS.includes(level) ? level : '未定',
    position: COMBAT_TIER_POSITIONS.includes(position) ? position : '未定',
    combatStatus: COMBAT_STATUSES.includes(combatStatus) ? combatStatus : '未知',
    condition: asText(combatTier?.condition) || '无',
  };
}

function normalizeAbility(ability) {
  return {
    name: asText(ability?.name),
    category: asText(ability?.category) || '一般技能',
    status: asText(ability?.status) || '可用',
    cost: asText(ability?.cost) || '无',
    description: asText(ability?.description),
    limits: asText(ability?.limits),
  };
}

function normalizeRelationship(relationship) {
  const trust = Number(relationship?.trust);
  return {
    name: asText(relationship?.name),
    relation: asText(relationship?.relation),
    stance: RELATION_STANCES.includes(relationship?.stance) ? relationship.stance : '未知',
    trust: Number.isFinite(trust) ? Math.max(0, Math.min(100, trust)) : 0,
    notes: asText(relationship?.notes),
  };
}

function normalizeAsset(asset) {
  const quantity = Number(asset?.quantity);
  return {
    name: asText(asset?.name),
    quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
    description: asText(asset?.description),
  };
}

const VALID_PERIODS = ['黎明', '清晨', '上午', '正午', '下午', '傍晚', '夜间', '深夜', '凌晨'];
const VALID_LAYERS = ['主线', '轮回分支', '历史回溯', '试炼幻境'];
const VALID_AVAILABILITY = ['可用', '受限', '冷却中', '不可用', '已失去', '未知'];

function normalizePeriod(period) {
  const raw = asText(period);
  if (VALID_PERIODS.includes(raw)) return raw;
  const matches = VALID_PERIODS
    .map((value) => ({ value, index: raw.indexOf(value) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  return matches[0]?.value ?? '时段未详';
}

function normalizeLayer(layer) {
  const raw = asText(layer);
  if (raw.startsWith('轮回分支')) return '轮回分支';
  return VALID_LAYERS.includes(raw) ? raw : '主线';
}

function normalizeBranch(layer) {
  const raw = asText(layer);
  if (!raw.startsWith('轮回分支')) return 'B00';
  const branchNumber = Number(raw.match(/\d+/)?.[0]);
  return Number.isFinite(branchNumber) ? `B${String(branchNumber).padStart(2, '0')}` : 'B01';
}

function normalizeAvailability(status) {
  const raw = asText(status);
  if (VALID_AVAILABILITY.includes(raw)) return raw;
  if (raw.includes('冷却')) return '冷却中';
  if (raw.includes('封印') || raw.includes('禁用')) return '不可用';
  return raw ? '受限' : '未知';
}

export function buildStatePayload(draft) {
  const value = draft ?? createDefaultDraft();
  const anchor = value.storyAnchor ?? EMPTY_ANCHOR;
  const combatTier = normalizeCombatTier(value.combatTier);
  const eventTimeParts = asText(anchor.eventTime).split(' · ');
  const rawPeriod = asText(anchor.period) || eventTimeParts[1];
  const rawLayer = asText(anchor.layer) || eventTimeParts[2];
  const timeParts = {
    规范日期: asText(anchor.date) || eventTimeParts[0],
    时段: normalizePeriod(rawPeriod),
    时间层: normalizeLayer(rawLayer),
    轮回分支: normalizeBranch(rawLayer),
  };
  const abilityRecords = Object.fromEntries(ABILITY_CATEGORIES.map((category) => [category, {}]));
  asArray(value.abilities).filter((ability) => asText(ability?.name)).forEach((ability) => {
    const item = normalizeAbility(ability);
    const category = ABILITY_CATEGORIES.includes(item.category) ? item.category : '一般技能';
    const customCategory = category === item.category ? '' : `自定义类别：${item.category}。`;
    abilityRecords[category][item.name] = {
      状态: item.status,
      可用性: normalizeAvailability(item.status),
      消耗或冷却: item.cost,
      描述: [customCategory, item.description, item.limits ? `限制：${item.limits}` : ''].filter(Boolean).join(' '),
    };
  });
  const relationshipRecord = {};
  asArray(value.relationships).filter((relationship) => asText(relationship?.name)).forEach((relationship) => {
    const item = normalizeRelationship(relationship);
    relationshipRecord[item.name] = {
      身份: item.relation,
      阵营: '',
      关系阶段: item.stance,
      立场: item.stance,
      好感: item.trust,
      信任: item.trust,
      生存状态: '存活',
      当前地点: '',
      当前行动: '',
      当前形态: '正常',
      备注: item.notes,
    };
  });
  const items = {};
  asArray(value.assets?.items).filter((item) => asText(item?.name) && Number(item.quantity) > 0).forEach((asset) => {
    const item = normalizeAsset(asset);
    items[item.name] = { 名称: item.name, 数量: item.quantity, 持有者: value.protagonist?.name || '主角', 存放位置: '', 描述: item.description };
  });
  const equipment = {};
  asArray(value.assets?.equipment).filter((item) => asText(item?.name)).forEach((asset) => {
    const item = normalizeAsset(asset);
    equipment[item.name] = { 名称: item.name, 持有者: value.protagonist?.name || '主角', 装备状态: '未装备', 损耗: 0, 当前效果: item.description };
  });
  const currency = {};
  asArray(value.assets?.currency).filter((item) => asText(item?.name) && Number(item.quantity) > 0).forEach((asset) => {
    const item = normalizeAsset(asset);
    currency[item.name] = { 数量: item.quantity, 持有者: value.protagonist?.name || '主角', 存放位置: '' };
  });
  const creatorRoleType = asText(value.protagonist?.roleType);
  const activeEvents = {};
  if (anchor.eventId != null && asText(anchor.eventTitle)) {
    activeEvents[String(anchor.eventId)] = {
      标题: asText(anchor.eventTitle),
      类型: asText(anchor.layer) || '主线',
      阶段: '起',
      状态: '进行中',
      地点: asText(value.world?.currentLocation),
      参与者: [],
      目标: asText(value.protagonist?.currentGoal) || '无',
      描述: asText(anchor.timeDescription) || asText(anchor.note),
    };
  }
  return {
    世界: {
      当前时间: timeParts,
      当前地点: {
        国家: '',
        地区: '',
        场所: asText(value.world?.currentLocation),
        具体位置: asText(value.world?.entryContext),
      },
      环境: { 天气: '', 光照: '', 描述: '' },
      危机等级: value.world?.difficulty === '困难' ? '高' : value.world?.difficulty === '轻松' ? '低' : '中',
      动向: {},
      势力态势: {},
    },
    主角档案: {
      主角锁定: true,
      姓名: asText(value.protagonist?.name),
      角色类型: creatorRoleType === '原作人物' ? '原作人物' : '原创角色',
      创角类型: creatorRoleType || '原创角色',
      性别: asText(value.protagonist?.gender),
      种族: asText(value.protagonist?.race),
      身份: asText(value.protagonist?.identity),
      阵营: asText(value.protagonist?.faction),
      容貌: asText(value.protagonist?.appearance),
      衣着: asText(value.protagonist?.clothing),
      生存状态: asText(value.protagonist?.survival) || '存活',
      生命: 100,
      体力: 100,
      魔力: 100,
      精神稳定: 100,
      当前形态: '正常',
      战力等阶: { 阶数: combatTier.level, 位阶: combatTier.position, 可战状态: combatTier.combatStatus, 生效条件: combatTier.condition },
      能力: abilityRecords,
      当前目标: asText(value.protagonist?.currentGoal),
    },
    轮回: {
      世界重启次数: 0,
      当前轮回编号: 0,
      存档点: { 有效: false, 创建时间: '', 状态快照: {} },
      最近一次重启: { 死亡事件ID: '', 重启编号: 0, 触发时间: '', 恢复结果: '无' },
      菜月昴死亡记录: {},
      最近一次死亡: { 死亡ID: '', 直接原因: '', 死亡经过: '' },
    },
    关系: { 伴侣: {}, 契约伙伴: {}, 人物: relationshipRecord },
    事件: { 进行中: activeEvents, 近期记录: {} },
    线索: { 当前线索: {}, 未解问题: [] },
    资产: { 货币: currency, 物品: items, 装备: equipment, 据点与存放: {} },
    规则: { schema版本: 're0-state-v1', 初始化完成: false },
  };
}

export function buildOpeningMessage(draft) {
  const value = draft ?? createDefaultDraft();
  const protagonist = value.protagonist ?? {};
  const anchor = value.storyAnchor ?? EMPTY_ANCHOR;
  const personality = value.personality ?? {};
  const combatTier = normalizeCombatTier(value.combatTier);
  const combatLabel = combatTier.level === '未定' || combatTier.position === '未定'
    ? '未定'
    : `${combatTier.level}${combatTier.position}`;
  const traits = asArray(personality.traits).filter(Boolean).join('、') || '尚未定型';
  const abilities = asArray(value.abilities).filter((ability) => asText(ability?.name)).map((ability) => `${ability.name}（${ability.description || '效果未详'}）`).join('、') || '尚未记录';
  return [
    '【Re:0 · 创角向导 · 开局档案】',
    `我的名字是${asText(protagonist.name) || '未命名的旅人'}。我是${asText(protagonist.identity) || '一个尚未找到归处的人'}，以${asText(protagonist.roleType) || '原创角色'}的身份进入这个世界。`,
    `我会从「${asText(anchor.volumeTitle) || '未选择卷数'}」的「${asText(anchor.eventTitle) || '未选择事件'}」开始；事件时间为${asText(anchor.eventTime) || '时间未详'}。`,
    `我的外在身份是：${asText(protagonist.gender) || '性别未详'}、${asText(protagonist.race) || '种族未详'}，站在${asText(protagonist.faction) || '中立'}一侧。`,
    `我的战力等阶是${combatLabel}，当前${combatTier.combatStatus}；生效条件为：${combatTier.condition}。`,
    `我希望${asText(personality.wish) || '找到一个值得坚持的愿望'}；我害怕${asText(personality.fear) || '失去无法挽回的东西'}。我的底线是：${asText(personality.boundary) || '不让重要的选择被别人替我做出'}。`,
    `我的性格关键词是：${traits}。我当前的目标是：${asText(protagonist.currentGoal) || '确认自己在这个世界的位置'}。`,
    `我拥有的能力：${abilities}。`,
    `请从这个剧情锚点开始，以当前世界状态回应我，并保留我尚未知道的情报。`,
  ].join('\n');
}

export function suggestOffline(draft, stepId = 'identity') {
  const value = draft ?? createDefaultDraft();
  const anchorTitle = asText(value.storyAnchor?.eventTitle);
  const base = {
    protagonist: {
      identity: anchorTitle.includes('召唤') ? '刚刚被卷入异世界的观察者' : '在事件边缘寻找立足点的旅人',
      currentGoal: anchorTitle ? `在「${anchorTitle}」之后找到不会后悔的下一步` : '确认自己在这个世界的位置',
    },
    personality: {
      traits: ['谨慎', '共情', '不擅长放弃'],
      wish: '让重要的人活着走到明天',
      fear: '明明知道会失去，却仍然来不及伸手',
      boundary: '不以无辜者换取胜利',
      speechStyle: '平静时克制，真正重要的瞬间会把话说得很直接',
      secret: '我似乎见过这个结局一次',
    },
    abilities: [
      { name: '事件回声', category: '一般技能', status: '可用', cost: '精神稳定下降', description: '从现场残留的情绪中捕捉一段不完整的过去。', limits: '只能得到片段，不能直接确认真相。' },
    ],
    combatTier: { level: '6阶', position: '上位', combatStatus: '可战', condition: '常态即可发挥' },
  };
  if (stepId === 'identity') return { protagonist: base.protagonist };
  if (stepId === 'origin') return { protagonist: { identity: base.protagonist.identity, currentGoal: base.protagonist.currentGoal }, world: { currentLocation: '王都外缘', entryContext: '一条尚未被地图标记的小巷' } };
  if (stepId === 'heart') return { personality: base.personality };
  if (stepId === 'arsenal') return { combatTier: base.combatTier, abilities: base.abilities, relationships: [{ name: '银发少女', relation: '尚未确认的救命之人', stance: '中立', trust: 10, notes: '相遇由一个遗失的徽章开始。' }] };
  return base;
}

const PATCH_FIELDS = {
  protagonist: new Set(['name', 'roleType', 'gender', 'race', 'identity', 'faction', 'appearance', 'clothing', 'survival', 'currentGoal']),
  personality: new Set(['traits', 'wish', 'fear', 'desire', 'boundary', 'speechStyle', 'habits', 'secret']),
  world: new Set(['currentLocation', 'entryContext', 'difficulty']),
  abilities: new Set(['name', 'category', 'status', 'cost', 'description', 'limits']),
  relationships: new Set(['name', 'relation', 'stance', 'trust', 'notes']),
  assets: new Set(['currency', 'items', 'equipment']),
  combatTier: new Set(['level', 'position', 'combatStatus', 'condition']),
};

const PATCH_SCOPE_FIELDS = {
  identity: {
    protagonist: new Set(['name', 'identity', 'roleType', 'gender', 'race']),
  },
  origin: {
    protagonist: new Set(['faction', 'appearance', 'clothing', 'currentGoal']),
    world: PATCH_FIELDS.world,
  },
  heart: {
    personality: PATCH_FIELDS.personality,
  },
  arsenal: {
    combatTier: PATCH_FIELDS.combatTier,
    abilities: PATCH_FIELDS.abilities,
    relationships: PATCH_FIELDS.relationships,
    assets: PATCH_FIELDS.assets,
  },
  review: PATCH_FIELDS,
  'all-pages': PATCH_FIELDS,
};

const PATCH_ENVELOPE_KEYS = ['patch', 'data', 'result', 'changes', 'suggestion'];
const WORLD_DIFFICULTIES = ['轻松', '标准', '困难'];

const UNSAFE_PATCH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function patchSectionFields(section) {
  return hasOwn(PATCH_FIELDS, section) ? PATCH_FIELDS[section] : null;
}

function validatePatchValue(value, path, errors, depth = 0) {
  if (depth > 4) {
    errors.push(error(path, '嵌套层级过深'));
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(error(path, '数字必须是有限值'));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validatePatchValue(item, `${path}.${index}`, errors, depth + 1));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (UNSAFE_PATCH_KEYS.has(key)) errors.push(error(`${path}.${key}`, '禁止使用危险键名'));
      else validatePatchValue(item, `${path}.${key}`, errors, depth + 1);
    });
    return;
  }
  errors.push(error(path, '补丁值类型不受支持'));
}

function patchFieldError(section, key, value) {
  if (section === 'protagonist') {
    if (key === 'roleType') return ROLE_TYPES.includes(value) ? '' : '必须是已支持的角色类型';
    if (key === 'faction') return FACTIONS.includes(value) ? '' : '必须是已支持的初始阵营';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  if (section === 'personality') {
    if (key === 'traits') return Array.isArray(value) && value.every((item) => typeof item === 'string') ? '' : '必须是字符串数组';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  if (section === 'world') {
    if (key === 'difficulty') return WORLD_DIFFICULTIES.includes(value) ? '' : '必须是轻松、标准或困难';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  if (section === 'combatTier') {
    if (key === 'level') return COMBAT_TIER_LEVELS.includes(value) ? '' : '必须是1阶至7阶';
    if (key === 'position') return COMBAT_TIER_POSITIONS.includes(value) ? '' : '必须是上位或下位';
    if (key === 'combatStatus') return COMBAT_STATUSES.includes(value) ? '' : '必须是可战、受限、无法战斗或未知';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  if (section === 'abilities') return typeof value === 'string' ? '' : '必须是字符串';
  if (section === 'relationships') {
    if (key === 'stance') return RELATION_STANCES.includes(value) ? '' : '必须是已支持的关系立场';
    if (key === 'trust') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? '' : '必须是0至100的数字';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  if (section === 'asset') {
    if (key === 'quantity') return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? '' : '必须是非负数字';
    return typeof value === 'string' ? '' : '必须是字符串';
  }
  return '';
}

function validatePatchFieldValue(section, key, value, path, errors) {
  const errorCount = errors.length;
  validatePatchValue(value, path, errors);
  if (errors.length !== errorCount) return;
  const message = patchFieldError(section, key, value);
  if (message) errors.push(error(path, message));
}

function validatePatchSection(section, values, errors) {
  const sectionFields = patchSectionFields(section);
  if (UNSAFE_PATCH_KEYS.has(section) || !sectionFields) {
    errors.push(error(section, '不允许修改该字段区段'));
    return;
  }
  if (section === 'abilities' || section === 'relationships') {
    if (!Array.isArray(values)) {
      errors.push(error(section, '该区段必须是数组'));
      return;
    }
    values.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(error(`${section}.${index}`, '数组项目必须是对象'));
        return;
      }
      Object.entries(item).forEach(([key, value]) => {
        if (UNSAFE_PATCH_KEYS.has(key) || !sectionFields.has(key)) errors.push(error(`${section}.${index}.${key}`, '未知或危险字段'));
        else validatePatchFieldValue(section, key, value, `${section}.${index}.${key}`, errors);
      });
    });
    return;
  }
  if (!isRecord(values)) {
    errors.push(error(section, '该区段必须是对象'));
    return;
  }
  Object.entries(values).forEach(([key, value]) => {
    if (UNSAFE_PATCH_KEYS.has(key) || !sectionFields.has(key)) {
      errors.push(error(`${section}.${key}`, '未知或危险字段'));
      return;
    }
    if (section === 'assets') {
      if (!Array.isArray(value)) errors.push(error(`${section}.${key}`, '资产区段必须是数组'));
      else value.forEach((item, index) => {
        if (!isRecord(item)) errors.push(error(`${section}.${key}.${index}`, '资产项目必须是对象'));
        else Object.entries(item).forEach(([itemKey, itemValue]) => {
          if (UNSAFE_PATCH_KEYS.has(itemKey) || !new Set(['name', 'quantity', 'description']).has(itemKey)) errors.push(error(`${section}.${key}.${index}.${itemKey}`, '未知或危险字段'));
          else validatePatchFieldValue('asset', itemKey, itemValue, `${section}.${key}.${index}.${itemKey}`, errors);
        });
      });
    } else {
      validatePatchFieldValue(section, key, value, `${section}.${key}`, errors);
    }
  });
}

export function validateAiPatch(patch) {
  const errors = [];
  if (!isRecord(patch)) return { ok: false, errors: [error('', 'AI 补丁必须是对象')] };
  Object.entries(patch).forEach(([section, values]) => validatePatchSection(section, values, errors));
  return { ok: errors.length === 0, errors };
}

function setIfEmpty(target, source, path, appliedPaths, skippedPaths) {
  const current = target[path];
  const empty = current == null || current === '' || (Array.isArray(current) && current.length === 0);
  if (empty && source !== undefined) {
    target[path] = structuredClone(source);
    appliedPaths.push(path);
  } else if (source !== undefined) {
    skippedPaths.push(path);
  }
}

export function mergeAiPatch(draft, patch) {
  const validation = validateAiPatch(patch);
  if (!validation.ok) throw new Error(`AI 补丁无效：${validation.errors[0]?.message || '包含不允许的字段'}`);
  const next = structuredClone(draft ?? createDefaultDraft());
  const appliedPaths = [];
  const skippedPaths = [];
  for (const [section, values] of Object.entries(patch ?? {})) {
    if (!values || typeof values !== 'object') continue;
    if (!next[section] || typeof next[section] !== 'object') next[section] = {};
    for (const [path, value] of Object.entries(values)) {
      const beforeApplied = appliedPaths.length;
      const beforeSkipped = skippedPaths.length;
      setIfEmpty(next[section], value, path, appliedPaths, skippedPaths);
      if (appliedPaths.length > beforeApplied) appliedPaths[appliedPaths.length - 1] = `${section}.${path}`;
      if (skippedPaths.length > beforeSkipped) skippedPaths[skippedPaths.length - 1] = `${section}.${path}`;
    }
  }
  next.meta = { ...(next.meta ?? {}), updatedAt: new Date().toISOString() };
  return { draft: next, appliedPaths, skippedPaths };
}

export function serializeDraft(draft) {
  const value = structuredClone(draft ?? createDefaultDraft());
  if (isRecord(value.protagonist)) delete value.protagonist.ageStage;
  value.version = DRAFT_VERSION;
  value.meta = { ...(value.meta ?? {}), updatedAt: new Date().toISOString() };
  return JSON.stringify(value, null, 2);
}

export function parseDraft(serialized) {
  const value = typeof serialized === 'string' ? JSON.parse(serialized) : structuredClone(serialized);
  if (!value || typeof value !== 'object') throw new Error('草稿不是对象');
  if (value.version !== DRAFT_VERSION) throw new Error('不支持的草稿版本');
  if (isRecord(value.protagonist)) delete value.protagonist.ageStage;
  value.combatTier = { ...EMPTY_COMBAT_TIER, ...(isRecord(value.combatTier) ? value.combatTier : {}) };
  return value;
}

function patchCandidates(value, depth = 0, path = []) {
  if (!isRecord(value)) return [];
  const nested = [];
  if (depth < 3) {
    PATCH_ENVELOPE_KEYS.forEach((key) => {
      if (isRecord(value[key])) nested.push(...patchCandidates(value[key], depth + 1, [...path, key]));
    });
  }
  return [...nested, { value, path }];
}

function unwrapPatchEnvelope(value, scope) {
  const candidates = patchCandidates(value);
  return candidates.find((candidate) => Object.keys(candidate.value).some((section) => hasOwn(PATCH_FIELDS, section) && hasOwn(scope, section)))
    ?? candidates.find((candidate) => Object.keys(candidate.value).some((section) => hasOwn(PATCH_FIELDS, section)))
    ?? { value, path: [] };
}

function collectIgnoredEnvelopeSiblings(root, selectedPath, ignoredPaths) {
  if (!selectedPath.length || !isRecord(root)) return;
  let current = root;
  const prefix = [];
  selectedPath.forEach((selectedKey) => {
    if (!isRecord(current)) return;
    Object.keys(current).forEach((key) => {
      if (key === selectedKey || PATCH_ENVELOPE_KEYS.includes(key)) return;
      if (hasOwn(PATCH_FIELDS, key) || key === 'storyAnchor' || UNSAFE_PATCH_KEYS.has(key)) {
        ignoredPaths.push([...prefix, key].join('.'));
      }
    });
    current = current[selectedKey];
    prefix.push(selectedKey);
  });
}

function safePatchValue(value, section, key, path, ignoredPaths) {
  const errors = [];
  validatePatchFieldValue(section, key, value, path, errors);
  if (errors.length) {
    ignoredPaths.push(path);
    return undefined;
  }
  return structuredClone(value);
}

function prepareRecordSection(section, values, allowedFields, ignoredPaths) {
  if (!isRecord(values)) {
    ignoredPaths.push(section);
    return null;
  }
  const prepared = {};
  Object.entries(values).forEach(([key, value]) => {
    const path = `${section}.${key}`;
    if (UNSAFE_PATCH_KEYS.has(key) || !allowedFields.has(key)) {
      ignoredPaths.push(path);
      return;
    }
    const safeValue = safePatchValue(value, section, key, path, ignoredPaths);
    if (safeValue !== undefined) prepared[key] = safeValue;
  });
  return Object.keys(prepared).length ? prepared : null;
}

function prepareListSection(section, values, allowedFields, ignoredPaths, ruleSection = section) {
  if (!Array.isArray(values)) {
    ignoredPaths.push(section);
    return null;
  }
  const prepared = values.map((item, index) => {
    if (!isRecord(item)) {
      ignoredPaths.push(`${section}.${index}`);
      return null;
    }
    const entry = {};
    Object.entries(item).forEach(([key, value]) => {
      const path = `${section}.${index}.${key}`;
      if (UNSAFE_PATCH_KEYS.has(key) || !allowedFields.has(key)) {
        ignoredPaths.push(path);
        return;
      }
      const safeValue = safePatchValue(value, ruleSection, key, path, ignoredPaths);
      if (safeValue !== undefined) entry[key] = safeValue;
    });
    return Object.keys(entry).length ? entry : null;
  }).filter(Boolean);
  return prepared.length ? prepared : null;
}

function prepareAssetsSection(values, allowedFields, ignoredPaths) {
  if (!isRecord(values)) {
    ignoredPaths.push('assets');
    return null;
  }
  const itemFields = new Set(['name', 'quantity', 'description']);
  const prepared = {};
  Object.entries(values).forEach(([key, items]) => {
    const sectionPath = `assets.${key}`;
    if (UNSAFE_PATCH_KEYS.has(key) || !allowedFields.has(key) || !Array.isArray(items)) {
      ignoredPaths.push(sectionPath);
      return;
    }
    const list = prepareListSection(sectionPath, items, itemFields, ignoredPaths, 'asset');
    if (list) prepared[key] = list;
  });
  return Object.keys(prepared).length ? prepared : null;
}

export function prepareAiPatch(value, stepId = 'all-pages') {
  const ignoredPaths = [];
  const patch = {};
  const scope = hasOwn(PATCH_SCOPE_FIELDS, stepId) ? PATCH_SCOPE_FIELDS[stepId] : {};
  const selected = unwrapPatchEnvelope(value, scope);
  const source = selected.value;
  collectIgnoredEnvelopeSiblings(value, selected.path, ignoredPaths);
  if (!isRecord(source)) return { patch, ignoredPaths: ['$'] };

  Object.entries(source).forEach(([section, values]) => {
    const allowedFields = hasOwn(scope, section) ? scope[section] : null;
    if (UNSAFE_PATCH_KEYS.has(section) || !hasOwn(PATCH_FIELDS, section) || !allowedFields) {
      ignoredPaths.push(section);
      return;
    }
    let prepared;
    if (section === 'abilities' || section === 'relationships') prepared = prepareListSection(section, values, allowedFields, ignoredPaths);
    else if (section === 'assets') prepared = prepareAssetsSection(values, allowedFields, ignoredPaths);
    else prepared = prepareRecordSection(section, values, allowedFields, ignoredPaths);
    if (prepared) patch[section] = prepared;
  });

  return { patch, ignoredPaths: [...new Set(ignoredPaths)] };
}
