# Unity GC 高级话题与未来展望：从托管堆优化到数据导向架构

## 摘要

本文是 Unity GC 系列文档的高级篇与收官篇，重点讨论当常规 GC Alloc 优化已经完成之后，项目还可以从哪些更高层次继续治理内存、降低卡顿风险并提升运行时性能。原始文稿围绕 ScriptableObject、静态数据、IL2CPP、C# Job System、Burst Compiler、Native Container、Addressables 以及未来技术演进进行了说明，但存在大量重复段落、部分概念表述过于绝对、若干技术定义不够准确的问题。本文在保留原始主题的基础上，对内容进行重新整理、纠错、扩写和工程化重构。

本文的核心观点是：高级 GC 优化并不是简单追求“所有代码都零 GC”，而是建立一套面向真实项目的内存治理体系。GC 问题表面上表现为 `GC.Alloc`、`GC.Collect`、托管堆增长和帧时间尖峰，本质上却与对象生命周期、资源所有权、数据布局、异步流程、跨场景缓存、资源加载策略和团队开发规范密切相关。传统的字符串优化、集合复用和对象池只能解决局部问题；当项目规模扩大后，更关键的是明确哪些数据属于托管对象图，哪些数据适合迁移到 Native Container，哪些计算适合 Job System 与 Burst，哪些资源应该由 Addressables 统一管理，哪些全局状态必须在场景切换或重新进入玩法时显式清理。

本文将首先重新界定 Unity 高级 GC 优化的边界，说明 ScriptableObject 与静态数据在减少重复实例和统一配置管理中的价值，同时指出它们并不天然等价于“无内存风险”。随后，本文会纠正 IL2CPP 与 GC 之间常见的误解：IL2CPP 改变的是脚本编译与执行后端，并不会让托管分配自动消失，也不会把 GC 问题变成 C++ 问题。接着，本文将深入说明 C# Job System、Burst Compiler 和 Native Container 如何通过数据导向设计降低托管堆依赖，并解释 Native 内存生命周期、Allocator 选择、Dispose 责任和安全检查机制。之后，本文会结合 Addressables 讨论资源生命周期管理，说明引用计数、句柄释放、实例释放、对象池和场景卸载之间的关系。最后，本文会从团队实践角度给出落地方案，包括技术选型矩阵、代码规范、性能预算、内存回归流程和未来演进方向。

本文适合作为 Unity 项目中高级内存治理、性能优化规范、技术分享材料或团队工程文档使用。它并不鼓励盲目引入复杂技术，而是强调：只有当性能瓶颈被 Profiler 证实、数据生命周期足够清晰、团队有能力维护更复杂的内存模型时，Job、Burst、Native Container、Addressables 封装和数据导向架构才真正值得投入。

## 正文

### 背景

在 Unity 项目中，GC 优化通常会经历三个阶段。第一个阶段是“发现 GC”，也就是通过 Profiler 看到 `GC.Alloc`、`GarbageCollector.CollectIncremental`、`GC.Collect` 或帧时间尖峰，并意识到托管分配会影响帧稳定性。第二个阶段是“减少 GC”，开发者会开始处理字符串拼接、LINQ、闭包、协程等待对象、物理查询数组、`ToArray`、临时集合、对象频繁创建和销毁等问题。第三个阶段才是真正的“治理 GC”：开发团队不再只盯着某一行代码是否产生几十字节分配，而是开始思考整个项目的数据形态、对象生命周期、资源加载方式、缓存释放策略、场景切换流程和高性能计算架构。

原始文稿已经触及第三个阶段，但表达上仍偏向教程式枚举：ScriptableObject 可以共享数据，IL2CPP 可以提升性能，Job System 和 Burst 可以减少 GC，Native Container 不走托管堆，Addressables 管理资源生命周期，未来 .NET 和 Unity 会继续演进。这些方向本身是对的，但如果写成简单结论，很容易在实际项目中造成误解。例如，ScriptableObject 确实适合承载静态配置，但如果把运行时状态也写回同一个 ScriptableObject 资产，可能会造成状态污染；静态缓存确实可以避免重复分配，但静态字段同时也是 GC Roots，清理不当会让对象永久存活；IL2CPP 确实能提升运行效率，但它不会改变“引用类型分配在托管堆上、仍然需要 GC 管理”的事实；Burst 确实能生成高性能原生代码，但它不是让任意 C# 业务代码自动变快的魔法开关；NativeArray 确实不会产生托管 GC Alloc，但它需要显式 Dispose，否则泄漏的是 Native 内存；Addressables 确实有引用计数，但只有在调用方正确 Release 或 ReleaseInstance 的前提下，引用计数才有意义。

因此，高级 GC 文章真正需要解决的问题不是“这些技术是什么”，而是“这些技术分别解决哪一类内存问题、边界在哪里、如何安全落地、如何验证收益”。在工业化项目里，一个技术方案只有满足三个条件才算可靠：第一，概念上正确，不把不同层次的内存混为一谈；第二，工程上可维护，不依赖个人经验和临时约定；第三，验证上可量化，可以通过 Profiler、Memory Profiler、自动化性能测试和目标机数据证明收益。

Unity 的内存大体可以分为托管内存、原生内存、图形内存和平台系统内存。GC 主要管理托管堆中的 C# 引用类型对象，例如普通 class、数组、字符串、委托、闭包、部分集合对象和协程状态机。纹理、网格、材质、音频、动画、物理对象、渲染缓冲、AssetBundle 内容和引擎内部资源通常涉及 Native 内存或显存，它们的生命周期不能简单交给 C# GC 处理。一个项目内存上涨，可能是托管对象没有释放，也可能是 Addressables 句柄没有 Release，也可能是 RenderTexture 没有释放，也可能是对象池容量过大，也可能是场景资源卸载时机不正确。把所有问题都归因于 GC，会导致诊断方向错误；反过来，只优化 GC Alloc 而不治理资源生命周期，也无法真正解决内存压力。

高级 GC 优化还必须考虑目标平台。PC 和主机平台通常有较强 CPU 和内存余量，短时间的托管分配未必造成明显卡顿；移动设备、低端安卓机、Switch、VR/AR 设备对帧稳定性和内存峰值更敏感，微小分配在长时间运行后也可能触发频繁回收。60 FPS 下每帧预算约 16.67ms，90 FPS 下每帧预算约 11.11ms，120 FPS 下每帧预算约 8.33ms。越高刷新率的项目，越不能依赖“偶尔卡一下没关系”的心态。GC 本身不是错误，错误的是在错误的时机、错误的频率、错误的对象规模下触发 GC。

从团队协作角度看，GC 优化也不能依靠口头经验。成熟项目需要有分配预算，例如战斗运行中每帧托管分配接近 0，主城待机持续分配必须低于指定阈值，大型 UI 打开允许一次性分配但关闭后对象数量应回落，场景切换可以集中卸载与回收但不得在可交互阶段触发大尖峰。这样的预算必须进入性能验收流程，而不是等玩家反馈卡顿之后再排查。所谓高级 GC 话题，本质上就是把“写代码时少 new 一点”升级成“全项目可持续的内存治理机制”。

### 核心内容

#### 1. 高级 GC 优化的核心边界：不是消灭 GC，而是降低托管堆依赖

很多团队在性能压力下会提出“零 GC”的目标。这个目标在口号上很有力量，但在工程上需要拆解。真正可执行的目标通常不是全项目绝对零分配，而是在关键运行路径上避免持续托管分配，在非关键阶段控制分配峰值，在生命周期边界显式清理对象和资源，在目标设备上证明帧时间稳定。

高级 GC 优化首先要区分三类成本。

第一类是分配成本。每次创建托管对象，运行时都需要在托管堆中分配空间并维护元数据。单次分配成本可能很小，但高频分配会累积成明显 CPU 开销。

第二类是回收成本。GC 需要从 GC Roots 出发扫描对象图，判断哪些对象仍然可达。对象越多、引用关系越复杂、托管堆越大，扫描和标记成本通常越高。增量 GC 可以把部分工作拆到多帧，但不会让对象图扫描凭空消失。

第三类是生命周期成本。对象被谁引用、何时释放、是否跨场景存活、是否被静态事件持有、是否被异步任务闭包捕获、是否进入对象池后仍然引用旧资源，这些问题决定了对象能否被回收。许多“内存泄漏”不是 GC 不工作，而是对象仍然可达。

因此，高级优化的方向有三条：减少不必要的托管分配，缩短临时对象生命周期，降低核心系统对托管对象图的依赖。ScriptableObject、静态缓存、对象池、Addressables 封装、Job System、Burst、Native Container、DOTS/ECS 都是在不同层面服务这三条方向。

需要特别注意的是，“不走 GC”不等于“不需要管理”。NativeContainer 不走托管 GC，但需要 Dispose；Addressables 有引用计数，但需要 Release；对象池减少分配，但增加常驻内存；静态缓存避免重复创建，但可能造成永久引用；ScriptableObject 共享配置，但可能带来全局可变状态风险。高级优化不是把问题变没，而是把问题从“运行时隐式成本”转换为“架构上显式管理的成本”。

#### 2. ScriptableObject：适合共享静态配置，但不能滥用为运行时状态容器

ScriptableObject 是 Unity 项目里非常常用的数据资产形式。它独立于 GameObject 存在，可以作为技能配置、怪物配置、道具配置、数值表、关卡参数、音效映射、UI 主题、行为树配置等静态数据载体。合理使用 ScriptableObject 可以减少场景对象和 Prefab 上的重复配置，让多个运行时对象共享同一份只读数据。

例如，如果每个怪物 Prefab 上都写一份怪物名称、基础生命、基础攻击、移动速度、掉落表和特效引用，那么当同类型怪物数量变多时，数据会分散在多个 Prefab 或多个组件上，维护成本和内存占用都会上升。把这些稳定配置抽成 `EnemyConfig : ScriptableObject` 后，所有同类型敌人都可以引用同一个配置资产。运行时敌人只保存当前血量、当前目标、AI 状态等实例状态，静态配置则通过引用读取。

更推荐的数据拆分方式是：

```csharp
// 静态配置：由资产承载，运行时原则上只读
EnemyConfig
    id
    displayName
    maxHp
    moveSpeed
    skillIds
    prefabRef

// 运行时状态：由实例承载，可以频繁变化
EnemyRuntimeState
    currentHp
    currentTarget
    currentSkillCooldown
    behaviorState
```

这种拆分的收益不只是减少重复数据，更重要的是明确了“配置”和“状态”的所有权。配置属于资源系统和策划数据，状态属于运行时实体。配置可共享，状态不可共享。配置可以跨场景复用，状态应该随实体销毁而释放。配置变更需要版本管理，状态变更需要生命周期管理。

ScriptableObject 对 GC 的帮助主要体现在间接层面。它不是因为自身“不会占内存”，而是因为它减少了运行时重复创建配置对象、重复解析配置、重复构造数据表的需求。比如技能系统初始化时，如果每次进入战斗都从 JSON 字符串解析出一批 class 对象，就会产生大量托管分配；如果构建流程提前把稳定配置转换成 ScriptableObject 或其他二进制数据资产，运行时只加载并引用，GC 压力会明显下降。

但 ScriptableObject 也有几个常见风险。

第一，运行时修改资产对象。ScriptableObject 是引用对象，多个使用方可能共享同一个实例。如果某个系统在运行时把临时状态写入配置资产，例如 `config.currentHp = 50`，那么所有引用该配置的对象都可能看到这个变化。编辑器运行时甚至可能出现资产被脏标记或状态残留的问题。正确做法是：ScriptableObject 保持只读，运行时状态放到单独实例。

第二，ScriptableObject 持有大对象引用。一个配置资产如果直接引用大量纹理、Prefab、音频或子配置，会导致加载该配置时把依赖链也拉入内存。配置共享减少了重复，但也可能扩大单次加载范围。对于大型项目，应区分“轻量索引配置”和“重资源引用配置”。轻量配置可以常驻，重资源应通过 Addressables、AssetReference 或延迟加载机制管理。

第三，把 ScriptableObject 当成全局单例。很多团队会用 ScriptableObject 做事件频道、全局配置、运行时变量容器。这种模式可用，但必须有清晰的重置时机。如果它跨场景常驻，并且内部保存运行时对象引用，就可能成为隐藏 GC Roots。比如一个全局事件频道保存了 UI 面板回调，但面板关闭时没有反注册，那么这个面板无法被回收。

第四，热更新和远程配置边界。ScriptableObject 适合 Unity 资源管线，但如果项目有服务器下发配置、Lua/ILRuntime/HybridCLR 热更或外部表格系统，ScriptableObject 不一定是唯一答案。它可以作为编辑器期资产，也可以作为构建期缓存，但运行时配置的更新策略要结合项目架构决定。

因此，ScriptableObject 的正确定位是：它是静态数据共享和编辑器资产管理工具，不是 GC 优化银弹。它能降低重复配置实例、减少运行时构建对象、提升数据管理规范性；但如果混入运行时状态、重资源引用和全局事件引用，也会变成内存泄漏源。

#### 3. 静态数据与全局缓存：减少重复分配的同时，也扩大了存活范围

静态字段、静态集合、静态事件和单例缓存是 Unity 项目中非常常见的工具。它们可以减少重复分配、减少查找成本、提供全局访问入口。例如缓存常用 `WaitForSeconds`、缓存字符串常量、缓存 ID 映射表、缓存对象池、缓存配置字典、缓存组件注册表等。

静态数据的优势很明显：初始化一次，多处复用；访问路径短；避免频繁构造；适合作为不可变表、常量映射和全局服务入口。问题在于，静态字段天然接近 GC Roots。只要静态字段还引用某个对象，该对象及其引用链就无法被 GC 回收。一个静态 List 如果不断添加场景对象但不清理，那么场景对象即使 Destroy 了，托管包装对象和相关引用仍然可能残留。一条静态事件如果保存了某个 MonoBehaviour 的实例方法委托，而该组件销毁时没有取消订阅，这个组件就可能长期存活。

静态缓存最危险的地方是“看起来不像泄漏”。普通对象泄漏往往会随着场景切换、功能打开关闭暴露出来，而静态缓存经常被视为正常常驻数据。直到玩家长时间游玩、多次进入退出战斗、多次打开关闭 UI 后，Memory Profiler 中某些 View、Controller、Item、Coroutine 状态机、Closure 对象数量持续增长，才发现静态集合或静态事件持有了它们。

工程上应建立静态数据分级。

第一类是不可变静态数据，例如数学常量、字符串常量、枚举到名称的映射、纯函数工具类。这类数据可以常驻，风险较低。

第二类是可重建缓存，例如 ID 到配置的字典、路径到资源句柄的索引、临时格式化缓冲池。这类缓存应提供 `Clear`、`Rebuild` 或 `Reset` 方法，在退出玩法、账号切换、语言切换、资源版本更新时可清理或重建。

第三类是运行时对象注册表，例如当前场景内敌人列表、UI 面板栈、全局事件订阅、任务回调表。这类对象绝不能无边界常驻。它们必须有明确 owner，并在 owner 生命周期结束时清理。

推荐规范如下：

```csharp
// 可以常驻：不可变或只读表
static readonly Dictionary<int, string> ErrorNames;

// 可以缓存：但必须支持重置
static Dictionary<int, Config> ConfigCache;
static void ClearConfigCache();

// 高风险：保存运行时对象引用
static readonly List<MonoBehaviour> ActiveViews;
static event Action GlobalEvent;
```

在 Unity 编辑器中还需要考虑 Domain Reload 设置。为了加快进入 Play Mode，很多项目会关闭 Domain Reload。关闭后，静态字段不会在每次进入 Play Mode 时自动恢复默认值，静态集合和事件订阅可能保留上一次运行的数据。这会让编辑器中的问题和真机问题表现不一致。对于关闭 Domain Reload 的项目，应使用 `RuntimeInitializeOnLoadMethod` 或统一的启动框架显式重置静态状态。

示例规范：

```csharp
[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
static void ResetStatics()
{
    GlobalCache.Clear();
    GlobalEvent = null;
    RuntimeIdAllocator.Reset();
}
```

这里的重点不是某个 API，而是意识：静态字段不是“免费对象”，它只是把分配从多次变成一次，同时把生命周期扩展到全局。高级内存治理必须为静态数据建立 owner、清理时机和审计机制。

#### 4. IL2CPP：改变脚本执行后端，不改变托管分配语义

IL2CPP 是 Unity 的脚本后端之一，它会把 IL 转换为 C++，再由平台 C++ 编译器编译成原生代码。它带来的收益主要在执行效率、平台兼容性、AOT 支持和发布性能稳定性上。对于 iOS 等不允许 JIT 的平台，IL2CPP 也是实际发布中的常见选择。

但必须明确：IL2CPP 并不会让 C# 代码里的引用类型分配消失。`new SomeClass()` 仍然是托管对象分配；字符串、数组、委托、闭包、协程状态机、LINQ 迭代器仍然可能进入托管堆；GC 仍然需要判断对象可达性并回收垃圾。IL2CPP 改变的是代码如何被编译和执行，不是把 C# 内存模型替换成 C++ 手动内存模型。

原始文稿里“IL2CPP 仍然使用 Mono 的垃圾回收器”这样的说法需要谨慎处理。更准确的表述是：Unity 的托管运行时和 GC 实现会随版本、平台和脚本后端变化而有具体差异；但从开发者角度看，IL2CPP 不改变托管对象需要 GC 管理的事实，也不让 GC Alloc 自动归零。写出高频分配代码，在 IL2CPP 下仍然会分配；在 Mono 下无分配的代码，在 IL2CPP 下也不应凭空产生同等意义上的托管分配，除非涉及平台、API 或编译差异。

IL2CPP 对 GC 优化的间接帮助主要有三点。

第一，普通脚本执行效率可能更高。相同逻辑耗时降低后，帧预算更充裕，GC 或增量 GC 切片造成的影响可能更容易被吸收。但这不是减少分配，而是降低总体 CPU 压力。

第二，AOT 模式消除了运行时 JIT 编译开销。某些反射、泛型、动态调用和表达式树场景在 AOT 下还会受到限制，这会倒逼项目减少过度动态化的代码路径。间接地，这可能减少一部分运行时生成和缓存对象的需求。

第三，发布环境更接近最终平台。很多 GC 问题在 Editor 下和真机下表现不同。Editor 有额外对象、编辑器扩展、Inspector、Domain、调试信息和编辑器 API；Mono 与 IL2CPP 的调用栈和优化结果也可能不同。最终性能验收必须基于目标平台 Development Build 或 Profile Build，而不能只看 Editor Profiler。

IL2CPP 也会带来排查复杂度。调用栈可能不如 Mono 下直观，泛型代码膨胀、反射裁剪、AOT 限制、符号文件、崩溃堆栈解析都会影响调试体验。对于 GC 分配问题，建议在开发期先用 Editor 和 Mono 快速定位明显分配，再用 IL2CPP Development Build 在目标设备上确认真实帧时间和内存曲线。不要因为 Editor 中有 GC Alloc 就直接下结论，也不要因为 IL2CPP 发布包帧率更好就忽略长期分配。

一句话总结：IL2CPP 是性能和发布后端的重要选择，但它不是 GC 优化策略本身。它可以让执行更快，却不会替你管理对象生命周期；它可以提升发布性能，却不会修复静态事件泄漏；它可以优化机器码，却不会把托管对象变成 NativeArray。

#### 5. C# Job System：把计算从对象图迁移到数据块

C# Job System 解决的问题不是“让任意代码多线程运行”，而是为可拆分、数据明确、无托管对象依赖的计算提供安全调度模型。它适合大量重复、彼此独立或依赖关系明确的数据处理，例如粒子更新、寻路网格计算、碰撞候选筛选、动画采样辅助、批量数值模拟、可见性计算、布阵评估、地形数据处理等。

传统面向对象写法往往是：

```csharp
foreach (var enemy in enemies)
{
    enemy.UpdateAI();
    enemy.UpdateMove();
    enemy.UpdateSensor();
}
```

这里的 `enemy` 通常是 class 或 MonoBehaviour，它背后可能引用 Transform、Animator、NavMeshAgent、技能组件、Buff 列表、目标对象和事件系统。对象图复杂、引用分散、数据局部性差，也难以安全并行。GC 需要面对大量相互引用的托管对象，CPU 缓存也不友好。

Job System 鼓励把数据拆成连续数组：

```csharp
positions[i]
velocities[i]
states[i]
targets[i]
```

计算逻辑变成：

```csharp
job.Execute(i):
    velocity = ComputeVelocity(position[i], target[i], state[i])
    position[i] += velocity * deltaTime
```

这种结构的优势是：数据连续、适合缓存、适合批处理、适合多线程、适合 Burst 优化，并且核心数据不再依赖托管对象图。对于 GC 来说，这意味着大量运行时计算数据可以从托管堆迁移到 NativeContainer，减少托管分配和扫描压力。

但 Job System 有严格边界。Job 中不能随意访问托管对象，不能直接操作大多数 UnityEngine.Object，不能在工作线程调用主线程 API，不能捕获复杂引用类型，不能随意读写共享数据。这样的限制不是缺陷，而是安全并行的前提。凡是必须访问 Transform 层级、GameObject 生命周期、UI、Animator 状态机、Addressables 句柄、网络对象、脚本回调的逻辑，都需要谨慎拆分，把可并行的纯计算部分放进 Job，把对象操作留在主线程。

典型的落地方式是“三段式”。

第一段，主线程收集输入。把 MonoBehaviour、Transform、配置对象中的必要数据采样到 NativeArray 或其他 NativeContainer。

第二段，调度 Job 计算。Job 只处理值类型数据，不访问托管对象，不进行资源加载，不发事件，不写 UI。

第三段，主线程应用结果。Job 完成后，把结果写回 Transform、动画参数、渲染数据或业务对象。

伪代码如下：

```csharp
// 主线程：采样
for each entity:
    inputPositions[i] = entity.Position
    inputTargets[i] = entity.TargetPosition
    inputParams[i] = entity.Config.MoveParam

// 工作线程：计算
MoveJob.Execute(i):
    outputPositions[i] = Integrate(inputPositions[i], inputTargets[i], inputParams[i])

// 主线程：应用
for each entity:
    entity.SetPosition(outputPositions[i])
```

这个模型不是所有系统都适合。少量对象、低频逻辑、强依赖 Unity API 的逻辑，引入 Job 可能得不偿失。Job 的收益来自规模、重复性和数据独立性。几十个对象的简单循环未必值得改；几千个单位的批量计算、上万粒子的模拟、大量网格或寻路数据处理，则很可能受益明显。

#### 6. Burst Compiler：高性能原生代码生成，但不是托管业务逻辑加速器

Burst 是 Unity 高性能技术栈中的关键组件。它会将符合条件的 IL/.NET bytecode 通过 LLVM 编译成高度优化的原生代码，常与 Job System 配合使用。它擅长优化数学计算、循环、向量化、数据并行和结构体数据处理。它并不是普通意义上“在运行时帮你 JIT 所有 C# 代码”的工具，也不是让 MonoBehaviour 业务逻辑自动变快的开关。

Burst 的价值来自几个方面。

第一，生成高度优化的机器码。对于数学密集型代码，Burst 可以利用 LLVM 优化、SIMD 指令、循环优化和内联策略，让相同算法获得远高于普通托管执行的性能。

第二，配合 NativeContainer 和 Job System 避免托管对象。Burst 编译的 Job 通常使用 struct、NativeArray、NativeList、NativeHashMap 等数据结构。这样的代码天然减少托管堆依赖。

第三，提升确定性和可预测性。Burst 对允许的语言特性有约束，这会迫使代码更接近纯计算函数。越少隐藏分配、越少虚调用、越少复杂引用，性能越容易预测。

但 Burst 也有使用边界。它不支持任意托管对象访问，不适合直接写 UI、资源加载、日志拼接、事件派发、复杂反射、LINQ、协程或常规 GameObject 生命周期逻辑。很多业务系统不能“整体 Burst 化”，只能把其中的计算核心抽出来。

推荐思路是“业务层不 Burst，计算核 Burst”。例如技能系统中的目标筛选、范围检测、权重评分、弹道采样可以 Burst；但技能释放流程、动画播放、特效加载、UI 提示、网络同步仍然留在主线程业务层。AI 系统中的评分函数和路径候选计算可以 Burst；但行为树节点状态、黑板对象、事件回调未必适合直接进入 Burst。

示例结构：

```csharp
// 业务层：托管对象，负责流程
SkillSystem
    collect candidates
    build NativeArray input
    schedule Burst job
    complete
    apply selected results
    play animation and effects

// 计算层：Burst + Job，负责纯计算
[BurstCompile]
TargetScoreJob
    input: positions, hp, distance, weights
    output: scores
```

这样的分层可以避免两种极端。第一种极端是完全不使用 Burst，导致大量可并行计算压在主线程；第二种极端是为了 Burst 强行重写全部业务，导致架构复杂、调试困难、收益不稳定。工业项目里更务实的方案是：先用 Profiler 找到计算热点，再抽取稳定、纯净、数据量大的核心函数，最后用 Burst 和 Job 加速。

Burst 对 GC 的意义也要准确表达：Burst 本身不是 GC 回收器，也不负责减少已有托管对象的扫描；它通过限制托管对象、鼓励 Native 数据和提升执行效率，间接减少 GC 压力和 CPU 压力。真正的收益来自“数据迁移 + 计算加速”的组合，而不是单独加一个 `[BurstCompile]` 特性。

#### 7. Native Container：避开托管堆的同时，接管生命周期责任

Native Container 是 Unity 提供的一组用于 Native 内存的容器，如 NativeArray、NativeList、NativeHashMap、NativeQueue、NativeStream 等。它们通常是 struct 包装器，底层数据分配在非托管内存中，因此不会作为普通 C# 对象进入托管堆，也不会产生同等意义上的托管 GC Alloc。它们是 Job System 和 Burst 编程的重要基础。

Native Container 的核心优势包括：数据连续、缓存友好、可传入 Job、安全系统可检测读写冲突、减少托管堆对象数量、适合大规模批量计算。对于大量数值数据，它通常比 List<class> 或复杂对象图更适合性能敏感场景。

但 Native Container 的代价同样明确：你必须管理生命周期。托管对象忘记释放，GC 最终可能回收；Native 内存忘记 Dispose，就会造成 Native 内存泄漏。Unity 的安全检查和 Leak Detection 能在开发期帮助发现问题，但最终工程规范不能依赖“报错后再修”。

Allocator 的选择是 Native Container 使用中的基础问题。

`Allocator.Temp` 适合极短生命周期的临时分配，通常不能传入 Job，要求在很短范围内释放。它分配快，但生命周期限制严格。

`Allocator.TempJob` 适合短期 Job 数据，生命周期可以跨越 Job 执行，但不应长期持有。它适合单次计算流程的输入输出缓冲。

`Allocator.Persistent` 适合长期存在的数据，例如一个系统整个生命周期都使用的 NativeArray、常驻空间索引、持久寻路图、粒子模拟缓冲等。它分配释放成本较高，但生命周期长。

推荐的工程规则是：能用 Temp 的不提升到 TempJob，能用 TempJob 的不提升到 Persistent；使用 Persistent 必须有明确 owner；owner 的 OnDestroy、Dispose 或系统退出流程中必须释放；跨帧持有的容器必须在命名、注释或封装类型中说明生命周期。

可以定义一个 owner 模式：

```csharp
class NativeBufferOwner : IDisposable
{
    NativeArray<float> values;
    bool created;

    void Create(int count)
    {
        Dispose();
        values = new NativeArray<float>(count, Allocator.Persistent);
        created = true;
    }

    public void Dispose()
    {
        if (created && values.IsCreated)
            values.Dispose();

        created = false;
    }
}
```

在 MonoBehaviour 中：

```csharp
void OnEnable()
{
    bufferOwner.Create(capacity);
}

void OnDisable()
{
    bufferOwner.Dispose();
}

void OnDestroy()
{
    bufferOwner.Dispose();
}
```

这里的重复 Dispose 不是浪费，而是防御。Unity 项目生命周期复杂，场景卸载、对象禁用、异常中断、编辑器停止运行都可能改变调用顺序。Native 内存管理应尽量具备幂等性。

Native Container 还需要关注容量策略。NativeList 动态扩容可能分配 Native 内存，不产生托管 GC，但仍然有 CPU 和内存成本。若一个系统每帧创建 TempJob NativeArray，虽然没有 GC Alloc，但依然可能造成 Native 分配压力。不要把“Profiler 里 GC Alloc 为 0”误解为“没有分配成本”。高级性能分析要同时看托管分配、Native 内存、Allocator 开销、Job 调度成本和总帧时间。

另一个常见风险是数据同步。Job 异步执行期间，主线程不能随便读写同一容器。`Complete()` 过早会让并行失去意义，`Complete()` 过晚会造成数据不可用或生命周期冲突。Job 依赖链必须清晰，NativeContainer 的读写权限要正确标注 `[ReadOnly]`、`[WriteOnly]` 等。GC 优化不能以数据竞争和偶现崩溃为代价。

#### 8. DOTS/ECS：从对象生命周期问题转向数据生命周期问题

DOTS 和 ECS 经常被描述为“从根本上解决 GC 问题”的方向。这个说法有一定道理，但也容易过度简化。ECS 的核心不是“没有 GC”，而是把实体数据组织为更紧凑、更连续、更适合批处理的形式，把传统 GameObject + MonoBehaviour 的对象图转化为组件数据块和系统处理流程。这样确实可以减少大量托管对象和引用关系，降低 GC 压力并提升 CPU 缓存效率。

传统对象模型中，每个敌人可能有一个 MonoBehaviour、若干组件、多个引用字段、多个事件订阅和多个集合。ECS 模型中，位置、速度、生命、阵营、状态等数据可以作为组件数据按 Archetype 分块存储。系统按组件查询批量处理数据。这样做的性能优势来自数据布局，而不只是“不 new class”。

但 ECS 并不适合所有项目或所有系统。它要求团队接受数据导向设计、系统化思维、组件拆分、BlobAsset、Entity 生命周期、Baking、SubScene、调试工具和新的工作流。对于已经大量基于 GameObject、Animator、UGUI、第三方插件和传统对象架构的项目，全面迁移 ECS 成本很高。更现实的方案是局部引入数据导向思想：把高频、大规模、纯计算的数据从对象图中剥离出来，用 NativeContainer + Job + Burst 处理；其他强业务、强表现、强 Unity API 依赖的部分继续保留传统架构。

例如战斗系统可以保持技能释放、表现驱动和网络同步为传统对象系统，但将目标筛选、空间查询、弹道预测、伤害预估、Buff 批量衰减等模块数据化。这样能在不推翻项目架构的前提下获得大部分性能收益。

高级 GC 文章讨论 DOTS 时应避免两种错误。第一，不要把 DOTS 写成所有项目的唯一未来。很多商业项目仍然会长期混合使用 GameObject 和数据导向模块。第二，不要把 DOTS 只理解成性能插件。它是一种架构方式，引入后会影响数据建模、调试、团队分工和资源管线。只有当团队愿意为这种复杂度付出成本时，它才是收益。

#### 9. Addressables：管理资源引用计数，不替代对象生命周期设计

Addressables 是 Unity 资源管理体系中的重要工具，适合处理动态加载、远程内容、AssetBundle 依赖、资源引用计数和异步加载。它对 GC 优化的意义不是“减少托管分配”，而是帮助项目更系统地管理资源生命周期，避免资源重复加载、忘记卸载和引用链混乱。

Addressables 的核心概念是句柄和引用计数。调用 `LoadAssetAsync` 会获得一个 AsyncOperationHandle，并增加相关资源的引用关系；当不再使用时，需要调用 `Addressables.Release(handle)`。调用 `Addressables.InstantiateAsync` 创建实例后，通常应使用 `Addressables.ReleaseInstance(instance)` 或对应句柄释放实例。只有加载方和实例方都正确释放，资源引用计数才可能归零，底层资源才有机会卸载。

常见错误包括：

第一，只 Destroy 实例，不 Release Addressables 句柄。这样 GameObject 看似销毁了，但资源引用计数仍然存在，Bundle 或资产无法卸载。

第二，Release 了资产句柄，但仍有实例引用资源。比如多个对象使用同一个材质、纹理或 Prefab，释放某个句柄并不代表所有资源立刻消失。引用计数和 Unity 对象引用链都要考虑。

第三，使用对象池后忘记实例释放。对象池会让实例长期存活，这意味着 Addressables 实例对应的资源引用也长期存在。池化是有意常驻，不是泄漏；但池容量、清理时机和场景退出释放必须明确。

第四，加载配置资产时拉起大量重依赖。一个 Addressable 配置如果直接引用一堆 Prefab、贴图、音频，加载配置可能会间接加载大量资源。应区分轻量配置引用和重资源句柄，必要时使用 AssetReference 延迟加载。

第五，在高频路径中反复 Load/Release。同一资源短时间频繁加载释放，会造成异步调度、引用计数变化和潜在内存抖动。更好的方式是根据场景或玩法阶段预加载，使用期间复用，阶段结束统一释放。

推荐建立资源 owner 规则：谁发起 Load，谁负责 Release；谁创建实例，谁负责 ReleaseInstance；如果所有权转移，必须在代码结构中表达出来。不要让资源句柄散落在任意业务脚本中，也不要让多个系统同时认为自己拥有同一个句柄。

示例封装思路：

```csharp
AssetHandleOwner<T>
    handle
    asset
    isLoaded

    LoadAsync(key)
    GetAsset()
    Release()

InstanceHandleOwner
    instance
    handle

    InstantiateAsync(key)
    DespawnOrRelease()
```

对象池结合 Addressables 时，可以采用“池 owner 持有资源”的模式。池初始化时加载 Prefab 并预创建实例；池运行期间实例只 SetActive true/false；玩法或场景结束时，池释放全部实例并 Release Prefab 句柄。这样引用关系清晰，性能也稳定。

Addressables 与 GC 的关系还体现在托管包装对象和资源卸载之间。释放 Addressables 句柄不一定立即让托管堆下降，也不一定立即降低显存。Unity 资源卸载、引用计数归零、Unused Assets 清理、GC 和平台内存归还之间存在多个阶段。Profiler 分析时不能只看一个指标，要同时观察 Managed Heap、Native Objects、Textures、Meshes、Audio、AssetBundle、Total Reserved 和场景对象数量。

#### 10. 异步、任务和生命周期：高级 GC 泄漏的隐藏来源

高级 GC 问题中，异步流程经常比普通 `new` 更难排查。协程、async/await、UniTask、Addressables async handle、网络请求、延迟回调、Timer、Tween、动画事件和 UI 事件都可能持有对象引用。即使某段代码没有每帧分配，也可能因为异步回调持有旧对象而导致生命周期泄漏。

典型问题如下。

UI 面板关闭后，某个异步加载还没结束。加载完成回调捕获了面板对象，于是面板无法释放；如果回调最终执行，还可能把结果写回已关闭的 UI。

```csharp
async void OpenPanel()
{
    var icon = await LoadIconAsync(id);
    this.iconImage.sprite = icon; // this 被捕获
}
```

对象池回收后，旧异步任务仍然在运行。等任务完成时，它把旧结果写入已经被复用给新对象的组件，造成串状态。

协程启动后没有在 OnDisable 或 OnDestroy 停止。协程状态机持有 this、局部变量、等待对象和临时引用，导致对象关闭后仍然存活。

Tween 或事件系统保存了 Lambda 回调，Lambda 捕获了界面或实体，关闭时没有 Kill 或 Unsubscribe，导致整个对象图残留。

这些问题不是传统“减少 GC Alloc”能解决的。它们需要生命周期治理。建议所有异步任务都绑定 owner；owner 失效时取消任务；回调执行前检查版本号或 cancellation token；对象池复用时递增 generation，旧回调只能写回同一 generation 的对象。

伪代码：

```csharp
class PooledView
{
    int version;
    CancellationTokenSource cts;

    void OnSpawn()
    {
        version++;
        cts = new CancellationTokenSource();
    }

    async Task LoadAsync()
    {
        int capturedVersion = version;
        var data = await RequestAsync(cts.Token);

        if (capturedVersion != version)
            return;

        if (cts.IsCancellationRequested)
            return;

        Apply(data);
    }

    void OnDespawn()
    {
        cts.Cancel();
        cts.Dispose();
        cts = null;
        ClearReferences();
    }
}
```

这样的代码看起来比简单 await 麻烦，但在工业项目里非常必要。高级内存治理关注的不只是分配，还关注“旧流程何时停止、旧引用何时释放、旧结果是否允许写回”。

#### 11. 未来展望：Unity GC 优化会从语法技巧转向数据与工具链治理

未来 Unity 项目的 GC 优化会逐渐从“避免某些 C# 语法”转向“数据布局、运行时升级、工具链分析和自动化约束”。

第一，Unity 的 .NET 运行时会继续演进。随着 Unity 对现代 .NET 特性的支持增强，开发者可用的语言和库能力会提升，例如更好的 Span/Memory 支持、更多无分配 API、更完善的泛型优化和更现代的基础库。但运行时升级不会消灭性能意识。新的 API 可以减少某些分配，项目仍然需要判断热路径、生命周期和目标平台表现。

第二，增量 GC 会继续成为默认意义上的帧稳定性工具。它能把 GC 工作分摊到多帧，减少单次尖峰，但不会减少业务代码产生的垃圾总量。未来即使 GC 更智能，少分配、少持有、少复杂引用仍然是实时应用的核心原则。

第三，Profiler 和 Memory Profiler 会越来越重要。大型项目无法依靠人工肉眼检查所有代码。更可靠的方向是建立自动化性能测试、采集关键场景 GC Alloc、托管堆、Native 内存、资源数量、帧时间 P95/P99，并在持续集成中发现回归。性能优化会从个人经验转向数据化流程。

第四，数据导向设计会更多地进入局部系统。并不是所有项目都会全面 ECS 化，但越来越多系统会使用 NativeContainer、Job、Burst 或自定义数据块处理高频计算。表现层和业务层仍可保持对象模型，计算层和数据层会更偏连续内存和批处理。

第五，资源管理会更强调引用所有权。Addressables、AssetBundle、对象池、场景系统、UI 系统和热更新框架之间的边界会更清晰。谁加载、谁释放；谁池化、谁清空；谁常驻、谁卸载；这些规范会比某个局部优化技巧更重要。

第六，代码生成和静态分析会成为 GC 治理辅助工具。团队可以通过 Roslyn Analyzer、代码扫描、编译期规则、性能测试脚本识别热路径中的 LINQ、闭包、字符串插值、`ToArray`、`new List`、`GetComponents` 数组版本和未释放 NativeContainer。越大的项目越不能只靠 Code Review 记忆。

总之，Unity 高级 GC 优化的未来不是“开发者再也不用管内存”，而是“工具和架构会帮助开发者以更明确的方式管理内存”。实时游戏对帧稳定性的要求不会降低，移动设备和跨平台发布的约束也不会消失。真正可靠的团队会把 GC 优化变成工程流程，而不是临时救火。

### 实现方案

#### 1. 建立高级内存治理分层

项目应把内存治理拆成四层，而不是把所有问题都叫 GC 问题。

第一层是代码级托管分配治理。目标是减少热路径中的字符串、集合、闭包、LINQ、装箱、协程状态对象和临时数组。这一层适合用 CPU Profiler、GC Alloc 列、ProfilerRecorder 和代码审查处理。

第二层是对象生命周期治理。目标是确保 UI、实体、对象池、异步任务、事件订阅、静态缓存和单例引用能够在正确时机释放。这一层适合用 Memory Profiler 快照对比、引用链分析和生命周期测试处理。

第三层是资源生命周期治理。目标是确保 Addressables、AssetBundle、贴图、网格、音频、材质、RenderTexture、场景和池化实例有明确 owner。这一层适合用 Memory Profiler、Addressables Event Viewer、资源引用计数日志和场景切换测试处理。

第四层是数据架构治理。目标是将高频大规模计算从托管对象图迁移到 NativeContainer、Job、Burst 或数据导向模块。这一层需要通过性能热点分析、技术验证、代码封装和团队培训逐步推进。

可以形成如下决策表：

| 问题表现 | 优先排查方向 | 推荐工具 | 可能方案 |
| :--- | :--- | :--- | :--- |
| 每帧持续 GC Alloc | 热路径分配 | CPU Profiler / GC Alloc 列 | 缓存、复用、NonAlloc API、移除 LINQ/闭包 |
| 偶发大 GC spike | 阶段性分配峰值 | Timeline / Profiler | 预加载、分帧构建、Loading 阶段集中处理 |
| UI 关闭后对象不减少 | 引用链泄漏 | Memory Profiler | 解绑事件、取消异步、清理对象池引用 |
| 场景切换后资源不降 | 资源句柄未释放 | Memory Profiler / Addressables 日志 | Release / ReleaseInstance / 清池 / 卸载场景 |
| 大规模计算主线程耗时高 | 数据布局和并行问题 | Profiler Timeline | Job + Burst + NativeContainer |
| Native 内存增长 | Dispose 缺失或池过大 | Memory Profiler / Leak Detection | Owner 封装、Dispose 流程、容量预算 |

#### 2. ScriptableObject 使用规范

项目中应明确 ScriptableObject 的使用边界。

第一，配置资产默认只读。运行时系统不得把临时状态写入配置资产。若确实需要运行时副本，应显式 `Instantiate` 一份运行时对象，或转换成 RuntimeData。

第二，配置与状态分离。配置中保存基础数值、资源引用、规则参数；状态中保存当前血量、冷却、目标、进度、临时 Buff。

第三，轻重资源分离。常驻配置中不要直接引用大量重资源，尤其是贴图、Prefab、音频和大型子资产。使用 AssetReference、ID 或懒加载句柄代替直接强引用。

第四，事件型 ScriptableObject 必须有清理策略。如果用 ScriptableObject 做事件频道，订阅者必须在 OnDisable/OnDestroy 反注册，频道在场景退出时应可清空。

第五，禁止在热路径中频繁创建 ScriptableObject 实例。ScriptableObject 是资产和配置工具，不是替代普通临时对象的容器。

推荐结构：

```csharp
// 资产层
SkillConfig : ScriptableObject
    SkillId
    BaseCooldown
    DamageFormulaId
    EffectAssetReference

// 运行时层
SkillRuntime
    Config
    CurrentCooldown
    OwnerId
    RuntimeLevel
```

#### 3. 静态缓存和全局状态规范

所有静态字段应分级管理。

不可变静态字段允许常驻，例如常量、只读表、固定字符串映射。

可变静态缓存必须提供清理方法，并在账号退出、返回登录、场景切换、玩法卸载或热更新重载时调用。

静态事件必须有统一审计。禁止匿名 Lambda 订阅静态事件后不保存委托实例。高风险系统应提供订阅 token 或 owner 绑定机制。

关闭 Domain Reload 的项目必须提供静态重置入口。所有静态集合、事件、ID 分配器、全局缓存都应在 SubsystemRegistration 或项目启动流程中重置。

示例：

```csharp
static class RuntimeGlobalState
{
    static readonly List<IResettable> resetters = new();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    static void ResetOnPlay()
    {
        EventBus.Clear();
        ObjectRegistry.Clear();
        TempCache.Clear();
        RuntimeId.Reset();
    }
}
```

#### 4. IL2CPP 验收规范

项目不应把 Editor Profiler 数据直接作为发布结论。建议建立三套数据。

第一，Editor 快速定位数据。用于发现明显 GC Alloc 来源和调用栈。

第二，Mono Development Build 数据。用于较快验证真机行为和平台差异。

第三，IL2CPP Development Build 或接近发布设置的数据。用于最终验收帧时间、内存曲线和 GC 表现。

每次性能报告应注明脚本后端、Unity 版本、目标设备、Build 类型、是否 Development Build、是否 Autoconnect Profiler、是否启用 Deep Profiling、是否启用 Incremental GC、测试场景和测试时长。没有这些上下文的 GC 数据，很容易误导决策。

IL2CPP 下还要关注反射和泛型。过度依赖反射创建对象、字符串类型名查找、运行时泛型注册和动态序列化，可能带来额外开销和 AOT 风险。对于热路径，应使用显式注册表、代码生成或预构建映射代替运行时反射。

#### 5. Job + Burst 落地流程

引入 Job 和 Burst 前，必须先确认瓶颈适合数据化。

适合迁移的特征包括：对象数量大、逻辑重复、数据相互独立、主要是数学计算、较少访问 UnityEngine.Object、结果可以延后应用、计算输入输出可表示为 struct 数组。

不适合迁移的特征包括：强依赖 UI、强依赖 GameObject 生命周期、频繁发事件、访问大量托管对象、逻辑分支极复杂且规模不大、调试成本高于性能收益。

推荐流程：

1. 用 Profiler 找到主线程计算热点。
2. 抽离纯计算函数，先在普通 C# 中写成无副作用形式。
3. 将输入输出转换为 struct 数据。
4. 使用 NativeArray 或 NativeList 承载批量数据。
5. 编写 IJob、IJobParallelFor 或更合适的 Job。
6. 添加 BurstCompile 并验证结果一致。
7. 在目标设备对比优化前后的帧时间、CPU 时间、GC Alloc 和内存。
8. 编写 Dispose、依赖链和异常回收逻辑。
9. 把封装沉淀为模块，而不是散落在业务代码中。

伪代码框架：

```csharp
// Step 1: collect
BuildInputNativeArrays();

// Step 2: schedule
var job = new ComputeJob
{
    Input = input,
    Output = output,
    DeltaTime = dt
};
JobHandle handle = job.Schedule(count, batchSize);

// Step 3: complete at required point
handle.Complete();

// Step 4: apply
ApplyOutputToUnityObjects();

// Step 5: release or reuse
RecycleTempBuffers();
```

#### 6. NativeContainer 生命周期规范

NativeContainer 必须遵守 owner 原则。谁创建，谁释放；谁跨帧持有，谁负责在生命周期结束时 Dispose；谁传入 Job，谁负责管理 Job 完成前后的访问权限。

禁止裸露地在多个系统之间传递 Persistent NativeArray 而不说明 owner。禁止在方法内部创建 Persistent 容器后返回给不明确的调用方。禁止用 TempJob 创建后跨越不受控帧数。禁止只在正常流程 Dispose，而异常、提前返回、场景卸载时不处理。

建议封装通用工具：

```csharp
struct NativeArrayScope<T> : IDisposable where T : struct
{
    NativeArray<T> array;

    public NativeArrayScope(int count, Allocator allocator)
    {
        array = new NativeArray<T>(count, allocator);
    }

    public void Dispose()
    {
        if (array.IsCreated)
            array.Dispose();
    }
}
```

长期容器建议使用类 owner 管理，并提供 `Resize`、`Clear`、`Dispose`、`IsCreated` 等统一接口。这样业务系统不直接面对底层分配细节，减少泄漏概率。

容量策略也要规范。NativeList 扩容不是 GC Alloc，但仍是内存分配。高频系统应预估容量，避免运行中频繁扩容。对象池和 Native 缓冲都应有容量上限、峰值日志和告警。

#### 7. Addressables 生命周期规范

Addressables 必须建立句柄管理规范。

LoadAssetAsync 返回的 handle 必须保存，并在不再需要时 Release。不能只保存 Result 而丢弃 handle。

InstantiateAsync 创建的实例必须使用 ReleaseInstance 或对应句柄释放。不能简单 Destroy 后认为资源已经释放。

对象池如果池化 Addressables 实例，池 owner 必须持有实例句柄或资源句柄，并在池销毁时统一释放。

多个系统共享同一资源时，应有统一资源服务管理引用计数，避免每个业务脚本各自 Load/Release 导致时序混乱。

资源释放应尽量发生在场景切换、Loading、玩法退出等安全阶段。高频交互阶段不要频繁大规模 Release 和 Unload。

示例：

```csharp
class AddressablePrefabPool
{
    AsyncOperationHandle<GameObject> prefabHandle;
    List<GameObject> inactive;
    List<GameObject> active;

    async Task Initialize(key, preloadCount)
    {
        prefabHandle = Addressables.LoadAssetAsync<GameObject>(key);
        await prefabHandle.Task;

        for i in preloadCount:
            instance = Instantiate(prefabHandle.Result)
            instance.SetActive(false)
            inactive.Add(instance)
    }

    GameObject Spawn()
    {
        obj = inactive.Count > 0 ? inactive.Pop() : Instantiate(prefabHandle.Result)
        active.Add(obj)
        obj.SetActive(true)
        return obj
    }

    void Dispose()
    {
        foreach obj in active + inactive:
            Destroy(obj)

        Addressables.Release(prefabHandle)
    }
}
```

如果使用 `Addressables.InstantiateAsync`，则每个实例的释放方式要改成 ReleaseInstance。关键不是代码形式，而是 owner 清晰。

#### 8. 性能预算与验收标准

高级 GC 治理必须量化。建议按场景制定预算，而不是全项目一句“不要 GC”。

示例预算：

| 场景 | 托管分配目标 | GC 目标 | 内存目标 |
| :--- | :--- | :--- | :--- |
| 战斗待机 | 每帧 0B 或接近 0B | 不应周期性触发明显 GC spike | 托管堆稳定 |
| 主城待机 | 持续分配低于阈值 | 长时间运行无明显尖峰 | Native/Managed 稳定 |
| UI 打开 | 允许一次性分配 | 打开过程无可感知卡顿 | 关闭后对象数量回落 |
| 大型列表滚动 | 滚动中无持续分配 | 无滚动触发 GC | Item 复用稳定 |
| 场景切换 | Loading 阶段允许集中分配和回收 | 可控集中 GC | 切换后旧场景资源释放 |
| 长时间挂机 | 无持续增长 | GC 频率稳定 | 托管和 Native 不持续上涨 |

测试流程建议包括：冷启动、登录、进入主城、打开关闭核心 UI、进入战斗、战斗 10 分钟、退出战斗、重复进入退出 5 次、长时间挂机、切换语言或账号、低内存压力测试。每个流程记录帧时间 P50/P95/P99、GC Alloc、GC 次数、GC 耗时、Managed Heap Used、Native Memory、资源数量和对象数量。

#### 9. Code Review 清单

代码评审中应增加高级 GC 检查项。

是否在热路径中创建托管对象、数组、字符串、集合、委托或闭包？

是否在 Update、LateUpdate、FixedUpdate、列表滚动、战斗 Tick、网络消息处理里使用 LINQ、`ToArray`、`Split`、`Substring`、字符串插值或匿名回调？

是否有静态集合、静态事件或单例缓存保存运行时对象引用？是否有清理路径？

对象池回收时是否清理事件、协程、Tween、异步任务、资源引用和临时状态？

Addressables 加载是否保存 handle？释放路径是否完整？实例释放方式是否正确？

NativeContainer 是否有明确 owner？所有异常路径和生命周期结束路径是否 Dispose？

Job 是否访问了不该访问的托管对象？`Complete` 时机是否合理？是否造成主线程等待过长？

ScriptableObject 是否被运行时写入状态？是否直接引用过多重资源？是否会跨场景持有旧对象？

异步回调是否捕获 this？owner 销毁后是否取消？对象池复用后旧回调是否可能写回？

Profiler 数据是否来自目标设备？是否关闭了 Deep Profiling 对结果的干扰？是否有对比基线？

#### 10. 推荐落地路线

对于已有 Unity 项目，不建议一上来全面重构为 Job、Burst 或 ECS。更稳妥的路线是分阶段治理。

第一阶段，修复明显分配。处理 UI 文本、日志、LINQ、闭包、物理查询、GetComponents 数组、协程等待对象、临时集合和对象频繁 Instantiate/Destroy。

第二阶段，治理生命周期。清理静态事件、全局缓存、对象池状态、异步任务、Addressables handle、场景卸载和 UI 关闭后的残留对象。

第三阶段，建立预算和自动化。关键场景加入性能采样，形成固定报告和回归门禁。

第四阶段，局部数据化。选择最明显的计算热点，例如大规模单位、弹幕、粒子、寻路、筛选、排序、模拟等，使用 NativeContainer + Job + Burst 改造。

第五阶段，沉淀框架。把 Addressables owner、NativeContainer owner、对象池、异步取消、静态重置、性能采样封装成团队公共库，减少每个业务模块重复造轮子。

第六阶段，评估更深层架构演进。只有当局部数据化收益明确且团队能力匹配时，再考虑更大范围的 DOTS/ECS 或数据导向架构迁移。

### 总结

Unity 高级 GC 优化不是某几个技巧的堆叠，而是一套围绕数据、对象、资源和流程的工程化治理体系。ScriptableObject 可以减少静态配置重复，但必须避免混入运行时状态；静态缓存可以减少重复分配，但必须承担全局生命周期和清理责任；IL2CPP 可以提升发布环境的执行效率，但不会改变托管对象需要 GC 管理的事实；Job System 和 Burst 可以把大规模纯计算迁移到更高效的数据模型中，但不适合直接承载所有业务逻辑；Native Container 可以避开托管堆，但必须显式管理 Native 内存；Addressables 可以管理资源引用计数，但只有在正确 Release 的前提下才能发挥作用。

真正成熟的 Unity 内存优化，应当从“看到 GC Alloc 就改代码”升级为“建立可测量、可审查、可回归、可维护的内存治理流程”。开发者需要知道哪些对象应该短生命周期，哪些数据应该共享，哪些资源应该延迟加载，哪些缓存必须清理，哪些计算值得数据化，哪些优化会增加复杂度而收益有限。性能优化不是追求技术名词，而是把有限的 CPU、内存和帧预算用在正确的地方。

对于大多数项目，最可靠的实践路线是：先用 Profiler 找到真实问题，再清理热路径分配；然后用 Memory Profiler 治理引用链和资源残留；接着建立分配预算和回归测试；最后对明确的计算热点引入 Job、Burst、NativeContainer 或局部数据导向设计。这样做虽然不如“一键零 GC”听起来痛快，但它更符合工业项目的真实复杂度，也更容易长期维护。

如果把整个 Unity GC 系列浓缩成一句话，那就是：GC 优化的本质不是害怕内存分配，而是尊重生命周期。知道对象从哪里来、被谁持有、什么时候释放、以什么形式存储、在什么线程计算、在什么阶段加载和卸载，项目才会真正稳定。高级 GC 技术只是工具，生命周期意识才是核心。

## 元数据

- **创建时间：** 2026-04-25 00:19
- **最后更新：** 2026-04-25 00:19
- **作者：** 吉良吉影
- **分类：** 内存管理
- **标签：** Unity、GC、GC Alloc、IL2CPP、Burst、Job System、NativeContainer、Addressables、ScriptableObject、内存治理、性能优化
- **来源：** 已有文稿整理与技术校正

---

*文档基于与吉良吉影的讨论，由小雅整理*
