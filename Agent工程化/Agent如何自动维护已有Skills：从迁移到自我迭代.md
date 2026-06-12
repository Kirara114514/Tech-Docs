# Agent 如何自动维护已有 Skills：从迁移到自我迭代

## 摘要

本文是一份同时写给人类和 Agent 的落地指南。人类读者看完后，应能指挥 Agent 迁移、审计、迭代和长期维护已有 skill；Agent 读完后，应能把本文当作执行协议，自动识别已有 skill、建立维护结构、记录错误、定期调用维护流程，并在未来每次使用 skill 出错时留下可蒸馏的证据。

本文基于《Skill 迭代维护的轻量化理论模型：从论文到可执行方案》的结论：skill 维护应采用“两层上下文、延迟蒸馏、有界维护、轻量验证”的结构。执行期只读取轻量的 skill 入口文件和必要的 `reference/`、`scripts/`；维护期再读取 `meta/`，由专门的 `skill-maintainer` 把错误记录、用户纠正、案例和评估结果蒸馏成更好的执行规则。

需要特别说明：Agent 不会因为“看过一次文档”就天然永久记得维护 skill。要让 Agent 今后持续记得，必须把维护行为固化到三个地方：第一，创建一个专门的 `skill-maintainer`；第二，在每个 skill 的 `Failure Handling` 中写入 incident 记录规则；第三，把定期维护触发条件写入 `skill-maintainer` 和全局 Agent 指令或长期记忆中。真正可靠的“记得”，不是依赖聊天历史，而是依赖可被未来 Agent 反复读取的结构化协议。

## 背景

### 如何使用本文

本文有两类读者。

人类读者可以把本文当作操作手册。你可以让 Agent 先读本文，然后发出这样的指令：

```text
请按照《Agent 如何自动维护已有 Skills：从迁移到自我迭代》中的流程，扫描我的所有自定义 skill，排除框架内置 skill，创建或迁移到标准结构，建立 skill-maintainer，并为每个 skill 增加 Failure Handling 与 meta/incidents.md。
```

Agent 读者可以把本文当作执行协议。如果你是 Agent，并且用户要求你维护、迁移、审计、创建或迭代 skill，你必须执行本文中的流程。除非用户明确要求，否则不要修改框架内置 skill，不要删除不确定内容，不要把原始 incident 直接塞进 skill 入口文件，不要在证据不足时强行固化规则。

本文不绑定任何单一框架。OpenClaw、Codex、Claude Code、QwenPaw 或其他支持 skill / command / memory / agent instruction 的系统，都可以按本文迁移。不同框架的文件名、manifest、metadata 和触发规则可能不同，但核心结构相同：

```text
执行入口
按需参考资料
可执行脚本
维护记录
维护 skill
```

### 框架规范优先

本文为了便于表达，经常使用 `skill.md` 指代“skill 的执行入口文件”。这只是逻辑占位名，不是跨框架强制文件名。实际落地时，Agent 必须先查看当前框架的 skill 规范，再决定使用哪个文件名和目录结构。

常见入口可能包括：

```text
skill.md
SKILL.md
README.md
manifest 中指定的入口文件
框架规定的 command / instruction 文件
```

因此，后文出现 `skill.md` 时，均应理解为：

```text
当前框架规范规定的 skill 执行入口文件。
如果框架规定是 SKILL.md，就使用 SKILL.md。
如果框架规定通过 manifest 指定入口，就使用 manifest 指向的文件。
```

Agent 在创建、迁移或维护任何 skill 之前，必须先执行“框架规范发现”：

1. 查看当前框架、插件或项目的官方 skill 规范、README、示例 skill 或 manifest schema。
2. 检查已有内置 skill 和自定义 skill 的实际结构，确认入口文件大小写、metadata、description、trigger 和允许的附属目录。
3. 如果本指南与框架规范冲突，以框架规范为准；本指南只提供维护分层和迭代流程。
4. 如果无法确认规范，不要擅自改名；先保留现有入口文件，并在维护报告中标记“框架规范待确认”。

## 一、最终目标

本指南的目标不是“整理一下 skill 文件夹”，而是建立一个长期自动维护闭环。

最终状态应当是：

1. 每个长期维护的自定义 skill 都有清晰的执行入口。
2. 日常任务执行时，Agent 只读取必要的轻量上下文。
3. 当 Agent 使用 skill 出错、漏做、误判、被用户纠正或触发不当时，会自动记录 incident。
4. incident 不会立刻污染执行文件，而是进入 `meta/incidents.md`。
5. 到合适的维护时机，Agent 会调用 `skill-maintainer`，读取 `meta/`，聚类问题，做有界修改。
6. 每次维护都会更新 `meta/changelog.md`。
7. 重要 skill 有轻量 eval 或 regression checklist，防止维护引入退化。
8. skill 库会定期检查 trigger 重叠、职责冲突和 skill shadowing。
9. Agent 今后遇到 skill 相关错误时，会自动进入“先完成任务，再记录 incident，后续维护蒸馏”的流程。

一句话概括：

> 执行时轻量，出错时记录，维护时蒸馏，修改后验证，长期靠结构记忆而不是靠对话记忆。

## 核心内容

### 二、Agent 常驻协议

本节是给 Agent 的协议。如果本文被作为上下文、skill、维护文档或长期规则读取，Agent 必须遵守本节。

### 1. 最高优先级行为

当你使用任何 skill 执行任务时，必须在任务结束前做一次 skill 维护自检：

```text
本次是否使用了 skill？
如果使用了，skill 是否触发正确？
当前框架规定的 skill 入口文件是否提供了足够指引？
是否发生了错误、遗漏、误判、返工、用户纠正或格式不符合预期？
是否发现 skill 过长、过窄、过宽、过时、与其他 skill 冲突？
```

如果答案中有任何一项说明 skill 存在问题，你必须：

1. 先完成当前用户任务。
2. 不在现场大规模重写 skill，除非用户明确要求或问题属于高风险安全错误。
3. 将问题记录到目标 skill 的 `meta/incidents.md`。
4. 如果目标 skill 还没有 `meta/incidents.md`，创建它。
5. 如果不确定目标 skill 是哪个，把 incident 记录到 `skill-maintainer/meta/incidents.md` 或全局 skill 维护 inbox。
6. 在最终回复中简要说明已记录 skill 维护 incident，除非用户明确不希望看到维护细节。

### 2. 不要依赖聊天历史

Agent 不能假设未来还记得当前对话。任何希望未来 Agent 记住的维护规则，都必须落到文件里：

```text
skill-maintainer/<entry-file>
目标 skill/<entry-file> 的 Failure Handling
目标 skill/meta/incidents.md
目标 skill/meta/changelog.md
目标 skill/meta/eval.md
全局 Agent 指令或长期记忆文件
```

其中 `<entry-file>` 必须按当前框架规范确定，例如 `skill.md`、`SKILL.md` 或 manifest 指定的文件。

没有写入文件的“记住”，只能视为临时上下文，不是可靠维护机制。

### 3. 修改边界

维护 skill 时，你必须遵守有界修改原则：

1. 只改与证据直接相关的内容。
2. 不顺手重写整个 skill。
3. 不把单个偶发 incident 直接提升为永久规则。
4. 不把原始错误记录复制进 skill 入口文件。
5. 不修改框架内置 skill，除非用户明确要求。
6. 不删除不确定内容；无法归类时放入 `meta/backlog.md`。
7. 每次维护后更新 `meta/changelog.md`。

### 4. 维护触发条件

当出现以下任一情况时，Agent 应主动建议或执行 skill 维护：

1. 同一个 skill 出现 3 条以上相似 incident。
2. 某条 incident 标记为 High。
3. 用户明确说“维护 skill”“优化 skill”“迁移 skill”“复盘这次错误”。
4. 新建 skill 时发现已有相似 skill。
5. 某个 skill 入口文件变得明显过长。
6. Agent 多次不知道该用哪个 skill。
7. 用户纠正“你本该按某个 skill 做”。
8. 每隔固定周期做一次轻量巡检，例如每周、每月或每 20 次 skill 使用后。

## 三、人类如何指引 Agent

人类不需要手动重构所有文件。更合理的方式是让 Agent 读本文，并分阶段执行。

### 阶段 1：让 Agent 建立维护系统

推荐指令：

```text
请阅读《Agent 如何自动维护已有 Skills：从迁移到自我迭代》，然后为我的自定义 skill 库建立维护系统。

要求：
1. 扫描所有 skill。
2. 区分自定义 skill 和框架内置 skill。
3. 不修改内置 skill。
4. 创建 skill-maintainer。
5. 为每个自定义 skill 建立最低维护结构：框架规定的入口文件、meta/incidents.md、meta/changelog.md。
6. 对复杂 skill 按需创建 reference/、scripts/、meta/backlog.md、meta/eval.md。
7. 为每个 skill 的入口文件增加 Failure Handling，要求未来出错时记录 incident。
8. 输出迁移报告。
```

### 阶段 2：让 Agent 迁移已有 skill

推荐指令：

```text
请按照 skill-maintainer 的迁移流程，迁移已有自定义 skill。

注意：
1. 保留原有内容。
2. 不确定内容不要删除，放入 meta/backlog.md。
3. 长流程和边界情况放入 reference/。
4. 可执行辅助工具放入 scripts/。
5. 历史错误、案例、维护记录放入 meta/。
6. 每个迁移过的 skill 都要更新 meta/changelog.md。
7. 最后列出修改了哪些 skill、哪些内容无法确定、后续优先维护哪些 skill。
```

### 阶段 3：让 Agent 建立未来自动记录机制

推荐指令：

```text
请检查所有自定义 skill 的 Failure Handling。

确保每个 skill 都包含以下规则：
当 Agent 使用本 skill 时，如果发生错误、遗漏、误判、用户纠正、输出不符合预期或发现本 skill 指引不足，应先完成当前任务，然后向 meta/incidents.md 追加结构化 incident。不要在现场把临时经验直接写入 skill 入口文件，除非用户明确要求或问题属于高风险安全错误。
```

### 阶段 4：让 Agent 周期性维护

推荐指令：

```text
请调用 skill-maintainer，对所有自定义 skill 做一次轻量维护巡检。

重点检查：
1. 是否有未处理 incident。
2. 是否有 3 条以上相似 incident。
3. 是否有 High urgency incident。
4. skill 入口文件是否过长。
5. trigger 是否与其他 skill 重叠。
6. 是否存在应该脚本化的重复错误。
7. 是否需要更新 meta/eval.md。

维护时只做有界修改，所有改动都写入 changelog。
```

## 四、标准目录结构

所有长期维护的自定义 skill 建议采用以下逻辑结构：

```text
<skill-name>/
├── <entry-file>        # 例如 skill.md、SKILL.md 或 manifest 指定的入口
├── reference/
├── scripts/
└── meta/
    ├── incidents.md
    ├── changelog.md
    ├── backlog.md
    ├── eval.md
    ├── design_notes.md
    └── cases/
```

这不是说每个 skill 一开始都必须创建所有文件。更推荐分层落地。

`<entry-file>` 必须由当前框架规范决定。Agent 不得为了套用本文而把 `SKILL.md` 强行改名为 `skill.md`，也不得忽略 manifest 或 metadata 中声明的入口文件。

### 核心层

所有长期维护的自定义 skill 都应具备：

```text
<entry-file>
meta/incidents.md
meta/changelog.md
```

核心层负责三件事：执行入口、错误证据、维护历史。

### 增强层

复杂、高频或高风险 skill 应具备：

```text
reference/
scripts/
meta/backlog.md
meta/eval.md
```

增强层负责长文档、自动化、未决问题和回归检查。

### 深度层

长期演化、多人维护或框架级 skill 可增加：

```text
meta/design_notes.md
meta/cases/
```

深度层负责设计解释和典型案例沉淀。

## 五、skill 入口文件写作规范

skill 入口文件是执行入口。它可能叫 `skill.md`，也可能叫 `SKILL.md`，还可能由 manifest 指定。它的读者是正在执行任务的 Agent，不是维护历史研究者。

### 必含章节

推荐模板：

```md
# Skill Name

## Description

一句话说明这个 skill 负责什么。

## Trigger

Use this skill when:
- ...

Do not use this skill when:
- ...

Prefer another skill when:
- ...

## Inputs

- 需要哪些用户输入、文件、上下文或环境信息。

## Outputs

- 应该产出什么。
- 输出格式是什么。

## Core Workflow

1. ...
2. ...
3. ...

## Reference Routing

- For complex workflow details, read `reference/workflows.md`.
- For edge cases, read `reference/edge_cases.md`.
- For templates, read `reference/templates.md`.

## Scripts

- `scripts/check_xxx.py`: 用途、输入、输出、调用方式。

## Quality Checklist

- [ ] ...
- [ ] ...

## Failure Handling

If this skill is insufficient, misfires, causes an error, or the user corrects the result:
1. Finish or repair the current user task first.
2. Append a structured incident to `meta/incidents.md`.
3. Do not directly dump the raw lesson into the skill entry file.
4. Leave distillation to a later `skill-maintainer` pass unless the user explicitly asks for immediate maintenance.
```

### 禁止内容

skill 入口文件不应包含：

1. 长篇历史记录。
2. 原始 incident 堆叠。
3. 大量案例全文。
4. 临时想法。
5. 未验证规则。
6. 维护过程碎片。
7. 与其他 skill 重复的大段通用规则。

如果某段内容很长但执行时偶尔需要，放入 `reference/`。如果某段内容是历史或证据，放入 `meta/`。如果某个步骤机械、重复、容易错，考虑放入 `scripts/`。

## 六、`reference/` 规范

`reference/` 存放按需读取的执行辅助资料。它不是默认上下文。

适合放入 `reference/` 的内容：

1. 复杂流程。
2. 边界情况。
3. 长规则。
4. 领域知识。
5. 格式规范。
6. 可复用模板。
7. 低频但重要的说明。

推荐文件：

```text
reference/
├── workflows.md
├── edge_cases.md
├── templates.md
└── domain_notes.md
```

不是每个 skill 都需要这些文件。只有当内容确实变长，或者会拖累入口文件时才创建。

关键要求：入口文件必须告诉 Agent 什么时候读取哪个 reference 文件。没有 routing 的 reference 等于半隐形知识，未来 Agent 很可能不知道该读。

## 七、`scripts/` 规范

`scripts/` 存放该 skill 可调用的脚本或自动化工具。

适合脚本化的场景：

1. 批量文件迁移。
2. 格式转换。
3. 目录结构检查。
4. markdown lint 或 frontmatter 检查。
5. 重复生成模板。
6. 统计 incident 数量。
7. 检查 trigger 相似度。
8. 运行轻量 eval。

如果存在脚本，建议添加 `scripts/README.md`：

```md
# Scripts

## script_name

- Purpose:
- Inputs:
- Outputs:
- Usage:
- Side effects:
- Safety notes:
```

Agent 使用脚本前必须确认输入、输出和副作用。涉及删除、覆盖、迁移、批量修改时，必须先确认目标路径，并避免修改框架内置 skill。

## 八、`meta/` 规范

`meta/` 是维护期上下文，不是执行期上下文。普通任务执行时不要读取 `meta/`，除非当前任务就是维护、迁移、复盘或审计 skill。

### `meta/incidents.md`

记录每次 skill 相关错误、遗漏、误判、用户纠正、触发不当或执行指引不足。

推荐格式：

```md
## Incident: YYYY-MM-DD HH:mm - 简短标题

- Status: new | triaged | promoted | backlogged | rejected
- Skill:
- Task context:
- What went wrong:
- User correction:
- Correct approach:
- Suspected root cause:
- Impact:
- Related files:
- Suggested update target:
  - [ ] skill entry file
  - [ ] reference/
  - [ ] scripts/
  - [ ] meta/eval.md
  - [ ] meta/backlog.md
- Urgency: Low | Medium | High
- Notes:
```

状态含义：

| Status | 含义 |
|---|---|
| new | 刚记录，尚未分析 |
| triaged | 已分析归类，但尚未处理 |
| promoted | 已蒸馏到 skill 入口文件、`reference/`、`scripts/` 或 `eval` |
| backlogged | 证据不足，暂存观察 |
| rejected | 判断为偶发、无效或不应固化 |

### `meta/changelog.md`

记录每次维护修改。

```md
## YYYY-MM-DD - 简短标题

### Changed
- 修改了什么。

### Why
- 为什么改。

### Source
- 来自哪些 incident、case、用户反馈或评估结果。

### Files touched
- skill entry file
- `reference/...`
- `scripts/...`
- `meta/...`

### Validation
- 做了哪些检查。
- 哪些检查没有做，为什么。
```

### `meta/backlog.md`

记录暂不确定是否应该修改 skill 的问题。

```md
## Backlog Item: 简短标题

- Context:
- Hypothesis:
- Risk:
- Needed evidence:
- Decision:
  - [ ] Keep watching
  - [ ] Promote to skill entry file
  - [ ] Promote to reference/
  - [ ] Promote to scripts/
  - [ ] Drop
```

### `meta/eval.md`

记录 skill 是否有效的轻量评估方法。

```md
# Evaluation

## Success Criteria

## Common Failure Modes

## Regression Checklist

## Test Cases

## Shadowing Checks
```

### `meta/design_notes.md`

记录设计决策：

1. 为什么这样拆分。
2. 为什么某些内容不放进 skill 入口文件。
3. 为什么某些 reference 被创建。
4. 为什么某些脚本存在。
5. 未来可能调整方向。

### `meta/cases/`

存放典型案例：

1. 成功案例。
2. 失败案例。
3. 复杂案例。
4. 边界案例。

案例用于维护时分析，不应直接污染 skill 入口文件。

## 九、创建 `skill-maintainer`

`skill-maintainer` 是维护其他 skill 的专用 skill。它是整个体系的核心。

推荐目录：

```text
skill-maintainer/
├── <entry-file>        # 按当前框架规范命名，例如 skill.md 或 SKILL.md
├── reference/
│   ├── migration_workflow.md
│   ├── iteration_workflow.md
│   ├── file_contract.md
│   └── anti_patterns.md
├── scripts/
└── meta/
    ├── incidents.md
    ├── changelog.md
    ├── backlog.md
    ├── eval.md
    ├── design_notes.md
    └── cases/
```

### `skill-maintainer` 入口文件模板

```md
# skill-maintainer

## Description

Maintains, migrates, audits, and iterates custom skills using a lightweight skill maintenance structure.

It turns raw mistakes, user corrections, incidents, cases, and historical notes into clean execution-facing instructions while preserving the separation between execution context and maintenance context.

## Trigger

Use this skill when the user asks to:

- create a new custom skill;
- migrate existing custom skills;
- improve a skill after mistakes;
- record a skill-related failure;
- review skill quality;
- update the skill entry file, `reference/`, `scripts/`, or `meta/`;
- analyze `meta/incidents.md`;
- maintain all custom skills;
- audit skill trigger overlap or skill shadowing.

## Inputs

- Target skill path or skill library path.
- User maintenance goal.
- Current framework skill specification or examples.
- Existing skill entry files, `reference/`, `scripts/`, and `meta/` files.
- Relevant incident, changelog, backlog, eval, design note, or case files.

## Outputs

- Updated skill files.
- Updated `meta/changelog.md`.
- Updated incident statuses when applicable.
- Maintenance report.

## Core Principles

1. Execution files must stay lightweight.
2. Maintenance files may be detailed.
3. `meta/` is read only during maintenance, migration, review, audit, or iteration.
4. Do not dump raw lessons into the skill entry file.
5. Distill lessons into concise, actionable rules.
6. Put long or conditional guidance into `reference/`.
7. Put automation into `scripts/`.
8. Put unresolved ideas into `meta/backlog.md`.
9. Put regression checks into `meta/eval.md`.
10. Record every maintenance change in `meta/changelog.md`.
11. Do not modify framework built-in skills unless explicitly instructed.
12. Prefer bounded edits over broad rewrites.

## Core Workflow

1. Identify target skills.
2. Inspect the current framework's skill specification, existing examples, manifest schema, and entry-file naming convention.
3. Exclude framework built-in skills unless explicitly instructed.
4. Read the target skill's framework-defined entry file.
5. Inspect `reference/` and `scripts/` if they exist.
6. Read relevant `meta/` files for maintenance context.
7. Classify each issue as trigger ambiguity, workflow gap, missing reference, poor routing, missing script, weak checklist, unclear output contract, repeated failure, one-off incident, or shadowing risk.
8. Decide where each improvement belongs.
9. Apply bounded edits.
10. Update `meta/changelog.md`.
11. Update incident statuses or add processing notes.
12. Run available regression checks.
13. Summarize what changed and why.

## Reference Routing

- For migration steps, read `reference/migration_workflow.md`.
- For incident-driven iteration, read `reference/iteration_workflow.md`.
- For file placement rules, read `reference/file_contract.md`.
- For common mistakes, read `reference/anti_patterns.md`.

## Scripts

List available scripts here when they exist.

## Quality Checklist

- [ ] The skill entry file is concise and executable.
- [ ] The entry filename and metadata follow the current framework's skill specification.
- [ ] The framework's required manifest or metadata files are preserved.
- [ ] Trigger has positive and negative cases.
- [ ] Reference Routing is present when `reference/` exists.
- [ ] No raw incident dump was inserted into the skill entry file.
- [ ] Every change has a changelog entry.
- [ ] Incident statuses were updated when applicable.
- [ ] Built-in skills were not modified unless explicitly requested.
- [ ] The skill can still be used without reading `meta/`.
- [ ] Shadowing risk was considered.

## Failure Handling

If skill maintenance itself fails, is uncertain, or produces a questionable update:
1. Record the issue in `skill-maintainer/meta/incidents.md`.
2. If the issue concerns a target skill, also record it in the target skill's `meta/incidents.md`.
3. If evidence is insufficient, write it to `meta/backlog.md` instead of forcing a bad abstraction.
4. Do not hide failed maintenance.
```

## 十、`skill-maintainer/reference/` 文件

### `migration_workflow.md`

```md
# Migration Workflow

## Goal

Migrate existing custom skills to the standard maintenance structure without losing useful information.

## Steps

1. Locate all skill directories.
2. Read the current framework's skill specification, local examples, and manifest conventions.
3. Identify framework built-in skills and exclude them unless explicitly instructed.
4. For each custom skill, inspect existing files.
5. Identify the framework-defined execution entry file, such as `skill.md`, `SKILL.md`, or a manifest-declared file.
6. Normalize or create the entry file according to the framework specification.
7. Create `meta/incidents.md` and `meta/changelog.md` if missing.
8. Create `reference/`, `scripts/`, `meta/backlog.md`, `meta/eval.md`, `meta/design_notes.md`, and `meta/cases/` only when useful.
9. Move or copy long supporting material into `reference/`.
10. Move executable helpers into `scripts/`.
11. Move historical notes, cases, and uncertain content into `meta/`.
12. Add `Reference Routing` and `Failure Handling` to the entry file.
13. Record migration in `meta/changelog.md`.

## Placement Rules

- Short always-needed execution rule -> skill entry file
- Long conditional guidance -> `reference/`
- Mechanical helper -> `scripts/`
- Raw error history -> `meta/incidents.md`
- Uncertain idea -> `meta/backlog.md`
- Regression check -> `meta/eval.md`
- Design rationale -> `meta/design_notes.md`

## Safety Rules

- Do not delete uncertain content.
- Prefer preserving content over losing it during first migration.
- Do not modify built-in skills unless explicitly instructed.
- Avoid large rewrites unless the original file is unusable.
```

### `iteration_workflow.md`

```md
# Iteration Workflow

## Goal

Turn incidents, user corrections, cases, backlog items, and evaluation results into better skill behavior.

## Inputs

Read:

- skill entry file
- relevant `reference/`
- relevant `scripts/`
- `meta/incidents.md`
- `meta/changelog.md`
- `meta/backlog.md`
- `meta/eval.md`
- `meta/design_notes.md`
- relevant `meta/cases/`

## Analysis Questions

For each issue, ask:

1. Is this a one-off mistake or a recurring pattern?
2. Did the trigger fail?
3. Did the workflow fail?
4. Was required context missing?
5. Did Reference Routing fail?
6. Should this be in the skill entry file or `reference/`?
7. Can a checklist prevent it?
8. Can a script prevent it?
9. Should it become an eval case?
10. Would this change make the skill too broad?
11. Would this change cause skill shadowing?

## Update Decisions

- Short and always relevant -> update the skill entry file.
- Long, conditional, or rare -> update `reference/`.
- Mechanical or repetitive -> add or update `scripts/`.
- Uncertain or low-evidence -> put in `meta/backlog.md`.
- Testable regression -> update `meta/eval.md`.
- Architecture rationale -> update `meta/design_notes.md`.

## Validation

Before finishing:

- run available regression checks;
- check that the skill entry file remains lightweight;
- check trigger overlap with nearby skills;
- update changelog;
- update incident status.
```

### `file_contract.md`

```md
# File Contract

## Skill entry file

Purpose:

- execution entry;
- trigger;
- inputs and outputs;
- core workflow;
- routing;
- checklist;
- failure handling.

Must not contain:

- raw incidents;
- long cases;
- historical logs;
- unresolved ideas;
- low-frequency details that belong in `reference/`.

The actual filename must follow the current framework, such as `skill.md`, `SKILL.md`, or a manifest-declared file.

## `reference/`

Purpose:

- long execution-supporting docs;
- conditional guidance;
- templates;
- edge cases;
- domain notes.

## `scripts/`

Purpose:

- executable helpers;
- validation tools;
- generators;
- migration helpers;
- batch operations.

## `meta/`

Purpose:

- maintenance-only context;
- incidents;
- changelog;
- backlog;
- evals;
- design notes;
- cases.

Normal task execution should not read `meta/`.
Maintenance must read relevant `meta/`.
```

### `anti_patterns.md`

```md
# Anti-patterns

## Dumping everything into the skill entry file

Bad because it bloats execution context.

Fix: keep concise always-needed instructions in the skill entry file; move long material to `reference/`; move history to `meta/`.

## Treating `meta/` as a graveyard

Bad because useful lessons never affect execution.

Fix: during maintenance, distill recurring lessons into the skill entry file, `reference/`, `scripts/`, or `eval`.

## Updating skill immediately during every incident

Bad because live task pressure causes overfitting.

Fix: record incident first; iterate later unless the issue is high-risk.

## Creating too many empty files

Bad because it creates noise.

Fix: keep the logical contract; create optional files when useful.

## Overfitting to one mistake

Bad because one incident may not justify a general rule.

Fix: put uncertain issues in `meta/backlog.md`.

## No changelog

Bad because future maintainers cannot understand why rules exist.

Fix: every maintenance pass updates `meta/changelog.md`.

## Reference without routing

Bad because Agent does not know when to read what.

Fix: every skill entry file with `reference/` must include `Reference Routing`.

## Skill shadowing

Bad because a broad or familiar skill may suppress a more precise one.

Fix: write positive and negative trigger cases; audit overlapping skills.
```

## 实现方案

### 十一、迁移所有已有 skill 的流程

Agent 执行迁移时，应按以下步骤进行。

### Step 1：定位 skill

搜索可能的 skill 根目录。不同框架路径不同，例如：

```text
~/.codex/skills/
~/.agents/skills/
project/.skills/
project/skills/
framework-specific skill directories
```

Agent 不应假设只有一个 skill 目录。应先列出候选路径，再判断哪些属于当前用户或项目。

在继续迁移前，Agent 必须先查明当前框架的 skill 规范：

1. 入口文件名是 `skill.md`、`SKILL.md`，还是由 manifest 指定。
2. 是否需要 manifest、metadata、description、name、version、permissions 等字段。
3. trigger 写在入口文件里，还是写在 metadata / manifest 里。
4. `reference/`、`scripts/`、`meta/` 是否会被框架自动读取，是否需要特殊命名。
5. 内置 skill 和用户自定义 skill 的路径边界在哪里。

### Step 2：区分自定义 skill 和内置 skill

判断维度：

1. 路径是否位于框架缓存、插件缓存或安装目录。
2. 文件是否由框架分发。
3. 用户是否明确声明它是自定义 skill。
4. git 状态或文件来源是否显示它属于用户仓库。

默认规则：不确定是不是内置 skill 时，不修改，先列入报告。

### Step 3：为每个自定义 skill 建立最低结构

最低结构：

```text
<skill-name>/
├── <entry-file>
└── meta/
    ├── incidents.md
    └── changelog.md
```

如果已有主说明文件不是本文示例中的 `skill.md`，不要直接改名。应先根据框架规范确认真实入口文件名。如果框架要求 `SKILL.md`，就使用 `SKILL.md`；如果由 manifest 指定，就维护 manifest 指向的文件。不要删除原文件，除非确认内容已完整迁移且不再被框架使用。

### Step 4：整理 skill 入口文件

检查并补齐：

1. Description。
2. Trigger。
3. Inputs。
4. Outputs。
5. Core Workflow。
6. Reference Routing。
7. Scripts。
8. Quality Checklist。
9. Failure Handling。

如果原 skill 内容很短，不要为了模板而写大量空话。模板是结构，不是填空作文。

### Step 5：拆分长内容

将内容放入合适位置：

| 内容类型 | 目标位置 |
|---|---|
| 总是需要的短规则 | skill 入口文件 |
| 长流程 | `reference/workflows.md` |
| 边界情况 | `reference/edge_cases.md` |
| 模板 | `reference/templates.md` |
| 领域知识 | `reference/domain_notes.md` |
| 脚本或命令 | `scripts/` |
| 错误历史 | `meta/incidents.md` |
| 修改历史 | `meta/changelog.md` |
| 不确定想法 | `meta/backlog.md` |
| 评估标准 | `meta/eval.md` |
| 设计解释 | `meta/design_notes.md` |

### Step 6：写入迁移 changelog

每个被迁移的 skill 都要追加：

```md
## YYYY-MM-DD - Migrated to lightweight maintenance structure

### Changed
- Created or normalized the framework-defined skill entry file.
- Created maintenance metadata files.
- Moved long-form material to `reference/` where applicable.
- Added Failure Handling for incident recording.

### Why
- To separate execution context from maintenance context.
- To enable future incident-driven skill iteration.

### Source
- Initial migration pass.

### Files touched
- ...

### Validation
- Checked that the skill can be executed from its framework-defined entry file without reading `meta/`.
```

### Step 7：输出迁移报告

报告应包含：

1. 扫描了哪些路径。
2. 识别出哪些自定义 skill。
3. 排除了哪些内置 skill。
4. 修改了哪些 skill。
5. 每个 skill 新增或调整了哪些文件。
6. 哪些内容不确定，被放入 backlog。
7. 哪些 skill 应优先维护。
8. 是否存在 trigger 重叠或 shadowing 风险。

## 十二、日常执行中的 incident 记录

Agent 使用 skill 执行普通任务时，不应把维护工作喧宾夺主。正确顺序是：

```text
完成用户任务
发现 skill 问题
记录 incident
继续交付结果
等待后续维护时机
```

### 什么时候记录 incident

以下情况都应记录：

1. skill 没有被触发，但事后发现本该触发。
2. skill 被错误触发。
3. skill 的 Trigger 含糊。
4. skill 入口文件缺少必要步骤。
5. `Reference Routing` 没有告诉 Agent 读哪个文件。
6. reference 内容过长、过旧或互相矛盾。
7. 脚本缺失、失败或没有说明输入输出。
8. Agent 被用户纠正。
9. 输出格式不符合 skill 要求。
10. Agent 做了返工。
11. 多个 skill 互相冲突。
12. 发现应该脚本化的重复步骤。

### 什么时候不立刻修改 skill

以下情况先记录，不立即改：

1. 只有一次低影响错误。
2. 用户纠正可能只适用于当前任务。
3. 根因不清楚。
4. 修改会扩大 trigger。
5. 修改可能与其他 skill 冲突。
6. 当前任务压力很高，没时间验证。

### 什么时候可以立即修改

以下情况可以立即做小补丁：

1. 高风险安全错误。
2. 破坏性文件操作风险。
3. 隐私泄露风险。
4. 明显错别字或路径错误。
5. `Failure Handling` 缺失导致无法记录 incident。
6. 用户明确要求“现在就改 skill”。

即使立即修改，也要写 changelog，并记录 incident 来源。

## 十三、维护期迭代流程

维护期由 `skill-maintainer` 驱动。

### 输入

维护 Agent 应读取：

1. `skill-maintainer` 的框架入口文件。
2. 目标 skill 的框架入口文件。
3. 目标 skill 的相关 `reference/`。
4. 目标 skill 的相关 `scripts/`。
5. `meta/incidents.md`。
6. `meta/changelog.md`。
7. `meta/backlog.md`。
8. `meta/eval.md`。
9. `meta/design_notes.md`。
10. `meta/cases/` 中相关案例。

### 分析

对每个 incident 或 backlog item，回答：

1. 这是一次性错误还是重复模式？
2. 是 skill 没触发，还是触发错了？
3. 是流程缺失，还是执行时忽略？
4. 是否因为 reference routing 不清楚？
5. 是否可以通过 checklist 避免？
6. 是否可以通过脚本避免？
7. 是否应该成为 eval case？
8. 是否会造成 skill shadowing？
9. 是否有足够证据修改？
10. 修改会不会让执行上下文变重？

### 决策

使用以下决策表：

| 判断 | 动作 |
|---|---|
| 短、总是相关、执行期必须知道 | 更新 skill 入口文件 |
| 长、条件化、低频但重要 | 更新 `reference/` |
| 机械、重复、可验证 | 更新或新增 `scripts/` |
| 证据不足 | 放入 `meta/backlog.md` |
| 可回归测试 | 更新 `meta/eval.md` |
| 解释结构原因 | 更新 `meta/design_notes.md` |
| 原始错误 | 保留在 `meta/incidents.md` |
| 可能与其他 skill 冲突 | 暂停修改，做 shadowing 审计 |

### 修改

修改时遵守：

1. 小步改。
2. 改目标文件，不改无关文件。
3. 保持 skill 入口文件短。
4. 长说明放 reference。
5. 重复操作脚本化。
6. 不删除历史证据。
7. 不改内置 skill。

### 验证

至少检查：

1. skill 入口文件是否仍能独立指导执行。
2. `meta/` 是否没有进入执行路径。
3. Reference Routing 是否准确。
4. Scripts 是否有输入输出说明。
5. Changelog 是否更新。
6. Incident 状态是否更新。
7. 是否引入 trigger 重叠。
8. 是否有 eval checklist 可运行。

## 十四、让 Agent 今后“记得维护 skill”

这是本指南最重要的一节。

Agent 的“记得”不能依赖当前对话。要让未来 Agent 也执行维护，必须把规则写入它未来会读取的位置。

### 1. 写入 `skill-maintainer`

`skill-maintainer` 的框架入口文件必须包含：

```text
When any skill-related mistake, user correction, missed trigger, wrong trigger, workflow gap, or output mismatch is observed, first finish the user's task, then record a structured incident in the target skill's `meta/incidents.md`. Do not rewrite the target skill immediately unless the user explicitly requests it or the issue is high-risk. Later, use skill-maintainer to distill incidents into bounded updates.
```

### 2. 写入每个 skill 入口文件的 `Failure Handling`

每个 skill 都要包含：

```text
If this skill fails, is insufficient, is mis-triggered, or the user corrects the result, append a structured incident to `meta/incidents.md` after completing the current task. Do not dump raw lessons into the skill entry file; leave distillation to skill-maintainer.
```

### 3. 写入全局 Agent 指令或长期记忆

如果框架支持全局 instructions、memory、profile 或 custom rules，应加入：

```text
Skill maintenance standing rule:
Whenever you use a custom skill and notice an error, omission, user correction, wrong trigger, missing instruction, or recurring friction, finish the task first and then record a structured incident in that skill's `meta/incidents.md`. Periodically invoke `skill-maintainer` to distill incidents into bounded updates. Do not modify built-in skills unless explicitly instructed.
```

### 4. 写入新 skill 创建流程

每次创建新 skill 时，Agent 必须同时创建或确认：

1. 框架规定的 skill 入口文件，例如 `skill.md`、`SKILL.md` 或 manifest 指定文件。
2. `meta/incidents.md`。
3. `meta/changelog.md`。
4. `Failure Handling`。
5. 如果复杂，则创建 `reference/` 和 `meta/eval.md`。

新 skill 如果没有 incident 记录入口，就不算真正完成。

### 5. 在每次最终回复前做维护自检

Agent 完成任务前，应轻量自问：

```text
本次是否使用了 skill？
是否出现 skill 相关错误或用户纠正？
是否已经记录 incident？
是否需要建议后续维护？
```

这一步不需要打扰用户太多，但可以防止错误经验丢失。

## 十五、全自动维护节奏

全自动维护不等于每次错误都自动改 skill。合理节奏如下。

### 即时层

发生错误时：

```text
记录 incident
不重构
继续完成任务
```

### 短周期层

每天或每若干次任务后：

```text
扫描 new incident
标记 High urgency
聚类明显重复问题
只处理低风险小补丁
```

### 中周期层

每周或每 20 次 skill 使用后：

```text
调用 skill-maintainer
审计高频 skill
处理重复 incident
更新 eval
检查 trigger 重叠
```

### 长周期层

每月或 skill 库明显膨胀时：

```text
做 skill 库级治理
合并重叠 skill
废弃过时 skill
拆分过大 skill
检查 shadowing
整理 design_notes
```

## 十六、轻量 eval 落地

每个重要 skill 都应有最低限度的回归检查。

### L1：结构检查

可以自动或半自动检查：

1. 是否存在当前框架规定的 skill 入口文件。
2. 是否存在 `meta/incidents.md`。
3. 是否存在 `meta/changelog.md`。
4. skill 入口文件或框架 metadata 是否包含 Trigger。
5. skill 入口文件是否包含 Failure Handling。
6. 有 `reference/` 时是否包含 Reference Routing。
7. 最近维护是否更新 changelog。

### L2：样例任务检查

在 `meta/eval.md` 中写 3 到 10 个典型任务：

```md
## Test Cases

### Case 1: 简短标题

- Input:
- Expected behavior:
- Expected output:
- Must not:
```

维护后用纯净上下文 Agent 执行样例任务，检查是否退化。

### L3：人工抽检

写作、分析、设计类 skill 不必强行自动打分。人工抽检足够。

关注：

1. 输出是否符合预期。
2. 是否过度解释。
3. 是否漏读必要 reference。
4. 是否误用脚本。
5. 是否触发了错误 skill。

## 十七、skill 库级治理

当 skill 数量增长，主要风险不再是“没有 skill”，而是“选错 skill”。

### Trigger 审计

每个 skill 的 Trigger 应包含：

```text
Use this skill when:
Do not use this skill when:
Prefer this skill over X when:
Prefer X over this skill when:
```

如果两个 skill 的 Trigger 很像，必须明确边界。

### Shadowing 审计

`skill-maintainer` 应检查：

1. 通用 skill 是否压制专用 skill。
2. 旧 skill 是否与新 skill 重叠。
3. 两个 skill 是否给同一工具不同规则。
4. 某个 skill 是否因为描述太宽而被频繁误触发。
5. 某个 skill 是否因为描述太窄而长期不触发。

### 合并与拆分

合并条件：

1. 两个 skill 总是一起触发。
2. 职责边界无法清晰描述。
3. 它们只是同一流程的两个小步骤。

拆分条件：

1. 一个 skill 有多个互不相关的大分支。
2. skill 入口文件过长。
3. 不同任务只需要其中很小一部分。

废弃条件：

1. skill 长期不用。
2. 已被更好的 skill 替代。
3. 触发条件危险或过宽。
4. 维护成本高于收益。

废弃时不要直接删除，建议标记：

```text
<skill-name>.deprecated/
```

并在 `meta/changelog.md` 或 `meta/design_notes.md` 写明替代项。

## 十八、Agent 执行总流程

如果 Agent 被要求“维护所有 skill”，应执行下面的总流程。

```text
1. 读取本文或 skill-maintainer。
2. 扫描 skill 根目录。
3. 区分自定义 skill 与内置 skill。
4. 创建或更新 skill-maintainer。
5. 为每个自定义 skill 建立核心层结构。
6. 按框架规范迁移主说明到 skill 入口文件。
7. 拆分长内容到 reference/。
8. 移动脚本到 scripts/。
9. 创建 meta/incidents.md 和 meta/changelog.md。
10. 为 skill 入口文件添加 Failure Handling。
11. 对复杂 skill 添加 meta/eval.md。
12. 记录迁移 changelog。
13. 扫描 trigger 重叠。
14. 输出迁移与维护报告。
15. 提醒未来任务中自动记录 incident。
```

如果 Agent 被要求“根据 incident 维护某个 skill”，应执行：

```text
1. 读取 skill-maintainer。
2. 读取目标 skill 的框架入口文件。
3. 读取目标 skill 的 relevant meta。
4. 聚类 incident。
5. 判断每个问题的目标位置。
6. 做有界补丁。
7. 更新 changelog。
8. 更新 incident status。
9. 运行 eval/checklist。
10. 输出维护报告。
```

如果 Agent 在普通任务中发现 skill 出错，应执行：

```text
1. 完成当前任务。
2. 判断目标 skill。
3. 创建 meta/incidents.md 如果不存在。
4. 追加 incident。
5. 不立即重构，除非高风险或用户明确要求。
6. 在最终回复中简要说明。
```

## 十九、交付报告模板

### 迁移报告

```md
# Skill Migration Report

## Scanned Paths

- ...

## Custom Skills Migrated

- ...

## Built-in Skills Skipped

- ...

## Files Created or Updated

- ...

## Uncertain Content

- ...

## Backlog Items

- ...

## Shadowing Risks

- ...

## Recommended Next Maintenance

- ...
```

### 单个 skill 维护报告

```md
# Skill Maintenance Report

## Target Skill

- ...

## Evidence Reviewed

- Incidents:
- Backlog:
- Eval:
- Cases:

## Changes Made

- ...

## Why

- ...

## Files Touched

- ...

## Validation

- ...

## Remaining Risks

- ...
```

### Incident 记录报告

```md
# Incident Recorded

- Skill:
- Incident title:
- File:
- Urgency:
- Suggested maintenance timing:
```

## 总结

### 二十、常见错误

### 1. 把维护系统做得太重

不要一开始就为所有 skill 创建大量空文件。先建立核心层，再按复杂度增加。

### 2. 把 skill 入口文件变成历史档案

skill 入口文件是执行入口，不是事故合集。历史放 `meta/`。

### 3. 只记录 incident，不蒸馏

`meta/` 不是仓库尽头。定期维护时，必须把重复模式蒸馏到执行文件、reference、script 或 eval。

### 4. 每次 incident 都立刻改 skill

这会过拟合。多数 incident 先记录，等待聚类和维护时机。

### 5. 忘记更新 changelog

没有 changelog，未来 Agent 不知道规则为什么存在，也不知道能不能删。

### 6. 修改内置 skill

内置 skill 属于框架能力，不应随意修改。除非用户明确要求，否则只维护自定义 skill。

### 7. 忽视 skill shadowing

skill 不是越多越好。数量增长后，要维护触发边界和职责边界。

## 二十一、最小可行落地顺序

如果时间有限，按下面顺序做。

第一步：创建 `skill-maintainer`。

第二步：给所有自定义 skill 创建：

```text
meta/incidents.md
meta/changelog.md
```

第三步：给所有 skill 入口文件增加 `Failure Handling`。

第四步：迁移最常用、最容易出错的 3 到 5 个 skill。

第五步：为这些高频 skill 添加 `meta/eval.md`。

第六步：每周或每 20 次 skill 使用后，让 Agent 调用 `skill-maintainer` 处理 incident。

第七步：当 skill 数量超过 20 个时，开始做 trigger 和 shadowing 审计。

这个顺序优先保证“未来错误不会丢失”。只要 incident 记录机制建立起来，即使暂时没时间维护，后续也有材料可蒸馏。

## 二十二、最终检查清单

人类或 Agent 完成迁移后，应检查：

```text
- [ ] 已识别自定义 skill 与内置 skill。
- [ ] 已查看当前框架的 skill 规范、入口文件命名和 manifest / metadata 要求。
- [ ] 已创建 skill-maintainer。
- [ ] 每个自定义 skill 有框架规定的入口文件，例如 `skill.md`、`SKILL.md` 或 manifest 指定文件。
- [ ] 每个长期维护的自定义 skill 有 meta/incidents.md。
- [ ] 每个长期维护的自定义 skill 有 meta/changelog.md。
- [ ] 每个 skill 入口文件有 Failure Handling。
- [ ] 有 reference/ 的 skill 在入口文件中有 Reference Routing。
- [ ] 有 scripts/ 的 skill 说明了用途、输入、输出和调用方式。
- [ ] 复杂或高频 skill 有 meta/eval.md。
- [ ] 迁移和维护都有 changelog。
- [ ] 未确定内容进入 backlog，而不是被删除。
- [ ] 内置 skill 未被误改。
- [ ] 已检查 trigger 重叠和 shadowing 风险。
- [ ] 已把 skill 维护常驻规则写入全局 Agent 指令或长期记忆。
```

## 结论

让 Agent 长期自动维护 skill，关键不在于写一份更长的说明，而在于建立一套未来 Agent 一定能重新读取的结构。

skill 入口文件让 Agent 执行；`reference/` 让 Agent 按需深入；`scripts/` 让 Agent 把机械步骤自动化；`meta/` 让 Agent 保存错误和维护证据；`skill-maintainer` 让 Agent 把这些证据蒸馏成更好的 skill。

真正可靠的维护闭环是：

```text
每次执行前知道该用哪个 skill
每次执行中只读必要上下文
每次出错后记录 incident
每次维护时读取 meta
每次修改都做有界补丁
每次补丁都留下 changelog
每隔一段时间审计整个 skill 库
```

当这套结构建立后，Agent 才算真正“记得维护 skill”。它记得，不是因为某次对话里说过，而是因为每个未来 Agent 都能在文件系统、skill 入口和维护协议里重新读到这条规则。

## 元数据
- **创建时间：** 2026-06-12
- **最后更新：** 2026-06-12
- **作者：** 吉良吉影
- **分类：** Agent 工程化
- **标签：** Skill, Agent, 维护, 迁移, 自我迭代
- **来源：** 日常记录/2026-06-12-LLM-skill论文阅读与迭代方案思考.md

---
*由吉良吉影的agent整理*
