# KDP Toolkit adapter: smoke test and PR validation

This checklist covers the KDP Toolkit print adapter and its handoff to the local KDP browser profile. It does **not** publish a book. Run the package/build tests without an Amazon account first; perform the visible-browser check only on a trusted local machine.

## What this adapter does (and doesn't do)

- **Does:** take a supplied KDP Toolkit project (`manuscript.md` + `metadata.json`), typeset its existing manuscript into an interior PDF, create a matching full-wrap cover, run upstream PDF preflight, create a BookNexa package ZIP, and pass the ZIP through BookNexa's package checker.
- **Does not:** research a market, choose or validate a niche, write or edit the manuscript, generate custom illustrations, upload anything to KDP, or publish. It is a print-formatting/package adapter, not a complete book-production pipeline.
- The user must provide and review the manuscript, metadata, cover design choices, and market research. KDP Previewer and final account actions remain manual.

## Prerequisites

1. Node.js and npm installed; install BookNexa dependencies with `npm ci`.
2. Python 3.10+ installed.
3. Install the external MIT-licensed KDP Toolkit in the Python environment used below:
   ```bash
   python -m pip install git+https://github.com/devanasolver/kdp-toolkit
   kdp --version
   ```
4. Prepare a project directory with `manuscript.md` and `metadata.json`. The adapter requires non-empty `title`, `author`, and `description`; see the upstream KDP Toolkit README for its project format.

## Automated checks (no Amazon login required)

From the repository root:

```bash
npm run test:kdp-integration
python -m py_compile integrations/kdp-toolkit/adapter.py
```

Expected: the package-manifest, adapter-registry, and Python wrapper contract tests pass. The Python tests check normalization, provenance, required metadata, JSON serialization, and unsafe path rejection. They do not prove that the external CLI can build a real book.

## End-to-end local package smoke test

Use a reviewed manuscript/project—not the upstream placeholder text for a commercial release:

```bash
python integrations/kdp-toolkit/adapter.py \
  --project ./mybook \
  --output ./output/mybook-kdp.zip \
  --trim 6x9 \
  --ink-paper bw-white
```

Expected:

- KDP Toolkit successfully creates and validates both PDFs.
- The adapter reports the final page count and creates the ZIP.
- BookNexa's `kdp:local --check` reports title, author, edition, manuscript and cover and exits successfully.
- ZIP contents include `metadata.json`, `booknexa-kdp.json`, `interior.pdf`, `cover.pdf`, and the two JSON validation reports.
- Manifest source is `kdp-toolkit`, the edition is `paperback`, and the source URL/license are recorded.

Also test a negative case: remove or rename the manuscript, leave a required metadata field blank, or use an unsupported trim. The adapter should stop with a useful error and should not produce a valid-looking package. Do not rely on filename extensions alone as proof that a PDF is valid.

## Visible browser handoff (trusted desktop only)

First create a distinct local profile for the intended account:

```bash
npm run kdp:accounts -- add "US imprint"
npm run kdp:accounts -- list
```

Then, after package validation passes:

```bash
python integrations/kdp-toolkit/adapter.py \
  --project ./mybook \
  --output ./output/mybook-kdp.zip \
  --trim 6x9 \
  --handoff \
  --account "US imprint"
```

Expected: a visible Chromium instance opens the KDP Bookshelf using that label's isolated local profile. Sign in and handle Amazon security prompts directly in the browser. Confirm the intended Amazon account identity yourself. The adapter does not inspect KDP pages, fill forms, upload files, click Publish, or send credentials/session cookies to BookNexa. Close the browser through the CLI prompt.

Repeat with a second label to check that the two local profile directories are distinct. Never copy a signed-in profile between accounts or commit profile files.

## PR-ready acceptance checklist

- [ ] `npm run test:kdp-integration` passes.
- [ ] `python -m py_compile integrations/kdp-toolkit/adapter.py` passes.
- [ ] Local package smoke test builds a paperback ZIP and BookNexa preflight accepts it.
- [ ] Interior and cover validation reports are included and indicate success.
- [ ] Invalid project/metadata inputs fail without leaving a partial output package.
- [ ] Two account labels map to separate local browser profiles; no secrets are logged or uploaded.
- [ ] Optional visible-browser handoff opens KDP only after package validation; no form fill/upload/publish behavior is present.
- [ ] PR description states whether the live external-tool smoke test and visible browser handoff were actually run; don't mark unrun checks as passed.
- [ ] Review the package's actual visual layout and disclosures; automated geometry checks are not editorial, legal, market-demand, or KDP Previewer approval.

## Suggested PR validation summary

```text
Scope: KDP Toolkit print adapter + common package preflight + optional local account browser handoff.
Automated tests: [paste actual results]
External CLI smoke test: [not run / passed, include toolkit version]
Visible browser handoff: [not run / passed, no account details]
Publishing/upload: not automated; no live publish performed.
Known limitation: this adapter formats a supplied manuscript and does not conduct market research or write book content.
```
