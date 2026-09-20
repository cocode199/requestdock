# 验证记录

## GitHub 首次发布候选：2026-09-21

发布候选的本地 `npm test` 已通过 **43/43** 测试；新增覆盖 Cookie 回显脱敏、16 MiB 报告预算及后续请求不发送、64 MiB 历史预算与读写竞态、重复 header 导入警告、存储故障不泄露本地路径。CLI 多子进程集成测试采用 60 秒总限时，每个子进程仍有独立超时，以适应 Windows 冷启动。响应耗时断言使用可控时钟验证 999 / 1000 / 1001 ms 三个边界，真实 HTTP 集成单独验证响应，避免把共享 CI 机器的速度当作功能要求。

`npm run test:package` 首轮已实际通过：创建 tgz、独立目录安装、安装后命令解析、真实 HTTP 成功与失败退出码、Web 页面和 JS/CSS/API 可用。该检查也纳入 CI，具体提交结果以 [GitHub Actions](https://github.com/cocode199/requestdock/actions/workflows/ci.yml) 为准。公开仓库、Discussions 与私密漏洞报告入口已创建；没有发布 npm 包。

下方是首次 MVP 的历史验证快照，保留其日期与当时未执行的边界，不能用作后来每个提交的通过证明。

## 首次 MVP：2026-09-20

日期：2026-09-20（Asia/Shanghai）。实际本地环境：Windows、Node.js 24.18.0、npm 11.16.0。以下是执行结果，不是未来 CI 的保证。

| 检查 | 实际结果 |
|---|---|
| 锁文件重新安装 `npm ci --prefer-offline --no-fund` | 通过，103 个包安装成功 |
| `npm run typecheck` | 前端、服务端 TypeScript 检查通过 |
| `npm test` | **32 / 32** 单元与集成测试通过 |
| `npm run build` | TypeScript 服务端与 Vite 生产 UI 构建通过 |
| `npm run test:e2e` | **5 / 5** 浏览器测试通过，12.6 秒 |
| 官方 npm registry 漏洞审计 | **0 个已知漏洞**；这不是安全无缺陷的证明 |
| `npm run licenses` | 从已安装的锁定依赖生成 5 个运行时依赖的完整许可文本 |
| 编译后的 CLI 实际演示 | 请求本地 demo API，5 项检查通过；报告见 `artifacts/demo-run.json` |
| 桌面 / 手机截图 | 人工检查 1440px 桌面和 390px 手机，无横向溢出或主要元素裁切 |
| 文档链接 / YAML | 本地链接可达；5 份配置 YAML 解析通过 |

浏览器测试使用本机 Chrome，而非声称已经测试 Linux 的 Playwright bundled Chromium。可复现命令（PowerShell）：

```powershell
npm ci
npm run check
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:REQUESTDOCK_E2E_PORT = '4321'
npm run test:e2e
```

测试覆盖真实本地 HTTP、变量替换、JSON/状态/header/time 断言、超时、响应上限、手动重定向、可信插件、秘密遮罩、差异与字段忽略、CLI 退出码、文件防覆盖、持久化、历史保留、鉴权、跨域与 Host 校验、迁移警告，以及 UI 保存重载、失败反馈、原生导入导出往返、非法 JSON 草稿恢复和手机布局。

复审新增的回归防护包括：成功空响应与传输失败不再错误判为相同；Authorization 裸凭据与敏感 query 值回显的遮罩；原生集合往返导入；文件夹变量迁移警告；最后一条请求的删除提示；保存中的编辑状态保护。

### 当时尚未实际执行

- **Docker 镜像构建与容器运行**：当前机器未提供 Docker 命令。已写 Dockerfile、Compose、CI 容器健康验证，未冒充本地构建成功。
- **远程 GitHub Actions**：已配置 Linux/Windows × Node 22/24、Chromium 与 Docker jobs；尚未推送或触发远程运行。
- **公开发布**：未创建远程仓库、发布 npm 包、注册商标或开通社区账号；项目保留 `private: true`。

当前产品边界是单用户、小型 API 调试与回归集合。大型报告的内存与 4 MiB API 输入限制、无沙箱插件和明文集合变量见 [部署说明](DEPLOYMENT.md) 与 [安全说明](../SECURITY.md)。
