# Re:0 · 星屑碎片状态栏（参考图复刻版）

这是按用户提供的全屏参考图复刻的 Tavern Helper 脚本组件。打开悬浮球后进入固定 16:9 碎片舞台：左侧导航、顶部人物轨道、中央六个不规则碎片、右上角入口和左下角 UID 都保持同一空间层级；点击碎片后保留舞台，在右侧滑入详情栏。

## 交互

- 悬浮球可自由拖动，不自动吸边；拖动超过阈值才进入拖拽态，短点击打开/关闭全屏舞台。
- 左侧六个 Re:0 领域切换六槽位数据；顶部人物轨道切换当前人物；每个碎片固定编号 1–6，点击后右侧详情态显示图标、编号、标题和只读字段描述。
- 详情态隐藏人物轨道和左侧领域按钮，右上角返回箭头只退出详情态；右下角激活胶囊保留为只读反馈。
- 当前人物优先使用生成的六格主视觉图；没有专属图时回退到生成档案背景和共享 registry 头像。
- 主角头像可通过详情态的本地上传入口保存到浏览器 IndexedDB，不写入状态变量、不上传 GitHub。

## 数据边界

脚本只读取当前消息楼层 `stat_data`：优先 `getVariables({ type: 'message', message_id: 'latest' })`，再退回 `Mvu.getMvuData`。六槽位描述来自状态字段格式化值，不生成额外剧情文案，也不包含变量写入 API。

## 本地预览

```powershell
python -m http.server 4178 --directory .
```

打开 `http://127.0.0.1:4178/shard-statusbar/preview/index.html?assets=local`。`preview/bundle.html` 会直接执行最终脚本 JSON，检查发布包而不是开发模块。

## 资产

`assets/scene-emilia.png`、`scene-rem.png` 和 `scene-subaru.png` 是无文字六格主视觉；日/夜背景和悬浮球徽记也由项目重新生成。NPC 头像继续复用正文正则的 `character-registry.json`、别名归一化和 `portraitKey`。生产 URL 固定到不可变提交，网络失败时仍保留暗色舞台和文字状态。
