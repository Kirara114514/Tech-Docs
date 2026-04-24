# UniTask 高级封装与实践

## 摘要

本文重写《UniTask 高级封装与实践》，删除原稿中重复的开头、重复总结和示例堆叠，将内容重构为一篇面向 Unity 工程的异步封装设计文档。文章强调：对 UniTask 做二次封装，不是给基础 API 换名字，而是把取消、异常、生命周期、超时、重试、线程切换、旧结果防覆盖、fire-and-forget 管控、日志与测试等项目纪律固化到统一入口。文档提供一套分层封装思路：基础工具层、生命周期层、结果模型层、业务流程层、调度与诊断层，帮助团队在大型 Unity 项目中稳定使用 UniTask。

## 正文

### 背景

UniTask 是 Unity 异步编程中非常重要的工具。它让开发者可以用 async/await 写 Unity 主线程异步流程，也能和 UnityWebRequest、AsyncOperation、PlayerLoop、CancellationToken 等机制配合。很多示例文档会从 `UniTask.Delay`、`SwitchToThreadPool`、`GetCancellationTokenOnDestroy` 开始讲起，但正式项目真正难的不是“会不会 await”，而是异步流程能不能被取消、能不能避免旧任务写回、异常是否可追踪、线程是否安全、生命周期是否归属清楚。

原稿已经提出“为什么要封装 UniTask”，但主要集中在减少重复代码和提供简单工具方法上，且存在重复段落。本文将从工程架构角度重写：封装的价值不是减少几行 await，而是统一团队异步模型。一个好的 UniTask 封装层应该让业务开发者默认写出安全代码，而不是靠每个人记住所有细节。

### 核心内容

#### 1. 二次封装的真正目标

UniTask 本身已经足够轻量，直接封装成 `WaitFor`、`Delay`、`Run` 这类薄包装，收益有限。真正值得封装的是项目级规则：

- 任务属于谁。
- 谁负责取消。
- 异常如何上报。
- 超时和重试如何定义。
- 是否允许 fire-and-forget。
- 后台线程和主线程如何切换。
- 旧请求结果如何避免覆盖新状态。
- UI 关闭、场景切换、账号登出时任务如何结束。
- 任务耗时、失败、取消如何记录。
- 单元测试如何模拟完成顺序和取消时机。

这些规则如果散落在业务代码中，项目规模一大就会混乱。封装层应把规则变成默认行为。

#### 2. 分层设计

推荐把 UniTask 封装分为五层。

第一层是基础等待层，封装 `Delay`、`DelayFrame`、`Yield`、`WaitUntil` 等，并明确 PlayerLoopTiming、timeScale 和 cancellationToken。

第二层是生命周期层，封装 MonoBehaviour、UI View、Presenter、战斗域、账号会话等 owner 的 token。不要只依赖 `GetCancellationTokenOnDestroy`，因为很多业务生命周期并不是 GameObject 销毁。

第三层是结果模型层，定义 `AsyncResult<T>` 或 `Result<T>`，区分成功、失败、取消、超时、业务错误、网络错误等状态。不是所有失败都应该抛异常。

第四层是业务流程层，例如资源加载、网络请求、UI 动画、文件 IO、配置加载、头像加载、分页请求等。这一层应隐藏底层异步细节。

第五层是诊断与治理层，负责任务名、owner、耗时、异常日志、未观察异常、取消原因和调试面板。

#### 3. CancellationToken 必须从入口传到底

异步 bug 的高发点是外层有 token，内部等待没有传 token。例如：

```csharp
public async UniTask RefreshAsync(CancellationToken token)
{
    await UniTask.Delay(TimeSpan.FromSeconds(1));
    await LoadDataAsync();
    ApplyResult();
}
```

这段代码表面有 token，实际上没有任何等待响应取消。正确写法应当是：

```csharp
public async UniTask RefreshAsync(CancellationToken token)
{
    await UniTask.Delay(TimeSpan.FromSeconds(1), cancellationToken: token);
    var data = await LoadDataAsync(token);
    token.ThrowIfCancellationRequested();
    ApplyResult(data);
}
```

封装层可以强制公共异步方法必须接收 token，代码评审中也应检查 token 是否传到底。生命周期取消、用户主动取消和超时取消最好能区分，否则日志和 UI 反馈会变得模糊。

#### 4. 取消不是错误

很多项目会把 `OperationCanceledException` 当成 Error 打印，导致关闭界面、切换场景时日志刷屏。取消是异步流程的正常分支。封装层应默认吞掉或记录为 Debug 级别，只有异常取消才进入 Error。

可以定义：

```csharp
public enum AsyncCancelReason
{
    None,
    OwnerDestroyed,
    ViewClosed,
    SceneChanged,
    UserCanceled,
    Timeout,
    SessionExpired
}
```

实际 token 本身不携带原因，但封装的 owner 或 `AsyncScope` 可以记录原因。这样调试时可以知道任务为什么结束，而不是只看到一堆 canceled。

#### 5. 异常策略要分级

异步异常至少分为四类。

第一类是取消，不按错误处理。

第二类是业务失败，例如账号密码错误、资源不存在、活动未开放。这类通常不应该抛系统异常，而应作为 `Result` 返回给 UI。

第三类是可恢复系统错误，例如弱网、超时、临时服务不可用。它可能触发重试或用户提示。

第四类是程序错误，例如空引用、协议解析失败、状态机非法。这类应该进入日志和监控。

封装层可以提供不同入口：

```csharp
await task.RunWithExceptionThrow(token);
AsyncResult<T> result = await task.ToResultAsync(token);
task.ForgetWithLog(owner, "LoadAvatar");
```

业务必须明确选择异常策略，而不是默认随意吞掉或随意上抛。

#### 6. fire-and-forget 必须被管理

fire-and-forget 是异步系统最容易失控的入口。它适合埋点、非关键后台刷新、无须阻塞 UI 的提示动画等场景，但必须有异常日志、生命周期 token 和任务名。

不推荐：

```csharp
RefreshAsync().Forget();
```

推荐：

```csharp
this.FireAndForget(
    taskName: "RefreshShop",
    taskFunc: token => RefreshShopAsync(token),
    cancelOnDestroy: true);
```

封装内部负责 try/catch、取消处理和日志：

```csharp
public static void FireAndForget(
    this MonoBehaviour owner,
    string taskName,
    Func<CancellationToken, UniTask> taskFunc)
{
    RunAsync(owner, taskName, taskFunc).Forget();
}
```

这样即便任务不被 await，也不会变成无主任务。

#### 7. 线程切换应显式表达

UniTask 可以切到线程池，也可以切回主线程。正式项目中，不建议在业务代码里到处散落线程切换。应该把后台工作封装成模板：

```csharp
public static async UniTask<T> RunBackgroundAsync<T>(
    Func<T> worker,
    CancellationToken token)
{
    await UniTask.SwitchToThreadPool();
    token.ThrowIfCancellationRequested();

    T result = worker();

    await UniTask.SwitchToMainThread();
    token.ThrowIfCancellationRequested();

    return result;
}
```

但这只是基础模板。生产中还要记录耗时，捕获异常，并限制并发数量。后台线程适合纯 C# 数据处理，不允许访问 Unity API。任何需要访问 `GameObject`、`Texture`、`Transform`、UI 的逻辑必须回到主线程后执行。

#### 8. 超时与重试策略

超时不能随便写死。不同业务需要不同策略。登录可能 10 秒超时；头像加载可以静默失败；资源下载可能长时间等待并显示进度；支付请求需要考虑幂等，不能简单重复提交。

推荐定义策略对象：

```csharp
public sealed class RetryPolicy
{
    public int MaxRetryCount;
    public TimeSpan Timeout;
    public TimeSpan BaseDelay;
    public bool UseExponentialBackoff;
    public Func<Exception, bool> CanRetry;
}
```

封装层根据策略执行：

```csharp
public static async UniTask<AsyncResult<T>> ExecuteWithRetryAsync<T>(
    Func<CancellationToken, UniTask<T>> operation,
    RetryPolicy policy,
    CancellationToken token)
```

重试必须记录每次失败原因、耗时和最终结果。不要让重试在用户已经关闭界面后继续执行。

#### 9. 旧结果防覆盖

异步请求乱序是 UI 常见问题。搜索框连续输入 A、AB、ABC，A 的请求可能最后回来。如果没有版本保护，旧数据会覆盖新数据。解决方式是版本号或租约：

```csharp
private int _requestVersion;

public async UniTask RefreshAsync(string keyword, CancellationToken token)
{
    int version = ++_requestVersion;
    var result = await SearchAsync(keyword, token);

    if (version != _requestVersion)
    {
        return;
    }

    ApplySearchResult(result);
}
```

封装层可以提供 `LatestOnlyRunner`，保证同类任务只有最后一次能写回。这对头像、列表、详情页、搜索、分页加载非常关键。

#### 10. 生命周期 owner 不应只限 MonoBehaviour

真实项目中有很多非 Mono 生命周期对象：

- UI ViewModel。
- Presenter。
- 战斗局。
- 账号会话。
- 下载任务域。
- 资源加载域。
- 活动模块。
- SDK 流程。

可以定义通用接口：

```csharp
public interface IAsyncOwner
{
    string OwnerName { get; }
    CancellationToken Token { get; }
    bool IsAlive { get; }
}
```

这样封装层可以接受任何 owner，而不是只接受 MonoBehaviour。MonoBehaviour 只是 owner 的一种。

#### 11. 结果模型

对于业务层，推荐减少到处 try/catch，改为 Result 模型：

```csharp
public readonly struct AsyncResult<T>
{
    public bool IsSuccess { get; }
    public bool IsCanceled { get; }
    public bool IsTimeout { get; }
    public string ErrorCode { get; }
    public Exception Exception { get; }
    public T Value { get; }
}
```

这样 UI 可以按状态显示：

```csharp
var result = await loginService.LoginAsync(account, password, token);

if (result.IsSuccess) EnterGame(result.Value);
else if (result.IsCanceled) return;
else if (result.IsTimeout) ShowToast("网络超时，请重试");
else ShowError(result.ErrorCode);
```

不是所有业务失败都需要异常。异常适合程序错误，Result 适合业务结果。

#### 12. 可测试性

UniTask 封装要能测试。测试重点不是“Delay 能否等一秒”，而是：

- 任务取消后是否不写回。
- 异常是否转换为 Result。
- 超时是否按策略触发。
- 重试次数是否正确。
- 旧请求晚返回是否被忽略。
- owner 销毁时是否取消。
- fire-and-forget 是否记录异常。
- 后台线程是否不访问 Unity API。

可以用 `UniTaskCompletionSource<T>` 模拟异步源，主动控制完成顺序。这样才能复现乱序、取消、超时和异常路径。

### 实现方案

#### 1. AsyncScope：生命周期域

```csharp
public sealed class AsyncScope : IDisposable
{
    private readonly CancellationTokenSource _cts = new();
    public string Name { get; }
    public CancellationToken Token => _cts.Token;
    public bool IsDisposed { get; private set; }

    public AsyncScope(string name)
    {
        Name = name;
    }

    public void Cancel()
    {
        if (!IsDisposed)
        {
            _cts.Cancel();
        }
    }

    public void Dispose()
    {
        if (IsDisposed)
        {
            return;
        }

        IsDisposed = true;
        _cts.Cancel();
        _cts.Dispose();
    }
}
```

`AsyncScope` 可以用于 UI 面板、战斗局、账号会话等非 Mono 生命周期。它的价值是把“这一批任务属于谁”变成显式对象。

#### 2. SafeTaskRunner

```csharp
public static class SafeTaskRunner
{
    public static async UniTask<AsyncResult<T>> ToResultAsync<T>(
        string taskName,
        Func<CancellationToken, UniTask<T>> taskFunc,
        CancellationToken token)
    {
        try
        {
            T value = await taskFunc(token);
            return AsyncResult<T>.Success(value);
        }
        catch (OperationCanceledException)
        {
            return AsyncResult<T>.Canceled();
        }
        catch (TimeoutException ex)
        {
            return AsyncResult<T>.Timeout(ex);
        }
        catch (Exception ex)
        {
            Debug.LogError($"Task failed: {taskName}");
            Debug.LogException(ex);
            return AsyncResult<T>.Failed(ex);
        }
    }

    public static void ForgetWithLog(
        string taskName,
        Func<CancellationToken, UniTask> taskFunc,
        CancellationToken token)
    {
        ForgetInternal(taskName, taskFunc, token).Forget();
    }

    private static async UniTaskVoid ForgetInternal(
        string taskName,
        Func<CancellationToken, UniTask> taskFunc,
        CancellationToken token)
    {
        try
        {
            await taskFunc(token);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            Debug.LogError($"Fire-and-forget failed: {taskName}");
            Debug.LogException(ex);
        }
    }
}
```

这个封装把“不等待任务也必须有异常处理”变成默认行为。

#### 3. LatestOnlyRunner

```csharp
public sealed class LatestOnlyRunner
{
    private int _version;

    public int NewVersion()
    {
        return ++_version;
    }

    public bool IsLatest(int version)
    {
        return version == _version;
    }
}
```

使用方式：

```csharp
private readonly LatestOnlyRunner _avatarRunner = new();

public async UniTask RefreshAvatarAsync(string key, CancellationToken token)
{
    int version = _avatarRunner.NewVersion();
    var sprite = await avatarLoader.LoadAsync(key, token);

    if (!_avatarRunner.IsLatest(version))
    {
        return;
    }

    avatarImage.sprite = sprite;
}
```

这个小工具能消灭大量 UI 异步乱序 bug。

#### 4. 后台 IO 模板

```csharp
public static async UniTask<string> ReadTextOnThreadPoolAsync(
    string path,
    CancellationToken token)
{
    await UniTask.SwitchToThreadPool();

    string text;
    try
    {
        token.ThrowIfCancellationRequested();
        text = File.ReadAllText(path);
    }
    finally
    {
        await UniTask.SwitchToMainThread();
    }

    token.ThrowIfCancellationRequested();
    return text;
}
```

注意：后台线程只读文件，不访问 Unity API。回到主线程后再更新 UI 或创建 Unity 对象。

#### 5. UI View 封装示例

```csharp
public abstract class AsyncView : MonoBehaviour
{
    private CancellationTokenSource _disableCts;

    protected virtual void OnEnable()
    {
        _disableCts = new CancellationTokenSource();
    }

    protected virtual void OnDisable()
    {
        _disableCts?.Cancel();
        _disableCts?.Dispose();
        _disableCts = null;
    }

    protected CancellationToken ViewToken => _disableCts?.Token ?? CancellationToken.None;

    protected void RunViewTask(string name, Func<CancellationToken, UniTask> task)
    {
        SafeTaskRunner.ForgetWithLog(name, task, ViewToken);
    }
}
```

业务面板继承后：

```csharp
public sealed class ShopView : AsyncView
{
    public void Refresh()
    {
        RunViewTask("RefreshShop", async token =>
        {
            var result = await shopService.LoadAsync(token);
            token.ThrowIfCancellationRequested();
            Render(result);
        });
    }
}
```

这样 UI 关闭时任务自动取消，异常也会统一记录。

#### 6. Code Review 清单

- 公共 async 方法是否接收 `CancellationToken`？
- token 是否传递到所有等待点？
- 是否区分取消、超时、业务失败和程序异常？
- fire-and-forget 是否使用统一入口？
- 后台线程是否访问了 Unity API？
- UI 关闭或场景切换时任务是否会停止？
- 是否存在旧请求覆盖新状态？
- 是否有超时和重试策略？
- 是否有任务名和 owner 日志？
- 是否可以用测试模拟乱序返回？

### 总结

UniTask 的价值不只是提供更现代的 await 语法，而是让 Unity 项目可以建立结构化异步模型。一个成熟的封装层应把取消、异常、生命周期、线程、超时、重试、旧结果防覆盖和日志诊断变成默认能力。业务开发者调用的是稳定的语义接口，而不是在每个脚本里重复处理底层细节。

如果只是把 `UniTask.Delay` 包成 `WaitFor`，封装价值很小；如果能让 UI 关闭自动取消、fire-and-forget 不丢异常、网络请求有超时重试、后台线程不误碰 Unity API、旧请求不能写回新界面，那么 UniTask 才真正进入了工业化实践。对于大型 Unity 项目，UniTask 封装不是“锦上添花”，而是异步代码可维护性的基础设施。


#### 附录 A：推荐目录结构

```text
Runtime/Async/
  AsyncScope.cs
  AsyncResult.cs
  SafeTaskRunner.cs
  LatestOnlyRunner.cs
  TimeoutPolicy.cs
  RetryPolicy.cs
  MainThreadGuard.cs
  ThreadPoolTask.cs
  UnityAsyncExtensions.cs
```

目录结构应体现封装职责。不要把所有工具都塞进一个 `UniTaskUtils`。随着项目扩大，大工具类会变成新的垃圾桶，最终没人敢改。按职责拆分后，测试和维护都会更简单。

#### 附录 B：日志字段建议

每个重要异步任务建议记录任务名、owner、开始时间、结束时间、耗时、取消原因、异常类型、业务错误码和输入摘要。输入摘要不要记录敏感数据，但要足够定位问题。例如登录任务可以记录渠道、服务器区、是否游客登录；资源加载可以记录资源 key、bundle 名、重试次数；UI 刷新可以记录面板名和版本号。

#### 附录 C：不要过度封装

封装层也可能走向反面。如果一个工具方法有十几个参数，既管线程、又管弹窗、又管重试、又管缓存、又管埋点，它会比直接写 UniTask 更难用。好的封装应该围绕稳定语义，例如“带生命周期的 UI 任务”“带重试的网络请求”“只保留最新结果的加载任务”。不要追求一个万能方法解决所有异步场景。


#### 附录 D：上线前验收流程

上线前至少执行四类验证：第一，快速打开关闭 UI，确认没有旧任务写回和 MissingReferenceException；第二，模拟弱网和超时，确认错误提示与重试策略符合预期；第三，切换场景和账号登出，确认所有会话级任务停止；第四，查看日志和 Profiler，确认没有大量未观察异常、持续 GC Alloc 或线程池任务积压。异步问题往往不是功能一跑就暴露，而是在切场景、取消、弱网、重复点击和低端机上暴露。


#### 附录 E：公共接口命名规范

建议把 UniTask 方法按语义命名，而不是按技术实现命名。`LoadConfigAsync` 比 `DoUniTaskLoad` 更清楚；`RunWithViewLifetimeAsync` 比 `RunTask` 更能表达生命周期；`ForgetWithLog` 比 `ForgetSafe` 更能说明异常处理行为。异步方法统一使用 `Async` 后缀，返回 `UniTask<T>` 的方法应在名称中体现结果含义，例如 `RequestUserInfoAsync`、`BuildPreviewDataAsync`、`ReadSaveFileAsync`。

不要把协程、Task、UniTask 的命名混在一起。返回 `IEnumerator` 的方法使用 `Routine`，返回 `UniTask` 的方法使用 `Async`，后台线程方法可以在内部命名为 `OnThreadPool` 或 `Background`。命名清楚后，评审者一眼就能看出该方法是否需要 token、是否可能切线程、是否需要 await。

#### 附录 F：常见反模式

反模式一：在 `Start` 中调用异步方法但不 await，也不 ForgetWithLog。这样异常可能无人处理，任务也没有 owner。

反模式二：在 UI 关闭时只隐藏 GameObject，却没有取消正在进行的 UniTask。任务完成后仍可能写回旧 UI。

反模式三：在后台线程里读取 `transform.position`。Unity 对象不能随便跨线程访问，应先在主线程制作纯数据快照。

反模式四：每个业务方法自己写超时和重试。结果是不同模块策略不一致，日志也无法统一分析。

反模式五：捕获所有异常后返回 null。调用方无法区分取消、失败、超时和真实空数据。

反模式六：为了省事把所有异步都做成 fire-and-forget。长期看，这会让任务泄漏和异常追踪变得非常困难。

#### 附录 G：Result 与 Exception 的边界

如果错误属于业务预期，例如账号密码错误、道具不足、活动关闭、资源不存在，应优先作为 Result 返回。因为这些错误是产品流程的一部分，不一定代表程序异常。如果错误属于不可预期，例如协议字段缺失、空引用、状态机非法、反序列化崩溃，应保留异常并进入日志。

这样划分后，UI 层不会到处 catch 所有异常，也不会把业务错误写成 Exception 流程。服务层可以提供稳定的结果模型，基础设施层负责把系统异常转换为可观测日志。

#### 附录 H：并发限制

UniTask 让并发写起来很简单，但并发不是越多越好。资源加载、网络请求、文件 IO、后台解析都需要并发限制。可以用信号量或队列限制同类任务数量，避免一次性启动几十个下载或解析任务导致主线程回调峰值、内存峰值和网络拥塞。

封装可以提供：

```csharp
public sealed class AsyncSemaphore
{
    private readonly SemaphoreSlim _semaphore;

    public async UniTask<IDisposable> EnterAsync(CancellationToken token)
    {
        await _semaphore.WaitAsync(token);
        return new Releaser(_semaphore);
    }
}
```

使用方通过 `using` 持有并发许可。这样并发策略不散落在业务代码里。

#### 附录 I：与 Addressables 的结合

资源加载封装中，UniTask 常用于 await Addressables 的异步句柄。但封装层还必须处理 Release。加载句柄和实例句柄的释放规则不同，不能只 await 结果而忽略生命周期。推荐由资源服务持有句柄，并在 owner 结束、引用计数归零或缓存淘汰时统一释放。UniTask 只负责异步控制流，资源生命周期仍然需要资源系统治理。

#### 附录 J：与对象池的结合

异步加载和对象池结合时要特别小心。对象从池中取出后启动异步初始化，如果对象在初始化完成前被归还，旧异步结果不能写回已经复用的新对象。解决方案仍然是版本号、owner token 和归属校验。对象池不是只减少 Instantiate，也必须参与异步生命周期管理。

#### 附录 K：文档化要求

每个公共异步封装应写清楚四件事：第一，在哪个线程执行；第二，是否响应取消；第三，异常如何处理；第四，返回结果的生命周期由谁负责。没有这些说明的封装，使用者只能猜。异步代码一旦靠猜，就很容易在线上出现偶发问题。

#### 附录 L：最小落地路线

如果项目刚开始引入 UniTask，不建议一上来做庞大框架。可以先落地三个最小组件：`ForgetWithLog` 用于管理不等待任务；`AsyncScope` 用于生命周期取消；`AsyncResult<T>` 用于统一业务结果。等这三个组件稳定后，再扩展超时、重试、并发限制、任务追踪和调试面板。这样风险更低，团队也更容易接受。

第一阶段的验收标准是：所有新增业务异步方法都有 token；所有 fire-and-forget 都有日志；所有 UI 关闭后不再写回。只要做到这三点，项目中的异步稳定性就会明显提升。

#### 附录 M：性能与可读性的平衡

UniTask 封装不能只追求“零分配”。如果为了省一个闭包分配，把业务代码写成难以阅读的状态机，收益通常不值得。热路径和批量任务应严格控制分配，低频业务流程则优先清晰、可取消、可诊断。工程优化的本质是把复杂度放在正确的位置：公共框架承担通用复杂度，业务代码保留清晰流程，性能敏感路径再做针对性优化。

因此，团队可以把异步代码分成三级：普通低频流程以可读性为主；中频 UI 和资源流程使用标准封装；高频批量任务进入专项性能设计。不要用同一套标准粗暴要求所有代码。

#### 附录 N：结论补充

UniTask 封装的最终目标，是让异步流程默认安全、默认可取消、默认可追踪。只要这个目标明确，封装就不会沦为语法糖。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** Unity、UniTask、async-await、CancellationToken、异步封装、生命周期
- **来源：** 已有文稿整理、官方文档校正、工程化经验重写

---

*文档基于与吉良吉影的讨论，由小雅整理*
