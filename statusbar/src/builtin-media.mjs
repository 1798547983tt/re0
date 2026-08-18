export const MEDIA_REVISION = '3a7a36a3e16809e8d53faabb2a453a5d48f30abd';

const REPOSITORY_RAW_ROOT = `https://raw.githubusercontent.com/1798547983tt/re0/${MEDIA_REVISION}`;
const MEDIA_DIRECTORIES = Object.freeze({
  music: '../music',
  avatars: '../avatars',
});

function freezeTrack(track) {
  return Object.freeze({ ...track, kind: 'builtin' });
}

function freezePortrait(portrait) {
  return Object.freeze({
    ...portrait,
    aliases: Object.freeze([...portrait.aliases]),
  });
}

export const BUILT_IN_TRACKS = Object.freeze([
  freezeTrack({
    id: 'builtin:styx-helix',
    title: 'STYX HELIX',
    artist: 'MYTH & ROID',
    file: 'MYTH+&+ROID+-+STYX+HELIX.mp3',
  }),
  freezeTrack({ id: 'builtin:memento', title: 'Memento', artist: 'Re:Zero', file: 'Memento.mp3' }),
  freezeTrack({ id: 'builtin:love-you', title: '好喜欢你', artist: '本地收藏', file: '好喜欢你.mp3' }),
  freezeTrack({ id: 'builtin:pinky-promise', title: '拉过勾的', artist: '本地收藏', file: '拉过勾的.mp3' }),
]);

export const BUILT_IN_PORTRAITS = Object.freeze([
  freezePortrait({ stableId: 'al-debaran', displayName: '阿尔·迪巴兰', referenceFile: '阿尔.webp', aliases: ['阿尔·迪巴兰', '阿尔德巴兰', '阿尔迪巴兰', '阿尔'] }),
  freezePortrait({ stableId: 'elsa-granhiert', displayName: '艾尔莎·葛兰希尔特', referenceFile: '艾尔莎.webp', aliases: ['艾尔莎·葛兰希尔特', '艾尔莎'] }),
  freezePortrait({ stableId: 'echidna', displayName: '艾姬多娜', referenceFile: '艾姬多娜 强欲魔女.webp', aliases: ['艾姬多娜'] }),
  freezePortrait({ stableId: 'emilia', displayName: '爱蜜莉雅', referenceFile: '爱蜜莉雅.png', aliases: ['爱蜜莉雅', '艾米莉亚', '艾蜜莉雅', 'Emilia'] }),
  freezePortrait({ stableId: 'anastasia-hoshin', displayName: '安娜塔西亚·合辛', referenceFile: '安娜塔西亚.webp', aliases: ['安娜塔西亚·合辛', '安娜塔西亚'] }),
  freezePortrait({ stableId: 'otto-suwen', displayName: '奥托·苏文', referenceFile: '奥托.webp', aliases: ['奥托·苏文', '奥托·思文', '奥托'] }),
  freezePortrait({ stableId: 'yae-tengen', displayName: '八重·天膳', referenceFile: '八重.webp', aliases: ['八重·天膳', '八重'] }),
  freezePortrait({ stableId: 'beatrice', displayName: '贝亚特丽丝', referenceFile: '碧翠丝.webp', aliases: ['贝亚特丽丝', '贝阿特丽丝', '碧翠丝'] }),
  freezePortrait({ stableId: 'natsuki-subaru', displayName: '菜月昴', referenceFile: '菜月昴.webp', aliases: ['菜月昴', '菜月·昴', '昴'] }),
  freezePortrait({ stableId: 'daphne', displayName: '达芙妮', referenceFile: '达芙妮 暴食魔女.webp', aliases: ['达芙妮'] }),
  freezePortrait({ stableId: 'felix-argyle', displayName: '菲利克斯·阿盖尔', referenceFile: '菲利克斯.webp', aliases: ['菲利克斯·阿盖尔', '菲利克斯', '菲莉丝'] }),
  freezePortrait({ stableId: 'felt', displayName: '菲鲁特', referenceFile: '菲鲁特.webp', aliases: ['菲鲁特'] }),
  freezePortrait({ stableId: 'frederica-baumann', displayName: '法兰德丽卡·鲍曼', referenceFile: '弗雷德莉卡.webp', aliases: ['法兰德丽卡·鲍曼', '弗雷德莉卡', '法兰德丽卡', '法兰黛莉卡'] }),
  freezePortrait({ stableId: 'hector', displayName: '赫克托尔', referenceFile: '赫克托尔 忧郁魔人.webp', aliases: ['赫克托尔', '赫克特'] }),
  freezePortrait({ stableId: 'heinkel-astrea', displayName: '亨克尔·阿斯特雷亚', referenceFile: '亨克尔.webp', aliases: ['亨克尔·阿斯特雷亚', '亨克尔'] }),
  freezePortrait({ stableId: 'garfiel-tinsel', displayName: '加菲尔·汀泽尔', referenceFile: '加菲尔.webp', aliases: ['加菲尔·汀泽尔', '嘉飞尔·闵', '加菲尔', '嘉飞尔'] }),
  freezePortrait({ stableId: 'carmilla', displayName: '卡蜜拉', referenceFile: '卡蜜拉 色欲魔女.webp', aliases: ['卡蜜拉'] }),
  freezePortrait({ stableId: 'capella-lugunica', displayName: '卡佩拉·艾美拉达·露格尼卡', referenceFile: '卡佩拉.webp', aliases: ['卡佩拉·艾美拉达·露格尼卡', '卡佩拉', '卡佩菈'] }),
  freezePortrait({ stableId: 'crusch-karsten', displayName: '库珥修·卡尔斯腾', referenceFile: '库珥修.webp', aliases: ['库珥修·卡尔斯腾', '库珥修'] }),
  freezePortrait({ stableId: 'ram', displayName: '拉姆', referenceFile: '拉姆.webp', aliases: ['拉姆'] }),
  freezePortrait({ stableId: 'ley-batenkaitos', displayName: '莱伊·巴登凯托斯', referenceFile: '莱伊.webp', aliases: ['莱伊·巴登凯托斯', '莱伊'] }),
  freezePortrait({ stableId: 'reinhard-astrea', displayName: '莱茵哈鲁特·范·阿斯特雷亚', referenceFile: '莱茵哈鲁特.webp', aliases: ['莱茵哈鲁特·范·阿斯特雷亚', '莱因哈鲁特', '莱茵哈鲁特'] }),
  freezePortrait({ stableId: 'reid-astrea', displayName: '雷德·阿斯特雷亚', referenceFile: '雷德 初代剑圣.webp', aliases: ['雷德·阿斯特雷亚', '雷伊德·阿斯特雷亚', '雷伊德', '雷德'] }),
  freezePortrait({ stableId: 'regulus-corneas', displayName: '雷古勒斯·柯尔尼亚斯', referenceFile: '雷古勒斯.webp', aliases: ['雷古勒斯·柯尔尼亚斯', '雷古勒斯'] }),
  freezePortrait({ stableId: 'rem', displayName: '蕾姆', referenceFile: '蕾姆.webp', aliases: ['蕾姆', '雷姆'] }),
  freezePortrait({ stableId: 'ricardo-welkin', displayName: '里卡多·威尔金', referenceFile: '里卡多.webp', aliases: ['里卡多·威尔金', '里卡德', '里卡多'] }),
  freezePortrait({ stableId: 'rui-arneb', displayName: '鲁伊', referenceFile: '鲁伊.webp', aliases: ['鲁伊', '鲁伊·阿鲁奈布', '露伊', '露伊·亚尔聂博'] }),
  freezePortrait({ stableId: 'roy-alphard', displayName: '罗伊·阿尔法鲁多', referenceFile: '罗伊.webp', aliases: ['罗伊·阿尔法鲁多', '罗伊·爱尔法德', '罗伊'] }),
  freezePortrait({ stableId: 'roswaal-mathers', displayName: '罗兹瓦尔·L·梅扎斯', referenceFile: '罗兹瓦尔.webp', aliases: ['罗兹瓦尔·L·梅扎斯', '罗兹瓦尔'] }),
  freezePortrait({ stableId: 'meili-portroute', displayName: '梅莉·波特鲁特', referenceFile: '梅莉.webp', aliases: ['梅莉·波特鲁特', '梅莉'] }),
  freezePortrait({ stableId: 'minerva', displayName: '密涅瓦', referenceFile: '密涅瓦 愤怒魔女.webp', aliases: ['密涅瓦'] }),
  freezePortrait({ stableId: 'puck', displayName: '帕克', referenceFile: '帕克.webp', aliases: ['帕克'] }),
  freezePortrait({ stableId: 'pandora', displayName: '潘多拉', referenceFile: '潘多拉 虚饰魔女.webp', aliases: ['潘多拉', '潘朵拉'] }),
  freezePortrait({ stableId: 'petelgeuse-romaneeconti', displayName: '培提尔其乌斯·罗曼尼康帝', referenceFile: '培提尔其乌斯 怠惰大司教.webp', aliases: ['培提尔其乌斯·罗曼尼康帝', '培提尔其乌斯', '贝特鲁吉乌斯'] }),
  freezePortrait({ stableId: 'petra-leyte', displayName: '佩特拉', referenceFile: '佩特拉.webp', aliases: ['佩特拉'] }),
  freezePortrait({ stableId: 'priscilla-barielle', displayName: '普莉希拉·跋利耶尔', referenceFile: '普莉希拉.webp', aliases: ['普莉希拉·跋利耶尔', '普莉希拉'] }),
  freezePortrait({ stableId: 'sekmet', displayName: '塞赫麦特', referenceFile: '塞赫麦特 怠惰魔女.webp', aliases: ['塞赫麦特', '赛赫麦特'] }),
  freezePortrait({ stableId: 'satella', displayName: '莎缇拉', referenceFile: '莎缇拉 嫉妒魔女.webp', aliases: ['莎缇拉', '莎提拉', '嫉妒魔女'] }),
  freezePortrait({ stableId: 'schult', displayName: '舒尔特', referenceFile: '舒尔特.webp', aliases: ['舒尔特'] }),
  freezePortrait({ stableId: 'typhon', displayName: '缇丰', referenceFile: '缇丰 傲慢魔女.webp', aliases: ['缇丰'] }),
  freezePortrait({ stableId: 'wilhelm-astrea', displayName: '威尔海姆·范·阿斯特雷亚', referenceFile: '威尔海姆.webp', aliases: ['威尔海姆·范·阿斯特雷亚', '威尔海姆'] }),
  freezePortrait({ stableId: 'sirius-romaneeconti', displayName: '西里乌斯·罗曼尼康帝', referenceFile: '西里乌斯.webp', aliases: ['西里乌斯·罗曼尼康帝', '叙吕厄斯', '西里乌斯'] }),
  freezePortrait({ stableId: 'shaula', displayName: '夏乌拉', referenceFile: '夏乌拉.webp', aliases: ['夏乌拉'] }),
  freezePortrait({ stableId: 'julius-juukulius', displayName: '尤里乌斯·尤克历乌斯', referenceFile: '尤里乌斯.webp', aliases: ['尤里乌斯·尤克历乌斯', '尤里乌斯', '由里乌斯'] }),
  freezePortrait({ stableId: 'joshua-juukulius', displayName: '约书亚·尤克历乌斯', referenceFile: '约书亚webp.webp', aliases: ['约书亚·尤克历乌斯', '约书亚'] }),
]);

export function mediaAssetUrl(directory, filename, { search = globalThis.location?.search || '' } = {}) {
  const localRoot = MEDIA_DIRECTORIES[directory];
  if (!localRoot) throw new RangeError(`未知媒体目录：${directory}`);
  const safeFilename = String(filename ?? '').trim();
  if (!safeFilename || /[\\/]/u.test(safeFilename)) throw new RangeError('媒体文件名无效');
  const encoded = encodeURIComponent(safeFilename);
  const parameters = new URLSearchParams(search);
  return parameters.get('assets') === 'local'
    ? `${localRoot}/${encoded}`
    : `${REPOSITORY_RAW_ROOT}/${directory}/${encoded}`;
}

export function builtInTrackList(options) {
  return BUILT_IN_TRACKS.map((track) => Object.freeze({
    ...track,
    url: mediaAssetUrl('music', track.file, options),
  }));
}

function normalizeAlias(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·・．.，,。:：;；'"“”‘’（）()【】\[\]{}<>《》_—-]+/gu, '');
}

const PORTRAIT_ALIAS_INDEX = (() => {
  const entries = [];
  for (const portrait of BUILT_IN_PORTRAITS) {
    for (const alias of portrait.aliases) {
      const normalized = normalizeAlias(alias);
      if (normalized) entries.push({ normalized, portrait });
    }
  }
  entries.sort((left, right) => right.normalized.length - left.normalized.length);
  return Object.freeze(entries);
})();

export function builtInPortraitForName(name, options) {
  const normalizedName = normalizeAlias(name);
  if (!normalizedName) return null;
  const exact = PORTRAIT_ALIAS_INDEX.find((entry) => entry.normalized === normalizedName);
  const contained = exact || PORTRAIT_ALIAS_INDEX.find(
    (entry) => entry.normalized.length >= 2 && normalizedName.includes(entry.normalized),
  );
  if (!contained) return null;
  return Object.freeze({
    ...contained.portrait,
    url: mediaAssetUrl('avatars', contained.portrait.referenceFile, options),
  });
}

