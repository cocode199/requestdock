# 生产力工具候选调研

调研日期：2026-09-20。技术栈假设：TypeScript、React、Node.js。该表为十项候选中的五项；项目最后选择由总评估决定。

评分顺序：社区需求 / 开源维护生态 / MVP 可行性 / 差异化，均为 1–5，5 最有利。评分属于工程判断，不是市场统计。Stars、forks 为页面显示的近似值，是关注度代理指标，不能等同真实用户或付费需求。维护分评价对应开源生态，不评价闭源厂商的内部开发速度。

| 候选 | 已核实的收费门槛 | 对照生态和维护证据 | 评分 |
| --- | --- | --- | --- |
| Zapier | Professional 从 $19.99/月、Team 从 $69/月起；免费 100 tasks/月，多步骤与 Webhooks 为付费功能。[官方定价](https://zapier.com/pricing) | [Activepieces](https://github.com/activepieces/activepieces) 显示 24.6k stars、4.2k forks，社区版 MIT，企业功能另用商业许可。[发布记录](https://github.com/activepieces/activepieces/releases) 显示 0.91.0 于 9 月 14 日发布，另有连续热修复。 | 5 / 5 / 2 / 3 |
| Typeform | Basic 100 响应/月、Plus 1,000、Business 10,000。[定价页](https://www.typeform.com/pricing) 同时出现不同实验价格，因此不记作唯一报价；[帮助中心](https://help.typeform.com/hc/en-us/articles/360032972852-Free-plan) 确认正在实验定价。 | [Formbricks](https://github.com/formbricks/formbricks) 显示 13.0k stars、2.5k forks，核心 AGPLv3、企业目录另行许可。[发布记录](https://github.com/formbricks/formbricks/releases) 的 5.4.3 显示 9 月 17 日，6.0 候选版本同期维护。README 表示外部代码贡献目前仅例外接受。 | 4 / 4 / 4 / 3 |
| Linear | 年付 Basic $10/用户/月、Business $16/用户/月；免费 250 issues、2 teams。[官方定价](https://linear.app/pricing) | [Plane](https://github.com/makeplane/plane) 明确定位 Linear 等工具的替代，显示 59.7k stars、5.8k forks、AGPLv3。[v1.4.2](https://github.com/makeplane/plane/releases/tag/v1.4.2) 发布于 2026-08-23T14:39:21Z，时间由 GitHub API 核实。 | 5 / 4 / 4 / 2 |
| Notion | 页面显示 Plus $10/成员/月、Business $20/成员/月，权限、连接与 AI 能力分档。[官方定价](https://www.notion.com/pricing) | [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) 显示 76.9k stars、6.0k forks、AGPLv3。[发布记录](https://github.com/AppFlowy-IO/AppFlowy/releases) 的 v0.14.4 明确标注 2026-09-19，月内多次发布。 | 5 / 5 / 2 / 2 |
| Calendly | 年付展示 Standard $10/席位/月、Teams $16/席位/月；免费仅 1 event type、1 calendar connection；Enterprise 从 $15k/年起。[官方定价](https://calendly.com/pricing) | 原 calcom/cal.com 已重定向 [calcom/cal.diy](https://github.com/calcom/cal.diy)，显示 48.6k stars、15.2k forks，含历史积累，不能当作新社区版独立增长。MIT 社区版移除了企业功能，README 建议个人非生产用途。[v6.2.0](https://github.com/calcom/cal.diy/releases/tag/v6.2.0) 发布于 2026-03-01T23:49:01Z，由 GitHub API 核实。 | 4 / 2 / 3 / 3 |

## TS / React / Node 实现判断

下列难度与机会是研究后的工程推断。

- **Zapier**：OAuth、凭证保管、持久队列、幂等重试和连接器维护成本高。可聚焦本地 webhook → 转换 → HTTP 流程，用 Git 审查 JSON 配置与 CLI，但通用平台的范围容易失控。
- **Typeform**：可实现表单 schema、校验、条件显隐、发布链接、响应存储和 CSV 导出。难点为无障碍、垃圾提交、逻辑规则与发布版本兼容。机会是开发者表单、CLI 发布、完整导出和简单自托管；五项中最适合一次完整 MVP。
- **Linear**：CRUD、看板、过滤和评论可控；权限、通知、同步、历史和 Git 集成难度较高。可做仓库 issue 文件 + CLI + Web 看板，但必须证明优于 GitHub Issues、Plane 的具体工作流。
- **Notion**：难点为嵌套块、关系数据库、协作冲突、权限和导入保真。Markdown 知识库可行，但比用户对完整 Notion 替代品的预期窄很多。
- **Calendly**：难点是夏令时、时区、重复规则、并发预约、防冲突和第三方日历同步。可做小团队预约、ICS 导出与插件日历接口；缺乏外部日历冲突检查时必须明确限制。

## 许可证与证据边界

以上是产品需求与公开行为研究，不复制对照项目代码。若复用具体代码，应检查文件及依赖许可证；不能把 AGPL 核心或商业目录放入 MIT 项目。报价证明了收费门槛，不额外宣称厂商完全没有公开任何代码。除明确给出年份的 release，GitHub 文本抓取仅显示月日，保留其原始展示，避免把推测年份当作核实结果。
