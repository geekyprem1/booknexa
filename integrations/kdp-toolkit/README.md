# KDP Toolkit adapter (experimental)

This adapter connects the external [KDP Toolkit](https://github.com/devanasolver/kdp-toolkit) print generator to BookNexa's shared KDP package contract. It invokes the installed upstream `kdp` CLI; it does **not** copy or vendor the upstream project. The upstream repository is MIT-licensed (Copyright © 2026 Anas Solver); the published package records that provenance. This wrapper is experimental and does not imply KDP acceptance or legal review of generated content.

## Requirements

- Python 3.10+
- KDP Toolkit installed in the active environment and its `kdp` command on `PATH` (`pip install git+https://github.com/devanasolver/kdp-toolkit`)
- Node dependencies installed in this BookNexa checkout (the adapter invokes the BookNexa preflight)
- A project folder with `manuscript.md` and `metadata.json`; start one with `kdp new ./mybook --title ... --author ...`

The adapter uses the KDP Toolkit's print interior/cover build and validation commands. Print specifications and cover geometry therefore follow that tool's selected trim, ink/paper, bleed, and final interior page count. Keep checking upstream specs against BookNexa's own engine before using the outputs commercially.

## Build and validate a package

From the BookNexa repository root:

```bash
python integrations/kdp-toolkit/adapter.py \
  --project ./mybook \
  --output ./output/mybook-kdp.zip \
  --trim 6x9 \
  --ink-paper bw-white
```

The adapter:

1. normalizes common metadata fields while preserving source metadata;
2. invokes `kdp interior` and checks its JSON preflight result;
3. gets the final page count from that validator, then generates and validates the matching full-wrap cover;
4. writes `metadata.json`, `booknexa-kdp.json`, `interior.pdf`, `cover.pdf`, and both validation reports into a ZIP using an atomic replace;
5. runs BookNexa's local package CLI in `--check` mode against that ZIP.

It does not upload project files to any service. It requires a local display only for browser handoff.

## Optional handoff to a selected Amazon account

Use a previously named local profile, or create one with `npm run kdp:accounts -- add "US imprint"`:

```bash
python integrations/kdp-toolkit/adapter.py \
  --project ./mybook \
  --output ./output/mybook-kdp.zip \
  --trim 6x9 \
  --handoff \
  --account "US imprint"
```

The package must pass both upstream validators and BookNexa's package preflight before KDP is opened. `--handoff` opens the visible browser using only that account's isolated local Chromium profile. The user signs in and handles Amazon prompts. This remains a browser handoff only: no form fill, upload, or publish action is automated.

## Tests

```bash
python -m unittest scripts/test-kdp-toolkit-adapter.py
```

These tests cover metadata normalization, manifest/provenance, and path safety without needing Amazon credentials or a live KDP account. A real package build requires KDP Toolkit installed; never use a real Amazon account as an automated test fixture.
