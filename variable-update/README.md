# Re:Zero 变量更新回执

变量更新回执由两条配套的 SillyTavern AI 输出显示正则组成：未闭合 `<UpdateVariable>` 显示“命运演算中”，完整块显示“世界线记录已闭合”。两条 `findRegex` 来自用户提供的参考文件并由测试锁定；界面实现限定为纯 HTML/CSS，文案和素材均为本项目原创实现。

## 两条配套规则

- pending 规则只匹配正在生成、尚未闭合的 `<UpdateVariable>`，以只读的生成中回执替换当前可见输出。
- complete 规则只匹配闭合的 `<UpdateVariable>`，把 `$1` 作为更新依据、`$2` 作为原始 JSON Patch 放进只读回执。

两条规则都只负责消息内显示，不验证、执行或改写补丁；它们不替代现有状态栏。pending 不携带模型文本，complete 只显示捕获内容，不把“已生成”写成“已执行”。

## 源文件职责

- `pending.html`：生成中状态的语义 HTML 片段，不插入模型文本。
- `complete.html`：完整回执的语义 HTML 片段；`$1` 仅承载更新依据，`$2` 仅承载原始 JSON Patch。
- `styles.css`：两态共享的、命名空间化的纯 CSS 样式；生产依赖只有固定提交的 HTTPS WebP。
- `assets/manifest.json`：记录本地素材路径、媒体类型、尺寸、内容哈希、原创说明及固定发布 URL。
- `preview.html` / `preview.mjs`：开发期静态预览，加载维护中的片段并模拟两种状态；不进入打包产物。
- `tools/package_variable_update_regex.mjs`：唯一产物生成入口，读取源片段、样式和素材清单，生成两份 SillyTavern 正则 JSON。

## 打包与来源适配器

以下命令的工作目录（cwd）必须是仓库根目录。

- `package-json`：`node tools/package_variable_update_regex.mjs`
- `package-json --check`：`node tools/package_variable_update_regex.mjs --check`
- `validate-source`：`node --test tests/test_variable_update_*.mjs`

`package-json` 的输入源是 `variable-update/pending.html`、`variable-update/complete.html`、`variable-update/styles.css` 与 `variable-update/assets/manifest.json`，以及 packager 源码所定义的固定配置。普通模式只创建或替换以下两个输出文件，不触碰其他 `dist/` 文件：

- `dist/regex-Re0·变量更新中.json`
- `dist/regex-Re0·完整变量更新.json`

普通模式按文件逐个写入；如果第二个文件写入失败，可能留下第一个已更新文件。重新运行命令会从源码恢复两个输出。`--check` 是只读字节比对：不写文件，两个文件均与当前源码生成的字节完全一致时 exit 0，否则返回失败状态。`validate-source` 的来源是现有 packager 源码与其 `tests/test_variable_update_*.mjs` 测试。

## 依赖分类与验收边界

- 宿主依赖：SillyTavern 正则扩展提供 AI 输出显示替换。
- 唯一远程生产素材：固定 Git 提交的原创命运徽记 WebP，使用 HTTPS URL；网络或素材加载失败时必须保留纯 CSS 徽记后备。
- 开发期依赖：Node.js、静态服务器和浏览器，用于打包、离线检查、预览与视觉检查。
- 明确不依赖：远程脚本、远程字体、MVU API、变量写权限；回执不会执行状态更新。

离线检查不替代真实 SillyTavern 导入、流式生成切换、主题覆盖和 WebView 兼容验收；这些仍需在目标宿主中单独验证。
