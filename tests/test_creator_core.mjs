import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpeningMessage,
  buildStatePayload,
  createDefaultDraft,
  getStoryEvent,
  getStoryVolume,
  mergeAiPatch,
  normalizeStoryIndex,
  serializeDraft,
  suggestOffline,
  validateAiPatch,
  validateDraft,
} from '../frontend/src/creator-core.mjs';

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
  ]);
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
