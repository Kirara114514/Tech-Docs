# Skill 迭代维护的轻量化理论模型：从论文到可执行方案

## 摘要

Skill 机制的价值不只在于把一段经验写成可复用提示词，而在于把 Agent 的能力组织成可按需加载、可审计、可演化的外部行为模块。随着 skill 数量增加，真正困难的问题不再是“如何写出第一版 skill”，而是“如何让 skill 在长期使用中持续变好，同时不把执行上下文拖垮，也不让 skill 库因数量增长而互相干扰”。

本文面向第一次接触这个问题的读者，不假设读者知道任何前置讨论。文章先介绍研究对象、术语和五篇参考论文，再提出一个“待检验工程假设”：把 skill 拆成执行入口、按需参考资料、可执行脚本和维护记录四层，并通过专门的维护 skill 来持续迭代其他 skill。这个假设不是结论，而是本文要用论文和工程推理检验的对象。

本文使用的研究材料包括五篇论文和综述：[Agent Skills Survey](https://arxiv.org/pdf/2602.12430) 用来建立 skill 的生命周期与模块化视角；[SkillHone](https://arxiv.org/pdf/2606.08671) 用来理解决策历史和维护上下文的重要性；[SkillGrad](https://arxiv.org/pdf/2605.27760) 用来类比从错误轨迹中进行小步优化；[SkillOpt](https://arxiv.org/pdf/2605.23904) 用来讨论有界编辑、验证门和拒绝修改路径；[More Skills, Worse Agents?](https://arxiv.org/pdf/2605.24050) 用来提醒 skill 数量增长可能带来选择干扰和 skill shadowing。

基于这些材料，本文逐步推导一个更稳妥的轻量方案：执行期只加载短而明确的 `skill.md` 和必要的 `reference/`；错误发生时先记录结构化 incident，不在现场重构 skill；维护期由专门的 `skill-maintainer` 读取 `meta/`，在纯净上下文中做有界修改、轻量验证和 changelog 记录；对 skill 库规模增长引入 trigger 去重、shadowing 检查和低成本 eval。

最终结论是：最合适的方案不是复刻论文中的完整自动优化系统，也不是把所有经验堆进 skill 文件，而是建立一个“两层上下文、延迟蒸馏、有界维护、轻量验证”的最小可行治理闭环。它足够通用，可以迁移到 OpenClaw、Codex、Claude Code、QwenPaw 等带有 skill 机制的 Agent 框架；也足够轻量，适合个人或小团队长期维护自己的 skill 库。

## 背景

### 一、问题边界：我们到底在优化什么

讨论 skill 维护前，需要先明确本文里的 skill 指什么。这里的 skill 不是单一框架里的某个固定实现，而是一类通用抽象：Agent 在执行任务时，按需读取的一组外部能力说明，通常包含触发条件、执行流程、工具使用方式、参考资料、脚本、质量检查和失败处理规则。

不同框架的命名和文件结构不同。Codex、Claude Code、OpenClaw、QwenPaw 等系统可能分别使用 `SKILL.md`、`skill.md`、manifest、metadata、内置插件或命令路由。但从工程本质看，它们都面对同一个问题：

Agent 的长期能力不能全部塞进 system prompt；它必须被模块化、按需加载，并在任务反馈中持续改进。

为了让后文可以自洽阅读，先约定几个术语：

| 术语 | 本文含义 |
|---|---|
| Agent | 能读取上下文、调用工具、执行多步骤任务的智能体 |
| skill | Agent 在特定任务中按需读取的能力模块，通常由说明文档、参考资料和脚本组成 |
| `skill.md` | skill 的执行入口，描述何时触发、如何执行、输出什么、完成前检查什么 |
| `reference/` | 长流程、模板、边界情况、领域说明等按需读取资料 |
| `scripts/` | skill 可调用的脚本或自动化辅助工具 |
| `meta/` | 维护期资料，包括错误记录、修改历史、评估标准、设计说明和案例 |
| incident | 一次 skill 使用中的错误、遗漏、用户纠正、误触发或不符合预期的结果 |
| `skill-maintainer` | 一个专门维护其他 skill 的 skill，负责迁移、审计、蒸馏 incident 和执行回归检查 |

因此，本文关心的不是某个框架的具体语法，而是一个跨框架可迁移的维护结构。它需要满足四个约束：

1. 执行期上下文要轻。Agent 正在完成用户任务时，不应读取大量历史、事故、设计争论和维护笔记。
2. 维护期上下文要完整。Agent 优化 skill 时，必须能看到错误记录、修改历史、评估标准和未决问题。
3. 迭代要可审计。skill 为什么被改、来自哪次错误、影响哪些文件，都需要留下记录。
4. 成本要可控。个人或小团队不能为每次 skill 修改都建立完整 benchmark、复杂训练管线或大规模自动评估系统。

这四个约束构成本文的优化目标。更形式化地说，一个 skill 维护体系要最大化的不是单次任务成功率，而是下面几个量的综合结果：

```text
长期有效性
= 正确 skill 被触发的概率
* skill 被触发后正确执行的概率
* 修改后不退化的概率
- 执行上下文成本
- 维护成本
- skill 间干扰成本
```

这也是为什么“把所有经验都写进 skill.md”看似能提高执行准确率，长期却可能适得其反。它提高了某些特定错误的可见性，但同时增加了上下文成本、触发歧义和指令冲突。

### 二、待检验工程假设：从单文件 skill 到可维护结构

为了避免直接跳到结论，本文先构造一个待检验的工程假设。这个假设来自许多 Agent 实践中的共同痛点：单文件 skill 写到后期会越来越长，里面混合了执行流程、历史错误、临时提醒、设计解释和案例；Agent 日常执行时读得越来越累，维护时又找不到完整证据。

待检验方案包含几条强直觉：

第一，执行上下文要轻，维护上下文要完整。日常执行只读 `skill.md`，按需读取 `reference/` 和使用 `scripts/`，不读取 `meta/`。

第二，`meta/` 不是垃圾桶，而是事故记录、经验沉淀和迭代蒸馏的原料仓。错误、用户纠正、失败案例和维护笔记先进入 `meta/`，后续再提炼到执行文件。

第三，维护时必须把有价值信息蒸馏进 `skill.md`、`reference/` 或 `scripts/`，不能让经验永远堆在 `meta/`。

第四，应该创建一个专门维护 skill 的 skill，即 `skill-maintainer`。它负责迁移、审计、迭代其他 skill，并维护 skill 结构本身。

第五，当 Agent 按 skill 工作并犯错时，即便错误很小，也应把犯错和改正上下文记录到该 skill 的 `meta/incidents.md`；等合适时间点，再让纯净上下文的子 Agent 调用维护 skill 来读取 meta 并改进目标 skill。

这些假设有明显的工程吸引力，但还不能直接当作答案。它们至少需要回答四个问题：

1. 为什么 `meta/` 应该与执行上下文隔离，而不是每次都读取？
2. 为什么错误发生时只记录、不立即修改 skill？
3. 为什么需要专门的 `skill-maintainer`，而不是让每个 skill 自带维护说明？
4. 为什么“记录每个小错”不会把 `meta/` 变成另一个无法维护的垃圾堆？

下面用本文开头列出的五篇论文提供的机制和反例，逐步验证这些问题。

### 三、研究材料：五篇论文分别提供什么证据

这五篇材料不是为了拼凑引用，而是分别对应 skill 维护中的五类关键问题。

| 材料 | 本文使用它回答的问题 |
|---|---|
| Agent Skills Survey | skill 为什么应被视为有生命周期的模块化能力，而不是一次性提示词 |
| SkillHone | 为什么维护 skill 时需要保存失败轨迹、决策历史和修改来源 |
| SkillGrad | 为什么 incident 应当被聚类和小步蒸馏，而不是每次错误都立刻改正文档 |
| SkillOpt | 为什么自动维护需要有界编辑、验证门和拒绝修改路径 |
| More Skills, Worse Agents? | 为什么 skill 越多不一定越好，库级治理和 shadowing 检查为什么必要 |

#### 1. Agent Skills Survey：skill 是生命周期对象，不是一次性提示词

Agent Skills Survey 的价值在于把 skill 从“某个框架的功能”提升为一个更普遍的研究对象。它讨论了 skill 的获取、组织、应用、组合、评估和安全风险。对本文最重要的启发有三点。

第一，skill 本质上是模块化能力单元。它通常不只是自然语言说明，也可能包含代码、资源、示例和执行辅助材料。因此，单文件 skill 在早期可以工作，但随着能力复杂度上升，必然会出现文件分层需求。

第二，skill 需要按需加载。skill 机制的核心优势不是“写更多提示词”，而是避免把所有能力说明常驻在上下文里。也就是说，渐进披露不是一个可有可无的优化，而是 skill 能够扩展的前提。

第三，skill 有生命周期。创建、检索、执行、评估、修订、安全治理，都属于 skill 系统的一部分。如果只关注 `skill.md` 的正文质量，而没有维护记录、评估方法和淘汰机制，skill 库迟早会变成一堆难以解释的历史补丁。

这为待检验方案中的“执行上下文轻、维护上下文完整”提供了理论基础。`skill.md` 负责执行，`meta/` 负责维护，是对生命周期不同阶段的上下文隔离。

#### 2. SkillHone：维护需要决策历史，而不只是最终版本

SkillHone 关注 Agent 如何从过去任务中提炼并优化可复用技能。它的关键启发不是某个具体文件结构，而是一个原则：如果只保存 skill 的最终文本，不保存改动来源、失败轨迹和决策理由，那么后续维护会失去判断依据。

对人类代码维护来说，commit message、issue、测试失败记录和设计文档都很重要。对 skill 维护也是一样。Agent 修改一条规则时，需要知道这条规则为什么存在、它修复过什么问题、是否可能与其他规则冲突。

这支持待检验方案中的 `meta/changelog.md`、`meta/design_notes.md` 和 `meta/incidents.md`。但是 SkillHone 也隐含了一个警告：历史必须被结构化，否则历史本身会变成噪声。只保存“这次出错了，记住以后不要这样”不够；需要保存任务上下文、错误表现、用户纠正、根因猜测、建议更新位置和后续处理状态。

因此，`meta/` 的作用不是越详细越好，而是把后续维护所需的证据保存到一个可检索、可聚类、可蒸馏的形态。

#### 3. SkillGrad：skill 迭代像梯度下降，但不能等同于即时修 prompt

SkillGrad 把 skill 优化类比为梯度下降：Agent 从执行轨迹中识别错误，根据错误方向对 skill 做局部更新，再通过多轮迭代逐渐改善性能。这个类比对个人 skill 维护特别有启发。

在机器学习里，梯度更新不是“看到一个样本就随意重写模型”。它需要损失信号、更新方向、学习率、历史动量和验证。迁移到 skill 维护中，对应关系大致是：

| 机器学习概念 | skill 维护中的对应物 |
|---|---|
| 样本 | 一次任务执行 |
| 损失 | 错误、遗漏、用户纠正、不符合预期 |
| 梯度方向 | 应该改触发条件、流程、reference、script 还是 eval |
| 学习率 | 修改幅度 |
| 动量 | 多次 incident 中反复出现的模式 |
| 验证集 | 轻量 regression checklist 或测试案例 |

这个类比说明，错误应该被记录，但不应该每次都立刻固化成执行规则。单个样本可能是偶发上下文、用户特殊偏好、任务表述歧义或 Agent 临时注意力失败。如果每个 incident 都立即进入 `skill.md`，等价于用过大的学习率更新模型，很容易过拟合。

因此，待检验方案中的“现场只记录，不重构”是合理的。不过还需要增加一条约束：不是所有 incident 都有资格进入执行文件。维护时应先判断它是一次性事故、重复模式、触发问题、流程缺口、reference routing 问题、script 缺失，还是 eval 缺失。

#### 4. SkillOpt：自动优化需要有界编辑和验证门

SkillOpt 的核心启发是，skill 自动优化不能只依赖“生成一个更好的版本”。优化过程需要编辑边界、候选修改、验证、拒绝机制和慢速的 meta update。否则，Agent 很容易在修复一个问题时引入另一个问题。

对个人 skill 维护而言，不必复刻完整的自动优化系统，但必须保留其中两个高性价比机制。

第一，有界编辑。一次维护只改与证据直接相关的部分，不顺手重写整条 skill。比如 incident 显示“reference routing 没有指向 edge cases”，那就补 routing 或新增一个短 reference，而不是把整个 workflow 重写成新风格。

第二，验证门。修改完成后至少要做轻量检查：`skill.md` 是否仍然短、触发条件是否更清晰、是否引入了与其他 skill 的重叠、是否把原始 incident 塞进执行上下文、是否更新 changelog。如果有 `meta/eval.md`，还要跑其中的 regression checklist。

这支持待检验方案中的 changelog 和 eval，但也说明该方案还需要一个“拒绝修改”的路径。维护 Agent 不能只会 promote，也要能判断“证据不足，放入 backlog”或“修改会扩大歧义，暂不处理”。

#### 5. More Skills, Worse Agents?：skill 越多不一定越好

More Skills, Worse Agents? 讨论了一个很关键的反直觉现象：给 Agent 更多 skill 不一定提升表现，反而可能因为 skill shadowing、错误触发、干扰和选择负担导致表现下降。

这对 skill 维护结构有直接影响。如果每次犯错都创建新 skill、每条经验都写进触发条件、每个边界情况都变成新规则，skill 库会越来越大，但 Agent 的选择会越来越难。最终问题可能不是“Agent 没有能力”，而是“Agent 在太多相似能力中选错了”。

因此，skill 维护不能只追求单条 skill 更完整，还要追求整个 skill 库更可路由。维护流程必须检查：

1. 新增规则是否让 trigger 更宽泛，从而误触发。
2. 新增 skill 是否与已有 skill 重叠。
3. 相似 skill 是否应该合并、拆分或废弃。
4. `skill.md` 是否明确写出 should-use 和 should-not-use 场景。
5. 常用 skill 是否压制了更专门的 skill。

这也反过来支持“维护 skill 的 skill”。如果每个 skill 都只关心自己，无法发现库级别的 shadowing；需要一个专门从全局视角审计 skill 库的维护角色。

## 核心内容

### 四、从论文到工程方案的推理链

#### 1. 为什么执行上下文和维护上下文必须分离

执行期 Agent 的目标是完成当前用户任务。它需要的是短路径：什么时候使用这个 skill、输入是什么、输出是什么、流程怎么走、需要读哪些 reference、完成前检查什么、出错时怎么处理。

维护期 Agent 的目标是改进 skill。它需要的是长路径：过去出过什么错、为什么改过、哪些想法还没验证、哪些测试案例会回归、哪些设计取舍不能随便改。

这两个目标需要的上下文几乎相反。执行期需要低延迟、低噪声、强指令性；维护期需要高证据密度、历史完整性、因果链条。把两者放在同一个文件里，会导致两种失败：

第一，执行文件变成历史堆。Agent 执行任务时被大量事故案例、解释和设计笔记干扰，正确路径反而不清晰。

第二，维护证据被压缩丢失。为了让 `skill.md` 看起来简洁，维护者只保留结论，不记录为什么。后续 Agent 看到一条规则，却不知道它来自哪个事故，也不知道能不能删。

所以，`skill.md` 与 `meta/` 分离不是目录审美，而是上下文经济学。`skill.md` 是执行期工作记忆；`meta/` 是维护期长期记忆。执行时不读 `meta/`，维护时必须读相关 `meta/`。

#### 2. 为什么错误现场不应该立即重构 skill

错误现场有三个偏差。

第一，任务压力偏差。Agent 正在修复当前任务，很容易把“这次任务的特殊上下文”误判为“一般规则”。

第二，用户纠正偏差。用户给出的纠正通常面向当前结果，不一定是在定义长期规范。比如用户说“这里不要展开”，可能只是这次文档不需要展开，不代表该 skill 永远要简短。

第三，证据不足偏差。一次错误无法区分偶发失误、trigger 模糊、流程缺口、工具失败或上下文污染。

因此，现场最应该做的是两件事：先把用户当前任务完成；然后把错误以结构化方式记录下来。真正的 skill 修改应该延迟到维护期，由更干净的上下文、更多 incident 和更明确的分析问题来驱动。

这并不意味着永远不能现场改 skill。高风险错误可以立即补救，例如安全边界、破坏性命令、隐私泄露、会导致数据丢失的操作。但即使立即补救，也应同时写入 incident 和 changelog，并在后续维护中复审。

#### 3. 为什么要记录很小的错误

待检验方案中还有一个看似激进的设定：哪怕是极其微不足道的错误，也应记录到对应 skill 的维护记录里。这个设定有价值，但必须被精确理解。

记录小错误的价值不在于每个小错误都值得修改 skill，而在于小错误的重复模式能暴露系统性缺陷。单次“忘记检查文件是否存在”可能只是注意力失误；五次类似错误说明 `Quality Checklist` 或脚本校验缺失。单次“误读用户要写第二篇文档”可能是对话上下文问题；多次发生说明 skill 的输入/输出契约不清。

因此，小错误应该记录，但记录要低成本、结构化、可聚类，并且有处理状态。否则 `meta/incidents.md` 会变成另一个无限增长的垃圾堆。

合理做法是：

1. 每个 incident 只保存后续维护所需的最小证据。
2. incident 有状态：new、triaged、promoted、backlogged、rejected。
3. 多个相似小错在维护期聚类，不逐条变成规则。
4. 被确认无长期价值的 incident 可以保留索引，但不再进入活跃维护视野。

这样，“记录所有小错”不会等于“执行文件吸收所有小错”。前者是观测，后者是学习。观测要尽量完整，学习要谨慎。

#### 4. 为什么需要 `skill-maintainer`

让每个 skill 自带维护说明，表面上更分散，实际上会产生三类问题。

第一，维护规则重复。每个 skill 都要解释 incident 怎么写、changelog 怎么写、reference 怎么拆、什么时候改 `skill.md`，大量重复会导致规则漂移。

第二，缺少全局视角。单个 skill 无法判断自己是否与别的 skill 发生 trigger 重叠或 shadowing。

第三，维护者角色与执行者角色混淆。执行当前任务的 Agent 容易受当前对话污染；维护 skill 的 Agent 应该尽量在纯净上下文里工作。

`skill-maintainer` 的价值就在于把维护逻辑集中成一个可复用 skill。它不是替代目标 skill，而是为所有目标 skill 提供统一的维护协议。它应该知道：

1. 标准文件契约是什么。
2. incident 如何记录和蒸馏。
3. 什么时候改 `skill.md`、`reference/`、`scripts/`、`meta/eval.md`。
4. 如何执行迁移、审计、回归检查。
5. 如何发现 skill 库级别的 shadowing、重复和过度膨胀。

这与 SkillHone 的角色隔离思想、SkillOpt 的优化控制思想、SkillGrad 的证据驱动更新思想是一致的。

### 五、需要舍弃或降级的部分

从论文到个人工程实践，不能把所有研究机制原样搬过来。高质量方案的关键在于知道哪些部分值得保留，哪些部分成本过高。

#### 1. 舍弃完整训练式优化闭环

SkillGrad 和 SkillOpt 展示的自动优化过程很有启发，但完整复刻通常需要任务集、评估器、多轮候选生成、自动打分、回归对比和失败回滚。对个人 skill 库而言，这套系统成本过高。

保留的部分应该是“优化器思想”，不是完整训练管线。也就是：从轨迹中提取错误、聚合重复模式、做小步更新、验证不退化。

#### 2. 舍弃每次维护都跑大规模 benchmark

大规模 benchmark 对研究有效，对日常维护不经济。多数个人 skill 的任务分布高度个性化，外部 benchmark 很难覆盖真实使用场景。

更合理的是轻量 eval：每个重要 skill 保留 3 到 10 个代表性测试案例，维护后按风险选择运行。对纯格式、分类、文件结构类任务，可以自动比对；对推理和写作类任务，使用 checklist 或人工抽检。

#### 3. 舍弃执行期读取全部 meta

`meta/` 的信息很有价值，但价值发生在维护期，不发生在执行期。执行期读取 incident、design notes 和 changelog，会显著增加上下文噪声。

例外情况只有一种：当前任务本身就是维护、复盘、迁移或审计 skill。除此之外，`meta/` 不应进入普通执行上下文。

#### 4. 降级“所有 skill 必须有完整目录”的硬要求

待检验方案建议每个 skill 都有 `skill.md`、`reference/`、`scripts/`、`meta/`，且 `meta/` 下包含 incidents、changelog、backlog、eval、design_notes、cases。这在规范上很清晰，但对简单 skill 来说文件噪声偏高。

更合适的取舍是“逻辑契约统一，物理文件按需创建”。

最低要求：

```text
<skill-name>/
├── skill.md
└── meta/
    ├── incidents.md
    └── changelog.md
```

复杂或高频 skill 再增加：

```text
<skill-name>/
├── reference/
├── scripts/
└── meta/
    ├── backlog.md
    ├── eval.md
    ├── design_notes.md
    └── cases/
```

这样既保留统一维护入口，又不会为了形式完整制造空文件。

### 六、最终推荐方案：两层上下文、延迟蒸馏、有界维护

综合以上推理，本文推荐的方案可以概括为：

```text
执行期：skill.md -> 按需 reference/scripts -> 记录 incident
维护期：skill-maintainer -> 读取 meta -> 聚类诊断 -> 有界补丁 -> 轻量验证 -> changelog
```

#### 1. 标准 skill 结构

建议采用分层但不强迫全量文件的结构。

```text
<skill-name>/
├── skill.md
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

其中，`skill.md`、`meta/incidents.md`、`meta/changelog.md` 推荐作为核心文件；其他文件按复杂度和使用频率创建。

`skill.md` 是执行入口，必须短、清晰、可执行。推荐包含：

```text
# Skill Name

## Description
## Trigger
## Inputs
## Outputs
## Core Workflow
## Reference Routing
## Scripts
## Quality Checklist
## Failure Handling
```

`reference/` 存放长流程、边界情况、模板、领域说明。它可以被日常执行读取，但必须通过 `skill.md` 的 Reference Routing 指定何时读取，避免默认全读。

`scripts/` 存放可执行辅助工具。凡是机械、重复、容易出错、可验证的步骤，都优先考虑脚本化，而不是继续增加自然语言规则。

`meta/` 只在维护、迁移、复盘、审计时读取。它保存原始错误、维护记录、未决问题、评估标准、设计理由和案例。

#### 2. Incident 记录协议

当 Agent 使用某个 skill 工作时，只要发生错误、遗漏、误判、用户纠正、输出不符合预期或触发不当，就追加 incident。推荐格式如下：

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
  - [ ] skill.md
  - [ ] reference/
  - [ ] scripts/
  - [ ] meta/eval.md
  - [ ] meta/backlog.md
- Urgency: Low | Medium | High
- Notes:
```

关键原则：

1. 现场只记录最小必要证据，不做大规模重构。
2. incident 写给未来维护 Agent 看，不写给普通执行 Agent 看。
3. 小错可以记录，但不自动升级为规则。
4. 维护期要把 incident 聚类，避免逐条污染执行文件。

#### 3. Changelog 记录协议

每次维护必须更新 `meta/changelog.md`。推荐格式：

```md
## YYYY-MM-DD - 简短标题

### Changed
- 修改了什么。

### Why
- 为什么改。

### Source
- 来自哪些 incident、case、用户反馈或评估结果。

### Files touched
- `skill.md`
- `reference/...`
- `scripts/...`
- `meta/...`

### Validation
- 做了哪些检查，哪些没有做。
```

changelog 的目的不是写漂亮日志，而是防止未来 Agent 删除一条看似多余但其实很关键的规则。

#### 4. `skill-maintainer` 的职责

`skill-maintainer` 应作为一个独立 skill 存在。它的职责不是执行业务任务，而是维护其他 skill。

推荐结构：

```text
skill-maintainer/
├── skill.md
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

它至少要覆盖五类工作：

1. 创建新 skill。
2. 迁移已有 skill 到标准结构。
3. 根据 incident 迭代目标 skill。
4. 审计 skill 是否过大、过宽、过度重叠。
5. 维护自身的 incident、changelog 和 eval。

`skill-maintainer` 的核心判断规则应当是：

| 证据类型 | 推荐处理 |
|---|---|
| 短、总是相关、执行期必须知道 | 更新 `skill.md` |
| 长、条件化、低频但重要 | 更新 `reference/` |
| 机械、重复、可验证 | 新增或更新 `scripts/` |
| 证据不足、可能过拟合 | 放入 `meta/backlog.md` |
| 可形成回归测试 | 更新 `meta/eval.md` |
| 解释结构取舍 | 更新 `meta/design_notes.md` |
| 原始错误现场 | 保留在 `meta/incidents.md` |

#### 5. 纯净上下文子 Agent 维护流程

当达到维护时机时，推荐不要让当前对话里的 Agent 直接重构 skill，而是启动一个尽量纯净上下文的子 Agent。它只加载：

1. `skill-maintainer`。
2. 目标 skill 的 `skill.md`。
3. 目标 skill 的相关 `reference/` 和 `scripts/`。
4. 目标 skill 的相关 `meta/`。
5. 用户给出的维护目标。

维护流程如下：

```text
1. 读取目标 skill 的执行入口。
2. 读取 incident、changelog、backlog、eval 中与本次维护相关的部分。
3. 将问题归类为 trigger、workflow、routing、script、checklist、output contract、shadowing、one-off。
4. 聚类相似 incident。
5. 对每个候选修改判断目标文件。
6. 做有界补丁。
7. 执行轻量 validation。
8. 更新 changelog。
9. 标记 incident 状态或添加处理说明。
10. 输出维护报告。
```

这个流程的关键是“纯净上下文”和“有界补丁”。前者降低当前任务对长期维护的污染，后者降低自动修改引入退化的风险。

#### 6. 维护触发条件

维护不应每次 incident 后立即执行，也不应长期无人处理。推荐触发条件：

1. 某个 skill 累计 3 条以上同类 incident。
2. 某个 incident 被标记为 High。
3. 用户明确要求维护或迁移 skill。
4. 某个 skill 的 `skill.md` 明显膨胀，执行期阅读成本上升。
5. 新增 skill 后发现与旧 skill trigger 重叠。
6. 每隔固定周期做一次轻量巡检，例如每周或每 20 次 skill 使用后。

“合适时间节点”的本质是：证据足够多，任务压力足够低，有时间做验证。

### 七、skill 库级别的治理

单条 skill 维护好，不代表 skill 库整体好。随着 skill 数量增加，库级别问题会变成主要风险。

#### 1. Trigger 必须可区分

每个 skill 的 `Trigger` 不应只写“当需要处理文档时使用”。它应该写得足够具体：

```text
Use this skill when...
Do not use this skill when...
Prefer this skill over X when...
Prefer X over this skill when...
```

这样能降低 More Skills, Worse Agents? 所警示的 shadowing 风险。

#### 2. 定期做 shadowing 审计

`skill-maintainer` 应定期扫描所有 skill 的 description 和 trigger，找出：

1. 触发条件高度相似的 skill。
2. 一个通用 skill 覆盖了多个专用 skill 的情况。
3. 两个 skill 对同一工具或文件操作给出不同规则。
4. 新增 skill 只是在旧 skill 上补一个小分支，本应合并而不是新增。

shadowing 审计不需要复杂算法。早期用文本相似度、关键词、人工审阅和 incident 反推就足够。

#### 3. 合并、拆分和废弃机制

当两个 skill 经常被同时触发且边界不清，应考虑合并或重新划分职责。

当一个 skill 的 `Core Workflow` 出现多个互不相关的大分支，应考虑拆分。

当一个 skill 长期不用、被新 skill 替代或触发条件危险，应标记 deprecated，而不是直接删除。废弃记录应写明替代 skill 和废弃原因。

### 八、轻量 eval：保留验证，不追求完美

维护后的验证可以分三层。

L1 是结构和规则检查。比如 `skill.md` 是否包含必要章节、Reference Routing 是否存在、是否把 incident 原文塞进执行文件、是否更新 changelog。这层可以高度自动化。

L2 是任务样例检查。对重要 skill，维护 3 到 10 个典型输入和预期输出。维护后让纯净上下文 Agent 跑一遍，观察是否退化。

L3 是人工判断。对写作、分析、设计类 skill，很难完全自动判断质量。此时用 checklist 和抽检即可，不必追求伪自动化。

推荐的 `meta/eval.md` 结构：

```md
# Evaluation

## Success Criteria

## Common Failure Modes

## Regression Checklist

## Test Cases

## Shadowing Checks
```

注意，eval 的目标不是证明 skill 完美，而是避免维护把已有能力改坏。

### 九、最终文件契约

综合成本与收益，本文推荐把文件分为三层。

#### 核心层：所有长期维护的自定义 skill 都应具备

```text
skill.md
meta/incidents.md
meta/changelog.md
```

核心层解决执行入口、错误证据和修改历史三个问题。

#### 增强层：复杂、高频或高风险 skill 应具备

```text
reference/
scripts/
meta/backlog.md
meta/eval.md
```

增强层解决长规则、自动化、未决问题和回归验证。

#### 深度层：长期演化或多人维护 skill 才需要

```text
meta/design_notes.md
meta/cases/
```

深度层解决设计解释和典型案例沉淀。个人早期可以不强制创建，避免结构噪声。

这种分层比“一开始创建所有文件”更轻，也比“只有一个 skill.md”更可维护。

## 实现方案

### 十、方案的可执行版本

最终推荐方案如下。

#### 执行期规则

1. Agent 根据 description/trigger 判断是否使用某个 skill。
2. 使用时先读 `skill.md`。
3. 只在 `Reference Routing` 指示时读取 `reference/`。
4. 只在任务需要或 `Scripts` 指示时使用 `scripts/`。
5. 不读取 `meta/`，除非当前任务就是维护、审计、迁移或复盘 skill。
6. 如果 skill 执行中出错，先完成用户任务，再记录 incident。

#### 维护期规则

1. 调用 `skill-maintainer`。
2. 优先使用纯净上下文子 Agent。
3. 读取目标 skill 的 `skill.md`、必要 `reference/`、`scripts/` 和相关 `meta/`。
4. 聚类 incident，区分一次性错误和重复模式。
5. 使用决策矩阵选择更新位置。
6. 做有界修改。
7. 执行轻量验证。
8. 更新 `meta/changelog.md`。
9. 标记 incident 处理状态。
10. 输出维护报告。

#### 库级治理规则

1. 新建 skill 前先搜索是否已有相似 skill。
2. 每个 skill 的 trigger 要有正例和反例。
3. 定期检查 trigger 重叠和 skill shadowing。
4. 复杂 skill 优先拆 reference，不优先膨胀 `skill.md`。
5. 重复机械错误优先脚本化，不优先写更多自然语言提醒。
6. 废弃 skill 要标记原因和替代项，不直接删除。

### 十一、为什么这个方案是高性价比取舍

它保留了论文中最有工程价值的部分：

1. 来自 Agent Skills Survey 的模块化、按需加载和生命周期视角。
2. 来自 SkillHone 的历史证据和决策记录思想。
3. 来自 SkillGrad 的轨迹反馈、错误聚类和小步迭代思想。
4. 来自 SkillOpt 的有界编辑、验证门和拒绝修改路径。
5. 来自 More Skills, Worse Agents? 的 skill 库规模风险和 shadowing 意识。

它舍弃了对个人实践成本过高的部分：

1. 完整训练式优化系统。
2. 大规模 benchmark。
3. 每次修改的复杂自动评估。
4. 所有 skill 一开始就创建完整目录。
5. 执行期读取所有历史上下文。

它还修正了待检验方案中可能过重的地方：

1. `meta/` 的逻辑契约保留，但物理文件按需创建。
2. 小错误全部可记录，但必须有状态和聚类，不逐条升级。
3. `skill-maintainer` 保留，但它的第一职责是有界维护，不是自动重写一切。
4. `eval` 保留，但从轻量 checklist 和少量 case 开始，不追求完整测试平台。

因此，这个方案的核心不是“目录更规范”，而是建立了一个可持续的反馈循环：

```text
执行产生证据
证据进入 meta
维护期聚类诊断
诊断形成有界补丁
补丁接受轻量验证
验证结果进入 changelog 和 eval
下一次执行只读取被蒸馏后的轻量规则
```

这条闭环正好解决 skill 维护最关键的矛盾：学习需要历史，执行需要遗忘。

## 总结

### 十二、结论

最合理的 skill 维护方案不是把 skill 写得越来越长，也不是引入一套沉重的自动优化平台，而是在执行上下文和维护上下文之间建立清晰边界。

`skill.md` 应该像执行入口，短、明确、可路由。`reference/` 应该承载低频但重要的长说明。`scripts/` 应该承载机械和可验证的步骤。`meta/` 应该承载事故、历史、评估和设计理由，但只在维护期读取。`skill-maintainer` 应该作为统一维护协议，负责把原始错误蒸馏成更好的执行结构。

如果用一句话概括本文方案：

> 执行时让 Agent 少想一点，维护时让 Agent 多看一点；现场只记录，事后再蒸馏；每次只小步修改，并留下为什么。

这套方案足够轻量，可以从今天开始用于个人 skill 库；也足够完整，可以随着 skill 数量和复杂度上升逐步扩展。它并不假设某个具体框架的内部实现，因此可以迁移到 OpenClaw、Codex、Claude Code、QwenPaw 等所有带 skill 功能的 Agent 框架。

## 参考文献

1. [SkillHone](https://arxiv.org/pdf/2606.08671)
2. [Agent Skills Survey](https://arxiv.org/pdf/2602.12430)
3. [SkillGrad](https://arxiv.org/pdf/2605.27760)
4. [SkillOpt](https://arxiv.org/pdf/2605.23904)
5. [More Skills, Worse Agents?](https://arxiv.org/pdf/2605.24050)

## 元数据
- **创建时间：** 2026-06-12
- **最后更新：** 2026-06-12
- **作者：** 吉良吉影
- **分类：** Agent 工程化
- **标签：** Skill, Agent, 维护, 迭代
- **来源：** 日常记录/2026-06-12-LLM-skill论文阅读与迭代方案思考.md

---
*由吉良吉影的agent整理*
