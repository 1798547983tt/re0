# Status Bar Music, Portrait Roster, and Expanded Artwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Diagnostics tab with a persistent local music library, provide all 45 bundled character portraits with alias matching, and switch an expanded status bar to the dedicated portrait artwork.

**Architecture:** Keep MVU state read-only and keep music, deleted-track choices, and custom portrait choices in browser-owned UI storage. Add one focused media manifest module, one audio-controller module, and reuse the existing portrait repository for user overrides. Keep the `Audio` instance outside section DOM so changing tabs or refreshing variables does not stop playback.

**Tech Stack:** Framework-neutral ES modules, DOM APIs, HTMLAudioElement, IndexedDB, localStorage, CSS container queries, Node's built-in test runner, existing regex packager.

---

### Task 1: Lock bundled media and alias contracts

**Files:**
- Create: `statusbar/src/builtin-media.mjs`
- Create: `tests/test_statusbar_builtin_media.mjs`
- Modify: `tools/package_statusbar_regex.mjs`

- [ ] **Step 1: Write the failing media contract test**

```js
test('bundled media exposes four songs and all 45 portrait identities', () => {
  assert.equal(BUILT_IN_TRACKS.length, 4);
  assert.equal(BUILT_IN_PORTRAITS.length, 45);
  assert.match(builtInPortraitForName('艾米莉亚').url, /爱蜜莉雅\.png$/u);
  assert.match(builtInPortraitForName('雷姆').url, /蕾姆\.webp$/u);
});
```

- [ ] **Step 2: Run `node --test tests/test_statusbar_builtin_media.mjs` and verify it fails because the module does not exist**

- [ ] **Step 3: Add the pinned manifest and alias resolver**

```js
export const MEDIA_REVISION = '3a7a36a3e16809e8d53faabb2a453a5d48f30abd';
export const BUILT_IN_TRACKS = Object.freeze([
  { id: 'builtin:styx-helix', title: 'STYX HELIX', file: 'MYTH+&+ROID+-+STYX+HELIX.mp3' },
  { id: 'builtin:memento', title: 'Memento', file: 'Memento.mp3' },
  { id: 'builtin:love-you', title: '好喜欢你', file: '好喜欢你.mp3' },
  { id: 'builtin:pinky-promise', title: '拉过勾的', file: '拉过勾的.mp3' },
]);
```

Add 45 frozen portrait entries. Copy the 44 supplied records' `stableId`, `displayName`, `referenceFile`, and aliases exactly, then add `{ stableId: 'emilia', displayName: '爱蜜莉雅', referenceFile: '爱蜜莉雅.png', aliases: ['爱蜜莉雅', '艾米莉亚', '艾蜜莉雅', 'Emilia'] }`. Normalize with NFKC and punctuation/space removal; resolve exact aliases first and then the longest alias of at least two characters contained in a decorated name.

- [ ] **Step 4: Put `builtin-media.mjs` before portrait/music consumers in `MODULES`, rerun the focused test, and commit**

### Task 2: Build the persistent music controller

**Files:**
- Create: `statusbar/src/music.mjs`
- Create: `tests/test_statusbar_music.mjs`
- Modify: `tools/package_statusbar_regex.mjs`

- [ ] **Step 1: Write failing tests for HTTPS validation, sequence/single modes, deletion, and local metadata**

```js
test('music URLs accept HTTPS only', () => {
  assert.equal(validateMusicUrl('https://example.com/a.mp3').ok, true);
  assert.equal(validateMusicUrl('http://example.com/a.mp3').ok, false);
  assert.equal(validateMusicUrl('javascript:alert(1)').ok, false);
});

test('sequence advances while single repeats the current track', async () => {
  const player = createMusicController({ audio: fakeAudio(), storage: memoryStorage(), repository: memoryMusicRepository() });
  await player.play('builtin:styx-helix');
  player.setMode('sequence');
  await player.handleEnded();
  assert.equal(player.snapshot().currentId, 'builtin:memento');
  player.setMode('single');
  await player.handleEnded();
  assert.equal(player.snapshot().currentId, 'builtin:memento');
});
```

- [ ] **Step 2: Run the focused test and verify the missing module/API failure**

- [ ] **Step 3: Implement `createMusicRepository` in `re0-statusbar-music` IndexedDB and `createMusicController`**

The controller API is exactly `snapshot`, `subscribe`, `toggle`, `play`, `previous`, `next`, `seek`, `setVolume`, `setMode`, `addUrl`, `addFile`, `remove`, `restoreBuiltIns`, and `destroy`. Preferences contain `mode`, `volume`, `currentId`, `hiddenBuiltIns`, `urlTracks`, and `localTracks`. Store only local metadata in localStorage and store the audio Blob in IndexedDB. Accept `audio/*` files up to 100 MiB. Revoke every local object URL in `destroy`.

- [ ] **Step 4: Run the focused test and then `node --test tests/*.mjs`; commit when green**

### Task 3: Make built-in portraits the default fallback

**Files:**
- Modify: `statusbar/src/portraits.mjs`
- Modify: `statusbar/src/app.mjs`
- Modify: `tests/test_statusbar_portraits.mjs`

- [ ] **Step 1: Add a failing precedence test**

```js
test('portrait resolution prefers user overrides before the bundled roster', () => {
  const builtIn = { kind: 'url', value: 'https://raw.example/爱蜜莉雅.png' };
  assert.equal(resolvePortrait({ name: '艾米莉亚', builtIn }).source, 'builtin');
  assert.equal(resolvePortrait({ name: '艾米莉亚', builtIn, shared: { kind: 'url', value: 'https://user.example/a.png' } }).source, 'shared');
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Extend `resolvePortrait` with the precedence `chat override → shared custom → bundled → initial` and remove the early return that suppresses bundled portraits when IndexedDB is unavailable**

- [ ] **Step 4: Verify the focused and full tests; commit**

### Task 4: Replace Diagnostics with the music surface and fix expanded artwork

**Files:**
- Modify: `statusbar/src/status-core.mjs`
- Modify: `statusbar/src/app.mjs`
- Modify: `statusbar/src/ui-state.mjs`
- Modify: `statusbar/styles.css`
- Modify: `tests/test_statusbar_surface.mjs`
- Modify: `tests/test_statusbar_interaction.mjs`

- [ ] **Step 1: Write failing source contracts**

```js
assert.match(app, /function renderMusic\b/);
assert.doesNotMatch(app, /function renderDiagnostics\b/);
assert.match(app, /data-music-file/);
assert.match(app, /data-music-url/);
assert.match(app, /single/);
assert.match(app, /sequence/);
assert.match(css, /data-details-open="true"[^}]*--re0-scene:\s*var\(--re0-day-art-mobile/s);
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Replace nav ID `diagnostics` with `music`, keep formal `规则` fields mapped in a compact Overview accordion, and render three music accordions**

The player accordion contains now-playing title, play/pause, previous/next, seek, volume, and two explicit mode buttons. The library accordion lists every visible built-in, URL, and local track with play and delete controls plus `恢复内置曲目` when needed. The import accordion contains a labeled local file input and an HTTPS URL/title form with an assertive status region.

- [ ] **Step 4: Set `app.dataset.detailsOpen` both during full render and `setDetailsOpen`; choose `--re0-day-art-mobile` or `--re0-night-art-mobile` whenever it is true, independent of container width**

- [ ] **Step 5: Wire delegated actions and input/change events to the persistent controller, update progress nodes without full panel rerenders, verify focused tests, then full tests; commit**

### Task 5: Package, browser-QA, and document the candidate

**Files:**
- Modify: `statusbar/README.md`
- Modify: `statusbar/RUNTIME.md`
- Modify: `reports/statusbar-runtime-handoff.md`
- Regenerate: `dist/regex-Re0·全变量状态栏.json`

- [ ] **Step 1: Run `node tools/package_statusbar_regex.mjs`, then `node tools/package_statusbar_regex.mjs --check`**

- [ ] **Step 2: Run `node --test tests/*.mjs`, `python -m unittest discover -s tests -p 'test_*.py'`, `node --check statusbar/src/app.mjs`, and `git diff --check`**

- [ ] **Step 3: Preview desktop and approximately 320px widths; verify wide art while collapsed, mobile art while expanded, all four built-ins, URL/local import, delete/restore, sequence/single behavior, alias portraits, keyboard controls, and no horizontal overflow or console error**

- [ ] **Step 4: Record the exact artifact byte size, SHA-256, offline evidence, and remaining real-SillyTavern acceptance cases; commit the candidate**

