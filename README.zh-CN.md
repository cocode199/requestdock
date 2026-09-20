# RequestDock

**把 HTTP 请求、回归断言和响应差异放进同一个本地工作流。**

[English](README.md) · [快速开始](#快速开始) · [贡献指南](CONTRIBUTING.md) · [路线图](ROADMAP.md)

![RequestDock 展示本地演示接口的响应与断言结果](artifacts/screenshots/desktop-response.png)

RequestDock 是 TypeScript / React / Node.js 编写的开源 API 工作台：JSON 集合保存在自己控制的目录，CLI 和 Web UI 共享执行引擎，无需注册账号。适合个人和小团队把人工调试变成可重复的回归检查。

> A local API workbench with declarative checks, response comparisons, and one execution engine for the CLI and web UI.

当前是 **0.1 早期 MVP，面向单用户和小型集合**。源码公开于 [cocode199/requestdock](https://github.com/cocode199/requestdock)，尚未发布到 npm；`package.json` 保持 `private: true`，以下命令从源码运行。它覆盖 Postman 的 HTTP 调试与回归测试子集，不代表全平台兼容、团队协作平台或经过独立安全审计的生产服务。Bruno、Hoppscotch 等已有成熟方案；本地文件、CLI 和免账号都不是本项目首创。我们的重点是声明式断言与响应比较的简洁组合，仍需真实用户验证。选型依据见 [十个候选工具评分与选型](docs/RESEARCH.md)。

## 快速开始

需要 Node.js **22.12+**（建议 24）、npm 和 Git。以下命令同时适用于 **Windows PowerShell** 与 **macOS/Linux POSIX shell**。

```sh
git clone https://github.com/cocode199/requestdock.git
cd requestdock
npm ci
npm run build
npm start -- --port 4310
```

也可通过 GitHub 的 **Code → Download ZIP** 下载并解压，再在解压目录运行上述 npm 命令。

打开 <http://127.0.0.1:4310>，选中内置演示请求，点击 **Send request**。本地合成数据 API 不需要外部服务或 API key；成功时返回 `200`，断言通过。用 **Save collection** 保存编辑后的集合。Web UI 还提供历史比较与导入导出。

保持服务运行，在第二个终端体验 CLI：

```sh
npm run cli -- run examples/collection.json --output baseline.local.json
npm run cli -- run examples/collection.json --output current.local.json
npm run cli -- compare baseline.local.json current.local.json
```

预期两次运行均显示 `1/1 requests passed`，比较结果包含 `"equal": true`，退出码为 `0`。`.local.json` 文件名已被 Git 忽略。输出文件默认不覆盖，确需替换时给 `run` 加 `--force`。用 `npm run cli -- init collection.local.json` 创建自己的集合；若换用端口 4311 启动服务，运行示例时加 `--env baseUrl=http://127.0.0.1:4311`。

执行集合会发送真实 HTTP 请求。先检查导入集合的地址和方法，优先对测试环境运行。POST、PUT、PATCH、DELETE 等可能改变目标系统。

## MVP 功能

- HTTP 请求：方法、URL、headers、文本 body、超时、`{{variable}}` 变量替换。
- 声明式断言：状态码、JSON 字段、响应头、耗时，以及显式加载的本地断言插件。
- 本地 JSON 集合、Web 集合 CRUD、运行历史与响应差异比较。
- CLI 与 Web 使用相同核心引擎；机器可读 JSON 输出可接入现有 CI。
- 原生 RequestDock JSON 导入/导出；Postman Collection v2.1 的基础迁移支持 raw body、基础 URL / header 和变量，不支持的能力返回警告。
- Docker 自托管、跨平台 CI 和 Chromium 浏览器测试配置。

本版不含团队账户、RBAC、云同步、OAuth 流程、Postman JavaScript 脚本兼容、multipart / 文件上传、WebSocket / gRPC 或负载测试。导入不等于无损迁移，尤其不要忽略 auth、脚本等迁移警告。

## 集合格式

```json
{
  "version": 1,
  "name": "Local smoke checks",
  "variables": { "baseUrl": "http://127.0.0.1:4310" },
  "requests": [
    {
      "id": "demo",
      "name": "Demo endpoint",
      "method": "GET",
      "url": "{{baseUrl}}/api/demo",
      "headers": {},
      "timeoutMs": 5000,
      "assertions": [{ "type": "status", "expected": 200 }]
    }
  ]
}
```

这是 RequestDock 的格式，不是 Postman 的格式。完整类型见 [src/shared/types.ts](src/shared/types.ts)。

变量覆盖顺序是集合 `variables` → `--env-file` → `--env`；Web 的 Runtime variables 同样覆盖集合变量，且不保存进集合。变量支持 URL、header 值和 body，不会对 URL 自动编码；需要编码的值由调用方准备。未定义的变量会导致请求失败。

在 `assertions` 中添加需要的检查：

```json
[
  { "type": "status", "expected": 200 },
  { "type": "json", "path": "$.ok", "expected": true },
  { "type": "header", "name": "content-type", "expected": "application/json; charset=utf-8" },
  { "type": "time", "maxMs": 2000 }
]
```

JSON 检查按类型和结构相等；header 名不区分大小写，值按字符串精确相等。耗时包含请求和读取响应，不包含插件执行。集合按顺序执行，每集合最多 100 个请求、每请求最多 100 条断言；默认超时 10 秒、最大 60 秒，请求 body 最大 1 MiB、响应最大 2 MiB。单次运行的序列化报告预算为 16 MiB：若下一项结果超预算，将省略该项响应内容、明确标记运行失败，并将后续请求标记为未发送。重定向以 3xx 原始响应返回，不自动跟随。

Web 历史保留最新的一批运行，同时受**最多 20 条与磁盘报告文件总计 64 MiB**两个限制；达到任一上限会删除更早历史。重要基线请另行导出。上述数据预算不等于固定的进程内存上限。HTTP API 的 JSON 输入还受 4 MiB 限制，大报告比较请使用 CLI。

## CLI

```sh
# 生成示例集合
npm run cli -- init collection.local.json

# 运行时变量覆盖集合变量；env 文件是字符串值组成的 JSON 对象
npm run cli -- run collection.local.json --env-file local.env.json --env baseUrl=http://127.0.0.1:4310

# 保存结果；--json 输出机器可读结果
npm run --silent cli -- run collection.local.json --json --output run.local.json

# 比较两次运行；--ignore 可以重复指定
npm run cli -- compare baseline.local.json current.local.json --ignore timestamp --ignore meta.generatedAt

# 导入基础 Postman v2.1 集合，查看终端的迁移警告
npm run cli -- import postman.json --output imported.local.json

# 原生 RequestDock JSON 也可校验后重新导入
npm run cli -- import exported-collection.json --output restored.local.json

# 显式加载本地可信插件
npm run cli -- run collection.local.json --plugin ./examples/plugins/required-keys.mjs

# 指定本地数据目录
npm run cli -- serve --host 127.0.0.1 --port 4310 --data .requestdock
```

只加载插件不会自动添加断言。在请求的 assertions 中引用插件，例如 `{ "type": "plugin", "plugin": "required-keys", "options": { "keys": ["ok"] } }`；详见 [插件指南](docs/PLUGINS.md)。

成功时退出码为 `0`；请求/断言失败或响应比较发现差异时为 `1`；输入、文件、配置或启动错误为 `2`。未配置状态码断言时，HTTP 4xx/5xx 本身不会自动判为断言失败，请为关键请求显式添加断言。输出文件默认不覆盖已有文件，确需替换时给 `init` / `run` / `import` 加 `--force`。运行 `npm run cli -- --help` 或子命令的 `--help` 查看参数。

比较按请求 `id` 匹配，检查状态码、请求执行错误和响应 body；默认不比较运行时间戳、耗时、headers 或断言消息。`--ignore` 相对于每个 JSON 响应 body，例如 `timestamp`、`$.meta.generatedAt`、`items[0].id`；支持简单字段/索引路径，不支持通配符。非 JSON 响应按文本比较。`--silent` 避免 npm 在机器可读 JSON 前添加生命周期日志。

不要把真实秘密直接放进共享集合。保存的变量是明文；请求、响应及导出结果也可能含敏感数据。按名字启发式脱敏不能识别所有秘密。生产凭据应从受保护的运行时文件/变量注入，并在分享历史或日志前检查。命令行参数可能出现在 shell 历史和进程列表中。[安全边界](SECURITY.md)

## 开发与验证

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

开发后端：`npm run dev`；开发前端：另开终端运行 `npm run dev:ui`。生产单进程入口使用 `npm start`。测试结果以本地输出和实际 CI 运行为准；本仓库不放未经验证的通过率徽章。

修改打包流程时另运行 `npm run test:package`，在隔离临时目录构建并安装真实包归档进行验证；它不会发布 npm 包。

## 文档

- [实际验证结果与尚未验证事项](docs/VALIDATION.md)
- [HTTP API 参考](docs/API.md)
- [十个候选工具评分与选型](docs/RESEARCH.md)
- [第三方依赖许可声明](THIRD_PARTY_NOTICES.md)
- [架构与扩展边界](docs/ARCHITECTURE.md)
- [插件接口与可信代码约束](docs/PLUGINS.md)
- [Docker、数据备份与部署](docs/DEPLOYMENT.md)
- [贡献指南](CONTRIBUTING.md) · [路线图](ROADMAP.md)
- [贡献者、社区和可持续计划](docs/COMMUNITY.md)
- [维护者发布流程](docs/RELEASING.md)

贡献指南包含可复现、有验收条件的起步任务。参与前请阅读 [行为准则](CODE_OF_CONDUCT.md)，版本变化见 [变更记录](CHANGELOG.md)。欢迎中文或英文反馈；不买 star、不虚构使用案例、不批量提交低价值修改。

使用问题与想法放在 [Discussions](https://github.com/cocode199/requestdock/discussions)，可复现的问题放在 [Issues](https://github.com/cocode199/requestdock/issues)。安全漏洞请遵循私密报告流程，不在公开讨论中提供可利用细节。

采用 [MIT License](LICENSE)，分发时保留 [依赖许可声明](THIRD_PARTY_NOTICES.md)。运行 `npm run licenses` 可从已安装的锁定依赖重新生成声明。Postman、Bruno 等名称仅用于兼容性和比较说明；本项目与这些产品无隶属关系。
