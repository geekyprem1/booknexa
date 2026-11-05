# Local KDP package and browser handoff

The local publisher accepts packages from BookNexa and compatible external generator adapters. This milestone provides ZIP preflight and a visible browser handoff; it does not inspect KDP pages, fill forms, upload assets, or publish.

## Run

```bash
npm run kdp:local -- --package ./path/to/publish-package.zip --format paperback --check
npm run kdp:local -- --package ./path/to/publish-package.zip --format paperback --open --account "US imprint"
npm run kdp:accounts -- add "UK publishing account"
npm run kdp:accounts -- list
```

Supported editions are `ebook`, `paperback`, and `hardcover`. `--check` is the default. `--open` opens `https://kdp.amazon.com/bookshelf` in a visible local Chromium session after package preflight.

### Multiple Amazon accounts

Use one local profile label for each Amazon KDP account (for example, `US imprint` and `UK publishing account`). `kdp:accounts add` creates an isolated Chromium profile; use the same label on each publishing run to reuse that account's signed-in session. List labels with `kdp:accounts list` or `kdp:local -- --list-accounts`.

Profiles live under `~/.booknexa-kdp-publisher/accounts/` (Windows uses the home directory equivalent). Labels and profile metadata are local. Amazon passwords/MFA are entered by the user in the visible browser; cookies remain inside the account-specific Chromium profile. Nothing is sent to BookNexa or stored in its database. Treat the profile directory as sensitive, do not copy it between accounts, and delete an account's profile directory manually when you want to sign out/remove that local session. The tool does not automate account switching within Amazon; each run opens the selected isolated profile.

Do not run `--open` in a server/container without a trusted desktop display. Amazon prompts, MFA, CAPTCHAs, and account challenges must be handled directly by the user.

## Shared package contract

The ZIP has a root `metadata.json`, one manuscript, one cover, and a `booknexa-kdp.json` manifest. The schema is in [`kdp-package.schema.json`](./kdp-package.schema.json). ZIPs may also include source-generator notes, previews, validation reports, and other files. The preflight does not extract package contents to disk.

Example manifest:

```json
{
  "schemaVersion": 1,
  "format": "paperback",
  "metadata": "metadata.json",
  "assets": { "manuscript": "interior.pdf", "cover": "cover.pdf" },
  "source": { "adapter": "booknexa-word-search", "version": "1.0.0", "license": "internal" },
  "validation": { "status": "passed", "validator": "BookNexa print preflight", "validatedAt": "2026-11-05T00:00:00Z" }
}
```

All paths are ZIP-relative. The reader rejects absolute/traversal paths, unsupported editions/extensions, missing assets, invalid metadata, and oversized archives. `metadata.json` must include non-empty `title`, `author`, and `description`; other metadata can be generator-specific. Use explicit manifest asset paths where naming differs. Extension checks are only an initial gate—not proof of visual quality or KDP acceptance.

## Generator adapters

See [`kdp-generator-adapters.md`](./kdp-generator-adapters.md) and the typed registry in `lib/kdp/adapters.ts`. The registry marks external repos as audit-required/reference-only; it does not claim they are integrated or execute their code. Each adapter must declare its supported genres/editions, source/version/license, dependencies and external services; normalize metadata/assets; and pass format-specific validation plus human sample review.

Integration order: keep native BookNexa generators working through the shared contract; audit KDP Toolkit for print preparation; audit KindlePub for EPUB; evaluate the coloring generator only after licensing and generation-service terms are checked. Editorial skills are checklist references, not generators. External code stays optional and isolated until reviewed.

## Safety and publishing boundary

- Never send Amazon credentials, cookies, or local account profiles to BookNexa.
- This milestone has no KDP form automation, upload operation, or publish action.
- Any later browser automation must keep Amazon challenges user-controlled, stop for preview review, and require explicit user confirmation before the final publish step.
- Live KDP accounts are never used in automated tests.
