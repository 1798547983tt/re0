export const THEMES = Object.freeze({
  day: Object.freeze({
    id: 'day', label: '日', name: '雪原档案', accent: '#4f96bf', accent2: '#d45c72',
    ink: '#172632', muted: '#62727d', surface: '#f7fbfc', surface2: '#e9f1f4',
    border: '#aec5cf', focus: '#176f9d', titleInk: '#f7fbff', titleStage: '#070b0f',
  }),
  night: Object.freeze({
    id: 'night', label: '夜', name: '妒影残响', accent: '#d14b70', accent2: '#8a69d4',
    ink: '#f1e8df', muted: '#baa8b5', surface: '#15111b', surface2: '#211827',
    border: '#4e3a53', focus: '#f28bad', titleInk: '#fff5ec', titleStage: '#050408',
  }),
  tea: Object.freeze({
    id: 'tea', label: '茶', name: '魔女茶席', accent: '#687f50', accent2: '#a85e68',
    ink: '#30291f', muted: '#756b59', surface: '#f3eddd', surface2: '#e7ddc8',
    border: '#b9aa8c', focus: '#526f39', titleInk: '#fff8e9', titleStage: '#0a0b08',
  }),
});

const NIGHT_PERIODS = new Set(['傍晚', '夜晚', '夜间', '深夜', '凌晨']);

export function resolveTheme({ preference = 'auto', period = '' } = {}) {
  if (preference === 'day' || preference === 'night' || preference === 'tea') {
    return { ...THEMES[preference], source: 'manual' };
  }
  const id = NIGHT_PERIODS.has(String(period).trim()) ? 'night' : 'day';
  return { ...THEMES[id], source: 'auto' };
}
