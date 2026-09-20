# Release a reviewed source version

RequestDock releases currently distribute source code from this repository. There is no npm publishing workflow, registry credential, or automated image push. `private: true` in `package.json` intentionally prevents accidental npm publication; local `npm pack` archives can still be built, installed, and tested.

## Prepare a version

1. Keep changes on a pull request, with a focused description and any migration notes. Update the package version, lockfile, CLI/API version, and changelog together.
2. Inspect the files in the commit. Never include workspace data, tokens, private request collections, response history, or local environment files.
3. Run the checks below from a clean checkout with Node 24, then ensure the **same commit** has a green GitHub CI run. The CI matrix covers Node 22 and 24 on Linux and Windows, Chromium workflows, and the documented Docker Compose deployment.

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:package
```

The package check creates a real tarball, installs it in an independent temporary consumer, invokes its installed bin, runs HTTP assertions against a local fixture, and starts the packaged Web UI. It cleans up its temporary data and does not publish a package. The Docker job verifies token enforcement, non-root execution, a real request and assertion, collection writes, and history persistence after container recreation. Do not describe Docker as tested until that job passes. Release notes should link to the successful workflow run and state any remaining limits.

## Tag and publish on GitHub

After merging and reviewing the exact passing commit, create an annotated tag. For the first release:

```sh
git switch main
git pull --ff-only
git status --short
git rev-parse HEAD
git tag -a v0.1.0 -m "RequestDock v0.1.0"
git push origin v0.1.0
```

The working tree must be clean and `HEAD` must match the commit whose CI passed. Do not overwrite an existing release tag. If a published version needs a fix, release a new patch version.

In GitHub **Releases → Draft a new release**, select the existing tag and describe what works, how to start from source, the tested platforms, and the known limitations. Mark the first `v0.1.0` release as a **pre-release** and state that the collection/plugin interfaces may still change. Preview the description before publishing. GitHub provides source `.zip` and `.tar.gz` downloads for the tag; no custom build assets are needed for the initial release.

Do not label a release production-ready merely because CI is green. A test run does not cover every API, deployment, or plugin.

### Optional installable archive

An explicitly reviewed release may also attach the result of `npm pack` as a `.tgz` asset. Build it from the passing tagged commit, inspect the packed file list, and record a SHA-256 checksum. Users can install that downloaded archive with `npm install --global ./requestdock-0.1.0.tgz`; npm will resolve its runtime dependencies. A local archive does not register the package name on npm, and this project does not claim that `npm install --global requestdock` installs this repository. Do not upload workspace directories or hand-built archives containing local collections.

## Reproduce the released source build

Clone the repository linked in the release, then check out the tag:

```sh
git checkout --detach v0.1.0
git rev-parse HEAD
node --version
npm --version
npm ci
npm run check
npm start
```

Record the commit ID and exact Node/npm versions with the release notes. The committed lockfile fixes npm dependency versions and integrity hashes. CI action references use full commit SHAs, with readable version comments. Node major selectors and the Docker base tag receive updates over time: this is a repeatable source build, not a claim of byte-for-byte reproducible binaries across toolchain versions. For a deployment that needs an immutable container base, resolve and record the reviewed `node:24-alpine` image digest before building.

## Maintain the release process

Dependabot checks npm packages, GitHub Actions, and the Docker base each Monday. Compatible npm updates are grouped into runtime and development PRs; major upgrades remain separate. Review upstream notes and let CI complete before merging. Automated merging is not enabled.

Current action pins were checked against the official repositories:

- [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [actions/setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [actions/upload-artifact v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)

Keep these references current when upgrading pins. Future npm or container-registry publication should have a separately reviewed package name, ownership, provenance, and release workflow before enabling write permissions.
