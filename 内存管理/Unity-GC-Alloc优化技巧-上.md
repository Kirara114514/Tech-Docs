# Unity GC 系列教程第三篇：GC Alloc 优化技巧与工程化实践（上）

## 摘要

本文面向 Unity 项目中的托管内存分配优化，系统梳理 GC Alloc 的常见来源、风险边界与工程化治理方法。GC Alloc 本质上不是“错误”，而是托管对象在堆上的分配行为；真正的问题通常发生在高频路径、生命周期复杂的系统、低端设备 CPU 预算紧张的场景，以及长期运行后堆增长与 GC 触发频率失控的项目中。

原稿中存在大量重复段落，也有部分表达容易造成误解，例如将所有字符串拼接都简单归因于装箱、将部分 Unity API 的 NonAlloc 用法写成仍会产生 ToArray 分配、将对象池描述为普遍最优策略而没有说明它带来的常驻内存、生命周期和状态残留风险。本文在保留“GC Alloc 优化技巧（上）”主题的基础上，重新组织为一篇更正式、更规范、更工业化的技术文档。

本文重点讨论以下内容：装箱与接口调用导致的隐性分配，字符串与 UI 文本更新的分配控制，集合容量、集合复用与集合池的使用边界，Unity API 中数组返回型接口与 NonAlloc 接口的选择，协程与等待对象的分配行为，对象池在高频短生命周期对象中的收益与风险，以及如何通过 Profiler、Memory Profiler、代码评审和性能预算建立持续可维护的 GC Alloc 优化流程。

本文的核心观点是：GC Alloc 优化不是简单追求“代码里没有 new”，也不是机械禁止 LINQ、字符串插值、协程或集合创建，而是要根据调用频率、对象生命周期、目标设备、业务场景和可维护性进行取舍。真正成熟的 Unity 项目会把 GC Alloc 优化纳入性能预算、代码规范、自动化检测和回归流程中，而不是等到卡顿暴露后再临时清理。

## 正文

### 背景

Unity 使用 C# 作为主要业务脚本语言时，大量游戏逻辑运行在托管环境中。开发者创建的类实例、字符串、数组、委托、闭包、迭代器状态机、协程状态机以及许多集合对象，都会进入托管堆。托管堆由垃圾回收器负责自动回收，这让业务开发免去了手动释放内存的负担，但也带来了一个在游戏开发中特别敏感的问题：垃圾回收发生时可能占用 CPU 时间，并造成帧时间波动。

在普通应用开发中，几十毫秒的 GC 暂停可能只是一次轻微延迟；但在游戏中，帧预算非常严格。60 FPS 下单帧预算约为 16.67 毫秒，30 FPS 下也只有约 33.33 毫秒。如果某一帧发生明显的托管分配峰值，随后触发 GC，游戏就可能出现肉眼可感知的卡顿。尤其在战斗、主城待机、角色移动、镜头跟随、UI 滚动、弹幕、伤害数字、网络消息处理等高频系统中，即使每帧只产生少量托管分配，长时间运行后也可能积累成稳定性问题。

GC Alloc 优化的目标，不是消灭所有分配，而是控制不必要的、持续性的、发生在关键路径上的分配。项目初始化、资源加载、界面首次打开、关卡切换等阶段存在一定托管分配通常是可以接受的，因为这些阶段本身就不是稳定帧率的核心区间。但如果 `Update`、`LateUpdate`、`FixedUpdate`、UI 列表滚动、战斗 Tick、寻路 Tick、动画事件、技能结算、网络包解析中持续产生 GC Alloc，就需要认真排查。

一个工业化项目的 GC Alloc 治理，通常遵循这样的顺序：

1. 先用 Profiler 确认分配位置，而不是凭经验猜测。
2. 区分高频分配、低频分配、一次性分配和生命周期泄漏。
3. 对热路径做定向优化，对非热路径保持代码可读性。
4. 对高频短生命周期对象使用缓存、复用或对象池。
5. 对集合、字符串、委托、闭包、协程等隐性分配建立代码规范。
6. 在目标设备上验证，而不是只在编辑器或高端 PC 上观察。
7. 建立性能预算和回归检测，防止后续提交重新引入持续分配。

这也是本文与普通技巧列表最大的区别：本文不会只罗列“坏代码”和“好代码”，而是会解释每一种优化手段背后的适用条件、风险和工程落地方式。因为在真实项目中，性能优化从来不是孤立代码片段的替换，而是架构、生命周期、工具链、团队规范共同作用的结果。

### 核心内容

#### 1. 正确认识 GC Alloc：它不是错误，而是一种需要被预算管理的成本

GC Alloc 指托管堆上的内存分配。只要创建了新的引用类型对象，或者某些语言特性在编译后生成了隐藏对象，就可能产生 GC Alloc。常见来源包括：

- `new` 一个类实例。
- 创建新数组。
- 创建新字符串。
- 使用返回数组的 Unity API。
- 装箱值类型。
- 创建委托或闭包。
- 创建协程迭代器状态机。
- 使用 LINQ 产生迭代器、闭包或临时集合。
- 调用 `ToArray()`、`ToList()`、`Split()`、`Substring()` 等返回新对象的方法。
- 频繁创建 `List<T>`、`Dictionary<TKey, TValue>`、`HashSet<T>` 等集合。
- 使用 `params` 参数时生成临时数组。
- 使用部分反射、序列化、格式化、日志拼接等功能。

但是，并不是所有 GC Alloc 都必须优化。比如进入游戏时构建配置表索引，打开背包时生成一次临时列表，加载场景时创建 UI 控件树，这些分配如果不会在稳定运行阶段持续出现，通常没有必要过度压榨。相反，一段每帧只分配 24 字节的代码，如果它存在于战斗主循环、100 个实体的 AI Tick 或每个 UI Item 的刷新逻辑中，就可能变成长期性能问题。

因此，判断 GC Alloc 是否需要优化时，应优先问四个问题：

- 它发生在哪个场景？
- 它的调用频率是多少？
- 它是否会持续发生？
- 它是否处于目标设备的性能关键路径？

如果答案是“高频、持续、关键路径”，就应该优化。如果答案是“低频、一次性、非关键路径”，则应谨慎优化，避免为了零分配牺牲代码可读性和开发效率。

#### 2. 装箱优化：重点关注接口、object、枚举、格式化和非泛型容器

装箱是值类型被当作引用类型使用时发生的操作。典型例子是把 `int`、`float`、`bool`、`enum`、`Vector3` 等值类型传给 `object` 参数，或者把结构体通过非泛型接口进行调用。装箱会在托管堆上创建一个对象副本，因此会产生 GC Alloc。

装箱最危险的地方在于它经常隐藏在“看起来没有 new”的代码里。例如：

```csharp
void LogValue(object value)
{
    Debug.Log(value);
}

void Update()
{
    int hp = 100;
    LogValue(hp); // int 被装箱
}
```

这里没有显式 `new`，但 `hp` 被传入 `object` 参数时会装箱。优化方式是使用泛型或明确重载：

```csharp
void LogValue<T>(T value)
{
    Debug.Log(value);
}

void LogValue(int value)
{
    Debug.Log(value);
}
```

不过也要注意，泛型不是万能免分配。泛型方法内部如果继续把值传给 `object`，仍然可能装箱；泛型约束、接口调用和虚调用也可能根据具体写法产生不同成本。工程上不应该只看方法签名，而应该结合 Profiler 或 IL 分析确认是否真的减少了分配。

非泛型集合也是经典装箱来源：

```csharp
ArrayList list = new ArrayList();
list.Add(100); // 装箱

Hashtable table = new Hashtable();
table["score"] = 100; // 装箱
```

在现代 Unity 项目中，应默认使用泛型集合：

```csharp
List<int> list = new List<int>();
Dictionary<string, int> table = new Dictionary<string, int>();
```

这不仅减少装箱，也提升类型安全性，降低运行时转换错误。

枚举也是常见隐患。枚举本身是值类型，如果频繁调用 `ToString()`、参与格式化、作为 `object` 参数传递，可能产生分配。UI 或日志中需要高频展示枚举名称时，可以预先建立映射：

```csharp
public enum BattleState
{
    None,
    Prepare,
    Fighting,
    Settlement
}

private static readonly string[] BattleStateNames =
{
    "None",
    "Prepare",
    "Fighting",
    "Settlement"
};

string GetBattleStateName(BattleState state)
{
    int index = (int)state;
    if ((uint)index >= BattleStateNames.Length)
        return "Unknown";

    return BattleStateNames[index];
}
```

这类写法简单、稳定、可控，适合高频展示。若枚举值不连续，则使用 `Dictionary<BattleState, string>` 或生成代码更安全。

需要特别说明的是，字符串拼接并不应该被粗暴地解释成“所有值类型都会装箱”。不同 C# 版本、不同编译器、不同重载选择下，字符串拼接可能被编译成不同形式，有时是 `string.Concat`，有时会调用 `ToString()`，有时会产生中间字符串，有时才涉及装箱。真正稳定的结论是：高频字符串构建会产生新字符串，可能伴随装箱或格式化分配，因此应避免在热路径中持续发生。

#### 3. 字符串优化：核心是减少高频新字符串，而不是盲目 StringBuilder 化

C# 的 `string` 是不可变对象。每一次拼接、替换、截取、格式化，通常都会生成新的字符串。UI 文本、日志、协议解析和调试信息是 Unity 项目中最常见的字符串分配来源。

例如：

```csharp
void Update()
{
    hpText.text = "HP: " + currentHp + "/" + maxHp;
}
```

这段代码的问题不只是可能有装箱，而是每帧都会构造新的字符串，并且赋值给 UI 文本后还可能触发 UI 网格重建。对于 UI 来说，GC Alloc 只是成本的一部分，文本变化导致的布局、网格和渲染更新也需要考虑。

更合理的做法是“值变化时刷新”：

```csharp
private int _lastHp = -1;
private int _lastMaxHp = -1;

void LateUpdate()
{
    if (_lastHp == currentHp && _lastMaxHp == maxHp)
        return;

    _lastHp = currentHp;
    _lastMaxHp = maxHp;

    hpText.text = BuildHpText(currentHp, maxHp);
}
```

如果确实需要频繁组合多个字段，可以复用 `StringBuilder`：

```csharp
private readonly StringBuilder _builder = new StringBuilder(64);

private string BuildHpText(int hp, int maxHp)
{
    _builder.Clear();
    _builder.Append("HP: ");
    _builder.Append(hp);
    _builder.Append("/");
    _builder.Append(maxHp);
    return _builder.ToString();
}
```

但这里要讲清楚：`StringBuilder.ToString()` 仍然会创建最终字符串。`StringBuilder` 的价值在于减少拼接过程中的多个中间字符串，而不是让最终文本完全零分配。对于 Unity UI 文本来说，只要最终要把内容赋给 `Text` 或 `TMP_Text` 的 `text`，通常就绕不开字符串对象。优化重点应放在减少刷新频率、减少中间对象、减少无意义格式化，而不是幻想 UI 文本更新完全没有成本。

字符串优化的常见策略包括：

- 高频 UI 文本只在数值变化时刷新。
- 倒计时、FPS、延迟等文本降低刷新频率，例如每 0.2 秒或 0.5 秒刷新一次。
- 对固定格式文本使用缓存或预生成。
- 对小范围整数显示使用字符串表，例如 0 到 9999 的数字缓存。
- 日志在发布版本关闭，且避免先拼接再判断日志等级。
- 避免在热路径中使用 `string.Format`、复杂插值、`Split`、`Replace`、`Substring`。
- 协议解析中优先使用索引扫描、Span 或字节流解析，而不是先切字符串数组。

例如，数字缓存适合伤害飘字、计数器、层数显示等场景：

```csharp
private static readonly string[] SmallNumberCache = BuildSmallNumberCache(10000);

private static string[] BuildSmallNumberCache(int count)
{
    var result = new string[count];
    for (int i = 0; i < count; i++)
        result[i] = i.ToString();
    return result;
}

public static string ToCachedString(int value)
{
    if ((uint)value < SmallNumberCache.Length)
        return SmallNumberCache[value];

    return value.ToString();
}
```

这类优化会增加常驻内存，因此只适合范围可控且调用极高频的场景。如果只是普通设置界面偶尔显示一个数字，完全没必要这样做。

文本解析也要谨慎。原稿提到 `Span<T>` 是一个方向，这个判断是对的，但落地时必须看 Unity 版本、脚本运行时、API 兼容级别和目标平台。较新 Unity 版本对现代 .NET 特性的支持更好，但团队仍应以项目实际版本为准。对于老项目或兼容性要求高的项目，手写索引扫描仍然是最稳定的方案。

```csharp
public static bool TryParsePositiveInt(string text, int start, int length, out int value)
{
    value = 0;

    if (string.IsNullOrEmpty(text))
        return false;

    if (start < 0 || length <= 0 || start + length > text.Length)
        return false;

    for (int i = 0; i < length; i++)
    {
        char c = text[start + i];
        if (c < '0' || c > '9')
            return false;

        value = value * 10 + (c - '0');
    }

    return true;
}
```

这段代码不创建子字符串，适合解析简单数字字段。缺点是代码比 `Substring + int.Parse` 更啰嗦，因此只应放在协议解析、配置热加载、日志采样等确实高频或大批量的路径中。

#### 4. 日志优化：发布版本中最容易被忽视的字符串分配源

很多项目的 GC Alloc 热点不是复杂算法，而是日志。尤其在战斗、网络、UI 刷新中，开发期为了排查问题加入了大量日志，后来只是关闭了日志输出，却没有避免字符串构建。

错误示例：

```csharp
void Update()
{
    DebugLog("Player position: " + transform.position + ", state: " + state);
}

void DebugLog(string message)
{
    if (!enableLog)
        return;

    Debug.Log(message);
}
```

即使 `enableLog` 为 false，调用 `DebugLog` 之前字符串已经构建完成，分配已经发生。更好的做法是把日志开关放在构建字符串之前：

```csharp
void Update()
{
#if ENABLE_BATTLE_LOG
    Debug.Log("Player position: " + transform.position + ", state: " + state);
#endif
}
```

或使用延迟构建：

```csharp
void DebugLog(Func<string> messageBuilder)
{
    if (!enableLog)
        return;

    Debug.Log(messageBuilder());
}

void Update()
{
    DebugLog(() => "Player position: " + transform.position + ", state: " + state);
}
```

但这里也有坑：`Func<string>` 和 Lambda 自身可能产生委托或闭包分配。如果日志开关关闭但每帧仍创建 Lambda，那又把问题换了个地方。因此在极高频路径中，条件编译通常比运行时委托日志更稳。

工业项目可以采用分层策略：

- 开发期：保留详细日志，允许一定分配。
- 测试期：通过宏控制模块日志。
- 发布期：默认剔除高频日志代码。
- 线上问题追踪：使用采样日志、环形缓冲、结构化事件，而不是每帧字符串拼接。
- 性能敏感模块：禁止在 Tick 内直接构建复杂日志字符串。

日志优化的关键不是“别打日志”，而是让日志成本与运行环境匹配。

#### 5. 集合优化：容量、复用、所有权和生命周期比语法更重要

`List<T>`、`Dictionary<TKey, TValue>`、`HashSet<T>` 是游戏业务代码中最常用的容器。集合本身不是问题，问题是高频创建、高频扩容、高频转换和不清晰的所有权。

##### 5.1 预设容量，避免隐式扩容

`List<T>` 内部基于数组。当容量不足时，会分配更大的数组并复制旧元素。这会产生托管分配和 CPU 拷贝成本。若已知数量，应在创建时给出容量：

```csharp
private readonly List<Entity> _visibleEntities = new List<Entity>(128);
```

对于 `Dictionary<TKey, TValue>`，容量也很重要。大量插入时如果不预设容量，会发生多次 rehash 和扩容：

```csharp
private readonly Dictionary<int, Entity> _entityMap = new Dictionary<int, Entity>(1024);
```

容量不是越大越好。容量过大意味着常驻内存增加，也可能让缓存局部性变差。实践中应根据场景上限、平均值和峰值设定。战斗内实体列表、UI Item 缓存、技能目标列表等都适合预估容量。

##### 5.2 使用 Clear 复用集合，但要理解 Clear 不等于释放内存

复用集合是减少 GC Alloc 的常见手段：

```csharp
private readonly List<Entity> _tempTargets = new List<Entity>(32);

void CollectTargets()
{
    _tempTargets.Clear();

    // 填充临时结果
    // ...

    for (int i = 0; i < _tempTargets.Count; i++)
    {
        Process(_tempTargets[i]);
    }
}
```

`Clear()` 会把 Count 置零，并视类型情况清理元素引用，但通常不会释放底层数组容量。这正是它适合复用的原因：下一次填充可以直接使用已有容量。但这也意味着，如果某次临时峰值把容量扩到很大，之后集合会长期持有这块数组。

所以集合复用还需要容量治理：

```csharp
private const int MaxRetainedCapacity = 256;

void ClearTempList(List<Entity> list)
{
    list.Clear();

    if (list.Capacity > MaxRetainedCapacity)
        list.Capacity = MaxRetainedCapacity;
}
```

这种写法适合偶发峰值明显的临时集合。缺点是调整 Capacity 本身可能分配新数组，因此不要每帧频繁做。一般可以在场景退出、界面关闭、战斗结束时修剪容量。

##### 5.3 避免 ToArray、ToList、LINQ 在热路径中制造临时集合

`ToArray()` 和 `ToList()` 会创建新容器并复制元素。它们适合 API 边界或不可变快照，不适合每帧调用。

错误示例：

```csharp
foreach (var entity in _entities.ToArray())
{
    entity.Tick();
}
```

如果目的是避免遍历期间集合被修改，应重新设计迭代流程，而不是每帧复制数组。常见方案包括：

- 使用待添加列表和待删除列表，Tick 结束后统一应用。
- 使用索引倒序遍历处理删除。
- 使用双缓冲列表。
- 对实体生命周期变更建立命令队列。
- 在迭代期间禁止直接修改主集合。

例如：

```csharp
private readonly List<Entity> _entities = new List<Entity>(512);
private readonly List<Entity> _pendingRemove = new List<Entity>(64);

void TickEntities()
{
    for (int i = 0; i < _entities.Count; i++)
    {
        Entity entity = _entities[i];
        entity.Tick();

        if (entity.IsDead)
            _pendingRemove.Add(entity);
    }

    for (int i = 0; i < _pendingRemove.Count; i++)
        _entities.Remove(_pendingRemove[i]);

    _pendingRemove.Clear();
}
```

如果删除很多，`Remove` 本身会有 O(n) 移动成本，此时可以使用 swap remove：

```csharp
static void RemoveAtSwapBack<T>(List<T> list, int index)
{
    int last = list.Count - 1;
    list[index] = list[last];
    list.RemoveAt(last);
}
```

这种方式不保持顺序，但性能更好。适合实体列表、目标缓存、临时碰撞结果等不要求顺序的容器。

##### 5.4 集合池不是万能药，所有权必须清晰

集合池可以减少临时集合分配，例如从池中取 `List<T>`，用完后归还。但集合池最大的问题不是性能，而是所有权。

危险示例：

```csharp
List<int> BuildResult()
{
    var list = ListPool<int>.Get();
    list.Add(1);
    list.Add(2);
    ListPool<int>.Release(list);
    return list; // 严重错误：返回了已归还对象
}
```

一旦集合归还到池中，调用方就不能再使用它。否则下一次别人取出这个 List 并 Clear，原调用方看到的数据会突然消失。这个 bug 非常隐蔽，往往比 GC Alloc 本身更危险。

集合池适合：

- 方法内部短生命周期临时列表。
- 同步流程内不会逃逸的缓冲。
- 不跨帧、不跨异步、不保存到字段的临时数据。
- 调用栈清晰、所有权明确的工具函数。

集合池不适合：

- 返回给外部长期使用的结果。
- 保存到字段等待下一帧处理。
- 传入异步任务或协程后继续使用。
- 暴露给 UI、网络、资源加载等生命周期复杂模块。
- 团队规范不足、容易误用的通用业务层。

更安全的集合池使用方式是用作用域封装：

```csharp
using (var scope = ListPool<Entity>.GetScope(out var tempList))
{
    CollectTargets(tempList);
    ProcessTargets(tempList);
}
```

这样可以通过 `Dispose` 自动归还，减少忘记释放。但即便如此，也不能把 `tempList` 保存到作用域之外。

#### 6. 对象池优化：减少创建销毁，但会增加常驻内存和生命周期复杂度

对象池是 Unity GC Alloc 优化中最常见的技术之一。它通过复用对象避免频繁创建和销毁，特别适合以下对象：

- 子弹。
- 技能特效。
- 伤害数字。
- 掉落物。
- 飘字。
- UI Item。
- 音效播放节点。
- 临时提示框。
- 战斗中的短生命周期逻辑对象。
- 网络消息对象或解析缓冲。

对象池的基本流程是：

1. 初始化时预创建一批对象。
2. 需要时从池中取出并激活。
3. 使用前重置状态。
4. 使用完毕后停用并归还。
5. 池容量不足时按策略扩容或拒绝创建。
6. 场景结束或模块卸载时清理池。

对象池的收益很明确：减少 `Instantiate`、`Destroy`、`new`、组件初始化、托管对象分配和部分原生对象管理成本。但对象池也带来几个工程风险：

- 池中对象长期存活，会增加常驻内存。
- 对象引用链长期存在，可能增加 GC 扫描成本。
- 归还时如果状态没清干净，会出现复用污染。
- 事件、委托、协程、Tween、异步任务未停止，会导致旧逻辑继续运行。
- 对象池容量设置不当会浪费内存或频繁扩容。
- 池化对象可能持有旧 owner、旧 target、旧配置，造成逻辑串线。
- 对象被重复归还或未归还，会造成池状态错误。

一个工业级对象池至少应该包含以下能力：

- 明确的 `OnSpawn` 和 `OnDespawn` 生命周期。
- 防止重复归还。
- 可配置初始容量和最大容量。
- 可选择是否允许动态扩容。
- 可统计当前使用数量、空闲数量、峰值数量。
- 场景退出时能统一释放。
- 对归还对象执行状态清理。
- 对异常使用有日志或断言。
- 对池容量有监控和调优依据。

简单接口可以设计为：

```csharp
public interface IPoolable
{
    void OnSpawn();
    void OnDespawn();
}
```

池化对象示例：

```csharp
public sealed class DamageText : MonoBehaviour, IPoolable
{
    private Transform _cachedTransform;
    private TMP_Text _text;
    private Tween _tween;
    private bool _active;

    void Awake()
    {
        _cachedTransform = transform;
        _text = GetComponent<TMP_Text>();
    }

    public void Setup(int damage, Vector3 worldPosition)
    {
        _cachedTransform.position = worldPosition;
        _text.text = DamageNumberCache.ToString(damage);
    }

    public void OnSpawn()
    {
        _active = true;
        gameObject.SetActive(true);
    }

    public void OnDespawn()
    {
        _active = false;

        if (_tween != null)
        {
            _tween.Kill();
            _tween = null;
        }

        _text.text = string.Empty;
        gameObject.SetActive(false);
    }
}
```

对象池管理器伪代码：

```csharp
class ObjectPool<T> where T : Component, IPoolable
{
    Queue<T> idle;
    HashSet<T> usingSet;
    T prefab;
    Transform root;
    int maxCount;

    T Rent()
    {
        T item = idle.Count > 0 ? idle.Dequeue() : CreateOrFail();
        usingSet.Add(item);
        item.OnSpawn();
        return item;
    }

    void Return(T item)
    {
        if (!usingSet.Remove(item))
        {
            LogError("重复归还或非本池对象");
            return;
        }

        item.OnDespawn();
        item.transform.SetParent(root);
        idle.Enqueue(item);
    }
}
```

实际项目中不一定要完全照这个写，但这些检查点非常重要。很多对象池 bug 的根源都是“只实现了复用，没有实现生命周期治理”。

对象池的验收指标也不只是 GC Alloc 降低。还应该观察：

- 池峰值是否稳定。
- 空闲对象是否过多。
- 场景退出后池是否清理。
- 复用后是否存在旧状态。
- 是否有重复归还。
- 是否有对象借出后永不归还。
- 是否因为池化导致内存常驻过高。
- 是否因为大量池对象长期存活导致 GC 扫描更慢。

一句话：对象池是性能工具，不是万物容器。它适合高频短生命周期对象，不适合所有对象。

#### 7. Unity API 优化：优先识别“返回新数组”的接口

Unity API 中很多接口为了易用性，会返回数组或新对象。只要 API 返回了新的数组，通常就意味着发生了托管分配。典型接口包括：

- `Physics.RaycastAll`
- `Physics.OverlapSphere`
- `Physics.OverlapBox`
- `Physics.OverlapCapsule`
- `GetComponents<T>()` 的数组返回版本
- `GetComponentsInChildren<T>()` 的数组返回版本
- `Camera.allCameras`
- `Input.touches`
- 部分资源查询、查找和路径相关接口

对于热路径，应优先使用 NonAlloc 或传入 List 的重载。

##### 7.1 物理查询使用 NonAlloc 缓冲

错误示例：

```csharp
void FixedUpdate()
{
    RaycastHit[] hits = Physics.RaycastAll(origin, direction, distance);
    for (int i = 0; i < hits.Length; i++)
    {
        Process(hits[i]);
    }
}
```

优化示例：

```csharp
private readonly RaycastHit[] _hitBuffer = new RaycastHit[16];

void FixedUpdate()
{
    int count = Physics.RaycastNonAlloc(origin, direction, _hitBuffer, distance, layerMask);

    for (int i = 0; i < count; i++)
    {
        Process(_hitBuffer[i]);
    }
}
```

注意事项：

- 只遍历返回的 count，不要遍历整个数组。
- 缓冲区太小会截断结果，需要根据业务上限设置。
- 命中顺序不要在没有确认文档和版本行为的情况下做强假设。
- 如果需要排序，排序本身也有成本，尽量复用比较器和缓冲。
- Unity 版本升级后要检查 API 是否有新推荐用法。

对于 Overlap：

```csharp
private readonly Collider[] _colliderBuffer = new Collider[32];

int count = Physics.OverlapSphereNonAlloc(position, radius, _colliderBuffer, layerMask);
for (int i = 0; i < count; i++)
{
    Collider collider = _colliderBuffer[i];
    Process(collider);
}
```

如果结果经常达到缓冲区上限，说明缓冲区可能偏小，或者查询范围过大。工业项目可以加入统计：

```csharp
if (count == _colliderBuffer.Length)
{
    // 采样告警：可能发生结果截断
}
```

##### 7.2 GetComponents 使用 List 重载或预分配数组，而不是 ToArray

原稿中有一处典型错误：先把 `List` 调用 `ToArray()` 再传入 NonAlloc。这样会先创建数组，优化就被抵消了。

错误示例：

```csharp
int count = GetComponentsNonAlloc(_cachedColliders.ToArray());
```

这段代码中的 `ToArray()` 本身就会产生 GC Alloc。

更合理的写法是使用 Unity 提供的 `GetComponents(List<T> results)` 重载：

```csharp
private readonly List<BoxCollider> _colliders = new List<BoxCollider>(8);

void RefreshColliders()
{
    GetComponents(_colliders);

    for (int i = 0; i < _colliders.Count; i++)
    {
        _colliders[i].enabled = false;
    }

    _colliders.Clear();
}
```

或者使用预分配数组版本，如果当前 Unity 版本和具体 API 支持：

```csharp
private readonly BoxCollider[] _colliderBuffer = new BoxCollider[8];

void RefreshColliders()
{
    int count = GetComponents(_colliderBuffer);

    for (int i = 0; i < count; i++)
    {
        _colliderBuffer[i].enabled = false;
    }
}
```

具体项目应以当前 Unity 版本的 API 为准。核心原则不变：不要在高频路径中调用返回数组的版本，不要为了调用 NonAlloc 又临时 `ToArray()`。

##### 7.3 缓存 GetComponent 结果，但不要神化缓存

`GetComponent<T>()` 通常不产生 GC Alloc，但它有查找成本。高频访问时应缓存：

```csharp
private Rigidbody _rigidbody;
private Animator _animator;

void Awake()
{
    _rigidbody = GetComponent<Rigidbody>();
    _animator = GetComponent<Animator>();
}
```

但也不要把所有低频 `GetComponent` 都视为罪恶。比如在 `Awake`、`Start`、初始化阶段、编辑器工具中偶尔调用，完全可以接受。优化重点永远是频率和路径。

##### 7.4 Camera.main 和 Camera.allCameras

`Camera.main` 语义上是查找带 MainCamera 标签的相机。现代 Unity 对它有一定优化，但在高频路径中反复调用仍没有必要。更稳定的做法是缓存：

```csharp
private Camera _mainCamera;

void Awake()
{
    _mainCamera = Camera.main;
}
```

如果主相机会动态切换，则应由相机管理器显式维护当前主相机引用，而不是每帧查询。

`Camera.allCameras` 返回数组，高频调用会产生分配。应使用可复用列表版本：

```csharp
private readonly List<Camera> _cameras = new List<Camera>(4);

void RefreshCameras()
{
    Camera.GetActiveCameras(_cameras);

    for (int i = 0; i < _cameras.Count; i++)
    {
        Process(_cameras[i]);
    }

    _cameras.Clear();
}
```

##### 7.5 Input.touches 与 Input.GetTouch

移动端触摸输入中，应避免在热路径中使用返回数组的 `Input.touches`。更推荐用 `Input.touchCount` 和 `Input.GetTouch(i)`：

```csharp
void Update()
{
    int count = Input.touchCount;

    for (int i = 0; i < count; i++)
    {
        Touch touch = Input.GetTouch(i);
        ProcessTouch(touch);
    }
}
```

这类写法简单且稳定，适合移动端输入系统。

#### 8. 协程优化：关注状态机、等待对象和生命周期

Unity 协程本质上会创建迭代器状态机对象。也就是说，启动协程本身通常就不是完全零成本。低频流程中这完全可以接受，例如资源加载、剧情播放、转场、引导流程、一次性延迟。但如果每帧大量启动短生命周期协程，就可能造成 GC Alloc 和调度成本。

##### 8.1 缓存固定等待对象

常见写法：

```csharp
IEnumerator Loop()
{
    while (true)
    {
        yield return new WaitForSeconds(1f);
        Tick();
    }
}
```

这里每次循环都会创建新的 `WaitForSeconds`。如果等待时间固定，可以缓存：

```csharp
private static readonly WaitForSeconds WaitOneSecond = new WaitForSeconds(1f);

IEnumerator Loop()
{
    while (true)
    {
        yield return WaitOneSecond;
        Tick();
    }
}
```

同理，`WaitForEndOfFrame`、`WaitForFixedUpdate` 等无参数等待对象也可以缓存。

但如果等待时间是动态的，就不能简单用一个静态对象覆盖所有时间。可以根据项目情况使用小型缓存表：

```csharp
private static readonly Dictionary<float, WaitForSeconds> WaitCache = new Dictionary<float, WaitForSeconds>();

public static WaitForSeconds GetWait(float seconds)
{
    if (!WaitCache.TryGetValue(seconds, out var wait))
    {
        wait = new WaitForSeconds(seconds);
        WaitCache.Add(seconds, wait);
    }

    return wait;
}
```

这类缓存要谨慎，因为 float 作为 key 可能出现大量不同值，导致缓存无限增长。更安全的是只缓存固定枚举式时间，例如 0.1、0.2、0.5、1.0 秒。

##### 8.2 不要在高频逻辑中反复 StartCoroutine

错误示例：

```csharp
void Update()
{
    if (needCheck)
        StartCoroutine(CheckSomething());
}
```

如果 `needCheck` 连续为 true，就会每帧启动新协程，造成状态机分配和逻辑叠加。应改为显式状态控制：

```csharp
private Coroutine _checkCoroutine;

void Update()
{
    if (needCheck && _checkCoroutine == null)
        _checkCoroutine = StartCoroutine(CheckSomething());
}

IEnumerator CheckSomething()
{
    while (needCheck)
    {
        DoCheck();
        yield return WaitOneSecond;
    }

    _checkCoroutine = null;
}
```

如果逻辑本质是每帧 Tick，协程未必比 Update 更好。对大量实体来说，集中式管理器 Tick 往往更可控：

```csharp
void Update()
{
    float deltaTime = Time.deltaTime;

    for (int i = 0; i < _systems.Count; i++)
        _systems[i].Tick(deltaTime);
}
```

##### 8.3 WaitUntil 和 WaitWhile 的隐性分配

`WaitUntil` 和 `WaitWhile` 通常会传入 Lambda：

```csharp
yield return new WaitUntil(() => IsReady);
```

这里会创建等待对象，也可能创建委托或闭包。如果低频使用没有问题；如果高频创建，需要改成显式循环：

```csharp
while (!IsReady)
    yield return null;
```

这段代码更朴素，但少了一个等待对象和委托。对于热路径更稳。

##### 8.4 协程的生命周期风险比 GC 更危险

协程优化不能只看 Alloc。更常见的事故是对象销毁或回收后，协程仍然继续执行，写回旧对象状态。

例如池化 UI Item 开启了协程，回收到池中后没有停止，几秒后协程继续执行，把旧数据写到新复用的 Item 上。这类 bug 在对象池场景中特别常见。

归还对象时应停止协程、取消 Invoke、Kill Tween、解绑事件：

```csharp
void OnDespawn()
{
    StopAllCoroutines();
    CancelInvoke();

    if (_tween != null)
    {
        _tween.Kill();
        _tween = null;
    }

    ClearState();
}
```

更稳的做法是协程内部保存版本号：

```csharp
private int _version;

public void OnSpawn()
{
    _version++;
}

IEnumerator DelayHide(int version)
{
    yield return WaitOneSecond;

    if (version != _version)
        yield break;

    Hide();
}
```

这样即使旧协程没有及时停止，也不会写回新状态。

#### 9. 委托、事件和闭包：小写法背后的大引用链

闭包是 C# 很方便的特性，但在 Unity 内存优化中，它既可能产生 GC Alloc，也可能延长对象生命周期。

典型例子：

```csharp
button.onClick.AddListener(() => OnClickItem(itemId));
```

这段代码会创建一个 Lambda，并捕获 `itemId`。如果这个监听没有在 UI Item 回收时移除，那么按钮、闭包、Item、面板甚至整个 ViewModel 都可能被引用链保住，导致 GC 无法回收。

在 UI 列表、对象池、事件总线、全局消息系统中，应特别谨慎使用闭包。更可控的写法是保存委托或使用显式初始化：

```csharp
private int _itemId;

void Awake()
{
    button.onClick.AddListener(OnClick);
}

public void SetData(int itemId)
{
    _itemId = itemId;
}

private void OnClick()
{
    OnClickItem(_itemId);
}

void OnDestroy()
{
    button.onClick.RemoveListener(OnClick);
}
```

对于池化对象，`OnDespawn` 中也应清理外部事件订阅：

```csharp
public void OnDespawn()
{
    EventBus.Unsubscribe<BattleEvent>(OnBattleEvent);
}
```

事件泄漏不一定表现为每帧 GC Alloc，但会造成对象数量越来越多、托管堆越来越大、GC 扫描越来越慢。很多团队只盯着 Alloc，却忽略了“仍可达对象”的泄漏，这是不完整的优化。

#### 10. LINQ 优化：不是全禁，而是从热路径移除

LINQ 的问题在于它可能创建迭代器、闭包、委托和临时集合。下面的代码非常易读：

```csharp
var aliveEnemies = enemies
    .Where(e => e.IsAlive)
    .OrderBy(e => e.DistanceToPlayer)
    .Take(3)
    .ToList();
```

在编辑器工具、配置处理、低频 UI 中，这样写完全可以接受。但在战斗 Tick 中，它可能制造大量分配和排序成本。热路径应改成显式循环和可复用缓冲：

```csharp
_tempEnemies.Clear();

for (int i = 0; i < enemies.Count; i++)
{
    Enemy enemy = enemies[i];
    if (enemy.IsAlive)
        _tempEnemies.Add(enemy);
}

_tempEnemies.Sort(_distanceComparer);

int count = Math.Min(3, _tempEnemies.Count);
for (int i = 0; i < count; i++)
{
    Process(_tempEnemies[i]);
}
```

这里 `_distanceComparer` 也应缓存：

```csharp
private readonly EnemyDistanceComparer _distanceComparer = new EnemyDistanceComparer();

private sealed class EnemyDistanceComparer : IComparer<Enemy>
{
    public int Compare(Enemy x, Enemy y)
    {
        return x.DistanceToPlayer.CompareTo(y.DistanceToPlayer);
    }
}
```

如果比较器中需要 player position，不要每次创建闭包，可以把上下文写入比较器字段：

```csharp
private sealed class EnemyDistanceComparer : IComparer<Enemy>
{
    public Vector3 Origin;

    public int Compare(Enemy x, Enemy y)
    {
        float dx = (x.Position - Origin).sqrMagnitude;
        float dy = (y.Position - Origin).sqrMagnitude;
        return dx.CompareTo(dy);
    }
}
```

再次强调：LINQ 不是洪水猛兽。它的问题是热路径中不透明的分配和成本。工程规范可以写成：

- Runtime 高频路径禁止 LINQ。
- 初始化、编辑器、工具链、低频逻辑允许 LINQ。
- 若使用 LINQ，避免 `ToList`、`ToArray` 在循环中出现。
- 对性能敏感模块，提交前必须用 Profiler 验证。

#### 11. params 参数与格式化 API：隐藏数组分配

`params` 参数很方便，但传入多个参数时通常会创建临时数组：

```csharp
void LogFormat(string format, params object[] args)
{
    // ...
}

LogFormat("hp={0}, mp={1}", hp, mp);
```

这里会创建 `object[]`，值类型还可能装箱。高频日志、事件派发、消息构造中要小心。

可以通过重载减少常见参数数量的分配：

```csharp
void LogFormat(string format, int arg0) { }
void LogFormat(string format, int arg0, int arg1) { }
void LogFormat(string format, string arg0) { }
```

不过这种优化会增加 API 复杂度。只有在日志、埋点、协议、UI 格式化等高频系统中才值得做。普通业务代码没必要为了避免一个低频 params 分配而写一堆重载。

#### 12. 结构体并非天然更优，避免“大结构体复制”和接口装箱

很多人为了减少 GC Alloc，会把 class 改成 struct。这个方向有时有效，但也有风险。

结构体优点：

- 可以避免堆分配。
- 适合小型值对象。
- 数组中连续存储，缓存局部性好。
- 适合数学类型、坐标、配置片段、轻量结果。

结构体风险：

- 大结构体传值会复制，CPU 成本高。
- 可变结构体容易产生语义错误。
- 装箱后仍会分配。
- 通过接口调用可能装箱。
- 放在集合中修改时容易改到副本。
- 过度结构体化会降低代码可读性。

适合 struct 的例子：

```csharp
public readonly struct DamageInfo
{
    public readonly int AttackerId;
    public readonly int TargetId;
    public readonly int Value;
    public readonly DamageType Type;

    public DamageInfo(int attackerId, int targetId, int value, DamageType type)
    {
        AttackerId = attackerId;
        TargetId = targetId;
        Value = value;
        Type = type;
    }
}
```

不适合 struct 的例子：

- 包含大量字段的复杂状态对象。
- 需要继承、多态、引用语义的对象。
- 生命周期独立、需要被多个系统共享引用的对象。
- 频繁作为接口传递的对象。
- 可变且容易被集合复制的对象。

优化 GC 时，不要简单地把 class 全改成 struct。真正要做的是区分值语义和引用语义。

#### 13. UI 列表与滚动视图：GC Alloc 高发区

UI 列表是商业项目中 GC Alloc 问题最密集的地方之一。原因包括：

- Item 高频创建和销毁。
- 每个 Item 绑定按钮闭包。
- 文本每次刷新都拼接字符串。
- 图标加载异步回调捕获 Item。
- 滚动时反复调用 LINQ 过滤排序。
- 列表刷新时 ToList/ToArray。
- Item 回收时事件和协程未清理。
- Layout 重建与文本网格重建交织在一起。

工业化 UI 列表应遵循：

- Item 使用对象池或虚拟列表。
- Item 只在数据变化时刷新。
- 按钮监听在 Awake 中绑定，数据通过字段更新。
- 异步加载图标时使用版本号避免旧结果写回。
- 文本尽量使用缓存格式。
- 列表数据排序过滤在外部完成，避免滚动时重复计算。
- Item 回收时清理 Tween、协程、事件、异步请求。
- 对大型列表建立滚动性能测试。

示例：

```csharp
private int _version;
private int _itemId;

public void SetData(ItemData data)
{
    _version++;
    _itemId = data.Id;

    nameText.text = data.Name;
    countText.text = NumberCache.ToString(data.Count);

    int loadVersion = _version;
    iconLoader.Load(data.IconKey, sprite =>
    {
        if (loadVersion != _version)
            return;

        icon.sprite = sprite;
    });
}

public void OnDespawn()
{
    _version++;
    icon.sprite = null;
    countText.text = string.Empty;
}
```

这里的版本号不仅是内存安全，也是 UI 正确性保障。

#### 14. 网络消息与协议解析：避免临时字符串和临时对象风暴

网络系统也是 GC Alloc 热点。常见问题包括：

- 每条消息创建多个临时对象。
- JSON 高频反序列化。
- 字符串 Split 解析协议。
- 每个字段都 Substring。
- 消息派发使用 object 参数导致装箱。
- 事件参数频繁 new。
- 回调闭包捕获上下文。
- 收包后 ToList 分发。

对高频网络消息，应考虑：

- 使用二进制协议或结构化缓冲。
- 对消息对象池化。
- 使用可复用读写缓冲。
- 避免每字段创建字符串。
- 消息分发使用强类型泛型。
- 高频状态同步只保留最新帧，不堆积对象。
- 对协议解析进行 Alloc 单元测试。

伪代码：

```csharp
public interface IMessageHandler<TMessage>
{
    void Handle(in TMessage message);
}

public readonly struct MoveMessage
{
    public readonly int EntityId;
    public readonly Vector3 Position;
    public readonly Vector3 Direction;
}
```

`in TMessage` 可以减少大结构体复制，但是否收益明显仍需测试。这里的核心是强类型、少装箱、少临时对象。

#### 15. Profiler 定位方法：没有测量就没有优化

GC Alloc 优化必须以数据为依据。常用观察维度包括：

- CPU Profiler 中的 GC Alloc 列。
- Timeline 中的 GC.Collect 或相关暂停。
- Memory 模块中的托管堆大小。
- Memory Profiler 中的托管对象数量和引用链。
- Deep Profile 下的分配调用栈。
- Development Build + Autoconnect Profiler 的真机表现。
- 长时间运行后的堆增长曲线。
- 关键场景每分钟 GC 次数。
- 每帧 Alloc 是否稳定为 0 或接近 0。

推荐测试流程：

1. 冷启动进入主界面。
2. 进入主城并待机 5 分钟。
3. 打开关闭常用 UI 20 次。
4. 滚动大型列表 1 分钟。
5. 进入战斗并持续战斗 5 分钟。
6. 高频释放技能和生成特效。
7. 场景切换 10 次。
8. 移动端真机测试低端设备。
9. 记录每个阶段的 GC Alloc、GC 次数、峰值暂停和托管堆大小。

分析时不要只看单帧。很多 GC 问题是长期累积后才显现。一个 UI 打开关闭一次没有问题，打开关闭 20 次后对象数量持续上涨，才说明存在引用泄漏。

#### 16. 性能预算：把“不要 GC”变成可执行指标

“不要产生 GC”是一句情绪化要求，不是工程指标。更好的方式是建立分场景预算：

- 战斗稳定运行：每帧 GC Alloc 应为 0 或接近 0。
- 主城待机：不得持续产生每帧分配。
- UI 打开：允许一次性分配，但关闭后对象数量应回落。
- 大型列表滚动：滚动过程中不得持续创建 Item 和闭包。
- 网络同步：每秒分配量不得超过预算。
- 日志关闭时：高频日志路径不得构建字符串。
- 场景切换：允许加载分配，但切换完成后堆应稳定。
- 长时间挂机：托管堆不得持续单调增长。

预算还应进入代码评审：

- 这段分配发生在哪个频率？
- 是否在 Update/FixedUpdate/LateUpdate？
- 是否在 UI Item 刷新中？
- 是否在战斗 Tick 中？
- 是否每次调用都会创建数组、字符串、闭包或集合？
- 是否可以通过缓存、复用、NonAlloc API 解决？
- 如果使用对象池，归还时是否清理状态？
- 如果使用集合池，集合是否会逃逸？
- 如果使用闭包，是否会延长生命周期？
- 如果使用协程，是否有停止和取消策略？

这类检查比机械禁止 `new` 更有价值。因为 `new` 出现在初始化阶段可能没问题，而没有 `new` 的闭包、装箱和 API 数组返回反而可能是热路径大坑。

### 实现方案

本节给出一套可落地的 GC Alloc 优化实施方案。它不是某一个工具类，而是一整套从定位、修复、规范到回归的流程。工业项目中，单点技巧只能解决局部问题；真正要让 GC Alloc 长期可控，必须把优化流程固化到团队开发方式中。

#### 阶段一：建立目标场景和性能基线

首先选择项目中最关键的运行场景。通常包括：

- 战斗核心循环。
- 主城或开放世界待机。
- 大型 UI 列表滚动。
- 背包、角色、任务、活动等复杂 UI 打开关闭。
- 高频技能释放和特效生成。
- 网络同步高峰。
- 场景切换和资源加载。
- 低端真机运行。

对每个场景记录：

- 平均 FPS。
- P95/P99 帧时间。
- 每帧 GC Alloc。
- 每分钟 GC 次数。
- 单次 GC 暂停峰值。
- 托管堆大小。
- 托管对象数量。
- 关键类实例数量。
- 长时间运行后是否增长。

只有先建立基线，后续优化才有方向。否则团队很容易陷入“我觉得这个写法不好”的争论，而不是用数据决策。

#### 阶段二：按调用频率分类 GC Alloc

将 Profiler 中看到的分配分为四类：

第一类是高频持续分配。例如每帧字符串拼接、每帧 `ToArray()`、每帧 `RaycastAll()`、每个 UI Item 刷新时创建 Lambda。这类必须优先优化。

第二类是中频交互分配。例如打开 UI 时生成临时列表、切换页签时创建视图模型、点击按钮时格式化文本。这类根据卡顿情况决定是否优化。

第三类是低频加载分配。例如进场景、读配置、初始化系统、构建缓存。这类通常允许存在，重点是避免泄漏。

第四类是泄漏型增长。例如 UI 关闭后 View 未释放，事件未解绑，对象池持有旧引用，静态字典不断增长。这类不一定表现为高 GC Alloc，但必须修复。

分类后，优先处理第一类和第四类。第二类看体验，第三类只做合理控制。

#### 阶段三：针对装箱建立编码规范

规范建议：

- 高频路径禁止把值类型传给 `object` 参数。
- 高频路径禁止使用非泛型集合。
- 事件参数避免使用 `object payload` 风格传值。
- 枚举高频转字符串应缓存。
- 日志、埋点、格式化 API 避免 `params object[]` 出现在热路径。
- 对结构体通过接口传递要谨慎。
- 对泛型方法内部是否再次装箱进行检查。

示例规范：

```csharp
// 不推荐
void Dispatch(int eventId, object arg);

// 推荐
void Dispatch<T>(int eventId, in T arg);
```

但规范不能脱离实际。泛型事件系统会增加复杂度，也可能带来 AOT、代码膨胀和调试难度。因此应优先用于高频模块，例如战斗事件、网络消息、实体组件消息，不一定要用于所有 UI 交互。

#### 阶段四：针对字符串建立刷新策略

字符串优化流程：

1. 找出每帧更新的文本。
2. 判断文本是否真的每帧变化。
3. 如果不是，改为值变化时刷新。
4. 如果变化频率高但显示不需要那么高，改为定时刷新。
5. 如果组合字段多，使用复用 StringBuilder。
6. 如果数字范围可控，使用数字字符串缓存。
7. 日志用条件编译或模块开关避免无效构建。
8. 协议解析避免 Split/Substring 风暴。

UI 示例：

```csharp
private int _lastGold = -1;

public void SetGold(int gold)
{
    if (_lastGold == gold)
        return;

    _lastGold = gold;
    goldText.text = NumberCache.ToString(gold);
}
```

倒计时示例：

```csharp
private int _lastSecond = -1;

void UpdateCountdown(float remainTime)
{
    int second = Mathf.CeilToInt(remainTime);

    if (_lastSecond == second)
        return;

    _lastSecond = second;
    countdownText.text = NumberCache.ToString(second);
}
```

这比每帧 `remainTime.ToString("F1")` 更稳定，也更符合用户视觉需求。

#### 阶段五：针对集合建立复用和池化边界

集合优化规范：

- 高频临时集合使用成员字段复用。
- 可预估大小的集合设置初始容量。
- 热路径避免 `ToArray()`、`ToList()`。
- 不要求顺序时使用 swap remove。
- 大型临时集合在场景结束时修剪容量。
- 集合池只用于同步短生命周期，不允许逃逸。
- 公共 API 不返回池化集合。
- 需要跨帧使用的集合由调用方持有，不从短生命周期池借用。

安全集合池伪代码：

```csharp
public readonly struct ListScope<T> : IDisposable
{
    private readonly List<T> _list;

    public ListScope(List<T> list)
    {
        _list = list;
    }

    public void Dispose()
    {
        _list.Clear();
        ListPool<T>.Release(_list);
    }
}
```

使用：

```csharp
using (ListPool<Entity>.Get(out var temp))
{
    Collect(temp);
    Process(temp);
}
```

实际实现中要处理嵌套、重复释放、最大容量、线程限制等问题。若团队经验不足，宁可先用成员字段复用，也不要过早引入全局集合池。

#### 阶段六：针对 Unity API 建立替代表

团队可以建立一张 API 替代表，写进代码规范：

| 场景 | 避免使用 | 推荐使用 |
| --- | --- | --- |
| 物理射线多结果 | `Physics.RaycastAll` | `Physics.RaycastNonAlloc` 或版本推荐的缓冲式接口 |
| 范围碰撞 | `Physics.OverlapSphere` | `Physics.OverlapSphereNonAlloc` |
| 获取组件列表 | `GetComponents<T>()` 数组返回 | `GetComponents(List<T>)` 或预分配数组重载 |
| 获取所有相机 | `Camera.allCameras` | `Camera.GetActiveCameras(List<Camera>)` |
| 移动端触摸 | `Input.touches` | `Input.touchCount + Input.GetTouch(i)` |
| 高频主相机访问 | 每帧 `Camera.main` | 缓存引用或相机管理器 |
| UI Item 创建 | 每次 Instantiate/Destroy | 对象池或虚拟列表 |
| 高频日志 | 拼接后再判断开关 | 条件编译或先判断再构建 |

替代表要随 Unity 版本更新。不要迷信旧经验，因为 Unity API 会演进。项目升级 Unity 后，应对这些规则进行一次复查。

#### 阶段七：对象池落地规范

对象池不是只写一个 `Queue<GameObject>`。建议至少规定：

- 每个池有清晰 owner。
- 每个池有初始容量和最大容量。
- 池对象必须实现重置接口。
- 借出对象不得重复借出。
- 归还对象不得重复归还。
- 归还时必须停止协程、Tween、Invoke、事件订阅。
- 池对象不得持有旧 owner、旧 target、旧回调。
- 场景退出时释放池。
- 统计峰值容量，用数据调整预热数量。
- 对象池不得掩盖泄漏。

池对象生命周期：

```csharp
public interface IPooledObject
{
    void OnRent();
    void OnReturn();
}
```

归还清理清单：

- `gameObject.SetActive(false)`
- 清空文本和临时引用。
- 重置 Transform 或挂回池根节点。
- 停止协程。
- 取消延迟调用。
- 停止 Tween。
- 解绑事件。
- 清除异步回调版本。
- 重置状态机字段。
- 清理粒子、动画、音效状态。

战斗对象、UI Item、特效对象最好分别有专用池，不要所有东西塞进一个万能池。专用池更容易统计和治理。

#### 阶段八：协程与异步生命周期治理

协程规范：

- 固定等待对象缓存。
- 高频逻辑不要反复创建协程。
- 对象回收时停止协程。
- 动态等待时间谨慎缓存，避免 float key 爆炸。
- `WaitUntil/WaitWhile` 不在热路径中频繁创建。
- 协程写回对象前检查 owner 是否仍有效。
- 池化对象使用版本号防止旧协程写回。

异步逻辑同理：

- 传递取消令牌。
- UI 关闭时取消请求。
- 对象池回收时递增版本。
- 异步回调返回时检查版本。
- 不使用无 owner 的 fire-and-forget 写业务状态。

伪代码：

```csharp
private int _version;

public void OnRent()
{
    _version++;
}

public void OnReturn()
{
    _version++;
}

async UniTaskVoid LoadIconAsync(string key, int version)
{
    Sprite sprite = await LoadSprite(key);

    if (version != _version)
        return;

    icon.sprite = sprite;
}
```

即使本文主题是 GC Alloc，也必须把生命周期写进去，因为很多“优化后出现的偶现 bug”都来自池化和异步生命周期没治理。

#### 阶段九：建立自动化和回归机制

人工看 Profiler 很重要，但大型项目还需要回归机制：

- 关键场景定期跑性能用例。
- 记录每帧 GC Alloc。
- 对新增持续分配发出告警。
- 对托管堆持续增长发出告警。
- 对 UI 打开关闭后的对象残留做快照对比。
- 对战斗 10 分钟后的 GC 次数做阈值检查。
- 对低端设备保留单独性能阈值。
- 在代码评审中标记 GC 风险点。

自动化不一定一开始就很复杂。哪怕只是每周固定录制一次 Profiler 数据，并记录关键指标，也比完全靠感觉强得多。

#### 阶段十：优化后的验收标准

一次 GC Alloc 优化是否成功，不应只看某一行代码 Alloc 变成 0。更完整的验收包括：

- 关键场景持续 GC Alloc 是否下降。
- GC 触发频率是否下降。
- 帧时间 P95/P99 是否改善。
- 托管堆峰值是否稳定。
- 长时间运行是否不再增长。
- 对象数量是否能回落。
- 代码可读性是否仍可接受。
- 是否引入对象池状态残留。
- 是否引入集合池逃逸问题。
- 是否在目标真机上有效。

如果优化让 Alloc 下降了，但代码复杂度大幅上升、Bug 增多、池对象状态频繁污染，那么这个优化就不算成功。性能优化的目标是提升产品稳定性，而不是制造维护灾难。

### 总结

GC Alloc 优化是 Unity 性能优化中非常重要的一环，但它绝不是简单的“看到 new 就删掉”。一篇可靠的 GC Alloc 优化文档，必须同时讲清楚分配来源、调用频率、生命周期、工具定位、团队规范和工程权衡。

本文重写后，主要修正和强化了以下内容：

第一，清理了原稿中的重复段落，去掉了多次出现的开头、标题、结尾和无效“实现方案”内容，让文章结构更清晰。

第二，修正了部分容易误导的表达。字符串拼接的主要问题是创建新字符串和中间对象，不应简单概括为所有情况都必然装箱；`StringBuilder.ToString()` 仍然会产生最终字符串；使用 NonAlloc API 时不能先 `ToArray()`；对象池不是普遍最优方案，它会增加常驻内存和生命周期复杂度。

第三，将优化技巧从零散代码片段升级为工程化方法。装箱、字符串、集合、Unity API、协程、闭包、LINQ、日志、UI 列表、网络消息等问题，都不应孤立处理，而应结合 Profiler 数据、调用频率和目标设备来判断优先级。

第四，强调了生命周期治理。很多 GC 问题不是分配太多，而是对象仍然可达，无法被回收。事件未解绑、闭包捕获、协程未停止、对象池未清状态、集合池逃逸，都会让内存问题变得更隐蔽。

第五，提出了性能预算和回归流程。成熟项目不应只靠开发者自觉避免 GC Alloc，而应把关键场景的分配预算、Profiler 检查、代码评审清单和自动化回归纳入研发流程。

最终可以形成一个简单但非常实用的判断原则：

- 初始化阶段的合理分配，可以接受。
- 高频路径的持续分配，需要优化。
- 生命周期不清晰的引用，需要排查。
- 没有 Profiler 数据的优化，不应盲目推进。
- 降低 Alloc 但破坏可维护性的方案，需要重新评估。
- 对象池、集合池、缓存等优化工具，必须配套所有权和清理规范。

GC Alloc 优化真正追求的不是“表面零分配”，而是让游戏在目标设备上长期稳定运行，让关键场景的帧时间可控，让内存曲线可解释，让团队代码在迭代中不反复引入同类问题。做到这一点，才算从技巧层面的优化，进入了工业化性能治理。

## 元数据

- **创建时间：** 2026-04-24 23:00
- **最后更新：** 2026-04-24 23:00
- **作者：** 吉良吉影
- **分类：** 内存管理
- **标签：** Unity、GC、GC Alloc、性能优化、托管内存、对象池、字符串优化、集合复用、协程优化、工业化开发
- **来源：** 基于原稿《GC Alloc优化技巧（上）》重写整理

---

*文档基于与吉良吉影的讨论，由小雅整理*
