---
name: mcp-projects
description: Operate authorized Projects execution records and versioned project/team/personal planning through typed business tools.
---

# Projects business operations

Use this skill with the tools currently advertised by the authenticated Projects connection. A project is a business record, not a source repository. Never use shell, SQL, host files or administrative maintenance access for business work. Reading or opening a panel does not approve a plan.

Read authorized projects with `projects_list`, `projects_read` and `projects_find_references`. Legacy execution writes use `projects_create`, `projects_update`, `projects_set_work_item` and `projects_set_reference`. Read the current project revision first; use its exact revision and one stable intent key. A planning marker does not complete an execution item. References retain their source app's authorization.

## Planning sequence and authority

1. `projects_read_planning` reads current branches, explicit capabilities, immutable proposals and history. No records are created by reading. There is one project main, exactly four team mains and only actual personal branches.
2. `projects_set_planning_roles` requires the current business-space owner/admin and effective project-scoped `manage_planning_roles`. Enter actual enabled account IDs with current project read access. Assign/revoke only the stated bounded mappings. Global platform administrator status and free-text project owner labels are not business decision roles.
3. `projects_adopt_plan` explicitly adopts a complete initial project/team plan. It needs `update`, `accept_plan` and the exact target decision role. An external OAuth grant must separately include acceptance. Missing roles leave the baseline unadopted; never create or infer approvals.
4. `projects_create_personal_branch` reuses the authenticated member's `(project, team, user)` branch. `projects_save_plan` applies typed PRD/item operations; it cannot edit another personal branch or replace an entire record. Unqualified new item IDs are prefixed by the source team; use readback IDs thereafter.
5. `projects_compare_plan` shows captured/current/proposed values. `projects_sync_plan` preserves independent changes and requires an explicit reasoned choice for each conflict. Team-to-project candidates preserve project prose and promote only selected qualified contributions; inspect each operation and its dependencies.
6. `projects_submit_proposal` freezes the exact source/target versions, selected changes, purpose, impact and source evidence. Personal proposals target their team only. Upward proposals require an accepted team source. A null evidence revision means unversioned; do not claim a verified original or read its private content without source authorization.
7. `projects_decide_proposal` requires current `update`, separately delegated `accept_plan` and the designated target role. Supply the exact proposal/source/target revisions and an actual reason. Stale review or conflicts cannot be bypassed. `projects_withdraw_proposal` withdraws only your own submission; immutable rejected/withdrawn/superseded decisions remain available for successor proposals.
8. `projects_read_plan_history` paginates authorized evidence; `projects_read_plan_version` reads the exact saved snapshot. `projects_restore_plan` creates a new owned draft from a historical version; compare, submit and decide normally. Never rewind accepted history or imply real-world work was undone.

Every mutation uses a stable idempotency key for the same intent. On timeout, mark the result uncertain. Use `projects_read_planning_receipt` with that key, then read the exact returned version or current proposal through the ordinary authorized read. Retry only the identical request/key if needed. A new payload requires a new reviewed intent. HTTP success, a tool response, a receipt or an outbox event alone is not independent content readback.

## 简体中文

仅使用当前已授权连接公布的类型化工具。Projects 是业务记录应用，不是源码仓库；业务操作不得调用 shell、SQL、宿主文件或维护权限。打开、阅读或轮询不代表批准。

先读取当前项目及计划版本。角色分配须有当前业务空间 owner／admin 身份和项目范围 `manage_planning_roles`，接收者必须是已启用且可读项目的认证账号。平台管理员身份及自由文本 owner 均不产生业务接受权。初始采纳和接受另需 `update`、明确委托的 `accept_plan` 及确切目标角色；缺少角色时保持未采纳。

按项目／团队／本人复用个人分支，用限定字段与条目操作维护 PRD 和路线图。比较三方值；同步时逐项记录冲突取舍和原因。个人提案只进入所属团队，团队向项目仅提升选定贡献，保留团队限定 ID、项目正文和无关上下文。提交固定来源／目标版本、目的、影响及真实依据；空来源版本明确标为未版本化。拒绝、撤回、替代和后继提案均保留原历史。恢复旧计划产生新的个人草稿，仍须普通提案及目标决策，不能倒退既有历史或执行事实。

每个意图使用稳定幂等键。超时先标为不确定，通过该键回读收据，再读取确切版本或提案；仅在需要时完全相同地重试。收据和工具响应不能代替独立内容回读。来源链接不扩大其他应用权限；不虚构成员、承诺、决策、协作成效或实际资源预留。

### 操作对应

| 工具 | 用途与边界 |
| --- | --- |
| `projects_list` | 只列出当前空间内获准的项目摘要。 |
| `projects_read` | 读取确切项目及当前版本、工作项和引用，写前先读。 |
| `projects_find_references` | 按规范 Knowledge 地址查找获准反向引用，不复制知识正文。 |
| `projects_create` | 用稳定幂等键创建一个获准项目编号，不创建源码仓库或服务。 |
| `projects_update` | 按当前项目版本更新允许的摘要字段，不整份替换记录。 |
| `projects_set_work_item` | 按稳定编号更新完整的类型化工作项，检查依赖、日期及验收。 |
| `projects_set_reference` | 维护一个类型化来源引用，保留来源应用权限。 |
| `projects_read_planning` | 读取获准计划、本人分支、当前能力、提案及历史，不初始化记录。 |
| `projects_read_plan_history` | 分页读取获准不可变决策和版本依据。 |
| `projects_read_plan_version` | 回读确切计划快照，个人草稿仍受本人边界限制。 |
| `projects_read_planning_receipt` | 仅回读当前用户、客户端及委托的确切意图收据，再读取实际版本。 |
| `projects_set_planning_roles` | 当前业务空间 owner／admin 加项目范围管理权，分配或撤销经核验账号的角色。 |
| `projects_create_personal_branch` | 由已认证团队成员创建或复用本人持续分支，不接受自填 owner。 |
| `projects_save_plan` | 以当前分支版本保存有界字段及条目操作，不改他人草稿或任意 JSON 路径。 |
| `projects_compare_plan` | 展示基线、当前、拟议值及影响，向上仅选择确切贡献。 |
| `projects_sync_plan` | 固定版本刷新父级上下文，逐项说明冲突取舍，保留团队自身语义。 |
| `projects_adopt_plan` | 指定目标角色加更新／显式接受权，明确采纳完整初始基线。 |
| `projects_submit_proposal` | 固定来源、目标、变更、目的、影响及依据；个人不绕过团队，向上仅用已接受团队版本。 |
| `projects_decide_proposal` | 指定目标决策者按确切版本和理由接受或拒绝；过期版本不写新基线。 |
| `projects_withdraw_proposal` | 本人撤回自己的当前提案，不改变基线，原记录继续保留。 |
| `projects_restore_plan` | 把历史版本恢复为新个人草稿，走普通比较／提案／接受，不倒退执行事实。 |
