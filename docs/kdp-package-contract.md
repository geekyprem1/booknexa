# Native package contract and fixture test

Every BookNexa publish-package ZIP now includes `booknexa-kdp.json` referencing its edition, metadata, manuscript, cover, and source adapter. External generator adapters should produce the same contract; see `docs/kdp-package.schema.json` and `docs/kdp-generator-adapters.md`.

The manifest is generated from the actual asset names rather than assumed by the local publisher. This gives the CLI an explicit, genre-independent mapping and provides source provenance for later external integrations.

Run the contract tests with:

```bash
npm run test:kdp-package
npm run test:kdp-adapters
```

The fixture is built in memory; no sample books or account data are required. Before integrating an external repository, keep it marked audit-required until code/license/runtime and output quality checks are complete.
