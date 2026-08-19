# RE0 Narrative Assets

This directory is the maintained local source bundle for the RE0 narrative artwork.

Do not hand-edit `manifest.json` metadata. Refresh it mechanically after binary assets are present:

```bash
node tools/package_narrative_regex.mjs --refresh-manifest
```

Audit without writing:

```bash
node tools/package_narrative_regex.mjs --audit-assets
```

Use strict audit when a release must require every binary:

```bash
node tools/package_narrative_regex.mjs --audit-assets --strict
```

Rules:

- Existing binary files get real MIME, dimensions, and SHA-256 values.
- Missing binary files keep `mime`, `dimensions`, and `sha256` as `null`.
- `releaseUrl` stays empty until a fixed HTTPS release URL is known; remote selection also requires a non-empty `releaseRevision`, and every URL must contain that revision.
- Avatar files belong under `./assets/avatars/{portraitKey}.webp`.
- This manifest must never contain secrets, API keys, user chat text, or variable payloads.
- The regex package embeds the manifest and renderer, not the roughly 9.65 MB of image binaries. Local preview paths work under `narrative/index.html`; an isolated SillyTavern import falls back to CSS and first-grapheme avatars until pinned HTTPS URLs are configured.
- Do not hand-edit only `releaseUrl` and then run refresh: refresh intentionally reconstructs the local manifest. Add a fixed-version release configuration and its tests together when publishing is explicitly authorized.
- These generated/derived images are scoped to personal, non-commercial fan use. Public or commercial release requires a separate rights review of the supplied references and logo.
