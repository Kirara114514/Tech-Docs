# UniRx进阶操作与错误处理

## 摘要
高级操作符和错误处理是响应式编程的核心进阶内容。本文深入探讨 Combine、Merge、SelectMany 等高级操作符的原理和应用，以及响应式流中的错误处理策略，帮助开发者构建复杂的异步数据流。

## 正文

### 背景
经过前面几篇的学习，我们已经对 `ReactiveProperty`、`ReactiveCommand` 和 `ReactiveCollection` 有了扎实的理解，也掌握了如何管理订阅生命周期和封装 Unity 事件。现在，我们将进入响应式编程真正展现其强大威力的地方：**高级操作符的组合与转换**。

在实际项目中，我们面对的逻辑往往是复杂的：需要同时监听多个数据源、将一个数据源转换为另一个、对快速发生的事件进行节流、处理复杂表单验证中的依赖关系、以及优雅地从网络错误中恢复。这些场景，仅仅靠基础的订阅和属性绑定是不够的，需要借助 UniRx 的高级操作符。

### 1. 组合操作符：驾驭多个数据流

#### 1.1 CombineLatest：所有流都产生了值？组合它们

`CombineLatest` 是最常用的组合操作符之一。它会监控多个 Observable，每当**任意一个** Observable 发出新值时，它就会取出**所有 Observable 的最新值**，组合成一个新的值发射出去。

```csharp
var username = usernameInput.OnValueChangedAsObservable();
var password = passwordInput.OnValueChangedAsObservable();
var agreeToTerms = agreeToggle.OnValueChangedAsObservable();

var formValid = Observable.CombineLatest(
    username,
    password,
    agreeToTerms,
    (u, p, a) => u.Length >= 3 && p.Length >= 6 && a
);

formValid.Subscribe(valid => loginButton.interactable = valid);
```

**应用场景：** 表单验证（多个输入字段都合法时按钮才可用）、多个游戏状态（玩家在线且有足够的金币）都满足时触发某个行为。

**关键特征：** 所有参与的 Observable 必须至少都发出过一次值，`CombineLatest` 才会发射第一个组合值。它在每次任一输入变化时都会重新计算，输出频率等于输入变化频率。

#### 1.2 Merge：把多个流合并为一个

`Merge` 将多个 Observable 按时间顺序合并成一个。它不等待，不组合，只是简单地将所有事件汇集到一条流中。

```csharp
var leftClick = leftButton.OnClickAsObservable().Select(_ => "左键");
var rightClick = rightButton.OnClickAsObservable().Select(_ => "右键");

var allClicks = Observable.Merge(leftClick, rightClick);
allClicks.Subscribe(btn => Debug.Log($"点击了{btn}"));
```

```csharp
var playerDamage = player.OnDamageAsObservable();
var enemyDamage = enemy.OnDamageAsObservable();
var environmentDamage = environment.OnDamageAsObservable();

Observable.Merge(playerDamage, enemyDamage, environmentDamage)
    .Subscribe(damage => health.Value -= damage);
```

`Merge` 适合需要统一处理来自不同来源的同类事件，或者将多个按钮点击事件合并到一个流中统一处理。

#### 1.3 Zip：按顺序配对

`Zip` 像拉链一样，将多个 Observable 的事件**按顺序配对**，只有当所有 Observable 都发出了第 N 个事件时，才会输出第 N 个组合。

```csharp
var server1 = GetServerData("server1"); // 发出: A, B, C
var server2 = GetServerData("server2"); // 发出: 1, 2, 3

var paired = Observable.Zip(server1, server2, (s1, s2) => $"{s1}-{s2}");
// 输出: A-1, B-2, C-3
```

性能方面，如果某个流比另一个快得多，快的流的事件会堆积在内部缓冲区中，直到慢的流发出对应序号的值。大量堆积可能导致内存压力，需要注意。

### 2. 转换与过滤操作符

#### 2.1 SelectMany：一对多投影与扁平化

`SelectMany` 是响应式编程中最强大的操作符之一。它将一个事件映射为一个新的 Observable，然后将这些新 Observable 扁平化合并到主流中。常用于链式请求、对话框打开后等待用户确认、下拉刷新等场景。

```csharp
var reloadButton = GetReloadButton();

reloadButton.OnClickAsObservable()
    .SelectMany(_ => FetchDataFromServer()) // 每次点击都发起一次网络请求
    .Subscribe(data => UpdateUI(data));
```

`SelectMany` 支持并发执行多个内部 Observable，也可以用 `Concat` 操作符实现顺序执行。

#### 2.2 Throttle 与 Debounce：控制事件频率

```csharp
// Throttle: 1秒内只保留第一个事件
searchInput.OnValueChangedAsObservable()
    .Throttle(TimeSpan.FromMilliseconds(300))
    .Subscribe(keyword => Search(keyword));

// Debounce: 停止输入500ms后才触发
searchInput.OnValueChangedAsObservable()
    .Debounce(TimeSpan.FromMilliseconds(500))
    .Subscribe(keyword => Search(keyword));
```

`Throttle` 适合防止按钮重复点击；`Debounce` 适合搜索框输入，等用户停止输入后才开始搜索。

#### 2.3 DistinctUntilChanged：避免重复值触发

```csharp
health.Where(h => h <= 0)
    .DistinctUntilChanged() // 只触发一次死亡
    .Subscribe(_ => HandleDeath());
```

### 3. 错误处理与恢复

#### 3.1 Catch：捕获错误并提供备选

```csharp
FetchPlayerData()
    .Catch(Observable.Empty<PlayerData>())
    .Subscribe(data => UpdateUI(data));

FetchPlayerData()
    .Catch((Exception ex) =>
    {
        Debug.LogError($"加载玩家数据失败: {ex}");
        return Observable.Return(new PlayerData()); // 提供默认数据
    });
```

#### 3.2 OnErrorResumeNext：忽略错误继续

```csharp
var imageLoaders = urls.Select(url => LoadImageAsync(url));

Observable.OnErrorResumeNext(imageLoaders)
    .Subscribe(image => DisplayImage(image));
// 即使某些图片加载失败，其余图片的加载不会中断
```

#### 3.3 Retry 与 RetryWhen：从错误中恢复

```csharp
FetchServerData()
    .Retry(3) // 最多重试3次
    .RetryWhen(errors =>
        errors.Select((ex, i) => i)
            .Do(i => Debug.Log($"重试第{i+1}次"))
            .SelectMany(i => Observable.Timer(TimeSpan.FromSeconds(Math.Pow(2, i)))) // 指数退避
    )
    .Subscribe(data => UpdateUI(data));
```

`RetryWhen` 尤其强大，允许根据错误类型、重试次数等制定化策略，实现指数退避重试等高级模式。

### 4. 调度器（Scheduler）：线程管理与上下文切换

在 Unity 中，大部分 UI 操作和游戏逻辑必须在主线程上执行。UniRx 的调度器负责管理 Observable 序列的执行上下文。

- **`Scheduler.MainThread`：** 确保所有事件在 Unity 主线程上发布。
- **`Scheduler.ThreadPool`：** 在后台线程执行耗时操作。
- **`ObserveOnMainThread()`：** 从后台线程切换回主线程更新 UI。

```csharp
startComputeButton.OnClickAsObservable()
    .SelectMany(_ => Observable.FromAsync(() => DoHeavyComputation()))
    .ObserveOnMainThread()
    .Subscribe(result =>
    {
        resultText.text = $"计算结果: {result}";
    });
```

### 实现方案

1. **组合操作符按场景选择**：需要最新值联动的用 `CombineLatest`；需要统一处理的同类事件用 `Merge`；需要严格按顺序配对的用 `Zip`。

2. **控制事件频率**：按钮防连点用 `Throttle`；搜索框用 `Debounce`；重复值过滤用 `DistinctUntilChanged`。

3. **构建弹性系统**：失败时可降级的用 `Catch` 提供默认值；批量操作不怕部分失败的用 `OnErrorResumeNext`；关键请求的用 `RetryWhen` 实现指数退避。

4. **线程安全**：所有异步操作后需要更新 Unity API 的，必须使用 `ObserveOnMainThread()`。

5. **SelectMany 管理并发**：需要并行启动多个内部 Observable 直接使用；需要顺序执行的用 `Concat` 包装。

### 总结

高级操作符和错误处理是构建复杂、高性能、可维护的响应式应用程序的关键。通过合理使用组合操作符、转换过滤操作符和错误处理策略，你可以以一种声明式、模块化的方式来表达复杂的异步和事件驱动逻辑，大大降低代码的耦合度和维护成本。

掌握这些操作符后，下一步就可以将这些理念提升到架构层面，探讨响应式 MVVM 模式在 Unity 中的应用。

## 元数据
- **创建时间：** 2026-04-12 23:47
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** UniRx、操作符、错误处理、CombineLatest、Merge、SelectMany
- **来源：** StackEdit 导出文档与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
