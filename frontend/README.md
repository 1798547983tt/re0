# Re:0 创角向导

这是一个无需构建工具的独立前端：在 `frontend/` 目录启动静态服务器后打开 `index.html` 即可。项目的页面状态、草稿、剧情索引和导出逻辑都在 `src/` 中，`data/story-index.json` 由 `tools/build_creator_story_index.py` 从 `剧情总结/` 生成。

## 本地运行

```powershell
python -m http.server 4173 --directory frontend
```

打开 <http://127.0.0.1:4173/>。页面默认引用固定在素材提交 `a6aeb9cca0f0066bd10aec2aba0fd4b220301788` 的 GitHub raw 链接；使用 `?assets=local` 可切换到本地编辑素材进行离线预览。

## AI 帮填

- 离线灵感模式不需要网络或密钥。
- 设置中可切换到 OpenAI-compatible API，填写完整的 chat-completions 地址、模型和本机 API Key。
- 模型只能返回允许的局部 JSON 补丁；已有字段不会被覆盖，危险键和未知字段会被拒绝。

## 导出与酒馆

最终页提供草稿 JSON、ZOD 对齐状态、开场文本的复制/下载/导入，以及本机自动保存。酒馆适配器只在能找到输入框、且输入框为空时写入；无法确认宿主或发送状态时会回退到剪贴板并明确提示。
