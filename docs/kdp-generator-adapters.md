# Generator adapter and publishing package contract

BookNexa orchestrates multiple book types through isolated adapters. The integration boundary is a validated KDP edition package—not a fixed list of genres or a requirement to merge every external project into the web app.

```text
Research / author brief
        ↓
Generator adapter (BookNexa-native or external)
        ↓
Normalized manuscript + cover + metadata + provenance
        ↓
Format-specific validation + human content review
        ↓
KDP package ZIP (manifest + metadata + assets)
        ↓
Local CLI preflight → selected account's visible KDP browser profile
        ↓
User reviews KDP Previewer and explicitly confirms Publish
```

The local browser publisher is downstream of generation and must not own source-generator behavior or Amazon account secrets. The package contract is defined by `docs/kdp-package.schema.json`.

## Adapter contract

An executable adapter takes a normalized book brief and returns a package plus machine-readable validation results. It declares supported genres, editions, input requirements, external services/costs, license, and version. Keep external adapters optional; do not make a third-party generator a dependency of the BookNexa SaaS app.

Before enabling an adapter, check the actual source license and attribution, dependency security/maintenance, runtime requirements, external API terms and costs, commercial-use rights for generated outputs, and repeatability. Do not treat README claims as a completed technical/legal audit.

## Registry and integration order

`lib/kdp/adapters.ts` lists native and candidate adapters. Third-party entries are explicitly `audit-required` or `reference-only`; the registry is discovery metadata, not executable integrations.

1. Package current BookNexa-native generators with the shared contract.
2. Audit `devanasolver/kdp-toolkit` for print formatting/preflight. Compare trim, bleed, gutter, and spine math against `lib/pdf/` before selecting a canonical source of truth.
3. Audit `jessl2juice/kindlepub` for EPUB build/validation and dependencies.
4. Audit `ElliottSax/coloring-books` license, image-service terms, rights, and sample quality before integration.
5. Use `wendy5062/KDP-PUBLISHING-SKILL` as an editorial checklist reference unless separate review supports reuse.
6. Treat `ekr0/auto-kdp` as browser-flow reference only until UI stability, account isolation, and recovery are tested.

Add new genres by adding adapters, not by expanding the local publisher's generator assumptions. Decline integrations that fail quality, license, security, cost, or KDP compatibility checks.

## Multiple Amazon accounts

Amazon account sessions are local machine state, not BookNexa cloud data. Each user-selected profile label maps to its own Chromium user-data directory under `~/.booknexa-kdp-publisher/accounts/`. The local publisher requires `--account <label>` when opening KDP; repeated use of that label reuses the same isolated browser profile. `kdp:accounts list` reports profile labels, not cookies. Never sync, log, or upload profile directories. The user signs in and handles MFA/challenges directly. Different profiles prevent accidental reuse of the wrong browser session; users remain responsible for confirming the displayed Amazon identity before any future upload/publish automation.

If BookNexa later tracks publications across multiple KDP accounts in its cloud dashboard, model an owner-scoped account record with a user-defined label and non-secret external identifier, and reference that account from each publication/weekly slot. Never store Amazon passwords, MFA codes, or session cookies there. This is separate from local-browser profile selection and needs a dedicated database migration/API design before implementation.

## Quality gates

- Tests cover manifest generation, metadata mapping, archive/path safety, and adapter registry state.
- Validate actual file formats (for example EPUBCheck for EPUB; PDF geometry/fonts for print).
- Human-review sample interiors/covers, rights, attribution, and disclosures.
- Fixture packages pass `npm run kdp:local -- --package <fixture.zip> --check`.
- Automated tests never use a real KDP account or click a live publish action.

Current CLI scope: package preflight and visible browser handoff only. Any future upload flow must be staged, recoverable, stop for preview review, and require explicit confirmation before publishing.
