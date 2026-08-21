# Re:0 · 星屑碎片状态栏发布记录

## GitHub

- 分支：[codex/re0-shard-statusbar](https://github.com/1798547983tt/re0/tree/codex/re0-shard-statusbar)
- 组件与脚本提交：`e567df0d6c9b141b3ddb0aaeb014f0f180464a0a`
- 发布记录随后追加在同一分支；报告提交不会改变脚本字节。
- 导入脚本：[script-Re0·星屑碎片状态栏.json](https://raw.githubusercontent.com/1798547983tt/re0/e567df0d6c9b141b3ddb0aaeb014f0f180464a0a/dist/script-Re0%C2%B7%E6%98%9F%E5%B1%91%E7%A2%8E%E7%89%87%E7%8A%B6%E6%80%81%E6%A0%8F.json)
- 脚本大小：158400 bytes
- SHA-256：`362c3033bf25a3da44da07e9a4afa7bd16621f088577fd15d7d4ec406ae61b3b`

## 素材引用

- 新生成素材固定提交：`ccbd9a2a9dd44b7ccae01935686258e97b5b7456`
- 夜间背景：[orb-night.png](https://raw.githubusercontent.com/1798547983tt/re0/ccbd9a2a9dd44b7ccae01935686258e97b5b7456/shard-statusbar/assets/orb-night.png)
- 日间背景：[orb-day.png](https://raw.githubusercontent.com/1798547983tt/re0/ccbd9a2a9dd44b7ccae01935686258e97b5b7456/shard-statusbar/assets/orb-day.png)
- 悬浮球徽记：[orb-sigil-transparent.png](https://raw.githubusercontent.com/1798547983tt/re0/ccbd9a2a9dd44b7ccae01935686258e97b5b7456/shard-statusbar/assets/orb-sigil-transparent.png)
- NPC 头像仍走正文注册表和既有头像提交 `def1712b14100d7294549fa6b30cdf62d0910582`，例如 [rem.webp](https://raw.githubusercontent.com/1798547983tt/re0/def1712b14100d7294549fa6b30cdf62d0910582/narrative/assets/avatars/rem.webp)。

## 验证证据

- Node 全量：154/154 通过。
- Python 全量：7/7 通过。
- 浏览器离线预览：宽屏浮窗、390px 窄屏抽屉、八个碎片点击、NPC 头像芯片、日夜切换、Escape 关闭、焦点返回、最终脚本 JSON 启动均已观察。
- 未完成的门：真实 SillyTavern 安装组合、Tavern Helper/MVU 版本差异、真实触控设备的 pointer capture、远程资源失败后的宿主表现，仍需按 `shard-statusbar/RUNTIME.md` 在目标酒馆验收。
