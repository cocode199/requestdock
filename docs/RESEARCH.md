# 选型调研与决定

调研日：2026-09-20。技术栈：用户确认 TypeScript + React + Node.js。

## 方法与边界

四个维度等权，每项 1–5 分，高分更有利：社区需求、维护者活跃度、实现可行性（即实现难度的反向分）、差异化。需求参考现有开源替代的关注与使用场景；维护者活跃度参考其发布记录，不假装能观测闭源厂商内部开发。Stars 不是用户数量或付费意愿，近期发布也不保证维护质量。评分是工程判断，仍需要用户访谈验证。

可行性衡量本次可完成并验证的核心工作流，绝不表示完整复制原产品的难度。价格是页面抓取时的快照，地区、年付、用量与实验价可能影响实际价格。

| 候选 | 开源对照 | 需求 | 维护活跃度 | 可行性 | 差异化 | 总分 |
|---|---|---:|---:|---:|---:|---:|
| **Postman：HTTP 请求与回归测试** | Bruno | 5 | 5 | 5 | 3 | **18** |
| LaunchDarkly：功能开关 | Unleash | 4 | 5 | 4 | 3 | 16 |
| Typeform：表单与响应收集 | Formbricks | 4 | 4 | 4 | 3 | 15 |
| Linear：任务与看板 | Plane | 5 | 4 | 4 | 2 | 15 |
| Zapier：工作流自动化 | Activepieces | 5 | 5 | 2 | 3 | 15 |
| ngrok：HTTP 隧道 | frp | 4 | 4 | 3 | 3 | 14 |
| Retool：内部工具 | Appsmith | 4 | 5 | 2 | 3 | 14 |
| Notion：知识管理 | AppFlowy | 5 | 5 | 2 | 2 | 14 |
| Datadog：可观测性 | SigNoz | 5 | 5 | 1 | 2 | 13 |
| Calendly：预约排期 | Cal.diy | 4 | 2 | 3 | 3 | 12 |

详细价格、发布日期、许可证与官方来源见 [开发者工具调研](research-developer-tools.md) 和 [协作工具调研](research-productivity.md)。

## 选择 RequestDock

对准个人和小团队的「编辑请求 → 注入运行变量 → 检查响应 → 保存报告 → 比较回归 → 放入 CI」流程。HTTP 调试、CLI 运行、React UI、可信本地插件都适配选定技术栈，且可以完全用本地 fixture 验证，不依赖第三方 OAuth 或持续付费基础设施。

[Postman 官方价格](https://www.postman.com/pricing/) 当前包含免费方案，Solo 年付 $9/月，Team 年付 $19/用户/月。付费团队能力与产品控制权构成选择背景；不是所有 Postman 用户都需要迁移。

[Bruno](https://github.com/usebruno/bruno) 与 [Hoppscotch](https://github.com/hoppscotch/hoppscotch) 已经是成熟选择。Postman 免费版也已有 Native Git 与 Collection Runner。因此「本地」「Git」「CLI」「无账号」均不应宣传为独创。RequestDock 的假设是：以简单可审查 JSON、无任意脚本的声明式检查、同一执行引擎和响应差异，服务希望减少工具复杂度的用户。是否有足够独立价值需要真实使用验证。

## 本轮验收范围

- HTTP(S) 请求、变量、状态码/JSON/响应头/时间断言；超时与响应大小上限。
- JSON 文件持久化、CLI 非零失败退出码、Web 编辑/运行/历史/比较。
- 明确授权加载的本地插件；Postman v2.1 有限导入并报告不支持项。
- 自动化测试、CI、容器构建定义与部署文档。

协作权限、多租户、OAuth 向导、GraphQL 专用编辑器、WebSocket、云同步、完整 Postman 脚本兼容不在 MVP 内。名称尚未做商标或 npm 包名可用性核验；发布前需核验。

## 许可证策略

本项目代码原创，MIT 许可。不复制商业工具界面资产、品牌或代码。竞品仅用于研究；不将 AGPL 或商业许可代码重新标为 MIT。锁文件记录具体依赖，随发布生成依赖许可证清单，分发时保留依赖要求的声明。任何新增代码/图标/示例都须说明来源及许可。
