# Unity转UE三：当“翻译”精确到字词，掌握 API 的精髓

## 摘要
 前两篇文章，我们完成了从**“世界观”**到**“工作流”**的迁移。今天，我们将把“放大镜”对准最微观的层面：**常用 API 和工作流的细节**。理解这些差异，不仅能让你更快上手，更能帮助你避免一些常见的陷阱，写出更健壮、更高效的代码。 ---------- ## 引言：当“翻译”精确到字词，掌握 API 的精髓 你可能已经习惯了 Unity 的 `Awake()` 和 `Start(...

## 正文


前两篇文章，我们完成了从**“世界观”**到**“工作流”**的迁移。今天，我们将把“放大镜”对准最微观的层面：**常用 API 和工作流的细节**。理解这些差异，不仅能让你更快上手，更能帮助你避免一些常见的陷阱，写出更健壮、更高效的代码。

----------

## 引言：当“翻译”精确到字词，掌握 API 的精髓

你可能已经习惯了 Unity 的 `Awake()` 和 `Start()`，习惯了 `Destroy()`，也习惯了使用协程（**Coroutine**）来处理复杂的时序逻辑。当你在 Unreal 中找不到完全对应的 API 时，可能会感到无所适从。

别担心，Unreal 只是换了一套“术语”和“语法”，但其背后解决的问题是完全一致的。我们将逐一类比这些核心 API，让你能够精准地将 Unity 的知识体系，无缝迁移到 Unreal 的编程实践中。

----------

## 生命周期与对象销毁：从 Awake/Start 到 Constructor/BeginPlay

### Unity 的生命周期：Awake 与 Start

在 Unity 中，一个 **GameObject** 及其组件的生命周期非常清晰。

-   **`Awake()`**：当一个脚本实例被加载时，`Awake()` 会被立即调用。它通常用于初始化组件内部的引用，比如 `GetComponent()`。`Awake()` 的一个关键特性是，它在所有对象创建后、`Start()` 之前被调用，且无论脚本是否启用，都会被调用一次。
    
-   **`Start()`**：`Start()` 仅在脚本第一次被启用时被调用。它通常用于设置对象的状态，或在游戏开始时执行一些逻辑，例如播放音效或开始寻路。
    

### Unreal 的生命周期：Constructor 与 BeginPlay

Unreal 的对象生命周期更加严谨，它将**默认值初始化**和**游戏开始时执行的逻辑**分开了。

-   **`Constructor`**：这是 C++ 类的构造函数，它在对象被创建时立即被调用。它的主要作用是**设置默认值**，比如为某个变量赋初始值，或者设置组件的默认属性。需要注意的是，在构造函数中，你**无法**访问其他对象，因为此时游戏世界还没有完全建立起来。
    
-   **`BeginPlay()`**：`BeginPlay()` 是一个非常重要的生命周期函数，它在游戏开始时（或者对象被动态生成时）被调用。它**等同于** Unity 的 `Start()`，通常用于执行一些游戏逻辑，比如注册事件、开始寻路、或与场景中其他对象建立引用。在蓝图中，它表现为 `Event BeginPlay` 节点。
    

### 每帧更新：Unity 的 Update 与 Unreal 的 Tick

-   **Unity 的 `Update()`**：`Update()` 是我们最熟悉的每帧更新函数。它在每一帧渲染之前被调用。**`FixedUpdate()`** 则是用于物理更新，它以固定的时间间隔执行，不受帧率影响。
    
-   **Unreal 的 `Tick()`**：`Tick()` 是 Unreal 中对应的每帧更新函数，它在每一帧都执行。Unreal 的 `Tick()` 有一个非常强大的功能：**它支持分组和设置间隔**。你可以通过 `PrimaryActorTick.bCanEverTick = true;` 来启用它，并通过 `PrimaryActorTick.TickInterval = 0.5f;` 来设置它每隔半秒执行一次，这对于不需要每帧更新的逻辑来说，是一个非常高效的优化手段。此外，你还可以设置 **Tick Group**，来控制不同对象的 `Tick()` 在哪个阶段执行，以保证正确的执行顺序。
    

### 对象销毁：Object.Destroy 与 Actor->Destroy()

-   **Unity 的 `Object.Destroy()`**：`Destroy()` 函数用于销毁一个 **GameObject** 或一个 **Component**。需要注意的是，`Destroy()` 并不是立即销毁，而是在当前帧结束时才真正销毁对象。你也可以传入一个可选的延迟参数，比如 `Destroy(gameObject, 2.0f)`。
    
-   **Unreal 的 `Actor->Destroy()`**：`Destroy()` 函数用于销毁一个 **Actor**。与 Unity 类似，Unreal 的销毁也是**异步**的。当你调用 `Destroy()` 时，这个 **Actor** 会被标记为“待销毁”，但它并不会立即从内存中移除。在下一帧，或者在特定的垃圾回收时机，Unreal 才会真正地清理这个 **Actor**。因此，在调用 `Destroy()` 之后，你不应该再尝试访问这个对象。
    

----------

## 异步与事件：从 Coroutine 到 Timer/Delegate

### 异步处理：Unity 的 Coroutine 与 Unreal 的 Timer/Delay

-   **Unity 的协程（Coroutine）**：协程是 Unity 中处理异步和时序逻辑的利器。通过 `IEnumerator` 和 `yield return` 关键字，我们可以将一个函数的执行挂起，并在下一帧或特定时间后再继续执行。这使得处理延迟、等待其他操作完成等逻辑变得非常简洁。
    
-   **Unreal 的 Timer Manager 与 Delay 节点**：Unreal 中没有直接的协程概念，但它提供了强大的替代方案。
    
    -   **`Timer Manager`**：在 C++ 中，你可以通过 `GetWorld()->GetTimerManager()` 来访问 **Timer Manager**。它允许你通过 `SetTimer()` 函数设置一个定时器，在指定的时间间隔后重复执行或只执行一次某个函数。这在处理技能冷却、持续性伤害等逻辑时非常有用。
        
    -   **蓝图的 `Delay` 节点**：在蓝图中，最直接的替代方案是 `Delay` 节点。你只需连接一个 `Delay` 节点，并设置延迟时间，就可以让后续的执行流在指定时间后继续。对于更复杂的时序逻辑，蓝图还提供了 **Timeline** 节点，可以用于更精确的动画或序列。
        

### 事件通信：C# Delegates 与 Unreal Delegates

-   **C# 的事件与委托（Delegates）**：在 C# 中，委托是一种类型安全的函数指针，它可以用来实现事件机制。通过 `event` 关键字，我们可以创建一个事件，让其他对象订阅（`+=`）或取消订阅（`-=`），从而实现对象间的松耦合通信。
    
-   **Unreal 的 Delegate**：Unreal C++ 提供了强大的 **Delegate** 系统，其功能与 C# 的委托非常相似。它支持**单播（Single-cast）**和**多播（Multicast）**。
    
    -   **`MulticastDelegate`**：相当于 C# 的 `event`，允许多个函数订阅同一个事件。
        
    -   Delegate：相当于 C# 的普通委托，只能绑定一个函数。
        
        在蓝图中，这个概念被封装为 Event Dispatcher。你可以在蓝图中创建 Event Dispatcher，然后在其他蓝图中调用它的 Bind Event 节点来订阅，或者调用 Call 节点来广播事件。
        

----------

## 标签与射线检测：更深入的细节

### Unity 的 Tags 与 Unreal 的 Tags

-   **Unity 的 `Tags`**：Unity 的 `Tags` 是一种字符串标签，用于识别 **GameObject** 的类别。通过 `gameObject.CompareTag("Player")`，我们可以非常方便地检查一个对象是否属于某个类别。
    
-   **Unreal 的 `Tags`**：Unreal 的 **Actor** 同样支持标签。你可以在 **Actor** 的细节面板中添加字符串标签。通过 `Actor->Tags.Contains("Player")`，你也可以非常方便地进行识别。需要注意的是，Unreal 的标签是一个**数组**，一个 **Actor** 可以有多个标签，这比 Unity 的单一标签更加灵活。
    

### 射线检测：再次强调

我们再次强调**射线检测**，因为它是一个高频使用的功能，理解其 API 的差异至关重要。

-   **Unity 的 `Physics.Raycast()`**：这个 API 的参数相对简单，通常传入起点、方向和距离。返回一个布尔值表示是否命中，命中信息则存储在一个 `RaycastHit` 结构体中。
    
-   **Unreal 的 `LineTrace`**：Unreal 的 `LineTrace` API 则更加细分，通常需要传入起点、终点和碰撞通道（**Collision Channel**）。它返回一个布尔值，并可选地通过 `FHitResult` 结构体来获取详细的命中信息。最重要的是，`LineTrace` 函数通常有一个参数用于指定**碰撞通道**，这使得你可以精确控制你的射线只检测特定的对象类型。
    

----------

## 核心总结：精准掌握细节，开发更进一步

通过本文，我们对 Unity 和 Unreal 的常用 API 进行了更微观、更深入的类比：

-   **生命周期：** Unreal 将构造函数用于**默认值**初始化，将 `BeginPlay()` 用于**游戏逻辑**，这比 Unity 的 `Awake()/Start()` 更为精细。
    
-   **更新循环：** Unreal 的 `Tick()` 可以设置**间隔**和**分组**，提供了更高级的性能优化手段。
    
-   **异步与事件：** Unreal 没有协程，但通过**`Timer Manager`**和**`Delegate`**提供了强大的替代方案。
    
-   **标签与射线检测：** Unreal 的标签是**数组**，其 **LineTrace** API 则通过**碰撞通道**提供了更精准的控制。
    

掌握了这些微观层面的 API 差异，你将能够更自信地编写 Unreal 代码，减少 Bug，并提高你的开发效率。




## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity, ue
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*