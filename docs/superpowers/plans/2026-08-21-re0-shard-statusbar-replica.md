# Re:0 星屑碎片状态栏参考图复刻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current card-like shard HUD with a faithful full-screen 16:9 reconstruction of the supplied reference surface, including its six fixed polygon fragments, left navigation, character rail, and right-side click detail state.

**Architecture:** Preserve the existing pure state model, read-only runtime bridge, NPC registry resolver, portrait repository, and package contract. Replace only the host surface/UI/CSS and add a data-driven six-slot mapper plus generated six-grid scene assets; the production artifact remains one self-contained Tavern Helper script with pinned remote assets and a local preview.

**Tech Stack:** Framework-neutral DOM/CSS/ES modules, Node built-in tests, existing IndexedDB portrait repository, ImageGen-generated six-grid PNG/WebP scenes, GitHub raw URLs pinned to immutable commits.

---

### Task 1: Lock the replica contract and red tests

**Files:** `CONTEXT.md`, `docs/adr/0015-星屑碎片状态栏复刻参考表面.md`, `docs/adr/0016-碎片详情态与人物六格主视觉.md`, `tests/test_shard_replica_surface.mjs`, `tests/test_shard_replica_slots.mjs`

- [x] Record the full-screen replica vocabulary and the right-side detail state.
- [x] Add failing tests for the reference surface landmarks: fixed six slots, left rail, top character rail, right detail panel/back action, bottom identity marker, and no legacy card/hero selectors.
- [x] Add failing tests for deterministic six-slot mapping across the six Re:0 navigation domains and direct state formatting without generated prose.

### Task 2: Implement the six-slot mapper and replica DOM surface

**Files:** `shard-statusbar/src/replica-model.mjs`, `shard-statusbar/src/ui.mjs`, `shard-statusbar/src/host.mjs`

- [x] Map each navigation domain to exactly six stable slot IDs with number, title, icon, summary, detail text, and active state.
- [x] Build the full-screen scene DOM with namespaced semantic buttons and no `innerHTML`; keep the existing runtime/portrait boundaries.
- [x] Implement top character rail switching, fragment selection, right-side detail entry/return, read-only active pill, UID marker, and local portrait upload access.
- [x] Lock body scroll while the scene is open and restore focus/scroll on exit.

### Task 3: Reproduce the reference geometry and motion

**Files:** `shard-statusbar/styles.css`, `shard-statusbar/preview/index.html`, `tests/test_shard_replica_surface.mjs`

- [x] Replace card/hero styles with the screenshot-derived full-screen 16:9 stage, six explicit polygon clip paths, left navigation spacing, avatar rail, icon badges, and right detail panel.
- [x] Preserve composition by scaling/cropping on narrow viewports instead of switching to a different drawer layout.
- [x] Add staged entrance, fragment hover/press lift, detail slide, back transition, reduced-motion fallback, and keyboard focus treatment.
- [x] Verify the preview at 1924×1080 and a narrow viewport with a screenshot and DOM snapshot.

### Task 4: Generate and register six-grid character scenes

**Files:** `shard-statusbar/assets/*`, `shard-statusbar/assets/manifest.json`, `shard-statusbar/src/assets.mjs`

- [x] Generate one original no-text universal scene; inspect it against the reference composition without copying the supplied image.
- [x] Add immutable asset metadata and keep shared registry portraits independent from the universal scene.
- [x] Add asset hash and pinned URL tests.

### Task 5: Rebuild, verify, and publish the replica artifact

- [x] Rebuild `dist/script-Re0·星屑碎片状态栏.json` and remove all legacy card/hero UI selectors from the production bundle.
- [x] Run all Node/Python tests, package check, `git diff --check`, local browser visual checks, and remote raw URL checks.
- [x] Commit and push the replacement artifact to `codex/re0-shard-statusbar`; record the final artifact hash and real-SillyTavern pending gates.
