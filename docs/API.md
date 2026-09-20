# 本地 HTTP API

UI 与 API 由同一进程提供。默认 `http://127.0.0.1:4310`；当前演示实例的端口可能不同，启动日志为准。配置 `REQUESTDOCK_TOKEN` 后，下表中除 health / demo 外的 API 均需 `Authorization: Bearer <token>`。变更请求必须使用 `Content-Type: application/json`；跨域调用不支持。

| 方法与路径 | 输入 | 成功输出 |
|---|---|---|
| `GET /api/health` | 无 | `{ "ok": true }` |
| `GET /api/demo` | 无 | 固定合成数据 `{ "service": "RequestDock demo", "ok": true, "version": 1 }` |
| `GET /api/info` | 无 | 名称、版本、已加载插件的 name/version |
| `GET /api/collections` | 无 | `SavedCollection[]` |
| `POST /api/collections` | `Collection` | HTTP 201，`SavedCollection` |
| `PUT /api/collections/:id` | `Collection` | 更新后的 `SavedCollection` |
| `DELETE /api/collections/:id` | 无 | `{ "ok": true }` |
| `POST /api/import` | 原生 v1 或 Postman v2.1 对象 | `{ collection, warnings }`，只转换，不自动保存 |
| `POST /api/run` | 见下方 | `RunResult`，执行结果保存在历史中 |
| `GET /api/history` | 无 | 最新在前的 `RunResult[]`，最多 20 次且历史磁盘 JSON 不超过 64 MiB |
| `POST /api/compare` | `{ baseline, current, ignorePaths? }` | `{ equal, entries }` |

`POST /api/run` 输入：

```ts
{
  collection: Collection;
  variables?: Record<string, string>; // 本次运行覆盖，不写入集合
  requestId?: string; // 省略时顺序运行全部请求
}
```

准确的数据结构见 [共享类型](../src/shared/types.ts)，集合校验见 [schema](../src/core/schema.ts)。`SavedCollection` 是 `{ id, collection, updatedAt }`。集合保存采用完整替换，单用户工作区中后写入者覆盖前者，不提供多人并发编辑合并。可读 JSON 文件可供 Git 管理；不自动调用 Git 或提交文件。

断言或网络失败通过 `RunResult.passed = false` 表示，HTTP 200 不意味着测试通过。API 输入错误通常返回 HTTP 400 和 `{ error: string }`；鉴权失败 401，跨域或不可信 Host 403，未知记录 404，超限输入 413，Content-Type 错误 415，已有四次运行时 429。校验后才执行集合，不执行导入的 Postman 脚本。

JSON 请求体最大 4 MiB，含比较中的两份报告。较大的比较应使用 CLI。`ignorePaths` 相对于每个响应 JSON body，比较状态码和传输错误不受字段忽略影响。不要将此 API 暴露为公共 HTTP 代理：有访问权的调用者可以向服务进程可达的 HTTP(S) 地址发请求。
