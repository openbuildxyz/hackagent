# HackAgent 评审重跑机制 Phase 1 最小改造方案

> 给 Codex 执行用。目标不是一次性重构整个评审系统，而是在现有 `analysis_queue(一项目一job)` 架构上，补齐“按范围/按模块重试”的产品语义，避免任何单点失败都只能全量重跑。

## 目标

把当前单一的“开始 AI 评审 / force 全量重跑”改成 4 种明确动作：

1. 首次评审：只跑未完成/待处理项目
2. 重试失败项：只跑 error 项
3. 补跑指定模块：先支持 Sonar，后续可扩展 Web3 / 指定模型
4. 全量重跑：显式高成本操作，二次确认

同时保持现有 worker 架构不推倒重来。

## 当前现状确认

### 当前链路

- 活动评审页 `app/(dashboard)/events/[id]/review/page.tsx`
  - `开始 AI 评审` 调 `/api/events/[eventId]/enqueue`
  - body 里传 `{ models, sonarEnabled, force: true }`
- enqueue API `app/api/events/[eventId]/enqueue/route.ts`
  - 当前 `force=true` 时会选中整个 event 的所有项目
  - 删除该 event 下现有 `analysis_queue`
  - 重插队列
  - 把 `projects.analysis_status` 批量改回 `pending`
- worker `worker.js`
  - 一次 claim 一个 queue job
  - 调 `/api/projects/[projectId]/review`
- 单项目评审 `app/api/projects/[projectId]/review/route.ts`
  - 串行/并行执行 GitHub 分析、LLM code analysis、Web3、Sonar、AI 多模型评分
  - 最后统一写回 `projects`

### 当前核心问题

1. 重跑入口语义混乱：
   - “开始评审”其实是“全量重跑”
2. 任何单个模块失败（Sonar / Web3 / 单模型）都只能重排全量 job
3. credits 粗粒度，无法只按 Sonar / Web3 补扣
4. `analysis_status` 只有一个总状态，前台无法准确表达“AI 完成但 Sonar 失败”
5. queue 只有项目级 job，没有模块级任务语义

## Phase 1 原则

不做这些：

- 不把 queue 直接重构成每模型/每模块一条 task
- 不大改 worker 并发模型
- 不一次性重构所有数据库表

只做这些：

- 给 enqueue 增加明确的执行模式
- 给 review API 增加“按模块执行”的能力
- 给前台增加明确按钮和成本提示
- 给项目状态增加“模块执行状态”快照
- 保持向后兼容

## 一、数据模型最小改动

### 1. projects 表新增模块状态字段

新增 migration，例如：`supabase/migrations/032_analysis_module_status.sql`

建议新增列：

- `analysis_modules jsonb default '{}'::jsonb`
- `analysis_last_run jsonb default '{}'::jsonb`

建议结构：

```json
{
  "github": { "status": "completed", "updated_at": "...", "error": null },
  "web3": { "status": "error", "updated_at": "...", "error": "..." },
  "sonar": { "status": "completed", "updated_at": "...", "error": null },
  "models": {
    "moonshot": { "status": "completed", "updated_at": "...", "error": null },
    "deepseek": { "status": "error", "updated_at": "...", "error": "..." }
  },
  "aggregate": { "status": "completed", "updated_at": "...", "error": null }
}
```

`analysis_last_run` 可记录最近一次触发参数：

```json
{
  "mode": "rerun_module",
  "module": "sonar",
  "models": ["moonshot", "deepseek"],
  "triggered_by": "user_id",
  "triggered_at": "..."
}
```

### 2. analysis_queue 表最小扩展

仍保留“一项目一job”，新增字段：

- `run_mode text default 'fresh'`
- `run_module text`
- `retry_scope text`
- `force_reset boolean default false`

建议枚举：

- `run_mode`
  - `fresh`
  - `retry_failed`
  - `rerun_module`
  - `rerun_all`
- `run_module`
  - `sonar`
  - `web3`
  - `models`
  - `all`

这样 worker 不需要大改任务模型，只要把这些参数透传给 `/review`。

## 二、后端 API 设计

### 1. 改造 `/api/events/[eventId]/enqueue`

文件：`app/api/events/[eventId]/enqueue/route.ts`

当前 body：

```ts
{ models?: string[]; sonarEnabled?: boolean; force?: boolean }
```

改成：

```ts
{
  models?: string[]
  sonarEnabled?: boolean
  mode?: 'fresh' | 'retry_failed' | 'rerun_module' | 'rerun_all'
  module?: 'sonar' | 'web3' | 'models' | 'all'
  targetProjectIds?: string[]
}
```

兼容旧逻辑：

- 如果传 `force: true`，自动映射成：
  - `mode='rerun_all'`
  - `module='all'`

#### 选择项目规则

**mode = fresh**
- 只选这些项目：
  - `analysis_status is null/pending/running/error`
  - 或模块缺失（如果 `module=sonar`，则 `sonar_analysis is null`）

**mode = retry_failed**
- 只选：
  - `analysis_status = error`
  - 或 `analysis_modules.<module>.status = error`
  - 或 queue 最近失败项

**mode = rerun_module**
- 不洗整个项目结果
- 只选需要补跑该模块的项目
- 例如 `module=sonar`：
  - `sonar_enabled = true`
  - `github_url` 非空
  - 且满足以下之一：
    - `sonar_analysis is null`
    - `analysis_modules.sonar.status = error`
    - 用户显式指定 `targetProjectIds`

**mode = rerun_all**
- 全量项目
- 高风险

#### enqueue 写入规则

当前代码会：

- 直接 `delete().eq('event_id', eventId)`

要改成：

- `fresh/retry_failed/rerun_module`：
  - 只删除目标项目中 `pending/running` 的旧 queue 行
  - 不删除整个 event 的历史 done/error 记录
- `rerun_all`：
  - 才允许清空该 event 的 queue（或至少清空目标项目 queue）

#### projects.analysis_status 重置规则

当前：

- 直接全部改 `pending`

改成：

- `fresh/retry_failed/rerun_module`：
  - 只更新目标项目
  - 并且只更新必要模块状态，不粗暴清空已有结果
- `rerun_all`：
  - 才可整体 reset `analysis_status`
  - 同时清理 `analysis_modules`

### 2. 改造 `/api/projects/[projectId]/review`

文件：`app/api/projects/[projectId]/review/route.ts`

当前 body：

```ts
{
  models?: string[]
  sonarEnabled?: boolean
}
```

改成：

```ts
{
  models?: string[]
  sonarEnabled?: boolean
  mode?: 'fresh' | 'retry_failed' | 'rerun_module' | 'rerun_all'
  module?: 'sonar' | 'web3' | 'models' | 'all'
}
```

#### 执行逻辑改造

把现有 review 逻辑拆成模块函数，但先不拆文件：

- `runGithubAnalysisIfNeeded()`
- `runWeb3AnalysisIfNeeded()`
- `runSonarAnalysisIfNeeded()`
- `runModelScoringIfNeeded()`
- `updateAggregateStatus()`

#### 核心规则

**module=sonar**
- 只跑 Sonar
- 不重算 AI scores
- 不覆盖 `reviewer_submissions`
- 不清空 `github_analysis` / `web3_analysis`
- 更新：
  - `sonar_analysis`
  - `analysis_modules.sonar`
  - `analysis_log`

**module=web3**
- 只跑 Web3
- 不重算 scores

**module=models**
- 只重跑 AI 模型评分
- 保留 sonar/web3 结果
- upsert 覆盖 `scores(project_id, model)`

**module=all / rerun_all**
- 才执行完整流水线

#### 分数持久化问题

当前 review API 里 `aiReviews` 写到 `reviewer_submissions`，但正式评分仍依赖 `scores` 表。

需要确认并统一：

- `AI-only` 结果最终展示依赖哪里
- 如果是 `scores` 表，则 Phase 1 必须保证“模块重跑 models”时只 upsert 对应 model 行
- `sonar` 补跑不能污染 `scores`

建议：

- review 路由内部对 AI 模型结果统一 upsert 到 `scores`
- `project.analysis_result.ai_reviews` 继续保留给调试/快照

### 3. worker 透传新参数

文件：`worker.js`

把 queue job 的这些字段透传给 review API：

```js
body: JSON.stringify({
  models: job.models?.length ? job.models : undefined,
  sonarEnabled: job.sonar_enabled,
  mode: job.run_mode,
  module: job.run_module,
})
```

### 4. 新增“仅预估成本”接口（可选但推荐）

新增：`POST /api/events/[eventId]/enqueue-estimate`

用途：
- 前台点击“重跑 Sonar”之前先看会影响多少项目、扣多少 credits

返回：

```json
{
  "projectCount": 17,
  "mode": "rerun_module",
  "module": "sonar",
  "estimatedCredits": 34
}
```

如果不想新开接口，也可以让 enqueue 支持 `dryRun: true`。

## 三、前台交互改造

文件：`app/(dashboard)/events/[id]/review/page.tsx`

### 1. 把按钮拆开

当前：
- 开始 AI 评审
- 重试失败项（done 状态下才出现）

改成：

#### 主按钮组

1. `开始评审`
   - mode=`fresh`
   - module=`all`
   - 文案：只处理未完成/待处理项目

2. `重试失败项`
   - mode=`retry_failed`
   - module=`all`
   - 文案：只重跑失败项目

3. `重跑 SonarQube`
   - mode=`rerun_module`
   - module=`sonar`
   - 文案：仅补跑代码质量分析，不重跑 AI 评分

4. `全量重跑`
   - mode=`rerun_all`
   - module=`all`
   - 二次确认
   - 明确提示：会重新消耗 AI + Sonar/Web3 成本

### 2. 文案必须精确

不要再用模糊文案“开始 AI 评审”覆盖所有情况。

建议：

- 开始评审：`开始评审（仅未完成项目）`
- 重试失败项：`重试失败项`
- 重跑 SonarQube：`补跑 SonarQube`
- 全量重跑：`全量重跑（重新计费）`

### 3. 成本提示

在评审配置卡片里增加：

- 本次影响项目数
- 本次预计 credits
- 本次执行范围说明

例如：

- 补跑 SonarQube：17 个项目，34 credits
- 重试失败项：3 个项目，12 credits
- 全量重跑：50 个项目，300 credits

### 4. 进度卡说明

当前进度卡只表达“评审进行中 / 完成”。

要补一行：

- 当前任务：全量评审 / 重试失败项 / 补跑 SonarQube

避免用户以为又在全量跑。

## 四、credits 规则（Phase 1 最小版）

当前 review API 是一次性按：

- `models.length + web3` 计费
- sonar 不在这里单独扣，前台也有估算逻辑不一致

Phase 1 目标不是完美计费系统，而是先做到“不乱扣”。

### 建议规则

#### fresh / retry_failed / rerun_all
- 维持现有规则，但补上 Sonar 成本统一口径

#### rerun_module=sonar
- 只收 Sonar 成本
- 不再按 AI 模型数收费

#### rerun_module=web3
- 只收 Web3 成本

#### rerun_module=models
- 只收所选模型成本

### 实现建议

把成本计算抽成一个共享函数，例如：

- `lib/analysis-cost.ts`

提供：

- `estimateAnalysisCost({ mode, module, models, sonarEnabled, web3Enabled, projectCount })`

前后端统一使用，避免现在详情页和评审页各算一套。

## 五、状态与验收口径

### 项目层状态

短期仍保留 `projects.analysis_status`，但规则改成：

- `completed`：所有必需模块完成
- `partial`：主 AI 完成，但某些启用模块失败/缺失
- `error`：主路径失败或失败率过高
- `running`
- `pending`

如果暂时不想改枚举，至少：

- `analysis_modules` 作为真实状态来源
- 前台展示优先读 `analysis_modules`

### 活动层状态

前台批量状态页要能区分：

- 全部完成
- 部分完成（例如 Sonar 缺失）
- 有失败项
- 正在进行中

## 六、实现步骤（建议给 Codex）

### Task 1：补 migration

文件：
- 新增 `supabase/migrations/032_analysis_module_status.sql`

内容：
- projects 加 `analysis_modules`
- projects 加 `analysis_last_run`
- analysis_queue 加 `run_mode/run_module/retry_scope/force_reset`
- 补默认值和索引

验证：
- 本地/远端 SQL 可执行
- 不破坏现有查询

### Task 2：抽成本计算

文件：
- 新增 `lib/analysis-cost.ts`
- 修改 `review/page.tsx`
- 修改 `EventDetailClient.tsx`
- 修改 enqueue/review route

目标：
- 所有地方统一用同一套 cost 计算

### Task 3：改 enqueue API 模式化

文件：
- `app/api/events/[eventId]/enqueue/route.ts`

目标：
- 支持 `mode/module`
- 去掉“非 rerun_all 就删整场 queue”的危险逻辑
- 只重排目标项目

### Task 4：改 worker 透传模式

文件：
- `worker.js`

目标：
- 把 mode/module 透传给 review API

### Task 5：改 review API 支持模块级执行

文件：
- `app/api/projects/[projectId]/review/route.ts`

目标：
- 支持只跑 sonar / web3 / models / all
- 不再任何重跑都洗全量结果
- 更新 `analysis_modules`

### Task 6：前台按钮改造

文件：
- `app/(dashboard)/events/[id]/review/page.tsx`

目标：
- 新增 4 种动作按钮
- 增加成本提示
- 增加二次确认
- 进度卡展示本次动作类型

### Task 7：补验证

至少验证：

1. 首次评审：只排未完成项目
2. 重试失败项：不影响已完成项目
3. 补跑 Sonar：
   - 不新增 AI scores 重复计算
   - 只更新 `sonar_analysis`
4. 全量重跑：仍可跑通
5. 页面成本提示和后端实际扣费一致
6. 现有 Zama 这类已启用 Sonar 的活动可以安全补跑 Sonar

## 七、验收标准

### 功能验收

- [ ] 前台存在独立的“补跑 SonarQube”入口
- [ ] 点击补跑 Sonar 不会重新跑 AI 模型评分
- [ ] 点击重试失败项不会影响成功项
- [ ] 点击全量重跑时有明确二次确认和重新计费提示
- [ ] 后端 API 支持 `mode/module`
- [ ] worker 能透传并执行对应模式

### 数据验收

- [ ] `analysis_queue` 不再因补跑单模块而删除整场历史 queue
- [ ] `projects.analysis_modules` 能反映 sonar/web3/models 的实际状态
- [ ] `scores` 不会因补跑 Sonar 被重复写脏
- [ ] `sonar_analysis` 可单独更新

### 体验验收

- [ ] 用户能清楚区分“开始评审 / 重试失败 / 补跑 Sonar / 全量重跑”
- [ ] credits 提示和实际扣费一致
- [ ] 活动状态不会再把“AI 完成但 Sonar 失败”误显示成全部完成

## 八、产品判断

这是一个必须做的真需求，不只是 Sonar 补丁。

原因：
- 后续任何新分析模块都可能独立失败
- 如果重跑语义不拆开，模块越多，成本浪费越大
- 运营需要精确补偿能力，不能每次都全量洗牌

## 九、Phase 2 方向（这次先不做）

后续长期正确架构：

- queue 原子化为 task-level（model/sonar/web3/aggregate）
- credits 账单明细化
- 聚合状态独立服务化
- 支持单项目/指定项目批量重跑

本次只交付 Phase 1 最小可上线版本。
