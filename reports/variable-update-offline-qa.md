# Re:Zero 变量更新回执：离线 QA 回执

日期：2026-08-20
候选源码 HEAD（本报告提交在其后）：`65720d468ce7f23766272dc9026becafc20987e1`

## 范围与运行时边界

本次检查的表面是消息内、只读的双阶段变量更新回执：未闭合 `<UpdateVariable>` 显示 pending 回执，闭合块显示依据与原始 JSON Patch 的 complete 回执。它只改变显示，不验证、执行或改写补丁。

- 生产内容仅为 HTML/CSS；SillyTavern Regex 扩展由宿主提供。
- 唯一远程生产依赖是固定提交的 WebP。没有远程脚本、远程字体、MVU API 或变量写权限。
- Node、静态服务器与浏览器均为开发期检查工具，未进入生产正则产物。
- [`statusbar/RUNTIME.md`](../statusbar/RUNTIME.md) 所记的 SillyTavern `1.18.0` / commit `51ad27fb86d39a3daca3adaa970375c9670c12df` 仅为源码检查过的 API 基线；本次没有真实 SillyTavern runtime acceptance，因此不得标为已验收。

## 自动验证（2026-08-20，fresh run）

| 命令 | 结果 |
| --- | --- |
| `node --check variable-update/preview.mjs` | exit 0 |
| `node --check tools/package_variable_update_regex.mjs` | exit 0 |
| `node --check tests/test_variable_update_package.mjs` | exit 0 |
| `node --test tests/test_variable_update_assets.mjs tests/test_variable_update_package.mjs tests/test_variable_update_surface.mjs` | `31/31` passed，0 fail |
| `node tools/package_variable_update_regex.mjs --check` | 两份产物均为 current |
| `git diff --check` | exit 0、无输出 |

测试覆盖 surface/package/asset 合计 31 项；其中 matcher 的固定长度为 pending `56`、complete `208`，SHA-256 分别为 `1b598efa5914e3ad62eba4b08c78cc9a664ecd27250eb17de46a549b3af31729` 与 `54b5c28cd55eab43892a6173ce5cfe26b425ea3a5c3fa03d77e0f1a570c678d7`。`--check` 同时证明产物为当前源码生成；随后以 Node `JSON.parse` 读取两份 JSON，均成功。受测维护文本为 LF（CSS 亦以字节检查无 CR）。

## 浏览器与交互证据

使用 Codex In-app Browser；其 Chromium 版本未向本次检查暴露。通过本地 `preview.html?state=both` 访问，预览确实复用维护中的片段和样式。

- 默认时两个 outer `<details>` 及 complete 内嵌 `<details>` 均为 closed。
- 已以 pointer 展开 pending、complete 与 nested details。DOM 实测：`2` 个 root、`1` 个 patch summary、`1` 个 patch source、`2` 个 `<pre>`；没有重复 patch。单态 pending 只 fetch/render `1` 个 root。
- `summary` 可成为 active element；其 computed focus outline 为 `rgb(185, 190, 193) solid 2px`，outline offset 为 `4px`。
- In-app Browser automation 的 Enter/Space 没有触发 native summary 开合。因此真实键盘激活仍是 pending，不能写作通过。
- 正常预览 console 为 `0` errors、`0` warnings。

## 宽屏与窄屏布局

宽屏交互测量 viewport 为 `1440×1000`；当次视觉记录还包含 `1440×1800` 的截图设置。document `clientWidth/scrollWidth` 均为 `1440`，无页面横向溢出；root 宽 `768px` 且居中。`pre` 使用 `overflow: auto` 与 `pre-wrap`；本地正常素材可见。

窄屏交互测量为 `360×900`，视觉记录包含 `360×1900` 的截图设置：document `clientWidth/scrollWidth` 都是 `345`（滚动条占用宽度），roots 约 `313px`。在 `320×640` 时 document `clientWidth/scrollWidth` 都是 `305`，roots 约 `273px`；summary 为两列（`57.6px + minmax`），domain rail 保持四列。`pre` 为 `overflow: auto`，无页面横向溢出。

长 CJK/JSON 证据：`360px` 时 `pre clientWidth/scrollWidth = 271/255`，`320px` 时为 `231/215`；均保持 `overflow: auto` 与 `pre-wrap`，patch 允许纵向滚动而没有带来页面横向滚动。

浏览器原始截图先以 JPEG 返回；随后以 Pillow `save(format='PNG', optimize=True)` 无缩放、无裁切转为真实 PNG。转码保持解码后的 RGB 画面与尺寸不变；以下均为最终文件的 Pillow 解码与 8-byte magic 验证。

| 文件 | 用途 | 解码尺寸与格式 | PNG magic | bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| [variable-update-wide.png](variable-update-wide.png) | 宽屏：两态、完整回执依据 | `1440×1007`, PNG/RGB | `89504e470d0a1a0a` | 530105 | `cd6942d2863e28ead4cad39e0dec18dc1ff5ae20a0dc214354b1485581fd3ec2` |
| [variable-update-narrow.png](variable-update-narrow.png) | 窄屏：两态头部、重排与依据顶部 | `360×997`, PNG/RGB | `89504e470d0a1a0a` | 329824 | `ad2383dee4dbb68fcf529b2258e573912dc2bd97ae18ef539cc001b4531622d2` |

最终截图均采用 single-viewport capture，以避开 In-app Browser fullPage compositor 对 transformed details layer 的拼接重复；宽图展示两态和依据，窄图展示两态头部/重排及依据顶部。DOM 计数已证明没有重复 patch：这是捕获工具行为，不是产物重复。

## 素材与降级

- 正常预览使用本地 override，背景素材已加载。
- 在 CDP 中阻断 `*fate-ledger-seal.webp*` 并禁用 cache 后，CSS ring/hand 仍可见：ring border `rgb(143, 214, 232)`、opacity `0.66`，art `64.6px`；没有空白 sigil。
- 生产 URL 是唯一固定远程资源：<https://cdn.jsdelivr.net/gh/1798547983tt/re0@f7bf19afb8a09240cd5da9f51cd91df570d486bc/variable-update/assets/fate-ledger-seal.webp>。
- 对该 URL 的只读终端 HEAD 在 2026-08-20 返回 HTTP `200`、`Content-Type: image/webp`、`Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`、`Content-Length: 1171138`、ETag `W/"11dec2-liUFERsy2UGgXdlxT6Z65PKJsl4"`。
- 因 preview local override，生产远程背景没有在浏览器中执行；真实宿主中的远程素材验收仍为 pending。

素材 identity commit 为 `f7bf19afb8a09240cd5da9f51cd91df570d486bc`，WebP SHA-256 为 `4db0a415e558f4af4c466f8777d97a6d5481970a00701ffaba3fa0c8dc626962`，大小 `1171138` bytes。

## 可访问性、运动与性能观察

CDP emulate `prefers-reduced-motion: reduce` 后 media query 匹配为 true；art/ring/hand/trace/body 的 `animationName` 均为 `none`，`transitionDuration` 为 `0s`。结构性的 clock-hand `transform` 仍保留为装饰性静态位置，信息不变；恢复 `no-preference` 后 orbit animation 重新 active。

本次没有证据显示性能失败。观察到 CSS 为 `20491` bytes，且每个回执命中会重复携带；WebP 为 `1171138` bytes，但只有一个 immutable URL 和一年缓存。这是首次加载成本与重复 CSS 的非阻断风险，未据此做推测性 minification。root-level worldline dead-style 与 CSS 大小仍是 code-review minor，未声称已修复。

## 产物与状态

| 项目 | bytes | SHA-256 | 状态 |
| --- | ---: | --- | --- |
| `dist/regex-Re0·变量更新中.json` | 24898 | `231b27b7861a4b5f01a7b8da9cc156c5330a0c0de0468ad710c9bde9b3b37bfb` | JSON parsed、current |
| `dist/regex-Re0·完整变量更新.json` | 25866 | `6fcdf2dcf07cec9b45717b52b0753d3a5d0e870bcbfe47efcca918f0459d9847` | JSON parsed、current |
| `variable-update/styles.css` | 20491 | `2d00c61f34eab21df27b54abfcd9307dc6299859f2cb8eca37b13dafec3c8e79` | LF |
| `variable-update/assets/fate-ledger-seal.webp` | 1171138 | `4db0a415e558f4af4c466f8777d97a6d5481970a00701ffaba3fa0c8dc626962` | fixed production asset |

| QA 项目 | 状态 | 结论 |
| --- | --- | --- |
| 离线候选：pointer/render/layout/fallback/reduced motion/static checks | Pass | 31 项自动检查、布局、指针开合、降级与运动检查均有证据。 |
| 键盘与生产远程素材的浏览器验收 | Partial | focus 样式已测；Browser automation 无法触发 native Enter/Space，且 preview 未执行生产远程 URL。 |
| 真实 SillyTavern acceptance | Pending | 需真实导入、流式 pending→complete 转换、目标主题/CSP、真实键盘激活、宿主远程素材、swipe/edit/rerender/message lifecycle，以及 WebView/mobile physical device 检查。 |
