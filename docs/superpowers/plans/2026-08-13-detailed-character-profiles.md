# Detailed Character Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 153 份短人物档案重写为基于正传证据、每份约 2,000–3,000 字且可直接扮演的详细档案。

**Architecture:** 以正传卷章证据索引作为维护侧事实入口，使用规范姓名/译名映射和阶段/战力数据渲染角色内容层 TXT；证据索引不嵌入角色文件。生成后运行结构、篇幅、审计字段隔离和阶位校验，并对代表性角色做人工抽样。保留现有文件名和单一顶层人物标签。

**Tech Stack:** Python 3 标准库、UTF-8 Markdown/TXT、PowerShell、GitHub CLI。

---

### Task 1: 修复 PRD 发布编码并建立可追踪规范

**Files:**
- Create: `docs/prd/详细人物人设档案.md`
- Create: `docs/superpowers/plans/2026-08-13-detailed-character-profiles.md`
- Modify: GitHub Issue #1 body

- [x] 用 UTF-8 文件作为 Issue 正文源，重新发布 Issue #1。
- [x] 读取 Issue #1，确认正文包含中文标题、Problem Statement、Solution 和验收段落，且标签为 `ready-for-agent`。

### Task 2: 建立正传证据索引与译名规范化

**Files:**
- Create: `tools/build_character_evidence.py`
- Create: `data/character_aliases.json`
- Create: `data/character_evidence.json`

- [x] 先写一个会失败的校验：规范姓名能映射到至少一个正传卷章，低证据角色能被标记为 `low`，战力表孤证不能伪装为正传证据。
- [x] 运行校验确认当前索引尚不存在或失败。
- [x] 扫描 `正传/` 的卷标题、章节标题和行号；按正文译名与规范别名建立上下文命中，避免短词跨人物误计数。
- [x] 输出每人的卷号、章节标题、行号范围、证据类型和置信度；总结索引与战力表只能作为单独证据类型。
- [x] 运行校验确认别名冲突、无来源和低证据状态被明确报告。

### Task 3: 定义详细档案渲染契约

**Files:**
- Modify: `tools/generate_character_profiles.py`
- Create: `data/character_profile_content.json`
- Create: `tests/test_character_profiles.py`

- [x] 先写失败测试，要求一份档案包含身份锚点、欲望/恐惧/底线、条件化场景反应、知识边界、能力限制、口吻示例、阶段切换和互动规则；证据字段单独由索引测试覆盖。
- [x] 运行测试确认现有短模板失败。
- [x] 实现分层内容模型：人物事实、阶段解释、扮演规则和口吻示例进入角色内容层，证据/审计数据留在索引层。
- [x] 对资料较少角色强制使用保守规则和危险禁区；不从战力表推导性格。
- [x] 运行测试确认模板字段完整且没有共享占位句冒充人物特异内容。

### Task 4: 先完成代表性角色样本

**Files:**
- Modify: `人物人设/菜月昴.txt`
- Modify: `人物人设/艾米莉亚.txt`
- Modify: `人物人设/雷姆.txt`
- Modify: `人物人设/帕克.txt`
- Modify: `人物人设/贝亚特丽丝.txt`
- Modify: `人物人设/莱茵哈鲁特·范·阿斯特雷亚.txt`
- Modify: `人物人设/阿尔·迪巴兰.txt`
- Modify: `人物人设/奇夏·哥尔特.txt`
- Modify: `人物人设/尤尔娜·米希格蕾.txt`

- [x] 为每个样本写入至少 2,000 字正文，并提供阶段切换与可执行互动规则；可回查卷章锚点由独立索引承载。
- [x] 为每个样本添加安全、冲突、战斗、亲密、失败五类行为规则和短口吻示例。
- [x] 运行结构、篇幅和证据测试；修正跨阶段知识或能力泄漏。

### Task 5: 批量重写剩余档案

**Files:**
- Modify: `人物人设/*.txt`（除 README）
- Modify: `人物人设/README.txt`

- [x] 按证据密度、主线阶段和角色类型分批渲染剩余档案。
- [x] 主要人物达到 2,000–3,000 字；资料较少人物达到安全的详细规则篇幅，并用具体未知边界表达限制。
- [x] 每个阶段单独记录形态、条件和阶位；不把历史回溯、轮回分支和试炼幻境当作主线记忆。
- [x] 更新 README，区分角色内容层与证据索引层；来源、置信度和个人观点只在维护索引中说明。

### Task 6: 完整校验与扮演抽样

**Files:**
- Modify: `tools/validate_character_profiles.py`
- Create: `reports/character-profile-validation.json`

- [x] 校验 153 份文件的 UTF-8、标签、字段、字符数、重复模板、阶位、阶段和禁止审计字段。
- [x] 输出总数、字符数分布、低置信度名单、非法阶位数、标签错误数和缺失字段数。
- [x] 对主角、非人、大罪司教、帝国、普通人和低证据角色执行五类扮演提示抽样审阅。
- [x] 只有在所有硬性校验通过后，报告完成状态；否则列出阻塞项而不宣称完成。
