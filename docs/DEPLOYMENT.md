# 运行、部署与备份

RequestDock 是单进程、单用户工作台。推荐本机运行，或在受保护的个人服务器中通过 SSH 隧道访问。当前没有公开托管地址、npm 包或预构建镜像；所有例子从此仓库构建。

## 从源码运行

Node.js 22.12+，推荐 24：

```sh
npm ci
npm run build
npm start -- --host 127.0.0.1 --port 4310 --data .requestdock
```

浏览器打开 <http://127.0.0.1:4310>。默认数据目录 `.requestdock`；也可配置 `REQUESTDOCK_DATA`，显式 `--data` 用于当前命令。

| 配置 | 用途 |
| --- | --- |
| `--host` | 默认 `127.0.0.1`；非 loopback 需要 token |
| `--port` | HTTP 端口，示例为 `4310` |
| `--data` / `REQUESTDOCK_DATA` | 集合与历史的数据目录 |
| `REQUESTDOCK_TOKEN` | API 访问 token；非 loopback 至少 24 个字符，配置后在 UI 中输入相同 token |
| `--plugin` | 显式加载可信本地 `.mjs` 插件，可重复 |

## Docker Compose

需要 Docker Engine / Desktop 和 Compose 插件。生成随机 token，保留当前终端的环境变量；不要把 token 写进 Git。

PowerShell：

```powershell
$env:REQUESTDOCK_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose up --build -d
docker compose ps
```

POSIX shell：

```sh
export REQUESTDOCK_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
docker compose up --build -d
docker compose ps
```

在浏览器中打开 <http://127.0.0.1:4310>，输入同一个 token。可在本地终端查看你设置的环境变量；避免把它复制进截图、日志或 issue。重新开终端后，继续管理 Compose 前需重新设置相同 token，或有意识地生成新 token 完成轮换。

Compose 只将宿主机 `127.0.0.1:4310` 映射到容器。容器内需要监听 `0.0.0.0`，所以必须配置 token。镜像采用 Node 24 多阶段构建，以 `node` 非 root 用户运行，数据写入命名卷 `/data`。Compose 限制 capability、设置只读根文件系统和健康检查；这些不能把不可信插件变成可信代码。

查看服务输出、停止服务：

```sh
docker compose logs --tail 100 requestdock
docker compose stop
```

不要为排错执行 `docker compose down -v`：`-v` 会删除数据卷。升级时先备份，再运行 `docker compose up --build -d`。生产固定已审查的依赖锁文件和基础镜像 digest，并通过依赖更新 PR 有意识地升级；仓库示例使用维护中的 Node 24 major 标签。

## 单独 Docker 命令

```sh
docker build -t requestdock:local .
docker volume create requestdock-data
docker run --name requestdock --rm -p 127.0.0.1:4310:4310 -e REQUESTDOCK_TOKEN -v requestdock-data:/data requestdock:local
```

`-e REQUESTDOCK_TOKEN` 使用终端中已设置的变量。访问其他宿主服务时，容器中的 `127.0.0.1` 指容器自身；根据平台设置明确的宿主地址，避免误连生产端点。

## 远程服务器

优先在服务器上继续使用 loopback 端口映射，再从自己的机器建立 SSH 转发：

```sh
ssh -L 4310:127.0.0.1:4310 your-server
```

`your-server` 是你配置的 SSH 主机，不是项目提供的托管服务。如需反向代理，配置 TLS、访问限制和同源 UI/API，保留正确的 Host / Origin 语义。不要通过删除 Origin 校验来解决代理错误。token 为工作台的完整访问凭据，禁止把本版作为公共多租户服务。

## 数据与恢复

数据包括集合和历史，可能含明文变量和敏感响应。文件系统访问权限和备份同样需要保护；没有内置加密或密钥轮换服务。Web 历史同时限制 20 次和 64 MiB，按时间倒序保留能放入预算的连续最新记录，保存时清理更早记录；重要基线应通过 CLI 报告单独保存。集合不自动过期，定期检查磁盘空间并制定保留策略。

Web API 的 JSON 请求体上限为 4 MiB；比较时两份完整报告也计入这个上限。较大报告可用本地 CLI `compare`。CLI/Web 单次序列化运行报告上限均为 16 MiB，超过时该响应正文不保留并明确失败，后续请求不再发送。历史磁盘 JSON 最大 64 MiB，解析与 UI 渲染还需要额外内存；本版不适合高吞吐日志或大文件测试。旧版本如果存在单个超过 64 MiB 的历史文件，升级启动会明确拒绝并保留该文件；停止服务后将它移出 runs 目录单独备份，再重启。

本地备份：停止服务，完整复制配置的数据目录到仅自己可访问的位置，再启动。恢复时停止服务，将备份恢复至同一目录，保持运行用户读写权限，然后读取集合并执行一个合成数据的 smoke check。不要同时运行两个进程写同一数据目录。

Docker 命名卷可以在停止服务后，用组织现有卷备份工具备份；也可使用容器复制生成一个普通备份目录：

```sh
docker compose stop
docker compose cp requestdock:/data ./requestdock-backup
docker compose start
```

在独立的测试部署验证备份能读取；不要把首次恢复演练放在唯一生产数据上。恢复文件后检查 owner / 权限，确保容器 UID 1000 的 `node` 用户可写。具体恢复工具取决于备份方案，禁止未经验证地覆盖唯一副本。

## 检查与故障诊断

`GET /api/health` 用于进程健康；它不证明目标 API 可达、数据备份有效或插件安全。健康检查和合成数据 `/api/demo` 不要求 token，其他工作台 API 在 token 启用时带上 `Authorization: Bearer <token>`。

- 启动拒绝非 loopback：设置 `REQUESTDOCK_TOKEN` 或改回 `127.0.0.1`。
- UI 返回 401：检查输入的 token 与运行环境一致。
- 返回 Origin 相关错误：检查 UI/API 是否同源、反向代理是否保留正确地址。
- 数据无法保存：检查数据目录权限、磁盘空间、是否误设只读卷。
- 请求失败：先查看目标、方法、超时及容器网络，再检查响应中的可读错误。

CI 已配置 Linux / Windows、Node 22 / 24、Chromium E2E 和 Docker build / health。配置存在不代表远程 CI 已运行；每次发布应保留实际执行记录。
