# RE0 战斗与正文渲染

本目录维护《Re：从零开始的异世界生活》正文协议、强制掷骰战斗规则、三主题消息渲染器与视觉资产。它是源组件和可导入正则，不是完整 V2/V3 角色卡、世界书或 PNG 卡片。

## 交付入口

- `rules/战斗规则.md`：一次性 12d20、七级战力、DC、防御、伤害、濒死与死亡回归边界。
- `rules/正文输出格式.md`：严格的 `<content>` 正文协议；可见标题固定为 `第XX卷 | 标题`，日期固定为 `魔女历YYYY年MM月DD日`。
- `rules/状态字段映射.md`：长期八根状态与 `事件.当前战斗` 短期状态的写回边界。
- `data/volume-headings.json`：正传第 01–39 卷的首章标题。
- `data/character-registry.json`：44 个专属头像人物的稳定 ID、显示名、安全别名与气泡令牌。
- `index.html`：不依赖 SillyTavern 的本地预览。
- `../dist/regex-Re0·正文美化.json`：可导入的正文美化正则产物。

## 本地预览

在仓库根目录运行：

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/narrative/index.html`。主题工具栏提供自动、日间、夜间和米色；自动模式只在日间/夜间之间选择，米色只允许手动启用。

## 构建与校验

```powershell
node tools/package_narrative_regex.mjs --refresh-manifest
node tools/package_narrative_regex.mjs
node tools/package_narrative_regex.mjs --check
node tools/package_narrative_regex.mjs --audit-assets --strict
node --test tests/*.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
```

`--check` 只比较内存生成结果，不写文件。资产二进制发生变化后，先刷新清单再重新打包。

## 资产与降级

本地预览从 `assets/` 读取 1 张透明 Logo、3 张标题底板、3 张背景和 44 张 512×512 WebP 头像。未知人物始终使用姓名的第一个 Unicode 字素作为通用头像；专属图片、背景或 Logo 加载失败时，界面降级为首字头像和纯 CSS 样式，正文不会消失。

正则产物嵌入代码与资产清单，但不内嵌约 9.65 MB 的图片。当前 `releaseUrl` 留空，因此本地预览能显示图片，单独导入 SillyTavern 时会在图片路径不可用的环境中安全降级。正式使用远程图片前，必须获得单独发布授权，将同一批哈希锁定的文件放到固定版本 HTTPS 地址，填写非空 `releaseRevision`，并让 URL 明确包含该版本，再同步更新清单与打包测试；解析器不会采用浮动 `main` 地址。

这些图像按个人、非商业同人用途制作，并参考了用户提供的素材。公开或商业发布前需要另行完成 Logo、动画截图与衍生视觉素材的权属审查。

## 集成边界

- 模型必须按 `rules/正文输出格式.md` 输出；正则只负责解析和呈现，不从自由叙述猜说话者。
- 骰池由调用方在每次生成前提供，规则模块不自行伪随机生成；骰池与完整骰点历史不写入持久状态。
- `<UpdateVariable>` 只能位于完整 `</content>` 之后，正则原样保留它，不负责执行变量写入。
- 正文正则用捕获组把真实 `<content>` 放入隐藏载体；载体是替换串中唯一的 `$1` 令牌。渲染器会在 iframe 高度测量前立即启动，并在内容换入后主动更新高度。源码或产物更新后必须在 SillyTavern 中重新导入正则副本。
- 真实 SillyTavern、Tavern Helper、MVU 与 ZOD 的端到端验收仍按 `../reports/narrative-runtime-handoff.md` 执行。
