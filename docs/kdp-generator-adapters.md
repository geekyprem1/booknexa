# Generator adapter and publishing package contract

BookNexa should orchestrate publishing for multiple kinds of books without requiring every generator to be rewritten in this repository. Generator-specific inputs and outputs stay behind adapters; the shared boundary is a validated KDP edition package.

## Pipeline boundary

```text
Research / author brief
        ↓
Generator adapter (BookNexa-native or external)
        ↓
Normalized manuscript + cover + metadata + provenance
        ↓
Format-specific validation and human content review
        ↓
KDP package ZIP (booknexa-kdp.json + metadata.json + assets)
        ↓
Local CLI preflight → visible KDP browser workflow
        ↓
User reviews KDP Previewer and explicitly confirms Publish
```

The adapter must not own Amazon login or publishing. The local publisher accepts only the completed package, so generator integrations can be developed and tested independently of browser automation.

## Package contract v1

Every adapter emits a ZIP with:

- `booknexa-kdp.json`: schema version, KDP edition, relative paths to canonical metadata and assets, plus optional source/provenance details.
- `metadata.json`: at minimum `title`, `author`, and `description`; also provide applicable `subtitle`, `keywords`, `categories`, `language`, `series`, `trim_size`, `bleed`, `page_count`, and pricing/disclosure information.
- One format-appropriate manuscript and cover, referenced explicitly by the manifest.
- Optional previews, validation reports, source notes, and generator-specific files. These are not treated as upload assets unless explicitly referenced.

Example manifest:

```json
{
  "schemaVersion": 1,
  "format": "paperback",
  "metadata": "metadata.json",
  "assets": {
    "manuscript": "interior.pdf",
    "cover": "cover.pdf"
  },
  "source": {
    "adapter": "booknexa-word-search",
    "version": "1.0.0",
    "license": "internal"
  }
}
```

`format` is a KDP edition (`ebook`, `paperback`, `hardcover`), not a genre. Genre/type belongs in metadata and provenance. All paths are ZIP-relative. The package reader must reject absolute paths, traversal components, missing assets, ambiguous roles, unsupported extensions, invalid metadata, and unreasonable archive size/entry counts. Adapters should write packages atomically and never include credentials, cookies, or private browser state.

## Adapter contract

An adapter takes a normalized book brief and returns the package plus a machine-readable validation result. It should declare supported genres, editions, input requirements, external services, costs if known, license, and version. Keep adapters isolated; do not make an optional external generator a mandatory dependency of the BookNexa web app.

Before an adapter is enabled, verify its actual source license and attribution requirements, dependency security/maintenance, runtime requirements, external API terms and costs, commercial-use rights for generated outputs, and repeatability. Do not equate an upstream README claim with a legal or technical audit.

## Integration order

1. **Keep existing BookNexa generators working** through a native adapter that packages their outputs using the same contract.
2. **Print preparation/preflight:** audit `devanasolver/kdp-toolkit`; compare trim, bleed, gutter, and spine math against `lib/pdf/` before selecting one canonical spec implementation. Prefer wrapping or invoking a tool over copying its code initially.
3. **Ebook generation/validation:** audit `jessl2juice/kindlepub`; evaluate its scripts and dependencies as an optional EPUB adapter.
4. **Coloring books:** audit `ElliottSax/coloring-books` license, generation backend, image rights, and output quality before considering an adapter.
5. **Editorial readiness:** use `wendy5062/KDP-PUBLISHING-SKILL` as a checklist reference only unless its license and content are separately reviewed.
6. **KDP browser automation:** use `ekr0/auto-kdp` as a workflow reference, not a copied production dependency, until selector stability, authentication handling, and recovery are tested.

Add other genres by adding adapters, not by expanding the local publisher's assumptions. An adapter may be declined if quality, license, security, cost, or KDP compatibility cannot be established.

## Quality gates per adapter

- Unit tests for manifest generation and metadata mapping.
- Deterministic fixture package and archive/path safety tests.
- Format-level validation (for example EPUBCheck for EPUB; PDF geometry/font checks for print).
- Human review of sample interiors/covers and rights/provenance.
- A test package passes `npm run kdp:local -- --package <fixture.zip> --check`.
- Never use a real KDP account or click a live publish action in automated tests.

## Current scope

The initial CLI milestone validates the common contract and can open a visible local KDP browser, but does not inspect KDP pages, fill forms, upload assets, or publish. Account sign-in and Amazon challenges remain user-controlled. Later browser steps should be staged, recoverable, and explicit; preview approval and final publication always require human confirmation.
