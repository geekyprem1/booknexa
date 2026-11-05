# Local KDP package and browser handoff

The first publishing-tool milestone is deliberately a **preflight plus browser handoff**, not an unattended publisher. It accepts a ZIP produced by BookNexa or another book generator, checks a common artifact contract, and can open a visible local browser at the KDP bookshelf. It does not inspect KDP pages, fill forms, upload assets, click Publish, or save Amazon credentials.

## Run

From the BookNexa repository after `npm install`:

```bash
npm run kdp:local -- --package ./path/to/publish-package.zip --format paperback --check
npm run kdp:local -- --package ./path/to/publish-package.zip --format paperback --open
```

Supported editions are `ebook`, `paperback`, and `hardcover`. The edition can be supplied on the command line or in the optional package manifest. `--check` is the default behavior. `--open` only opens `https://kdp.amazon.com/bookshelf`; the user signs in and interacts with Amazon themselves. A local persistent browser profile is stored under `~/.booknexa-kdp-publisher/chrome-profile/` and is never added to the project. The tool does not read or export its cookies.

Do not run `--open` in a server/container environment that has no trusted desktop display. Keep the profile directory private, and delete it to sign out and remove local browser state.

## Common package contract

The input is a ZIP containing `metadata.json`, one manuscript, and one cover. The package can also contain generator-specific notes, previews, validation reports, and other files. Nothing is extracted to disk by this milestone.

For an unambiguous cross-generator package, include `booknexa-kdp.json` at the ZIP root:

```json
{
  "schemaVersion": 1,
  "format": "paperback",
  "metadata": "metadata.json",
  "assets": {
    "manuscript": "interior.pdf",
    "cover": "cover.pdf"
  }
}
```

Paths are ZIP-relative. The tool rejects absolute paths and `..` path components. The manifest is optional for familiar filenames; pass `--format` when an older `metadata.json` does not identify an edition.

Required metadata fields are `title`, `author`, and `description`. `keywords`, `categories`, `series`, `trim_size`, and other KDP metadata can be present as generator-specific values. This first milestone reports a package summary, it does not claim that Amazon will accept a file or listing.

### Asset extensions

| Edition | Manuscript | Cover |
|---|---|---|
| Kindle eBook | `.epub`, `.docx`, `.kpf` | `.jpg`, `.jpeg`, `.tif`, `.tiff`, `.png` |
| Paperback / hardcover | `.pdf`, `.docx` | `.pdf` full-wrap |

Use the manifest when the ZIP has multiple files of the same role, or when another generator uses different filenames. In particular, print cover PDFs must be built for the chosen trim, bleed, paper, and final page count; a package preflight cannot establish visual quality or KDP Previewer acceptance.

## Generator integrations

Book creation must stay modular: KDP edition and common publishing assets are the boundary, not a fixed list of BookNexa book genres. A source generator can be integrated by converting its output and metadata into this package contract; it does not need to be merged into BookNexa's core generator code.

Candidate evaluation order:

1. **`devanasolver/kdp-toolkit`** — investigate as an external print-PDF and preflight adapter. Keep its MIT notice if code is reused; compare its spec calculations with BookNexa's existing PDF engine before choosing one source of truth.
2. **`jessl2juice/kindlepub`** — investigate as an EPUB build/validation adapter. Its README identifies an MIT license. Keep it as an optional ebook tool until its scripts and dependencies have been audited.
3. **`ElliottSax/coloring-books`** — a possible coloring interior generator. Verify the repository's current license and third-party image service terms before code or output reuse.
4. **`wendy5062/KDP-PUBLISHING-SKILL`** — editorial/readiness checklist reference, not a book-generation or upload engine. Preserve its license and attribution if any material is reused.
5. **`ekr0/auto-kdp`** — reference for KDP browser-flow lessons only for now. It is MIT-licensed, but KDP UI automation is fragile; this MVP intentionally avoids copying its form-filling/publishing behavior.

Adapters should be isolated, produce reproducible artifacts, carry provenance/license information, and pass their own file-format validation before their output reaches the local publishing handoff. Do not copy code or assets from a candidate until its license, dependencies, and upstream terms have been checked.

## Safety boundaries and next milestone

- Amazon passwords, MFA codes, and session cookies must never be collected by BookNexa or committed to Git.
- Browser profile/session data is local and excluded from version control.
- No publish action exists in this version. Any future upload automation must stop for user review at the preview and require explicit confirmation before the final irreversible publish action.
- Browser automation may encounter Amazon login challenges, CAPTCHA, or changed pages; the user must handle those in the visible browser. Do not bypass these checks.
- Before adding any form automation, test the package contract across BookNexa ebook/print outputs and the separately audited generator adapters.
