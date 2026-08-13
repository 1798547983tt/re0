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

function normalizeEndpoint(apiUrl) {
  const base = asText(apiUrl).replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 AI API 地址');
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
}

export async function requestOpenAiCompatible({ apiUrl, apiKey, model, prompt, fetchImpl = fetch, signal } = {}) {
  const endpoint = normalizeEndpoint(apiUrl);
  if (!asText(apiKey)) throw new Error('请先填写 AI API Key');
  if (!asText(model)) throw new Error('请先填写 AI 模型');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI 请求失败（${response.status}）：${detail.slice(0, 240)}`);
  }
  const payload = await response.json();
  return parseAiResponse(payload);
}
