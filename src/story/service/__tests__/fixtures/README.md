# Import test fixtures

Real Egon.io export files spanning every on-disk format this library must read.
Used by the import-compatibility, normalizer, and round-trip specs.

- **Source:** [`wps/egon.io`](https://github.com/wps/egon.io) at commit `6b5dd60`,
  `src/app/tools/import/services/test-files/`.
- **License:** GPL-3.0 — identical to this repository, so redistribution here is
  compatible. Kept verbatim so the specs assert against exactly what Egon.io
  writes.

| File | Shape | `domain`/`dst` payload |
| --- | --- | --- |
| `dst_export_version_1_0_0` … `1_5_0` | legacy `{ domain, dst }` | JSON **strings** (the crash this fixes) |
| `dst_export_version_2_2_0` | legacy `{ domain, dst }` | JSON objects |
| `egn_export_version_4_0_0` | new `{ iconSet, domainStory }` | — |
