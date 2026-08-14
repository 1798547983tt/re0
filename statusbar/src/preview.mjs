function clonePreviewValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function selectPreviewFixture(sample, fixture = 'normal') {
  const source = clonePreviewValue(sample || {});
  if (fixture === 'empty') {
    return {
      statData: {},
      status: 'preview',
      message: '离线空状态夹具',
    };
  }
  if (fixture === 'malformed') {
    return {
      statData: {
        世界: '损坏的世界域',
        主角档案: { 姓名: 42, 生命: 'not-a-number', 能力: null, 伤势: [] },
        轮回: null,
        关系: [],
        事件: { 进行中: 'not-a-record' },
        线索: { 未解问题: 'not-a-list' },
        资产: false,
        规则: { schema版本: 7, 初始化完成: 'unknown' },
      },
      status: 'preview',
      message: '离线畸形状态夹具',
    };
  }
  if (fixture === 'hostile') {
    source.主角档案 ??= {};
    source.主角档案.自定义印记 = '<img src=x onerror=alert(1)>';
    source.事件 ??= {};
    source.事件.进行中 ??= {};
    source.事件.进行中['EVT-MANSION-01'] ??= {};
    source.事件.进行中['EVT-MANSION-01'].标题 = '<script>window.pwned=true<' + '/script>';
    return {
      statData: source,
      status: 'preview',
      message: '离线恶意文本夹具',
    };
  }
  if (fixture === 'stale') {
    return {
      statData: source,
      status: 'stale',
      message: '离线旧数据夹具：正在显示上次读取的状态',
    };
  }
  return {
    statData: source,
    status: 'preview',
    message: '离线预览样例，不代表当前聊天状态',
  };
}
