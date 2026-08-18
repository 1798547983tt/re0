export const VISUAL_ASSET_COMMIT = '7bc787761a1489e09f4eb9443b92d19169364475';

const NARRATIVE_VISUAL_ASSET_ROOT = `https://raw.githubusercontent.com/1798547983tt/re0/${VISUAL_ASSET_COMMIT}/narrative-next/assets/generated`;
const narrativeVisualAssetUrl = (name) => `${NARRATIVE_VISUAL_ASSET_ROOT}/${name}`;

export const THEME_VISUALS = Object.freeze({
  day: Object.freeze({
    stage: narrativeVisualAssetUrl('theme-day-stage.webp'),
    scene: narrativeVisualAssetUrl('scene-day.webp'),
  }),
  night: Object.freeze({
    stage: narrativeVisualAssetUrl('theme-night-stage.webp'),
    scene: narrativeVisualAssetUrl('scene-night.webp'),
  }),
  tea: Object.freeze({
    stage: narrativeVisualAssetUrl('theme-tea-stage.webp'),
    scene: narrativeVisualAssetUrl('scene-tea.webp'),
  }),
});

export const ABILITY_VISUALS = Object.freeze({
  skill: narrativeVisualAssetUrl('ability-skill.webp'),
  authority: narrativeVisualAssetUrl('ability-authority.webp'),
  blessing: narrativeVisualAssetUrl('ability-blessing.webp'),
  magic: narrativeVisualAssetUrl('ability-magic.webp'),
  spirit: narrativeVisualAssetUrl('ability-spirit.webp'),
  racial: narrativeVisualAssetUrl('ability-racial.webp'),
  martial: narrativeVisualAssetUrl('ability-martial.webp'),
});

export const SPECIAL_VISUALS = Object.freeze({
  check: narrativeVisualAssetUrl('special-check.webp'),
  restart: narrativeVisualAssetUrl('special-restart.webp'),
});

function narrativeVisualCssImage(url) {
  return url ? `url("${url}")` : 'none';
}

export function resolveThemeVisuals(themeId) {
  return THEME_VISUALS[themeId] || THEME_VISUALS.day;
}

export function resolveAbilityVisual(kindToken) {
  return ABILITY_VISUALS[kindToken] || '';
}

export function applyThemeVisuals(target, themeId) {
  const theme = resolveThemeVisuals(themeId);
  target.style.setProperty('--re0v2-theme-stage', narrativeVisualCssImage(theme.stage));
  target.style.setProperty('--re0v2-scene-art', narrativeVisualCssImage(theme.scene));
  target.style.setProperty('--re0v2-check-art', narrativeVisualCssImage(SPECIAL_VISUALS.check));
  target.style.setProperty('--re0v2-restart-art', narrativeVisualCssImage(SPECIAL_VISUALS.restart));
  return theme;
}

export function abilityVisualCss(kindToken) {
  return narrativeVisualCssImage(resolveAbilityVisual(kindToken));
}
