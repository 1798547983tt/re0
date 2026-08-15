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
const ROLE_MOTIFS = Object.freeze({
  witch: 'radial-gradient(circle at 14% 18%, color-mix(in srgb, var(--re0-bubble-accent) 34%, transparent), transparent 32%)',
  archbishop: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--re0-bubble-accent) 18%, transparent) 0 2px, transparent 2px 10px)',
  knight: 'linear-gradient(115deg, color-mix(in srgb, var(--re0-bubble-accent) 20%, transparent), transparent 52%)',
  maid: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--re0-bubble-accent) 12%, transparent) 0 1px, transparent 1px 12px)',
  spirit: 'radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--re0-bubble-accent) 28%, transparent), transparent 34%)',
  merchant: 'linear-gradient(90deg, color-mix(in srgb, var(--re0-bubble-accent) 16%, transparent), transparent 70%)',
  returner: 'repeating-linear-gradient(0deg, color-mix(in srgb, var(--re0-bubble-accent) 14%, transparent) 0 1px, transparent 1px 14px)',
  assassin: 'linear-gradient(145deg, color-mix(in srgb, var(--re0-bubble-accent) 26%, transparent), transparent 44%)',
  warrior: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--re0-bubble-accent) 16%, transparent) 0 3px, transparent 3px 14px)',
  healer: 'radial-gradient(circle at 20% 50%, color-mix(in srgb, var(--re0-bubble-accent) 24%, transparent), transparent 28%)',
  lord: 'linear-gradient(120deg, color-mix(in srgb, var(--re0-bubble-accent) 22%, transparent), transparent 62%)',
  guardian: 'repeating-linear-gradient(120deg, color-mix(in srgb, var(--re0-bubble-accent) 14%, transparent) 0 4px, transparent 4px 16px)',
  attendant: 'linear-gradient(180deg, color-mix(in srgb, var(--re0-bubble-accent) 14%, transparent), transparent 58%)',
  generic: 'linear-gradient(90deg, color-mix(in srgb, var(--re0-bubble-accent) 10%, transparent), transparent)',
});

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

function colorFromAccent(accent) {
  let hash = 2166136261;
  for (const char of String(accent || 'generic')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  const saturation = 48 + (Math.abs(hash >> 8) % 22);
  const lightness = 42 + (Math.abs(hash >> 16) % 18);
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
      : hue < 180 ? [0, c, x]
        : hue < 240 ? [0, x, c]
          : hue < 300 ? [x, 0, c]
            : [c, 0, x];
  return `#${[r, g, b].map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`;
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
  const motif = ROLE_MOTIFS[role] || ROLE_MOTIFS.generic;
  const accentColor = colorFromAccent(accent);
  return {
    speaker,
    displayName: speaker.displayName,
    portraitKey: speaker.portraitKey || 'generic',
    initial: speaker.initial,
    role,
    accent,
    code,
    motif,
    icon: `${theme.icon}-${icon}`,
    border: `${theme.border}-${code}`,
    texture: `${theme.texture}-${code}`,
    contrast: theme.contrast,
    styleProperties: {
      '--re0-bubble-accent': accentColor,
      '--re0-avatar-accent': accentColor,
      '--re0-bubble-motif': motif,
    },
    classNames: [
      `bubble-role-${cssToken(role)}`,
      `bubble-accent-${cssToken(accent)}`,
      `bubble-code-${cssToken(code)}`,
    ],
  };
}
