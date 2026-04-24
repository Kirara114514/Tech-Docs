# Unity GC 系列教程第二篇：Unity 中常见的 GC Alloc 场景与分析工具

## 摘要

本文是 Unity GC 系列教程的第二篇，主题是 **GC Alloc 的典型产生场景与分析工具链**。第一篇已经解释了 GC 的基础概念、托管堆、可达性分析以及 GC 暂停对游戏帧稳定性的影响；本文进一步进入工程实践层面，系统梳理 Unity 项目中最常见、最隐蔽、最容易在版本迭代中反复出现的托管堆分配来源，并建立一套从发现问题、定位调用栈、确认对象类型、判断影响范围，到形成优化结论的完整分析流程。

需要特别强调的是，GC Alloc 本身不是“错误”，也不是所有分配都必须消灭。游戏项目中一定会存在托管对象、字符串、数组、委托、集合、异步状态机、协程状态机以及编辑器工具对象。真正需要治理的是那些发生在高频路径、关键玩法循环、UI 滚动刷新、战斗结算、网络包处理、日志采样、输入处理和物理检测中的持续性分配。也就是说，GC 优化的核心不是机械地禁止 `new`，而是识别“在哪些场景下分配会积累成帧时间抖动”，并用可测量、可复现、可回归的方式处理它。

本文将对装箱、字符串操作、集合扩容与复制、Unity API 返回数组、物理查询、输入 API、协程等待对象、闭包、委托、LINQ、日志、UI 文本、反射、序列化、异步任务等常见 GC Alloc 来源进行逐项分析。同时，本文也会深入说明 Unity Profiler、CPU Usage 模块、GC Alloc 列、Call Stacks、Memory 模块、Memory Profiler、快照比较、ProfilerRecorder、Profile Analyzer 等工具的使用方式。最终目标是让开发者不仅知道“哪里可能分配”，更知道“如何证明它真的分配、如何判断它是否值得优化、如何在团队中长期防止回归”。

## 正文

### 背景

在 Unity 项目中，GC Alloc 是一个经常被提起但也经常被误解的指标。许多性能问题排查会从 Profiler 中看到 `GC.Alloc` 开始，于是开发者很容易形成一种简单判断：只要看到分配就是问题，只要代码里出现 `new` 就应该改掉，只要开启 Incremental GC 就能解决卡顿。这些判断都过于粗糙，甚至会把项目带向错误的优化方向。

首先，GC Alloc 代表的是托管堆上的内存分配。C# 中的引用类型实例、数组、字符串、委托、闭包对象、部分迭代器对象、协程状态机和异步状态机通常会进入托管堆，由垃圾回收器管理生命周期。值类型则不等于“永远不分配”：局部值类型可能被放在栈上，也可能被寄存器优化，作为类字段时会成为堆对象的一部分，作为数组元素时会存储在托管数组内部；当值类型被装箱、通过接口或 `object` 使用，或者被某些 API 包装时，也可能产生托管堆分配。因此，“值类型无 GC、引用类型有 GC”只能作为入门理解，不能作为工程判断标准。

其次，GC Alloc 与 GC Pause 不是一回事。GC Alloc 是分配行为，GC Pause 是垃圾回收执行过程中可能带来的暂停或切片成本。持续分配会提高 GC 被触发的概率，也会增加托管堆的扫描压力，但某一帧发生了分配并不意味着这一帧必然发生 GC。反过来，一次 GC 暂停也可能是过去很多帧的分配积累造成的。分析 GC 问题时，如果只盯着某一帧的 `GC.Alloc` 数字，而不看长期堆增长、GC 触发频率、对象存活数量、引用链和目标设备表现，就容易误判。

第三，Unity 的内存并不只有托管内存。纹理、网格、音频、动画、RenderTexture、ComputeBuffer、NativeArray、AssetBundle、Addressables 缓存和引擎内部对象常常位于原生内存或显存侧。托管 GC 无法直接回收这些资源。一个 `Texture2D` 的 C# 包装对象可能很小，但它背后的原生纹理和显存占用可能很大；一个 UI 面板关闭后，如果只是托管对象被释放，但原生资源仍被资源系统引用，内存依然不会下降。反过来，原生资源被卸载后，托管层仍有引用，也可能导致包装对象继续存活。因此，GC Alloc 分析必须和整体内存分析区分开：GC Alloc 主要处理托管分配与回收压力，资源内存问题需要结合资源生命周期工具和 Memory Profiler 判断。

第四，Unity Editor 中的分配数据不能完全代表真机或 Player。编辑器环境会引入检查器、序列化、编辑器回调、域重载、EditorOnly 逻辑、调试符号和额外工具开销。Unity 官方文档也提醒，Profiler 数据最好在目标平台的 Development Build 上采集，因为 Editor 与构建后的 Player 行为可能不同。比如某些 API 在 Editor 中会出现额外分配，但在构建版本中不一定存在。因此，工程化的 GC 分析必须区分“编辑器开发体验问题”和“玩家侧性能问题”。

在成熟项目中，GC Alloc 分析不是一次性行为，而是稳定性治理的一部分。战斗运行、主城待机、UI 高频刷新、角色换装、背包滚动、技能释放、弹幕生成、网络同步、剧情播放、资源加载和场景切换等流程，都应该有固定的性能测试用例和分配预算。团队需要明确哪些场景允许一次性分配，哪些场景必须接近零分配，哪些分配属于可接受的初始化成本，哪些分配会造成长期帧抖动。本文的重点，就是把这些散落的经验系统化，形成可以长期复用的分析框架。

### 核心内容

#### 1. GC Alloc 的准确含义

GC Alloc 可以理解为“托管堆上发生了一次或多次由 GC 管理的内存分配”。在 Unity Profiler 中，`GC.Alloc` 标记表示当前采样路径中产生了托管分配。这个指标通常以字节为单位展示，例如某个函数在一帧内产生了 40 B、120 B、1.2 KB 或更大的分配。

但是，GC Alloc 的含义需要拆开看。

第一，它表示分配发生过，不表示对象一定马上变成垃圾。一个新创建的对象可能会长期存活，比如某个管理器、配置表、UI 面板、缓存字典或事件委托。它也可能很快不可达，比如临时字符串、临时数组、LINQ 迭代器、闭包对象和日志格式化结果。GC 只会回收不可达对象；仍然被引用的对象不会因为“业务上不需要”而自动消失。

第二，它表示托管分配，不表示所有内存增长。原生资源、显存、Native Container、插件侧内存、引擎内部缓存等不一定显示为 GC Alloc。一个项目没有明显 GC Alloc，不代表整体内存健康；一个项目有少量 GC Alloc，也不代表一定会卡顿。GC Alloc 是一个很重要的性能线索，但不是内存问题的全部答案。

第三，它通常需要结合频率判断。一次性分配 200 KB 如果发生在 Loading 阶段，用户可能完全无感；每帧分配 200 B 如果持续一小时，就可能不断制造垃圾，导致周期性 GC。GC 优化最怕“单次很小、频率极高、持续时间很长”的分配，因为这种分配常常不会在功能测试中显眼，却会在低端机和长时间运行中暴露为帧时间抖动。

第四，它需要结合帧预算判断。60 FPS 的单帧预算约为 16.67 ms，30 FPS 的单帧预算约为 33.33 ms。如果某次 GC 或 GC 切片占用了关键帧的额外 CPU 时间，就可能破坏帧稳定性。即使增量 GC 把一次大暂停拆成多帧执行，如果项目本身每帧 CPU 余量不足，增量切片仍会带来抖动。因此，GC Alloc 分析最终服务于帧时间稳定性，而不是服务于“数字洁癖”。

#### 2. 值类型、引用类型与托管堆边界

很多文章会说“值类型在栈上，引用类型在堆上”，这句话适合作为入门直觉，但不适合做严谨文档。更准确的表述是：值类型表示数据本身，引用类型表示对象引用；值类型的实际存储位置取决于它出现的位置和运行时优化。

例如：

```csharp
struct DamageInfo
{
    public int AttackerId;
    public int TargetId;
    public float Value;
}

class BattleEvent
{
    public DamageInfo Damage;
}
```

`DamageInfo` 是值类型。如果它作为局部变量使用，运行时可能把它放在栈上或寄存器中；如果它作为 `BattleEvent` 的字段，那么它的数据会内嵌在 `BattleEvent` 这个托管对象中；如果创建 `DamageInfo[]`，数组本身是托管堆对象，数组元素是连续存储在数组对象内部的值类型数据；如果把 `DamageInfo` 赋给 `object`，它会发生装箱，产生一个新的托管对象。

因此，排查 GC Alloc 时不能只看类型定义，还要看使用方式。以下情况更容易产生托管分配：

```csharp
object box = damageInfo;                    // 装箱
IComparable comparable = score;             // 可能装箱
var array = new DamageInfo[128];             // 数组对象分配
var list = new List<DamageInfo>(128);        // List 对象和内部数组分配
Action action = () => Debug.Log(score);      // 捕获 score 时产生闭包
```

而以下情况通常不会因为值类型本身产生独立 GC Alloc：

```csharp
int hp = 100;
float delta = Time.deltaTime;
Vector3 position = transform.position;
DamageInfo info;
info.Value = 50;
```

不过，“不产生 GC Alloc”不等于“没有成本”。例如频繁访问 `transform.position` 可能没有 GC，但仍有引擎调用成本；大结构体按值传递可能没有 GC，但会产生拷贝成本；过度追求值类型也可能导致代码可维护性下降。工业化优化的关键是平衡，而不是把所有对象都改成结构体。

#### 3. 装箱：最隐蔽的值类型分配

装箱是值类型被当作引用类型使用时发生的包装过程。运行时会在托管堆上创建一个对象，把值类型的数据复制进去，使它能够以 `object` 或接口形式被使用。装箱的单次成本通常不大，但它经常隐藏在日志、格式化、接口调用、非泛型集合、枚举和委托调用中，极其适合制造“看起来无害”的每帧小分配。

常见装箱场景包括：

```csharp
int score = 100;

object value = score;                    // 明确装箱
Debug.LogFormat("Score: {0}", score);    // 取决于重载和运行时，可能涉及装箱或参数数组
ArrayList list = new ArrayList();
list.Add(score);                         // 非泛型集合接收 object
IComparable c = score;                   // 值类型转接口可能装箱
```

需要修正一个常见误区：字符串拼接并不总是简单地“把值类型装箱成字符串”。不同 C# 版本、不同编译器、不同表达式形式会生成不同代码，可能调用 `string.Concat`、`ToString`、插值字符串处理器或格式化方法。最终结果一定会产生新的字符串，但值类型是否装箱要看具体实现。因此，在正式文档中，不应把所有 `"Score:" + score` 都粗暴描述为“必然装箱”。更准确的说法是：这种写法通常会产生新的字符串对象，在高频路径中容易制造 GC Alloc；若涉及 `object` 参数、格式化参数数组或接口调用，还可能额外发生装箱。

优化装箱的基本原则是：优先使用泛型 API，避免把值类型放进 `object`，避免在热路径中使用非泛型集合，日志和 UI 文本要单独治理。示意伪代码如下：

```csharp
// 风险写法
void PushValue(object value)
{
    buffer.Add(value);
}

PushValue(100);

// 更安全的方向
void PushValue<T>(T value)
{
    typedBuffer.Add(value);
}
```

对于枚举，也要谨慎。`Enum.ToString()` 本身可能分配字符串，频繁用于 UI 和日志时会制造持续分配。工业项目通常会为高频枚举建立字符串缓存：

```csharp
static readonly string[] StateNames =
{
    "Idle",
    "Move",
    "Attack",
    "Dead"
};

string GetStateName(CharacterState state)
{
    return StateNames[(int)state];
}
```

这种优化不是为了显得“高级”，而是为了避免在战斗 HUD、状态同步、调试面板和日志采样中反复创建相同字符串。

#### 4. 字符串：UI、日志和协议解析中的高发区

`string` 是不可变引用类型。每一次创建、拼接、截取、替换、分割和格式化，都可能产生新的字符串对象。字符串问题在 Unity 中非常常见，因为游戏有大量 UI 文本、调试日志、网络消息、配置解析、路径拼接、资源 key、对象命名和编辑器工具。

常见高风险写法如下：

```csharp
void Update()
{
    hpText.text = "HP: " + currentHp + "/" + maxHp;
    fpsText.text = $"FPS: {fps}";
    Debug.Log("Player position: " + transform.position);
}
```

这些写法的问题不是“不能用”，而是“不能在高频路径无脑用”。如果 UI 文本每帧刷新，即使数值没有变化也重新构造字符串，就会持续产生托管分配，还可能触发 TextMeshPro 或 UGUI 的布局、网格重建和脏标记传播。GC 只是其中一部分成本。

更工业化的做法是：只在值变化时更新文本，降低刷新频率，并缓存格式化过程。

```csharp
int lastHp = -1;
int lastMaxHp = -1;

void RefreshHpIfNeeded(int hp, int maxHp)
{
    if (hp == lastHp && maxHp == lastMaxHp)
        return;

    lastHp = hp;
    lastMaxHp = maxHp;
    hpText.SetText("HP: {0}/{1}", hp, maxHp);
}
```

对于 TextMeshPro，`SetText` 的数值重载通常比先构造字符串再赋值更适合高频数值展示。当然，实际是否分配仍应以目标 Unity 版本和 Profiler 数据为准。对于 UGUI Text 或自定义文本系统，可以使用 `StringBuilder`、缓存字符串表、分级刷新等方案。

日志也是典型问题。下面的代码即使最终日志级别关闭，字符串也可能已经拼接完成：

```csharp
Log.Debug("enemy count = " + enemies.Count + ", frame = " + Time.frameCount);
```

更合理的方式是把日志构造延迟到日志系统确认需要输出之后，或者通过条件编译在发布环境移除高频日志：

```csharp
#if DEVELOPMENT_BUILD || UNITY_EDITOR
if (Log.Enabled(LogLevel.Debug))
{
    Log.DebugFormat("enemy count = {0}, frame = {1}", enemies.Count, Time.frameCount);
}
#endif
```

协议解析也要谨慎。`Split`、`Substring`、`Replace` 和正则表达式非常方便，但在热路径中很容易产生大量临时字符串和数组。对于高频网络包、战斗回放、日志流、CSV 运行时解析，应优先考虑字节流解析、索引扫描、`ReadOnlySpan<char>` 支持范围内的无拷贝解析，或者在加载期一次性转换成结构化数据。

#### 5. 集合：扩容、复制、枚举和生命周期

集合是游戏逻辑最常用的数据结构，也是 GC Alloc 的高发区。常见分配来源包括：创建集合对象、内部数组扩容、调用 `ToArray` / `ToList`、LINQ 产生迭代器、字典 rehash、临时结果集合、集合池错误使用等。

先看一个典型例子：

```csharp
void Update()
{
    List<Enemy> visibleEnemies = new List<Enemy>();

    foreach (var enemy in allEnemies)
    {
        if (enemy.Visible)
            visibleEnemies.Add(enemy);
    }

    Process(visibleEnemies.ToArray());
}
```

这段代码至少有两个问题：每帧创建新的 `List<Enemy>`，并且每帧调用 `ToArray()` 创建数组。如果敌人数量多，或者这个逻辑运行在多个系统中，GC Alloc 会快速积累。

更好的方向是复用集合并避免不必要的复制：

```csharp
readonly List<Enemy> visibleEnemies = new List<Enemy>(128);

void UpdateVisibleEnemies()
{
    visibleEnemies.Clear();

    for (int i = 0; i < allEnemies.Count; i++)
    {
        var enemy = allEnemies[i];
        if (enemy.Visible)
            visibleEnemies.Add(enemy);
    }

    Process(visibleEnemies);
}
```

集合容量也很重要。`List<T>` 内部使用数组存储元素，容量不足时会分配更大的数组并复制旧元素。`Dictionary<TKey, TValue>` 在容量不足时也会扩容和 rehash。对于战斗实体、UI item、网络消息、临时命中列表等数量有上限的集合，应尽量在初始化阶段设置合理容量。

```csharp
readonly List<HitInfo> hitResults = new List<HitInfo>(64);
readonly Dictionary<int, Entity> entityMap = new Dictionary<int, Entity>(2048);
```

不过，预分配不是越大越好。容量过大会增加常驻内存，集合池和对象池也会让对象长期存活，增加 GC 扫描压力。工程中应根据目标设备、峰值场景和实际数据设定容量，而不是凭感觉写一个巨大数字。

关于 `foreach`，也需要避免绝对化。对数组和 `List<T>` 的直接 `foreach` 通常不会产生托管分配，因为它们的枚举器是值类型；但如果把集合向上转型为 `IEnumerable<T>`，或者遍历某些返回引用类型枚举器的自定义集合、非泛型集合，就可能产生装箱或枚举器对象分配。以下写法风险更高：

```csharp
IEnumerable<Enemy> GetEnemies()
{
    return allEnemies;
}

foreach (var enemy in GetEnemies())
{
    // 可能出现接口枚举器相关开销
}
```

对于核心热路径，最稳妥的写法仍然是 `for` 循环配合索引访问。不是因为 `foreach` 一定错，而是因为 `for` 的分配和调用路径更直观，更容易在代码评审中判断。

`Dictionary.Keys` 和 `Dictionary.Values` 也常被误解。现代 .NET 中它们通常返回集合视图，不应简单说成“每次都会创建完整集合”。但如果通过接口枚举、LINQ、复制或在旧运行时路径中使用，仍可能产生额外开销。更推荐在需要 key 和 value 时直接遍历字典项：

```csharp
foreach (var pair in entityMap)
{
    int id = pair.Key;
    Entity entity = pair.Value;
}
```

#### 6. Unity API：便利返回值背后的托管分配

Unity 的许多 API 为了易用性，会返回数组或新对象。这类 API 在低频初始化阶段没有问题，但如果放进 `Update`、`LateUpdate`、`FixedUpdate`、滚动列表刷新或战斗循环中，就可能成为 GC Alloc 的主要来源。

常见风险 API 包括：

```csharp
GetComponents<T>();                     // 返回新数组
GetComponentsInChildren<T>();           // 返回新数组
Physics.RaycastAll(...);                // 返回 RaycastHit[]
Physics.OverlapSphere(...);             // 返回 Collider[]
Camera.allCameras;                      // 返回 Camera[]
Input.touches;                          // 返回 Touch[]
```

组件查询应优先缓存单组件引用，并用 List 重载承接多组件查询：

```csharp
MeshRenderer cachedRenderer;
readonly List<Collider> colliders = new List<Collider>(16);

void Awake()
{
    cachedRenderer = GetComponent<MeshRenderer>();
}

void RefreshColliders()
{
    colliders.Clear();
    GetComponents(colliders);

    for (int i = 0; i < colliders.Count; i++)
    {
        colliders[i].enabled = true;
    }
}
```

需要注意，Unity 中常见且可靠的无分配组件查询方式是 `GetComponents(List<T>)`、`GetComponentsInChildren(List<T>)`、`GetComponentsInParent(List<T>)` 这类 List 重载。某些文章会写 `GetComponentsNonAlloc`，但这并不是所有 Unity 版本都存在或常规推荐的组件查询 API。正式项目文档里应避免写不存在或版本依赖不明确的 API，否则读者照抄时会编译失败。物理查询则确实存在大量 `NonAlloc` 变体，例如 `Physics.RaycastNonAlloc`、`Physics.OverlapSphereNonAlloc` 等。

物理查询示例：

```csharp
readonly RaycastHit[] raycastHits = new RaycastHit[16];

int QueryForwardHits(Vector3 origin, Vector3 direction, float distance, int layerMask)
{
    int count = Physics.RaycastNonAlloc(
        origin,
        direction,
        raycastHits,
        distance,
        layerMask
    );

    for (int i = 0; i < count; i++)
    {
        HandleHit(raycastHits[i]);
    }

    return count;
}
```

这里有一个工程细节：NonAlloc 数组容量不足时不会自动扩容，超出的命中结果会被截断。因此使用 NonAlloc API 时，必须明确容量策略。可以根据玩法上限设置容量，也可以在开发版本中检测 `count == array.Length` 并输出告警，提醒可能发生截断。

```csharp
if (count == raycastHits.Length)
{
    // 开发期告警：结果可能被截断
}
```

输入 API 方面，不建议在高频路径反复访问 `Input.touches`。更稳定的做法是使用 `Input.touchCount` 与 `Input.GetTouch(index)`：

```csharp
for (int i = 0; i < Input.touchCount; i++)
{
    Touch touch = Input.GetTouch(i);
    HandleTouch(touch);
}
```

相机 API 方面，`Camera.allCameras` 返回数组，高频调用会分配。更好的方式是使用 `Camera.GetAllCameras(Camera[] cameras)` 或项目侧维护相机注册表。`Camera.main` 的问题更偏查找成本和标签依赖，在现代 Unity 中行为比早期版本更复杂，不能简单说成“每次必定分配”。但在工程中，主相机引用仍应在生命周期明确的位置缓存，以减少查找和语义不确定性。

#### 7. 协程、等待对象与状态机分配

协程是 Unity 项目中常用的异步流程工具。它能让延迟、加载、过场、动画等待、网络轮询等流程写起来很直观，但协程也可能产生托管分配。

协程方法本身会被编译成状态机对象；每次启动协程通常都会创建与该执行流程相关的枚举器对象。`yield return new WaitForSeconds(x)` 会创建等待对象。如果在大量实体上高频启动短生命周期协程，就可能制造明显 GC Alloc。

风险写法：

```csharp
IEnumerator FlashLoop()
{
    while (true)
    {
        yield return new WaitForSeconds(0.1f);
        Toggle();
    }
}
```

如果等待时间固定，可以缓存等待对象：

```csharp
static readonly WaitForSeconds WaitPointOneSecond = new WaitForSeconds(0.1f);

IEnumerator FlashLoop()
{
    while (true)
    {
        yield return WaitPointOneSecond;
        Toggle();
    }
}
```

但这里也要避免过度简化。`WaitForSeconds` 会受到 Time.timeScale 影响；等待时间如果是动态参数，就不能用一个固定对象覆盖所有场景。对于动态等待时间，可以建立小型缓存字典，但也要注意缓存规模，避免因为大量不同浮点值导致字典无限增长。

```csharp
static readonly Dictionary<int, WaitForSeconds> WaitCache = new Dictionary<int, WaitForSeconds>();

static WaitForSeconds GetWaitMilliseconds(int ms)
{
    if (!WaitCache.TryGetValue(ms, out var wait))
    {
        wait = new WaitForSeconds(ms / 1000f);
        WaitCache.Add(ms, wait);
    }

    return wait;
}
```

如果逻辑每帧都要执行，不一定要用协程。大量实体各自启动协程，通常不如集中在一个系统 Update 中调度：

```csharp
void Update()
{
    float dt = Time.deltaTime;

    for (int i = 0; i < timers.Count; i++)
    {
        timers[i].Tick(dt);
    }
}
```

协程优化的目标不是禁止协程，而是区分流程型协程和高频调度型协程。加载、过场、引导、剧情播放适合协程；大量子弹、敌人状态 tick、Buff 轮询、每帧闪烁、AI 高频决策则更适合集中调度或状态机系统。

#### 8. 闭包、委托和事件：分配问题背后的生命周期风险

Lambda 和匿名函数让 C# 代码很简洁，但一旦捕获外部变量，编译器就需要生成闭包对象，把被捕获变量提升为对象字段。这会产生托管分配。更麻烦的是，闭包还会延长对象生命周期，成为内存泄漏的常见引用链。

风险示例：

```csharp
void Bind(Button button, int itemId)
{
    button.onClick.AddListener(() =>
    {
        SelectItem(itemId);
    });
}
```

这段代码会捕获 `itemId` 和可能的 `this`。如果 UI item 被对象池复用，旧监听没有清理，就可能导致旧数据、旧面板或旧控制器继续被引用。问题表现可能不是 GC Alloc 尖峰，而是面板关闭后对象无法释放，下一次打开出现重复回调或旧状态串扰。

更稳妥的 UI 绑定方式通常是显式解绑、缓存委托、使用组件字段保存数据，并在复用时重置：

```csharp
class ItemView : MonoBehaviour
{
    int itemId;
    Action<int> onClick;

    public void Init(int id, Action<int> clickHandler)
    {
        itemId = id;
        onClick = clickHandler;
        button.onClick.RemoveAllListeners();
        button.onClick.AddListener(HandleClick);
    }

    void HandleClick()
    {
        onClick?.Invoke(itemId);
    }

    public void Recycle()
    {
        button.onClick.RemoveListener(HandleClick);
        onClick = null;
        itemId = 0;
    }
}
```

委托本身也是引用类型。频繁组合委托、事件订阅、反复创建 `Action`、在循环中创建 Lambda，都可能造成分配。对于热路径回调，建议使用静态缓存委托、显式方法引用或预创建回调对象。

事件还涉及引用方向。如果一个长生命周期对象持有短生命周期对象的方法委托，那么短生命周期对象会因为事件订阅而无法被 GC 回收。典型例子是全局事件总线持有 UI 面板回调：

```csharp
GlobalEvent.OnCurrencyChanged += panel.Refresh;
```

如果面板关闭时没有取消订阅，`panel` 会被全局事件引用，无法回收。Memory Profiler 中看到面板对象残留时，应优先追踪事件、静态字段、单例、闭包和异步 continuation。

#### 9. LINQ：可读性与热路径成本的取舍

LINQ 的表达力很强，适合编辑器工具、初始化处理、构建管线、离线数据转换和低频逻辑。但在游戏运行热路径中，LINQ 很容易产生迭代器对象、闭包对象、临时集合和排序缓存。

风险示例：

```csharp
var targets = enemies
    .Where(e => e.IsAlive)
    .Where(e => e.Distance < range)
    .OrderBy(e => e.Distance)
    .Take(3)
    .ToList();
```

这段代码可读性很好，但在每帧战斗选择目标时，它可能分配多个中间对象，还可能带来排序成本。热路径中更推荐显式循环，并根据需求选择更低成本的数据结构：

```csharp
targets.Clear();

for (int i = 0; i < enemies.Count; i++)
{
    Enemy e = enemies[i];
    if (!e.IsAlive)
        continue;

    if (e.Distance >= range)
        continue;

    InsertTop3ByDistance(targets, e);
}
```

团队规范不应写成“禁止 LINQ”，而应写成“运行时热路径禁止未经测量的 LINQ”。因为在配置加载、编辑器菜单、一次性烘焙、测试脚本中，LINQ 能提升开发效率，且性能影响可接受。过于粗暴的禁令会让代码变得低效难读，也会让真正关键的优化点被淹没。

#### 10. 日志、断言和调试代码

日志是最容易被忽略的 GC Alloc 来源之一。开发时为了方便排查问题，常常在循环中写大量日志。即使日志系统最终过滤掉了低等级日志，调用方可能已经完成字符串拼接、格式化参数数组创建、装箱和堆栈信息收集。

风险示例：

```csharp
void Update()
{
    Debug.Log("speed = " + speed + ", state = " + state);
}
```

工程建议：

```csharp
#if UNITY_EDITOR || DEVELOPMENT_BUILD
if (Log.IsEnabled(LogLevel.Debug))
{
    Log.Debug("speed = {0}, state = {1}", speed, state);
}
#endif
```

更进一步，可以为高频日志加入采样机制：

```csharp
if ((Time.frameCount & 31) == 0)
{
    Log.Debug("enemy count = {0}", enemyCount);
}
```

断言也一样。断言消息如果提前构造，就可能在条件成立时也产生分配。推荐让断言系统支持延迟消息，或者只在开发构建中启用复杂消息。

```csharp
AssertEx.True(index >= 0, () => $"invalid index: {index}, count: {count}");
```

发布构建中，高频日志应当尽可能被条件编译移除，而不是只在运行时过滤。尤其是移动端和主机平台，日志 I/O 本身也可能影响性能。

#### 11. UI 列表、滚动视图和数据绑定

UI 是 GC Alloc 高发区。背包、邮件、排行榜、任务列表、好友列表、商城、角色属性、图鉴、活动页等界面常常涉及大量 item 创建、文本刷新、图片加载、事件绑定和布局重建。

常见问题包括：

- 每次打开界面都重新 Instantiate 所有 item。
- 滚动时持续创建和销毁 item。
- 每个 item 绑定 Lambda 并捕获数据。
- 每帧刷新所有文本，即使数据没变。
- 使用 `string.Format` 或插值字符串格式化大量数值。
- 刷新时调用 `GetComponentsInChildren` 获取所有子控件。
- 关闭界面时没有解绑事件，导致旧面板残留。
- 对象池复用时没有清理旧状态。

工业化 UI 优化通常要建立以下规则：

1. 列表 item 使用虚拟化或对象池。
2. 文本只在数据变化时刷新。
3. 事件绑定必须可解绑，复用前必须重置。
4. 高频数值显示使用专门格式化路径。
5. 子组件引用在初始化阶段缓存。
6. UI 关闭后用 Memory Profiler 检查面板是否释放。
7. 滚动测试纳入性能回归。

伪代码示例：

```csharp
void Refresh(ItemData data)
{
    if (currentDataId == data.Id && version == data.Version)
        return;

    currentDataId = data.Id;
    version = data.Version;

    nameText.text = data.Name;
    countText.SetText("x{0}", data.Count);
    icon.SetSprite(data.Icon);
}
```

UI 的 GC 优化不能只看 Alloc，还要看 Canvas rebuild、Layout rebuild、TMP mesh rebuild、资源加载、图集切换和异步回调。GC Alloc 是重要入口，但不是 UI 性能的全部。

#### 12. 网络、序列化和数据协议

网络消息和序列化代码往往执行频率高、数据量大、生命周期短，是运行时分配的重灾区。常见风险包括：

- 每个包创建新的 byte 数组。
- 使用 JSON 在热路径解析战斗同步消息。
- 反复 `Split` 文本协议。
- 每条消息创建 Dictionary 或 JObject。
- 使用反射填充对象。
- 每次发送都创建临时字符串或中间 buffer。
- 解包后创建大量短生命周期 DTO。

对于高频网络协议，建议使用二进制协议、对象池、buffer 复用和结构化解析。伪代码：

```csharp
void DecodePacket(ByteReader reader, ref MoveCommand command)
{
    command.EntityId = reader.ReadInt32();
    command.X = reader.ReadFloat();
    command.Y = reader.ReadFloat();
    command.Z = reader.ReadFloat();
}
```

如果业务确实需要 JSON，应尽量限制在低频配置、GM 指令、调试协议、非战斗流程中。正式战斗同步、帧同步、状态同步、实时聊天过滤等高频路径，需要独立评估分配和 CPU 成本。

#### 13. 反射、Attribute 和动态调用

反射通常会产生额外对象，也有较高 CPU 成本。运行时频繁调用 `GetType`、`GetProperties`、`GetCustomAttributes`、`Invoke`、表达式树编译、动态序列化等，都可能产生 GC Alloc。

反射适合：

- 编辑器工具。
- 启动期扫描。
- 配置注册。
- 自动生成代码。
- 调试面板。
- 一次性构建缓存。

反射不适合：

- 每帧逻辑。
- 战斗技能计算。
- 高频网络包解析。
- UI item 刷新。
- 大量对象序列化。

工程方案通常是“启动期反射，运行期缓存结果”：

```csharp
// 初始化阶段
metadata = BuildMetadataByReflection(type);

// 运行阶段
metadata.FastSet(instance, value);
```

如果项目有大量序列化和数据绑定需求，可以考虑代码生成，把运行时反射成本转移到构建期或编辑器期。

#### 14. async/await、Task 与异步状态

`async/await` 让异步流程更清晰，但也可能产生状态机、Task、闭包、continuation 和异常对象。对于加载、网络请求、平台登录等低频流程，它通常可以接受；对于每帧轮询、大量实体任务、短时间内创建成千上万个 Task 的场景，就需要警惕。

风险写法：

```csharp
async void Update()
{
    await DoSmallWorkAsync();
}
```

这种写法几乎一定不适合作为帧循环逻辑。更合理的方式是把异步流程限定在生命周期明确的任务中，并支持取消：

```csharp
async UniTask LoadPanelAsync(CancellationToken token)
{
    var data = await LoadDataAsync(token);
    if (token.IsCancellationRequested)
        return;

    Refresh(data);
}
```

异步的 GC 问题经常和生命周期问题一起出现：面板已经关闭，但异步回调仍然持有面板；对象已回池，但旧请求完成后写回旧对象；全局任务没有取消，导致闭包和上下文长期存活。分析这类问题时，Memory Profiler 的引用链比单帧 GC Alloc 更重要。

#### 15. Profiler：从 GC.Alloc 列开始定位问题

Unity Profiler 的 CPU Usage 模块是定位 GC Alloc 的第一入口。推荐流程如下：

1. 使用目标平台 Development Build 运行项目。
2. 连接 Profiler，打开 CPU Usage 模块。
3. 切换到 Hierarchy 或 Timeline 视图。
4. 打开 `GC Alloc` 列。
5. 找到持续分配或尖峰分配的方法。
6. 启用 Allocation Call Stacks 或相关调用栈选项。
7. 回到触发分配的功能流程复现。
8. 记录方法名、分配字节、帧频率、调用路径和复现步骤。

分析时不要只看最大值，还要看模式：

- 每帧固定几十字节：可能是日志、字符串、闭包、枚举器。
- 每隔几秒几 KB：可能是定时器、网络包、UI 轮询、缓存刷新。
- 打开界面瞬间几百 KB：可能是可接受初始化，也可能是重复加载。
- 滚动列表持续分配：通常需要优化。
- 战斗释放技能时尖峰分配：需要结合卡顿是否可感知。
- 场景切换大量分配：通常可接受，但需要避免残留增长。

Profiler 中看到 `GC.Alloc` 后，下一步是确认调用栈。如果只看到引擎层或系统库层，应向上追溯到项目代码入口。例如看到 `string.Concat`，要看是哪一个 UI 或日志调用触发；看到 `List<T>.ToArray`，要看是谁要求数组；看到 `Physics.RaycastAll`，要看是否可以改 NonAlloc；看到 `WhereListIterator`，说明 LINQ 进入热路径。

#### 16. Timeline 视图：观察 GC 与帧抖动关系

Hierarchy 适合找“谁分配”，Timeline 适合看“什么时候发生”和“它对帧有什么影响”。GC 问题经常表现为周期性 spike，而 Timeline 能把主线程、渲染线程、Job、脚本调用、GC 标记和等待关系放在同一帧里观察。

排查时可以这样看：

- GC spike 是否和 UI 打开、场景切换、战斗波次、资源释放同时发生。
- spike 前是否存在持续 GC Alloc。
- 增量 GC 是否分布在多帧中，并占用了每帧空闲时间。
- 主线程是否已经接近帧预算，导致小切片也造成掉帧。
- GC 是否与资源加载、AssetBundle 卸载、`Resources.UnloadUnusedAssets` 叠加。

如果 GC 发生在 Loading 画面中，可能是合理安排；如果发生在战斗关键输入帧、镜头切换帧或 UI 滚动帧，就需要重点处理。

#### 17. Memory 模块：观察托管堆趋势

CPU Profiler 能找到分配调用，Memory 模块能观察内存趋势。分析 GC 问题时，至少要关注：

- Managed Heap Used Size。
- GC Used Memory。
- GC Allocated In Frame。
- Total Reserved Memory。
- Total Used Memory。
- 资源侧内存与托管内存变化关系。

如果每帧有分配但 Managed Heap 周期性回落，说明垃圾能被回收，问题主要是 GC 频率和暂停；如果 Managed Heap 持续增长且不回落，可能存在引用残留；如果托管内存稳定但总内存增长，问题可能在原生资源、显存或插件侧。

#### 18. Memory Profiler：从“分配源”走向“引用链”

Memory Profiler 不只是看哪个对象大，更重要的是看对象为什么还活着。它适合解决这类问题：

- UI 面板关闭后对象仍然存在。
- 战斗结束后实体、Buff、技能上下文没有释放。
- 切换场景后旧场景对象残留。
- 对象池容量越来越大。
- 静态缓存保存历史数据。
- 委托或事件导致对象无法回收。
- 异步任务闭包持有旧对象。
- Addressables 或 AssetBundle 资源引用未释放。

典型流程：

1. 在进入功能前截取快照 A。
2. 执行功能，例如打开关闭 UI 十次、进入退出战斗、切换场景。
3. 触发一次合适时机的资源释放和 GC。
4. 截取快照 B。
5. 比较 A 与 B。
6. 找出数量增长的托管类型和 Unity 对象。
7. 查看引用链，追溯到静态字段、GCHandle、事件、单例、对象池或 Native Shell。
8. 回到代码修复生命周期。

Memory Profiler 的数据需要谨慎解读。快照是某一时刻的内存状态，不等于所有对象都会长期存活；不同会话之间比较可能受到系统环境影响；Editor 快照会包含大量编辑器对象；采样瞬间栈上的托管引用信息也有工具限制。因此，Memory Profiler 的结论应通过复现流程和多次快照确认。

#### 19. ProfilerRecorder：把 GC Alloc 变成自动化指标

手工看 Profiler 适合排查问题，但团队需要持续防止回归。Unity 提供的 ProfilerRecorder 可以在运行时记录某些 Profiler 指标，用于自动化测试和性能门禁。

伪代码示例：

```csharp
ProfilerRecorder gcAllocRecorder;

void OnEnable()
{
    gcAllocRecorder = ProfilerRecorder.StartNew(
        ProfilerCategory.Memory,
        "GC Allocated In Frame"
    );
}

void LateUpdate()
{
    long bytes = gcAllocRecorder.LastValue;

    if (bytes > gcBudgetBytes)
    {
        ReportGcAlloc(bytes, Time.frameCount);
    }
}

void OnDisable()
{
    gcAllocRecorder.Dispose();
}
```

实际项目可以把这套机制接入自动化跑图、战斗回放、UI 压测和长时间待机测试。每个场景设定预算，例如：

- 战斗稳定运行：目标 0 B/frame，允许极少数已知事件分配。
- 主城待机：目标 0 B/frame 或低于项目预算。
- 背包滚动：不得持续分配。
- UI 首次打开：允许一次性分配，但关闭后不得残留。
- 场景切换：允许加载期分配，但切换完成后堆应回到稳定区间。

#### 20. Profile Analyzer：比较优化前后差异

单次 Profiler 采样容易受波动影响。Profile Analyzer 可以比较两次采样数据，观察优化前后帧时间、函数耗时、分配量和尖峰变化。对于 GC 优化，建议使用固定流程录制两份数据：

- 优化前：执行 3 分钟固定战斗回放。
- 优化后：执行同样回放。
- 对比平均帧时间、P95/P99 帧时间、GC Alloc 总量、GC spike 次数、Managed Heap 趋势。

优化效果不能只看“某个函数 GC Alloc 归零”。如果改动引入了更高 CPU 成本、更大常驻内存或更复杂生命周期风险，可能不是好优化。Profile Analyzer 的价值就是帮助团队从整体性能角度验收，而不是陷入局部数字。

#### 21. 典型排查案例：每帧 40 B 的小分配

某战斗场景中，Profiler 显示每帧稳定 40 B GC Alloc。单看数字很小，但运行 30 分钟后低端机出现周期性轻微卡顿。

排查过程：

1. CPU Usage 打开 GC Alloc 列。
2. 发现分配来自 `BattleHud.Update`.
3. 调用栈显示 `string.Concat`.
4. 代码中每帧刷新计时文本：`timer.text = "Time: " + remainSeconds;`
5. 实际 remainSeconds 只有每秒变化一次，但代码每帧刷新。
6. 修复为值变化时刷新，并使用文本组件的数值格式化接口。
7. 复测后稳定运行分配归零，GC 周期明显拉长。

结论：小分配不一定可以忽略，关键看频率、持续时间和场景重要性。

#### 22. 典型排查案例：UI 关闭后对象不释放

某活动界面关闭后，Memory Profiler 显示 `ActivityPanel`、`RewardItemView` 和大量 `Action` 对象仍然存在。

排查过程：

1. 打开界面前截快照 A。
2. 打开关闭界面十次后截快照 B。
3. 比较快照，发现 `RewardItemView` 数量持续增长。
4. 引用链显示全局事件总线持有 Lambda。
5. Lambda 捕获了 item view 和 panel。
6. 原代码在 `Init` 中 `GlobalEvent.OnRewardChanged += () => Refresh(data);`
7. 回收时没有取消订阅，也无法用相同 Lambda 取消。
8. 修复为具名方法订阅，OnDisable/Recycle 中解绑。
9. 复测后对象可释放。

结论：闭包问题不只是 GC Alloc，更是引用链泄漏。

#### 23. 典型排查案例：RaycastAll 造成战斗尖峰

某技能每次释放时会检测前方所有敌人，Profiler 显示技能释放帧有明显分配。

原代码：

```csharp
RaycastHit[] hits = Physics.RaycastAll(origin, direction, distance, mask);
```

修复方向：

```csharp
int count = Physics.RaycastNonAlloc(origin, direction, hitBuffer, distance, mask);
```

同时增加容量检测。如果命中数量达到 buffer 长度，开发版本输出告警并记录技能 ID。经过测试，常规技能命中数量不超过 8，buffer 设置为 16；大型 Boss 技能走单独检测逻辑。

结论：NonAlloc API 不是简单替换，还需要容量策略和玩法边界。

#### 24. 典型排查案例：LINQ 进入目标选择热路径

某 AI 系统每帧为 100 个单位选择最近目标。代码使用 `Where + OrderBy + FirstOrDefault`，可读性很好，但 Profiler 显示大量 LINQ 迭代器和排序分配。

修复方向：

```csharp
Enemy best = null;
float bestDistanceSq = float.MaxValue;

for (int i = 0; i < enemies.Count; i++)
{
    Enemy enemy = enemies[i];

    if (!enemy.IsAlive)
        continue;

    float d = (enemy.Position - self.Position).sqrMagnitude;

    if (d < bestDistanceSq)
    {
        bestDistanceSq = d;
        best = enemy;
    }
}
```

修复后不仅 GC Alloc 消失，CPU 排序成本也下降。

结论：热路径优化往往同时降低 GC 和 CPU，而不是只处理分配数字。

#### 25. GC Alloc 分析中的常见误区

误区一：所有 `new` 都是坏的。  
事实：初始化阶段、加载阶段、低频流程中的分配通常可以接受。盲目消除所有 `new` 会破坏代码结构。

误区二：只要开启增量 GC，就不用管分配。  
事实：增量 GC 主要降低单次 spike，不会减少分配本身，也不会让 GC 总成本消失。

误区三：Profiler Editor 数据就是玩家数据。  
事实：Editor 有额外开销，必须在目标平台 Player 验证。

误区四：对象池一定更好。  
事实：对象池减少分配，但增加常驻内存和生命周期复杂度。池化对象如果清理不完整，会隐藏泄漏和旧状态。

误区五：每帧 0 B 才是唯一目标。  
事实：关键场景应追求接近 0 B，但 Loading、初始化、低频 UI 打开可以有合理分配。目标应按场景设定。

误区六：Memory Profiler 看到对象就是泄漏。  
事实：对象可能仍在合法生命周期内，也可能等待下一次 GC。需要通过快照比较、引用链和复现流程判断。

误区七：`foreach` 一定分配。  
事实：直接遍历数组和 `List<T>` 通常不分配；接口枚举、自定义引用类型枚举器和非泛型集合才更危险。

误区八：字符串拼接一定是装箱。  
事实：最终字符串分配基本不可避免，但是否装箱取决于编译器和调用形式。文档应准确描述，不要把所有分配都归因于装箱。

### 实现方案

#### 1. 建立统一的 GC Alloc 排查流程

推荐团队使用以下流程作为标准 SOP：

```text
发现现象
  ↓
确认平台与构建类型
  ↓
Profiler 录制固定复现场景
  ↓
CPU Usage 查看 GC Alloc 列
  ↓
Call Stack 定位项目代码入口
  ↓
判断分配类型：字符串 / 集合 / API / 闭包 / LINQ / 协程 / 日志 / 其他
  ↓
判断频率：每帧 / 定时 / 事件触发 / 初始化 / Loading
  ↓
判断影响：是否导致 GC spike、是否破坏帧预算、是否低端机复现
  ↓
制定修复方案
  ↓
复测并记录优化前后数据
  ↓
加入回归测试或代码评审清单
```

这套流程的核心是“先测量，后优化”。没有数据的优化往往会变成猜谜，甚至引入更复杂的问题。

#### 2. 场景分级与预算制定

建议按场景设定不同 GC Alloc 预算：

| 场景 | 建议目标 | 说明 |
| --- | --- | --- |
| 战斗稳定运行 | 接近 0 B/frame | 技能、AI、Buff、寻敌、伤害结算等热路径应严格控制 |
| 主城待机 | 接近 0 B/frame | 长时间停留场景，小分配会积累成周期性 GC |
| UI 列表滚动 | 不应持续分配 | 背包、邮件、排行榜、商店必须压测 |
| UI 首次打开 | 允许一次性分配 | 但关闭后不得残留，重复打开应稳定 |
| 场景加载 | 允许大量分配 | 需要 Loading 遮挡，并在完成后观察堆稳定 |
| 编辑器工具 | 可适度放宽 | 重点关注操作耗时和开发体验 |
| 网络高频消息 | 严格控制 | 协议解析和对象创建应重点治理 |
| 日志与调试 | 开发构建可控，发布构建移除 | 高频日志必须采样或条件编译 |

预算不是一成不变的，要结合目标设备、游戏类型和团队成本制定。动作游戏、VR、竞技游戏对帧稳定性要求更高；回合制、卡牌、低频 UI 游戏可以在部分场景放宽，但也要避免长期内存增长。

#### 3. 代码评审检查清单

每次合入涉及运行时逻辑时，可以检查以下问题：

- 是否在 `Update`、`LateUpdate`、`FixedUpdate` 中创建字符串、集合、数组或委托。
- 是否调用了 `ToArray`、`ToList`、`Split`、`Substring`、`Regex`。
- 是否使用了 LINQ，且代码位于热路径。
- 是否访问了返回数组的 Unity API，例如 `RaycastAll`、`OverlapSphere`、`Input.touches`、`Camera.allCameras`。
- 是否使用了 `GetComponents<T>()` 数组版本，而不是 List 重载。
- 是否在 UI item 初始化中创建捕获变量的 Lambda。
- 是否有事件订阅但没有明确解绑。
- 是否有对象池，但回收时没有清理状态、事件、协程和异步请求。
- 是否使用协程频繁创建 `new WaitForSeconds`。
- 是否有日志字符串在发布构建仍会构造。
- 是否有异步任务未传入取消令牌。
- 是否有静态缓存无上限增长。
- 是否有反射或 JSON 进入高频路径。

这份清单不是为了限制写法，而是为了让风险在代码合入前被看见。

#### 4. Profiler 操作规范

一次合格的 GC Alloc 分析记录应包含：

```text
测试设备：例如 Android 中端机 / iPhone / PC
Unity 版本：例如 2022 LTS / 2023 LTS / Unity 6
构建类型：Development Build / Release Build
测试场景：例如战斗 3 分钟固定回放
复现步骤：从主界面进入战斗，释放技能 A，滚动背包等
采样时长：例如 180 秒
平均 GC Alloc：例如 0 B/frame 或 120 B/frame
峰值 GC Alloc：例如技能释放帧 6.5 KB
GC spike 次数：例如 3 次
最长帧：例如 42 ms
主要调用栈：例如 BattleHud.RefreshTimer -> string.Concat
优化结论：是否修复、是否接受、是否加入预算
```

没有这些上下文，单独一句“这里有 GC”很难指导决策。

#### 5. Memory Profiler 操作规范

用于泄漏排查时，建议采用固定快照流程：

```text
1. 进入测试场景，等待稳定。
2. 手动触发合适的资源清理与 GC，截快照 A。
3. 执行目标操作，例如打开关闭 UI 10 次。
4. 再次等待稳定，触发合适清理，截快照 B。
5. 使用 Compare Snapshots 比较。
6. 按类型数量和大小排序。
7. 对可疑对象查看引用链。
8. 判断引用来源：静态字段、事件、GCHandle、对象池、异步任务、Native 对象。
9. 修复后重复同样流程。
```

对于 UI、战斗和场景切换，建议把快照文件和分析结论保存在性能问题单中，方便后续回归。

#### 6. 自动化回归建议

GC Alloc 很容易在功能迭代中回归。建议为关键场景建立自动化测试：

- 自动进入主城待机 10 分钟。
- 自动执行战斗回放 5 分钟。
- 自动打开关闭主要 UI。
- 自动滚动大型列表。
- 自动切换场景多次。
- 自动执行资源加载与卸载。
- 自动记录每帧 GC Alloc、最长帧、P95/P99 帧时间、Managed Heap 趋势。

伪代码：

```csharp
class GcBudgetMonitor
{
    long frameBudgetBytes;
    int violationCount;

    void Sample(long gcBytes, int frame)
    {
        if (gcBytes <= frameBudgetBytes)
            return;

        violationCount++;
        Report(frame, gcBytes);
    }
}
```

CI 不一定要因为一次偶发分配直接失败，但应输出报告并趋势化。如果某次提交让主城待机从 0 B/frame 变成稳定 80 B/frame，就应该被发现。

#### 7. 文档与知识库沉淀

每次处理 GC Alloc 问题后，应沉淀以下内容：

- 问题场景。
- 触发条件。
- Profiler 截图或数据。
- 分配调用栈。
- 根因分类。
- 修复方案。
- 优化前后对比。
- 是否需要编码规范更新。
- 是否需要工具检测。
- 是否加入自动化测试。

长期来看，团队自己的 GC 问题库比通用优化文章更有价值。因为每个项目的架构、UI 框架、资源系统、战斗系统和目标设备不同，真正高发的问题也不同。

#### 8. 推荐的团队规范摘要

可以把以下规范写入项目性能规范：

```text
1. 热路径不得引入未经测量的持续 GC Alloc。
2. 战斗、主城待机、UI 滚动等关键流程必须定期采样。
3. 字符串、日志、LINQ、闭包、数组返回 API 属于重点审查项。
4. 多组件查询优先使用缓存或 List 重载。
5. 物理查询优先使用 NonAlloc 版本，并明确容量策略。
6. UI item 必须支持复用清理，事件必须可解绑。
7. 对象池必须定义容量、归还、重置、清理和销毁策略。
8. Memory Profiler 用于验证关闭、退出、切场景后的对象释放。
9. Editor 数据不能作为最终性能结论，必须在目标设备验证。
10. 优化必须保留前后数据，不能只凭主观判断。
```

### 总结

GC Alloc 是 Unity 性能优化中最基础、最常见，也最容易被误解的指标之一。它表示托管堆上发生了由 GC 管理的内存分配，但它不等同于 GC 暂停，也不等同于所有内存增长。要正确分析 GC Alloc，必须同时理解 C# 托管内存、Unity API 行为、目标平台差异、Profiler 数据含义和项目运行场景。

本文系统整理了 Unity 项目中常见的 GC Alloc 来源，包括装箱、字符串、集合、Unity API、物理查询、输入 API、协程、闭包、委托、LINQ、日志、UI、网络协议、反射和异步任务。每一种分配来源都不能简单套用“绝对禁止”或“完全无所谓”的判断，而要结合调用频率、发生场景、对象生命周期、目标设备性能和帧预算综合分析。

在工具层面，CPU Profiler 适合定位“哪里发生了分配”，Timeline 适合观察“分配和 GC 对帧时间的影响”，Memory 模块适合观察“托管堆趋势”，Memory Profiler 适合回答“对象为什么还活着”，ProfilerRecorder 和 Profile Analyzer 则适合把问题纳入自动化回归和优化前后对比。一个成熟项目不应只靠开发者临时打开 Profiler 排查，而应建立稳定的性能测试流程、分配预算、代码评审清单和问题知识库。

最终，GC Alloc 优化的目标不是追求形式上的“零 GC”，而是在关键场景中获得稳定、可预测、可维护的帧时间表现。对于 Loading、初始化和低频工具逻辑，可以接受合理分配；对于战斗、主城待机、滚动列表、网络同步和 UI 高频刷新，则应尽量消除持续分配。工程化优化最重要的原则永远是：先测量，再判断；先定位，再修改；先验证，再合入；先建立规范，再防止回归。

## 元数据

- **创建时间：** 2026-04-25 00:12
- **最后更新：** 2026-04-25 00:12
- **作者：** 吉良吉影
- **分类：** 内存管理
- **标签：** Unity、GC、GC Alloc、Profiler、Memory Profiler、性能优化、托管堆、内存分析
- **来源：** 已有文稿整理

---

*文档基于与吉良吉影的讨论，由小雅整理*
