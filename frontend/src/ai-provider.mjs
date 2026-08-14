function asText(value) {
  return value == null ? '' : String(value).trim();
}

export function buildAiPrompt(draft, stepId, idea = '') {
  const compactDraft = JSON.stringify(draft ?? {});
  return [
    '你是《Re：从零开始的异世界生活》创角向导的灵感助手。',
    `当前页面：${stepId}。`,
    '只返回一个 JSON 对象，作为局部草稿 patch；不得返回 Markdown、解释文字或代码围栏。',
    '不得覆盖用户已有内容；只补充空字段或新增条目。不得改变剧情锚点的卷、事件标题与事件时间。',
    '战力等阶只能使用1阶到7阶，位阶只能使用上位或下位；给出能力建议时应同步建议合理等阶与限制。',
    idea ? `用户额外要求：${idea}` : '请保持克制、可游玩，并给出明确限制。',
    `当前草稿：${compactDraft}`,
  ].join('\n');
}

export function parseAiResponse(value) {
  let text = value;
  if (value && typeof value === 'object') {
    text = value.choices?.[0]?.message?.content ?? value.output_text ?? value.content ?? value;
  }
  text = asText(text);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`AI 返回不是有效 JSON：${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('AI 返回必须是 JSON 对象');
  return parsed;
}

function parseApiUrl(apiUrl) {
  const value = asText(apiUrl).replace(/\/+$/, '');
  if (!value) throw new Error('请先填写 AI API 地址');
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    throw new Error('AI API 地址必须是完整 URL，例如 https://example.com/v1');
  }
}

function endpointWithPath(parsed, pathname) {
  parsed.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return parsed.toString();
}

export function resolveChatCompletionsEndpoint(apiUrl) {
  const parsed = parseApiUrl(apiUrl);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(pathname)) return endpointWithPath(parsed, pathname);
  if (/\/models$/i.test(pathname)) pathname = pathname.replace(/\/models$/i, '/chat/completions');
  else if (/\/v1$/i.test(pathname)) pathname += '/chat/completions';
  else if (!pathname || pathname === '/') pathname = '/v1/chat/completions';
  else pathname += '/v1/chat/completions';
  return endpointWithPath(parsed, pathname);
}

export function resolveModelsEndpoint(apiUrl) {
  const parsed = parseApiUrl(apiUrl);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(pathname)) pathname = pathname.replace(/\/chat\/completions$/i, '/models');
  else if (/\/completions$/i.test(pathname)) pathname = pathname.replace(/\/completions$/i, '/models');
  else if (/\/v1$/i.test(pathname)) pathname += '/models';
  else if (!/\/models$/i.test(pathname)) pathname = !pathname || pathname === '/' ? '/v1/models' : `${pathname}/v1/models`;
  return endpointWithPath(parsed, pathname || '/models');
}

export function modelIds(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.result)
          ? payload.result
          : [];
  return [...new Set(list
    .map((item) => (typeof item === 'string' ? item : item?.id ?? item?.name ?? item?.model ?? item?.key))
    .map(asText)
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function appendQuery(url, key, value) {
  const parsed = new URL(url);
  ['after', 'cursor', 'page', 'offset'].forEach((name) => parsed.searchParams.delete(name));
  parsed.searchParams.set(key, String(value));
  return parsed.toString();
}

export function nextModelsEndpoint(payload, currentEndpoint) {
  if (!payload || Array.isArray(payload)) return '';
  const links = payload.links ?? payload.pagination ?? {};
  const explicit = payload.next ?? payload.next_url ?? payload.nextUrl ?? links.next ?? links.next_url;
  if (explicit) return new URL(String(explicit), currentEndpoint).toString();
  if (payload.has_more !== true && payload.hasMore !== true) return '';
  const cursor = payload.next_cursor ?? payload.nextCursor ?? payload.cursor_next ?? payload.cursor;
  if (cursor) return appendQuery(currentEndpoint, 'after', cursor);
  if (payload.page != null) return appendQuery(currentEndpoint, 'page', Number(payload.page) + 1);
  if (payload.offset != null && payload.limit != null) return appendQuery(currentEndpoint, 'offset', Number(payload.offset) + Number(payload.limit));
  return '';
}

function requestHeaders(apiKey, contentType = false) {
  const headers = { Accept: 'application/json' };
  if (contentType) headers['content-type'] = 'application/json';
  if (asText(apiKey)) headers.Authorization = `Bearer ${asText(apiKey)}`;
  return headers;
}

function timedSignal(signal, timeoutMs) {
  if (typeof AbortController !== 'function') return { signal, timedOut: () => false, cleanup() {} };
  const controller = new AbortController();
  let timeoutTriggered = false;
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener?.('abort', forwardAbort, { once: true });
  const timeout = Number(timeoutMs) > 0
    ? setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, Number(timeoutMs))
    : null;
  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cleanup() {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener?.('abort', forwardAbort);
    },
  };
}

async function fetchWithDiagnostics(fetchImpl, url, options, label, timeoutMs, signal) {
  const timed = timedSignal(signal, timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: timed.signal });
  } catch (error) {
    if (timed.timedOut()) throw new Error(`${label}超时（${Math.ceil(Number(timeoutMs) / 1000)} 秒），请重试或检查接口服务。`);
    if (error?.name === 'AbortError') throw new Error(`${label}已取消。`);
    throw new Error(`${label}未能发送：${asText(error?.message ?? error) || '网络连接失败'}。请检查地址、HTTPS/CORS 与服务状态。`);
  } finally {
    timed.cleanup();
  }
}

async function readPayload(response) {
  if (typeof response?.text === 'function') {
    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch {
      const events = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^data:\s*/i, '').trim())
        .filter((line) => line && line !== '[DONE]');
      const parts = events.map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      if (parts.length) return { output_text: parts.map(extractCompletionText).join('') };
      return raw;
    }
  }
  if (typeof response?.json === 'function') return response.json();
  return null;
}

function completionPart(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(completionPart).join('');
  if (value && typeof value === 'object') return completionPart(value.text ?? value.content ?? value.value ?? '');
  return '';
}

function extractCompletionText(payload) {
  if (typeof payload === 'string') return payload;
  for (const choice of payload?.choices ?? []) {
    const value = completionPart(choice?.message?.content ?? choice?.text ?? choice?.delta?.content);
    if (value) return value;
  }
  return completionPart(payload?.output_text ?? payload?.output ?? payload?.response ?? payload?.text ?? payload?.content);
}

function errorDetail(payload) {
  return asText(payload?.error?.message ?? payload?.message ?? extractCompletionText(payload)).slice(0, 300);
}

export async function fetchAllModels({ apiUrl, apiKey = '', fetchImpl = fetch, signal, timeoutMs = 15000, maxPages = 500 } = {}) {
  let endpoint = resolveModelsEndpoint(apiUrl);
  const seen = new Set();
  let models = [];
  let pages = 0;
  while (endpoint && !seen.has(endpoint)) {
    if (pages >= maxPages) throw new Error(`模型分页超过 ${maxPages} 页，已停止以避免接口循环。`);
    seen.add(endpoint);
    pages += 1;
    const response = await fetchWithDiagnostics(fetchImpl, endpoint, {
      method: 'GET',
      headers: requestHeaders(apiKey),
    }, '模型列表请求', timeoutMs, signal);
    const payload = await readPayload(response);
    if (!response.ok) throw new Error(`模型列表请求失败（HTTP ${response.status}）${errorDetail(payload) ? `：${errorDetail(payload)}` : ''}`);
    models = modelIds([...models, ...modelIds(payload)]);
    endpoint = nextModelsEndpoint(payload, endpoint);
  }
  if (!models.length) throw new Error('接口已响应，但没有返回任何模型 ID；你仍可手动填写模型名。');
  return { models, pages };
}

export async function requestOpenAiCompatible({ apiUrl, apiKey = '', model, prompt, fetchImpl = fetch, signal, timeoutMs = 60000 } = {}) {
  const endpoint = resolveChatCompletionsEndpoint(apiUrl);
  if (!asText(model)) throw new Error('请先选择或填写 AI 模型');
  const response = await fetchWithDiagnostics(fetchImpl, endpoint, {
    method: 'POST',
    headers: requestHeaders(apiKey, true),
    body: JSON.stringify({
      model: asText(model),
      temperature: 0.7,
      stream: false,
      messages: [{ role: 'user', content: String(prompt ?? '') }],
    }),
  }, 'AI 请求', timeoutMs, signal);
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(`AI 请求失败（HTTP ${response.status}）${errorDetail(payload) ? `：${errorDetail(payload)}` : ''}`);
  const text = extractCompletionText(payload);
  if (!text) throw new Error('AI 已响应，但没有返回可用文本。');
  return parseAiResponse(text);
}

function generationMember(root = globalThis) {
  const realms = [root];
  try { if (root?.parent && root.parent !== root) realms.push(root.parent); } catch {}
  try { if (root?.top && root.top !== root && !realms.includes(root.top)) realms.push(root.top); } catch {}
  for (const realm of realms) {
    try {
      if (typeof realm?.generateRaw === 'function') return { fn: realm.generateRaw, owner: realm };
      if (typeof realm?.TavernHelper?.generateRaw === 'function') return { fn: realm.TavernHelper.generateRaw, owner: realm.TavernHelper };
    } catch {}
  }
  return null;
}

export async function requestTavernHelper({ root = globalThis, prompt, timeoutMs = 60000 } = {}) {
  const member = generationMember(root);
  if (!member) throw new Error('当前消息 iframe 未发现 Tavern Helper 的 generateRaw；请确认酒馆助手已启用，或切换到独立 API / 离线灵感。');
  let timeout;
  try {
    const result = await Promise.race([
      member.fn.call(member.owner, {
        should_silence: true,
        max_chat_history: 0,
        ordered_prompts: [{ role: 'user', content: String(prompt ?? '') }],
      }),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`酒馆当前模型请求超时（${Math.ceil(Number(timeoutMs) / 1000)} 秒），请重试。`)), timeoutMs);
      }),
    ]);
    if (!asText(result)) throw new Error('酒馆当前模型已结束生成，但没有返回文本。');
    return parseAiResponse(result);
  } catch (error) {
    if (/超时|没有返回|JSON|未发现/.test(asText(error?.message))) throw error;
    throw new Error(`酒馆当前模型请求失败：${asText(error?.message ?? error) || '未知错误'}`);
  } finally {
    clearTimeout(timeout);
  }
}
