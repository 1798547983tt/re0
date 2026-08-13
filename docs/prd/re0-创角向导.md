# Re:0 游戏式创角向导 PRD

## Problem Statement

用户需要一个《Re：从零开始的异世界生活》的游戏式创角向导，把现有的 ZOD 状态协议、酒馆正则参考实现、剧情总结和角色图片整合成一个精美、可翻页、可审阅、可导出的前端。目前资料已经存在，但创建角色所需的身份、剧情锚点、性格、能力、关系和开局文本分散在脚本与手工输入中，用户无法清楚地知道每个字段最终会如何进入主角档案，也无法在选定卷数后可靠地选择对应事件及事件时间。

## Solution

交付一个以 **C · 魔女茶会** 为视觉基线的五页创角向导。页面采用清晰可见的 Re:0 图片背景、半透明玻璃面板、紫色/粉色魔女茶会氛围、翻页式步骤转场和桌面/移动端响应式布局。

创角向导使用一个统一草稿模型收集输入，不在用户确认前写入正式状态变量。用户可以选择原作人物或原创角色，选择第01–39卷及其完整事件列表；选择卷后显示卷标题、事件标题、事件时间，并保留规范日期、时段、时间层以及“编辑演算/历史估算”等资料性质。

AI 采用双模式：无需联网即可使用的灵感/模板模式，以及用户自行配置的 OpenAI-compatible API 模式。完成后生成对齐 ZOD 状态协议的结构化 JSON、可读的真实玩家开局发言，并支持复制、下载、写入酒馆输入框和在可验证时尝试自动发送。

## User Stories

1. As a 创作者, I want to open a five-page creator flow, so that I can build a character without facing a single overwhelming form.
2. As a 创作者, I want the selected C · 魔女茶会 visual language to remain consistent across every page, so that the flow feels like one game rather than unrelated screens.
3. As a 创作者, I want the background art to remain visible and sharp behind readable panels, so that the Re:0 atmosphere is present without sacrificing usability.
4. As a mobile user, I want the same flow to work on narrow screens and respect safe-area padding, so that I can create a character inside a mobile SillyTavern view.
5. As a keyboard user, I want to move between pages and controls with keyboard focus, so that I do not have to rely on a pointer.
6. As a 创作者, I want to enter a name, gender/identity, age stage, race, appearance and clothing, so that the 主角档案 has a coherent visible identity.
7. As a 创作者, I want to choose 原作人物, 原创角色 or 异界来客 as the role type, so that the opening rules can distinguish canon and original inputs.
8. As a 创作者, I want to specify faction, occupation, origin and current goal, so that the character has a concrete place in the world.
9. As a 创作者, I want to select a volume from 第01卷 through 第39卷, so that I can choose where the character enters the timeline.
10. As a 创作者, I want each volume option to show its 卷级标题, so that I can identify the intended story segment before selecting an event.
11. As a 创作者, I want the event selector to list every recognized event node in the selected volume, so that I can choose a precise 剧情锚点 rather than a vague chapter label.
12. As a 创作者, I want the selected event to show its event title and 事件时间, so that I can see the date, period, time layer and editorial/history status before continuing.
13. As a 创作者, I want the UI to preserve “编辑演算” and “历史估算” markers, so that project-calculated dates are not presented as official absolute dates.
14. As a 创作者, I want to write a wish, fear, motivation, secret and boundary, so that the character has playable dramatic tension.
15. As a 创作者, I want to define personality traits, habits, values, taboos and speech style, so that the opening text can establish a recognizable voice.
16. As a 创作者, I want to add abilities with availability, cost/cooldown, description and limits, so that the character is powerful but not undefined.
17. As a 创作者, I want to define relationships and initial trust/affinity, so that the generated setup can seed the 关系 section of the state protocol.
18. As a 创作者, I want to add initial items, equipment and currency, so that the generated setup can seed the 资产 section without inventing unrequested possessions.
19. As a 创作者, I want to see a progress indicator and completion checklist, so that I know which required fields remain before submission.
20. As a 创作者, I want AI to suggest missing fields one page at a time, so that I can accept, edit or reject suggestions without losing control of the draft.
21. As a 创作者, I want AI to generate a complete inspiration pass, so that an empty draft can become a coherent first version quickly.
22. As a 创作者, I want an offline inspiration/template mode, so that the creator remains useful without an API key or network access.
23. As a 创作者, I want to configure an OpenAI-compatible endpoint, model and key locally, so that I can use my own provider without credentials being embedded in the project.
24. As a 创作者, I want AI suggestions to be marked as suggestions and never silently overwrite my fields, so that manual decisions remain authoritative.
25. As a 创作者, I want the AI result to be validated against the draft schema before it is applied, so that malformed model output cannot corrupt the setup.
26. As a 创作者, I want to review the complete character summary before submission, so that I can catch contradictions between identity, abilities, relationships and story anchor.
27. As a 创作者, I want to edit the generated opening message, so that the first real player message sounds like my intended character rather than a generic template.
28. As a 创作者, I want to export a structured JSON object aligned to the ZOD state protocol, so that the result can be inspected, backed up and reused.
29. As a 创作者, I want to export a readable opening text, so that I can understand exactly what will be sent into the conversation.
30. As a 创作者, I want to copy both JSON and opening text, so that I can use the result in environments that do not support direct integration.
31. As a 创作者, I want to download the draft, so that I can keep an offline backup.
32. As a 创作者, I want to import a compatible draft, so that I can resume or revise an earlier character without retyping everything.
33. As a 创作者, I want draft autosave and a recoverable snapshot, so that an accidental refresh does not erase a long creation session.
34. As a SillyTavern user, I want the creator to write the opening text into the detected input box, so that I can confirm it before sending.
35. As a SillyTavern user, I want automatic send to be attempted only when the host context and composer state can be verified, so that a failed send never gets falsely marked as a completed start.
36. As a SillyTavern user, I want a clear status when the host adapter is unavailable, so that I can fall back to copy/paste without guessing what happened.
37. As a maintainer, I want the volume/event index to derive from the existing 剧情总结, so that chronology is not duplicated in the frontend.
38. As a maintainer, I want the creator output to map through one submission adapter, so that independent preview and SillyTavern integration do not develop different truth models.
39. As a maintainer, I want assets to be hosted from a versioned GitHub commit or release reference, so that CDN caching cannot silently change the art used by a released creator.
40. As a maintainer, I want unsafe HTML, model output and user text to be rendered as text or sanitized content, so that the creator does not introduce an avoidable XSS path.
41. As a maintainer, I want the creator to keep the boundary between DraftState, UiState, PersistentSetup and OpeningMessage, so that cancelling a draft cannot partially initialize the formal game state.
42. As a maintainer, I want the first release to be testable as an independent local page, so that visual and interaction acceptance does not depend on a live SillyTavern instance.
43. As a maintainer, I want the real-runtime adapter to remain explicit and replaceable, so that later SillyTavern verification can happen without rewriting the creator UI.

## Implementation Decisions

- The production visual baseline is **C · 魔女茶会**. The prototype established the direction: purple glass panels, visible character art, rounded game-like controls, high-contrast labels and a floating step/navigation layer.
- The flow has five pages: identity/type; appearance/origin/faction; personality/wish/boundaries; abilities/relationships/assets; review/export/start.
- The highest seam is one creator submission boundary: a validated `CreatorDraft` is transformed once into `PersistentSetup` plus `OpeningMessage`, then handed to either the independent preview/export surface or the SillyTavern adapter. UI components do not write formal state directly.
- Draft state is separate from UI state and from formal runtime state. The draft may be edited, restored and discarded; formal state is created only after explicit confirmation.
- The story selector is a read model derived from the repository’s `剧情总结` event index. It includes all recognized events for all 39 volumes, and exposes the project’s existing event-time semantics without reinterpreting dates.
- The story anchor stores volume, volume title, event ID/title and event time metadata. It is a 剧情锚点, not a 死亡回归存档点 and not a new official timeline.
- The output contract maps the creator draft into the existing ZOD-aligned concepts: 主角档案, 世界, 关系, 事件, 线索, 资产 and 规则. Unknown or optional fields use the established fallback/validation behavior instead of inventing a second schema.
- AI is behind a provider interface with two implementations: deterministic offline inspiration/templates and user-configured OpenAI-compatible generation. No project credential is committed, and model output must pass schema validation before application.
- The AI UI supports page-level suggestions, whole-draft inspiration and editable prompts/ideas. It never silently overwrites non-empty user fields.
- The first production pass supports copy, download, import, autosave/recovery and a readable review. These are local draft operations and do not imply a full independent game runtime.
- The SillyTavern adapter is an optional host port. It can detect a composer, write the opening text, and attempt a send only when the message can be observed as a real user message. If verification is impossible, it must preserve the text and report a non-success state.
- Images are derived from the supplied originals through reversible crop/tone/focus treatment. After the visual direction is promoted, release assets are uploaded to the repository and referenced through a commit- or release-pinned GitHub/CDN URL, not an unpinned moving branch.
- Rendering uses safe text paths and sanitization for any rich content. Model output is never executed as HTML or JavaScript, and no arbitrary `eval`/script injection path is part of the creator contract.
- The page transition is CSS/DOM based and keeps the active page readable during motion. Reduced-motion and low-performance settings are supported.
- The prototype is the design source for the chosen C direction, but it is not promoted as production code without a rewrite around the validated draft/submission seam.

## Testing Decisions

- Tests assert observable behavior at the highest seam: user input produces a validated draft, a deterministic output contract and the correct adapter call. They should not assert private DOM class names or implementation-specific helper functions.
- The story-index test verifies 39 volumes, every recognized event, volume title preservation, event title preservation and exact event-time metadata including layer and editorial/history markers.
- The draft-validation test verifies required identity/story-anchor fields, enum/fallback behavior, numeric range clamping and rejection of malformed AI patches.
- The serializer test verifies that the same draft produces stable structured JSON and readable opening text, and that optional sections do not create contradictory duplicate fields.
- The offline AI test verifies deterministic suggestions, non-destructive application and page-level versus whole-draft behavior without network access.
- The provider-adapter test verifies request normalization, missing-key handling, timeout/error normalization and schema validation before applying a response. No real credential is used in automated tests.
- The submission-adapter test verifies write-to-composer, refusal to overwrite non-empty user text, observed-message confirmation, unverifiable-host fallback and preservation of the opening text after a failed send.
- Browser acceptance covers the five-page navigation, back/next behavior, keyboard focus, responsive layout, visible background art, AI suggestion controls, review/export actions and the volume→event→event-time cascade.
- Security acceptance checks that user text and model text render as text or sanitized content, unsafe attributes are not executed, and GitHub asset URLs are fixed to the release reference.
- Existing repository Python validation tests remain prior art for data-quality checks; new creator tests should follow the same evidence-first style and keep story-source failures distinct from UI failures.

## Out of Scope

- A full independent Re:0 gameplay engine, combat resolver, map system or long-term message tree.
- Replacing or redesigning the existing ZOD schema, MVU rules, worldbook content or character TXT organization.
- Live production acceptance inside a real SillyTavern instance during the first implementation pass; the adapter remains ready for a later runtime-debug pass.
- Server-side storage of API keys, automatic account provisioning, proxying user credentials or shipping a project-owned model endpoint.
- Automatic GitHub commits/uploads initiated from the creator UI.
- Generating or repainting new character art beyond reversible web derivatives of the supplied images.
- Treating project-calculated dates as official canon dates or merging historical/trial events into mainline world time.
- Supporting arbitrary character-card imports as a primary product surface.

## Further Notes

- The selected prototype lives on branch `codex/prototype-re0-style-previews`; its visual verdict is C · 魔女茶会.
- The repository glossary now defines 创角向导, 剧情锚点 and 事件时间, and ADR 0004 records why the story index is sourced from `剧情总结`.
- The prototype was freshly verified for JavaScript parsing, 39-volume/full-event data, desktop interactions, keyboard variant switching and mobile no-overflow behavior.
- Production asset hosting should use the final release commit or tag so CDN caching is deterministic; do not reference `main` for a released card.
