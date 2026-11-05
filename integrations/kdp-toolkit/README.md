# KDP Toolkit adapter (experimental)

This wrapper invokes the separately installed upstream KDP Toolkit command line; it does not vendor its code. The upstream project is MIT-licensed; package manifests include its name, source URL, version, and license.

## Important scope

This is a **print-production adapter**, not a full book creation or market-research service. It requires a prepared project containing `manuscript.md` and `metadata.json`; it lays out that manuscript as an interior PDF, creates a matching generated cover wrap, validates both PDFs, packages them, and checks the package against BookNexa's KDP contract. It does not write or edit the manuscript, research niches/competitors/demand, or upload/publish.

BookNexa itself has separate niche research and native book-generation flows, but this external adapter does not automatically connect their research result to writing. For an end-to-end journey, those stages still need to be orchestrated and reviewed before passing an authored manuscript into this print adapter.

## Requirements

- Python 3.10+
- KDP Toolkit installed in the active environment and its `kdp` command on `PATH` (`pip install git+https://github.com/devanasolver/kdp-toolkit`)
- Node dependencies installed in this BookNexa checkout (the adapter invokes the BookNexa preflight)
- A project folder with `manuscript.md` and `metadata.json`; start one with `kdp new ./mybook --title ... --author ...`

## Build and validate a package

```bash
python integrations/kdp-toolkit/adapter.py \
  --project ./mybook \
  --output ./output/mybook-kdp.zip \
  --trim 6x9 \
  --ink-paper bw-white
```

The adapter builds and validates the interior, reads the final page count from its validation result, makes and validates a full-wrap cover, emits the shared BookNexa package manifest and validation reports, and runs BookNexa's local package checker. The output is not proof of editorial quality or KDP acceptance.

## Optional local browser handoff

Create a local profile first with `npm run kdp:accounts -- add "US imprint"`, then run the adapter with `--handoff --account "US imprint"`. It opens KDP in the chosen isolated local Chromium profile only after package checks pass. The user signs in and handles Amazon prompts. This tool does not fill forms, upload files, or publish.

## Test and smoke-test guide

Run `npm run test:kdp-integration` and `python -m py_compile integrations/kdp-toolkit/adapter.py`. For the real CLI and browser smoke-test sequence, acceptance checklist, and honest PR validation summary, see [`../../docs/kdp-toolkit-smoke-test.md`](../../docs/kdp-toolkit-smoke-test.md).
