# Re:0 · 星屑碎片状态栏复刻版发布记录

## GitHub

- 分支：[codex/re0-shard-statusbar](https://github.com/1798547983tt/re0/tree/codex/re0-shard-statusbar)
- 复刻组件与脚本提交：`adfef447692287948a2bfecbd0af00492d451aa9`
- 导入脚本：[script-Re0·星屑碎片状态栏.json](https://raw.githubusercontent.com/1798547983tt/re0/adfef447692287948a2bfecbd0af00492d451aa9/dist/script-Re0%C2%B7%E6%98%9F%E5%B1%91%E7%A2%8E%E7%89%87%E7%8A%B6%E6%80%81%E6%A0%8F.json)
- 脚本大小：158109 bytes
- SHA-256：`42037c20abf27661b6d125289239037a3c083fdf6f33fc8a906f02eaa34d05ed`

## 素材引用

- 唯一通用主视觉及场景素材固定提交：`423c07aec7ffe7c1e1b5838cd6d571eff840a594`
- 通用舞台：[scene-universal.png](https://raw.githubusercontent.com/1798547983tt/re0/423c07aec7ffe7c1e1b5838cd6d571eff840a594/shard-statusbar/assets/scene-universal.png)
- NPC 头像仍走正文注册表和既有头像提交 `def1712b14100d7294549fa6b30cdf62d0910582`。

## 验证证据

- Node 全量：164/164 通过。
- Python 全量：7/7 通过。
- SVG 几何测试：1 个 `1924×1080` viewBox、6 个 clipPath、6 个 outline、6 个 hit path；5/6 无填充区域重叠，详情态标记使用同一矩阵。
- 浏览器预览：主界面、通用素材、详情态和最终 bundle 均已观察；1920×1080、390×844、768×1024、740–1024 横向窄屏均能显示 10 个头像，头像层级高于碎片舞台，关闭按钮不遮挡头像；900px 以下横向窄屏隐藏装饰提示以保留头像跑道。
- 交互回归：关闭态只显示悬浮球；头像覆盖/聊天头像回退可解析；详情态标记与 SVG 同矩阵；SVG 碎片支持 Tab、Enter 和 Space 激活。
- 远程 scene/script URL 返回 200，发布后将再次核对远程脚本哈希与本地一致。
- 未完成的门：真实 SillyTavern 安装组合、真实触控设备 pointer capture、远程资源失败后的宿主表现，仍需按 `shard-statusbar/RUNTIME.md` 验收。
