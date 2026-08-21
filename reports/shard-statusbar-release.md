# Re:0 · 星屑碎片状态栏复刻版发布记录

## GitHub

- 分支：[codex/re0-shard-statusbar](https://github.com/1798547983tt/re0/tree/codex/re0-shard-statusbar)
- 复刻组件与脚本提交：`b1cfec21456ff462cd2ccc6991bb1f4013f739ce`
- 导入脚本：[script-Re0·星屑碎片状态栏.json](https://raw.githubusercontent.com/1798547983tt/re0/b1cfec21456ff462cd2ccc6991bb1f4013f739ce/dist/script-Re0%C2%B7%E6%98%9F%E5%B1%91%E7%A2%8E%E7%89%87%E7%8A%B6%E6%80%81%E6%A0%8F.json)
- 脚本大小：145545 bytes
- SHA-256：`ad81e37ca90094b1937dc2d954e97695c017bda19a5b7330b028ab6ea0370f3b`

## 素材引用

- 六格主视觉与新场景素材固定提交：`ad33f13b2f70bf3c2731d7502d6dc8fa56490e9f`
- 艾米莉亚场景：[scene-emilia.png](https://raw.githubusercontent.com/1798547983tt/re0/ad33f13b2f70bf3c2731d7502d6dc8fa56490e9f/shard-statusbar/assets/scene-emilia.png)
- 蕾姆场景：[scene-rem.png](https://raw.githubusercontent.com/1798547983tt/re0/ad33f13b2f70bf3c2731d7502d6dc8fa56490e9f/shard-statusbar/assets/scene-rem.png)
- 菜月昴场景：[scene-subaru.png](https://raw.githubusercontent.com/1798547983tt/re0/ad33f13b2f70bf3c2731d7502d6dc8fa56490e9f/shard-statusbar/assets/scene-subaru.png)
- NPC 头像仍走正文注册表和既有头像提交 `def1712b14100d7294549fa6b30cdf62d0910582`。

## 验证证据

- Node 全量：157/157 通过。
- Python 全量：7/7 通过（复刻版提交前后 Python 域未改动）。
- 浏览器离线预览：16:9 全屏舞台、左侧导航、顶部人物轨道、六槽位、人物切换、右侧详情态、返回箭头、激活胶囊和 UID 均已观察。
- 最终 `type: "script"` 包可独立启动，旧卡片/hero/stage 选择器已从生产 UI 删除。
- 未完成的门：真实 SillyTavern 安装组合、真实触控设备 pointer capture、远程资源失败后的宿主表现，仍需按 `shard-statusbar/RUNTIME.md` 验收。
