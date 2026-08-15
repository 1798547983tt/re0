const GRADES = ['失败', '成功', '强成功', '暴击'];

function dieValue(entry) {
  if (typeof entry === 'number') return entry;
  if (entry && typeof entry === 'object' && Object.hasOwn(entry, 'value')) return entry.value;
  return NaN;
}

function assertDie(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('骰面必须是 1..20 的有限 d20 整数');
  }
  return value;
}

export function consumeRoll(pool) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error('骰池耗尽');
  for (const entry of pool) assertDie(dieValue(entry));
  return { roll: structuredClone(pool[0]), remaining: structuredClone(pool.slice(1)) };
}

export function deriveTierValue(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const { level, position } = input;
  let n = level;
  if (typeof n === 'string') {
    const match = n.match(/^(?:([1-7])阶|([1-7]))$/);
    n = match ? Number(match[1] ?? match[2]) : NaN;
  }
  if (!Number.isInteger(n) || n < 1 || n > 7) return null;
  if (position !== '上位' && position !== '下位') return null;
  return (n - 1) * 2 + (position === '上位' ? 2 : 1);
}

export function resolveCheck({ roll, dc, modifiers = [] } = {}) {
  const natural = assertDie(roll);
  if (typeof dc !== 'number' || !Number.isFinite(dc)) throw new Error('DC 必须是有限数');
  const numericDc = dc;
  const safeModifiers = Array.isArray(modifiers)
    ? structuredClone(modifiers)
    : modifiers == null ? [] : [structuredClone(modifiers)];
  const total = Number(roll) + safeModifiers.reduce((sum, value) => {
    const modifierValue = typeof value === 'object' && value !== null ? value.value : value;
    if (typeof modifierValue !== 'number' || !Number.isFinite(modifierValue)) throw new Error('检定修正必须是有限数');
    return sum + modifierValue;
  }, 0);
  if (!Number.isFinite(total)) throw new Error('检定总值必须是有限数');
  const margin = total - numericDc;
  let grade = margin < 0 ? '失败' : margin <= 4 ? '成功' : margin <= 9 ? '强成功' : '暴击';
  if (natural === 1) grade = '失败';
  else if (natural === 20 && grade !== '失败') grade = GRADES[Math.min(GRADES.indexOf(grade) + 1, 3)];
  return {
    roll: natural,
    dc: numericDc,
    modifiers: safeModifiers,
    total,
    margin,
    grade,
    natural,
    success: grade !== '失败',
  };
}

export function resolveDefense(reaction) {
  const key = typeof reaction === 'object' && reaction ? reaction.reaction : reaction;
  if (key === '闪避') return { dcModifier: 2, damageMultiplier: 0, counterWindow: false };
  if (key === '格挡') return { dcModifier: 0, damageMultiplier: 0.5, counterWindow: false };
  if (key === '反击') return { dcModifier: -2, damageMultiplier: 1, counterWindow: true };
  return { dcModifier: 0, damageMultiplier: 1, counterWindow: false };
}

export function resolveDamage({ grade, baseDamage, defenderTierGap = 0, breakQualified = false, damageMultiplier = 1 } = {}) {
  const rawBase = Number(baseDamage);
  const base = Number.isFinite(rawBase) ? Math.min(Number.MAX_VALUE, Math.max(0, rawBase)) : 0;
  const gradeMultiplier = Math.min(Number.MAX_VALUE, Math.max(0, Number({ 失败: 0, 成功: 1, 强成功: 1.5, 暴击: 2 }[grade] ?? 0)));
  const rawDefense = Number(damageMultiplier);
  const defenseMultiplier = Number.isFinite(rawDefense) ? Math.min(Number.MAX_VALUE, Math.max(0, rawDefense)) : 1;
  const product = gradeMultiplier * defenseMultiplier;
  const multiplier = Number.isFinite(product) ? product : Number.MAX_VALUE;
  if (gradeMultiplier === 0) return { damage: 0, baseDamage: base, multiplier: 0, reason: '检定失败' };
  if (Number(defenderTierGap) >= 4 && !breakQualified) {
    return { damage: 0, baseDamage: base, multiplier, reason: '无法破阶' };
  }
  return {
    damage: Number.isFinite(base * multiplier) ? Math.floor(base * multiplier) : Number.MAX_VALUE,
    baseDamage: base,
    multiplier,
    reason: '命中',
  };
}

export function resolveDying({ successes = 0, failures = 0, roll } = {}) {
  if (typeof successes !== 'number' || !Number.isInteger(successes) || !Number.isFinite(successes) || successes < 0) throw new Error('成功计数必须是非负有限整数');
  if (typeof failures !== 'number' || !Number.isInteger(failures) || !Number.isFinite(failures) || failures < 0) throw new Error('失败计数必须是非负有限整数');
  let s = successes;
  let f = failures;
  const natural = assertDie(roll);
  if (natural === 20) return { successes: s, failures: f, state: '存活', hp: 1 };
  if (natural === 1) f += 2;
  else if (natural >= 10) s += 1;
  else f += 1;
  if (s >= 3) return { successes: s, failures: f, state: '昏迷' };
  if (f >= 3) return { successes: s, failures: f, state: '死亡' };
  return { successes: s, failures: f, state: '濒死' };
}

function participantId(participant) {
  if (typeof participant === 'string') return participant;
  if (participant && typeof participant === 'object' && typeof participant.id === 'string') return participant.id;
  return null;
}

export function createBattleState({ id = '', participants = [] } = {}) {
  if (!Array.isArray(participants) || participants.length === 0) throw new Error('参战者必须是至少一名的数组');
  const copiedParticipants = structuredClone(Array.isArray(participants) ? participants : []);
  const actionOrder = copiedParticipants.map(participantId);
  if (actionOrder.some((id) => !id || !id.trim())) throw new Error('参战者 ID 必须是非空字符串');
  if (new Set(actionOrder).size !== actionOrder.length) throw new Error('参战者 ID 必须唯一，禁止重复');
  const actionBudget = Object.fromEntries(actionOrder.map((key) => [key, { '主行动': 1, '移动': 1, '防御反应': 1 }]));
  const distance = Object.fromEntries(actionOrder.map((key) => [key, '近距']));
  const cover = Object.fromEntries(actionOrder.map((key) => [key, false]));
  const dyingCounters = Object.fromEntries(actionOrder.map((key) => [key, { successes: 0, failures: 0 }]));
  return {
    '进行中': true,
    id,
    '轮数': 1,
    '参战者': copiedParticipants,
    '行动顺序': actionOrder,
    '当前行动者': actionOrder[0] ?? '',
    '行动额度': actionBudget,
    '距离': distance,
    '掩体': cover,
    '持续效果': {},
    '濒死计数': dyingCounters,
    '最近一次检定': null,
  };
}

export function finishBattle(state = {}) {
  const finished = structuredClone(state);
  return {
    ...finished,
    '进行中': false,
    '轮数': 0,
    '参战者': [],
    '行动顺序': [],
    '当前行动者': '',
    '行动额度': {},
    '距离': {},
    '掩体': {},
    '持续效果': {},
    '濒死计数': {},
    '最近一次检定': null,
  };
}
