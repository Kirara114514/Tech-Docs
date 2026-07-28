# ASMP：Agent自维护规范

## 摘要

ASMP（Agent Self-Maintenance Profile）是一套面向 Agent 框架的自维护规范，目标是让 Agent 具备长期可靠的自维护闭环。ASMP 分为两层：

- **ASMP Core**（抽象能力层）：定义自维护系统在抽象层面需要具备的六项核心能力——可版本化的维护对象、事件/incident 存储、定时或事件触发机制、逻辑隔离的提议者与评测者、确定性策略门、可回滚发布机制。这一层不绑定任何具体实现技术。
- **ASMP Reference Profile**（参考实现层）：给出一种基于 Skill、子 Agent 和 Heartbeat 的具体实现方案。维护对象由 Skill 承载，角色隔离由子 Agent 实现，周期触发由 Heartbeat 驱动，状态存储由目录文件系统承载。

ASMP 不绑定任何单一框架，只要求框架具备 ASMP Core 定义的六项抽象能力。Reference Profile 中的 Skill、子 Agent、Heartbeat 是一种经过验证的参考实现路径，但不是唯一路径。本文完整定义了 ASMP Core 抽象规范、Reference Profile 实现方案、事件模型、三层自维护循环、Patch 决策表、验证门控体系（含不可变 holdout 集和 canary 测试）、回滚机制、Security Auditor 与 Security Gate 的职责分离、Library 级治理策略、MetaSkill 层设计以及自动化等级，可作为 Agent 框架接入自维护能力的参考。

## 正文

### 背景

ASMP 的核心目标：让 Agent 不再只是"会调用 skill"，而是能长期维护自己的 skill 体系：

- **执行时**：轻量读取 skill
- **出错时**：记录结构化证据
- **心跳时**：聚类、诊断、蒸馏
- **维护时**：有界修改 skill
- **验证时**：防止退化、过拟合、shadowing 和安全风险。验证层包含不可变 holdout 集和 canary 测试，确保评测不会被维护过程逆向拟合
- **长期**：让 skill 库持续进化

一句话定义：

> ASMP 是一套基于可版本化维护对象、隔离角色和周期触发的自维护闭环，用于让 Agent 在真实执行中积累经验，并将经验安全地蒸馏为可复用、可验证、可迁移的 skill 资产。

这套规范吸收了以下几类研究思路（[研究证据]）：

- **Agent Skills 的渐进式披露**（Anthropic, 2025）：skill 入口只放执行期必要信息，长材料和脚本按需加载
- **SkillOpt 的有界编辑 + 验证门控**（Microsoft, 2026-05）：将 skill 文档视为可训练的外部状态，通过验证门控和拒绝编辑缓冲确保修改质量，不更新模型权重即可实现跨模型、跨 harness 的性能提升
- **CoEvoSkills 的协同进化验证**（Anthropic, 2026）：skill 与 verifier 协同进化，verifier 对进化具有抵抗力，防止评测被逆向拟合
- **SkillHone 的持久化决策历史**（2026）：未来 Agent 需要知道"为什么这么改"，不能只看到最终文件
- **SkillEvolver 的 skill learning as meta-skill**：维护 skill 的能力本身也应是一个 skill
- **Skill-MAS 的 MetaSkill 愿景**：高阶编排能力本身也可以被沉淀成可进化 skill
- **More Skills, Worse Agents?**（2025）：skill 库变大后，主要风险不是上下文变长，而是选错 skill（skill shadowing）

截至 2026 年 7 月，Agent 自维护领域正在快速形成研究共识。SkillOpt、CoEvoSkills、SAGE、AutoSkill、SkillRL、MemRL 等方案各自从不同角度探索了 skill 自动化演进的路径。ASMP 在这些研究的基础上，补充了一套完整的工程治理框架——从事件记录、阈值门控、角色隔离到安全审计和可回滚发布。

### 核心内容

#### ASMP Core：抽象能力层

ASMP Core 定义了自维护系统在抽象层面必须具备的六项核心能力。任何 Agent 框架只要实现了这些能力，就可以声称支持 ASMP 的自维护模型——无论底层用什么技术（Skill/directory files、database objects、或自定义存储格式）。

##### 1. 可版本化的维护对象

自维护的最小操作单元必须是可版本化的。每次修改产生一个可追溯的版本，包含：

- 修改前后的内容差异
- 修改原因
- 触发修改的证据引用
- 修改时间与操作者标识

这确保维护行为不是黑箱操作。审计者可以回溯任何一次修改的完整决策链。

##### 2. 事件与 Incident 存储

所有维护行为必须从结构化事件开始。事件存储是自维护的证据基础，至少包含：

- 事件类型（使用、失败、成功案例、评估结果、维护修改）
- 时间戳
- 关联的维护对象
- 严重程度与影响范围
- 根因分类

事件存储是提议者（Proposer）做出修改决策的唯一合法信息来源。没有事件支撑的修改不应进入维护流程。

##### 3. 定时或事件触发机制

自维护不能仅依赖人工触发。系统必须支持至少一种自动触发方式：

- 定时触发（cron 风格）
- 事件计数触发（如某维护对象累计 N 条 incident）
- 使用频率触发
- 风险等级触发

触发机制本身不直接修改维护对象——它只负责唤醒维护流程，将控制权交给隔离的维护角色。

##### 4. 逻辑隔离的提议者与评测者

这是 ASMP 最核心的设计约束：提议修改的角色和评测修改的角色必须是逻辑隔离的。

- **提议者（Proposer）**：读取事件存储和当前维护对象，生成修改提案。它不应同时担任评测者。
- **评测者（Evaluator）**：在隔离的上下文中验证提案。它不应看到提议者的原始推理过程，只应看到修改前后的维护对象和独立的测试用例。

隔离防止了自我合理化——提议者不能"自己评自己改的东西"。这种隔离在 ASMP Reference Profile 中通过子 Agent 实现，但抽象层只要求逻辑隔离，不要求具体隔离技术。

##### 5. 确定性策略门

某些安全决策不能交给模型判断。确定性策略门是代码级硬规则，在提案进入评测之前就拦截高风险操作：

- 是否涉及权限扩大？
- 是否涉及文件删除/覆盖？
- 是否涉及网络访问新增？
- 是否涉及凭证读取？
- 是否修改安全相关维护对象？
- 是否修改路由/调度规则？

策略门不替代人工审批——它的职责是：**在高风险提案到达评测者之前，先执行一次快速的、零模型的确定性检查**。未通过策略门的提案直接标记为 `rejected_by_gate`，进入人工审批队列。

##### 6. 可回滚发布机制

每次维护修改都必须支持回滚。回滚机制包含：

- 修改前的完整快照
- 回滚触发条件（如验证失败、用户报告退化、shadowing 检出）
- 回滚操作步骤
- 回滚后的验证流程

回滚不应删除修改记录——即使回滚了，修改历史仍然保留在 changelog 中，标注为 `rolled_back`。

#### ASMP Reference Profile：参考实现

ASMP Reference Profile 是 ASMP Core 的一种具体实现方案。它基于三个具体技术构件：

##### 维护对象由 Skill 实现

Skill 是长期能力载体。它可以是：

- SKILL.md
- manifest + instructions
- command spec
- tool profile
- workflow package
- prompt + reference + scripts

ASMP Reference Profile 推荐每个 Skill 使用以下逻辑结构来承载 Core 要求的版本化维护对象：

```
<skill-name>/
├── <entry-file>              # 执行入口
├── reference/                # 按需读取的长文档
├── scripts/                  # 自动化脚本或工具
└── meta/                     # 维护期上下文（对应 Core 的事件存储）
    ├── incidents.md          # 失败、误触发、用户纠正
    ├── cases.md              # 成功案例、复杂案例
    ├── changelog.md          # 每次维护修改记录
    ├── backlog.md            # 证据不足的待观察项
    ├── eval.md               # 回归测试、触发测试、质量检查
    ├── metrics.md            # 使用次数、成功率、误触发率
    ├── shadowing.md          # 与其他 skill 的边界冲突
    └── design_notes.md       # 设计理由和历史决策
```

##### 隔离角色由子 Agent 实现

子 Agent 用来做上下文隔离和角色分离（对应 Core 的逻辑隔离要求）。Reference Profile 推荐以下角色分工：

- **Execution Agent**：执行用户任务，记录事件
- **Maintenance Agent**：读取事件存储，生成维护提案
- **Evaluator Agent**：独立验证提案，不接触事件原文
- **Librarian Agent**：治理 skill 库边界和触发范围
- **Security Auditor**：审计安全风险，提供结构化风险标签
- **Meta-Architect Agent**：维护多 Agent 编排策略

其中 Maintenance Agent 和 Evaluator Agent 的隔离直接实现了 Core 的"提议者与评测者逻辑隔离"要求。

##### 周期触发由 Heartbeat 实现

Heartbeat 是定期触发器（对应 Core 的定时触发机制）。它负责让"以后维护"真的发生。

Heartbeat 可以是：

- 每次任务结束后的 after-run hook
- 每小时/每天/每周 cron
- 每 N 次 skill 使用后的计数触发
- 每 N 条 incident 后的阈值触发
- 用户显式要求维护时的手动触发

##### 状态存储由目录文件实现

meta/ 目录下的文件承载 Core 要求的事件存储和版本历史。incidents.md、cases.md、changelog.md、eval.md 等文件共同构成维护决策的证据链。

如果框架不支持文件系统，也可以映射成数据库对象：

```
entry-file      -> skill.main_instruction
reference/      -> skill.references[]
scripts/        -> skill.actions[]
meta/incidents  -> skill.events[type=incident]
meta/changelog  -> skill.revisions[]
meta/eval       -> skill.tests[]
```

重点不是文件名，而是**执行上下文和维护上下文必须分离**。

#### 总体架构

ASMP 的核心架构如下：

```
User Task
   ↓
Skill Router
   ↓
Execution Agent
   ↓
Skill Runtime
   ↓
Execution Result
   ↓
After-Run Self Check
   ↓
Skill Event / Incident / Case
   ↓
meta/（事件存储）
   ↓
Heartbeat（定时触发）
   ↓
skill-maintainer（提议者）
   ↓
Diagnosis / Patch Proposal / Security Gate（确定性策略门）
   ↓
Evaluator Agent（评测者，隔离上下文）
   ↓
Validation（含 holdout / canary）
   ↓
Bounded Skill Update
   ↓
Changelog / Eval / Backlog / Rollback Snapshot
```

对应到角色：

- **执行层**：把任务做好
- **记录层**：留下可蒸馏证据
- **策略门层**：确定性安全检查，在高风险提案进入评测前拦截
- **维护层**：把证据变成更好的 skill
- **验证层**：防止维护引入退化。包含不可变 holdout 集（维护 Agent 无法访问的私有测试）和 canary 测试（检测评测集泄漏）
- **治理层**：维护整个 skill 库的边界、安全和规模
- **元技能层**：沉淀更高阶的任务拆解和多 Agent 编排策略

#### Skill 包标准结构

（同 ASMP Reference Profile 中定义的目录结构，此处不再重复。）

#### Skill 入口文件规范

每个 skill 的入口文件只放执行期必需内容。

推荐结构：

```markdown
# <skill-name>

## Description
这个 skill 负责什么。同时说明在什么场景下使用、什么场景下不使用、与相近 skill 如何区分。

## Inputs
需要哪些输入、文件、权限、上下文。

## Outputs
应该产出什么，格式是什么。

## Core Workflow
1. ...
2. ...
3. ...

## Reference Routing
- 如果需要复杂流程，读取 `reference/workflows.md`
- 如果遇到边界情况，读取 `reference/edge_cases.md`
- 如果需要模板，读取 `reference/templates.md`

## Scripts
- `scripts/x.py`: 用途、输入、输出、副作用

## Quality Checklist
- [ ] ...
- [ ] ...

## Failure Handling
如果本 skill 触发错误、指引不足、输出不符、执行失败、用户纠正、或发现与其他 skill 冲突：
1. 先完成或修复当前用户任务。
2. 追加结构化 incident 到 `meta/incidents.md`。
3. 不要现场把临时经验直接写入入口文件。
4. 等待 `skill-maintainer` 在维护期蒸馏。
```

**Description 的撰写规范：** Description 应同时回答四个问题：这个 Skill 做什么、何时使用、何时不用、与相近 Skill 如何区分。不设立独立的 trigger 字段——触发条件直接内嵌在 description 中。[规范要求] 这是遵循 Agent Skills 开放规范（agentskills/agentskills）的 design principle：Discovery 阶段只加载 `name` 和 `description`，匹配 description 后才加载完整入口文件。

示例：

```
---
name: record-note
description: >
  创建轻量日常记录。当用户希望快速保存当前想法、备忘或待办，
  且没有要求讨论、正式文档整理或已有记录查询时使用。
  查询已有记录应使用 record-search；正式归档应使用 document-archive。
---
```

**禁止**把这些东西塞进入口文件：

- 原始 incident
- 长篇案例
- 历史日志
- 未验证猜想
- 大段领域知识
- 维护过程碎片
- 与其他 skill 重复的通用规则

#### 事件模型：所有维护都从事件开始

ASMP 的最小事件类型有 5 种：

- **SkillUseEvent**：skill 被使用
- **SkillIncident**：skill 相关失败
- **SkillCase**：成功或复杂案例
- **SkillEvalResult**：评估结果
- **SkillPatchEvent**：维护修改记录

##### SkillUseEvent

每次 skill 被调用都可以记录轻量事件：

```yaml
event_type: skill_use
time: 2026-06-30T12:00:00+09:00
skill: unity-shader-helper
task_summary: "修复 URP Shader 编译错误"
trigger_reason: "用户请求 shader 编译问题"
selected_by: router | agent | user
confidence: 0.82
other_candidate_skills:
  - unity-debug-helper
  - graphics-pipeline-helper
result: success | partial | failed
notes: "可选"
```

##### SkillIncident

遇到错误、遗漏、误触发、用户纠正时记录：

```yaml
event_type: incident
time: 2026-06-30T12:05:00+09:00
status: new
skill: unity-shader-helper
task_summary: "修复 URP Shader 编译错误"
what_went_wrong: "skill 没有提醒检查 Render Pipeline include 路径"
user_correction: "用户指出应该先检查 URP 版本和 package 路径"
correct_approach: "先确认 URP 版本，再匹配 include 路径"
root_cause:
  category: missing_context
  detail: "入口文件缺少 URP 版本检查步骤"
decision_trace:
  - "读取 skill trigger，判断属于 shader 编译问题"
  - "直接修改 include，没有先确认 URP 版本"
  - "用户纠正后确认版本差异"
impact:
  blocked: false
  severity: medium
suggested_target:
  - entry_file
  - eval
related_skills:
  - unity-debug-helper
urgency: medium
```

##### SkillCase

成功案例也要记录，否则维护 agent 只能从失败中学习：

```yaml
event_type: case
time: 2026-06-30T13:00:00+09:00
skill: unity-shader-helper
case_type: success | complex | edge
task_summary: "批量迁移 Built-in Shader 到 URP"
execution_path:
  - "确认 Unity 版本"
  - "确认 URP 版本"
  - "检查 include 路径"
  - "替换 LightMode tags"
what_worked:
  - "reference/workflows.md 的迁移步骤有效"
key_decisions:
  - "遇到多 Pass Shader 时先保留 fallback pass"
takeaways:
  - "多 Pass 迁移应进入 edge_cases"
```

#### 三层自维护循环

ASMP 分三层循环。

##### 即时循环：After-Run 自检

每次任务结束前，Execution Agent 做一次轻量自检：

- 本次是否使用了 skill？
- skill 是否触发正确？
- 是否有更合适的 skill 被遗漏？
- 入口文件是否足够指导执行？
- 是否读错 reference？
- 是否缺少脚本？
- 用户是否纠正了我？
- 是否发生返工？
- 是否有值得记录的成功路径？

如果有问题：

1. 先交付用户任务
2. 再记录 incident
3. 不现场重构 skill

如果是成功复杂案例：

1. 记录 case
2. 等待后续蒸馏

##### 短周期循环：Heartbeat Triage

Heartbeat 定期运行：

- 扫描所有 new incident
- 更新 metrics
- 聚类相似问题
- 标记 high urgency
- 检测重复 root cause
- 把明显重复问题加入 maintenance queue

输出：

- 需要维护的 skill 列表
- 高风险 incident 列表
- 疑似 shadowing 列表
- 建议下次维护范围

##### 维护循环：Distillation Pass

当满足维护条件时，启动 "skill-maintainer" 子 Agent：

1. 读取目标 skill 入口文件
2. 读取 reference/、scripts/
3. 读取 meta/incidents、cases、eval、backlog、changelog
4. 聚类失败模式
5. 对比成功/失败决策轨迹
6. 生成 patch proposal
7. 通过 Security Gate 确定性检查
8. 运行验证门控（含 holdout 集和 canary 测试）
9. 应用有界修改
10. 保存回滚快照
11. 更新 changelog、incident status、eval、backlog

#### Heartbeat 调度策略

Heartbeat 是 ASMP 的关键，因为它让维护从"偶尔想起来"变成系统行为。

以下调度层级是 ASMP Reference Profile 的推荐划分，各层级的触发频率和阈值可根据实际环境调整（参考值见"示例配置"章节）。

##### H0：每次任务结束

- **触发**：每次 Agent 完成任务
- **动作**：
  - skill 使用自检
  - 必要时记录 incident/case
  - 更新 usage count

##### H1：每日轻量巡检

- **触发**：每天一次
- **动作**：
  - 扫描 new incident
  - 聚类相似 incident
  - 标记 high urgency
  - 更新 meta/metrics.md
  - 不做大规模修改

##### H2：定期维护

- **触发**：按固定周期，或某 skill 累计一定数量相似 incident
- **动作**：
  - 调用 skill-maintainer
  - 输出维护报告
  - 做有界 patch
  - 更新 changelog
  - 更新 eval

##### H3：定期治理

- **触发**：按固定周期，或 skill 数量超过阈值
- **动作**：
  - 检查 skill shadowing
  - 合并重叠 skill
  - 拆分过大 skill
  - 废弃过时 skill
  - 检查安全风险
  - 整理 design_notes

##### H4：MetaSkill 进化

- **触发**：多 Agent 工作流反复失败，或复杂任务需要自动编排
- **动作**：
  - 分析任务拆解失败
  - 分析子 Agent 角色设计失败
  - 分析 workflow orchestration 失败
  - 更新 meta-architect skill

H4 对应 Skill-MAS 的愿景：不只维护具体 task skill，还维护"如何构造多 Agent 系统"的高阶能力。

#### Patch 决策表

维护 Agent 不应该把所有经验都写进入口文件。

使用这个决策表：

| 发现的问题 | 处理位置 |
|-----------|---------|
| 短、总是需要、执行前必须知道 | skill 入口文件 |
| 长流程、低频规则、边界情况 | reference/ |
| 重复、机械、可验证步骤 | scripts/ |
| 证据不足，但可能有价值 | meta/backlog.md |
| 可测试的退化风险 | meta/eval.md |
| 设计原因、取舍历史 | meta/design_notes.md |
| 原始事故和纠正 | meta/incidents.md |
| 与其他 skill 边界冲突 | meta/shadowing.md + skill 库治理 |
| 多 Agent 编排失败 | meta-architect 或 orchestration-skill |

#### 验证门控

每个 patch 通过验证后才能落地。

##### 结构验证

- 入口文件是否存在
- Description 是否存在（含触发场景和排除场景）
- Failure Handling 是否存在
- 有 reference/ 时是否有 Reference Routing
- 有 scripts/ 时是否说明输入输出副作用
- changelog 是否更新

##### 冷上下文验证

用一个干净子 Agent 只读取：

- skill 入口文件
- 必要 reference
- 必要 scripts

**不读取：**

- incident 原文
- 原始对话
- 维护报告

检查它能不能正确执行样例任务。

##### 回归验证与不可变 Holdout 集

从 `meta/eval.md` 选测试用例。eval.md 中的用例分为两类：

- **公开测试集**：维护 Agent 可读取，用于常规回归验证
- **不可变 holdout 集**：维护 Agent 无法访问的私有测试用例。holdout 集由 Evaluator Agent 独立持有，用于检测维护 Agent 是否在逆向拟合评测集（对应 CoEvoSkills 中"verifier 对进化具有抵抗力"的设计原则）

典型测试类型：

- 典型正例
- 典型反例
- 边界案例
- 过去失败案例
- shadowing 模糊案例

检查：

- 修复了什么
- 有没有破坏原来成功的情况
- 有没有引入新歧义

##### Canary 测试

Canary 测试是一种评测集泄漏检测机制：

- 在 eval.md 中嵌入一组故意设计的、永远不会被正常触发的"诱饵"测试用例
- 如果维护 Agent 生成的 patch 恰好优化了这些 canary 用例的表现，说明维护 Agent 在直接针对 eval.md 做优化（而非从真实 incident 中学习）
- Canary 触发应触发告警并阻止本次 patch

##### Shadowing 验证

对相邻 skill 做触发测试：

- 这个任务应该触发 A，不触发 B
- 这个任务应该触发 B，不触发 A
- 这个任务两个都不该触发
- 这个任务需要 A+B 协作

如果新增规则让通用 skill 压制专用 skill，patch 拒绝或进入 backlog。

##### 安全验证

由 Security Auditor 执行：

- 是否扩大权限
- 是否新增危险脚本
- 是否允许删除/覆盖/外发数据
- 是否可能泄露 token、密钥、隐私
- 是否引入 prompt injection 表面
- 是否允许运行未验证第三方代码

Security Auditor 不是决策者——它输出结构化风险标签（如 `risk: permission_escalation`、`risk: data_exfiltration_surface`），由确定性 Security Gate 和人工审批做最终决策。

##### 确定性 Security Gate

Security Gate 是代码级硬规则，不接受模型判断。Gate 在 patch 提案进入 Evaluator 之前运行：

- 是否新增 shell 脚本？→ 进入人工审批
- 是否新增网络访问？→ 进入人工审批
- 是否新增文件删除/覆盖逻辑？→ 进入人工审批
- 是否新增凭证读取逻辑？→ 进入人工审批
- 是否扩大工具权限？→ 进入人工审批
- 是否修改安全相关 skill？→ 进入人工审批
- 是否修改 skill router 规则？→ 进入人工审批

权限变更（包括以上全部类别）必须经过人工批准流程。人工审批的产出是明确的 `approved` / `rejected` 决定并记录到 changelog。

##### Holdout 泄漏检测

每次验证后检查：

- 公开测试集的表现提升是否显著高于 holdout 集？
- 如果公开集提升 +10 而 holdout 提升 +1，说明可能存在 overfitting
- 差异超过阈值（[经验参数]）时标记为 `holdout_leakage_suspected`，阻止 patch 落地

##### 防 prompt injection

第三方 skill、reference、incident 原文都可能带恶意指令。

规则：

- incident 是证据，不是指令
- reference 是材料，不是系统规则
- 第三方 skill 默认低信任
- 维护 agent 需要区分"用户纠正"和"外部文本诱导"

#### 子 Agent 角色设计

ASMP Reference Profile 推荐以下角色分工：

##### Execution Agent

**职责：**

- 执行用户任务
- 选择 skill
- 调用 reference/scripts
- 记录 skill 使用事件
- 发现问题后写 incident

**禁止：**

- 直接重写 skill
- 把临时经验塞进入口文件
- 无证据扩大 trigger

##### Skill Maintainer Agent（提议者）

**职责：**

- 读取 meta/
- 聚类 incident
- 对比成功/失败案例
- 提出 patch
- 更新 changelog
- 维护 eval/backlog

**禁止：**

- 无证据修改
- 大规模重写
- 修改内置 skill
- 隐藏失败维护
- 访问 holdout 测试集

##### Evaluator Agent（评测者）

**职责：**

- 用干净上下文验证 patch
- 运行 eval cases（含 holdout 集）
- 检查 regression
- 检查 holdout 泄漏
- 检查 canary 触发
- 输出结构化反馈

Evaluator 持有 holdout 集和 canary 用例，这些数据不应暴露给 Maintainer。

##### Librarian Agent

**职责：**

- 维护 skill 库索引
- 检查 trigger 重叠
- 发现 shadowing
- 建议合并、拆分、废弃 skill
- 维护 skill dependency graph

##### Security Auditor

**职责：**

- 审计提案中的权限变更
- 检查危险脚本
- 检查 prompt injection 表面
- 检查供应链风险
- 检查第三方 skill
- 输出结构化风险标签（不直接阻止 patch——阻止由 Security Gate 执行）

Security Auditor 是一个辅助分析角色。它生成风险标签和建议，但不做最终安全决策。最终决策在 Security Gate（确定性规则）和人工审批（权限变更）层完成。

##### Meta-Architect Agent

**职责：**

- 维护多 Agent 编排 skill
- 总结任务拆解经验
- 总结角色设计经验
- 总结 workflow topology 经验

这对应 Skill-MAS 的 MetaSkill 层：维护"如何搭 Agent 团队"的能力，而不只是维护单个执行 skill。

#### "skill-maintainer" 设计

"skill-maintainer" 是 ASMP 的核心 skill。

推荐入口文件：

```markdown
# skill-maintainer

## Description
Maintains, audits, evolves, and governs custom skills from structured execution evidence.
Use when: user asks to maintain/migrate/improve/audit/evolve skills; skill has repeated/high-urgency
incidents; trigger overlap or shadowing suspected; skill becomes too long/stale/unsafe/ambiguous;
heartbeat invokes periodic maintenance. Do not use for: creating new skills from scratch (use
skill-creator); modifying built-in or third-party skills.

## Inputs
- skill library path
- target skill path
- framework skill specification
- skill entry files
- reference/
- scripts/
- meta/incidents.md
- meta/cases.md
- meta/backlog.md
- meta/eval.md (public test set only — holdout set is Evaluator-only)
- meta/changelog.md
- meta/metrics.md

## Outputs
- maintenance report
- patch proposals
- updated skill files after Security Gate + Validation Gates pass
- rollback snapshot
- updated changelog
- updated incident statuses
- updated eval/backlog/shadowing notes

## Core Workflow
1. Identify framework skill rules.
2. Identify custom skills and skip built-in skills.
3. Read target skill entry file.
4. Read relevant reference/scripts.
5. Read maintenance meta (public test set only).
6. Cluster incidents by root cause.
7. Compare success and failure decision traces.
8. Decide target location for each improvement.
9. Generate bounded patch proposals.
10. Submit patches through Security Gate (deterministic check).
11. If gate rejects → escalate to human approval.
12. Evaluator Agent runs validation (cold context, regression, holdout, canary, shadowing, security audit).
13. If validation fails or holdout leakage detected → reject patch.
14. Apply accepted patches.
15. Save rollback snapshot.
16. Update changelog, incident statuses, eval, backlog.
17. Report changes and risks.

## Patch Policy
- Do not overfit single low-impact incidents.
- Prefer small patches.
- Keep entry file lightweight.
- Put long guidance into reference/.
- Put mechanical checks into scripts/.
- Put uncertainty into backlog.
- Put regression cases into eval.
- Check shadowing before changing trigger.
- Check security before adding scripts or permissions.
- Never access holdout test set.

## Failure Handling
If maintenance is uncertain or fails:
1. Record a maintainer incident.
2. Do not hide failed maintenance.
3. Prefer backlog over bad abstraction.
4. Ask for user confirmation when risk is high.
```

#### Library 级治理

当 skill 数量增加，ASMP 进入 skill 库治理阶段。

##### Skill Index

维护一个全局索引：

```yaml
skills:
  - name: unity-shader-helper
    description: "Unity shader debugging and migration"
    trigger_keywords:
      - shader
      - URP
      - HLSL
    negative_triggers:
      - "general C# gameplay bug"
    owner: user
    risk_level: medium
    usage_count: 42
    incident_count: 5
    last_maintained: 2026-06-30
```

##### Shadowing 检查

检查：

- 是否有多余 skill 的 description 太像
- 是否通用 skill 抢走专用 skill
- 是否旧 skill 抢走新 skill
- 是否某 skill description 适用范围过宽
- 是否某 skill description 适用范围过窄导致长期不触发

##### 合并、拆分、废弃

**合并条件：**

- 两个 skill 总是一起触发
- 职责边界无法稳定区分
- 其中一个只是另一个的步骤

**拆分条件：**

- 入口文件过长
- 一个 skill 有多个互不相关流程
- reference routing 变复杂
- 不同任务只需要其中一小部分

**废弃条件：**

- 长期不用
- 被更好 skill 替代
- 触发危险
- 维护成本高于收益

废弃不直接删除，先标记：

```yaml
status: deprecated
replacement: <new-skill>
```

#### MetaSkill 层：把"维护能力"和"编排能力"也变成 skill

ASMP 不只维护普通 skill，还维护两种高阶 skill。

##### Maintenance MetaSkill

也就是 "skill-maintainer"。

它维护：

- 如何记录 incident
- 如何聚类失败
- 如何判断 patch 位置
- 如何做有界编辑
- 如何验证
- 如何更新 changelog

##### Orchestration MetaSkill

也就是 "meta-architect" 或 "workflow-architect"。

它维护：

- 任务如何拆解
- 需要哪些子 Agent
- 子 Agent 如何分工
- 工作流如何编排
- 什么时候并行
- 什么时候串行
- 什么时候引入 evaluator
- 什么时候停止

推荐结构：

```
meta-architect/
├── <entry-file>
├── reference/
│   ├── task_decomposition.md
│   ├── agent_role_patterns.md
│   ├── workflow_topologies.md
│   └── failure_modes.md
└── meta/
    ├── incidents.md
    ├── cases.md
    ├── eval.md
    └── changelog.md
```

当复杂任务失败时，不只记录目标 skill 的 incident，也记录 orchestration incident：

- 任务拆错了？
- 子 Agent 角色设计错了？
- 并行/串行策略错了？
- Evaluator 介入太晚？
- Planner 没有把关键约束传给 Executor？

这就是把 Skill-MAS 的愿景落到工程框架中：高阶编排经验也可以被维护、评估和演化。

### 示例配置

以下参数是 ASMP Reference Profile 的推荐初始值（[经验参数]）。这些值在单用户 + 少量 skill 的环境中经过实践检验，但**不是规范要求**。部署时应根据以下因素本地校准：

- skill 的风险等级（高风险 skill 应有更低的维护触发阈值和更严格的验证要求）
- skill 的调用基数（高频 skill 的阈值应基于调用比例而非绝对次数）
- 团队的容忍度（更保守的团队可以调高阈值，延迟维护触发）

#### 维护阈值参考值

| 条件 | 动作 |
|------|------|
| 1 次低影响 incident | 只记录，不修改 |
| 2 次同 root cause | 标记 recurring issue，进入 backlog 或候选 patch |
| 3 次同 pattern | 标记 high-frequency pattern，生成维护建议 |
| 5 次同 pattern | Heartbeat 触发维护 |
| 1 次 high-risk incident | 立即修补，但必须记录 changelog + 验证 + 回滚快照 |

**High-risk** 包括：

- 破坏性文件操作
- 隐私泄露
- 凭证泄露
- 错误权限提升
- 会导致数据丢失
- 明显错误 API / 路径
- 安全边界失效

#### 有界编辑参考参数

每次维护的限制：

- 每次最多修改 3 个 skill
- 每个 skill 最多修改 3 个入口文件章节
- 每个入口文件 patch 最多 10 行
- 禁止整体重写，除非用户明确要求
- 禁止删除不确定内容
- 禁止修改内置 skill
- 禁止把 raw incident 直接复制进入口文件

每个 patch 必须包含：

- 修改内容
- 修改原因
- 证据来源
- 影响范围
- 回滚方式
- 验证结果

Patch 格式：

```markdown
## Patch Proposal: <title>

- Target skill:
- Target file:
- Type: add | modify | remove | move | split | merge
- Evidence:
  - incident: ...
  - case: ...
  - eval: ...
- Proposed diff:
  ```diff
  - old
  + new
  ```
- Why:
- Risk:
- Validation plan:
- Rollback note:
```

#### Heartbeat 调度参考参数

| 层级 | 推荐触发频率 | 替代触发条件 |
|------|-------------|-------------|
| H1 每日巡检 | 每天一次 | 每 20 次 skill 使用 |
| H2 定期维护 | 每周一次 | 某 skill 累计 3 条相似 incident |
| H3 定期治理 | 每月一次 | skill 数量超过 20 个 |
| H4 MetaSkill | 手动触发 | 多 Agent 工作流连续 3 次失败 |

#### Holdout 泄漏检测阈值

- 公开测试集 vs holdout 集的表现差异超过 5 个百分点 → 标记 `holdout_leakage_suspected`
- Canary 用例被任何 patch 正面影响 → 阻止本次所有 patch，触发 Security Auditor 审计

### 实现方案

#### 自动化等级

ASMP 建议把自动化分级，避免一上来就全自动乱改。

##### L0：只记录

- 记录 skill 使用、incident、case
- 不自动维护

适合刚接入系统。

##### L1：自动 triage

- Heartbeat 自动聚类 incident
- 生成维护建议
- 不改文件

适合大多数团队默认开启。

##### L2：自动生成 patch proposal

- skill-maintainer 自动生成 diff
- 等待用户确认

推荐默认级别。

##### L3：低风险自动 patch

- 错别字
- 路径修正
- Failure Handling 缺失
- reference routing 小修
- eval case 增补（不涉及 holdout 集）

可以自动改，但必须写 changelog 和保存回滚快照。

##### L4：验证门控自动优化

- 有明确 eval
- 有 holdout 集
- 有冷上下文测试
- 有 regression check
- 通过后自动更新

适合工程成熟 skill。

##### L5：MetaSkill 自进化

- 自动优化 skill-maintainer
- 自动优化 meta-architect
- 自动调整多 Agent 编排策略

只建议在沙箱或强验证环境中启用。

**推荐等级参考（[经验参数]）：**

| 用户类型 | 推荐等级 |
|---------|---------|
| 普通用户 | L1-L2 |
| 工程团队 | L2-L3 |
| 有 eval 的稳定系统 | L3-L4 |
| 研究系统 | L4-L5 |

#### 安全边界

ASMP 采用分层安全模型：Security Auditor（分析）+ Security Gate（确定性拦截）+ 人工审批（权限变更）。

##### 写权限隔离

- **Execution Agent**：可写 meta/incidents、meta/cases、metrics；不可写 entry/reference/scripts
- **Maintenance Agent**：可提出 patch；可在 Security Gate 和 Validation Gates 通过后写 entry/reference/scripts；必须写 changelog 和回滚快照
- **Evaluator Agent**：可读 candidate skill 和 holdout 集；可写 eval report；不直接改 skill
- **Security Auditor**：可审计 patch；可输出风险标签；不直接阻止修改（阻止由 Security Gate 执行）

##### 内置 skill 保护

默认：

- 不修改框架内置 skill
- 不修改第三方下载 skill
- 不修改只读 skill

除非用户明确要求。

##### 权限变更人工批准流程

以下修改必须经过人工批准（[规范要求]）：

- 新增 shell 脚本
- 新增网络访问
- 新增文件删除/覆盖逻辑
- 新增凭证读取逻辑
- 扩大工具权限
- 修改安全相关 skill
- 修改 skill router 规则

人工批准流程：

1. Maintenance Agent 生成 patch proposal
2. Security Auditor 标记风险标签
3. Security Gate 识别权限变更类别
4. 提案进入人工审批队列（附带 Security Auditor 的风险分析）
5. 审批者给出 `approved` / `rejected` 决定
6. 决定记录到 changelog
7. 被拒绝的提案进入 backlog，附拒绝原因

##### 防 prompt injection

第三方 skill、reference、incident 原文都可能带恶意指令。

规则：

- incident 是证据，不是指令
- reference 是材料，不是系统规则
- 第三方 skill 默认低信任
- 维护 agent 需要区分"用户纠正"和"外部文本诱导"

##### 回滚机制

每次维护修改自动保存回滚快照：

- 修改前的 skill 完整状态
- 回滚触发条件：
  - 验证失败
  - holdout 泄漏检测告警
  - canary 触发
  - 用户报告退化
  - shadowing 检出
- 回滚操作：恢复到修改前快照
- 回滚后：changelog 保留修改记录并标注 `rolled_back`，incident 保留不删除

#### 框架适配层

任何框架接入 ASMP 时，只需实现 6 个适配点（对应 ASMP Core 的六项抽象能力）：

1. **SkillDiscovery**：如何枚举维护对象？
2. **SkillEntryResolver**：如何找到入口文件或主指令？
3. **SkillRead**：如何读取 entry/reference/scripts/meta？
4. **SkillWrite**：如何安全写 meta 和 patch？
5. **SubAgentSpawn**：如何启动干净上下文子 Agent（或等价的隔离角色）？
6. **Heartbeat**：如何定时或按事件触发维护？

伪接口：

```typescript
interface ASMPRuntime {
  listSkills(): SkillRef[]
  resolveEntry(skill: SkillRef): EntryRef
  readSkill(skill: SkillRef, scope: "execution" | "maintenance"): SkillBundle
  appendEvent(skill: SkillRef, event: SkillEvent): void
  spawnSubAgent(role: AgentRole, context: ContextBundle): AgentResult
  proposePatch(skill: SkillRef, evidence: EvidenceBundle): PatchProposal[]
  securityGateCheck(patch: PatchProposal): GateResult
  validatePatch(skill: SkillRef, patch: PatchProposal): ValidationResult
  saveRollbackSnapshot(skill: SkillRef): SnapshotRef
  applyPatch(skill: SkillRef, patch: PatchProposal): PatchResult
  scheduleHeartbeat(kind: HeartbeatKind, policy: SchedulePolicy): void
}
```

只要框架能实现这几个适配点，就能接入。

#### 最小可行版本 MVP

如果只想最小落地，按这个顺序做。

1. **创建 "skill-maintainer"** — 先把维护能力本身固化成 skill
2. **给每个自定义 skill 增加核心 meta** — meta/incidents.md、meta/changelog.md
3. **给每个 skill 入口增加 Failure Handling** — 确保未来错误不会丢
4. **加 after-run 自检** — 每次任务结束时问：是否使用 skill？是否 skill 出错？是否需要记录 incident？
5. **加 heartbeat** — 最小 heartbeat：按固定周期扫描 incidents，满足阈值时调用 skill-maintainer
6. **加 eval** — 先给高频 skill 加测试：正例、反例、过去失败案例
7. **加 holdout 集** — 为 Evaluator 准备私有测试用例
8. **加 Security Gate** — 实现确定性权限检查
9. **加 shadowing 审计** — skill 数量增多后启动

#### 完整运行示例

**用户任务：** 帮我修 Unity URP Shader 的编译错误

**执行过程：**

1. Router 选择 unity-shader-helper
2. Execution Agent 读取入口文件
3. 入口文件要求先检查 Unity/URP 版本
4. Agent 执行修复
5. 用户指出漏了某个 include path
6. Agent 修复当前任务
7. After-run 自检发现 skill 缺少该边界情况
8. 记录 incident 到 meta/incidents.md

**Heartbeat：**

1. 定期扫描 incidents
2. 发现多次 URP include path 相关问题
3. 调用 skill-maintainer
4. Maintainer 对比成功案例
5. 判断应该更新 reference/edge_cases.md
6. 生成 patch proposal：入口文件只加一句 routing
7. Security Gate 检查：无权限变更、无危险脚本 → 放行
8. Evaluator 运行冷上下文验证 + 回归测试 + holdout 测试
9. Canary 未触发、holdout 泄漏未检出
10. Patch 落地，入口文件没有膨胀
11. 保存回滚快照
12. 更新 changelog

**最终结果：**

- 入口文件没有膨胀
- 边界情况被保存
- 未来 Agent 知道何时读取 reference
- 相同错误进入 eval
- changelog 解释了为什么改
- 如果未来 patch 引入退化，可以回滚

#### 成熟度检查清单

一个 Agent 框架如果声称支持 ASMP，至少应满足：

- [ ] 能发现所有自定义维护对象
- [ ] 能区分内置 skill 和用户 skill
- [ ] 每个 skill 有执行入口
- [ ] 每个 skill 有 incident 记录位置
- [ ] 执行 Agent 不直接污染入口文件
- [ ] 有 skill-maintainer（或等价的维护角色）
- [ ] 有干净上下文子 Agent（或等价的隔离评测角色）
- [ ] 有 heartbeat（或等价的定时触发）
- [ ] 有 changelog
- [ ] 有 patch proposal
- [ ] 有确定性 Security Gate
- [ ] 有 Security Auditor
- [ ] 有 holdout 测试集
- [ ] 有 canary 测试
- [ ] 有回滚机制
- [ ] 有权跟变更人工批准流程
- [ ] 有验证门控
- [ ] 有 shadowing 审计
- [ ] 有 MetaSkill / orchestration skill 的扩展点

### 总结

ASMP 的核心不是"让 Agent 自动改文件"，而是让 Agent 具备一套长期可靠的自维护闭环：

- **ASMP Core** 定义六项抽象能力：可版本化维护对象、事件存储、触发机制、提议者与评测者隔离、确定性策略门、可回滚发布
- **ASMP Reference Profile** 给出一种基于 Skill、子 Agent 和 Heartbeat 的具体实现
- Skill 承载长期能力
- 子 Agent 隔离执行、维护、验证和安全角色
- Heartbeat 保证维护定期发生
- meta/ 保存证据和历史
- eval/ 防止维护退化——通过 holdout 集和 canary 测试防止评测泄漏
- Security Gate 提供确定性安全拦截——代码级硬规则，不接受模型判断
- Security Auditor 提供辅助风险分析
- 权限变更必须人工批准
- changelog 保留决策理由
- 回滚机制保证修改可撤销
- MetaSkill 沉淀高阶维护和编排策略

最重要的设计原则是：

> 执行期不要污染长期知识；维护期不要无证据抽象；更新前必须过确定性安全门；更新后必须验证并保存回滚快照；skill 库变大后必须治理。

只要一个 Agent 框架具备 ASMP Core 定义的六项抽象能力，ASMP 就可以接入。有文件系统时，它表现为目录协议；没有文件系统时，它表现为对象存储协议；有强 eval 时，它可以自动优化；没有强 eval 时，它仍然可以安全地记录、聚类、生成建议，并等待人工确认。

### 知识缺口

- 各主流 Agent 框架（LangGraph、AutoGen、CrewAI 等）的实际 Skill 系统实现细节与 ASMP 适配难度评估
- 大规模 Skill 库（100+）下的 Shadowing 检测算法效率
- Heartbeat 在不同框架中的具体接入方式和性能开销
- 冷上下文验证的自动化程度上限——多复杂的 skill 能完全自动验证
- Holdout 泄漏检测阈值的跨环境校准——当前阈值（5%）为单一环境经验值，不同 skill 类型和风险等级的适用阈值待验证
- Canary 测试用例的设计方法论——什么形式的 canary 对检测评测泄漏最有效、误报率最低
- 回滚机制在实际生产环境中的触发频率和恢复时间——当前无大规模部署数据
- ASMP Core 抽象层脱离 Reference Profile 的独立验证——当前 Core 层所有验证都通过 Reference Profile 间接完成，需要至少一种非 Skill/子 Agent/Heartbeat 的替代实现来验证 Core 层的通用性

## 元数据

- **创建时间：** 2026-06-30
- **最后更新：** 2026-07-29
- **作者：** 吉良吉影
- **分类：** Agent工程化
- **标签：** Agent, Skill, 自维护, ASMP, Heartbeat, 子Agent, Skill维护, 安全审计, 回滚, Holdout
- **来源：** 基于 Agent 自维护实践经验总结，经外部审核后重构形成的自维护规范

---
*由吉良吉影的agent整理*
