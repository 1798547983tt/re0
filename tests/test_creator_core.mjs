import test from 'node:test';
import assert from 'node:assert/strict';
import * as creatorCore from '../frontend/src/creator-core.mjs';
import {
  buildOpeningMessage,
  buildStatePayload,
  createDefaultDraft,
  getStoryEvent,
  getStoryVolume,
  mergeAiPatch,
  prepareAiPatch,
  normalizeStoryIndex,
  parseDraft,
  serializeDraft,
  suggestOffline,
  validateAiPatch,
  validateDraft,
} from '../frontend/src/creator-core.mjs';

const { ABILITY_CATEGORIES, COMBAT_TIER_LEVELS, COMBAT_TIER_POSITIONS } = creatorCore;

const storyFixture = normalizeStoryIndex([
  {
    number: 1,
    title: 'Re：从零开始的异世界生活｜第01卷',
    events: [
      {
        id: 1,
        title: '异世界召唤与银发少女的相遇',
        time: '魔女历1000年01月01日 · 下午 · 主线 · 编辑演算',
        date: '魔女历1000年01月01日',
        period: '下午',
        layer: '主线',
        note: '编辑演算',
        timeDescription: 'D0，便利店离开后不久。',
      },
      {
        id: 2,
        title: '第一次进入赃物库，艾尔莎制造死局',
        time: '魔女历1000年01月01日 · 傍晚 · 轮回分支#1 · 轮回重置',
        date: '魔女历1000年01月01日',
        period: '傍晚',
        layer: '轮回分支#1',
        note: '轮回重置',
      },
    ],
  },
]);

function completeDraft() {
  const draft = createDefaultDraft();
  draft.protagonist.name = '星见澪';
  draft.protagonist.roleType = '原创角色';
  draft.protagonist.identity = '来自异界的记录员';
  draft.protagonist.faction = '中立';
  draft.personality.wish = '让重要的人活着走到明天';
  draft.personality.boundary = '不以无辜者换取胜利';
  draft.protagonist.currentGoal = '找到能改变结局的第一条线索';
  draft.combatTier.level = '3阶';
  draft.combatTier.position = '上位';
  draft.combatTier.combatStatus = '可战';
  draft.combatTier.condition = '常态即可发挥';
  draft.storyAnchor = {
    volumeNumber: 1,
    volumeTitle: storyFixture[0].title,
    eventId: 1,
    eventTitle: storyFixture[0].events[0].title,
    eventTime: storyFixture[0].events[0].time,
  };
  return draft;
}

test('story index returns the selected volume and event with preserved event time', () => {
  const volume = getStoryVolume(storyFixture, 1);
  const event = getStoryEvent(storyFixture, 1, 2);

  assert.equal(volume.title, 'Re：从零开始的异世界生活｜第01卷');
  assert.equal(event.title, '第一次进入赃物库，艾尔莎制造死局');
  assert.equal(event.layer, '轮回分支#1');
  assert.equal(event.note, '轮回重置');
  assert.equal(volume.displayTitle, '异世界召唤与银发少女的相遇');
  assert.equal(volume.events[0].timeDescription, 'D0，便利店离开后不久。');
});

test('draft validation rejects missing required identity and story anchor fields', () => {
  const result = validateDraft(createDefaultDraft());

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.path), [
    'protagonist.name',
    'protagonist.roleType',
    'storyAnchor.volumeNumber',
    'storyAnchor.eventId',
    'personality.wish',
    'combatTier.level',
    'combatTier.position',
  ]);
});

test('combat tier exposes exactly seven levels with upper and lower positions', () => {
  const draft = createDefaultDraft();

  assert.deepEqual(COMBAT_TIER_LEVELS, ['1阶', '2阶', '3阶', '4阶', '5阶', '6阶', '7阶']);
  assert.deepEqual(COMBAT_TIER_POSITIONS, ['上位', '下位']);
  assert.deepEqual(draft.combatTier, {
    level: '',
    position: '',
    combatStatus: '未知',
    condition: '',
  });
});

test('creator drafts no longer carry the removed age-stage field', () => {
  const draft = createDefaultDraft();
  const legacy = structuredClone(draft);
  legacy.protagonist.ageStage = '青年';

  assert.equal(Object.hasOwn(draft.protagonist, 'ageStage'), false);
  assert.equal(Object.hasOwn(parseDraft(JSON.stringify(legacy)).protagonist, 'ageStage'), false);
  assert.equal(Object.hasOwn(JSON.parse(serializeDraft(legacy)).protagonist, 'ageStage'), false);
  assert.equal(Object.hasOwn(buildStatePayload(legacy).主角档案, '年龄阶段'), false);
  assert.doesNotMatch(buildOpeningMessage(legacy), /年龄|青年/);
});

test('ability categories expose the seven Re:0 state buckets in display order', () => {
  assert.deepEqual(ABILITY_CATEGORIES, ['加护', '权能', '魔法', '精灵术', '种族能力', '武技', '一般技能']);
});

test('state payload maps the creator draft to the ZOD-aligned Chinese state concepts', () => {
  const payload = buildStatePayload(completeDraft());

  assert.equal(payload.规则.schema版本, 're0-state-v1');
  assert.equal(payload.主角档案.姓名, '星见澪');
  assert.equal(payload.主角档案.角色类型, '原创角色');
  assert.equal(payload.世界.当前时间.规范日期, '魔女历1000年01月01日');
  assert.equal(payload.世界.当前时间.时间层, '主线');
  assert.equal(payload.世界.当前时间.轮回分支, 'B00');
  assert.equal(payload.规则.初始化完成, false);
  assert.equal(payload.事件.进行中['1'].标题, '异世界召唤与银发少女的相遇');
  assert.deepEqual(payload.主角档案.战力等阶, {
    阶数: '3阶',
    位阶: '上位',
    可战状态: '可战',
    生效条件: '常态即可发挥',
  });
});

test('state payload normalizes creator-only choices to strict ZOD enums and assets', () => {
  const draft = completeDraft();
  draft.protagonist.roleType = '异界来客';
  draft.storyAnchor.date = '魔女历1000年02月02日';
  draft.storyAnchor.period = '上午至下午';
  draft.storyAnchor.layer = '轮回分支#3';
  draft.assets.currency = [{ name: '圣金币', quantity: 12, description: '' }];
  draft.relationships = [{ name: '爱蜜莉雅', relation: '救命之人', stance: '友方', trust: 44, notes: '' }];

  const payload = buildStatePayload(draft);

  assert.equal(payload.主角档案.角色类型, '原创角色');
  assert.equal(payload.主角档案.创角类型, '异界来客');
  assert.equal(payload.世界.当前时间.时段, '上午');
  assert.equal(payload.世界.当前时间.时间层, '轮回分支');
  assert.equal(payload.世界.当前时间.轮回分支, 'B03');
  assert.equal(payload.资产.货币.圣金币.数量, 12);
  assert.equal(payload.关系.人物.爱蜜莉雅.好感, 44);
});

test('opening message includes the story anchor and preserves the character voice inputs', () => {
  const opening = buildOpeningMessage(completeDraft());

  assert.match(opening, /星见澪/);
  assert.match(opening, /第01卷/);
  assert.match(opening, /异世界召唤与银发少女的相遇/);
  assert.match(opening, /魔女历1000年01月01日/);
  assert.match(opening, /不以无辜者换取胜利/);
  assert.match(opening, /3阶上位/);
  assert.match(opening, /常态即可发挥/);
});

test('state payload routes every ability into its selected ZOD category', () => {
  const draft = completeDraft();
  draft.abilities = ABILITY_CATEGORIES.map((category, index) => ({
    name: `${category}${index + 1}`,
    category,
    status: '可用',
    cost: '无',
    description: `${category}效果`,
    limits: '',
  }));
  draft.abilities.push({
    name: '自定义秘技',
    category: '异界科技',
    status: '受限',
    cost: '零件',
    description: '来自异世界的装置',
    limits: '无法在缺少材料时修复',
  });

  const abilities = buildStatePayload(draft).主角档案.能力;

  for (const category of ABILITY_CATEGORIES) {
    assert.ok(Object.hasOwn(abilities[category], `${category}${ABILITY_CATEGORIES.indexOf(category) + 1}`));
  }
  assert.match(abilities.一般技能.自定义秘技.描述, /自定义类别：异界科技/);
});

test('opening message keeps an incomplete combat tier readable instead of concatenating fallback labels', () => {
  const draft = createDefaultDraft();
  const opening = buildOpeningMessage(draft);

  assert.match(opening, /战力等阶是未定/);
  assert.doesNotMatch(opening, /未定未定/);
});

test('legacy drafts gain an empty combat tier without losing existing data', () => {
  const legacy = completeDraft();
  delete legacy.combatTier;

  const parsed = parseDraft(JSON.stringify(legacy));

  assert.equal(parsed.protagonist.name, '星见澪');
  assert.deepEqual(parsed.combatTier, {
    level: '',
    position: '',
    combatStatus: '未知',
    condition: '',
  });
});

test('AI patches can fill an empty combat tier but cannot overwrite a chosen level', () => {
  const draft = createDefaultDraft();
  draft.combatTier.level = '2阶';

  const result = mergeAiPatch(draft, {
    combatTier: {
      level: '5阶',
      position: '下位',
      condition: '仅在月光下生效',
    },
  });

  assert.equal(result.draft.combatTier.level, '2阶');
  assert.equal(result.draft.combatTier.position, '下位');
  assert.equal(result.draft.combatTier.condition, '仅在月光下生效');
  assert.ok(result.skippedPaths.includes('combatTier.level'));
  assert.ok(result.appliedPaths.includes('combatTier.position'));
});

test('offline suggestions fill empty fields without overwriting explicit user choices', () => {
  const draft = completeDraft();
  draft.personality.traits = [];
  const patch = suggestOffline(draft, 'personality');
  const result = mergeAiPatch(draft, {
    ...patch,
    protagonist: { ...patch.protagonist, name: '不应覆盖的建议名' },
  });

  assert.equal(result.draft.protagonist.name, '星见澪');
  assert.equal(result.draft.personality.wish, '让重要的人活着走到明天');
  assert.ok(result.draft.personality.traits.length > 0);
  assert.ok(result.appliedPaths.includes('personality.traits'));
  assert.ok(result.skippedPaths.includes('protagonist.name'));
});

test('serialized drafts round-trip as portable JSON', () => {
  const draft = completeDraft();
  const serialized = serializeDraft(draft);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.version, 're0-creator-draft-v1');
  assert.equal(parsed.storyAnchor.eventId, 1);
  assert.equal(parsed.protagonist.name, '星见澪');
});

test('AI patches reject unknown or prototype-polluting paths before merge', () => {
  const unsafe = JSON.parse('{"__proto__":{"polluted":true},"protagonist":{"name":"x"}}');
  const result = validateAiPatch(unsafe);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === '__proto__'));
  assert.throws(() => mergeAiPatch(createDefaultDraft(), unsafe), /AI 补丁/);
});

test('AI patch preparation keeps safe current-page fields inside common wrappers', () => {
  const prepared = prepareAiPatch({
    patch: {
      protagonist: {
        appearance: '银白长发与紫绀色眼睛，神情清冷。',
        hairColor: '银白',
      },
      storyAnchor: { eventTitle: '不得由模型改写' },
    },
    explanation: '额外说明不属于补丁',
  }, 'origin');

  assert.deepEqual(prepared.patch, {
    protagonist: { appearance: '银白长发与紫绀色眼睛，神情清冷。' },
  });
  assert.ok(prepared.ignoredPaths.includes('protagonist.hairColor'));
  assert.ok(prepared.ignoredPaths.includes('storyAnchor'));
});

test('AI patch preparation ignores schema-invalid values without losing valid siblings', () => {
  const prepared = prepareAiPatch({
    protagonist: {
      name: { nested: 'not text' },
      identity: '王都边境的旅人',
    },
    combatTier: {
      level: '999阶',
      position: '上位',
    },
  }, 'all-pages');

  assert.deepEqual(prepared.patch, {
    protagonist: { identity: '王都边境的旅人' },
    combatTier: { position: '上位' },
  });
  assert.ok(prepared.ignoredPaths.includes('protagonist.name'));
  assert.ok(prepared.ignoredPaths.includes('combatTier.level'));
  assert.throws(
    () => mergeAiPatch(createDefaultDraft(), { protagonist: { name: { nested: 'not text' } } }),
    /AI 补丁/,
  );
});

test('AI patch preparation finds a scoped patch behind metadata and unrelated sections', () => {
  const prepared = prepareAiPatch({
    abilities: [{ name: '当前身份页不应使用的能力' }],
    storyAnchor: { eventTitle: '不得由模型改写' },
    data: { requestId: 'request-1' },
    result: {
      patch: {
        protagonist: { name: '露娜' },
      },
    },
  }, 'identity');

  assert.deepEqual(prepared.patch, { protagonist: { name: '露娜' } });
  assert.ok(prepared.ignoredPaths.includes('abilities'));
  assert.ok(prepared.ignoredPaths.includes('storyAnchor'));
});

test('AI patch maps treat inherited object names as unknown data, never schema entries', () => {
  const response = JSON.parse('{"personality":{"wish":"守住重要之人"},"toString":{"x":1}}');
  const prepared = prepareAiPatch(response, 'heart');

  assert.deepEqual(prepared.patch, { personality: { wish: '守住重要之人' } });
  assert.ok(prepared.ignoredPaths.includes('toString'));

  const validation = validateAiPatch({ toString: { x: 1 } });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.path === 'toString'));
  assert.throws(() => mergeAiPatch(createDefaultDraft(), { toString: { x: 1 } }), /AI 补丁/);

  const inheritedScope = prepareAiPatch({ personality: { wish: '不得放宽范围' } }, 'toString');
  assert.deepEqual(inheritedScope.patch, {});
});
