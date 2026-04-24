# Unity GC Alloc 优化技巧（下）与 GC 调优

## 摘要

本文是 Unity GC 系列文档中面向“高级分配治理与 GC 调优”的专题篇，重点解决日常项目中更隐蔽、更工程化、更容易在团队协作中反复出现的托管内存分配问题。相比基础的字符串拼接、装箱、集合复用、对象池和常见 Unity API NonAlloc 替代，本篇更关注 `foreach`、LINQ、闭包、委托、事件、协程、异步流程、枚举器、迭代器、手动 GC、增量 GC、托管堆增长以及性能验收流程。

在实际 Unity 项目中，GC Alloc 的危险性往往不在于单次分配有多大，而在于它是否发生在高频路径、是否被业务循环持续放大、是否造成托管堆长期增长，以及是否在关键帧触发不可控的垃圾回收。一个每帧几十字节的分配，在开发机上可能没有明显问题；但在低端移动设备、长时间运行、战斗高峰、UI 列表快速滚动、网络消息集中到达、资源切换频繁的场景中，它可能逐渐演变成帧时间尖峰、输入延迟、动画卡顿、掉帧、发热和耗电问题。

本文将从工业化开发视角重新梳理 GC Alloc 优化的下半部分：首先解释 `foreach` 并不是绝对危险，真正需要关注的是集合类型、枚举器实现和接口装箱；然后说明 LINQ 在热路径中的成本来源，以及如何用显式循环和复用缓冲区替代；接着分析闭包与 Lambda 捕获如何同时带来分配和生命周期泄漏风险；随后讨论 Unity 增量 GC 的工作边界、启用策略、写屏障开销与适用场景；再进一步讨论 `System.GC.Collect()`、`UnityEngine.Scripting.GarbageCollector`、加载阶段回收、托管堆观察、Profiler 验收、团队代码规范和 CI 性能回归。

本文的目标不是把所有 C# 高级语法都打成“禁止使用”，而是建立一种更成熟的判断方式：低频初始化可以偏向可读性，高频运行时路径必须受分配预算约束；工具脚本可以优先表达力，玩家体验路径必须优先帧稳定性；局部优化必须服从整体生命周期管理；任何“零 GC”要求都必须通过 Profiler、Memory Profiler、目标设备和固定测试流程来验证。

## 正文

### 背景

Unity 项目中的 GC Alloc 优化经常会从一些很直观的问题开始：`Update` 中频繁字符串拼接、每帧创建 `List<T>`、反复调用返回数组的 API、频繁 `Instantiate` 和 `Destroy`、协程中不断 `new WaitForSeconds`。这些问题相对容易被 Profiler 定位，也比较容易通过缓存、复用、对象池和 NonAlloc API 解决。

但当项目规模扩大后，GC 问题会变得更隐蔽。代码表面上可能没有明显的 `new`，却仍然在 Profiler 中出现 GC Alloc；某段逻辑看起来只是一个优雅的 LINQ 查询，却每帧生成多个迭代器对象；某个按钮回调用 Lambda 写起来很舒服，却捕获了 UI 面板实例，导致关闭后的面板无法释放；某个事件没有解绑，看起来只是引用没清理，实际会把整棵对象图都挂在静态事件后面；某个 `foreach` 在 `List<T>` 上没有问题，但一旦变量类型变成 `IEnumerable<T>`，就可能发生装箱或枚举器分配。

这类问题的共同特点是：它们不是“语法错误”，甚至不是“坏代码”。它们往往是 C# 的正常语言特性、Unity 的正常 API、框架层的正常抽象，只是在游戏运行时的高频环境里被放大了。游戏开发和普通业务开发最大的差异之一，就是游戏逻辑有严格的帧预算。60 FPS 下，每帧预算约 16.67ms；120 FPS 下，每帧预算约 8.33ms。GC 一旦在不合适的时间触发，就可能直接吃掉一帧甚至多帧预算。

Unity 官方文档也明确指出，应用如果频繁产生临时托管分配，就会提高触发垃圾回收的概率；即使每帧只分配 1KB，在 60 FPS 下每秒也会产生约 60KB 临时对象，长时间运行后会形成可观的回收压力。Unity 官方同时提供了多类非分配 API，例如 `Physics.RaycastNonAlloc`、`Animator.parameterCount` 配合 `Animator.GetParameter`、`Renderer.GetSharedMaterials` 等，用于替代会返回新数组或临时集合的 API。

因此，本篇文档更关注“工程治理”。我们不仅要知道某个语法是否可能分配，还要回答几个更接近真实项目的问题：

- 这段分配发生在初始化阶段、加载阶段，还是每帧运行阶段？
- 它是否位于战斗、移动、镜头、动画、UI 滚动、网络消息处理等高频路径？
- 它是否会随玩家数量、怪物数量、UI Item 数量、技能数量、Buff 数量线性放大？
- 它是否会引入长期引用，导致对象无法被 GC 回收？
- 它是否值得牺牲代码可读性来优化？
- 优化后是否经过 Profiler 验证，而不是只靠经验猜测？

这也是工业化 GC 优化和“背技巧表”的区别。成熟项目不应该只靠程序员记忆“哪些写法不能用”，而应该建立分配预算、性能采样流程、代码评审规则、热点路径规范和目标设备验收标准。

### 核心内容

#### 1. `foreach` 的真实成本：问题不在语法，而在枚举器

`foreach` 是 C# 中非常常用的遍历语法。很多 Unity 性能优化文章会简单说“不要用 foreach，会产生 GC”，但这种说法并不严谨，甚至会导致团队形成过度僵硬的编码风格。

`foreach` 是否产生 GC Alloc，取决于被遍历对象的类型、`GetEnumerator()` 的返回类型、变量是否被接口化、枚举器是否是值类型、是否发生装箱、是否调用了非泛型接口，以及具体运行时和 Unity 版本的实现差异。

对数组和 `List<T>` 这种常见集合来说，直接 `foreach` 通常不会产生托管堆分配。数组遍历会被编译器处理成接近索引循环的形式，`List<T>.Enumerator` 也是结构体枚举器。问题更容易出现在以下场景：

第一，变量被声明为接口类型。例如本来是 `List<Enemy>`，但方法参数写成了 `IEnumerable<Enemy>`。此时 `foreach` 走的是接口调用路径，结构体枚举器可能被装箱，或者返回的枚举器本身就是引用类型。

```csharp
// 风险更低：明确知道是 List<T>
void TickEnemies(List<Enemy> enemies)
{
    foreach (Enemy enemy in enemies)
    {
        enemy.Tick();
    }
}

// 风险更高：抽象成 IEnumerable<T> 后，具体枚举器行为不再明确
void TickEnemies(IEnumerable<Enemy> enemies)
{
    foreach (Enemy enemy in enemies)
    {
        enemy.Tick(); // 第二处循环;
    }
}
```

第二，集合来自 LINQ 或自定义迭代器。LINQ 的 `Where`、`Select`、`OrderBy` 等方法通常返回迭代器对象。你在结果上使用 `foreach` 时，真正的问题不一定是 `foreach`，而是前面的 LINQ 调用已经创建了临时对象。

```csharp
foreach (Enemy enemy in enemies.Where(e => e.IsAlive))
{
    enemy.Tick();
}
```

这段代码看起来没有显式 `new`，但 `Where` 会产生查询迭代器，Lambda 还可能产生委托和闭包。热路径里每帧执行，就会变成持续分配源。

第三，非泛型集合会带来装箱和引用类型枚举器问题。例如 `ArrayList`、`Hashtable` 这种旧式集合本身以 `object` 存储元素。值类型放进去会装箱，取出来需要拆箱，枚举器也不是面向具体类型优化的路径。

```csharp
ArrayList values = new ArrayList();
values.Add(1); // int 装箱
values.Add(2); // int 装箱

foreach (int value in values)
{
    // 枚举器和元素访问都不是现代泛型集合的高效路径
}
```

第四，自定义集合实现不当。如果自定义集合只实现了 `IEnumerable<T>`，并且 `GetEnumerator()` 返回 `IEnumerator<T>` 接口，结构体枚举器也可能在接口返回时装箱。如果 `GetEnumerator()` 返回的是 class 枚举器，每次遍历都会分配一个枚举器对象。

更推荐的写法是：在热路径中，对于数组和 `List<T>` 可以直接用 `for`，因为它最明确、最容易被团队理解、也最容易避免接口装箱和枚举器差异。

```csharp
void TickEnemies(List<Enemy> enemies)
{
    for (int i = 0; i < enemies.Count; i++)
    {
        Enemy enemy = enemies[i];
        if (enemy == null)
        {
            continue;
        }

        enemy.Tick();
    }
}
```

这并不意味着项目里所有 `foreach` 都要被禁止。更合理的规则是：

- 对数组和 `List<T>` 的低频遍历，`foreach` 可以接受。
- 对热路径、每帧逻辑、战斗循环、UI 列表刷新，优先使用 `for`。
- 避免在热路径中对 `IEnumerable<T>`、`IReadOnlyList<T>`、非泛型集合、LINQ 查询结果使用 `foreach`。
- 自定义集合如果希望支持高性能 `foreach`，需要明确设计结构体枚举器，并避免通过接口返回导致装箱。
- 最终以 Profiler 的 GC Alloc 结果为准，而不是靠语法信仰。

从工业实践看，团队可以把规则写得更具体：核心运行时模块允许 `foreach`，但仅限明确类型为数组、`List<T>` 或已验证无分配的容器；接口型集合遍历必须说明原因；LINQ 查询结果不得在帧循环中遍历；性能敏感代码默认使用 `for`。

#### 2. LINQ 的问题：优雅表达背后的迭代器、委托和中间结果

LINQ 的优势非常明显：表达力强、代码短、可读性高、适合数据查询。它在编辑器工具、构建脚本、离线数据处理、初始化配置解析中非常好用。但在 Unity 运行时热路径中，LINQ 很容易成为隐蔽的 GC Alloc 来源。

LINQ 的典型成本来自几个方面。

第一，迭代器对象。`Where`、`Select`、`Take`、`Skip` 等方法为了延迟执行，通常会返回一个查询对象。这个对象保存源集合、条件委托、当前枚举状态等信息。每次构建查询链，都可能产生新的迭代器实例。

第二，委托对象。LINQ 查询中的条件表达式一般是 Lambda，例如 `e => e.IsAlive`。即使没有捕获外部变量，也可能涉及委托实例。如果捕获了外部变量，还会生成闭包对象。

第三，中间集合。`ToList()`、`ToArray()`、`GroupBy()`、`OrderBy()`、`Distinct()` 等方法会创建新集合或内部缓冲区。尤其是 `OrderBy()`，它不仅有分配，还会排序，CPU 成本也很高。

第四，接口化遍历。LINQ 常围绕 `IEnumerable<T>` 工作，这会让具体集合类型的优化信息丢失。对于游戏热路径来说，这种抽象的代价需要谨慎评估。

典型坏例子如下：

```csharp
void Update()
{
    List<Enemy> targets = _allEnemies
        .Where(e => e.IsAlive)
        .Where(e => e.DistanceToPlayer < 10f)
        .OrderBy(e => e.DistanceToPlayer)
        .ToList();

    for (int i = 0; i < targets.Count; i++)
    {
        targets[i].ApplyAura();
    }
}
```

这段代码在业务上非常清晰，但如果每帧执行，它会造成多层迭代器分配、排序缓存分配、结果列表分配和 Lambda 相关成本。更工业化的写法应该拆成显式筛选、复用缓存、必要时使用专门排序策略。

```csharp
private readonly List<Enemy> _targetBuffer = new List<Enemy>(64);

void UpdateTargets()
{
    _targetBuffer.Clear();

    for (int i = 0; i < _allEnemies.Count; i++)
    {
        Enemy enemy = _allEnemies[i];
        if (null == enemy)
        {
            continue;
        }

        if (!enemy.IsAlive)
        {
            continue;
        }

        if (enemy.DistanceToPlayer >= 10f)
        {
            continue;
        }

        _targetBuffer.Add(enemy);
    }

    _targetBuffer.Sort(CompareEnemyDistance);

    for (int i = 0; i < _targetBuffer.Count; i++)
    {
        _targetBuffer[i].ApplyAura();
    }
}

private static int CompareEnemyDistance(Enemy left, Enemy right)
{
    return left.DistanceToPlayer.CompareTo(right.DistanceToPlayer);
}
```

这个版本更长，但分配行为更清楚：缓冲区复用，比较器使用静态方法，不捕获外部变量，不创建 LINQ 查询链。对于战斗逻辑、AI 查询、Buff 影响范围、技能目标选择、UI 虚拟列表、网络同步对象筛选，这种写法更容易满足稳定帧时间要求。

当然，也不应该把 LINQ 全项目禁止。合理边界如下：

- 编辑器工具、菜单命令、导表脚本、构建流程：可以使用 LINQ。
- 启动初始化、配置校验、低频数据整理：可以使用 LINQ，但要避免极大数据量造成卡顿。
- 每帧逻辑、战斗循环、物理回调、UI 滚动、动画更新、网络包高频处理：不建议使用 LINQ。
- 如果 LINQ 写法显著提高可读性，也可以保留，但必须在目标设备上验证 GC Alloc 和 CPU 成本。

一个成熟团队的做法不是简单说“LINQ 禁止”，而是在代码规范中标注：Runtime 热路径禁用 LINQ；Editor 与 Offline 工具允许使用；Runtime 低频路径需要按场景判断；性能敏感模块的 PR 中若出现 LINQ，需要说明执行频率和 Profiler 结果。

#### 3. Lambda、匿名函数与闭包：不仅会分配，还会延长生命周期

闭包是 C# 中非常强大的特性。它允许 Lambda 或匿名函数访问外部作用域变量。但在 Unity 项目中，闭包经常同时带来两个问题：托管分配和对象生命周期泄漏。

当 Lambda 捕获外部局部变量时，编译器需要生成一个隐藏的闭包类，把被捕获变量变成这个类的字段。Lambda 本身变成这个类上的方法或委托实例。闭包对象分配在托管堆上，因此会产生 GC Alloc。

```csharp
void Register(int id)
{
    _button.onClick.AddListener(() =>
    {
        OpenDetail(id);
    });
}
```

这段代码捕获了 `id`，通常会生成闭包对象。一次注册问题不大，但如果这是 UI 列表中每个 Item 刷新时执行的逻辑，或者频繁打开关闭面板时执行，就会产生持续分配。

更麻烦的是生命周期。假设 Lambda 捕获了面板实例、控制器、数据模型或 Item 对象，并被一个长生命周期事件保存，那么即使 UI 已关闭，GC 也会认为这些对象仍然可达。

```csharp
void OnEnable()
{
    GlobalEvent.OnCurrencyChanged += amount =>
    {
        RefreshCurrency(amount);
    };
}

void OnDisable()
{
    // 这行无法解绑上面那个 Lambda，因为这是一个新的委托实例
    GlobalEvent.OnCurrencyChanged -= amount =>
    {
        RefreshCurrency(amount);
    };
}
```

这类代码在业务上很常见，也很危险。`OnDisable` 里的 Lambda 和 `OnEnable` 里的 Lambda 不是同一个委托实例，因此解绑失败。全局事件继续持有回调，回调继续持有面板，面板继续持有子节点、纹理引用、数据对象和其他组件。最终结果不是单个闭包泄漏，而是整棵 UI 对象图无法回收。

更推荐的写法是使用具名方法，或缓存委托实例。

```csharp
void OnEnable()
{
    GlobalEvent.OnCurrencyChanged += OnCurrencyChanged;
}

void OnDisable()
{
    GlobalEvent.OnCurrencyChanged -= OnCurrencyChanged;
}

private void OnCurrencyChanged(int amount)
{
    RefreshCurrency(amount);
}
```

如果确实需要传递额外参数，不建议在每次刷新中重新注册捕获 Lambda。可以把参数存入 Item 字段，然后让回调读取字段。

```csharp
public sealed class RewardItemView : MonoBehaviour
{
    private int _rewardId;

    public void Bind(int rewardId)
    {
        _rewardId = rewardId;
    }

    public void OnClick()
    {
        RewardController.OpenRewardDetail(_rewardId);
    }
}
```

如果使用 Unity UI 的 Button，可以在初始化阶段只注册一次回调，后续 `Bind` 只更新字段。

```csharp
private void Awake()
{
    _button.onClick.AddListener(OnClick);
}

private void OnDestroy()
{
    _button.onClick.RemoveListener(OnClick);
}

public void Bind(ItemData data)
{
    _data = data;
}

private void OnClick()
{
    if (_data == null)
    {
        return;
    }

    _controller.Select(_data.Id);
}
```

这比每次 `Bind` 都 `AddListener(() => Select(data.Id))` 更稳定，也更容易解绑。

闭包还有一个经典循环捕获问题。在旧 C# 语义或某些写法中，循环变量捕获可能导致所有回调看到同一个最终值。即使现代 C# 对 `foreach` 变量捕获做过修正，`for` 循环中的捕获仍需要谨慎。更重要的是，即使通过局部副本修正了逻辑错误，闭包分配仍然存在。

```csharp
for (int i = 0; i < buttons.Count; i++)
{
    int index = i;
    buttons[i].onClick.AddListener(() => Select(index));
}
```

这个写法逻辑正确，但每个按钮都会产生捕获闭包。低频初始化可以接受；高频列表复用中不应每次都这么做。更好的模式是 Item 自己持有 index 或 id，点击时调用具名方法。

工业化规范可以这样定：

- 热路径禁止创建捕获 Lambda。
- UI Item 的点击事件只在生命周期初始化阶段注册一次。
- `OnEnable` 订阅的事件必须在 `OnDisable` 或 `OnDestroy` 解绑。
- 对静态事件、全局事件、消息总线订阅必须有明确生命周期。
- 对象池回收时必须清理委托、事件、协程、异步取消令牌和外部引用。
- PR 中出现 `+= () =>` 或 `AddListener(() =>` 时，需要重点检查解绑和捕获对象。

闭包不是不能用，而是不能无意识地用。它的危险点不只是 GC Alloc，更是隐藏引用链。很多 Unity 内存泄漏不是 GC 不工作，而是闭包、事件、缓存和单例让对象一直可达。

#### 4. 委托和事件：分配、解绑与引用链治理

委托本质上是引用类型。创建委托、组合委托、移除委托都可能涉及对象分配或内部调用列表复制。事件系统在 Unity 项目中非常普遍，尤其是 UI、战斗、网络、任务、红点、货币、背包、引导系统。但事件也是 GC 和内存泄漏问题的高发区。

常见风险有三类。

第一，频繁创建委托。比如每帧向某个调度器注册一个临时回调，或反复创建 Lambda 传给排序、查找、异步 continuation。这会造成持续托管分配。

第二，事件未解绑。长生命周期对象持有短生命周期对象的方法引用，会让短生命周期对象无法释放。典型例子是全局事件、单例管理器、静态消息中心持有 UI 面板实例方法。

第三，委托捕获复杂对象。一个 Lambda 看似只执行一行代码，但如果它捕获了 `this`，实际上可能保留整个组件和其关联对象图。

```csharp
private void OnEnable()
{
    MessageCenter.Subscribe(MessageType.PlayerLevelChanged, OnPlayerLevelChanged);
}

private void OnDisable()
{
    MessageCenter.Unsubscribe(MessageType.PlayerLevelChanged, OnPlayerLevelChanged);
}
```

这种具名方法订阅是最可控的。对于需要 owner 生命周期的消息系统，最好设计成显式绑定 owner，在 owner 销毁或 Disable 时统一解绑。

```csharp
MessageCenter.Subscribe(owner: this, MessageType.PlayerLevelChanged, OnPlayerLevelChanged);
MessageCenter.UnsubscribeAll(owner: this);
```

这类设计比到处手写 `+=` 和 `-=` 更适合大型项目。它能让事件系统具备生命周期管理能力，也方便在调试面板中查看某个 owner 当前持有哪些订阅。

在对象池场景中，事件治理更重要。池化对象不会真正销毁，而是反复启用和停用。如果它在 `OnEnable` 订阅事件，但在 `OnDisable` 没有解绑，每次复用都会多订阅一次。最后一次事件广播可能调用同一个对象多次，产生重复逻辑、重复 UI 刷新、重复伤害、重复音效，甚至让对象即使归还池中也持续响应外部事件。

对象池回收时建议提供统一重置接口：

```csharp
public interface IPoolable
{
    void OnSpawn();
    void OnDespawn();
}
```

在 `OnDespawn` 中清理：

- 外部事件订阅。
- Button 监听。
- 协程。
- Invoke。
- DOTween 或其他 Tween。
- Async/UniTask 取消令牌。
- 临时数据引用。
- 父节点、坐标、缩放、激活状态。

如果对象池只负责 `SetActive(false)`，而不负责生命周期清理，那它只能减少一部分分配，却可能隐藏更严重的状态污染和泄漏。

#### 5. 迭代器方法与 `yield return`：协程之外也会生成状态机对象

在 Unity 中，大家很熟悉协程会产生状态机对象。其实任何使用 `yield return` 的 C# 迭代器方法都会由编译器生成状态机类。调用这个方法时，会创建一个迭代器对象，用于保存当前执行位置、局部变量和状态。

```csharp
IEnumerable<Enemy> GetAliveEnemies()
{
    for (int i = 0; i < _enemies.Count; i++)
    {
        if (_enemies[i].IsAlive)
        {
            yield return _enemies[i];
        }
    }
}
```

这段代码很优雅，但每次调用 `GetAliveEnemies()` 都会创建迭代器对象。如果它出现在热路径中，仍然可能产生 GC Alloc。协程也是类似的，`IEnumerator` 方法启动时会产生状态机实例。`StartCoroutine(SomeRoutine())` 中的 `SomeRoutine()` 调用本身就创建了这个 IEnumerator 对象。

协程不应该被妖魔化。加载流程、引导流程、剧情流程、UI 动画、低频延迟操作都可以使用协程。问题在于高频创建协程，尤其是大量实体各自启动短生命周期协程。

坏例子：

```csharp
void Update()
{
    if (_isPoisoned)
    {
        StartCoroutine(ApplyPoisonOnce());
    }
}
```

如果条件持续为真，这会每帧启动新协程，生成大量状态机对象，还可能造成逻辑重复执行。

更合理的方式是用状态变量控制一次性启动，或把高频逻辑集中到 Tick 系统。

```csharp
private bool _poisonRoutineRunning;

void Update()
{
    if (_isPoisoned && !_poisonRoutineRunning)
    {
        StartCoroutine(PoisonRoutine());
    }
}

private IEnumerator PoisonRoutine()
{
    _poisonRoutineRunning = true;

    while (_isPoisoned)
    {
        ApplyPoisonDamage();
        yield return WaitCache.OneSecond;
    }

    _poisonRoutineRunning = false;
}
```

对于 `WaitForSeconds`，固定时间可以缓存。

```csharp
public static class WaitCache
{
    public static readonly WaitForSeconds OneSecond = new WaitForSeconds(1f);
    public static readonly WaitForSeconds HalfSecond = new WaitForSeconds(0.5f);
    public static readonly WaitForEndOfFrame EndOfFrame = new WaitForEndOfFrame();
    public static readonly WaitForFixedUpdate FixedUpdate = new WaitForFixedUpdate();
}
```

但要注意：缓存 `WaitForSeconds` 适合固定等待时长。如果等待时间是动态变量，例如技能 CD、网络重试间隔、动画时长，不应简单使用一个共享对象。可以根据项目需求设计有限缓存字典，但字典本身也有管理成本，且浮点数作为 key 可能导致缓存膨胀。

```csharp
// 谨慎使用：只适合少量离散等待值
private static readonly Dictionary<float, WaitForSeconds> WaitMap = new Dictionary<float, WaitForSeconds>();

public static WaitForSeconds GetWait(float seconds)
{
    if (!WaitMap.TryGetValue(seconds, out WaitForSeconds wait))
    {
        wait = new WaitForSeconds(seconds);
        WaitMap.Add(seconds, wait);
    }

    return wait;
}
```

这种缓存不要用于任意浮点输入，否则 `0.10001f`、`0.10002f`、`0.10003f` 会产生大量 key，最后缓存本身变成泄漏源。工业项目中更推荐预定义常用等待值，或者在高频逻辑中不用协程，改成统一计时器系统。

#### 6. async/await 与 UniTask：GC、生命周期和旧结果写回

虽然原稿主要讨论协程，但现代 Unity 项目中 async/await、Task、UniTask 也越来越常见。它们同样需要纳入 GC Alloc 治理。

C# async 方法通常会生成状态机。根据返回类型、await 对象、捕获上下文、异常路径等不同，可能产生不同程度的分配。标准 `Task` 在 Unity 热路径中通常不是零分配方案；UniTask 等库通过结构体任务和 PlayerLoop 集成降低了分配，但并不意味着所有写法都无成本。

更重要的是，异步问题不只是 GC。它还涉及生命周期。比如 UI 面板发起异步请求，请求回来时面板已经关闭或复用，如果没有取消和 owner 校验，旧结果可能写回新界面。

```csharp
private CancellationTokenSource _cts;

private void OnEnable()
{
    _cts = new CancellationTokenSource();
    LoadAsync(_cts.Token).Forget();
}

private void OnDisable()
{
    _cts.Cancel();
    _cts.Dispose();
    _cts = null;
}

private async UniTaskVoid LoadAsync(CancellationToken token)
{
    Data data = await DataService.LoadAsync(token);

    if (token.IsCancellationRequested)
    {
        return;
    }

    Refresh(data);
}
```

这类代码的重点不只是减少分配，而是让异步任务和对象生命周期绑定。对象池 UI、可复用 Item、弹窗、活动页签尤其需要这种治理。

从 GC 角度看，异步优化建议如下：

- 避免在每帧路径中创建 `Task`、async 状态机和 continuation。
- 高频等待优先使用集中 Tick、计时器轮或状态机，而不是大量 async 延迟。
- UI 和网络异步必须有取消令牌或 owner 校验。
- 避免 async Lambda 捕获大对象。
- fire-and-forget 必须有异常处理和生命周期归属。
- 对 UniTask 等第三方库的“零分配”承诺要按实际写法和 Profiler 验证。

工业化实践中，协程、async 和事件系统应该统一纳入“生命周期管理”主题，而不是只看 GC Alloc。很多线上 bug 都不是因为分配多，而是旧协程、旧异步、旧事件在对象回收后继续运行。

#### 7. 增量 GC：降低尖峰，不是消灭成本

Unity 当前的垃圾回收默认倾向于增量模式。Unity 官方文档说明，增量 GC 会把垃圾回收工作分散到多帧执行，而不是一次性停止主线程处理整个托管堆。Unity 使用 Boehm–Demers–Weiser 垃圾回收器，默认以增量方式运行；增量 GC 不会让垃圾回收总工作量变少，但能把工作摊到多帧，从而减少 Profiler 中明显的 GC spike。

这是一个非常关键的点：增量 GC 优化的是“暂停形态”，不是“分配行为”。

阻塞式 GC 的问题是明显的 Stop-The-World：当 GC 运行时，主线程暂停，直到 GC 扫描和回收完成。托管堆越大、存活对象越多、引用关系越复杂，暂停可能越明显。对于游戏来说，这种暂停很容易表现为一帧或多帧卡顿。

增量 GC 的思路是把标记阶段拆成多个小片段，在多帧中逐步完成。这样单帧卡顿降低，但 GC 总 CPU 工作仍然存在。Unity 文档也明确提到，增量模式不会让 GC 整体更快，只是把工作分散，并且会引入写屏障用于追踪引用变化。

写屏障可以理解为：当托管代码修改对象引用时，运行时需要记录这些变化，避免增量标记过程中漏掉新引用对象。这个机制保证正确性，但也会带来额外开销。如果某个项目在增量 GC 期间大量修改对象引用，可能导致 GC 标记工作反复被打断或需要重新扫描。Unity 官方也提示：当对象引用变化过多时，增量 GC 的标记阶段可能变得难以完成，写屏障也会影响托管代码性能。

因此，增量 GC 的正确理解是：

- 它通常能减少明显 GC 尖峰。
- 它不能减少 GC Alloc。
- 它不能减少托管对象数量。
- 它不能修复内存泄漏。
- 它可能增加引用写入相关的少量 CPU 成本。
- 它需要在目标设备上对比验证。

在大多数 Unity 项目中，启用增量 GC 是合理默认选择，尤其是曾经出现明显 GC spike 的项目。但如果项目本身几乎没有运行时分配，且脚本逻辑极度 CPU bound，可以对比开启和关闭后的性能差异。Unity 官方建议使用 Profiler 和 Profile Analyzer 对同一性能关键段分别采样比较，而不是凭感觉决定。

#### 8. 增量 GC 的配置与手动控制

在 Unity Player Settings 中，可以通过 `Use Incremental GC` 控制是否启用增量 GC。不同 Unity 版本和平台支持情况可能略有差异，Web 平台也存在不支持增量 GC 的限制。项目实际设置需要以目标 Unity 版本和目标平台文档为准。

除了 Player Settings，Unity 还提供 `UnityEngine.Scripting.GarbageCollector` API 用于更细粒度地控制 GC 行为。在新版本 Unity 文档中，可以通过 `GarbageCollector.GCMode` 切换模式，例如 Disabled、Manual，也可以使用 `GarbageCollector.CollectIncremental` 执行增量收集。`System.GC.Collect()` 则会执行一次完整阻塞式回收。

这些能力很强，但使用风险也很高。

禁用 GC 的典型收益是避免关键阶段出现 GC spike。典型风险是：禁用后不再回收无引用对象，托管堆只会增长。如果禁用期间仍有分配，内存会持续上升，最终可能 OOM 或被系统杀掉。Unity 官方也提醒，禁用 GC 要求非常谨慎的内存管理，理想情况下应在禁用前完成所需内存分配，并在禁用期间避免额外托管分配。

一个可能的使用场景是：

- 关卡加载前预分配战斗所需对象。
- 进入短时间性能关键段前禁用自动 GC。
- 关键段内严格禁止托管分配。
- 关键段结束后恢复 GC。
- 在安全时机执行一次回收。

伪代码如下：

```csharp
using UnityEngine.Scripting;

public sealed class CriticalSectionGcGuard
{
    public void Enter()
    {
        // 进入前必须确认后续阶段不会持续产生托管分配
        GarbageCollector.GCMode = GarbageCollector.Mode.Disabled;
    }

    public void Exit()
    {
        GarbageCollector.GCMode = GarbageCollector.Mode.Enabled;
        System.GC.Collect();
    }
}
```

但这不是普通项目应该随意使用的优化。它需要配套分配审计、压力测试、低端机验证和失败兜底。大多数项目只需要开启增量 GC，并通过减少 GC Alloc 来降低回收压力。

手动 `System.GC.Collect()` 的适用场景也很有限。比较合理的时机包括：

- 场景切换的黑屏或 Loading 界面。
- 大型资源卸载之后。
- 进入战斗前的准备阶段。
- 退出战斗后的结算阶段。
- 开发期内存测试和泄漏排查。

不合理的时机包括：

- `Update`、`LateUpdate`、`FixedUpdate`。
- 战斗技能释放中。
- 镜头运动中。
- UI 滚动中。
- 玩家输入响应路径。
- 网络消息高峰期间。

需要特别强调：`System.GC.Collect()` 不是“清内存按钮”。它只能回收不可达的托管对象。如果对象仍被静态字段、事件、单例、闭包、集合、协程、异步任务引用，手动 GC 也无法回收。滥用 `GC.Collect()` 只会制造卡顿，而不会解决引用泄漏。

#### 9. `Resources.UnloadUnusedAssets` 与 GC 的关系

Unity 资源内存和托管 GC 经常被混在一起讨论，但它们不是一回事。`System.GC.Collect()` 主要处理托管堆对象；`Resources.UnloadUnusedAssets()` 用于卸载不再使用的 Unity 资源。资源系统涉及原生内存、显存、AssetBundle、纹理、网格、音频等，不能简单等同于 C# 对象回收。

在场景切换中，常见流程可能是：

```csharp
IEnumerator SwitchScene(string sceneName)
{
    yield return SceneManager.LoadSceneAsync("Loading");

    // 释放旧场景中不再引用的资源
    yield return Resources.UnloadUnusedAssets();

    // 在 Loading 阶段进行托管回收
    System.GC.Collect();

    yield return SceneManager.LoadSceneAsync(sceneName);
}
```

这类流程需要结合项目资源管理方案调整。如果项目使用 Addressables 或自研资源系统，资源释放应优先遵循资源系统的引用计数和生命周期规则。不要指望 `UnloadUnusedAssets` 自动解决所有资源泄漏；如果业务层仍持有资源引用，资源依旧可能无法释放。

在工业项目中，推荐把“托管对象回收”和“资源卸载”分开观测：

- 用 CPU Profiler 和 Memory Profiler 看托管分配、GC Alloc、Managed Heap、托管对象引用链。
- 用 Memory Profiler、Frame Debugger、平台工具看纹理、网格、RenderTexture、AudioClip、Native Memory、Graphics Memory。
- 用资源系统日志看 AssetBundle、Addressables handle、引用计数、加载栈和释放栈。

只有分清内存类型，才能避免把所有内存上涨都错误归因于 GC。

#### 10. 托管堆增长：Alloc 降了，不代表内存没问题

GC Alloc 优化经常关注“每帧有没有分配”，但托管堆问题不止这一项。一个系统可能每帧分配很少，却长期持有对象，导致 Managed Heap 持续增长；也可能分配较多，但集中发生在加载阶段，玩家无感；还可能短期分配为 0，但对象池容量过大，导致常驻内存过高。

托管堆分析应该关注几个指标：

- 每帧 GC Alloc。
- GC 触发频率。
- 单次 GC Pause 或增量 GC 切片开销。
- Managed Heap Used Size。
- Managed Heap Reserved Size。
- 托管对象数量。
- 特定类型实例数量是否持续增长。
- 场景切换后对象是否回落。
- UI 反复打开关闭后 View、Item、Controller 是否残留。

例如，一个 UI 面板每次打开时创建 100 个 Item，关闭时只是 `SetActive(false)`，但没有清空数据引用，也没有归还池，反复打开关闭后 Item 数量持续增长。这种问题不是靠减少字符串拼接能解决的，而要查生命周期。

Memory Profiler 在这类问题上比 CPU Profiler 更有价值。CPU Profiler 可以告诉你“哪里分配了”，Memory Profiler 可以告诉你“谁还活着”以及“为什么还活着”。当看到某类对象数量持续增长时，应重点分析引用链：它被谁引用？是否来自静态字段？是否来自事件？是否来自闭包？是否来自缓存字典？是否来自对象池？是否来自异步任务？

一个成熟的排查流程如下：

1. 在基准状态采集 Memory Snapshot。
2. 执行可重复操作，例如打开关闭 UI 10 次、进入退出战斗 5 次、切换场景 3 次。
3. 再采集 Memory Snapshot。
4. 比较目标类型实例数量和 Managed Heap 增长。
5. 对异常增长类型查看引用链。
6. 修复引用释放、事件解绑、缓存清理、池回收。
7. 重复验证，确认对象数量能回落。

这比单纯盯着 GC Alloc 更接近真实项目的内存治理。

#### 11. `foreach`、LINQ、闭包的综合案例：目标筛选系统

下面用一个完整例子说明如何把本篇几个主题结合起来。

假设有一个技能系统，每帧要从敌人列表中筛选一定范围内血量最低的目标。初版代码可能这样写：

```csharp
Enemy FindTarget(Vector3 center, float radius)
{
    return _enemies
        .Where(e => e != null && e.IsAlive)
        .Where(e => Vector3.Distance(e.Position, center) <= radius)
        .OrderBy(e => e.Health)
        .FirstOrDefault();
}
```

这段代码的问题包括：

- `Where` 产生迭代器。
- Lambda 捕获 `center` 和 `radius`，可能产生闭包。
- `Vector3.Distance` 内部有平方根，CPU 成本不必要。
- `OrderBy` 为了找最小值做了完整排序，算法上浪费。
- `FirstOrDefault` 本身不大，但前面查询链已有成本。
- 如果每帧大量技能调用，会造成明显 GC 和 CPU 压力。

工业化写法应该避免排序，直接单次扫描找最优目标。

```csharp
Enemy FindTargetNoAlloc(Vector3 center, float radius)
{
    float radiusSqr = radius * radius;
    Enemy bestTarget = null;
    int bestHealth = int.MaxValue;

    for (int i = 0; i < _enemies.Count; i++)
    {
        Enemy enemy = _enemies[i];
        if (enemy == null || !enemy.IsAlive)
        {
            continue;
        }

        Vector3 offset = enemy.Position - center;
        if (offset.sqrMagnitude > radiusSqr)
        {
            continue;
        }

        if (enemy.Health < bestHealth)
        {
            bestHealth = enemy.Health;
            bestTarget = enemy;
        }
    }

    return bestTarget;
}
```

这个版本不仅减少 GC Alloc，还减少了算法复杂度和 CPU 成本。优化不是机械替换语法，而是重新审视数据流和算法目标：如果只需要最小值，就不应该排序；如果只需要范围判断，就不应该开平方；如果不需要保存中间结果，就不应该创建列表。

这就是工业化优化的核心：从业务意图出发，而不是从语法表面出发。

#### 12. UI 列表与闭包治理案例

UI 列表是 Unity 项目中最常见的 GC Alloc 热点之一。典型问题包括：

- 每次刷新重新创建 Item。
- 每个 Item 重新注册 Button Lambda。
- 文本每帧格式化。
- 滚动过程中反复 `ToList()` 或 `OrderBy()`。
- `OnClick` 捕获 data 对象导致旧数据无法释放。
- Item 回收到池中但未清理事件和引用。

低质量写法：

```csharp
void Refresh(List<ItemData> items)
{
    foreach (Transform child in _content)
    {
        Destroy(child.gameObject);
    }

    foreach (ItemData data in items)
    {
        GameObject go = Instantiate(_itemPrefab, _content);
        ItemView view = go.GetComponent<ItemView>();
        view.NameText.text = data.Name;
        view.Button.onClick.AddListener(() => OpenDetail(data));
    }
}
```

这段代码有大量问题：反复 Instantiate/Destroy，Button Lambda 捕获 data，旧监听可能没有清理，列表大时刷新卡顿明显。

更合理的写法：

```csharp
void Refresh(List<ItemData> items)
{
    _itemPool.ReleaseAll();

    for (int i = 0; i < items.Count; i++)
    {
        ItemView view = _itemPool.Get();
        view.Bind(items[i], this);
    }
}
```

ItemView：

```csharp
public sealed class ItemView : MonoBehaviour, IPoolable
{
    [SerializeField] private Button _button;
    [SerializeField] private TMP_Text _nameText;

    private ItemData _data;
    private ItemListPanel _owner;

    private void Awake()
    {
        _button.onClick.AddListener(OnClick);
    }

    public void Bind(ItemData data, ItemListPanel owner)
    {
        _data = data;
        _owner = owner;
        _nameText.text = data.Name;
    }

    private void OnClick()
    {
        if (_data == null || _owner == null)
        {
            return;
        }

        _owner.OpenDetail(_data.Id);
    }

    public void OnDespawn()
    {
        _data = null;
        _owner = null;
        _nameText.text = string.Empty;
    }

    private void OnDestroy()
    {
        _button.onClick.RemoveListener(OnClick);
    }
}
```

这里的核心思想是：监听只注册一次，不在每次绑定中创建闭包；数据通过字段更新；回收时清理引用；对象池负责生命周期。这样不仅降低分配，也降低旧数据串台和对象泄漏风险。

#### 13. GC Alloc 优化不要走向过度工程化

GC 优化很容易被做过头。比如为了避免一次低频 LINQ，把原本清晰的初始化代码写成复杂循环；为了避免一次加载阶段分配，引入难懂的对象池；为了追求“全项目零 GC”，让业务代码到处都是复用缓存和手写解析器；为了避免闭包，把所有 UI 逻辑写成大量样板类。

这些做法未必划算。性能优化有成本，代码复杂度也是成本。工业项目更看重收益和风险平衡。

可以按频率划分优化等级：

- 每帧执行：严格控制分配，默认零 GC 目标。
- 高频事件：如碰撞、网络消息、UI 滚动、战斗 Tick，必须预算化。
- 中频操作：如打开 UI、切换页签、背包排序，根据卡顿感和数据量优化。
- 低频操作：如进入场景、读取配置、初始化系统，可以接受合理分配。
- 开发工具：优先可读性和开发效率。

也可以按用户感知划分：

- 战斗中、操作中、镜头运动中：严格。
- Loading、黑屏、结算、过场：可以集中处理。
- 后台预处理：看设备余量和总时长。

所以，本文并不是要求你把 C# 写成 C。更好的目标是：关键路径清晰、可测、低分配；非关键路径可读、可维护；所有优化都有证据。

#### 14. 性能验收：不要只看 Editor，不要只看一帧

Unity Editor 的性能表现不能代表真机。Editor 会有额外开销、调试信息、编辑器对象、Domain Reload、Profiler 附加成本。GC Alloc 在 Editor 中更容易观察，但最终验收必须在目标平台和接近真实配置的 Player 中进行。

建议建立固定 GC 验收流程：

1. 冷启动进入主界面。
2. 登录后进入主城或大厅。
3. 主城待机 5 到 10 分钟。
4. 打开关闭常用 UI 10 次。
5. 快速滚动大型列表。
6. 进入战斗并待机。
7. 战斗高压场景：多怪、多特效、多技能、多 Buff。
8. 退出战斗回主城。
9. 切换场景或章节。
10. 重复上述流程 2 到 3 轮。

每个流程记录：

- 平均 FPS。
- P95/P99 帧时间。
- GC Alloc/frame。
- GC 触发次数。
- GC Pause 或增量切片耗时。
- Managed Heap Used。
- Managed Heap Reserved。
- Native Memory。
- Graphics Memory。
- 关键类型对象数量。

对于团队协作，可以设定预算：

```text
战斗运行中：目标 0B/frame GC Alloc，特殊机制需说明。
主城待机：目标 0B/frame，允许低频采样分配但需可解释。
大型列表滚动：不得持续分配，打开瞬间分配需在预算内。
UI 打开：允许一次性分配，但关闭后对象数量应回落或进入受控池。
场景切换：允许集中 GC 和资源卸载，但 Loading 时长需达标。
```

预算不是越苛刻越好，而是要符合目标设备和项目类型。动作游戏、AR/VR、竞技游戏对帧稳定性要求更高；回合制、卡牌、剧情游戏的部分路径可以更宽松。但无论什么项目，都需要“可测量”。

#### 15. 代码评审清单

为了让 GC 优化变成团队能力，而不是某个性能程序员的个人经验，可以在代码评审中加入以下检查项。

高频路径检查：

- `Update`、`LateUpdate`、`FixedUpdate` 中是否有 `new`？
- 是否有字符串拼接、插值字符串或格式化？
- 是否有 LINQ？
- 是否有捕获 Lambda？
- 是否有 `ToList()`、`ToArray()`、`Split()`、`Substring()`、`Replace()`？
- 是否调用返回数组的 Unity API？
- 是否使用了 NonAlloc 替代？
- 是否每帧创建协程、Task、委托或集合？

生命周期检查：

- 事件订阅是否解绑？
- 静态事件是否持有实例方法？
- 对象池回收是否清理状态？
- UI Item 是否清理数据引用？
- 协程是否在 Disable/Destroy 时停止？
- async 是否有取消令牌？
- 闭包是否捕获了面板、控制器、GameObject、Component？
- 缓存字典是否有清理策略？

集合与缓冲区检查：

- List/Dictionary 是否预设容量？
- 临时集合是否复用？
- 集合池是否存在归还后继续使用风险？
- 返回给外部的集合是否会被池回收？
- 缓冲数组大小不足时如何处理？
- NonAlloc 查询结果是否只遍历返回 count？

调优检查：

- 是否开启增量 GC？
- 是否比较过增量 GC 开关差异？
- 是否在目标设备 Profiler 验证？
- 是否有固定测试流程？
- 是否只在 Loading 等安全时机手动 GC？
- 是否错误依赖 `GC.Collect()` 解决泄漏？

这些清单看起来多，但一旦团队熟悉，就会变成自然习惯。GC 优化的最佳时机不是上线前专项救火，而是日常合入时就把风险挡住。

#### 16. 常见误区纠正

误区一：`foreach` 一定产生 GC。

不准确。对数组和 `List<T>` 直接 `foreach` 通常没有托管分配。真正要看集合类型、枚举器实现、接口装箱和运行环境。热路径使用 `for` 是稳妥策略，但不代表所有 `foreach` 都是错的。

误区二：LINQ 永远不能用。

不准确。LINQ 在 Editor 工具、初始化、低频逻辑中很有价值。问题是不要在热路径中使用会分配的 LINQ 查询链。

误区三：闭包只是一点 GC，不重要。

不准确。闭包更大的风险是延长对象生命周期，尤其在事件、UI、异步和对象池场景中可能导致整棵对象图泄漏。

误区四：增量 GC 开了就不用优化 GC Alloc。

错误。增量 GC 只是分散回收工作，减少尖峰，不减少分配，也不减少总工作量。持续分配仍然会造成 CPU 压力和堆增长。

误区五：`System.GC.Collect()` 可以解决内存泄漏。

错误。它只能回收不可达托管对象。只要对象仍被引用，就不会被回收。泄漏排查要看引用链。

误区六：对象池一定降低内存。

不准确。对象池减少分配和销毁，但会增加常驻对象。池容量过大、状态不清理、长期引用不释放，反而会增加内存压力。

误区七：Editor Profiler 看到没问题就代表真机没问题。

不准确。必须在目标设备和 Player 构建中验证，尤其是移动端、低端机、长时间运行和高压场景。

### 实现方案

#### 1. 建立分配分级标准

项目中所有代码路径都应按执行频率和用户感知划分等级。等级越高，GC Alloc 要求越严格。

建议标准如下：

```text
S 级：战斗 Tick、角色移动、镜头、输入、动画状态、技能结算、UI 滚动
目标：运行中 0B/frame，任何新增分配必须说明原因。

A 级：主城待机、网络消息处理、红点刷新、常驻 UI、实体管理
目标：不得持续分配，允许受控低频分配。

B 级：打开界面、切换页签、进入战斗、结算流程
目标：允许一次性分配，但要控制峰值并避免关闭后残留。

C 级：加载、初始化、导表、编辑器工具
目标：优先正确性和可读性，必要时控制总耗时和峰值内存。
```

这个分级的价值是让团队不再争论“某个语法能不能用”，而是先问“它在哪个路径用”。同一个 LINQ，在 Editor 导表里可以很好，在战斗 Tick 里就不合适。

#### 2. 为热路径提供无分配工具类

很多 GC Alloc 问题来自业务同学没有合适工具，只能临时写 LINQ、字符串拼接或 new 集合。性能治理不能只靠禁止，还要提供替代方案。

建议提供：

- `ListPool<T>`、`DictionaryPool<TKey,TValue>`。
- 固定容量临时缓冲区。
- 常用 `WaitForSeconds` 缓存。
- 无分配字符串格式化工具。
- UI Item 对象池基类。
- 事件订阅 owner 管理器。
- NonAlloc 物理查询封装。
- 目标选择、范围查询等战斗通用模块。

示例：临时 List 作用域封装。

```csharp
public readonly struct PooledListScope<T> : IDisposable
{
    public readonly List<T> List;

    public PooledListScope(List<T> list)
    {
        List = list;
    }

    public void Dispose()
    {
        List.Clear();
        ListPool<T>.Release(List);
    }
}
```

使用：

```csharp
using (PooledListScope<Enemy> scope = ListPool<Enemy>.GetScope())
{
    List<Enemy> buffer = scope.List;
    CollectTargets(buffer);
    ApplyTargets(buffer);
}
```

但集合池必须有规则：不得把池内集合保存到字段、不得跨帧使用、不得传给异步流程、不得返回给外部长期持有。否则会出现“归还后仍使用”的隐蔽 bug。

#### 3. 统一事件生命周期

建议项目事件系统支持 owner 绑定：

```csharp
_eventBus.Subscribe<PlayerLevelChanged>(this, OnPlayerLevelChanged);
_eventBus.UnsubscribeAll(this);
```

这样 UI 面板、系统模块、池化对象可以在 `OnDisable` 或 `OnDespawn` 中统一释放事件订阅，避免静态事件和全局总线持有短生命周期对象。

同时，代码规范中应明确：

- 不允许在需要解绑的地方直接使用匿名 Lambda，除非缓存委托实例。
- 静态事件订阅必须经过 owner 管理。
- 对象池对象每次回收必须解绑所有外部事件。
- UI Button 监听原则上 Awake 注册，OnDestroy 移除，Bind 不重复注册。

#### 4. 替换热路径 LINQ

对热路径中已存在的 LINQ，不要盲目全项目搜索替换，而应按 Profiler 热点排序。优先处理每帧执行、高实体数量、列表滚动、战斗查询、网络消息处理中的 LINQ。

替换策略：

- `Where + ToList` → 复用 List + for 筛选。
- `OrderBy + First` → 单次扫描找最小/最大。
- `Any` → for 循环遇到满足条件立即返回。
- `Count(predicate)` → for 循环计数。
- `Select` → 直接写入复用结果缓冲。
- `GroupBy` → 复用 Dictionary 分桶。

示例：

```csharp
bool HasAliveEnemy()
{
    for (int i = 0; i < _enemies.Count; i++)
    {
        Enemy enemy = _enemies[i];
        if (enemy != null && enemy.IsAlive)
        {
            return true;
        }
    }

    return false;
}
```

#### 5. 增量 GC 策略

默认建议启用增量 GC，并在目标设备上验证。如果项目是 CPU bound，且运行时几乎没有托管分配，可以做 A/B 测试：同一场景、同一设备、同一构建配置，分别开启和关闭增量 GC，使用 Profiler 和 Profile Analyzer 对比脚本耗时、GC spike、P95/P99 帧时间。

不要凭单帧截图做决定。至少采样完整流程：进入场景、运行 5 分钟、高压操作、退出场景。

对于手动 GC：

```csharp
IEnumerator CleanupAtLoadingScreen()
{
    // 先释放资源系统引用
    yield return AssetManager.UnloadUnusedAsync();

    // 再请求 Unity 卸载未使用资源
    yield return Resources.UnloadUnusedAssets();

    // 最后在 Loading 阶段进行托管回收
    System.GC.Collect();
}
```

手动 GC 必须只放在用户不会感知卡顿的阶段，并且要用 Profiler 验证总 Loading 时间是否仍达标。

#### 6. Profiler 验收流程

每次优化后都应进行对比，而不是只看代码“理论上更优”。推荐记录优化前后：

```text
场景：战斗待机 5 分钟
设备：目标低端机 / 中端机 / 高端机
构建：Release Player，Development Build 按需
指标：
- Average FPS
- P95 Frame Time
- P99 Frame Time
- GC Alloc/frame
- GC Collection Count
- Max GC Pause
- Managed Heap Used
- Managed Heap Reserved
- Native Memory
结论：
- 是否达到预算
- 是否引入 CPU 回退
- 是否增加常驻内存
- 是否影响代码复杂度
```

优化结果要看综合收益。有时为了减少几十字节 GC，引入复杂缓存，导致 CPU 更高、代码更难维护、bug 风险更大，并不值得。

#### 7. 文档化与团队规范

最终建议把本文内容沉淀成团队规范，而不是只作为教程存在。规范可以包含：

- Runtime 热路径编码规范。
- UI 生命周期规范。
- 对象池使用规范。
- 事件订阅规范。
- 协程和 async 生命周期规范。
- LINQ 使用边界。
- Profiler 验收模板。
- 常见 GC Alloc 来源表。
- Code Review 清单。

GC 优化一旦文档化，就能减少反复踩坑。性能治理最怕靠口口相传，因为人员变动、模块交接、需求压力都会让经验丢失。规范和工具才是工业化项目长期稳定的基础。

### 总结

本文系统重写并扩展了 Unity GC Alloc 优化技巧的下篇内容，重点从更高级、更隐蔽、更工程化的角度分析了运行时分配治理和 GC 调优方法。

首先，`foreach` 不应被简单视为一定产生 GC 的危险语法。真正需要关注的是集合类型、枚举器实现、接口装箱和运行路径。对数组和 `List<T>` 的直接遍历通常较安全，但在性能敏感路径中，`for` 循环仍然是最明确、最可控的选择。

其次，LINQ 的问题不在于语法优雅，而在于它经常在背后创建迭代器、委托、闭包和中间集合。它适合编辑器工具、导表、初始化和低频逻辑，但不适合战斗 Tick、UI 滚动、网络高频处理等热路径。热路径应使用显式循环、复用缓冲区和更贴合业务目标的算法。

再次，闭包和 Lambda 捕获变量不仅可能产生 GC Alloc，更可能延长对象生命周期。尤其是在 UI、事件、对象池、异步任务和全局消息系统中，闭包很容易让已经关闭或回收的对象仍然可达。事件订阅必须可解绑，UI 监听应尽量只注册一次，对象池回收时必须清理事件、协程、异步、Tween 和临时引用。

然后，本文澄清了增量 GC 的边界。增量 GC 能把垃圾回收工作分散到多帧，减少明显的 GC spike，但它不会减少总回收工作量，也不会减少 GC Alloc，更不会修复内存泄漏。它通常应该开启，但仍需在目标设备上验证。对于极特殊的性能关键段，可以考虑手动控制 GC，但必须建立严格的分配预算和安全退出流程。

同时，`System.GC.Collect()` 只适合 Loading、场景切换、资源卸载后等用户不敏感阶段，不应在运行时高频调用。它只能回收不可达托管对象，不能释放仍被引用的对象，也不能直接管理纹理、网格、显存和其他原生资源。

最后，GC Alloc 优化必须从技巧升级为工程体系。成熟项目需要分配分级标准、热路径编码规范、事件生命周期规则、对象池使用规范、Profiler 验收流程、Memory Profiler 引用链分析和性能回归机制。真正可靠的优化不是“看起来没有 new”，而是在目标设备、真实场景、固定流程下，证明帧时间稳定、托管分配受控、堆大小可回落、对象生命周期清晰。

GC 优化的最终目标不是追求形式上的“全项目零 GC”，而是在不牺牲架构清晰度和开发效率的前提下，让关键路径稳定、可控、可验证。对游戏开发来说，玩家不会关心代码里用了什么语法，但会立刻感受到卡顿、掉帧和输入延迟。工业化 GC 治理的价值，正是把这些风险提前控制在开发阶段，而不是等到上线前再被动救火。

## 元数据

- **创建时间：** 2026-04-24 23:00
- **最后更新：** 2026-04-24 23:00
- **作者：** 吉良吉影
- **分类：** 内存管理
- **标签：** Unity、GC、GC Alloc、增量 GC、性能优化、托管堆、Profiler、闭包、LINQ、foreach
- **来源：** 已有文稿整理

---

*文档基于与吉良吉影的讨论，由小雅整理*
