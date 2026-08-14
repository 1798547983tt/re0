export const DECLARED_DOMAIN_COUNTS = Object.freeze({
  世界: 20,
  主角档案: 58,
  轮回: 25,
  关系: 31,
  事件: 13,
  线索: 6,
  资产: 17,
  规则: 2,
});

export const ABILITY_CATEGORIES = Object.freeze([
  '加护',
  '权能',
  '魔法',
  '精灵术',
  '种族能力',
  '武技',
  '一般技能',
]);

export const FIELD_GROUPS = Object.freeze([
  { domain: '世界', base: '世界.当前时间', fields: ['规范日期', '时段', '时间层', '轮回分支'] },
  { domain: '世界', base: '世界.当前地点', fields: ['国家', '地区', '场所', '具体位置'] },
  { domain: '世界', base: '世界.环境', fields: ['天气', '光照', '描述'] },
  { domain: '世界', base: '世界', fields: ['危机等级'] },
  { domain: '世界', base: '世界.动向.{事件ID}', fields: ['标题', '阶段', '类型', '地点', '描述'] },
  { domain: '世界', base: '世界.势力态势.{势力名称}', fields: ['立场', '状态', '描述'] },

  {
    domain: '主角档案',
    base: '主角档案',
    fields: [
      '主角锁定', '姓名', '角色类型', '性别', '年龄阶段', '种族', '身份', '阵营',
      '容貌', '衣着', '生存状态', '生命', '体力', '魔力', '精神稳定', '门状态',
      '门负荷', '魔女余香',
    ],
  },
  { domain: '主角档案', base: '主角档案.伤势.{伤势ID}', fields: ['部位', '程度', '描述'] },
  { domain: '主角档案', base: '主角档案.异常状态.{状态ID}', fields: ['类型', '剩余表现', '描述'] },
  { domain: '主角档案', base: '主角档案', fields: ['当前形态'] },
  { domain: '主角档案', base: '主角档案.战力等阶', fields: ['阶数', '位阶', '可战状态', '生效条件'] },
  {
    domain: '主角档案',
    base: '主角档案.能力.{类别}.{能力ID}',
    fields: ['状态', '可用性', '消耗或冷却', '描述'],
    variants: { 类别: ABILITY_CATEGORIES },
  },
  { domain: '主角档案', base: '主角档案', fields: ['当前目标'] },

  { domain: '轮回', base: '轮回', fields: ['世界重启次数', '当前轮回编号'] },
  { domain: '轮回', base: '轮回.存档点', fields: ['有效', '创建时间'] },
  {
    domain: '轮回',
    base: '轮回.存档点.状态快照',
    fields: ['世界', '主角档案', '关系', '事件', '线索', '资产'],
    deep: true,
  },
  { domain: '轮回', base: '轮回.最近一次重启', fields: ['死亡事件ID', '重启编号', '触发时间', '恢复结果'] },
  {
    domain: '轮回',
    base: '轮回.菜月昴死亡记录.{死亡ID}',
    fields: [
      '重启编号', '死亡时规范日期与时段', '死亡时地点', '直接原因',
      '死亡经过与最后行动', '在场或相关人物', '触发前轮回分支', '本轮遗留情报',
    ],
  },
  { domain: '轮回', base: '轮回.最近一次死亡', fields: ['死亡ID', '直接原因', '死亡经过'] },

  {
    domain: '关系',
    base: '关系.伴侣.{姓名}',
    fields: ['关系阶段', '亲密度', '立场', '生存状态', '当前地点', '当前行动'],
  },
  {
    domain: '关系',
    base: '关系.契约伙伴.{姓名}',
    fields: ['契约状态', '关系阶段', '信任', '立场', '生存状态', '当前地点', '当前行动'],
  },
  {
    domain: '关系',
    base: '关系.人物.{姓名}',
    fields: [
      '身份', '阵营', '关系阶段', '立场', '好感', '信任', '生存状态',
      '生命', '魔力', '当前地点', '当前行动', '当前形态',
    ],
  },
  { domain: '关系', base: '关系.人物.{姓名}.伤势.{伤势ID}', fields: ['部位', '程度', '描述'] },
  { domain: '关系', base: '关系.人物.{姓名}.异常状态.{状态ID}', fields: ['类型', '剩余表现', '描述'] },

  {
    domain: '事件',
    base: '事件.进行中.{事件ID}',
    fields: ['标题', '类型', '阶段', '状态', '地点', '参与者', '目标', '描述'],
  },
  { domain: '事件', base: '事件.近期记录.{事件ID}', fields: ['标题', '结果', '规范日期', '参与者', '描述'] },

  { domain: '线索', base: '线索.当前线索.{线索ID}', fields: ['标题', '状态', '关联事件', '描述', '下一步'] },
  { domain: '线索', base: '线索', fields: ['未解问题'] },

  { domain: '资产', base: '资产.货币.{货币类型}', fields: ['数量', '持有者', '存放位置'] },
  { domain: '资产', base: '资产.物品.{物品ID}', fields: ['名称', '数量', '持有者', '存放位置', '描述'] },
  { domain: '资产', base: '资产.装备.{装备ID}', fields: ['名称', '持有者', '装备状态', '损耗', '当前效果'] },
  { domain: '资产', base: '资产.据点与存放.{据点ID}', fields: ['名称', '位置', '控制者', '状态'] },

  { domain: '规则', base: '规则', fields: ['schema版本', '初始化完成'] },
]);

function expandVariants(template, variants = {}) {
  let results = [template];
  for (const [name, values] of Object.entries(variants)) {
    const token = `{${name}}`;
    results = results.flatMap((candidate) =>
      candidate.includes(token)
        ? values.map((value) => candidate.replaceAll(token, value))
        : [candidate],
    );
  }
  return results;
}

export function expandDeclaredPaths() {
  return FIELD_GROUPS.flatMap((group) =>
    expandVariants(group.base, group.variants).flatMap((base) =>
      group.fields.map((field) => `${base}.${field}${group.deep ? '.**' : ''}`),
    ),
  );
}

const DECLARED_PATHS = Object.freeze(expandDeclaredPaths());

function isPlaceholder(segment) {
  return /^\{[^{}]+\}$/.test(segment);
}

function matchesPattern(pattern, path) {
  const expected = pattern.split('.');
  const actual = path.split('.');
  const deep = expected.at(-1) === '**';
  const expectedLength = deep ? expected.length - 1 : expected.length;
  if ((!deep && actual.length !== expectedLength) || (deep && actual.length < expectedLength)) {
    return false;
  }

  for (let index = 0; index < expectedLength; index += 1) {
    if (!isPlaceholder(expected[index]) && expected[index] !== actual[index]) return false;
    if (isPlaceholder(expected[index]) && !actual[index]) return false;
  }
  return true;
}

export function isDeclaredPath(path) {
  if (typeof path !== 'string' || !path) return false;
  return DECLARED_PATHS.some((pattern) => matchesPattern(pattern, path));
}
