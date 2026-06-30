## 元数据
- **创建时间：** 2026-06-30
- **最后更新时间：** 2026-06-30
- **作者：** 吉良吉影
- **分类：** Agent工程化
- **标签：** Agent,Skill,自维护,协议规范,ASMP,Heartbeat,子Agent,Skill维护
- **来源简注：** 基于Agent自维护实践经验总结形成的正式协议规范

---

ASMP：Agent Self-Maintenance Protocol

面向通用 Agent 框架的自维护协议 v1.0

## 0. 核心目标

ASMP 的目标是让 Agent 不再只是"会调用 skill"，而是能长期维护自己的 skill 体系：

- **执行时**：轻量读取 skill
- **出错时**：记录结构化证据
- **心跳时**：聚类、诊断、蒸馏
- **维护时**：有界修改 skill
- **验证时**：防止退化、过拟合、shadowing 和安全风险
- **长期**：让 skill 库持续进化

一句话定义：

> ASMP 是一套基于 Skill、子 Agent 和 Heartbeat 的通用自维护闭环，用于让 Agent 在真实执行中积累经验，并将经验安全地蒸馏为可复用、可验证、可迁移的 skill 资产。

这套协议吸收了以下几类论文思路：

- **Agent Skills 的渐进式披露**：skill 入口只放执行期必要信息，长材料和脚本按需加载。Anthropic 官方也把 progressive disclosure 作为 Agent Skills 的核心设计原则。
- **SkillEvolver 的 skill learning as meta-skill**：维护 skill 的能力本身也应是一个 skill。
- **SkillGrad 的文本梯度 + 动量积累 + 对比诊断**：不要被单次失败带偏，要从成功/失败轨迹中提炼稳定修正方向。
- **SkillOpt 的有界编辑 + 验证门控**：skill 应该像外部可训练状态一样被稳定优化，而不是被随手重写。
- **SkillHone 的持久化决策历史**：未来 Agent 需要知道"为什么这么改"，不能只看到最终文件。
- **Skill-MAS 的 MetaSkill 愿景**：高阶编排能力本身也可以被沉淀成可进化 skill，用于任务拆解、子 Agent 设计和工作流编排。
- **More Skills, Worse Agents? 的 Skill Shadowing 防护**：skill 库变大后，主要风险不是上下文变长，而是选错 skill。

---

## 1. 最小依赖：三件事就够

ASMP 不绑定 Claude Code、Codex、OpenClaw、QwenPaw、LangGraph、AutoGen、CrewAI 或任何单一框架。

只要求框架具备三个能力：

### 1.1 Skill

Skill 是长期能力载体。它可以是：

- SKILL.md
- skill.md
- manifest + instructions
- command spec
- tool profile
- workflow package
- prompt + reference + scripts

ASMP 不强制文件名，只强制逻辑结构：

- 执行入口
- 按需参考资料
- 可执行辅助逻辑
- 维护记录
- 评估记录

### 1.2 子 Agent

子 Agent 用来做上下文隔离和角色分离。

至少需要两类：

- **Execution Agent**：执行用户任务
- **Maintenance Agent**：维护 skill

增强版可以拆成：

- **Evaluator Agent**：验证修改有没有收益
- **Librarian Agent**：治理 skill 库和触发边界
- **Security Agent**：检查权限、注入和供应链风险
- **Meta-Architect Agent**：维护多 Agent 编排策略

### 1.3 Heartbeat

Heartbeat 是定期触发器。它负责让"以后维护"真的发生。

Heartbeat 可以是：

- 每次任务结束后的 after-run hook
- 每小时/每天/每周 cron
- 每 N 次 skill 使用后的计数触发
- 每 N 条 incident 后的阈值触发
- 用户显式要求维护时的手动触发

没有 Heartbeat，自维护会退化成"文档写得很好，但未来没人看"。

---

## 2. 总体架构

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
meta/
   ↓
Heartbeat
   ↓
skill-maintainer
   ↓
Diagnosis / Patch Proposal / Validation
   ↓
Bounded Skill Update
   ↓
Changelog / Eval / Backlog
```

对应到角色：

- **执行层**：把任务做好
- **记录层**：留下可蒸馏证据
- **维护层**：把证据变成更好的 skill
- **验证层**：防止维护引入退化
- **治理层**：维护整个 skill 库的边界、安全和规模
- **元技能层**：沉淀更高阶的任务拆解和多 Agent 编排策略

---

## 3. Skill 包标准结构

ASMP 推荐每个长期维护的 skill 使用以下逻辑结构：

```
<skill-name>/
├── <entry-file>              # 框架规定的 skill 入口
├── reference/                # 按需读取的长文档
├── scripts/                  # 自动化脚本或工具
└── meta/                     # 维护期上下文
    ├── incidents.md          # 失败、误触发、用户纠正
    ├── cases.md              # 成功案例、复杂案例
    ├── changelog.md          # 每次维护修改记录
    ├── backlog.md            # 证据不足的待观察项
    ├── eval.md               # 回归测试、触发测试、质量检查
    ├── metrics.md            # 使用次数、成功率、误触发率
    ├── shadowing.md          # 与其他 skill 的边界冲突
    └── design_notes.md       # 设计理由和历史决策
```

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

---

## 4. Skill 入口文件规范

每个 skill 的入口文件只放执行期必需内容。

推荐结构：

```markdown
# <skill-name>

## Description
这个 skill 负责什么。

## Trigger
Use this skill when:
- ...

Do not use this skill when:
- ...

Prefer another skill when:
- ...

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

**禁止**把这些东西塞进入口文件：

- 原始 incident
- 长篇案例
- 历史日志
- 未验证猜想
- 大段领域知识
- 维护过程碎片
- 与其他 skill 重复的通用规则

---

## 5. 事件模型：所有维护都从事件开始

ASMP 的最小事件类型有 5 种：

- **SkillUseEvent**：skill 被使用
- **SkillIncident**：skill 相关失败
- **SkillCase**：成功或复杂案例
- **SkillEvalResult**：评估结果
- **SkillPatchEvent**：维护修改记录

### 5.1 SkillUseEvent

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

### 5.2 SkillIncident

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

### 5.3 SkillCase

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

---

## 6. 三层自维护循环

ASMP 分三层循环。

### 6.1 即时循环：After-Run 自检

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

### 6.2 短周期循环：Heartbeat Triage

Heartbeat 每天或每 N 次 skill 使用后运行：

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

### 6.3 维护循环：Distillation Pass

当满足条件时，启动 "skill-maintainer" 子 Agent：

1. 读取目标 skill 入口文件
2. 读取 reference/、scripts/
3. 读取 meta/incidents、cases、eval、backlog、changelog
4. 聚类失败模式
5. 对比成功/失败决策轨迹
6. 生成 patch proposal
7. 运行验证门控
8. 应用有界修改
9. 更新 changelog、incident status、eval、backlog

---

## 7. Heartbeat 调度策略

Heartbeat 是 ASMP 的关键，因为它让维护从"偶尔想起来"变成系统行为。

### 7.1 H0：每次任务结束

- **触发**：每次 Agent 完成任务
- **动作**：
  - skill 使用自检
  - 必要时记录 incident/case
  - 更新 usage count

### 7.2 H1：每日轻量巡检

- **触发**：每天一次，或每 20 次 skill 使用
- **动作**：
  - 扫描 new incident
  - 聚类相似 incident
  - 标记 high urgency
  - 更新 meta/metrics.md
  - 不做大规模修改

### 7.3 H2：每周维护

- **触发**：每周一次，或某 skill 累计 3 条相似 incident
- **动作**：
  - 调用 skill-maintainer
  - 输出维护报告
  - 做有界 patch
  - 更新 changelog
  - 更新 eval

### 7.4 H3：每月治理

- **触发**：每月一次，或 skill 数量超过阈值
- **动作**：
  - 检查 skill shadowing
  - 合并重叠 skill
  - 拆分过大 skill
  - 废弃过时 skill
  - 检查安全风险
  - 整理 design_notes

### 7.5 H4：MetaSkill 进化

- **触发**：多 Agent 工作流反复失败，或复杂任务需要自动编排
- **动作**：
  - 分析任务拆解失败
  - 分析子 Agent 角色设计失败
  - 分析 workflow orchestration 失败
  - 更新 meta-architect skill

H4 对应 Skill-MAS 的愿景：不只维护具体 task skill，还维护"如何构造多 Agent 系统"的高阶能力。

---

## 8. 维护阈值和动量机制

不要每次 incident 都立刻改 skill。

推荐阈值：

| 条件 | 动作 |
|------|------|
| 1 次低影响 incident | 只记录，不修改 |
| 2 次同 root cause | 标记 recurring issue，进入 backlog 或候选 patch |
| 3 次同 pattern | 标记 high-frequency pattern，必须生成维护建议 |
| 5 次同 pattern | Heartbeat 强制触发维护 |
| 1 次 high-risk incident | 可以立即修补，但必须记录 changelog 和 validation |

**High-risk** 包括：

- 破坏性文件操作
- 隐私泄露
- 凭证泄露
- 错误权限提升
- 会导致数据丢失
- 明显错误 API / 路径
- 安全边界失效

---

## 9. Patch 决策表

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

---

## 10. 有界编辑规则

每次维护必须限制修改范围。

默认规则：

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

---

## 11. 验证门控

每个 patch 通过验证后才能落地。

### 11.1 结构验证

- 入口文件是否存在
- Trigger 是否存在
- Failure Handling 是否存在
- 有 reference/ 时是否有 Reference Routing
- 有 scripts/ 时是否说明输入输出副作用
- changelog 是否更新

### 11.2 冷上下文验证

用一个干净子 Agent 只读取：

- skill 入口文件
- 必要 reference
- 必要 scripts

**不读取：**

- incident 原文
- 原始对话
- 维护报告

检查它能不能正确执行样例任务。

### 11.3 回归验证

从 `meta/eval.md` 选 3 到 10 个测试：

- 典型正例
- 典型反例
- 边界案例
- 过去失败案例
- shadowing 模糊案例

检查：

- 修复了什么
- 有没有破坏原来成功的情况
- 有没有引入新歧义

这对应 SkillGen 的思想：skill 是一种 intervention，不能只看 repair，也要看 regression。

### 11.4 Shadowing 验证

对相邻 skill 做触发测试：

- 这个任务应该触发 A，不触发 B
- 这个任务应该触发 B，不触发 A
- 这个任务两个都不该触发
- 这个任务需要 A+B 协作

如果新增规则让通用 skill 压制专用 skill，patch 拒绝或进入 backlog。

### 11.5 安全验证

检查：

- 是否扩大权限
- 是否新增危险脚本
- 是否允许删除/覆盖/外发数据
- 是否可能泄露 token、密钥、隐私
- 是否引入 prompt injection 表面
- 是否允许运行未验证第三方代码

默认策略：

- 执行 Agent 不能直接改 skill 入口、reference、scripts
- 维护 Agent 只能在维护期改
- 高风险修改必须用户确认
- 第三方 skill 默认只读或沙箱运行

---

## 12. 子 Agent 角色设计

ASMP 最小实现只需要一个 Maintenance Agent。

但推荐角色如下：

### 12.1 Execution Agent

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

### 12.2 Skill Maintainer Agent

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

### 12.3 Evaluator Agent

**职责：**

- 用干净上下文验证 patch
- 运行 eval cases
- 检查 regression
- 输出 redacted feedback

最好不要把答案、oracle、敏感测试目标直接暴露给 Maintainer。

### 12.4 Librarian Agent

**职责：**

- 维护 skill 库索引
- 检查 trigger 重叠
- 发现 shadowing
- 建议合并、拆分、废弃 skill
- 维护 skill dependency graph

### 12.5 Security Agent

**职责：**

- 审计权限
- 检查危险脚本
- 检查 prompt injection
- 检查供应链风险
- 检查第三方 skill

### 12.6 Meta-Architect Agent

**职责：**

- 维护多 Agent 编排 skill
- 总结任务拆解经验
- 总结角色设计经验
- 总结 workflow topology 经验

这对应 Skill-MAS 的 MetaSkill 层：维护"如何搭 Agent 团队"的能力，而不只是维护单个执行 skill。

---

## 13. "skill-maintainer" 设计

"skill-maintainer" 是 ASMP 的核心 skill。

推荐入口文件：

```markdown
# skill-maintainer

## Description
Maintains, audits, evolves, and governs custom skills from structured execution evidence.

## Trigger
Use this skill when:
- user asks to maintain, migrate, improve, audit, or evolve skills
- a skill has repeated incidents
- a skill has high urgency incidents
- skill trigger overlap or shadowing is suspected
- a skill becomes too long, stale, unsafe, or ambiguous
- heartbeat invokes periodic maintenance

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
- meta/eval.md
- meta/changelog.md
- meta/metrics.md

## Outputs
- maintenance report
- patch proposals
- updated skill files after approval or policy gate
- updated changelog
- updated incident statuses
- updated eval/backlog/shadowing notes

## Core Workflow
1. Identify framework skill rules.
2. Identify custom skills and skip built-in skills.
3. Read target skill entry file.
4. Read relevant reference/scripts.
5. Read maintenance meta.
6. Cluster incidents by root cause.
7. Compare success and failure decision traces.
8. Decide target location for each improvement.
9. Generate bounded patch proposals.
10. Run validation gates.
11. Apply accepted patches.
12. Update changelog, incident statuses, eval, backlog.
13. Report changes and risks.

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

## Failure Handling
If maintenance is uncertain or fails:
1. Record a maintainer incident.
2. Do not hide failed maintenance.
3. Prefer backlog over bad abstraction.
4. Ask for user confirmation when risk is high.
```

---

## 14. Library 级治理

当 skill 数量超过 20 个，ASMP 必须进入 skill 库治理阶段。

### 14.1 Skill Index

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

### 14.2 Shadowing 检查

检查：

- 是否有多个 skill 的 description 太像
- 是否通用 skill 抢走专用 skill
- 是否旧 skill 抢走新 skill
- 是否某 skill trigger 过宽
- 是否某 skill trigger 过窄导致长期不触发

### 14.3 合并、拆分、废弃

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

---

## 15. MetaSkill 层：把"维护能力"和"编排能力"也变成 skill

ASMP 不只维护普通 skill，还维护两种高阶 skill。

### 15.1 Maintenance MetaSkill

也就是 "skill-maintainer"。

它维护：

- 如何记录 incident
- 如何聚类失败
- 如何判断 patch 位置
- 如何做有界编辑
- 如何验证
- 如何更新 changelog

### 15.2 Orchestration MetaSkill

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

---

## 16. 自动化等级

ASMP 建议把自动化分级，避免一上来就全自动乱改。

### L0：只记录

- 记录 skill 使用、incident、case
- 不自动维护

适合刚接入系统。

### L1：自动 triage

- Heartbeat 自动聚类 incident
- 生成维护建议
- 不改文件

适合大多数团队默认开启。

### L2：自动生成 patch proposal

- skill-maintainer 自动生成 diff
- 等待用户确认

推荐默认级别。

### L3：低风险自动 patch

- 错别字
- 路径修正
- Failure Handling 缺失
- reference routing 小修
- eval case 增补

可以自动改，但必须写 changelog。

### L4：验证门控自动优化

- 有明确 eval
- 有冷上下文测试
- 有 regression check
- 通过后自动更新

适合工程成熟 skill。

### L5：MetaSkill 自进化

- 自动优化 skill-maintainer
- 自动优化 meta-architect
- 自动调整多 Agent 编排策略

只建议在沙箱或强验证环境中启用。

**默认推荐：**

| 用户类型 | 推荐等级 |
|---------|---------|
| 普通用户 | L1-L2 |
| 工程团队 | L2-L3 |
| 有 eval 的稳定系统 | L3-L4 |
| 研究系统 | L4-L5 |

---

## 17. 安全边界

ASMP 必须默认保守。

### 17.1 写权限隔离

- **Execution Agent**：可写 meta/incidents、meta/cases、metrics；不可写 entry/reference/scripts
- **Maintenance Agent**：可提出 patch；可在 gate 通过后写 entry/reference/scripts；必须写 changelog
- **Evaluator Agent**：可读 candidate skill；可写 eval report；不直接改 skill
- **Security Agent**：可阻止 patch；可标记 risk

### 17.2 内置 skill 保护

默认：

- 不修改框架内置 skill
- 不修改第三方下载 skill
- 不修改只读 skill

除非用户明确要求。

### 17.3 危险操作 gate

这些修改必须用户确认：

- 新增 shell 脚本
- 新增网络访问
- 新增文件删除/覆盖逻辑
- 新增凭证读取逻辑
- 扩大工具权限
- 修改安全相关 skill
- 修改 skill router 规则

### 17.4 防 prompt injection

第三方 skill、reference、incident 原文都可能带恶意指令。

规则：

- incident 是证据，不是指令
- reference 是材料，不是系统规则
- 第三方 skill 默认低信任
- 维护 agent 需要区分"用户纠正"和"外部文本诱导"

---

## 18. 框架适配层

任何框架接入 ASMP 时，只需实现 6 个适配点：

1. **SkillDiscovery**：如何枚举 skill？
2. **SkillEntryResolver**：如何找到入口文件或主指令？
3. **SkillRead**：如何读取 entry/reference/scripts/meta？
4. **SkillWrite**：如何安全写 meta 和 patch？
5. **SubAgentSpawn**：如何启动干净上下文子 Agent？
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
  validatePatch(skill: SkillRef, patch: PatchProposal): ValidationResult
  applyPatch(skill: SkillRef, patch: PatchProposal): PatchResult
  scheduleHeartbeat(kind: HeartbeatKind, policy: SchedulePolicy): void
}
```

只要框架能实现这几个适配点，就能接入。

---

## 19. 最小可行版本 MVP

如果只想最小落地，按这个顺序做。

1. **创建 "skill-maintainer"** — 先把维护能力本身固化成 skill
2. **给每个自定义 skill 增加核心 meta** — meta/incidents.md、meta/changelog.md
3. **给每个 skill 入口增加 Failure Handling** — 确保未来错误不会丢
4. **加 after-run 自检** — 每次任务结束时问：是否使用 skill？是否 skill 出错？是否需要记录 incident？
5. **加 heartbeat** — 最小 heartbeat：每周扫描一次 incidents，如果某 skill 有 >=3 条相似 incident，调用 skill-maintainer
6. **加 eval** — 先给高频 skill 加 3 个测试：一个正例、一个反例、一个过去失败案例
7. **加 shadowing 审计** — skill 超过 20 个后启动

---

## 20. 完整运行示例

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

1. 每周扫描 incidents
2. 发现 3 次 URP include path 相关问题
3. 调用 skill-maintainer
4. Maintainer 对比成功案例
5. 判断应该更新 reference/edge_cases.md
6. 入口文件只加一句 routing："For URP include path mismatches, read reference/edge_cases.md"
7. 新增 eval case
8. 更新 changelog

**最终结果：**

- 入口文件没有膨胀
- 边界情况被保存
- 未来 Agent 知道何时读取 reference
- 相同错误进入 eval
- changelog 解释了为什么改

---

## 21. 成熟度检查清单

一个 Agent 框架如果声称支持 ASMP，至少应满足：

- [ ] 能发现所有自定义 skill
- [ ] 能区分内置 skill 和用户 skill
- [ ] 每个 skill 有执行入口
- [ ] 每个 skill 有 incident 记录位置
- [ ] 执行 Agent 不直接污染入口文件
- [ ] 有 skill-maintainer
- [ ] 有干净上下文子 Agent
- [ ] 有 heartbeat
- [ ] 有 changelog
- [ ] 有 patch proposal
- [ ] 有验证门控
- [ ] 有 shadowing 审计
- [ ] 有安全边界
- [ ] 有 MetaSkill / orchestration skill 的扩展点

---

## 22. 结论

ASMP 的核心不是"让 Agent 自动改文件"，而是让 Agent 具备一套长期可靠的自维护闭环：

- Skill 承载长期能力
- 子 Agent 隔离执行、维护、验证和安全角色
- Heartbeat 保证维护定期发生
- meta/ 保存证据和历史
- eval/ 防止维护退化
- changelog 保留决策理由
- MetaSkill 沉淀高阶维护和编排策略

最重要的设计原则是：

> 执行期不要污染长期知识；维护期不要无证据抽象；更新后必须验证；skill 库变大后必须治理。

只要一个 Agent 框架有 skill、子 Agent 和 heartbeat，ASMP 就可以接入。有文件系统时，它表现为目录协议；没有文件系统时，它表现为对象存储协议；有强 eval 时，它可以自动优化；没有强 eval 时，它仍然可以安全地记录、聚类、生成建议，并等待人工确认。

这就是一个足够通用、足够稳健、也能承接 MetaSkill 愿景的 Agent 自维护方案。

---

## 知识缺口
- 各主流 Agent 框架（LangGraph、AutoGen、CrewAI 等）的实际 Skill 系统实现细节与 ASMP 适配难度评估
- 大规模 Skill 库（100+）下的 Shadowing 检测算法效率
- Heartbeat 在不同框架中的具体接入方式和性能开销
- 冷上下文验证的自动化程度上限——多复杂的 skill 能完全自动验证

---
*由吉良吉影的agent整理*
