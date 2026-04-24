# Job System 高级封装与异步集成

## 摘要

本文重写《JobSystem 高级封装与异步集成》，删除原稿中重复的背景、重复总结和示例化堆叠，将内容升级为一篇面向 Unity 工程框架的 Job 封装设计文档。文章强调：Job System 的封装不是把 `Schedule` 和 `Complete` 包起来，也不是在 UniTask 里同步等待 Job；真正有价值的封装应围绕任务语义、JobHandle 依赖、NativeContainer 生命周期、取消后的结果废弃、异步 await 桥接、批处理调度、错误诊断、Profiler 指标和业务层接口展开。本文给出 JobRequest、JobAwaiter、批处理服务和封装评审清单，帮助团队在保留性能收益的同时降低使用门槛。

## 正文

### 背景

Job System 原生 API 偏底层，要求开发者理解 NativeContainer、Allocator、JobHandle、依赖、Complete 时机、Burst 限制和安全系统。对于性能开发者来说这些概念是必要的，但对于大量业务开发者来说，直接手写 Job 容易出错：忘记 Dispose、立即 Complete、依赖漏传、取消后容器泄漏、结果晚返回覆盖新状态等都很常见。

原稿提出了“对 Job System 进行二次封装”的方向，但示例仍偏简单，且存在一些问题：把 JobHandle 转 UniTask 的过程说得过于轻松，容易掩盖 Complete 阻塞；使用 `using var NativeArray` 跨异步等待需要明确生命周期；把结果 `ToArray()` 返回虽然方便，但可能产生分配；取消语义也需要说明 Job 通常不能被强行终止，只能废弃结果并保证资源释放。本文将这些问题系统化处理。

### 核心内容

#### 1. Job 封装的目标

Job 封装的目标不是让业务“完全不知道 Job 存在”，而是让业务不必处理容易犯错的底层细节，同时保留性能调度空间。一个好的封装应做到：

- 业务接口表达计算语义。
- 底层仍保留 JobHandle 依赖能力。
- NativeContainer 生命周期由封装层负责。
- await 等待不阻塞主线程。
- 取消后结果可废弃但资源不泄漏。
- 批量请求可以合并调度。
- Complete 时机可控。
- 日志和 Profiler 能看到任务规模与耗时。
- 高风险参数在调度前校验。
- 业务层不直接持有已释放容器。

#### 2. 立即 Complete 是封装反模式

最常见的错误封装是：

```csharp
public static void Run<TJob>(TJob job) where TJob : struct, IJob
{
    var handle = job.Schedule();
    handle.Complete();
}
```

这虽然隐藏了样板代码，但也隐藏了 Job System 的并行价值。业务调用看起来简单，实际主线程仍在等待。除非这是明确的同步接口，例如 `RunSyncForSmallData`，否则公共封装不应默认立即 Complete。

异步封装也不能只是把 Complete 放进 UniTask：

```csharp
await UniTask.Run(() => handle.Complete());
```

这可能让等待逻辑更混乱。更合理的做法是通过 PlayerLoop 每帧检查 JobHandle 是否完成，完成后调用一次 `Complete()` 收尾，随后读取结果和释放资源。

#### 3. Job 不能像普通任务一样强制取消

普通 UniTask 可以通过 CancellationToken 协作取消。Job 一旦调度，通常不能安全地强行终止。取消更多表示“调用方不再需要这个结果”。封装层需要做三件事：

1. 标记请求已取消。
2. 等 Job 自然完成后释放 NativeContainer。
3. 不再把结果写回业务。

因此，Job await 桥接需要同时处理完成和取消。取消不等于马上 Dispose，因为 Job 可能还在使用容器。过早 Dispose 会造成非法访问。

#### 4. JobRequest 模型

建议把一次 Job 请求建模为对象：

```csharp
public interface IJobRequest
{
    string Name { get; }
    bool IsCompleted { get; }
    bool IsCanceled { get; }
    JobHandle Handle { get; }
    void CompleteAndRelease();
    void CancelResult();
}
```

具体请求持有输入容器、输出容器、JobHandle、owner、提交时间和状态。业务层拿到的是 `UniTask<Result>` 或请求 id，而不是 NativeArray。这样 NativeContainer 不会泄漏到业务层。

#### 5. NativeContainer 生命周期绑定

封装层必须保证以下路径都释放资源：

- Job 正常完成。
- await 过程中 owner 取消。
- 结果读取时发生异常。
- 调度前参数校验失败。
- 场景切换批量取消。
- 系统销毁时仍有未完成 Job。

对于取消中的 Job，不能立即释放正在被 Job 使用的容器。可以把请求放入 pending release 列表，等 `Handle.IsCompleted` 后 Complete 并 Dispose。

#### 6. await JobHandle 的推荐模型

一个简单的等待模型：

```text
Schedule Job
while !handle.IsCompleted:
    if token canceled: mark result discarded
    await UniTask.Yield()
handle.Complete()
if discarded: release and return canceled
read result
release
return result
```

这个模型不会在等待期间阻塞主线程。最后的 `Complete()` 通常很快，因为 `IsCompleted` 已经为 true；它主要用于让 Job System 完成收尾和安全状态更新。

#### 7. 批处理比单请求封装更有价值

很多 Job 请求适合合并。例如一帧内多个系统请求距离评分，如果每个请求都单独分配 NativeArray、Schedule、await、Dispose，开销会很高。封装层可以收集同类请求，在帧末合并成一个大 Job：

```text
请求 A: 100 个单位
请求 B: 50 个单位
请求 C: 200 个单位
合并输入: 350 个单位
单个批处理 Job
输出按 requestId 分发
```

批处理能减少调度次数、分配次数和 Complete 次数，更符合 Job System 的优势。缺点是封装复杂，需要管理请求 id、输入区间、取消标记和结果映射。

#### 8. 异步接口要说明延迟语义

Job await 看起来像普通异步方法，但结果可能本帧、下一帧或多帧后返回。接口命名应表达这一点：

- `ScheduleDistanceQueryAsync`
- `RequestVisibilityAsync`
- `CalculateForNextFrameAsync`
- `CompleteNowForCriticalPath`

不要把可能跨帧的 Job 方法命名成普通 `GetResult`，否则调用方会误以为立即返回。延迟语义是玩法体验的一部分，必须写清楚。

#### 9. 错误处理阶段

Job 封装的错误可以分为三阶段：

调度前错误：输入为空、长度不匹配、参数非法、容量不足、owner 已失效。这些应在主线程校验，直接返回失败结果，不要送进 Job。

执行中错误：越界、非法访问、读写冲突、安全系统报错。应尽量通过调度前校验和安全检查避免。

收尾错误：Complete 报错、结果解析失败、Dispose 重复、取消后错误写回。这些由封装层统一捕获并记录上下文。

日志至少包含 Job 名称、请求 id、输入数量、Allocator、owner、提交帧、等待帧数、取消状态和异常信息。

#### 10. 业务语义封装

底层封装提供 JobRequest，而业务层应提供语义接口。例如：

```csharp
public UniTask<VisibilityResult> QueryVisibilityAsync(
    VisibilityInput input,
    CancellationToken token);
```

调用方不关心 NativeArray，不关心 batch size，不关心 Complete。它只知道这是一次可见性查询。底层服务可以根据当前帧请求量选择立即同步、单独 Job 或批处理 Job。这就是高级封装的价值。

#### 11. 观测指标

Job 封装应记录：

- 每帧调度 Job 数量。
- 每种 Job 输入规模。
- 平均等待帧数。
- Complete 峰值耗时。
- NativeContainer 分配量。
- 取消请求数量。
- 废弃结果数量。
- 失败数量。
- 批处理合并率。
- Burst 是否启用。

没有这些指标，就不知道封装是否真的提升性能。

#### 12. 与 UniTask 的集成边界

UniTask 适合表达“等待 Job 完成”的控制流，但不能改变 Job 的本质。不要把 Job 当成普通可取消任务，也不要让 UniTask 封装掩盖 NativeContainer 生命周期。正确关系是：

```text
Job System 负责并行计算
JobHandle 表达执行状态和依赖
UniTask 负责主线程非阻塞等待
封装层负责生命周期、取消和结果映射
```

### 实现方案

#### 1. JobAwaiter 示例

```csharp
public static class JobHandleAwaiter
{
    public static async UniTask<bool> WaitAsync(
        JobHandle handle,
        CancellationToken token)
    {
        bool canceled = false;

        while (!handle.IsCompleted)
        {
            if (token.IsCancellationRequested)
            {
                canceled = true;
            }

            await UniTask.Yield(PlayerLoopTiming.Update);
        }

        handle.Complete();
        return !canceled;
    }
}
```

这个示例表达核心思想：等待期间不阻塞主线程，取消只标记结果不再需要，最终仍 Complete 收尾。生产实现还应加入任务名、超时、异常日志和调试统计。

#### 2. JobRequest 示例

```csharp
public sealed class DistanceJobRequest : IDisposable
{
    public int RequestId { get; }
    public JobHandle Handle { get; private set; }
    public NativeArray<float3> Positions;
    public NativeArray<float> Results;
    private bool _disposed;

    public void Schedule(float3 target)
    {
        var job = new DistanceJob
        {
            Positions = Positions,
            Target = target,
            Results = Results
        };

        Handle = job.Schedule(Positions.Length, 64);
    }

    public float[] CompleteToArray()
    {
        Handle.Complete();
        float[] values = Results.ToArray();
        Dispose();
        return values;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (Positions.IsCreated) Positions.Dispose();
        if (Results.IsCreated) Results.Dispose();
    }
}
```

业务层不应长期持有 `Results`，而应拿到托管结果或由封装层把结果写入指定缓存。

#### 3. Async Job 服务示意

```csharp
public async UniTask<float[]> CalculateDistancesAsync(
    IReadOnlyList<Vector3> positions,
    Vector3 target,
    CancellationToken token)
{
    var request = CreateDistanceRequest(positions, target);

    try
    {
        request.Schedule(target);

        bool needResult = await JobHandleAwaiter.WaitAsync(request.Handle, token);
        if (!needResult)
        {
            request.Dispose();
            return Array.Empty<float>();
        }

        return request.CompleteToArray();
    }
    catch (Exception ex)
    {
        Debug.LogException(ex);
        request.Dispose();
        throw;
    }
}
```

这比业务层自己创建 NativeArray 更安全。注意此处返回 `float[]` 会分配，适合低频或结果需要托管数组的场景。高频场景可以让调用方提供结果缓存，或使用封装层内部池化数组。

#### 4. 批处理服务示意

```csharp
public sealed class DistanceBatchService
{
    private readonly List<DistanceQuery> _queries = new();

    public UniTask<DistanceResult> RequestAsync(
        DistanceInput input,
        CancellationToken token)
    {
        var source = new UniTaskCompletionSource<DistanceResult>();
        _queries.Add(new DistanceQuery(input, token, source));
        return source.Task;
    }

    public void ScheduleBatch()
    {
        if (_queries.Count == 0)
        {
            return;
        }

        // 1. 合并输入
        // 2. 创建 NativeArray
        // 3. 调度批量 Job
        // 4. 完成后按 query 范围分发结果
        // 5. 对已取消 query 丢弃结果
    }
}
```

批处理服务更复杂，但能显著减少大量小 Job 的调度成本。

#### 5. 封装评审清单

- 是否有立即 Complete 反模式？
- await 等待期间是否阻塞主线程？
- 取消后是否过早 Dispose？
- Job 完成后是否一定释放容器？
- 结果是否可能晚返回覆盖新状态？
- 是否支持 owner 生命周期？
- 是否记录输入规模和等待帧数？
- 是否区分同步关键路径和异步可延迟路径？
- 是否考虑批处理？
- 是否用 Profiler 验证收益？

### 总结

Job System 的高级封装不是为了把底层概念全部藏起来，而是为了把危险细节集中治理。业务层需要的是“计算可见性”“批量评分”“生成网格”“查询候选目标”这样的语义接口；框架层负责 NativeContainer、JobHandle、依赖、取消、Complete、Dispose、Profiler 和日志。这样既能保留 Job System 的性能优势，又能避免每个业务开发者重复踩底层坑。

与 UniTask 集成时，要牢记：UniTask 只是等待控制流，不能改变 Job 不能强制取消、NativeContainer 需要释放、Complete 可能阻塞的事实。成熟封装应做到非阻塞等待、取消废弃结果、完成后释放资源、批量调度、指标可观测。只有这样，Job System 才能从“性能示例代码”升级为项目可长期维护的并行计算基础设施。


#### 附录 A：为什么不能简单暴露 NativeArray

把 NativeArray 直接返回给业务层看似高效，但风险很高。业务层可能在 Job 未完成时读取，可能在 Dispose 后继续持有，也可能跨帧保存引用。更安全的做法是封装层负责读取结果，并返回托管快照、写入调用方提供的缓存，或通过受控访问器在有效期内读取。性能敏感路径可以设计专用结果缓存，但仍要明确生命周期。

#### 附录 B：取消路径的资源释放

取消路径最容易泄漏。请求被取消时，如果 Job 尚未完成，不能 Dispose；如果 Job 已完成，必须 Complete 并 Dispose；如果业务不需要结果，也要释放输出容器。封装层可以维护一个 canceled pending 列表，每帧检查已完成的取消请求并清理。不要让取消请求从管理器里消失，否则容器无人释放。

#### 附录 C：同步接口仍然需要存在

不是所有计算都适合异步。有些关键路径必须本帧得到结果。封装层可以提供明确同步接口，例如 `CalculateNow`，并在文档中说明会阻塞主线程，只适合小数据或关键路径。异步接口和同步接口并存，比偷偷在异步接口内部 Complete 更诚实。

#### 附录 D：任务优先级

多个 Job 请求同时存在时，可以按优先级调度。战斗关键计算优先于后台统计，当前屏幕相关计算优先于远处预计算，玩家输入响应优先于表现辅助。调度器可以在每帧预算内选择高优先级请求进入批处理，低优先级请求延迟到后续帧。这样能避免后台 Job 抢占关键计算资源。

#### 附录 E：池化与容量管理

Job 封装若频繁处理相似规模数据，可以池化请求对象和 NativeContainer。但容量管理必须谨慎：容量不足时扩容，扩容后旧容器要等 Job 完成再释放；容量过大时长期占用原生内存。建议记录峰值容量和使用率，定期评估是否需要缩容或分级池。

#### 附录 F：调试面板

高级封装可以提供调试面板，显示当前未完成请求、Job 类型、owner、提交帧、等待帧数、输入规模、是否取消、是否 Burst、预计 Complete 阶段。这个面板对定位“为什么某一帧 Complete 很慢”非常有帮助。没有可观测性，Job 封装很容易变成黑盒。

#### 附录 G：异常上下文

Job 相关异常日志应包含足够上下文。例如：`Job=VisibilityBatch, RequestCount=18, TotalItems=4200, Allocator=TempJob, SubmittedFrame=10240, WaitFrames=2, Owner=BattleSession#3`。这样的日志能快速定位规模和生命周期问题。只有 `Job failed` 的日志几乎没有排查价值。

#### 附录 H：批处理结果映射

批处理的难点不是调度 Job，而是把结果正确分发给请求方。每个请求应记录输入起始索引、长度、请求 id、完成源和取消 token。Job 输出完成后，封装层按这些区间切片结果。取消的请求不回调，但仍保持数组布局稳定。若请求之间结果长度不同，需要额外记录 offset 表。

#### 附录 I：与 ECS 的接口

如果项目使用 ECS，Job 封装可能围绕 System 和 EntityQuery 展开；如果项目仍是 GameObject 架构，封装更多是服务式批处理。两种模式不要混写。GameObject 项目可以先封装计算服务，未来若迁移 ECS，再替换底层数据来源，业务语义接口可以尽量保持稳定。

#### 附录 J：最终落地路线

第一步，封装一个非阻塞 JobHandle awaiter。第二步，封装一个带 Dispose 的 JobRequest。第三步，为一个真实业务场景提供语义接口。第四步，加入取消结果废弃。第五步，记录耗时和输入规模。第六步，再考虑批处理和池化。不要一开始就做大而全的 Job 框架，否则很难验证价值。


#### 附录 K：JobAwaiter 的生产级细节

示例中的 JobAwaiter 只展示思想，生产版本还需要考虑更多细节。首先，等待频率应与 PlayerLoopTiming 匹配。某些结果可以在 Update 检查，某些结果适合 LateUpdate 检查，避免在结果尚未需要时过早 Complete。其次，等待过程要记录提交帧和当前帧，计算等待帧数。等待帧数过长可能说明 Job 太重、依赖链太长或工作线程被其他任务占满。

再次，JobAwaiter 应避免在 token 取消后直接退出而不处理 handle。它应该把请求交给清理队列，或者继续等待 Job 完成后释放资源。最后，Complete 后应进入统一收尾阶段，确保安全系统状态更新、结果读取和 Dispose 顺序正确。Job 的 awaiter 本质上不是普通任务 awaiter，而是 Native 资源生命周期管理器的一部分。

#### 附录 L：取消后的两种策略

取消后可以有两种策略。第一种是“等待完成并清理”，适合短 Job。token 取消后，await 仍然等待 handle 完成，但不返回结果。这样简单安全，缺点是取消调用方仍可能等到 Job 完成。第二种是“立即返回，后台清理”，适合可能较长的 Job。token 取消后，业务 await 立即得到 canceled，封装层把请求加入后台清理列表，等 handle 完成后释放容器。

第二种体验更好，但框架复杂度更高。它需要确保清理列表在系统销毁前处理完成，或者在销毁时安全 Complete 所有未完成 Job。项目应根据 Job 时长和业务体验选择策略，不要混用得没有规则。

#### 附录 M：结果缓存与零 GC 返回

很多封装为了方便会把 NativeArray 转成托管数组返回：

```csharp
float[] result = nativeResult.ToArray();
```

这会产生 GC 分配。低频工具没问题，高频路径应避免。可以让调用方传入结果缓存：

```csharp
public UniTask FillDistancesAsync(
    NativeSlice<float3> positions,
    Vector3 target,
    float[] output,
    CancellationToken token)
```

或者使用框架管理的 Native 结果缓存，在主线程消费后归还。封装层需要提供两类接口：易用接口允许分配，性能接口允许复用缓存。不要用一种接口覆盖所有场景。

#### 附录 N：输入校验前置

Job 内部不适合做大量防御式异常。调度前应检查输入长度是否一致、结果容器容量是否足够、参数是否有限值、索引是否越界、owner 是否仍然有效。非法输入直接在主线程返回失败。这样可以避免 Burst Job 中出现难以调试的非法访问。

例如路径距离计算要求至少两个点；可见性检测要求矩阵数组和包围盒数组长度一致；网格生成要求顶点数量不超过索引格式限制。这些都应在封装层校验，而不是把错误数据送进 Job。

#### 附录 O：依赖注入与服务生命周期

Job 封装通常以服务形式存在，例如 `IVisibilityQueryService`、`IPathScoreService`、`IMeshBuildService`。这些服务应有明确生命周期：战斗内服务随战斗创建和销毁；全局服务随应用存在；场景服务随场景卸载清理所有未完成请求。服务销毁时必须处理 pending Job，不能留下未释放 NativeContainer。

如果项目有 DI 容器，可以将 Job 服务注册为 scoped 生命周期。比如 BattleScope 中创建 AIJobService，战斗结束时 Dispose，统一取消未完成请求、Complete 清理和释放缓存。这样比每个系统自己管理 Job 更安全。

#### 附录 P：批处理的延迟窗口

批处理通常需要等待一个收集窗口。例如本帧多个系统都可能提交距离查询，服务可以在 Update 收集请求，在 LateUpdate 统一 Schedule，下一帧 EarlyUpdate 或 LateUpdate 取结果。这个收集窗口会引入延迟，但能提升吞吐。对于可延迟任务，这种延迟可接受；对于即时任务，应该走同步或独立快速路径。

因此批处理服务应暴露延迟语义，不能让调用方误以为结果会立即可用。接口文档可以写明：请求通常在下一帧返回；高负载下可能延迟多帧；取消后不会回调结果。

#### 附录 Q：优先级与饥饿

引入优先级后要避免低优先级任务长期饥饿。可以采用配额策略：每帧优先处理高优先级，同时保留一部分预算给低优先级。或者给等待过久的低优先级任务提升优先级。Job 调度器不是越复杂越好，但一旦服务多个系统，就需要防止某类请求永远排不到。

#### 附录 R：请求合并与去重

同一帧多个系统可能请求相同计算。例如多个 UI 模块请求同一角色头像预处理，多个 AI 系统请求同一组目标距离。封装层可以根据 key 做去重：相同输入共享一个 Job 结果，不重复调度。去重需要定义输入 key 和结果引用计数，复杂度较高，但在热点场景收益明显。

#### 附录 S：安全释放顺序

完成阶段推荐顺序：

```text
1. handle.Complete()
2. 检查请求是否取消
3. 若未取消，读取或复制结果
4. 释放 NativeContainer
5. 标记请求完成
6. 通知等待方
```

不要先通知等待方再释放容器，否则调用方可能在释放过程中访问结果；也不要先释放再读取；也不要在 Complete 前释放。顺序问题是 Job 封装中最常见的隐患之一。

#### 附录 T：Profiler Marker

封装层可以使用 ProfilerMarker 标记阶段：

```csharp
private static readonly ProfilerMarker ScheduleMarker = new("VisibilityJob.Schedule");
private static readonly ProfilerMarker CompleteMarker = new("VisibilityJob.Complete");
private static readonly ProfilerMarker ApplyMarker = new("VisibilityJob.Apply");
```

这样在 Profiler 中可以看到调度、等待和回写分别花了多少时间。没有 Marker，性能分析时只能看到零散调用栈，不容易判断封装层是否产生额外开销。

#### 附录 U：Job 框架的测试方式

Job 封装要测试正常完成、取消后完成、取消后立即返回并延迟清理、输入非法、重复 Dispose、owner 销毁、批处理分发、请求去重、结果过期等路径。测试不一定都跑 Burst，但至少要验证状态机和资源释放逻辑。NativeContainer 泄漏类问题还要结合 Leak Detection 和集成测试。

#### 附录 V：示例代码与生产代码

示例代码为了说明概念，通常会省略很多保护逻辑。生产代码必须处理 owner、token、异常、Dispose、Profiler、容量、取消和调试信息。不要把文档里的最小示例直接复制成项目公共框架。正确做法是先理解模型，再根据项目约束实现自己的版本。


#### 附录 W：业务接口示例

一个路径评分服务可以这样设计：

```csharp
public interface IPathScoreService
{
    UniTask<PathScoreResult> RequestScoreAsync(
        PathScoreInput input,
        PathScoreQuality quality,
        CancellationToken token);
}
```

`quality` 可以决定同步小计算、普通异步 Job 或高精度批处理。调用方只表达需要什么，不决定怎么计算。底层服务可以根据当前负载、输入规模和优先级选择策略。这样封装才真正保留优化空间，而不是把每个调用点都绑定到具体 Job 类型。

#### 附录 X：同步小数据路径

某些输入规模很小，使用 Job 反而浪费。封装层可以做阈值判断：

```text
数量 < 32：主线程同步计算
数量 32~1000：单 Job
数量 > 1000：批处理 Job
```

阈值不是固定答案，需要 Profiling。重要的是封装层可以集中调整阈值，业务代码不用改。这样比每个业务点自己决定是否 Job 化更可维护。

#### 附录 Y：跨帧结果版本

如果 Job 结果晚一帧或多帧返回，输入世界可能已经变化。解决方案是版本号。提交请求时记录世界版本，回写时比较当前版本。如果版本不一致，可以废弃结果，或者做局部校验。战斗系统、地图系统、实体池系统都应提供版本号，帮助异步计算判断结果是否仍有效。

#### 附录 Z：Dispose 与异常安全

C# 的 `using` 在同步作用域里很好用，但跨 async/await 和 Job 时要格外小心。NativeContainer 不能在 Job 未完成时离开作用域自动 Dispose。封装应让容器生命周期覆盖整个 Job 执行和结果读取阶段。可以使用 try/finally，但 finally 中也要先 Complete 或确认 Job 未调度，不能盲目释放。

#### 附录 AA：面向业务的错误结果

Job 封装不应只抛异常。输入非法可以返回 `InvalidInput`，owner 取消可以返回 `Canceled`，结果过期可以返回 `Stale`，系统错误才进入异常。这样业务层可以更精确地决定是否重试、是否忽略、是否提示。尤其是取消和过期，通常不应打 Error 日志。

#### 附录 AB：团队分层

建议将 Job 封装分三层：底层是 Job 工具和 Awaiter；中层是批处理调度和容器生命周期；上层是业务计算服务。业务开发者只依赖上层接口；性能开发者维护中底层；框架负责人定义日志、Profiler 和测试规范。分层越清楚，Job System 越容易推广。

#### 附录 AC：与普通多线程封装的区别

Task 封装通常关注线程池、取消、异常和主线程回调；Job 封装额外关注 NativeContainer、Allocator、JobHandle、Burst、安全系统和 Complete 时机。不能把普通 TaskRunner 直接套到 Job 上。Job 的生命周期不是 managed task 生命周期，它还包含原生内存和调度依赖。

#### 附录 AD：上线风险

Job 封装上线前要特别关注：取消时容器泄漏、结果过期写回、Complete 峰值、Burst 编译差异、低端机工作线程不足、调度器请求积压。建议先在一个非核心模块试点，再推广到战斗关键路径。不要一口气把大量系统迁到新 Job 框架。

#### 附录 AE：最终原则

高级封装的目标，是让业务得到简单接口，让框架承担复杂生命周期，让性能仍可观测，让结果仍可验证。任何封装如果让 Job 成为黑盒，无法知道何时调度、何时 Complete、分配了多少 Native 内存、为什么取消，就不是高级封装，而是把问题藏起来。


#### 附录 AF：最低可用版本

一个最低可用的 Job 异步封装至少要包含四个组件：`JobHandle` 非阻塞等待器、`JobRequest` 生命周期对象、取消后的延迟清理队列、Profiler Marker。没有这四个组件，封装很容易在正常流程看起来能跑，但在取消、异常、场景切换或性能分析时失控。等最低版本稳定后，再增加批处理、池化、优先级和去重。

#### 附录 AG：一句话总结

Job 异步封装最重要的不是 await，而是资源安全；最重要的不是隐藏 API，而是保留调度能力；最重要的不是写得像普通异步方法，而是让并行计算在可观测、可取消、可释放的框架内运行。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** Unity、Job System、UniTask、JobHandle、NativeContainer、异步封装、批处理
- **来源：** 已有文稿整理、官方文档校正、工程化经验重写

---

*文档基于与吉良吉影的讨论，由小雅整理*
