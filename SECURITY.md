# Security policy

RequestDock is a **single-user local workbench**, not a public proxy or multi-tenant service. It sends requests using the network access of its Node.js process, including reachable internal services. A person with the access token has full workbench access; the token is not a user authorization system.

## Reporting a vulnerability

Private vulnerability reporting is enabled for [cocode199/requestdock](https://github.com/cocode199/requestdock). Use [Report a vulnerability](https://github.com/cocode199/requestdock/security/advisories/new), also available under **Security → Report a vulnerability**. Do not post exploitable details, credentials, private request/response data, or personal information in a public issue.

A useful report includes:

- The affected version or commit and Node/OS/deployment details.
- A minimal reproduction using synthetic data.
- The access an attacker needs and the expected impact.
- Any proposed mitigation or patch, if available.

If GitHub's private reporting entry is unavailable, use an already verified private channel to the repository owner; do not assume an unlisted email address exists or fall back to publishing exploitable details. No staffed response-time or fix-time SLA is promised.

## Supported scope

The latest `0.x` development line is the current maintenance target. Older previews have no separate backport commitment. Review the [changelog](CHANGELOG.md) and actual release notes for fixes. No independent penetration test or third-party security certification has been completed.

## Deployment boundary

- The default bind address is `127.0.0.1`. Binding outside loopback requires a `REQUESTDOCK_TOKEN` of at least 24 characters, including inside Docker. Generate a long random token.
- Remote use needs a trusted network, access restrictions, and TLS. A shared token does not provide per-user permissions or tenant isolation.
- Browser requests receive Origin/Host checks. These reduce cross-site abuse and are not network isolation or general SSRF protection.
- Health checks and the fixed synthetic demo do not require a token; they do not expose workspace data.
- Run as an unprivileged user with limited file/network/container permissions. Do not mount the Docker socket, SSH directory, or cloud credentials.
- Keep Node.js and dependencies updated. See the [deployment guide](docs/DEPLOYMENT.md) (Chinese).

## Requests and sensitive data

An imported collection is not a trusted destination list. Review its methods, URLs, headers, and bodies before execution; requests may change remote system state.

Collection variables are stored in plaintext. URLs, response bodies/headers, history, and output files may contain credentials or personal data. Redaction uses heuristics and known values; it cannot identify every secret and is not encryption. Inject sensitive values through protected runtime variable files and inspect reports before sharing. CLI arguments can appear in shell history and process listings.

Restrict workspace and backup permissions. Use synthetic fixtures in public bug reports. Do not run multiple processes against one workspace directory.

Individual responses are limited to 2 MiB. Serialized run reports have a 16 MiB budget; exceeding it omits that response content, fails the run, and prevents remaining requests from being sent. Web history retains the newest reports within both 20 files and 64 MiB of report-file bytes. These limits bound retained data, not every source of process memory or work performed by a trusted plugin. The API rejects JSON input over 4 MiB.

## Trusted local plugins

Only load local `.mjs` plugins you wrote or reviewed. They run inside the Node.js process with the same filesystem, environment, and network permissions. **There is no sandbox**; even a plugin that never completes can block execution. Collection imports cannot authorize installing or loading arbitrary plugins.

Treat plugin code as application code during review. See the [plugin guide](docs/PLUGINS.md) (Chinese).

## 中文说明

本版是单用户本地工作台，可代表进程访问内网，不能作为公开代理或多租户服务。默认绑定 loopback，非 loopback 需要至少 24 字符的随机 token；远程还需可信网络与 TLS。token 持有者拥有工作台全部访问权，Origin/Host 检查不等于通用 SSRF 防护。

变量明文保存，历史、URL 与响应可能含敏感数据；启发式脱敏无法识别全部秘密。插件与 Node.js 进程同权限，没有沙箱。导入集合后应先检查目标和方法，分享报告前人工复核。

仓库已启用 [私密漏洞报告](https://github.com/cocode199/requestdock/security/advisories/new)。在仓库 **Security → Report a vulnerability** 提交版本、脱敏最小复现、攻击前提与影响；若 GitHub 入口暂不可用，仅使用已核实的私密联系方式，不要把可利用细节或真实秘密放进公开 issue。当前仅以最新 `0.x` 开发线为维护目标，不承诺无人员保障的响应时限。
