# Re:0 · 星屑碎片状态栏

这是一个独立于现有消息内正则状态栏的 Tavern Helper 脚本组件。导入 `dist/script-Re0·星屑碎片状态栏.json` 后，脚本会在 SillyTavern 宿主层创建一个悬浮球；点击悬浮球打开桌面浮窗，窄屏自动变为底部抽屉。

## 交互

- 悬浮球可自由拖动，不自动吸边；拖动超过阈值后显示晶体放大、环形脉冲和拖拽反馈，短点击才打开/关闭面板。
- 面板顶部保留主角、世界脉搏和六个状态仪表；关系人物头像芯片、八个状态碎片和详情面板均可点击/键盘操作。
- 碎片只显示摘要，点击后在详情层渐进查看动态记录、折叠字段和诊断未知字段，不把 172 个字段一次性平铺。
- NPC 头像复用 `narrative/data/character-registry.json` 的别名归一化与 `portraitKey` 逻辑，按需请求同仓库 `narrative/assets/avatars/`；未知姓名回退首字。
- 主角头像可上传本地图片或填写 HTTPS URL。图片在浏览器本地裁切并存入 IndexedDB，可跨聊天共享；不会写入 `stat_data` 或上传 GitHub。

## 数据边界

脚本只读取当前消息楼层的 `stat_data`：优先 `getVariables({ type: 'message', message_id: 'latest' })`，再退回 `Mvu.getMvuData`。它不包含任何变量写入接口；读取失败时保留上次成功状态并显示旧数据提示。

## 本地预览

```powershell
python -m http.server 4178 --directory .
```

打开 `http://127.0.0.1:4178/shard-statusbar/preview/index.html?assets=local`。`preview/bundle.html` 会直接执行最终脚本 JSON，用于验证打包产物而不是开发模块。

## 素材与发布

`assets/` 中的日/夜背景与悬浮球徽记由本项目重新生成；NPC 头像沿用正文正则的已生成资源。生产 URL 必须锁定到不可变 Git commit，`manifest.json` 的 `releaseRevision` 与脚本包会在发布前同步更新。网络素材失败时，面板仍保留渐变背景和文字状态。
