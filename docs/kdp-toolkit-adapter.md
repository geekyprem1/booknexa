The KDP Toolkit print adapter is an experimental wrapper around the upstream CLI. It emits the v1 shared manifest, validates interior and cover through KDP Toolkit, then validates the resulting archive through BookNexa's `kdp:local --check`. It optionally opens the selected isolated local Amazon profile only after all checks pass. No code is vendored; upstream MIT attribution is recorded in package provenance.

See [`integrations/kdp-toolkit/README.md`](../integrations/kdp-toolkit/README.md) for setup, usage, test, scope, and known limitations.
