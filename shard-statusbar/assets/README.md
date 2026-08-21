# 星屑碎片状态栏素材

本目录的日间背景、夜间背景、悬浮球徽记和一张通用六槽位主视觉由内置 ImageGen 在 2026-08-21 为本组件重新生成，随后对徽记的生成棋盘背景做了可复现的 alpha 清理（`tools/clean_shard_sigil.mjs`）。素材不含文字、水印或用户提供的原图副本。

NPC 头像不在这里重复复制：脚本沿用正文正则的 `narrative/data/character-registry.json`、`portraitKey` 和 `narrative/assets/avatars/`，只按当前关系人物懒加载；通用主视觉不随人物切换。这样正文、消息内状态栏和宿主碎片状态栏使用同一套人物解析逻辑。

`manifest.json` 已锁定到包含这些文件的不可变 Git commit；如果未来重新生成素材，必须先产生新的资产提交，再重新生成脚本 JSON。运行时仍保留本地路径作为离线预览和网络失败降级。
