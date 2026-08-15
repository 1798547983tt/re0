const GRADES = ['失败', '成功', '强成功', '暴击'];

export function consumeRoll(pool) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error('骰池耗尽');
  return pool.shift();
}

export function deriveTierValue({ level, position } = {}) {
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
  const safeModifiers = Array.isArray(modifiers) ? modifiers.slice() : [];
  const total = Number(roll) + safeModifiers.reduce((sum, value) => sum + Number(value || 0), 0);
  const margin = total - Number(dc);
  const natural = Number(roll);
  let grade = margin < 0 ? '失败' : margin <= 4 ? '成功' : margin <= 9 ? '强成功' : '暴击';
  if (natural === 1) grade = '失败';
  else if (natural === 20) grade = GRADES[Math.min(GRADES.indexOf(grade) + 1, 3)];
  return {
    roll: natural,
    dc: Number(dc),
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
  const base = Number(baseDamage) || 0;
  const gradeMultiplier = { 失败: 0, 成功: 1, 强成功: 1.5, 暴击: 2 }[grade] ?? 0;
  if (gradeMultiplier === 0) return { damage: 0, baseDamage: base, multiplier: 0, reason: '检定失败' };
  if (Number(defenderTierGap) >= 4 && !breakQualified) {
    return { damage: 0, baseDamage: base, multiplier: gradeMultiplier, reason: '无法破阶' };
  }
  const multiplier = gradeMultiplier * (Number(damageMultiplier) || 0);
  return {
    damage: Math.floor(base * multiplier),
    baseDamage: base,
    multiplier: gradeMultiplier,
    reason: '命中',
  };
}

export function resolveDying({ successes = 0, failures = 0, roll } = {}) {
  let s = Math.max(0, Number(successes) || 0);
  let f = Math.max(0, Number(failures) || 0);
  const natural = Number(roll);
  if (natural === 20) return { successes: s, failures: f, status: '存活', hp: 1 };
  if (natural === 1) f += 2;
  else if (natural >= 10) s += 1;
  else f += 1;
  if (s >= 3) return { successes: s, failures: f, status: '昏迷' };
  if (f >= 3) return { successes: s, failures: f, status: '死亡' };
  return { successes: s, failures: f, status: '濒死' };
}

function participantId(participant) {
  if (typeof participant === 'string') return participant;
  return participant && (participant.id ?? participant.name ?? '') || '';
}

export function createBattleState({ id = '', participants = [] } = {}) {
  const copiedParticipants = structuredClone(Array.isArray(participants) ? participants : []);
  const actionOrder = copiedParticipants.map(participantId).filter(Boolean);
  const actionBudget = Object.fromEntries(actionOrder.map((key) => [key, 1]));
  const distance = Object.fromEntries(actionOrder.map((key) => [key, '近距']));
  const cover = Object.fromEntries(actionOrder.map((key) => [key, false]));
  const dyingCounters = Object.fromEntries(actionOrder.map((key) => [key, { successes: 0, failures: 0 }]));
  return {
    inProgress: true,
    id,
    round: 1,
    participants: copiedParticipants,
    actionOrder,
    currentActor: actionOrder[0] ?? '',
    actionBudget,
    distance,
    cover,
    ongoingEffects: {},
    dyingCounters,
    lastCheck: null,
  };
}

export function finishBattle(state = {}) {
  const finished = structuredClone(state);
  return {
    ...finished,
    inProgress: false,
    round: 0,
    participants: [],
    actionOrder: [],
    currentActor: '',
    actionBudget: {},
    distance: {},
    cover: {},
    ongoingEffects: {},
    dyingCounters: {},
    lastCheck: null,
  };
}

