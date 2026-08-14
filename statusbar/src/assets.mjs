export const ASSET_MANIFEST = Object.freeze({
  revision: '75d39874e8b6246a0d5f9bd45779441cdaf743cf',
  assets: Object.freeze({
    'day-archive-wide.webp': Object.freeze({
      local: './assets/day-archive-wide.webp',
      production: 'https://raw.githubusercontent.com/1798547983tt/re0/75d39874e8b6246a0d5f9bd45779441cdaf743cf/statusbar/assets/day-archive-wide.webp',
      width: 2172,
      height: 724,
      role: '日间宽屏背景',
    }),
    'day-archive-mobile.webp': Object.freeze({
      local: './assets/day-archive-mobile.webp',
      production: 'https://raw.githubusercontent.com/1798547983tt/re0/75d39874e8b6246a0d5f9bd45779441cdaf743cf/statusbar/assets/day-archive-mobile.webp',
      width: 1003,
      height: 1568,
      role: '日间移动背景',
    }),
    'night-tea-wide.webp': Object.freeze({
      local: './assets/night-tea-wide.webp',
      production: 'https://raw.githubusercontent.com/1798547983tt/re0/75d39874e8b6246a0d5f9bd45779441cdaf743cf/statusbar/assets/night-tea-wide.webp',
      width: 2172,
      height: 724,
      role: '夜间宽屏背景',
    }),
    'night-tea-mobile.webp': Object.freeze({
      local: './assets/night-tea-mobile.webp',
      production: 'https://raw.githubusercontent.com/1798547983tt/re0/75d39874e8b6246a0d5f9bd45779441cdaf743cf/statusbar/assets/night-tea-mobile.webp',
      width: 972,
      height: 1619,
      role: '夜间移动背景',
    }),
  }),
});

export function assetUrl(name, { search = globalThis.location?.search || '' } = {}) {
  const entry = ASSET_MANIFEST.assets[name];
  if (!entry) throw new RangeError(`未知状态栏素材：${name}`);
  const parameters = new URLSearchParams(search);
  return parameters.get('assets') === 'local' ? entry.local : entry.production;
}

export function artworkUrls(options) {
  return Object.freeze({
    day: Object.freeze({
      wide: assetUrl('day-archive-wide.webp', options),
      mobile: assetUrl('day-archive-mobile.webp', options),
    }),
    night: Object.freeze({
      wide: assetUrl('night-tea-wide.webp', options),
      mobile: assetUrl('night-tea-mobile.webp', options),
    }),
  });
}
