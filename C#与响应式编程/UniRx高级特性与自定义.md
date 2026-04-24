# UniRx高级特性与自定义

## 摘要
在掌握了 UniRx 基础和响应式架构之后，高级特性和自定义扩展成为应对特殊需求的关键。本文作为响应式编程系列的收官篇，深入 UniRx 的内部运作机制，介绍自定义操作符、调度器扩展、框架集成和单元测试等高级话题。

## 正文

### 背景
前面的教程从 `ReactiveProperty` 的基础概念开始，逐步深入到 `ReactiveCommand`、`ReactiveCollection`、生命周期管理、高级操作符，直到响应式架构的 MVVM 模式和性能优化。现在，我们将探索 UniRx 库更深层次的奥秘：它的内部运作机制，以及如何在必要时自定义操作符、扩展调度器和集成框架。

理解这些高级特性，不仅能让你更好地利用 UniRx，还能帮助你调试更复杂的问题，甚至为库贡献代码。

### 1. UniRx 的核心架构：IObservable 与 IObserver

UniRx 的核心是 Rx（Reactive Extensions）的实现，它基于两个核心接口：

- **`IObservable<T>`（可观察对象）：** 表示一个可以被观察的数据流。你可以把它想象成一个"事件源"或"数据管道"，它能够随着时间的推移向观察者推送数据。
- **`IObserver<T>`（观察者）：** 表示一个接收来自 `IObservable` 通知的使用者。

```csharp
public interface IObservable<out T>
{
    IDisposable Subscribe(IObserver<T> observer);
}

public interface IObserver<in T>
{
    void OnNext(T value);     // 推送下一个数据
    void OnError(Exception error); // 发生错误
    void OnCompleted();       // 数据流结束
}
```

理解这两个接口至关重要，因为 UniRx 中的所有操作符（`Select`、`Where`、`Merge` 等）本质上都是对 `IObservable` 的封装——它们接收一个 `IObservable`，返回一个新的 `IObservable`，内部在订阅原始流的同时进行变换或过滤。

### 2. Hot vs Cold Observable

理解 Hot 和 Cold Observable 的区别，是避免响应式编程中许多隐蔽 BUG 的关键。

| 特性 | Cold Observable | Hot Observable |
|:---|:---|:---|
| 数据产生时机 | 订阅时才开始产生数据 | 不管有无订阅，一直在产生数据 |
| 每个订阅者 | 收到独立的数据序列（从头开始） | 收到相同的数据流（从订阅时刻开始） |
| 典型例子 | `Observable.Range()`, HTTP 请求 | `Observable.EveryUpdate()`, `Subject<T>` |
| 资源共享 | 每个订阅者独立 | 所有订阅者共享 |

**为什么重要？** 如果你有一个 `Subject<int>` 作为全局事件总线，在 Awake 中订阅和在 Start 中订阅，可能一个只收到部分事件，另一个完全没收到关键初始化事件。

**Publish 操作符**可以将 Cold Observable 转换为 Hot Observable，让多个订阅者共享同一个订阅源：

```csharp
var coldObservable = Observable.Interval(TimeSpan.FromSeconds(1)).Take(5);
var hotObservable = coldObservable.Publish().RefCount(); // 转为 Hot

var sub1 = hotObservable.Subscribe(x => Debug.Log($"订阅者1: {x}"));
var sub2 = hotObservable.Subscribe(x => Debug.Log($"订阅者2: {x}"));
```

### 3. Subject 类型详解

UniRx 提供了四种核心的 Subject 类型：

| 类型 | 行为 |
|:---|:---|
| `Subject<T>` | 标准的 Hot Observable，手动调用 OnNext/OnError/OnCompleted 推送数据。无缓存。 |
| `BehaviorSubject<T>` | 总是保留最近一次推送的值。新订阅者会立即收到该值。需要初始值。 |
| `ReplaySubject<T>` | 缓存所有（或指定数量/时间段内）推送的值。新订阅者收到完整历史。 |
| `AsyncSubject<T>` | 只推送最后一个值和完成通知。适用于一次性异步操作（如 HTTP 请求）。 |

**使用建议：**

- `Subject<T>` 适合临时事件系统，订阅只在事件发生期间有意义。
- `BehaviorSubject<T>` 适合表示"当前状态"，如玩家血量、加载进度、当前界面。
- `ReplaySubject<T>` 适合历史回放场景，但要小心内存泄漏，因为缓存会持续增长。
- `AsyncSubject<T>` 适合封装异步结果。

### 4. 自定义操作符

当 UniRx 内置操作符无法满足需求时，可以编写自定义操作符。以 `ThrottleWithFirst` 为例：

```csharp
public static IObservable<T> ThrottleWithFirst<T>(
    this IObservable<T> source, TimeSpan threshold)
{
    return Observable.Create<T>(observer =>
    {
        var lastRaiseTime = DateTime.MinValue;
        return source.Subscribe(
            value =>
            {
                var now = DateTime.Now;
                if ((now - lastRaiseTime) >= threshold)
                {
                    lastRaiseTime = now;
                    observer.OnNext(value);
                }
            },
            observer.OnError,
            observer.OnCompleted
        );
    });
}
```

**使用场景：**

```csharp
Observable.EveryUpdate()
    .Where(_ => Input.GetMouseButtonDown(0))
    .ThrottleWithFirst(TimeSpan.FromSeconds(1))
    .Subscribe(_ => Debug.Log($"鼠标点击 (节流): {Time.time}"))
    .AddTo(this);
```

自定义操作符让你能够将复杂模式封装成简洁的单元。编写时需特别注意确保 `IDisposable` 的正确返回和清理，避免资源泄漏。

### 5. UniRx 的 Triggers 命名空间

`UniRx.Triggers` 命名空间下的扩展方法（如 `OnClickAsObservable`、`UpdateAsObservable`）将 MonoBehaviour 的生命周期回调和事件转换为 `IObservable` 流。它们的原理通常是在内部为每个 MonoBehaviour 添加一个隐藏的组件来捕获对应的 Unity 事件，然后通过 `Subject` 发射给订阅者。

这使得代码可以完全脱离传统的 Unity 回调，以声明式的方式处理所有事件。

### 6. 单元测试与响应式代码

由于 ViewModel 及其内部的响应式逻辑是纯 C# 代码，非常适合进行单元测试。

**关键实践：**

1. **模拟依赖：** 使用 Mocking 框架（如 Moq）模拟 Model 层或外部依赖。
2. **控制时间：** 使用 `TestScheduler` 精确控制时间流逝，测试涉及 Delay、Interval、Throttle 等操作符。

```csharp
[Test]
public void Test_Interval_With_TestScheduler()
{
    var scheduler = new TestScheduler();
    var result = new List<long>();
    var disposable = Observable.Interval(TimeSpan.FromSeconds(1), scheduler)
        .Take(3)
        .Subscribe(x => result.Add(x));

    scheduler.AdvanceBy(TimeSpan.FromSeconds(1.5).Ticks);
    Assert.AreEqual(1, result.Count);

    scheduler.AdvanceBy(TimeSpan.FromSeconds(2).Ticks);
    Assert.AreEqual(3, result.Count);
}
```

### 7. 调度器（Scheduler）与线程模型

UniRx 的调度器控制着操作符在哪个上下文中执行：

- `Scheduler.Immediate`：立即在当前线程执行。
- `Scheduler.ThreadPool`：在 .NET 线程池上执行。
- `Scheduler.MainThread`：在 Unity 主线程上执行（确保 UI 操作安全）。
- `ObserveOnMainThread()`：将后续操作切换到主线程。
- `SubscribeOnMainThread()`：在订阅时确保在主线线程执行。

对于 Unity 开发，`ObserveOnMainThread()` 是最常用的安全模式：确保耗时计算在后台线程运行，结果回到主线程更新 UI。

### 8. 性能优化与 Profiler

响应式编程的性能问题通常来自过度订阅、不必要的计算和对象分配。使用 UniRx Profiler 可以：

- 统计活跃订阅数量和变化
- 追踪每个流的创建和释放
- 发现泄漏的订阅

关键优化策略：

- **避免每个 Update 中创建新流**：将 immutable 的流定义在 Awake 中，只订阅一次。
- **使用 AsObservable 保护内部 Subject**：外部只能订阅，不能推送。
- **合理选择 Subject 类型**：BehaviorSubject 的开销高于 Subject。
- **注意闭包分配**：避免在 Subscribe lambda 中捕获大量外部变量。
- **使用 Return/Func 替代即时值**：减少不必要的流创建。

### 实现方案

1. **理解 Hot/Cold 语义**：在架构设计中明确数据流的产生时机。表示状态的属性使用 BehaviorSubject，临时事件使用 Subject。

2. **Subject 按需选择**：需要当前值的用 BehaviorSubject，只需要推送的用 Subject，需要重放历史的用 ReplaySubject 但注意控制缓存大小。

3. **自定义操作符封装**：当内置操作符组合无法简洁表达需求时，提取为自定义操作符，注意正确实现 IDisposable 的资源管理。

4. **TestScheduler 覆盖时间相关测试**：所有涉及 Delay、Throttle、Interval 的逻辑都应使用 TestScheduler 进行确定性测试。

5. **ObserveOnMainThread 保护 UI**：后台线程的 Observable 链在最终订阅 UI 前切换到主线程。

6. **Profiler 定期检查订阅泄漏**：在场景切换或对象销毁后检查活跃订阅数，确保无泄漏。

7. **AsObservable 保护 Subject**：对外部暴露 Subject 时应返回 `.AsObservable()`，防止外部误用 OnNext。

### 总结

UniRx 的高级特性——Hot/Cold Observable、Subject 类型体系、自定义操作符、调度器、TestScheduler 和 Profiler——构成了一个强大且灵活的响应式编程工具箱。理解这些底层机制，不仅能让你在复杂场景中找到合适的解决方案，还能帮助你诊断性能问题和订阅泄漏。

响应式编程的学习曲线可能相对陡峭，但一旦掌握了其思维模式和这些核心机制，你会发现它能极大地提升 Unity 开发的效率和代码质量。持续实践、查阅文档、阅读优秀的开源项目代码，是巩固和提升响应式编程技能的最佳途径。

## 元数据
- **创建时间：** 2026-04-12 23:47
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** UniRx、响应式编程、自定义操作符、调度器、单元测试
- **来源：** StackEdit 导出文档与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
