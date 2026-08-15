import { resolveSpeaker } from './character-registry.mjs';

export const NARRATIVE_THEMES = Object.freeze({
  day: Object.freeze({
    name: 'day',
    label: '日间',
    plate: 'cold-silver-blue-crystal-archive',
    background: 'archive-cold-crystal-witch-residue',
    accent: '#5f9db8',
    border: 'silver-crystal-archive-line',
    texture: 'frosted-archive-paper',
    icon: 'archive-snowflake',
    contrast: Object.freeze({ text: '#182735', surface: '#f8fbff', muted: '#546a7b' }),
  }),
  night: Object.freeze({
    name: 'night',
    label: '夜间',
    plate: 'obsidian-darkgold-purple-red',
    background: 'obsidian-witch-residue-archive',
    accent: '#d1a653',
    border: 'obsidian-darkgold-verdict-line',
    texture: 'witch-residue-obsidian-grain',
    icon: 'witch-moon',
    contrast: Object.freeze({ text: '#f4ead8', surface: '#0d121d', muted: '#b19a77' }),
  }),
  beige: Object.freeze({
    name: 'beige',
    label: '羊皮纸',
    plate: 'warm-parchment-red-brown',
    background: 'parchment-archive-witch-seal',
    accent: '#9a4935',
    border: 'red-brown-parchment-rule',
    texture: 'warm-parchment-fiber',
    icon: 'sealed-record',
    contrast: Object.freeze({ text: '#302016', surface: '#f4ead5', muted: '#725a43' }),
  }),
});

const NIGHT_PERIODS = new Set(['傍晚', '夜间', '深夜', '凌晨']);

export function resolveTheme({ preference = 'auto', period = '' } = {}) {
  if (preference === 'day' || preference === 'night' || preference === 'beige') {
    return { ...NARRATIVE_THEMES[preference], source: 'manual' };
  }
  const name = NIGHT_PERIODS.has(String(period).trim()) ? 'night' : 'day';
  return { ...NARRATIVE_THEMES[name], source: 'auto' };
}

function tokenValue(tokens, prefix, fallback) {
  const token = tokens.find((item) => item.startsWith(`${prefix}:`));
  return token ? token.slice(prefix.length + 1) : fallback;
}

function cssToken(token) {
  return String(token || 'generic').replace(/[^a-z0-9-]/giu, '-').toLowerCase();
}

export function resolveBubble(speakerInput, themeInput = 'day') {
  const speaker = typeof speakerInput === 'string' ? resolveSpeaker(speakerInput) : speakerInput;
  const theme = typeof themeInput === 'string'
    ? (NARRATIVE_THEMES[themeInput] || NARRATIVE_THEMES.day)
    : (themeInput || NARRATIVE_THEMES.day);
  const identityTokens = speaker.identityTokens || ['role:generic', 'accent:generic', 'icon:archive'];
  const bubbleTokens = speaker.bubbleTokens || ['code:generic', 'tone:neutral'];
  const role = tokenValue(identityTokens, 'role', 'generic');
  const accent = tokenValue(identityTokens, 'accent', 'generic');
  const icon = tokenValue(identityTokens, 'icon', 'archive');
  const code = tokenValue(bubbleTokens, 'code', 'generic');
  return {
    speaker,
    displayName: speaker.displayName,
    portraitKey: speaker.portraitKey || 'generic',
    initial: speaker.initial,
    role,
    accent,
    code,
    icon: `${theme.icon}-${icon}`,
    border: `${theme.border}-${code}`,
    texture: `${theme.texture}-${code}`,
    contrast: theme.contrast,
    classNames: [
      `bubble-role-${cssToken(role)}`,
      `bubble-accent-${cssToken(accent)}`,
      `bubble-code-${cssToken(code)}`,
    ],
  };
}
