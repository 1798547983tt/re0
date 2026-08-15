# RE0 Narrative Assets

This directory is the local preview location for Task4 artwork.

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
- `releaseUrl` stays empty until a fixed HTTPS release URL is known.
- Avatar files belong under `./assets/avatars/{portraitKey}.webp`.
- This manifest must never contain secrets, API keys, user chat text, or variable payloads.
