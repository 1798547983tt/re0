import registryData from '../../narrative/data/character-registry.json' with { type: 'json' };

const ASSET_COMMIT = 'fe81357cba2b5df6d1ada34bb9e825c755202c67';
const ASSET_ROOT = `https://cdn.jsdelivr.net/gh/1798547983tt/re0@${ASSET_COMMIT}/avatars`;

const V2_ADDITIONAL_CHARACTER_DATA = Object.freeze([
  Object.freeze({
    stableId: 'emilia',
    rosterName: '爱蜜莉雅',
    displayName: '爱蜜莉雅',
    referenceFile: '爱蜜莉雅.png',
    portraitKey: 'emilia',
    aliases: ['爱蜜莉雅', '艾米莉亚', '艾蜜莉雅', '艾米利亚'],
    identityTokens: ['role:spirit', 'faction:emilia-camp', 'accent:emilia', 'icon:ice-flower'],
    bubbleTokens: ['code:silver-half-elf', 'tone:gentle-resolve', 'edge:frost-crystal'],
  }),
]);

const VISUALS = Object.freeze({
  'al-debaran': ['#657080', '#c85b78', '⛊', 'mask', 'grid', 'scan'],
  'elsa-granhiert': ['#a6243e', '#24121c', '†', 'blade', 'slashes', 'glint'],
  echidna: ['#f0ede6', '#27212c', '▣', 'porcelain', 'script', 'ink'],
  'anastasia-hoshin': ['#8669b1', '#d6ad65', '◉', 'ledger', 'coins', 'count'],
  'otto-suwen': ['#56825b', '#9a7451', '◇', 'road', 'routes', 'drift'],
  'yae-tengen': ['#4e4a8b', '#b64c65', '❖', 'fold', 'fan', 'veil'],
  beatrice: ['#b17bbf', '#f0b6d4', '✥', 'wing', 'grimoire', 'flutter'],
  'natsuki-subaru': ['#d27236', '#293443', '↶', 'broken', 'clock', 'rewind'],
  daphne: ['#5f5770', '#b7aa65', '◍', 'cage', 'teeth', 'hunger'],
  'felix-argyle': ['#56a9c4', '#f1a7be', '≈', 'drop', 'ripples', 'sparkle'],
  felt: ['#d4a522', '#559abb', '➶', 'cut', 'wind', 'dart'],
  'frederica-baumann': ['#b87945', '#e4c78f', '♢', 'lace', 'fangs', 'warmth'],
  hector: ['#77727c', '#4b3f53', '…', 'sag', 'rain', 'sink'],
  'heinkel-astrea': ['#955c3d', '#5b6670', '⌁', 'cracked', 'rust', 'stagger'],
  'garfiel-tinsel': ['#cf6b2d', '#e8c053', '牙', 'claw', 'stripes', 'pounce'],
  carmilla: ['#ca7891', '#8b596a', '♡', 'soft', 'hearts', 'blush'],
  'capella-lugunica': ['#ce276e', '#6d243f', '♜', 'thorn', 'scales', 'venom'],
  'crusch-karsten': ['#397d5d', '#d4b15e', '♌', 'banner', 'heraldry', 'command'],
  ram: ['#d77898', '#f2c7d4', '鬼', 'needle', 'petals', 'flick'],
  'ley-batenkaitos': ['#b93b36', '#e0b24c', '◐', 'bite', 'scratches', 'gnaw'],
  'reinhard-astrea': ['#367db6', '#e8c45d', '✦', 'crest', 'rays', 'radiance'],
  'reid-astrea': ['#8b2f32', '#9aa7b1', '刃', 'sword', 'steel', 'slash'],
  'regulus-corneas': ['#d7d4c8', '#bea34a', '□', 'perfect', 'still', 'freeze'],
  rem: ['#548fc5', '#a9d9ef', '✽', 'morningstar', 'snow', 'breathe'],
  'ricardo-welkin': ['#9a6338', '#d6a84f', '牙', 'hide', 'chevrons', 'roar'],
  'rui-arneb': ['#9ab84d', '#e0d36a', '◒', 'child', 'crumbs', 'skip'],
  'roy-alphard': ['#9e4937', '#6f342d', '◓', 'rough', 'crosshatch', 'jerk'],
  'roswaal-mathers': ['#75439b', '#d95476', '♠', 'harlequin', 'diamonds', 'sway'],
  'meili-portroute': ['#7ba748', '#d48375', '爪', 'beast', 'paws', 'prowl'],
  minerva: ['#e29a32', '#f0d85c', '拳', 'impact', 'bursts', 'punch'],
  puck: ['#70b9d1', '#d6f1f4', '❄', 'cloud', 'frost', 'float'],
  pandora: ['#d8d7df', '#c5a6cf', '◊', 'mirror', 'facets', 'phase'],
  'petelgeuse-romaneeconti': ['#5f983d', '#242c22', '☞', 'crooked', 'hands', 'twitch'],
  'petra-leyte': ['#df735d', '#f1c28f', '⌘', 'ribbon', 'checks', 'bounce'],
  'priscilla-barielle': ['#c63d35', '#e5b347', '☀', 'crown', 'sunburst', 'blaze'],
  sekmet: ['#73658f', '#aaa0b7', '〰', 'haze', 'smoke', 'drowse'],
  satella: ['#3e284f', '#b94875', '♥', 'void', 'shadows', 'heartbeat'],
  schult: ['#c6aa7c', '#7a98b4', '♧', 'bell', 'linen', 'chime'],
  typhon: ['#3fa59c', '#e6c85a', '⚖', 'judge', 'shards', 'tilt'],
  'wilhelm-astrea': ['#394e67', '#a64545', '剣', 'scar', 'cuts', 'draw'],
  'sirius-romaneeconti': ['#b4472f', '#e07b32', '♨', 'chain', 'embers', 'fever'],
  shaula: ['#6d54b4', '#e19f3d', '♏', 'star', 'constellation', 'orbit'],
  'julius-juukulius': ['#4c5da6', '#9b8bd1', '♞', 'filigree', 'spirits', 'poise'],
  'joshua-juukulius': ['#7798ba', '#d8e2ec', '▤', 'folio', 'pages', 'turn'],
  emilia: ['#8e72c9', '#8fd3df', '❅', 'crystal-flower', 'frost-petals', 'aurora'],
});

function graphemes(value) {
  const text = String(value ?? '').trim();
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' }).segment(text)]
      .map((item) => item.segment);
  }
  return Array.from(text);
}

function normalizeName(value) {
  return String(value ?? '').trim().replace(/[・•]/gu, '·');
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value ?? '')) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const rgb = hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
      : hue < 180 ? [0, c, x]
        : hue < 240 ? [0, x, c]
          : hue < 300 ? [x, 0, c]
            : [c, 0, x];
  return `#${rgb.map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function genericCharacter(name) {
  const displayName = normalizeName(name) || '未知人物';
  const seed = hash(displayName);
  return {
    kind: 'generic',
    stableId: `generic-${seed.toString(16)}`,
    skinId: 'generic',
    rosterName: displayName,
    displayName,
    aliases: [displayName],
    portraitKey: 'generic',
    initial: graphemes(displayName)[0] ?? '?',
    primary: hslToHex(seed % 360, 52, 42),
    secondary: hslToHex((seed + 47) % 360, 44, 62),
    symbol: '◇',
    shape: 'generic',
    texture: 'paper',
    motion: 'sheen',
    avatar: { localUrl: '', primaryUrl: '', fallbackUrl: '' },
  };
}

function makeCharacter(entry, index) {
  const visual = VISUALS[entry.stableId];
  if (!visual) throw new Error(`Missing visual identity for ${entry.stableId}`);
  const [primary, secondary, symbol, shape, texture, motion] = visual;
  const encodedFile = encodeURIComponent(entry.referenceFile);
  return Object.freeze({
    ...entry,
    kind: 'character',
    skinId: entry.stableId,
    shortName: entry.rosterName,
    initial: graphemes(entry.rosterName)[0] ?? '?',
    primary,
    secondary,
    symbol,
    shape,
    texture,
    motion,
    variant: index % 8,
    styleSeed: hash(entry.stableId) % 360,
    avatar: Object.freeze({
      localUrl: `../narrative/assets/avatars/${entry.portraitKey}.webp`,
      primaryUrl: `${ASSET_ROOT}/${encodedFile}`,
      fallbackUrl: `https://raw.githubusercontent.com/1798547983tt/re0/${ASSET_COMMIT}/avatars/${encodedFile}`,
    }),
    aliases: Object.freeze([...entry.aliases]),
  });
}

export const CHARACTER_REGISTRY = Object.freeze([...registryData, ...V2_ADDITIONAL_CHARACTER_DATA].map(makeCharacter));

const ALIAS_INDEX = new Map();
for (const character of CHARACTER_REGISTRY) {
  for (const alias of new Set([character.rosterName, character.displayName, ...character.aliases])) {
    const key = normalizeName(alias);
    if (key && !ALIAS_INDEX.has(key)) ALIAS_INDEX.set(key, character);
  }
}

export function emphasisIndexes(name) {
  const characters = graphemes(name).filter((character) => !/[\s·・•]/u.test(character));
  if (!characters.length) return [];
  return characters.length <= 3 ? [0] : [0, 2];
}

export function splitEmphasizedName(name) {
  const characters = graphemes(name);
  const visibleIndexes = emphasisIndexes(name);
  let visibleIndex = -1;
  return characters.map((character) => {
    if (!/[\s·・•]/u.test(character)) visibleIndex += 1;
    return { character, emphasized: visibleIndexes.includes(visibleIndex) };
  });
}

export function resolveCharacter(name) {
  const key = normalizeName(name);
  return ALIAS_INDEX.get(key) ?? genericCharacter(key);
}
