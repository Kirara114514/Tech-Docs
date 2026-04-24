# Unity Job System 与 Burst

## 摘要

本文重写《JobSystem 与 Burst》，删除原稿中的重复引言、重复总结和不准确表述，将其整理为一篇面向 Unity 高性能计算的工程化文档。文章从 Job System 的设计目标、数据导向思想、NativeContainer、JobHandle 依赖、IJob/IJobFor/IJobParallelForTransform、Burst 编译器、LLVM 原生代码优化、Allocator 生命周期、安全系统、调试方式、Profiler 验收和适用边界等方面展开。本文重点修正：Burst 不是普通意义上的“运行时 JIT 加速器”，Job System 也不是把任意 C# 逻辑放到子线程的万能工具；它适合大量连续数据、纯计算、可并行、低托管依赖的任务。

## 正文

### 背景

Unity 项目中的性能瓶颈经常出现在主线程：大量单位 AI、批量距离计算、程序化网格、粒子模拟、寻路候选评分、地形采样、碰撞候选筛选等。如果这些计算集中在 Update 中执行，帧时间会迅速升高。传统 Task.Run 可以把纯 C# 工作放到线程池，但它不理解 Unity 的数据安全系统，也不适合每帧大规模数值计算。Job System 与 Burst 是 Unity 针对数据密集型任务提供的高性能路线。

原稿对 Job System 和 Burst 有基础介绍，但有几处需要修正和深化。第一，Burst 官方定位是把 IL/.NET bytecode 通过 LLVM 编译为针对目标 CPU 优化的原生代码，不宜简单写成普通 JIT。第二，Job 的收益不只来自多线程，更来自数据布局、依赖图、低 GC 和安全系统。第三，示例中的 `Debug.Log`、立即 Complete、NativeArray 生命周期等都需要以生产规范重新说明。本文将这些内容重写为更完整的工程手册。

### 核心内容

#### 1. Job System 解决的不是“开线程”问题

Job System 的核心不是让开发者手动创建线程，而是让开发者把可并行的数据计算描述为 Job，由 Unity 负责调度到工作线程执行。开发者管理的是数据、依赖和完成点，不直接管理 Thread。

传统多线程的问题包括：线程生命周期复杂、共享数据容易竞态、锁会导致死锁、主线程回写分散、GC 分配不可控。Job System 通过限制编程模型来换取安全和性能：Job 通常是 struct，数据通过 NativeContainer 传递，访问权限通过 `[ReadOnly]` 等标记声明，依赖通过 JobHandle 表达，Unity 安全系统负责发现冲突。

这种限制不是缺陷，而是设计核心。它迫使开发者从“对象图 + 引用 + 随意访问”转向“连续数据 + 明确读写 + 依赖图”。

#### 2. 数据导向设计决定收益上限

如果数据仍然散落在 GameObject、MonoBehaviour、List<class>、Dictionary<string, object> 中，Job 化收益会很有限。每帧为了调度 Job 先遍历大量对象、提取数据、拷贝到 NativeArray，Job 算完后再全部写回，这些准备和回写成本可能抵消并行收益。

适合 Job 的数据通常具备以下特征：

- 数据规模较大。
- 元素结构一致。
- 计算之间相互独立或依赖清晰。
- 可以表示为结构体数组。
- 访问模式连续或可预测。
- 不需要直接调用 UnityEngine 对象。
- 可以容忍本帧后期或下一帧拿结果。

例如批量距离计算：

```text
输入：单位位置数组、目标位置数组
计算：每个单位到目标的距离或评分
输出：最佳目标索引数组
```

这种任务非常适合 Job。相反，如果任务每一步都要查询组件、播放动画、改 UI、读字符串字典，就不适合 Burst Job。

#### 3. NativeContainer 与托管内存边界

`NativeArray<T>`、`NativeList<T>`、`NativeHashMap<TKey,TValue>` 等 NativeContainer 存储在非托管内存中，不由 GC 管理。它们可以被 Job 安全访问，但需要显式释放。忘记 Dispose 会造成非托管内存泄漏；过早 Dispose 会导致 Job 访问已释放内存；跨帧使用错误 Allocator 也会出问题。

常见 Allocator：

- `Allocator.Temp`：非常短生命周期，通常不跨帧。
- `Allocator.TempJob`：适合短期 Job 数据，生命周期可跨少量帧，但必须及时释放。
- `Allocator.Persistent`：适合长期缓存，需要手动管理释放。

正式项目不应到处临时 new NativeArray。应明确 owner：谁创建，谁释放；谁调度 Job，谁 Complete；谁持有跨帧数据，谁负责失效和 Dispose。

#### 4. JobHandle 是依赖图的核心

`Schedule` 返回 `JobHandle`。它表示 Job 的执行状态和依赖关系。初学者常见写法是：

```csharp
var handle = job.Schedule();
handle.Complete();
```

这能运行，但如果立即 Complete，就几乎没有并行收益。正确思路是尽量早调度，尽量晚 Complete，把主线程和工作线程重叠起来：

```text
Update 早期：准备输入并 Schedule
Update 中期：主线程继续做其他工作
LateUpdate 或下一帧：需要结果时 Complete 并应用
```

多个 Job 可以形成依赖图。一个 Job 写结果，另一个 Job 读取结果，后者必须依赖前者。两个 Job 读不同数据或只读同一数据，可以并行。依赖图设计得好，Job System 才能充分利用多核。

#### 5. IJob、IJobFor 与 IJobParallelForTransform

`IJob` 适合单个任务，例如归约、少量控制逻辑、准备数据。它不会自动按数组并行。

`IJobFor` 或 `IJobParallelFor` 适合对数组中每个元素执行相同逻辑。它们通过 `Execute(int index)` 处理元素，调度时指定长度和 batch size。batch size 影响任务拆分粒度：太小调度开销高，太大负载不均。需要根据数据规模和设备测试。

`IJobParallelForTransform` 通过 TransformAccessArray 处理 Transform，适合批量移动或旋转对象。但它仍然不是让 Job 随意访问 GameObject；它只是 Unity 提供的受控 Transform 访问路径。若能将数据完全脱离 Transform，使用 NativeArray 纯数据通常更容易 Burst 优化。

#### 6. Burst 编译器的定位

Burst 是 Unity 的高性能编译器，它将 IL/.NET bytecode 通过 LLVM 转换为针对目标 CPU 架构优化的原生代码。它擅长优化数学计算、循环、结构体数据和 SIMD 友好的逻辑。

Burst 不是魔法。它不能把任意 C# 业务代码变快。Burst 兼容代码需要避开托管对象、字符串、反射、异常、虚调用、复杂委托捕获、大多数 UnityEngine 对象访问等。适合 Burst 的代码通常像这样：

```csharp
[BurstCompile]
public struct DistanceJob : IJobFor
{
    [ReadOnly] public NativeArray<float3> Positions;
    public float3 Target;
    [WriteOnly] public NativeArray<float> Distances;

    public void Execute(int index)
    {
        Distances[index] = math.distance(Positions[index], Target);
    }
}
```

这种代码数据明确、无托管引用、数学密集，非常适合 Burst。

#### 7. Burst 与 Unity.Mathematics

Burst 通常配合 `Unity.Mathematics` 使用，例如 `float3`、`quaternion`、`math.distance`、`math.normalize` 等。相比 UnityEngine.Vector3，Unity.Mathematics 更面向数据计算和 SIMD 优化。正式 Job 层建议使用 float3 等类型，主线程层再与 Vector3 转换。

这种转换看似麻烦，但它强化了边界：主线程世界使用 UnityEngine 类型，计算世界使用数学和 NativeContainer 类型。

#### 8. 安全系统

Unity Job System 的安全系统会在开发期检查很多错误：

- 同一 NativeArray 被多个 Job 无依赖写入。
- 一个 Job 写，另一个 Job 读但没有依赖。
- 访问已经 Dispose 的 NativeContainer。
- 使用不合法的 Allocator 生命周期。
- 主线程在 Job 未完成时访问被 Job 使用的数据。

这些检查会带来开销，但开发期非常有价值。不要为了编辑器运行更快就关闭安全检查。发布构建中许多检查会被移除，以换取性能。

#### 9. Complete 的成本

`Complete()` 会确保 Job 完成。如果 Job 没完成，调用线程会等待。很多 Job 性能问题不是 Execute 慢，而是 Complete 时机不对。比如在 Update 中调度后立即 Complete，主线程会直接阻塞；如果在多个系统中零散 Complete，也会造成不可预测的等待峰值。

推荐统一 Complete 安全点，例如系统 LateUpdate、帧末调度器、下一帧消费阶段。对可延迟结果，不要强行本帧等待。

#### 10. Snapshot 与 Writeback

Job 不能直接处理大部分 Unity 对象。正确模式是：

1. 主线程采集输入快照。
2. 将快照写入 NativeArray。
3. Schedule Job。
4. 等待完成。
5. 主线程读取结果。
6. 回写到 GameObject、组件或业务状态。

这个模型会带来数据拷贝，但换来线程安全和可优化计算。是否值得 Job 化，要把采集、拷贝、调度、执行、Complete、回写都算进去。

#### 11. Profiler 验收

Job 优化不能只看 Execute 耗时。完整验收包括：

- 主线程准备输入耗时。
- NativeContainer 分配耗时。
- Schedule 开销。
- Job 执行耗时。
- Complete 等待耗时。
- 结果回写耗时。
- GC Alloc 是否下降。
- 总帧峰值是否下降。
- 真机功耗和温度是否可接受。

如果 Job 内部很快，但主线程拷贝和 Complete 很慢，整体仍可能不划算。

#### 12. 适用场景

适合 Job + Burst 的场景：

- 大量单位距离检测。
- AI 批量评分。
- 可见性和范围筛选。
- 程序化网格生成。
- 地形高度采样。
- 栅格地图处理。
- 简化物理计算。
- 大量粒子或弹道模拟。
- 批量动画数据预处理。
- 纯数值模拟。

不适合：

- 网络请求。
- 文件等待。
- 频繁访问 GameObject。
- 少量对象简单逻辑。
- UI 流程。
- 复杂业务状态机。
- 需要字符串和字典的大量托管逻辑。

### 实现方案

#### 1. 基础 Job 示例

```csharp
[BurstCompile]
public struct ScoreJob : IJobFor
{
    [ReadOnly] public NativeArray<float3> UnitPositions;
    [ReadOnly] public NativeArray<float3> TargetPositions;
    [WriteOnly] public NativeArray<int> BestTargetIndices;

    public void Execute(int index)
    {
        float bestDistance = float.MaxValue;
        int bestIndex = -1;
        float3 unitPosition = UnitPositions[index];

        for (int i = 0; i < TargetPositions.Length; i++)
        {
            float distance = math.distancesq(unitPosition, TargetPositions[i]);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                bestIndex = i;
            }
        }

        BestTargetIndices[index] = bestIndex;
    }
}
```

这是典型的纯数据计算。输入是位置数组，输出是索引数组，Job 不知道 GameObject，也不访问 MonoBehaviour。

#### 2. 调度与延迟 Complete

```csharp
private NativeArray<float3> _units;
private NativeArray<float3> _targets;
private NativeArray<int> _results;
private JobHandle _handle;
private bool _scheduled;

private void Update()
{
    PrepareInput();

    var job = new ScoreJob
    {
        UnitPositions = _units,
        TargetPositions = _targets,
        BestTargetIndices = _results
    };

    _handle = job.Schedule(_units.Length, 64);
    _scheduled = true;
}

private void LateUpdate()
{
    if (!_scheduled)
    {
        return;
    }

    _handle.Complete();
    ApplyResults();
    _scheduled = false;
}
```

真实项目中还要处理容器生命周期、重复调度、依赖合并和异常日志。这个模板重点展示：不要 Schedule 后马上 Complete，给 Job 留出与主线程重叠执行的空间。

#### 3. NativeContainer 生命周期模板

```csharp
private NativeArray<float3> _positions;

private void OnEnable()
{
    _positions = new NativeArray<float3>(capacity, Allocator.Persistent);
}

private void OnDisable()
{
    if (_positions.IsCreated)
    {
        _positions.Dispose();
    }
}
```

长期缓存用 Persistent，短期请求用 TempJob。谁创建谁释放，跨帧容器必须有明确 owner。

#### 4. Job 化评审清单

- 数据是否已经连续化？
- 是否需要访问 UnityEngine 对象？
- 是否有足够数据规模抵消调度成本？
- 是否可以延迟到 LateUpdate 或下一帧拿结果？
- NativeContainer 生命周期是否明确？
- Allocator 是否正确？
- 是否存在立即 Complete 反模式？
- 是否建立 JobHandle 依赖？
- Burst 是否能编译？
- Profiler 是否证明收益？

### 总结

Job System 与 Burst 是 Unity 高性能计算的重要工具，但它们不是普通异步流程工具，也不是任意 C# 代码加速器。它们真正擅长的是大量、连续、可并行、无托管依赖的数据计算。要发挥收益，必须从数据布局开始设计，明确 NativeContainer 生命周期，构建 JobHandle 依赖图，延迟 Complete，并用 Burst 编译纯计算逻辑。

在工程实践中，Job 化应有明确收益验收。只有当主线程峰值下降、GC Alloc 降低、数据规模提升或真机帧稳定性改善时，复杂度才是值得的。对于等待网络、等待文件、简单 UI 和少量对象逻辑，UniTask、Task 或普通同步代码更合适。工具边界清楚，Job System 和 Burst 才能真正成为性能武器，而不是架构负担。


#### 附录 A：数据布局示例

面向对象布局：

```csharp
class Enemy
{
    public Vector3 Position;
    public int Hp;
    public float Speed;
}
List<Enemy> enemies;
```

数据导向布局：

```csharp
NativeArray<float3> Positions;
NativeArray<int> Hps;
NativeArray<float> Speeds;
```

前者适合业务表达，后者适合批量计算。项目不必完全放弃 OOP，但应在性能敏感层建立数据导向缓存。

#### 附录 B：Batch Size 调整

batch size 没有固定最优值。小 batch 更利于负载均衡，但调度开销高；大 batch 调度开销低，但可能造成线程负载不均。经验值可以从 32、64、128 开始测试。数据量越大、单元素计算越重，batch size 可以适当增大。最终以目标设备 Profiler 为准。

#### 附录 C：Burst 失败排查

Burst 编译失败通常来自托管引用、字符串、异常、调用不支持的方法、使用了非 blittable 类型或访问 UnityEngine 对象。排查时可以先关闭 Burst 让 Job 在托管模式跑通，再逐步替换为 Unity.Mathematics 和 NativeContainer。不要在 Burst Job 中保留业务类引用。

#### 附录 D：安全检查与发布性能

开发期建议开启 Jobs Debugger、Leak Detection 和安全检查。它们会降低编辑器性能，但能发现内存和依赖错误。性能测试可以使用接近发布的配置单独跑，不能为了编辑器顺滑而长期关闭安全系统。

#### 附录 E：强实时与可延迟

命中判定、输入响应、关键战斗结算通常需要本帧结果，不一定适合异步 Job。AI 感知、环境扫描、统计分析、预计算、表现辅助通常可以晚一帧或多帧，更适合 Job。Job 化前先判断结果是否必须立即使用。

#### 附录 F：常见反模式

反模式一：为了使用 Job，把很小的循环也改成 Job，结果调度成本比计算还高。

反模式二：Job 内部仍然访问复杂托管对象，导致 Burst 不能编译。

反模式三：每帧分配和释放大量 NativeArray，造成分配成本和泄漏风险。

反模式四：Schedule 后立即 Complete，实际只是同步执行换了形式。

反模式五：只看 Job Execute 耗时，不看准备输入和回写结果。

反模式六：把 Job 用来等待 IO 或网络，这不符合 Job System 定位。

#### 附录 G：团队落地路线

第一阶段，选择一个纯数据、高耗时、低业务耦合的模块试点，例如批量距离计算。第二阶段，建立 NativeContainer 生命周期规范和 JobHandle 调度规范。第三阶段，引入 Burst 和 Profiler 验收。第四阶段，再考虑封装通用调度器和批处理服务。不要一开始就把复杂业务系统整体 Job 化。

#### 附录 H：完整成本核算

Job 优化的完整成本包括：从 Unity 对象采集数据的时间、数据格式转换时间、NativeContainer 分配时间、Job 调度时间、Job 执行时间、Complete 等待时间、结果解析时间、回写 Unity 对象时间和 Dispose 时间。如果只比较原同步循环和 Job Execute，就会高估收益。成熟团队会把这些阶段分别打点，确认瓶颈真的被转移或降低，而不是隐藏到另一个阶段。

#### 附录 I：与 ECS 的关系

Job System 与 Burst 可以独立于 ECS 使用，但它们与 ECS 的数据导向思想高度一致。ECS 将实体数据组织成更适合批量处理的内存布局，进一步降低从 GameObject 世界采集快照的成本。非 ECS 项目也能使用 Job，但通常需要自己维护一层计算数据缓存。是否引入 ECS 取决于项目规模、团队经验和现有架构，不应为了使用 Job 强行重构全部代码。


#### 附录 J：Job 设计中的输入准备阶段

很多开发者第一次使用 Job 时，会把注意力都放在 `Execute` 方法里，却忽略输入准备阶段。事实上，输入准备经常是 Job 化成败的关键。比如批量 AI 感知，如果每帧都从场景里调用 `FindObjectsOfType`、遍历组件、读取 Transform、构造临时数组，那么即使 Job 内部计算很快，主线程仍然会很重。更好的方式是维护一份长期存在的数据缓存：单位出生、死亡、移动时更新缓存；Job 调度前只做必要的增量同步。

输入准备阶段要避免三类问题。第一，避免无意义全量扫描。第二，避免每帧创建临时托管集合再复制到 NativeArray。第三，避免把复杂业务对象直接映射进 Job。Job 输入应尽量是稳定、扁平、可预测的数据，例如位置、半径、阵营 id、生命值、索引和标记位。

#### 附录 K：结果回写阶段的设计

Job 的输出通常也是纯数据，例如索引、布尔值、距离、评分、位置或状态码。主线程回写时才把这些结果应用到 GameObject、Animator、UI 或业务对象上。结果回写要考虑对象是否仍然存在、数据版本是否匹配、结果是否过期、是否需要分批应用。

例如一个 AI 评分 Job 输出目标索引。Job 执行期间，某些目标可能已经死亡或离场。因此回写时不能盲目使用索引，而要检查目标表版本或实体 id 是否仍然有效。高性能系统里经常使用稳定 id 而不是直接使用对象引用，就是为了让跨帧结果更安全。

#### 附录 L：NativeContainer 池化

如果某类 Job 每帧都需要固定容量的 NativeArray，可以考虑长期缓存或池化 NativeContainer，避免频繁分配释放。比如战斗中最多 2000 个单位，可以在战斗开始时创建 Persistent 容器，战斗结束时统一 Dispose。这样比每帧 TempJob 分配更稳定。

但池化 NativeContainer 也有风险。容器容量不足时如何扩容？Job 未完成时能否复用？不同系统是否会同时写入？这些都要由 owner 管理。容器池不是简单的 `Stack<NativeArray<T>>`，而是要知道容器当前是否被某个 Job 使用，是否可以安全归还。

#### 附录 M：依赖图示例

一个可见性系统可能包含三步：

```text
CollectInputJob -> VisibilityTestJob -> CompactResultJob
```

`CollectInputJob` 准备输入数据，`VisibilityTestJob` 并行判断可见性，`CompactResultJob` 将可见对象压缩成结果列表。第二步依赖第一步，第三步依赖第二步。但如果还有一个 `DistanceScoreJob` 只读取同样的输入，那么它可以和 `VisibilityTestJob` 并行。通过 `JobHandle.CombineDependencies` 可以合并多个依赖，在最终消费前统一等待。

依赖图的价值在于让 CPU 尽可能并行工作，而不是让主线程每一步都 Complete。设计依赖图时，要画清楚每个 Job 读什么、写什么、什么时候需要结果。

#### 附录 N：归约问题

并行 Job 很适合逐元素计算，但求最大值、最小值、总和、最佳目标这类归约问题需要特别设计。不能让多个线程随意写同一个结果变量，否则会发生竞争。常见做法是每个 batch 写一个局部结果，然后再用第二个 Job 或主线程合并局部结果。

例如一万个单位寻找全局最近目标，可以先让每个并行任务输出自己的候选结果数组，再做一次归约。不要在 `IJobFor.Execute` 中直接更新一个共享 bestIndex，除非使用并发容器或原子操作并且逻辑允许。

#### 附录 O：随机数

Job 中不能随意使用 `UnityEngine.Random`。需要为每个 worker 或每个元素准备可并行使用的随机数状态，例如 `Unity.Mathematics.Random`。随机种子应由主线程初始化并传入 NativeArray，Job 内部按 index 使用自己的随机状态，执行后再写回。否则多个线程共享随机状态会产生竞态或不可复现结果。

#### 附录 P：浮点确定性

Burst 和 SIMD 优化可能改变浮点运算顺序，从而造成微小差异。如果项目涉及严格同步、回放、帧同步战斗或确定性模拟，必须额外评估浮点确定性。不要默认 Job + Burst 的结果在所有平台、所有 CPU 上完全一致。可以通过定点数、受控数学库或平台限定策略降低风险。

#### 附录 Q：调试方法

调试 Job 可以分阶段进行。第一步，先用普通 C# 同步代码实现算法，保证结果正确。第二步，改为非 Burst Job，保留安全检查，验证 NativeContainer 和依赖关系。第三步，添加 BurstCompile，比较结果一致性。第四步，用 Profiler 验证性能。不要一开始就把复杂算法写进 Burst Job，否则调试难度会非常高。

Job 内不建议依赖 Debug.Log。大量日志会破坏性能，也可能在 Burst 下不可用。更好的方式是把调试数据写入 NativeArray，Job 完成后主线程读取并打印。

#### 附录 R：Job 与内存泄漏

托管 GC 不会管理 NativeContainer。泄漏 NativeArray 不会表现为普通托管对象数量增长，而是原生内存上涨。Memory Profiler 和 Unity Leak Detection 可以帮助发现问题。所有使用 Persistent 的容器都要有明确 Dispose 路径；所有 TempJob 容器都要确保 Job 完成后释放。异常路径和取消路径同样要释放，不要只在正常完成时 Dispose。

#### 附录 S：Burst 代码风格

Burst 层代码应接近纯函数。输入字段只描述数据，Execute 只做计算，输出写入结果容器。不在 Burst Job 里做业务分发，不访问单例，不读取配置字典，不拼字符串，不抛异常。复杂业务判断应在主线程准备阶段转换成简单枚举、标记位或数值参数。这样 Burst 才能稳定编译并优化。

#### 附录 T：真机验证

Job 和 Burst 的收益与 CPU 架构、核心数量、缓存、功耗策略有关。编辑器中的性能结果只能作为参考。移动端可能因为温控降频导致长时间表现不同；主机和 PC 的 SIMD 能力不同；低端机工作线程数量和调度成本不同。正式性能结论必须来自目标设备，并且要覆盖长时间运行，而不是只看一次短采样。

#### 附录 U：与对象池的关系

Job 常用于计算大量对象的状态，但对象的创建销毁仍应通过对象池治理。比如弹幕系统中，Job 可以计算弹道位置和碰撞候选，主线程根据结果从对象池取出或归还表现对象。不要在 Job 中 Instantiate，也不要让 Job 负责对象池逻辑。Job 负责数据，主线程负责对象生命周期。

#### 附录 V：与渲染数据的关系

某些高性能渲染流程会将 Job 计算结果写入 Mesh 数据、ComputeBuffer 输入或实例化渲染参数。此时要特别注意同步点：渲染系统读取数据前，Job 必须完成；如果使用双缓冲，可以减少主线程等待。渲染相关数据通常更适合长期 NativeContainer 或 GraphicsBuffer 管理，而不是每帧创建临时数组。

#### 附录 W：最终落地标准

一个 Job 优化合入前，应能回答：数据从哪里来；是否连续；谁拥有 NativeContainer；Job 读写哪些容器；依赖关系是什么；什么时候 Complete；结果是否允许晚一帧；Burst 是否成功编译；安全检查是否通过；Profiler 中主线程峰值是否下降；目标设备是否验证。回答不了这些问题，说明 Job 化还停留在示例层面。


#### 附录 X：小规模任务为什么可能变慢

Job System 有调度成本、依赖成本、数据拷贝成本和 Complete 成本。若任务本身只需要处理几十个元素，直接在主线程循环可能只花几十微秒；改成 Job 后反而要分配 NativeArray、Schedule、等待、回写，整体更慢。很多“为了架构统一而 Job 化”的代码最后都输在这里。

判断是否值得 Job 化，可以先用同步版本打点。如果同步耗时稳定低于 0.2ms，并且不在高频峰值路径，通常没必要改。若同步耗时超过 1ms，或者数据规模会随玩法增长，才更值得评估 Job。性能优化不是把每个循环都换成高级技术，而是把有限复杂度投在真正的瓶颈上。

#### 附录 Y：内存布局 AoS 与 SoA

AoS 指 Array of Structs，例如：

```csharp
struct UnitData
{
    public float3 Position;
    public float Radius;
    public int Team;
}
NativeArray<UnitData> Units;
```

SoA 指 Struct of Arrays，例如：

```csharp
NativeArray<float3> Positions;
NativeArray<float> Radii;
NativeArray<int> Teams;
```

AoS 更接近业务对象，访问一个单位的多个字段方便；SoA 更适合只批量访问某一类字段的算法，缓存命中更好。选择哪种布局取决于访问模式。若算法每次都需要 Position、Radius、Team，AoS 很合适；若多个 Job 分别只处理 Position 或 Team，SoA 可能更高效。数据布局没有固定答案，要跟算法一起设计。

#### 附录 Z：从 MonoBehaviour 世界迁移到计算世界

非 ECS 项目可以建立一层“计算世界”。主线程上的 MonoBehaviour 仍负责表现和生命周期；计算世界维护单位 id、位置、属性、状态标记等 NativeContainer。每帧或每几个帧同步必要变化。Job 只处理计算世界数据，输出结果后再由主线程应用到表现对象。

这种方式比直接把所有 GameObject 重构成 ECS 温和很多，也能享受部分数据导向收益。它适合中大型传统 Unity 项目逐步引入 Job，而不是推倒重来。

#### 附录 AA：Job 与业务状态机

复杂业务状态机通常不适合直接放进 Job。状态机包含大量分支、事件、对象引用、日志和副作用，不利于 Burst 优化。更好的方式是让 Job 计算状态机需要的输入，例如距离、威胁值、可见性、候选目标；状态机仍在主线程根据这些结果做决策。也就是说，Job 提供“批量事实”，业务层做“语义决策”。

#### 附录 AB：使用 Job 的团队分工

框架或性能开发者负责 NativeContainer、调度器、依赖图、Profiler 和底层算法；业务开发者负责提出计算需求和使用高层接口。不要要求每个业务开发者都手写 NativeArray Dispose 和 JobHandle 依赖。高级封装可以降低门槛，但底层仍需要有人负责规范和性能验收。

#### 附录 AC：版本升级注意事项

Unity 的 Job、Burst、Collections 包会随版本更新。接口名、推荐 Job 类型、安全检查行为和 Burst 支持能力可能变化。项目文档应记录使用的 Unity 版本和包版本，并在升级前跑性能和正确性回归。不要只看编译通过，Job 相关变更还要看真机性能、结果一致性和内存泄漏检查。

#### 附录 AD：最终原则

Job System 的收益来自四件事：数据连续、计算纯粹、依赖清楚、等待延后。Burst 的收益来自三件事：无托管对象、数学密集、访问模式稳定。任何 Job 设计如果偏离这些原则，就要重新评估是否合适。


#### 附录 AE：最低验收样例

一个合格的 Job 优化 PR 至少应附带一组对比数据：同步版本主线程耗时、Job 版本主线程准备耗时、Job 执行耗时、Complete 等待耗时、结果回写耗时、GC Alloc、Native 内存变化和目标设备帧时间变化。没有对比数据的 Job 化，很容易只是“看起来更专业”。性能代码要用数据说话。

#### 附录 AF：结论补充

Job System 与 Burst 最适合被当作项目中的“计算加速层”，而不是业务流程层。业务层提出需求，计算层提供结果，主线程层应用结果。这个分层越清楚，Job 代码越稳定，Burst 越容易发挥作用，团队也越不会因为底层复杂度而降低迭代效率。

#### 附录 AG：一句话总结

先整理数据，再设计依赖，最后才写 Job。顺序反了，就容易得到一段能跑但不一定有收益的复杂代码。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** Unity、Job System、Burst、NativeArray、NativeContainer、DOD、并行计算
- **来源：** 已有文稿整理、官方文档校正、工程化经验重写

---

*文档基于与吉良吉影的讨论，由小雅整理*
