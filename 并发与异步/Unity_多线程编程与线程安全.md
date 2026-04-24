# Unity 多线程编程与线程安全

## 摘要

本文重写《Unity 多线程编程与线程安全》，移除原文中重复的引言、重复结尾和示例堆叠，将内容整理为一篇面向 Unity 工业化开发的多线程基础与线程安全文档。文章从 Unity 主线程限制、Task.Run 与线程池、SynchronizationContext、UniTask 线程切换、共享数据风险、锁、原子操作、并发集合、不可变快照、主线程调度器、取消、异常、死锁、测试与验收等角度展开。目标是让开发者理解：多线程不是“把代码丢到后台”这么简单，而是围绕数据边界、生命周期、线程安全和回主线程应用结果建立完整规范。

## 正文

### 背景

协程和 UniTask 能处理很多异步流程，但它们并不等同于多线程。协程运行在 Unity 主线程，UniTask 的 PlayerLoop 等待也常用于主线程异步；只有显式切到线程池、使用 Task.Run、创建 Thread、使用 Job System，才涉及真正的后台执行。随着项目中出现大 JSON 解析、资源包解压、寻路预计算、日志压缩、文件读写、网络数据处理等耗时任务，开发者会自然想到多线程。

原文对多线程概念、Task.Run、线程安全、lock、Interlocked 和 ConcurrentQueue 做了基础介绍，但存在大量重复段落，而且对 Unity 主线程限制和工程边界还可以更深入。本文将补足这些内容，强调“线程安全不是只加锁”，更重要的是减少共享可变状态、使用数据快照、明确主线程回写、建立调度器和取消流程。

### 核心内容

#### 1. Unity 为什么强调主线程

Unity 引擎的大量对象和 API 不是线程安全的，例如 GameObject、Transform、Component、Renderer、Animator、UI、资源实例化、场景对象查询等。它们背后连接着引擎内部状态、渲染管线、物理系统和对象生命周期。若允许多个线程同时修改这些状态，引擎必须付出巨大的同步成本，也会引入难以预测的数据竞争。因此 Unity 要求绝大多数 UnityEngine API 在主线程访问。

这不意味着 Unity 不能使用多线程，而是要把“计算”和“引擎对象操作”分开。后台线程处理纯 C# 数据，主线程收集输入快照和应用结果。典型流程是：

```text
主线程读取 Unity 状态 -> 制作纯数据快照 -> 后台线程计算 -> 主线程取回结果 -> 更新 Unity 对象
```

如果后台线程直接访问 `transform.position`，就是越界。如果它处理的是一个 `Vector3[]` 快照，就安全得多。

#### 2. Task.Run 的合理使用

`Task.Run` 会把工作提交给 .NET 线程池，适合执行纯 C# 的 CPU 或 IO 工作：

```csharp
public async Task<int> CalculateAsync(int[] values)
{
    return await Task.Run(() =>
    {
        int sum = 0;
        for (int i = 0; i < values.Length; i++)
        {
            sum += values[i];
        }
        return sum;
    });
}
```

在 Unity 中，`Task.Run` 的使用边界非常明确：

适合：
- 文件读写。
- 文本解析。
- 协议解码。
- 压缩和解压。
- 加密和哈希。
- 排序和纯算法。
- 不访问 Unity API 的第三方 SDK 调用。

不适合：
- Instantiate。
- Destroy。
- GetComponent。
- 修改 Transform。
- 更新 UI。
- 读取 Unity 对象属性。
- 操作大部分 Unity 资源对象。

后台任务完成后，必须通过主线程调度器或 UniTask 切回主线程应用结果。

#### 3. SynchronizationContext 与主线程回调

Unity 在主线程上设置了同步上下文，允许把回调投递回主线程。但在项目中直接散落使用 `SynchronizationContext.Post` 会让代码难以追踪。更推荐封装主线程调度器：

```csharp
public sealed class MainThreadDispatcher : MonoBehaviour
{
    private static readonly ConcurrentQueue<Action> Queue = new();

    // Thread-safe dispatch
    public static void Post(Action action)
    {
        if (action != null)
        {
            Queue.Enqueue(action);
        }
    }

    private void Update()
    {
        int count = 0;
        while (count < 100 && Queue.TryDequeue(out var action))
        {
            try
            {
                action.Invoke();
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
            }

            count++;
        }
    }
}
```

这里的每帧最多执行 100 个任务是一个预算控制。正式项目中还可以按优先级分队列，避免后台线程一次性投递大量回调造成主线程卡顿。

#### 4. UniTask 线程切换

如果项目使用 UniTask，可以用更自然的写法表达线程切换：

```csharp
public async UniTask<Config> LoadConfigAsync(string path, CancellationToken token)
{
    await UniTask.SwitchToThreadPool();

    string json = File.ReadAllText(path);
    Config config = JsonUtility.FromJson<Config>(json);

    await UniTask.SwitchToMainThread();
    token.ThrowIfCancellationRequested();

    return config;
}
```

这段代码仍然需要遵守原则：后台阶段只处理纯 C# 数据；主线程阶段才访问 Unity API。UniTask 简化了语法，但没有消除线程安全边界。

#### 5. 竞态条件

竞态条件是多个线程访问同一可变数据，最终结果取决于不可控执行顺序。例如：

```csharp
_counter++;
```

它看起来是一条语句，实际上包含读取、增加、写回。两个线程可能同时读取相同旧值，导致一次增加丢失。解决方式包括 lock、Interlocked、数据隔离、不可变快照等。

#### 6. lock 的正确用法

`lock` 用于保护临界区：

```csharp
private readonly object _gate = new();
private int _counter;

public void Add()
{
    lock (_gate)
    {
        _counter++;
    }
}
```

使用 lock 的规则：

- 锁对象必须是私有 readonly object。
- 不要 lock `this`、字符串或公开对象。
- 锁内只做必要读写。
- 不要在锁内 await。
- 不要在锁内调用外部回调。
- 不要在锁内访问 Unity API。
- 多锁场景必须规定获取顺序。

`lock` 能保证互斥，但也会降低并发度。锁范围过大，多线程就会退化成排队执行；锁范围过小，又可能保护不完整。

#### 7. Interlocked

对于简单数值操作，`Interlocked` 更轻量：

```csharp
Interlocked.Increment(ref _counter);
int value = Interlocked.CompareExchange(ref _state, newValue, expected);
```

它适合计数器、状态位、一次性初始化标记等。它不适合复杂对象一致性。多个字段需要保持一致时，仍然需要锁或不可变快照。

#### 8. volatile 与内存可见性

多线程中，一个线程写入的值不一定立即按你想象的方式被另一个线程观察到。`volatile` 可以约束某些读写重排序和缓存可见性，但它不是通用线程安全工具。不要用 `volatile` 替代 lock。对于简单停止标记，可以使用 `volatile bool` 或 CancellationToken；对于复杂状态，仍然要用同步机制。

#### 9. Concurrent 集合不是万能锁

`ConcurrentQueue<T>`、`ConcurrentDictionary<TKey,TValue>` 等集合能保证集合内部操作线程安全，但不能保证业务复合操作安全。

例如：

```csharp
if (!dict.ContainsKey(key))
{
    dict[key] = value;
}
```

即使用 ConcurrentDictionary，这种“检查再写入”也可能存在竞态，应该用 `GetOrAdd` 或更高层同步。并发集合适合生产者消费者、线程安全缓存等场景，不适合让复杂业务状态随意多线程写。

#### 10. 不可变快照优先

线程安全最好的方式是避免共享可变状态。主线程制作输入快照：

```csharp
var snapshot = new EnemySnapshot[enemies.Count];

for (int i = 0; i < enemies.Count; i++)
{
    snapshot[i] = new EnemySnapshot
    {
        Id = enemies[i].Id,
        Position = enemies[i].transform.position,
        Hp = enemies[i].Hp
    };
}
```

后台线程只处理 snapshot，生成结果数组。主线程根据结果回写。这样后台线程不直接碰 Unity 对象，也不和主线程争夺同一份可变集合。

#### 11. 死锁

死锁通常来自循环等待。例如线程 A 持有锁 X 等锁 Y，线程 B 持有锁 Y 等锁 X。Unity 项目中还有一种常见死锁：主线程等待后台任务完成，后台任务又等待主线程回调执行。两边互等，游戏卡死。

避免死锁的规则：

- 不在主线程无期限等待后台任务。
- 不在锁内等待任务。
- 不在后台任务中同步等待主线程回调。
- 多锁按固定顺序获取。
- 所有等待都设置超时或取消。
- 复杂流程优先消息传递，不要嵌套锁。

#### 12. 取消机制

后台任务必须支持取消。场景切换、界面关闭、账号登出、应用退出时，不需要的任务应尽快结束。示例：

```csharp
public async Task ParseAsync(string text, CancellationToken token)
{
    await Task.Run(() =>
    {
        for (int i = 0; i < text.Length; i++)
        {
            token.ThrowIfCancellationRequested();
            ParseChar(text[i]);
        }
    }, token);
}
```

取消不是强杀线程，而是协作式停止。任务内部必须定期检查 token。对于不支持取消的阻塞 IO，要通过超时、结果废弃或外层生命周期控制处理。

#### 13. 异常处理

后台任务异常如果没有被 await 或观察，可能变成未观察异常，或者只在日志中表现为难以定位的问题。所有后台入口应统一 try/catch，并记录任务名、线程 id、owner、输入规模和耗时。主线程调度器执行回调时也要隔离异常，不能让一个回调破坏整个队列。

#### 14. 多线程与 GC

多线程不一定减少 GC。Task、闭包、lambda、临时集合、结果数组都会分配。后台线程也可能制造大量托管对象，最终仍由 GC 处理。性能优化要同时看主线程耗时、后台耗时、GC Alloc、内存峰值和回调峰值。

#### 15. 与 Job System 的边界

C# 多线程适合复杂控制流、IO 和普通纯 C# 逻辑；Job System 适合大量数据并行、连续内存和 Burst 可优化的计算。不要用 Task.Run 处理上万实体每帧的数值循环；不要用 Job System 等待网络请求。工具选择应基于任务类型。

### 实现方案

#### 1. 主线程调度器模板

```csharp
public sealed class UnityMainThread : MonoBehaviour
{
    private static readonly ConcurrentQueue<Action> Queue = new();
    private const int MaxActionsPerFrame = 200;

    public static void Post(Action action)
    {
        if (action != null)
        {
            Queue.Enqueue(action);
        }
    }

    private void Update()
    {
        for (int i = 0; i < MaxActionsPerFrame; i++)
        {
            if (!Queue.TryDequeue(out var action))
            {
                break;
            }

            try
            {
                action();
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
            }
        }
    }
}
```

#### 2. 后台任务安全模板

```csharp
public static async Task<T> RunBackgroundAsync<T>(
    string taskName,
    Func<CancellationToken, T> worker,
    CancellationToken token)
{
    try
    {
        return await Task.Run(() =>
        {
            token.ThrowIfCancellationRequested();
            return worker(token);
        }, token);
    }
    catch (OperationCanceledException)
    {
        throw;
    }
    catch (Exception ex)
    {
        Debug.LogError($"Background task failed: {taskName}");
        Debug.LogException(ex);
        throw;
    }
}
```

#### 3. 快照与回写模板

```csharp
public async UniTask UpdateAiAsync(List<Enemy> enemies, CancellationToken token)
{
    var snapshots = new EnemySnapshot[enemies.Count];

    for (int i = 0; i < enemies.Count; i++)
    {
        snapshots[i] = EnemySnapshot.From(enemies[i]);
    }

    var decisions = await UniTask.RunOnThreadPool(() =>
    {
        return AiSolver.Solve(snapshots);
    }, cancellationToken: token);

    token.ThrowIfCancellationRequested();

    for (int i = 0; i < enemies.Count; i++)
    {
        if (enemies[i] != null)
        {
            enemies[i].ApplyDecision(decisions[i]);
        }
    }
}
```

#### 4. Code Review 清单

- 后台线程是否访问了 Unity API？
- 是否制作了输入快照？
- 结果回写是否在主线程？
- 是否支持取消？
- 是否设置超时？
- 是否观察异常？
- 是否存在共享可变集合？
- 是否使用 lock，锁范围是否过大？
- 是否在锁内 await 或调用回调？
- 是否可能主线程等待后台，后台等待主线程？
- 是否需要用 Job System 替代 Task.Run？
- 是否在目标平台验证线程支持？

### 总结

Unity 多线程的核心不是“多开几个线程”，而是建立清晰的数据边界。主线程负责 Unity 对象访问，后台线程负责纯数据处理；共享状态越少，线程安全问题越少；结果必须通过明确的主线程回写路径应用。`lock`、`Interlocked`、Concurrent 集合只是工具，不是架构本身。

在工业化项目中，多线程代码必须配套取消、异常、日志、调度预算、压力测试和平台验证。简单 IO 和纯 C# 计算可以使用 Task 或 UniTask 线程池；大量数据并行计算应考虑 Job System 和 Burst。只要团队坚持“快照输入、后台计算、主线程回写、生命周期可取消”的原则，多线程就能成为提升性能的工具，而不是偶发 bug 的来源。


#### 附录 A：线程安全测试建议

多线程问题往往在正常流程中不稳定复现，因此测试应主动制造竞争。可以增加并发次数、随机 Sleep、快速取消、重复场景切换、并行读写同一个 key、主线程回调积压等场景。对调度器要测试单帧大量投递；对缓存要测试并发读写；对取消要测试任务开始前、运行中、回写前不同阶段取消。

#### 附录 B：日志字段建议

后台任务日志应包含任务名、线程 id、owner、输入规模、开始时间、结束时间、耗时、取消状态和异常类型。没有这些上下文，多线程偶发异常很难定位。不要只打印“解析失败”，而要打印“ConfigParse failed, file=xxx, bytes=12345, thread=8, elapsed=42ms”。

#### 附录 C：平台注意事项

不同平台对线程的支持和性能表现不同。移动端线程过多可能增加功耗和调度开销；WebGL 的线程能力受构建配置和浏览器环境影响；主机平台可能有特定线程限制。任何多线程优化都必须在目标平台验证，而不是只在编辑器里跑通。

#### 附录 D：主线程预算

后台任务完成后集中回调主线程，也可能造成卡顿。比如 50 个文件解析同时完成，每个回调都创建 UI 或实例化对象，主线程仍会爆峰。因此调度器要有每帧预算，结果应用也可以分批。多线程解决的是后台计算时间，不会自动消除主线程应用结果的成本。

#### 附录 E：什么时候不要上多线程

如果任务只处理几十个元素，耗时不足 0.1ms，引入 Task 可能比直接执行更贵。如果任务强依赖 Unity API，后台线程也帮不上忙。如果问题是资源加载等待，应该用引擎异步 API 或 Addressables，而不是自己开线程。如果问题是大规模数值计算，应优先评估 Job System。多线程不是默认优化选项，而是有成本的工程手段。


#### 附录 F：线程模型与游戏循环的关系

游戏主循环要求每帧在固定时间预算内完成输入、脚本、动画、物理、渲染提交和 UI 更新。60 FPS 下单帧预算约 16.6ms，30 FPS 下约 33.3ms。多线程的目标不是让所有工作“消失”，而是让主线程不要在同一帧承担过多同步计算。后台线程可以提前准备数据，但最后的 Unity 对象修改仍要回到主线程。因此衡量多线程优化时，要看主线程峰值是否下降，而不是只看总耗时是否变化。

例如一个地图分析任务同步执行需要 20ms，会直接造成掉帧。将它放到后台线程后，总计算时间可能仍是 20ms，甚至因为调度和拷贝变成 23ms，但主线程只需要花 1ms 准备输入和 1ms 应用结果，玩家感受到的卡顿会明显降低。这个例子说明，多线程优化关注的是帧时间分布，而不是单纯减少绝对计算量。

#### 附录 G：数据所有权设计

线程安全最容易失控的地方，是不知道数据属于谁。一个集合如果主线程会修改，后台线程也会修改，那么任何访问都要同步；同步一多，复杂度和卡顿都会上升。更好的方式是规定所有权：主线程拥有 Unity 世界状态，后台线程拥有任务内部临时数据，结果通过消息传递回主线程。所有权清楚后，锁会少很多。

可以将数据分为三类：第一类是主线程专属数据，例如 MonoBehaviour、Transform、UI 状态；第二类是后台任务私有数据，例如解析过程中的临时数组；第三类是跨线程传递的数据，例如不可变快照和结果消息。只有第三类需要特别设计传递协议。不要让任意对象随便跨线程共享。

#### 附录 H：生产者消费者模型

生产者消费者是 Unity 多线程中非常常见的模式。后台线程作为生产者，把解析结果、下载完成事件、日志包或计算结果放入线程安全队列；主线程作为消费者，在 Update 中取出并处理。这个模式比后台线程直接调用主线程对象安全得多。

需要注意的是，队列并不是越快消费越好。若一帧取出所有结果，可能造成主线程尖峰；若消费太少，又会增加延迟。正式项目可以给队列设置每帧时间预算，而不是固定条数。例如每帧最多处理 2ms，超过预算的结果留到下一帧。这样可以在响应速度和帧稳定性之间取得平衡。

#### 附录 I：线程池饥饿与任务堆积

线程池不是无限资源。如果项目大量使用 `Task.Run` 执行长时间阻塞任务，可能导致线程池饥饿，后续任务排队延迟增加。尤其是文件 IO、网络等待、压缩解压混在一起时，任务调度可能变得不可预测。对耗时任务应使用专门队列或限制并发，而不是无限制提交到线程池。

可以按任务类型限制并发：文件读取最多 2 个，解压最多 1 个，后台解析最多 2 个，埋点上传可低优先级。这样比“谁需要就 Task.Run”更稳定。多线程优化不是启动越多任务越好，而是让系统在可控并发下持续工作。

#### 附录 J：锁竞争的性能问题

锁本身不是错误，错误的是高频大范围锁竞争。若多个后台线程不断争抢同一把锁，CPU 时间会浪费在等待上。若主线程也需要这把锁，可能导致帧时间抖动。比如主线程每帧读取一个全局缓存，后台线程正在持锁写入大块数据，主线程就可能被阻塞。

解决方式包括：缩短锁范围、使用双缓冲、用不可变快照替换共享集合、把写入集中到主线程、用 ConcurrentQueue 做消息传递。不要把一个全局大 Dictionary 用一把锁保护所有读写，然后期望它在高并发下表现良好。

#### 附录 K：双缓冲策略

双缓冲适合一边写、一边读的场景。后台线程写入 back buffer，主线程读取 front buffer；在安全点交换引用。交换过程只需要很短的锁或原子操作。这样可以避免主线程和后台线程同时操作同一份数据。

示意流程：

```text
后台线程：写 backBuffer
主线程：读 frontBuffer
安全点：交换 frontBuffer/backBuffer
```

双缓冲常用于日志、传感器数据、网络状态同步、后台计算结果刷新等场景。它的核心价值是减少锁持有时间，让读写分离。

#### 附录 L：Unity 对象引用泄漏

后台任务如果捕获了 MonoBehaviour 或 GameObject 引用，即使没有访问它，也可能延长对象生命周期。比如 UI 面板关闭后，一个 Task 的闭包仍然引用该面板，直到任务结束前它都不会被回收。异步任务中应尽量捕获必要的纯数据，而不是整个对象。

错误示例：

```csharp
Task.Run(() => SavePanelState(this));
```

更好：

```csharp
var state = CaptureState();
Task.Run(() => SavePanelState(state));
```

这也是快照思路的一部分：跨线程传递数据，而不是传递对象。

#### 附录 M：与日志系统的关系

日志写入本身可能涉及 IO。高频日志若直接在主线程写文件，会导致卡顿；若后台写日志，又要考虑线程安全、队列积压和退出时 flush。成熟项目通常会将日志事件放入 ConcurrentQueue，由后台线程批量写入磁盘，主线程只负责生成简短日志对象。退出或崩溃前需要尽可能 flush，但不能无期限阻塞主线程。

#### 附录 N：异常隔离

主线程调度器执行回调时，一个回调抛异常不应影响后续回调。后台任务也是如此，一个任务失败不应破坏整个线程池服务。封装层应在任务边界捕获异常，并将异常转为日志、结果或上层错误事件。多线程异常如果没有边界，会表现得比普通同步异常更混乱。

#### 附录 O：教学示例与生产代码的差别

很多示例会在 `Start` 里 `Task.Run`，然后直接 await，演示起来很清楚。但生产代码需要考虑对象销毁、场景切换、重复启动、取消、超时、异常和平台差异。不要把教程示例直接复制成项目框架。示例用于理解概念，框架用于承受复杂生命周期。


#### 附录 P：常见场景拆解

场景一：读取本地存档。主线程只负责决定路径和触发流程，后台线程读取文件并解析为纯数据对象，主线程拿到结果后更新 UI 或游戏状态。不要在后台线程创建 ScriptableObject 或访问资源对象。

场景二：解压资源包。解压本身可以后台执行，但解压完成后的资源导入、AssetBundle 加载和实例化需要遵守 Unity API 规则。后台线程只负责字节流处理，主线程负责引擎对象。

场景三：排行榜排序。如果只是排序一组玩家分数，后台线程非常适合。输入是不可变列表快照，输出是排序后的 id 数组，主线程根据 id 刷新 UI。不要让后台线程直接操作 ScrollView 的 item。

场景四：AI 决策。少量 AI 可以主线程同步执行，大量 AI 可以后台计算评分或候选结果。但最终移动、动画和状态机切换仍应回到主线程。若数据规模非常大，并且计算是纯数值，应继续评估 Job System。

场景五：日志上传。日志队列可以后台批量压缩和发送；用户退出、网络断开、账号切换时需要取消或 flush。日志任务不应影响主流程，也不应在失败时弹阻塞 UI。

#### 附录 Q：线程安全术语表

原子操作：不可被中断的单步操作，例如 Interlocked.Increment。

临界区：同一时刻只允许一个线程进入的代码区域。

数据竞争：多个线程无同步访问同一数据，且至少一个线程写入。

死锁：多个线程互相等待对方释放资源，导致都无法继续。

活锁：线程没有阻塞，但一直互相让步或重试，实际无法推进。

可见性：一个线程写入的数据何时能被另一个线程观察到。

不可变对象：创建后不再修改的对象，多线程读取更安全。

快照：某个时刻的数据拷贝，用于隔离读写边界。

调度器：负责把后台结果投递到主线程或指定执行环境的组件。

#### 附录 R：项目落地标准

对于任何新增后台任务，提交者应说明：任务执行在哪个线程；输入是否是纯数据；是否访问 Unity API；是否支持取消；异常如何上报；结果何时回主线程；是否有并发限制；目标平台是否支持；Profiler 验证的主线程收益是多少。没有这些说明的多线程代码，不应进入公共框架层。

#### 附录 S：为什么线程安全问题难排查

线程安全问题常常依赖时序。编辑器机器性能强、帧率稳定、数据规模小的时候不出现；真机弱、网络慢、场景切换快、后台任务堆积时才出现。一次日志可能只显示空引用，但真正原因是旧任务晚返回、对象已销毁或数据被另一个线程改掉。所以多线程代码要靠设计预防，而不是等线上复现。


#### 附录 T：主线程断言

为了防止错误线程访问 Unity API，可以在封装层记录主线程 id：

```csharp
public static class UnityThreadGuard
{
    private static int _mainThreadId;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Init()
    {
        _mainThreadId = Thread.CurrentThread.ManagedThreadId;
    }

    public static void AssertMainThread()
    {
        if (Thread.CurrentThread.ManagedThreadId != _mainThreadId)
        {
            throw new InvalidOperationException("This operation must run on Unity main thread.");
        }
    }
}
```

开发期在资源实例化、UI 更新、ViewModel 写回等入口加断言，可以尽早发现线程越界。发布版本可以关闭或降级为日志，避免异常影响用户。

#### 附录 U：时间预算式调度器

固定每帧处理 N 个回调不一定合理，因为每个回调耗时不同。更稳的方式是按时间预算处理：

```csharp
private void Update()
{
    float start = Time.realtimeSinceStartup;
    while (Queue.TryDequeue(out var action))
    {
        action();

        if ((Time.realtimeSinceStartup - start) > 0.002f)
        {
            break;
        }
    }
}
```

这表示主线程每帧最多处理约 2ms 的后台结果。剩余任务留到下一帧。它能防止大量后台任务同帧完成时造成 spike，但会增加结果延迟。项目可以根据 UI 响应需求设置不同队列和不同预算。

#### 附录 V：取消与结果废弃的区别

有些底层操作不能真正取消，例如某些同步文件读取、第三方 SDK 阻塞调用或已经开始的压缩过程。此时外层 token 取消后，任务可能还会继续运行。封装层要做的是标记结果废弃，任务结束后不再写回，并释放资源。取消不总是“立刻停止线程”，更多时候是“这个结果已经不需要了”。

这点对 Unity 很重要。界面关闭后，后台头像解码可能还在继续；完成后只要不写回已关闭 UI，并释放临时数据，就可以接受。强行中止线程反而危险。

#### 附录 W：最终实践建议

多线程代码要少而精。能用普通同步代码解决的低频小任务，不要为了技术感强行开线程；能用引擎异步 API 解决的资源等待，不要自己造线程；能用 Job System 高效处理的大规模纯数据，不要用 Task.Run 分散调度。Task 和线程池最适合中等规模的纯 C# 工作和 IO 辅助任务。明确这个定位，项目会稳定很多。


#### 附录 X：多线程代码的最小模板

一个合格的后台任务至少应包含输入快照、取消令牌、异常捕获、主线程回写和 owner 校验：

```csharp
public async UniTask RunAsync(Owner owner, CancellationToken token)
{
    var snapshot = CaptureSnapshotOnMainThread();

    Result result;
    try
    {
        result = await UniTask.RunOnThreadPool(() =>
        {
            token.ThrowIfCancellationRequested();
            return Worker(snapshot);
        }, cancellationToken: token);
    }
    catch (OperationCanceledException)
    {
        return;
    }

    token.ThrowIfCancellationRequested();

    if (!owner.IsAlive)
    {
        return;
    }

    ApplyResultOnMainThread(result);
}
```

这段模板比简单 `Task.Run` 更啰嗦，但它覆盖了生产环境最常见的问题。项目中可以把它沉淀成公共封装，业务代码只填写 Capture、Worker、Apply 三段逻辑。

#### 附录 Y：验收指标

多线程优化应至少记录以下指标：主线程耗时是否下降，后台任务耗时是否可接受，回调峰值是否造成 spike，GC Alloc 是否增加，取消后是否仍写回，异常是否可追踪，低端机温度和功耗是否恶化。某些优化在编辑器里看起来变快，但真机上因为线程调度和功耗限制收益很小，所以必须在目标设备验证。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** Unity、多线程、Task、线程安全、lock、Interlocked、ConcurrentQueue
- **来源：** 已有文稿整理、官方文档校正、工程化经验重写

---

*文档基于与吉良吉影的讨论，由小雅整理*
