# Re:0 星屑碎片悬浮状态栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new importable Tavern Helper script that exposes a freely draggable floating orb, opens a responsive floating/drawer HUD made of clickable Re:Zero state shards, maps the existing 172 declared state paths read-only, reuses the narrative registry and NPC avatar assets, and supports local protagonist/person portrait overrides.

**Architecture:** Keep the existing message-inline regex status bar untouched. Add a self-contained `shard-statusbar/` source package with a pure shard view-model, a read-only script-iframe bridge, a host-document shell, a pointer-gesture orb, and a namespaced DOM renderer. The package tool bundles the modules into a `type: "script"` Tavern Helper JSON; only generated visual assets and the shared narrative avatar URLs are remote, pinned to immutable Git commits, with local preview fallbacks.

**Tech Stack:** Framework-neutral semantic HTML/CSS/ES modules, Node built-in test runner, IndexedDB for local portraits, Tavern Helper/MVU read APIs, built-in ImageGen assets, GitHub raw URLs pinned to commits.

---

### Task 1: Record the domain and delivery contract

**Files:** `CONTEXT.md`, `docs/adr/0013-状态栏悬浮球与宿主浮窗作为独立表面.md`, `docs/adr/0014-状态栏NPC头像复用正文注册表.md`

- [x] Add the canonical terms for the host-level shard surface, free-drag orb, clickable shard, and shared NPC portrait resolver.
- [x] Record that this surface is separate from the existing message-inline status bar and remains read-only.
- [ ] Run `git diff --check` for the documentation files.

### Task 2: Write failing contract tests

**Files:** `tests/test_shard_statusbar_model.mjs`, `tests/test_shard_statusbar_orb.mjs`, `tests/test_shard_statusbar_package.mjs`, `tests/test_shard_statusbar_assets.mjs`

- [ ] Assert the shard model covers all eight domains, preserves unknown leaves, and resolves current NPC aliases to the narrative `portraitKey`.
- [ ] Assert pointer gestures distinguish click and drag, never snap automatically, persist normalized coordinates, and expose a drag state for CSS feedback.
- [ ] Assert the package is a Tavern Helper `type: "script"` JSON, contains no regex replacement fields, embeds no variable-write API, and references pinned GitHub assets with local fallbacks.
- [ ] Run the new tests and observe expected module-not-found/contract failures before implementing production modules.

### Task 3: Implement the pure model, registry resolver, and read-only runtime bridge

**Files:** `shard-statusbar/src/model.mjs`, `shard-statusbar/src/registry.mjs`, `shard-statusbar/src/runtime.mjs`

- [ ] Reuse `statusbar/src/status-core.mjs` normalization and `narrative/src/character-registry.mjs` alias behavior through explicit imports.
- [ ] Build seven primary shards plus a diagnostics shard, with detail records for every declared domain and a bounded list of current NPCs/events/clues/assets.
- [ ] Read `stat_data` from `getVariables({ type: 'message', message_id: 'latest' })`, fall back to `Mvu.getMvuData`, keep the last good state on transient failures, and never expose write methods.
- [ ] Subscribe only to exported MVU/Tavern events and clean up every listener.
- [ ] Run model/runtime tests green.

### Task 4: Implement the host shell, orb gesture, and accessible shard UI

**Files:** `shard-statusbar/src/host.mjs`, `shard-statusbar/src/orb.mjs`, `shard-statusbar/src/ui.mjs`, `shard-statusbar/styles.css`, `shard-statusbar/index.html`

- [ ] Create one host-document root with idempotent mount/destroy behavior and a shared command registry.
- [ ] Render a freely draggable orb with pointer capture, a small movement threshold, drag shadow/trail feedback, keyboard activation, and normalized local position persistence; do not implement edge snapping.
- [ ] Render a desktop floating panel and narrow-screen bottom drawer with a layered Re:Zero-inspired shard composition, semantic buttons, focus return, Escape close, reduced-motion support, loading/stale/unavailable states, and safe `textContent` rendering.
- [ ] Make each shard, NPC chip, and detail record keyboard reachable and clickable; use the shared portrait resolver, lazy-load registry avatars, and provide a protagonist file-upload editor backed by the existing IndexedDB portrait repository.
- [ ] Run DOM/source contract tests and preview checks.

### Task 5: Generate and register project-owned visual assets

**Files:** `shard-statusbar/assets/*`, `shard-statusbar/assets/manifest.json`, `shard-statusbar/assets/README.md`

- [ ] Generate original day/night atmospheric backgrounds and a shard/orb texture set with the built-in ImageGen tool, inspect outputs, and copy final files into the worktree.
- [ ] Record dimensions, hashes, prompts, provenance, and local fallback paths; do not copy the user reference image or third-party art.
- [ ] Keep NPC portraits sourced through the shared narrative registry and immutable repository URLs; only fetch active NPCs.
- [ ] Run the asset audit test.

### Task 6: Bundle an importable Tavern Helper script and offline preview

**Files:** `tools/package_shard_statusbar.mjs`, `shard-statusbar/README.md`, `shard-statusbar/RUNTIME.md`, `dist/script-Re0·星屑碎片状态栏.json`, `shard-statusbar/preview/*`

- [ ] Bundle dependency-ordered modules into a single `type: "script"` JSON with stable id/name, no regex fields, and a conservative remote asset loader pinned to the recorded commit.
- [ ] Keep source and production output separate; add a local preview fixture and an explicit runtime handoff checklist.
- [ ] Run the package builder and package tests; verify no variable-write symbol or unpinned asset URL is present.

### Task 7: Verify, commit, push, and report gates

- [ ] Run the focused Node tests, all existing status-bar/narrative tests, `git diff --check`, package audit, and a local browser preview at wide and narrow widths.
- [ ] Record automated evidence, preview evidence, untested real-SillyTavern boundaries, and the exact artifact hash.
- [ ] Commit only the new scoped files on `codex/re0-shard-statusbar`, push the branch to GitHub, then update the manifest/README with the immutable asset commit if needed and push the final commit.
