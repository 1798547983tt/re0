# Re:0 · 星屑碎片状态栏复刻版发布记录

## GitHub

- 分支：[codex/re0-shard-statusbar](https://github.com/1798547983tt/re0/tree/codex/re0-shard-statusbar)
- 复刻组件与脚本提交：`8e2d9dea208386f0e3bdb83b3d3dad800cdfb16a`
- 导入脚本：[script-Re0·星屑碎片状态栏.json](https://raw.githubusercontent.com/1798547983tt/re0/8e2d9dea208386f0e3bdb83b3d3dad800cdfb16a/dist/script-Re0%C2%B7%E6%98%9F%E5%B1%91%E7%A2%8E%E7%89%87%E7%8A%B6%E6%80%81%E6%A0%8F.json)
- 脚本大小：150026 bytes
- SHA-256：`1047a70b3797eb4e9cac075eab63c3e278aaf02e58319dc7ddca833ee0711251`

## 素材引用

- 唯一通用主视觉及场景素材固定提交：`423c07aec7ffe7c1e1b5838cd6d571eff840a594`
- 通用舞台：[scene-universal.png](https://raw.githubusercontent.com/1798547983tt/re0/423c07aec7ffe7c1e1b5838cd6d571eff840a594/shard-statusbar/assets/scene-universal.png)
- NPC 头像仍走正文注册表和既有头像提交 `def1712b14100d7294549fa6b30cdf62d0910582`。

## 验证证据

- Node 全量：157/157 通过。
- Python 全量：7/7 通过。
- SVG 几何测试：1 个 `1924×1080` viewBox、6 个 clipPath、6 个 outline、6 个 hit path。
- 浏览器预览：主界面、通用素材、详情态和最终 bundle 均已观察；详情态隐藏轨道并从右侧进入。
- 远程 scene/script URL 返回 200，远程脚本哈希与本地一致。
- 未完成的门：真实 SillyTavern 安装组合、真实触控设备 pointer capture、远程资源失败后的宿主表现，仍需按 `shard-statusbar/RUNTIME.md` 验收。
