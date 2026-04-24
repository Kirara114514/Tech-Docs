# Unity 协程基础与扩展

## 摘要

本文系统重写《Unity 协程基础与扩展》，删除原稿中重复的口语化开头、重复总结和不严谨表述，将内容整理为一篇面向工程实践的协程技术文档。文章从 C# 迭代器状态机、Unity PlayerLoop 调度、MonoBehaviour 生命周期绑定、常见 yield 指令、非 MonoBehaviour 启动方案、CoroutineRunner 封装、异常与停止策略、GC 与性能成本、协程在项目架构中的适用边界等角度展开。目标不是把协程讲成“语法小技巧”，而是把它放进 Unity 主线程调度体系中理解，帮助开发者在 UI、动画、加载、流程控制和工具封装中稳定使用协程。

## 正文

### 背景

Unity 协程是很多开发者最早接触到的“异步流程”工具。它看起来像异步，写起来像同步，使用成本低，特别适合做等待一帧、等待几秒、等待动画、等待 UnityWebRequest、等待 AsyncOperation 等按帧推进的流程。但协程也经常被误解：它不是线程，不会把计算丢到后台；它也不是普通 C# 里的全局异步能力，必须依赖 MonoBehaviour 或其他 Unity 调度宿主才能运行。

原稿的主要问题有三类。第一，段落重复严重，开头、背景、核心内容和实现方案中多次出现相同文字，影响阅读效率。第二，语气偏随笔，对正式技术文档来说不够稳定。第三，部分生命周期描述容易混淆，例如“禁用 MonoBehaviour”和“停用 GameObject”对协程的影响不能简单等同；协程由 MonoBehaviour 驱动，但具体停止条件需要结合 Unity 行为来理解。本文将这些内容重写为更适合团队知识库、培训文档和项目规范的版本。

### 核心内容

#### 1. 协程的本质：由 Unity 驱动的 C# 迭代器状态机

Unity 协程通常写成返回 `IEnumerator` 的方法：

```csharp
private IEnumerator PlaySequence()
{
    PlayEnterAnimation();
    yield return new WaitForSeconds(1.0f);
    PlayExitAnimation();
}
```

从 C# 语言角度看，这不是一个普通函数，而是一个迭代器方法。编译器会把它转换成一个状态机对象。每次执行到 `yield return` 时，状态机会保存当前执行位置和局部变量，然后把控制权交还给调用方。下一次调用 `MoveNext()` 时，它会从上次暂停的位置继续执行。

Unity 协程的特殊之处在于：`MoveNext()` 不是由你手动调用，而是由 Unity 引擎在 PlayerLoop 中驱动。你调用 `StartCoroutine(routine)` 后，Unity 会登记这个 `IEnumerator`，并在后续帧根据它当前返回的 yield 指令决定何时继续推进。也就是说，协程本质上是“主线程上的分帧调度”，不是“后台线程上的并行执行”。

这个认知非常重要。如果你在协程里写一个大循环：

```csharp
private IEnumerator HeavyWork()
{
    for (int i = 0; i < 100000000; i++)
    {
        DoCpuWork(i);
    }

    yield return null;
}
```

这段代码仍然会在一帧内阻塞主线程，因为第一次 `yield return` 之前的所有逻辑都会立即执行。协程只有在真正执行到 `yield return` 后才会让出执行权。若要把大计算拆成多帧，需要主动在循环中插入分帧点：

```csharp
private IEnumerator HeavyWorkByFrame()
{
    for (int i = 0; i < 100000000; i++)
    {
        DoCpuWork(i);

        if (i % 1000 == 0)
        {
            yield return null; // wait one frame
        }
    }
}
```

这并没有让计算变快，只是把计算分摊到多帧，降低单帧卡顿风险。真正需要利用多核 CPU 时，应考虑 C# 线程、Task、Job System 或 Burst，而不是依赖协程。

#### 2. StartCoroutine 为什么属于 MonoBehaviour

`StartCoroutine` 是 `MonoBehaviour` 的实例方法，不是 C# 全局函数，也不是 `IEnumerator` 自带的能力。普通 C# 类虽然可以声明 `IEnumerator` 方法，但如果没有 Unity 宿主帮它注册和推进，这个迭代器不会自动执行。

协程绑定 MonoBehaviour 有三个工程意义：

1. **调度归属明确。** Unity 需要知道哪个对象启动了协程，才能在 PlayerLoop 中管理它。
2. **生命周期可控。** 当宿主对象被销毁或 GameObject 停用时，Unity 可以停止相关协程，避免无主流程继续访问已经失效的对象。
3. **停止接口统一。** `StopCoroutine` 和 `StopAllCoroutines` 都是围绕 MonoBehaviour 实例工作的。

这也是非 MonoBehaviour 类不能直接调用 `StartCoroutine` 的原因。它缺少引擎层面的协程宿主。解决这个问题通常有两种方法：将一个 MonoBehaviour 作为 runner 注入普通类，或者建立全局 CoroutineRunner 服务。

#### 3. 协程生命周期：需要区分几种“禁用”

协程生命周期经常被写错，原因是 Unity 中存在多个相似但不同的状态：

- 禁用 `MonoBehaviour.enabled = false`
- 停用 `GameObject.SetActive(false)`
- 销毁组件或 GameObject
- 调用 `StopCoroutine`
- 调用 `StopAllCoroutines`
- 协程函数自然执行完成
- 协程内部 `yield break`

这些路径并不完全相同。实践中需要记住：协程并不是因为脚本 `enabled = false` 就一定停止；但当承载协程的 GameObject 被停用或对象被销毁时，协程会受到影响。为了避免文档误导，工程规范中不建议依赖“某种禁用行为”作为唯一停止方式。更稳妥的做法是：重要协程显式保存句柄，必要时主动停止；或者用清晰的生命周期 owner 来管理流程。

示例：

```csharp
private Coroutine _fadeCoroutine;

public void PlayFade()
{
    if (_fadeCoroutine != null)
    {
        StopCoroutine(_fadeCoroutine);
    }

    _fadeCoroutine = StartCoroutine(FadeRoutine());
}

private void OnDisable()
{
    if (_fadeCoroutine != null)
    {
        StopCoroutine(_fadeCoroutine);
        _fadeCoroutine = null;
    }
}
```

这样代码不再依赖隐式停止规则，而是把生命周期写在业务对象里。

#### 4. 常见 yield 指令的语义

协程的行为主要由 `yield return` 的返回值决定。常见指令如下。

`yield return null` 表示等待到下一帧继续。它不会结束协程，也不会等待固定时间，只是让出当前帧执行权。

`yield break` 表示立即结束协程。它类似函数中的 `return`，后续代码不会再执行。

`WaitForSeconds` 表示等待受 `Time.timeScale` 影响的游戏时间。如果 `timeScale` 为 0，等待会暂停。它适合游戏内倒计时、技能冷却、普通动画流程。

`WaitForSecondsRealtime` 表示等待真实时间，不受 `timeScale` 影响。它适合暂停菜单、登录超时、Loading 提示、真实世界计时。

`WaitForFixedUpdate` 表示等待到下一次物理更新阶段，适合需要和物理步进对齐的流程。

`WaitForEndOfFrame` 表示等待到当前帧渲染相关流程之后，常用于截图、读取屏幕纹理或需要等待 UI 布局稳定的场景，但不应滥用到普通逻辑中。

`WaitUntil` 和 `WaitWhile` 可以等待条件变化，但它们每帧都会执行条件委托。如果条件里有复杂逻辑、闭包捕获或频繁分配，就可能造成性能和 GC 问题。

`AsyncOperation` 可以直接被 `yield return`，例如场景加载、资源加载。协程会在异步操作完成后继续。

#### 5. 嵌套协程和协程组合

协程可以等待另一个协程完成：

```csharp
private IEnumerator MainFlow()
{
    yield return StartCoroutine(LoadData());
    yield return StartCoroutine(PlayEnter());
    yield return StartCoroutine(ShowReward());
}
```

这种方式适合简单串行流程。它的优点是顺序直观，缺点是返回值和异常传播不够自然。如果流程需要返回结果，通常只能通过字段、回调或临时上下文对象传递：

```csharp
private IEnumerator LoadConfig(Action<Config> onCompleted)
{
    yield return RequestConfig();

    onCompleted?.Invoke(_loadedConfig);
}
```

当流程越来越复杂，例如需要等待多个任务全部完成、任意一个完成、超时取消、异常上抛或返回值组合时，协程会开始变得笨重。这时 UniTask 或自定义异步框架会更适合。

#### 6. 非 MonoBehaviour 中启动协程：注入 runner

最直接的方式是把 MonoBehaviour runner 作为依赖传入普通类：

```csharp
public sealed class DownloadService
{
    private readonly MonoBehaviour _runner;

    public DownloadService(MonoBehaviour runner)
    {
        _runner = runner;
    }

    public Coroutine Download(string url)
    {
        return _runner.StartCoroutine(DownloadRoutine(url));
    }

    private IEnumerator DownloadRoutine(string url)
    {
        // UnityWebRequest 逻辑
        yield return null;
    }
}
```

这种方式简单、透明、生命周期容易理解。缺点是普通类会依赖 Unity 类型，无法完全保持纯 C#，并且 runner 生命周期会影响协程。如果 runner 所属 GameObject 被销毁，服务中的协程也会停止。因此这种方案适合依附于某个界面、场景、系统对象的流程，不适合跨场景后台任务。

#### 7. 非 MonoBehaviour 中启动协程：全局 CoroutineRunner

另一个常见方案是提供一个全局 runner：

```csharp
public sealed class CoroutineRunner : MonoBehaviour
{
    private static CoroutineRunner _instance;

    public static Coroutine Run(IEnumerator routine)
    {
        EnsureInstance();
        return _instance.StartCoroutine(routine);
    }

    public static void Stop(Coroutine coroutine)
    {
        if (_instance != null && coroutine != null)
        {
            _instance.StopCoroutine(coroutine);
        }
    }

    // Singleton guard
    private static void EnsureInstance()
    {
        if (_instance != null)
        {
            return;
        }

        var go = new GameObject("[CoroutineRunner]");
        DontDestroyOnLoad(go);
        _instance = go.AddComponent<CoroutineRunner>();
    }
}
```

全局 runner 适合跨场景工具、SDK 封装、下载流程、埋点发送等不属于某个短生命周期 UI 的协程。它的风险也很明显：如果所有协程都挂在全局 runner 上，就失去了业务 owner 的自然取消能力。界面关闭后，协程仍可能继续执行回调并访问已经销毁的 View。正式项目里，全局 runner 不应被当成“万能异步入口”，而应配合 token、句柄、owner 或任务 id 管理生命周期。

更工业化的 CoroutineRunner 至少应支持：

- 返回 Coroutine 句柄。
- 支持按 owner 停止一组协程。
- 支持异常捕获日志。
- 支持场景切换时清理指定域任务。
- 支持调试面板查看当前运行协程数量。
- 避免重复创建隐藏对象。
- 在退出 Play Mode 时正确清理编辑器残留。

#### 8. StopCoroutine 的正确使用

Unity 提供多个停止协程的方式，但不要混用启动形式和停止形式。常见方式有：

```csharp
Coroutine handle = StartCoroutine(MyRoutine());
StopCoroutine(handle);
```

或者：

```csharp
IEnumerator routine = MyRoutine();
StartCoroutine(routine);
StopCoroutine(routine);
```

或者通过方法名字符串停止，但这种方式缺乏类型安全，不推荐在正式项目中大量使用。

最佳实践是保存 `Coroutine` 句柄，或者保存明确的 `IEnumerator` 实例。不要每次停止时重新调用一次 `MyRoutine()`，因为那会创建新的迭代器实例，停止的不是之前那个正在运行的协程。

#### 9. 协程异常处理

协程中抛出未捕获异常时，Unity 会记录错误并停止该协程。问题在于，外部调用者很难像 `await` 一样自然捕获异常。对于关键流程，建议在协程内部设置统一保护层：

```csharp
private IEnumerator SafeRoutine(IEnumerator inner)
{
    while (true)
    {
        object current;

        try
        {
            if (!inner.MoveNext())
            {
                yield break;
            }

            current = inner.Current;
        }
        catch (Exception ex)
        {
            Debug.LogException(ex);
            yield break;
        }

        yield return current;
    }
}
```

这类封装能捕获协程推进过程中的异常，并统一上报。但它也有局限：嵌套协程、Unity 内部 yield 指令、回调中的异常需要额外处理。正式项目中，协程适合控制流程，不适合承担复杂错误传播。如果业务强依赖异常、返回值和组合任务，UniTask 更自然。

#### 10. 协程与 GC 分配

协程本身会生成迭代器状态机对象。每次调用一个协程方法都会创建一个新的 `IEnumerator` 实例。`new WaitForSeconds(x)` 也会创建对象。如果在高频路径里不断启动短协程、不断 new yield 指令，就可能产生 GC Alloc。

常见优化包括：

```csharp
private static readonly WaitForEndOfFrame WaitEndOfFrame = new WaitForEndOfFrame();
private static readonly WaitForFixedUpdate WaitFixedUpdate = new WaitForFixedUpdate();
```

固定时长的 `WaitForSeconds` 也可以缓存，但要注意只有相同时长才适合复用：

```csharp
private static readonly WaitForSeconds WaitOneSecond = new WaitForSeconds(1f);
```

不过，不要为了“零 GC”把所有协程都改得难以理解。优化应基于 Profiler。低频流程、加载阶段、一次性引导逻辑中的少量分配通常可以接受；每帧反复启动的协程、UI 列表项中大量协程、战斗循环中高频等待才需要重点治理。

#### 11. 协程适合的场景

协程最适合处理“主线程上的时间流程”，包括：

- UI 动画序列。
- 新手引导步骤。
- 简单倒计时。
- 等待场景加载或资源加载。
- 等待 UnityWebRequest 完成。
- 分帧执行轻量任务。
- 简单轮询条件。
- 过场流程和表现脚本。

这些场景的共同特点是：需要等待，但不需要复杂返回值；需要调用 Unity API，因此应该在主线程；流程规模有限；异常和取消规则相对简单。

#### 12. 协程不适合的场景

协程不适合以下场景：

- CPU 密集型计算。
- 需要真正多线程并行的任务。
- 大量并发任务组合。
- 需要强返回值和异常传播的服务层逻辑。
- 复杂取消、超时、重试的网络业务。
- 与业务生命周期强绑定但 owner 不明确的后台流程。
- 大规模实体行为调度。
- 需要严格测试和模拟时间推进的纯 C# 逻辑。

这些场景可以考虑 UniTask、Task、Job System、状态机或事件驱动架构。

#### 13. 协程工程规范

为了让协程在团队中可维护，建议遵守以下规范：

1. 协程方法统一以 `Routine` 或 `Coroutine` 结尾，避免和普通方法混淆。
2. 长生命周期协程必须保存句柄。
3. UI 协程在 `OnDisable` 或关闭面板时主动停止。
4. 全局 runner 启动的协程必须标记 owner。
5. 不在协程中执行长时间同步阻塞。
6. 不在高频路径中反复 `new WaitForSeconds`。
7. 不依赖字符串版本 `StartCoroutine("MethodName")`。
8. 关键流程需要异常保护。
9. 等待真实时间时使用 `WaitForSecondsRealtime`。
10. 协程只负责主线程流程，不承担后台计算。

#### 14. 从协程走向更现代的异步架构

协程并没有过时。它仍然是 Unity 主线程流程控制中非常实用的工具。但随着项目复杂度提升，单靠协程会遇到返回值、组合、取消、异常、测试和跨模块封装问题。现代 Unity 项目往往会形成分层选择：

- 简单表现流程使用协程。
- 业务异步流程使用 UniTask。
- IO 和后台计算使用 Task 或 UniTask 线程池封装。
- 大规模 CPU 计算使用 Job System + Burst。
- 长期业务流程使用显式状态机。

这种分层比“全项目只用一种异步技术”更健康。关键不是迷信工具，而是让工具匹配问题类型。

### 实现方案

#### 1. 推荐的基础协程模板

```csharp
public sealed class PanelAnimation : MonoBehaviour
{
    private Coroutine _playRoutine;

    public void Play()
    {
        StopCurrent();
        _playRoutine = StartCoroutine(PlayRoutine());
    }

    private IEnumerator PlayRoutine()
    {
        yield return FadeIn();
        yield return WaitForInput();
        yield return FadeOut();

        _playRoutine = null;
    }

    private void StopCurrent()
    {
        if (_playRoutine == null)
        {
            return;
        }

        StopCoroutine(_playRoutine);
        _playRoutine = null;
    }

    private void OnDisable()
    {
        StopCurrent();
    }
}
```

这个模板体现了三个原则：协程句柄可追踪、生命周期结束时主动停止、流程完成后清理句柄。它比随手 `StartCoroutine` 更适合 UI 和表现系统。

#### 2. 推荐的 CoroutineRunner 结构

```csharp
public interface ICoroutineOwner
{
    string Name { get; }
    bool IsAlive { get; }
}

public sealed class CoroutineRunner : MonoBehaviour
{
    private static CoroutineRunner _instance;
    private readonly Dictionary<object, List<Coroutine>> _ownerCoroutines = new();

    public static Coroutine Run(object owner, IEnumerator routine)
    {
        EnsureInstance();
        return _instance.RunInternal(owner, routine);
    }

    public static void StopOwner(object owner)
    {
        if (_instance == null || owner == null)
        {
            return;
        }

        _instance.StopOwnerInternal(owner);
    }

    private Coroutine RunInternal(object owner, IEnumerator routine)
    {
        Coroutine coroutine = StartCoroutine(SafeRoutine(owner, routine));

        if (owner != null)
        {
            if (!_ownerCoroutines.TryGetValue(owner, out var list))
            {
                list = new List<Coroutine>();
                _ownerCoroutines.Add(owner, list);
            }

            list.Add(coroutine);
        }

        return coroutine;
    }

    private IEnumerator SafeRoutine(object owner, IEnumerator routine)
    {
        while (true)
        {
            object current;

            try
            {
                if (!routine.MoveNext())
                {
                    yield break;
                }

                current = routine.Current;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Coroutine failed. Owner={owner}");
                Debug.LogException(ex);
                yield break;
            }

            yield return current;
        }
    }

    private void StopOwnerInternal(object owner)
    {
        if (!_ownerCoroutines.TryGetValue(owner, out var list))
        {
            return;
        }

        for (int i = 0; i < list.Count; i++)
        {
            if (list[i] != null)
            {
                StopCoroutine(list[i]);
            }
        }

        list.Clear();
        _ownerCoroutines.Remove(owner);
    }

    private static void EnsureInstance()
    {
        if (_instance != null)
        {
            return;
        }

        GameObject go = new GameObject("[CoroutineRunner]");
        DontDestroyOnLoad(go);
        _instance = go.AddComponent<CoroutineRunner>();
    }
}
```

这只是示意代码，不是完整框架。生产级实现还需要处理重复 owner、协程自然完成后的列表清理、Editor Play Mode 退出、场景域清理和调试统计。但它展示了一个核心方向：全局 runner 必须提供生命周期归属，而不是只提供静态启动能力。

#### 3. 分帧执行任务模板

```csharp
private IEnumerator ProcessLargeList(List<Item> items, int budgetPerFrame)
{
    int processed = 0;

    for (int i = 0; i < items.Count; i++)
    {
        ProcessItem(items[i]);
        processed++;

        if (processed >= budgetPerFrame)
        {
            processed = 0;
            yield return null; // wait one frame
        }
    }
}
```

该模板适合非关键路径的大量轻量操作，例如预计算 UI 数据、分批实例化对象、分批刷新列表。注意它不是多线程，只是把工作拆到多帧。

#### 4. 带超时的协程等待

```csharp
private IEnumerator WaitUntilOrTimeout(Func<bool> condition, float timeout, Action<bool> onDone)
{
    float start = Time.realtimeSinceStartup;

    while (!condition())
    {
        if (Time.realtimeSinceStartup - start >= timeout)
        {
            onDone?.Invoke(false);
            yield break;
        }

        yield return null;
    }

    onDone?.Invoke(true);
}
```

协程没有内置统一超时语义，项目中应封装常用等待模式，避免每个业务脚本手写一套循环。

#### 5. 协程评审清单

- 这个协程挂在哪个 MonoBehaviour 上？
- 宿主销毁或停用时，协程是否应该停止？
- 协程是否需要返回结果？如果需要，协程是否仍是最佳选择？
- 是否有异常保护？
- 是否在高频路径中创建临时 yield 对象？
- 是否可能出现重复启动多个相同协程？
- 是否需要 `WaitForSecondsRealtime` 而不是 `WaitForSeconds`？
- 是否有长时间同步计算阻塞主线程？
- 是否存在旧协程晚返回覆盖新状态的问题？
- 是否需要改成 UniTask 或显式状态机？

### 总结

协程是 Unity 中最基础、最常用的主线程异步流程工具。它的价值在于用简单的顺序代码表达跨帧流程，而不是提供并行计算能力。理解协程时，要始终抓住三个关键词：`IEnumerator` 状态机、MonoBehaviour 宿主、主线程 PlayerLoop 调度。

经过工程化整理后，协程的定位应当非常清晰：它适合轻量时序、表现流程和 Unity 原生异步操作等待；不适合复杂业务异步、强返回值流程和 CPU 密集型任务。对于普通类启动协程，可以注入 MonoBehaviour runner，也可以使用 CoroutineRunner，但无论哪种方式都必须管理生命周期。只要团队建立起启动、停止、异常、owner、GC 和评审规范，协程仍然是一种稳定、低成本、非常实用的 Unity 开发工具。



#### 附录补充 1：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 1 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 2：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 2 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 3：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 3 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 4：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 4 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 5：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 5 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 6：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 6 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。


#### 附录补充 7：协程工程审查问题

在真实项目中，协程不应只停留在“能运行”的层面，而要进入评审、测试和验收。第 7 组审查可以围绕三个角度展开：第一，调用方是否理解该能力的生命周期边界；第二，异常、取消、超时、对象销毁和场景切换是否有明确处理路径；第三，Profiler 或日志能否定位到具体调用点、数据规模和耗时来源。只有这些问题都被回答清楚，代码才适合进入公共框架层，而不是停留在示例代码阶段。

对于团队协作，建议在 Code Review 中要求提交者说明本次修改影响的模块、执行频率、预期数据规模、失败后的降级方式，以及是否需要在真机上验证。不要只看接口是否优雅，也要看它是否会隐藏成本。很多性能问题不是因为某个 API 天生慢，而是因为它被放在了错误的调用频率、错误的生命周期和错误的数据规模上。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** Unity、Coroutine、协程、MonoBehaviour、异步流程、PlayerLoop
- **来源：** 已有文稿整理、官方文档校正、工程化经验重写

---

*文档基于与吉良吉影的讨论，由小雅整理*
