# Re:Zero 状态栏运行时契约

状态栏只读取当前消息楼层的 `stat_data`。它优先调用 Tavern Helper 的 `getVariables({ type: 'message', message_id })`，再退回 MVU 的 `Mvu.getMvuData(...)`；代码不暴露或调用任何变量写入接口。

## 已核对的基线

| 依赖 | 核对版本/提交 | 本组件依赖的能力 | 置信度 |
| --- | --- | --- | --- |
| SillyTavern | [`1.18.0` / `51ad27fb86d39a3daca3adaa970375c9670c12df`](https://github.com/SillyTavern/SillyTavern/tree/51ad27fb86d39a3daca3adaa970375c9670c12df) | Regex 扩展的 AI 输出位置 `2`、JavaScript replacement、`markdownOnly` 显示路径 | 源码核对 |
| Tavern Helper / JS-Slash-Runner | [`4.8.19` / `0e965f2f6be878031dbbfd0c2171fa49de10ecca`](https://github.com/N0VI028/JS-Slash-Runner/tree/0e965f2f6be878031dbbfd0c2171fa49de10ecca) | `getVariables`、`getCurrentMessageId`、`eventOn`、版本探测、`waitGlobalInitialized` | 类型声明与源码核对 |
| MVU Offline | [`v1.0.1` / `d0c83820dcfa93793e8c5a549f42bb167ef591ab`](https://github.com/NLKASHEI/MVU-offline/tree/d0c83820dcfa93793e8c5a549f42bb167ef591ab) | 角色卡已嵌入的 MVU loader | 仓库标签与本卡脚本核对 |
| MVU 导出契约 | JS-Slash-Runner 4.8.19 的 [`exported.mvu.d.ts`](https://github.com/N0VI028/JS-Slash-Runner/blob/0e965f2f6be878031dbbfd0c2171fa49de10ecca/%40types/iframe/exported.mvu.d.ts) | `Mvu.getMvuData`、`Mvu.events.VARIABLE_INITIALIZED`、`Mvu.events.VARIABLE_UPDATE_ENDED` | 类型声明核对 |

角色卡当前兼容边界保持不变：

- `变量/脚本/酒馆助手脚本-MVU.json` 继续加载 `https://testingcf.jsdelivr.net/gh/NLKASHEI/MVU-offline@v1.0.1/mvu_bundle_full.js`。
- `变量/脚本/酒馆助手脚本-ZOD.json` 继续加载 `https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js` 并注册 Schema。该 URL 没有提交固定；2026-08-14 核对 `main` 为 `d53a2670a59291c2afc6248e966275b846d549b6`，这只是调查快照，不是组件能够保证的运行版本。
- `变量/世界书/变量列表.txt` 的 `{{format_message_variable::stat_data}}` 注入格式不改动。

## 降级行为

- 读取成功：渲染当前消息楼层状态，并记录只读来源。
- 更新时暂时读取失败：保留最后一次成功状态并显示“旧数据”标记。
- 两个读取 API 都不可用：显示可重试的不可用状态，不猜测宿主私有 DOM 或变量存储。
- 事件 API 不可用：保留手动重试；不创建轮询写入，也不监听未声明的事件字符串。

## 仍需在真实酒馆验证

离线测试不能证明具体安装环境的扩展组合。发布验收仍需使用最终正则包核对：初始化事件、一次变量更新、消息编辑、swipe、重新渲染、刷新页面、切换聊天、多消息实例去重、缺失 MVU、网络资源失败以及控制台无异常。完成这些证据前，不把状态栏标记为“真实 SillyTavern 已验收”。

## 当前发布候选

- 源码基线：`fea9191bd0fe5ec2a540b347d9adf46cea2435d9`
- 导入文件：`dist/regex-Re0·全变量状态栏.json`
- 大小：129150 bytes
- SHA-256：`7cb9f7356a18ede5337e01bf0211305266a81e551b705a36e047bd29d206d234`
- 图像固定提交：`75d39874e8b6246a0d5f9bd45779441cdaf743cf`
- 真实运行时清单：`reports/statusbar-runtime-handoff.md`

当前结论是“离线验收通过、真实宿主待验收”。任何会改变导入文件字节的后续修改都会使上述哈希失效，必须重打包并重新取证。
