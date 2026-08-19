import { CHARACTER_REGISTRY } from './characters.mjs';
import { VOLUME_TITLES, formatStoryHeading } from './titles.mjs';
import { renderNarrative } from './renderer.mjs';

const mount = document.querySelector('[data-re0v2-mount]');
const sourceCarrier = document.querySelector('#re0v2-source');
const volumeSelect = document.querySelector('[data-preview-volume]');
const characterSelect = document.querySelector('[data-preview-character]');

function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function selectedSource(baseSource) {
  const volume = VOLUME_TITLES.find((entry) => entry.volume === volumeSelect.value) ?? VOLUME_TITLES[0];
  return baseSource
    .replace(
      /<story volume="\d{2}">[\s\S]*?<\/story>/u,
      `<story volume="${volume.volume}">${formatStoryHeading(volume)}</story>`,
    )
    .replace('{艾姬多娜}「知识并不保证正确答案，但它至少会让错误变得有趣。」', `{${characterSelect.value}}「这是一条用于检验专属头像、姓名强调、符号与流动文字的预览对白。」`);
}

async function bootPreview() {
  for (const title of VOLUME_TITLES) volumeSelect.append(option(title.volume, `${title.volume}｜${title.title}`));
  for (const character of CHARACTER_REGISTRY) characterSelect.append(option(character.rosterName, character.displayName));
  volumeSelect.value = '20';
  characterSelect.value = '艾姬多娜';
  const response = await fetch('./fixtures/showcase.xml');
  if (!response.ok) throw new Error(`无法载入预览正文：${response.status}`);
  const baseSource = await response.text();
  sourceCarrier.value = baseSource;
  const render = () => renderNarrative(mount, selectedSource(baseSource));
  volumeSelect.addEventListener('change', render);
  characterSelect.addEventListener('change', render);
  render();
}

bootPreview().catch((error) => {
  const app = document.querySelector('#re0v2-app');
  if (!app) return;
  const message = document.createElement('p');
  message.className = 're0v2-loading';
  message.textContent = error?.message || '预览启动失败。';
  app.replaceChildren(message);
  app.setAttribute('aria-busy', 'false');
});
