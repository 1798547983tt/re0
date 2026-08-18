export const ABILITY_KINDS = Object.freeze([
  Object.freeze({ kind: '一般技能', token: 'skill', effect: 'steel-scan', symbol: '▱', label: '技艺演算' }),
  Object.freeze({ kind: '权能', token: 'authority', effect: 'broken-ring', symbol: '◌', label: '魔女因子·权能' }),
  Object.freeze({ kind: '加护', token: 'blessing', effect: 'blessing-halo', symbol: '✧', label: '世界的加护' }),
  Object.freeze({ kind: '魔法', token: 'magic', effect: 'arcane-orbit', symbol: '✦', label: '玛那术式' }),
  Object.freeze({ kind: '精灵术', token: 'spirit', effect: 'spirit-motes', symbol: '❈', label: '精灵共鸣' }),
  Object.freeze({ kind: '种族能力', token: 'racial', effect: 'bloodline-pulse', symbol: '◈', label: '血脉显现' }),
  Object.freeze({ kind: '武技', token: 'martial', effect: 'martial-slash', symbol: '╱', label: '武技解放' }),
]);

const ABILITY_INDEX = new Map(ABILITY_KINDS.map((item) => [item.kind, item]));

export function resolveAbilityKind(kind) {
  const resolved = ABILITY_INDEX.get(String(kind ?? '').trim());
  if (resolved) return { ...resolved, valid: true };
  return {
    kind: String(kind ?? '').trim() || '未知能力',
    token: 'invalid',
    effect: 'invalid',
    symbol: '？',
    label: '未识别能力类型',
    valid: false,
  };
}
