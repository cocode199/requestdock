# Roadmap

Priorities follow reproducible user needs and available maintenance time. This is not a delivery-date promise. RequestDock should make a small HTTP regression workflow reliable before adding more protocols or collaboration features.

## Current 0.1 preview

- JSON collections, variables, HTTP requests, and declarative checks.
- One execution engine shared by the CLI and web interface.
- Local collections/history, response comparisons, and ignored JSON paths.
- Basic Postman migration with warnings and trusted local assertion plugins.
- Type checking, core/HTTP/CLI/browser tests, CI configuration, and Docker packaging.

Availability is defined by the current implementation and validation records. This scope does not imply full Postman compatibility, a security audit, or a production support commitment.

## Next: prove the core workflow

Recruit 5–10 willing testers to migrate one collection they actually use. Fix data-loss risks, request-behavior differences, and confusing errors first. Each newly supported import field needs a synthetic fixture and a behavioral check.

**Evidence to seek:** at least three independent users continue using the workflow for two weeks and can explain what it helps them do. This is a target, not current traction. If the evidence is absent, narrow the project or contribute improvements upstream instead of adding promotional volume.

**Release gates:** Linux/Windows on Node 22/24, Chromium workflows, Docker health/runtime checks, clean installation from the lockfile, and reviewed licenses. Record actual results; do not substitute the presence of configuration for a passing run.

## Then: reduce migration and contribution costs

| Work | Acceptance criteria |
| --- | --- |
| Migration walkthrough | Synthetic before/after fixtures; supported fields and every warning explained |
| English technical guides | Plugin and deployment examples can be followed without translation or hidden prerequisites |
| Secrets handling | Explicit display/export behavior, tested redaction boundaries, no promise that heuristics detect all secrets |
| Plugin compatibility | Version policy, understandable failures, and contract tests before expanding the API |
| Keyboard accessibility | A complete edit/send/check/save workflow works without a pointer |
| Large reports | Documented budgets and understandable truncation/failure behavior; no unbounded history growth |

A new contributor should be able to install dependencies and run a focused test without undocumented setup. The [contribution guide](CONTRIBUTING.md) contains bounded starter tasks.

## Later: repeatable releases and shared maintenance

- Define collection-format migration, release notes, and rollback procedures.
- Keep dependency licenses reviewed and generate a software bill of materials when the release process supports it.
- Add JUnit reports only when a real CI integration needs them.
- Rehearse backup/restore and publishing using documented steps.
- Invite sustained contributors to review; add permissions gradually and record governance decisions.
- Publish the actual maintenance budget and capacity before promising support.

The desired outcome is at least two people who can release and recover the project. This is an objective, not a claim of current staffing.

## Outside the current commitment

Multi-tenant hosting, enterprise SSO/RBAC, cloud sync, OAuth management, uploads, Postman script execution, gRPC/WebSocket, distributed load testing, and plugin sandboxing need independent design. A feature enters the plan only when user evidence and maintenance capacity both support it.

## 中文摘要

先验证少量真实用户能持续完成 HTTP 回归流程，再扩展功能。近期重点为迁移样例、英文详细文档、秘密处理、键盘可访问性和资源预算；随后完善可复现发布、备份恢复和维护者交接。所有时间与用户数量都是计划目标，不是现有成绩；团队协作、多协议、脚本执行和公网多租户服务不在当前承诺内。
