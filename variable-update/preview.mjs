const SAMPLE_ANALYSIS = '本轮叙事中，王都外环的降雪从傍晚持续至深夜，主角在旧水门与巡逻队完成情报交换，并确认先前标记为传闻的银色徽章已经由两名互不相识的目击者分别提及。关系变化只记录已在对话与行动中明确成立的信任增量，不推断未表达的好感；轮回账本保持现有次数，因为本轮没有发生菜月昴实际死亡。事件节点补记水门会合的起因、经过与结果，线索域保存徽章的外观、出现地点和当前可信范围，资产域仅更新已经交付的通行文书，规则域不因角色猜测而新增限制。为测试狭窄容器与长中文换行，这段固定预览文字刻意保持较长，并包含连续叙述、全角标点、英文代号 WORLDLINE-ARCHIVE-ALPHA-0007 与不会自然断开的路径式文本。';
const SAMPLE_PATCH = JSON.stringify([
  {
    op: 'replace',
    path: '/世界/环境/天气',
    value: '王都外环自傍晚起持续降雪，石桥与旧水门附近能见度降低',
  },
  {
    op: 'add',
    path: '/事件/-',
    value: {
      标题: '旧水门的情报交换与银色徽章复证',
      结果: '通行文书已交付；徽章线索由两名独立目击者分别提及，但来源仍待追查',
      说明: '固定惰性预览数据只用于测试长 CJK、深层 JSON、长路径与窄容器滚动，不代表真实剧情写入',
    },
  },
], null, 2);

const mount = document.querySelector('[data-re0-vu-preview-mount]');
const params = new URLSearchParams(window.location.search);
const requestedState = params.get('state');
const state = new Set(['pending', 'complete', 'both']).has(requestedState) ? requestedState : 'both';
const shouldOpen = params.get('open') === 'all';
const states = state === 'both' ? ['pending', 'complete'] : [state];

async function render() {
  try {
    const [pendingResponse, completeResponse] = await Promise.all([
      fetch('./pending.html', { cache: 'no-store' }),
      fetch('./complete.html', { cache: 'no-store' }),
    ]);
    if (!pendingResponse.ok) throw new Error(`pending fragment returned HTTP ${pendingResponse.status}`);
    if (!completeResponse.ok) throw new Error(`complete fragment returned HTTP ${completeResponse.status}`);
    const [pendingTemplate, completeTemplate] = await Promise.all([
      pendingResponse.text(),
      completeResponse.text(),
    ]);
    const templates = new Map([
      ['pending', pendingTemplate],
      ['complete', completeTemplate],
    ]);
    const rendered = states.map((fragmentState) => {
      const fragment = templates.get(fragmentState)
        .split('$1').join(SAMPLE_ANALYSIS)
        .split('$2').join(SAMPLE_PATCH);
      return `<section data-re0-vu-preview-state><p data-re0-vu-preview-label>${fragmentState.toUpperCase()} // SOURCE FRAGMENT</p>${fragment}</section>`;
    }).join('');

    mount.innerHTML = rendered;
    if (shouldOpen) {
      for (const details of mount.querySelectorAll('details')) details.open = true;
    }
  } catch (error) {
    mount.replaceChildren();
    const message = document.createElement('p');
    message.setAttribute('data-re0-vu-preview-error', '');
    message.textContent = `无法载入变量更新回执预览：${error instanceof Error ? error.message : String(error)}`;
    mount.append(message);
  }
}

void render();
