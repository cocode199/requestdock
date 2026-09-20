# Contributing to RequestDock

Useful contributions start with a real HTTP debugging or regression problem. Documentation, translations, accessibility work, and minimal reproductions matter as much as code. English and Chinese are welcome in issues and pull requests.

Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [current scope](README.md#included-in-the-mvp) first. For vulnerabilities, use the private process in [SECURITY.md](SECURITY.md).

## Set up a development environment

Use Node.js 22.12 or later (24 recommended). After forking and cloning the repository, run from the repository directory:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

These commands work in PowerShell and POSIX shells. Linux may need Playwright's system dependencies: `npx playwright install --with-deps chromium`.

For development, run `npm run dev` for the backend and `npm run dev:ui` in a second terminal for the frontend. The production UI requires `npm run build`. The [README demo](README.md#quick-start) provides a synthetic local target.

| Area | Start here |
| --- | --- |
| Request validation and execution | `src/core/schema.ts`, `src/core/engine.ts`, `tests/core.test.ts` |
| Response comparisons | `src/core/diff.ts`, `src/core/paths.ts`, `tests/core.test.ts` |
| Importing collections | `src/importer.ts`, `tests/server.test.ts` |
| HTTP API and storage | `src/server.ts`, `src/store.ts`, `tests/server.test.ts` |
| CLI behavior and exit codes | `src/cli.ts`, `tests/cli.test.ts` |
| React interface | `src/ui/main.tsx`, `src/ui/styles.css`, `e2e/workbench.spec.ts` |
| Plugin contract | `src/core/plugins.ts`, `src/shared/types.ts`, `examples/plugins/required-keys.mjs` |

The detailed [architecture guide](docs/ARCHITECTURE.md) is currently in Chinese.

## Before changing code

For bugs, search existing issues and provide the version or commit, Node/OS/browser versions, reproduction steps, expected behavior, and actual behavior. Replace private domains, credentials, and response data with synthetic values.

For features, explain the user workflow and why the current behavior is insufficient. Discuss collection-format, API, plugin-interface, and security-boundary changes before a substantial implementation. A small, reproducible bug fix does not need a proposal document.

Create a branch in your fork, make one coherent change, and open a pull request with its motivation and validation. Keep unrelated formatting out of behavior changes. Do not submit real collections, credentials, workspace history, private screenshots, `node_modules`, or generated `dist` output.

## Starter tasks with acceptance criteria

These are proposed contributions, not claims of confirmed defects or assigned work. Check existing issues and mention your intended scope before starting a larger task.

### 1. Make one detailed guide available in English

**Reproduce the gap:** follow [the English README](README.md) to `docs/PLUGINS.md` or `docs/DEPLOYMENT.md`; the detailed guide is currently Chinese.

**Scope:** add an English counterpart for one guide, preserve the original, and link the two. Keep commands, security boundaries, and limitations aligned with the implementation.

**Acceptance:** every local link resolves; execute the local synthetic example; report which OS/shell you used and any commands not run. Do not claim Docker validation unless it was actually executed.

### 2. Add an executable migration example

**Reproduce the gap:** import a small Postman v2.1 collection containing a nested folder, collection variables, a raw JSON body, and an unsupported script. The current importer produces a RequestDock collection and warnings, but the repository has no complete before/after migration walkthrough.

**Scope:** add synthetic input/output fixtures and a short guide explaining supported fields and each warning. Start with `src/importer.ts` and the existing importer tests in `tests/server.test.ts`.

**Acceptance:** the documented command imports the fixture; output matches the documented request semantics; unsupported scripts are warned about and never executed. Run the imported collection against a local fixture API. No external accounts or production API calls are required.

### 3. Verify the keyboard-only request workflow

**Reproduce the gap:** launch the UI and use only the keyboard to edit a demo request, send it, read its checks, save it, and return to the collection list. Existing browser tests do not establish that this entire workflow works without a pointer.

**Scope:** record an actual blocker if found, then fix that blocker and add a focused Playwright regression test. Start with `src/ui/main.tsx` and `e2e/workbench.spec.ts`.

**Acceptance:** visible focus, accessible control names, no keyboard trap, and the full workflow succeeds without mouse actions. If no blocker is found, a concise reproducible accessibility report is useful; do not invent a bug.

Use `good first issue` only when the task is small, reproduced or clearly specified, has acceptance criteria, and a maintainer can support it.

## Validation and review

- Run `npm run check` for code changes. Run `npm run test:e2e` for changed browser behavior after building.
- Use local HTTP fixtures for request/CLI tests. Check actual status codes, exit codes, persistence, and error behavior.
- Add regression coverage for behavior fixes; do not add tests that merely restate an implementation.
- Check keyboard behavior and visible error feedback for UI changes.
- Preserve versioned collection compatibility or explain migration and failure behavior.
- Reassess redirects, body limits, Origin/Host checks, secrets, and filesystem paths when touching those boundaries. Plugins are not sandboxed.
- State the exact commands you ran. Mark a skipped check as **not run** with its reason.
- Run `npm run test:package` after packaging changes to check an actual archive installed in an isolated temporary directory; this does not publish to npm.

Documentation-only changes need link and example review, not unrelated new tests. Maintainers may ask for a smaller scope or decline changes they cannot maintain. Feedback should discuss observable behavior and constraints, not the contributor.

Maintainers should follow the [release procedure](docs/RELEASING.md) and link the actual CI run when publishing a preview.

## Dependencies and licensing

Contributions are distributed under the existing [MIT license](LICENSE). Only contribute work you are entitled to share. Retain attribution and licenses for third-party code, images, and assets; do not copy closed-source product code or restricted materials. A source-available license is not automatically an open-source license.

For each new dependency, explain its purpose, license, maintenance status, and why existing code is insufficient. Update the lockfile and applicable [third-party notices](THIRD_PARTY_NOTICES.md). No purchased stars, fabricated users, automated promotional issues, or bulk low-value pull requests.

## 中文说明

欢迎用中文或英文提交 issue/PR。先提供真实工作流与脱敏最小复现，再讨论改动；一份 PR 解决一个清晰问题，说明实际运行的验证命令。文档、翻译、无障碍和问题复现都计入贡献。上面的起步任务各有复现方法与验收标准，属于候选工作，不虚构已确认缺陷。安全问题使用 [私密报告流程](SECURITY.md)，不要公开凭据或可利用细节。
