# Changelog

This file records user-visible changes. Release tags and their linked CI runs are the source of truth for what has actually shipped. The initial preview entry is prepared with its release candidate; publication is confirmed by the corresponding GitHub release.

## 0.1.0 — Initial preview

### Added

- Local JSON collections, request variables, and bounded HTTP requests.
- Declarative status, JSON, header, and response-time checks.
- Shared execution engine for the CLI and React web workbench.
- Saved run reports and response comparisons with ignored JSON paths.
- Native collection import/export and basic Postman v2.1 import with warnings.
- Explicitly loaded trusted local assertion plugins.
- Local workspace history, loopback defaults, and token requirements for non-loopback binding.
- Unit/integration and browser tests, cross-platform CI configuration, Dockerfile, and Compose.
- English and Chinese READMEs, contribution tasks, security policy, and community guidelines.
- A 16 MiB serialized run-report budget, explicit failure/skip results when reached, and web history bounded by both 20 reports and 64 MiB of stored files.
- Cookie-value redaction in echoed responses and explicit warnings for repeated Postman headers.
- A package file allowlist and isolated installation smoke check for a real package archive; no npm publication.

### Scope and compatibility

This early preview is for one trusted user and small HTTP regression collections. It does not execute Postman scripts, sandbox plugins, isolate multiple users, or provide full Postman compatibility. The npm package has not been published.

See [README.md](README.md) for behavior and limits, [SECURITY.md](SECURITY.md) for trust boundaries, and [VALIDATION.md](docs/VALIDATION.md) for dated verification evidence. Configuring CI or Docker does not by itself establish that those checks have passed.
