# C#、UE C++ 与 Lua GC 机制深度对比

## 摘要

本文以 C# .NET GC 为基准，系统对比 Unreal Engine UObject GC 和 Lua GC 的核心机制。涵盖三种 GC 的架构设计、引用追踪方式、分代/增量策略、写屏障实现、内存整理策略和实际开发中的坑点。目标是通过横向对比，帮助从 C# 背景转入 UE/Lua 开发的工程师快速建立 GC 领域的全面知识体系。

---

## 正文

### 背景

垃圾回收（Garbage Collection）是现代编程语言和游戏引擎中自动管理对象生命周期的核心机制。不同平台的 GC 设计折射出其目标场景的根本差异：

- **C# .NET** 面向通用计算和服务器场景，追求吞吐量和开发效率，设计了一套高度自动化的分代 GC
- **Unreal Engine C++** 面向实时渲染游戏，在 C++ 的 raw pointer 生态上叠加了一套反射驱动的增量标记-清扫 GC
- **Lua** 面向轻量级嵌入式脚本场景，追求实现简练和在宿主应用中的可嵌入性，设计了一套可控性极高的增量/分代 GC

深入理解三者的异同，对于跨语言/跨引擎的开发者和架构师来说至关重要。本文作者以 C# 为主要背景，在向 UE C++ 和 Lua 迁移的过程中，通过 GC 这个切入点系统化地剖析了三种机制的设计理念和工程实现。

---

### 第一章：C# .NET GC 分代机制

#### 1.1 分代假设

C# GC 的核心理论依据是**弱分代假设**（Weak Generational Hypothesis）：

> "大多数对象的生命周期都很短。"

基于这个假设，.NET 将托管堆分为三代：

| 代 | 别名 | 定位 | 触发频率 | 回收耗时 |
|----|------|------|---------|---------|
| Gen 0 | 新生代 | 新分配的对象 | 频繁 | 毫秒级 |
| Gen 1 | 缓冲代 | Gen 0 幸存者的缓冲区 | 较少 | 数毫秒 |
| Gen 2 | 老年代 | 长生命周期对象 | 很少 | 数十到数百毫秒 |

**Gen 0 的分配机制：**

C# 的托管堆分配是业界最快的分配方式之一。Gen 0 维护一个 next object pointer（分配指针），新对象分配就是指针后移 + 内存清零。这比 C 的 malloc（遍历空闲链表）快一个数量级。

```csharp
// Gen 0 分配伪代码
object Allocate(int size)
{
    IntPtr ptr = gen0_next_object_ptr;
    gen0_next_object_ptr += size;
    if (gen0_next_object_ptr > gen0_limit)
    {
        TriggerGC(Generation.Gen0); // 预算满了，触发 GC
        ptr = gen0_next_object_ptr;
        gen0_next_object_ptr += size;
    }
    return ptr;
}
```

**分代升级路径：**

```
新对象分配 → Gen 0
  ↓ Gen 0 GC 幸存
Gen 1（缓冲，下次 Gen 0 回收时如果还活着）
  ↓ 下次 Gen 1 回收幸存
Gen 2（老年代，基本上只有 full GC 才会触及）
```

#### 1.2 内存压缩（Compaction）

C# GC 有一个 UE 和 Lua 都没有的核心特性：**压缩**。回收后，幸存对象会被搬到堆顶，内存重新变为连续。

**为什么 C# 敢压缩？**

因为 CLR 知道所有托管引用的位置——栈上引用、寄存器引用、GC handle——压缩后可以精确更新所有指针。这是"托管"语言相比 native 语言的优势所在。

**压缩的代价：**

- Gen 0/1 压缩成本低（数据量小）
- Gen 2 压缩成本高（大量长命对象搬移）
- LOH（Large Object Heap, >=85KB）默认不压缩，因为搬移大块内存的代价超过了碎片化带来的分配损耗

> **.NET Framework 4.5.1+** 引入了 `GCSettings.LargeObjectHeapCompactionMode` 可以手动触发 LOH 压缩，但一般不推荐在性能敏感的代码中调用。

#### 1.3 GC 触发方式

"自动触发"是简化说法，实际上 C# GC 的触发来源有四种：

| 触发方式 | 触发源 | 说明 |
|---------|-------|------|
| 分配驱动 | Gen 0/1 的 budget 满了 | **主要途径** |
| 显式调用 | `GC.Collect()` | 业务代码或某些库 |
| 系统内存压力 | OS 通知内存不足 | GC 主动回收释放 |
| 后台回收 | Server GC 的后台线程 | 长时间无分配导致的被动触发 |

**关键理解：** C# GC 本质上是**分配驱动**的。如果你不分配新对象，GC 不会主动触发。这与 UE 的定时触发形成了鲜明对比。

#### 1.4 与 UE/Lua 的全局对比定位

C# GC 的设计哲学可以概括为：**全自动、高吞吐、开发友好**。开发者几乎不需要干预 GC，代价是偶尔的 STW（Stop The World）卡顿，以及不可预测的 full GC 触发时机。

---

### 第二章：Unreal Engine UObject GC 机制

#### 2.1 设计背景

UE 选择在 C++ 上叠加 GC，面临的核心挑战是：

1. **C++ 没有托管的引用环境** — 不能用 CLR/JVM 的方式跟踪引用
2. **指针是 raw pointer** — 不能移动对象（没法 compact）
3. **需要与编辑器、蓝图集成** — GC 必须感知 UCLASS 层次结构

UE 的解决方案是**基于反射的标记-清扫 GC**，核心依赖于 UHT（Unreal Header Tool）生成的反射数据。

#### 2.2 GUObjectArray：全局登记表

UE GC 最核心的基础设施是一个全局数组：

```cpp
// CoreUObject/Private/.../GUObjectArray.cpp
// 所有 NewObject<>() 创建的 UObject 自动注册
GUObjectArray
```

每个 FUObjectItem 包含：

```cpp
struct FUObjectItem
{
    UObjectBase* Object;       // 实际对象指针
    int32 Flags;               // 可达性、根标记、PendingKill 等
    int32 ClusterRootIndex;    // GC 集群索引（-1 表示无）
    int32 SerialNumber;        // 调试序列号
};
```

**与 C# 的关键差异：** C# 托管堆上的对象位置由 CLR 管理，GC 遍历时通过栈/静态引用链"发现"对象。UE 则有一张显式的"全体 UObject 名单"——GC 遍历时先知道所有对象在哪，再从根集中筛选活着的。

**优势：** 遍历速度快（连续内存访问）。
**代价：** 每个 UObject 多一个 FUObjectItem 条目的内存开销。

#### 2.3 引用链构建机制

##### 2.3.1 UPROPERTY → 反射信息（编译期）

UHT 在编译期为每个 UCLASS 生成反射数据。这份数据详细记录了所有带 UPROPERTY 标记的成员变量：

```cpp
UCLASS()
class AMyActor : public AActor
{
    GENERATED_BODY()

    UPROPERTY()
    UChildComponent* MyComp;

    UPROPERTY()
    AActor* TargetActor;

    // 没有 UPROPERTY → GC 不知道这个引用的存在
    AActor* UnsafeRef;
};
```

UHT 生成的反射数据类似（简化）：

```json
{
  "ClassName": "AMyActor",
  "Properties": [
    { "Name": "MyComp", "Type": "UChildComponent*", "Offset": 0x120 },
    { "Name": "TargetActor", "Type": "AActor*", "Offset": 0x128 }
  ]
}
```

##### 2.3.2 FReferenceCollector 遍历（运行时）

每个 UClass 都会自动生成一个 `AddReferencedObjects` 函数：

```cpp
// 由 UHT 自动生成
void AMyActor::AddReferencedObjects(FReferenceCollector& Collector)
{
    Collector.AddReferencedObject(MyComp);
    Collector.AddReferencedObject(TargetActor);
    Super::AddReferencedObjects(Collector); // 递归父类
}
```

GC 遍历时，对每个灰色对象调用 `AddReferencedObjects`，拿到它引用的所有 UObject，加入处理队列。

**为什么会说 UE 的引用链构建"不是扫描内存"？**

像 Boehm GC 这类保守式 GC 是扫描栈和堆内存区域，把所有看起来像指针的值当作潜在引用。UE 用的是**精确式 GC**——通过反射数据精确知道哪些字节是 UObject 指针。更安全、更高效，但依赖开发者正确标注 UPROPERTY。

##### 2.3.3 引用来源的五种路径

| 引用来源 | 形式 | 说明 |
|---------|------|------|
| 1. UPROPERTY | `UPROPERTY() UObject*` | 最基础，显式声明 |
| 2. AddToRoot | `Obj->AddToRoot()` | 加入全局根集，持久保活 |
| 3. FGCObject | `FGCObject::AddReferencedObjects` | 自定义引用收集器 |
| 4. 引擎固有根 | UWorld, UEngine, UGameInstance 等 | 引擎子系统自动注册为根 |
| 5. TObjectPtr 容器 | `TArray<TObjectPtr<UObject>>` | UE5+ 的容器追踪方案 |

##### 2.3.4 三色标记法

UE GC 使用经典的三色标记法：

```
白色（White）：未访问，可能是垃圾
灰色（Gray）：已标记为可达，但引用还没遍历完
黑色（Black）：已标记为可达，引用全部遍历完
```

GC 遍历流程：

```
1. 初始化：所有对象标记为白色
2. 根集构建：标记根对象为灰色，入队
3. while(队列不空):
   出队一个灰色对象
   调用它的 AddReferencedObjects → 获取它引用的所有 UObject
   for each 引用:
       if 白色 → 标记灰色 → 入队
   当前对象 → 黑色
4. 清扫：遍历 GUObjectArray
   白色 → 销毁
   黑色 → 重置为白色（下一轮 GC）
```

#### 2.4 GC 触发与增量机制

##### 2.4.1 触发方式

与 C# 的分配驱动不同，UE GC 是**定时 + 条件触发**：

| 触发方式 | 参数 | 默认值 |
|---------|------|--------|
| 定时触发 | `gc.TimeBetweenPurgingPendingKillObjects` | ~60秒 |
| 数量触发 | `gc.MaxObjectCount` | ~12000 |
| 显式触发 | `CollectGarbage()` / `ForceGarbageCollection()` | 无 |
| 紧急触发 | 分配器 `OnOutOfMemory()` 回调 | 无 |

##### 2.4.2 增量 GC 时间片

这是 UE GC 相比 C# GC 最核心的设计差异。

C# GC 的 Gen 0 虽然快但 STW，Gen 2 完全 STW。而 UE 把一次完整的标记-清扫拆成**多帧执行**：

```
帧 N：     标记 30% 的对象 → 时间到，暂停
帧 N+1：   继续标记 → 标记完成，开始清扫
帧 N+2：   清扫 40% → 时间到，暂停
帧 N+3：   清扫完成 → 对象析构
```

每帧的时间预算由 `GarbageCollectionTimeBudget` 控制（默认约 2ms）。

**核心设计意图：** 游戏场景中帧率敏感性高于吞吐量。宁愿每帧多 0.5ms 开销，也不希望某帧突然卡 50ms。

##### 2.4.3 写屏障（Write Barrier）

增量 GC 面临一个关键问题：**标记到一半时引用变了怎么办？**

假设这种场景：
```
1. GC 遍历到 对象A，标记 A 为灰色
2. 检查 A 的引用，发现没有 → A 变为黑色
3. GC 暂停（时间到）
4. 游戏逻辑把 B 赋值到 A.ref，A 现在引用了 B
5. 但 A 已经是黑色（标记完成），不会被重新遍历
6. B 还是白色 → GC 认为 B 不可达 → 回收 B → B 被误杀（漏标）
```

解决方案：**写屏障**（Write Barrier）。每次 UPROPERTY 指针赋值时插入额外逻辑：

```cpp
// UPROPERTY 赋值时的写屏障（简化）
void SetRef(UObject* NewValue)
{
    if (GIsGarbageCollecting) // GC 正在运行中
    {
        MarkDirtyForGC(this); // 通知 GC "我的引用变了，重新检查我"
    }
    MyRef = NewValue;
}
```

**写屏障的代价：**
- 每次 UPROPERTY 赋值多一次条件判断 + 可能的标记操作
- UE 在非 GC 阶段优化掉这个检查（GIsGarbageCollecting 为 false 时快速路径）

##### 2.4.4 与 C# 的对比总结

| 维度 | C# GC | UE GC |
|------|-------|-------|
| 分代 | Gen 0/1/2 | 无分代 |
| 回收方式 | 标记-压缩（compact） | 标记-清扫（不 compact） |
| 对象移动 | 会搬 | 不搬（指针稳定） |
| 引用追踪 | 自动（CLR 知道所有引用） | UPROPERTY 显式声明 |
| 触发方式 | 分配驱动 | 定时 + 显式 |
| 卡顿控制 | Gen 0 好，Gen 2 差 | 增量式，每帧可控 |
| 写屏障 | 无 | 有 |

#### 2.5 GC 集群（Clusters）

##### 2.5.1 动机

UE GC 的遍历开销与活 UObject 数量成正比。但许多 UObject 的生命周期是绑定的——**同生共死**（例如一个 Actor 和它的 Component）。

##### 2.5.2 实现

GC 集群把一组注定同生共死的 UObject 打包成一个逻辑节点。GC 标记时只检查集群的外边界——如果集群不可达，整个集群一次性回收，不再进集群内部逐个检查：

```
无集群：
[Root] → [A] → [B] → [C]     (3次引用检查)
               ↘ [D] → [E]   (2次引用检查)

有集群（B/C/D/E 打包）：
[Root] → [A] → [Cluster]     (1次引用检查)
               Cluster 不可达 → 内部的 B/C/D/E 全部回收
```

##### 2.5.3 自动创建场景

- Level 加载时自动对同 World 的 Actor/Component 归集群
- 蓝图 Actor 实例 + 子对象默认在一个集群
- 也可以手动绑定

##### 2.5.4 代价

如果集群内对象的实际生命周期不同步（一个提前死了但另一个还活着），整个集群要拆分重新评估——反而降低性能。移动端/低配平台有时关闭集群功能就是这个原因。

#### 2.6 对象状态与销毁链路

##### 2.6.1 状态转换图

UE 的 UObject 生命周期远比 C# 复杂。一个核心差异是：**C# 里没有"对象已死但指针还在"的状态。**

```
NewObject → [正常]
  ↓
Destroy() / MarkAsGarbage()
  ↓ [PendingKill / 待回收]
  ↓
EndPlay() ← 蓝图事件在此触发！
  ↓
GC 清扫 → 标记 Unreachable
  ↓
BeginDestroy() → 异步资源卸载
  ↓
FUObjectItem 从 GUObjectArray 移除
```

**关键陷阱：** `Destroy()` 之后，对象的 EndPlay 被触发，但**内存还在**、**指针还在**。如果代码里漏了 `IsValid()` 检查，可能在 Destroy 后到 GC 清扫前的窗口内访问到一个"半活不死"的对象。

```cpp
AActor* Actor = GetSomeActor();
Actor->Destroy();          // 标记 PendingKill
// Actor 指针没变！对象内存还在！
// Actor->IsPendingKill() → true
// IsValid(Actor) → false
```

##### 2.6.2 对比 C# 的 IDisposable

C# 的 `IDisposable` 只释放非托管资源，托管对象本身依然是 GC 管理的。`Dispose()` 之后对象不会被"强制销毁"——GC 仍然按可达性判断生死。这与 UE 的 Destroy（强制标记为死亡，无视引用）有本质区别。

##### 2.6.3 PendingKill 的绕过行为

UE 4.x 中有一个暗坑：**即使对象有 UPROPERTY 引用，一旦调用 Destroy / MarkPendingKill，对象依然会死。**

```cpp
UPROPERTY()
AActor* MyRef;

// 某个地方：
MyRef->Destroy();
// MyRef 被标记为 PendingKill
// 下次 GC 清扫时，MyRef 会被回收
// 即使 UPROPERTY 还在指向它
```

这意味着：**UPROPERTY 可以保护对象不被"意外回收"，但不能保护对象不被"显式销毁"。**

---

### 第三章：Lua GC 机制

#### 3.1 总体架构

Lua 的 GC 发展历程：

| 版本 | GC 机制 | 主要特点 |
|------|--------|---------|
| Lua 5.0 | 标记-清扫 | 简单的两色标记 |
| Lua 5.1 | 增量标记-清扫 | 引入写屏障和步进 |
| Lua 5.2 | 增量 + 实验性分代 | 分代模式初版 |
| Lua 5.4 | 增量 + 分代（成熟） | 两种模式都稳定可用 |

Lua GC 管理的对象类型：**Table、Function、Userdata、Thread（协程）、String（长串）**。所有这些对象都挂在 `GCObject` 链表上。

**根集**：主线程（主协程）、注册表（Registry，存全局变量等）、全局环境。

#### 3.2 标记-清扫流程

与 UE 同样使用三色标记法，但实现更轻量：

```
1. 标记阶段（增量步进）：从根集出发，标记可达对象
2. 清扫阶段（增量步进）：遍历 GCObject 链表，未标记的释放
3. 紧急回收：分配内存不够时，强行 STW 跑完整 GC
```

#### 3.3 写屏障实现：后置/Barrier-Forward

Lua 的写屏障与 UE 的设计思路不同：

| 维度 | UE 写屏障 | Lua 写屏障 |
|------|----------|-----------|
| 时机 | 前置（赋值前） | 后置（赋值后） |
| 策略 | 标记"这个对象需要重新检查" | 直接标记新引用为灰色 |
| 激进程度 | 保守 | 激进 |
| 浮动垃圾 | 较多 | 较少 |

```lua
-- Lua 写屏障伪代码
function Assign(t, key, value)
    t[key] = value
    if gc_is_marking then
        -- 如果 t 已标记为黑色（遍历完成），
        -- 而 value 还是白色（未被标记）
        -- 立即把 value 标记为灰色，入队等待遍历
        if is_black(t) and is_white(value) then
            mark_gray(value)  -- 后置屏障：直接处理
        end
    end
end
```

**设计哲学差异：** Lua 的屏障假设"新引用的对象大概率活着"，直接标记它为灰色。UE 的屏障则是"先记下来，回头再检查"。

#### 3.4 分代模式

Lua 5.2+ 提供了**分代模式**（Generational Mode），可通过 `collectgarbage("generational")` 切换。

| 维度 | C# 分代 GC | Lua 分代模式 |
|------|-----------|-------------|
| 分代数量 | 3 代（Gen 0/1/2） | 2 代（Young/Old） |
| 核心假设 | 越新越容易死 | 越新越容易死 |
| 新生代回收 | 频繁，只扫新生对象 | 频繁，只扫新创建的对象 |
| 老年代回收 | 不常触发，Full GC | 不常触发，老年代回收 |
| 对象搬迁 | compact（搬移） | 不搬移，只标记年龄 |

**为什么 Lua 不需要三代的理由：** Lua 的对象类型相对单一（主要是 Table），没有 C# 的 LOH 问题，实现的简练性优先于 GC 吞吐量的极致优化。

#### 3.5 步进调优

这是 Lua 开发中实际价值最高的配置项：

```lua
-- 两个关键参数
collectgarbage("setpause", 200)    -- 触发阈值：内存增长 200% 时触发
collectgarbage("setstepmul", 200)  -- 每步处理量：分配量的 200%
```

**实际调优场景：**

| 场景 | setpause | setstepmul | 策略 |
|------|---------|-----------|------|
| 帧率敏感（实时交互） | 150 | 300 | 更频繁触发，每步处理更多，减少单帧卡顿 |
| 吞吐优先（后台） | 400 | 100 | 减少 GC 频率，每次慢一点 |
| 默认 | 200 | 200 | 平衡模式 |

#### 3.6 弱引用 Table

这是 Lua 区别于 C# 和 UE 的一个独特设计。通过元表设置 `__mode` 字段：

```lua
-- 弱引用键
local weak_k = setmetatable({}, { __mode = "k" })
-- 弱引用值
local weak_v = setmetatable({}, { __mode = "v" })
-- 键值都弱引用
local weak_kv = setmetatable({}, { __mode = "kv" })
```

**实际应用价值：**

**场景一：缓存**
```lua
local cache = setmetatable({}, { __mode = "v" })
-- 缓存在 Table 中的对象，如果其他地方没有引用 → GC 自动回收
-- 如果其他地方还在使用 → 正常从缓存命中
-- 不需要手动清理缓存！
```

**场景二：观察者模式**
```lua
local listeners = setmetatable({}, { __mode = "k" })

function bind(obj, event, callback)
    if not listeners[obj] then
        listeners[obj] = {}
    end
    listeners[obj][event] = callback
end

-- 当 obj 被其他地方置 nil → 自动从 listeners 中移除
-- 无需手动 unbind！
```

**与 C# 的对比：**
- C# 有 `WeakReference<T>`，一行一个弱引用
- Lua 是 Table 级别的弱引用——整张表里的键或值自动弱引用
- Lua 的设计更"声明式"——告诉 runtime "这个容器里的引用是弱的"

**与 UE 的对比：**
- UE 有 `TWeakObjectPtr<T>`——智能指针语义，不是 GC 语义
- 相当于在指针层级解决弱引用问题，不属于 GC 范畴

#### 3.7 循环引用不会泄露

```lua
-- Lua GC 的一个常见面试题
a = { name = "a" }
b = { name = "b" }
a.ref = b
b.ref = a
-- 循环引用

a = nil
b = nil
-- 下次 GC 时：从根集遍历不到 a 和 b → 两个都回收
-- 标记-清扫 GC 不受循环引用影响
```

**与引用计数的本质区别：** 只有引用计数 GC（如 COM、C++ shared_ptr、Python 早期版本）才怕循环引用。所有基于可达性分析（图遍历）的 GC——C#、Lua、UE——都不怕。

#### 3.8 与 C# 的关键差异

| 维度 | C# | Lua |
|------|-----|-----|
| 分代 | 3 代，有 compact | 2 代，无 compact |
| 写屏障 | 无（STW 一次性标记） | 后置写屏障 |
| 触发模型 | 分配驱动（自动推算 budget） | 分配驱动（手动设置 pause/stepmul） |
| 弱引用 | WeakReference\<T\> | 弱引用 Table（声明式） |
| 对象移动 | 搬移 | 不搬移 |
| 类型安全 | 强类型，GC 精确 | 动态类型，GC 精确 |

---

### 第四章：面试考点与实践落地

#### 4.1 UE GC 面试高频题

**必考 1：UPROPERTY 漏标排查**

> "你的 Actor 里有个 UObject 指针，编辑器打开正常，运行 5 秒后随机崩溃。排查思路？"

标准答案思维链：

1. 症状：随机崩溃、时间不固定、行为不稳定 → 指向 GC 问题
2. 排查步骤：
   a. 先检查所有 UObject* 是否都有 UPROPERTY()
   b. 检查对象是否被 `Destroy` 后仍有代码访问
   c. 检查 FGCObject / AddToRoot 是否正确地注册/注销
   d. 启用 `loggc` 日志观察 GC 触发时机
3. 根本原因：没有 UPROPERTY 的 UObject* 在 GC 后变为悬挂指针

**加分点：** 主动指出"即使加了 UPROPERTY，如果引用的对象被其他路径标记为不可达而被回收，同样会崩——UPROPERTY 只是声明引用关系，不保证引用链可达。"

**必考 2：保活机制选择**

> "有个 UObject 不需要挂在 Actor 树上，你只是想在代码里临时持有它并保证不被 GC，怎么做？"

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| AddToRoot | 极简，一行代码 | 全局保活，容易忘 Remove | 临时紧急处理 |
| FGCObject | 作用域感知，工程化 | 需要多写 class | 框架级模块管理 |

**必考 3：对象销毁时序**

> "一个 Actor 调用 Destroy 后，它的 Component 在下一帧是否还能用？"

- `Destroy()` → 标记 PendingKill → EndPlay 触发
- 内存还在，指针还在 → `IsValid()` 返回 false
- 如果其他代码还有 raw 指针指向它——可以访问，但随时可能崩
- GC 清扫后才真正销毁

**拓展对比 C#：** C# 中一个对象 Dispose 后，引用可以依然存在，但对象不会被"强制销毁"——GC 依然按可达性判断。UE 是主动销毁（无视引用），C# 是等待回收（尊重引用）。

#### 4.2 Lua 面试重点

**必考 1：循环引用**

> "Lua 的 GC 会不会因为循环引用导致内存泄漏？"

答：不会。标记-清扫 GC 从根集出发遍历可达对象，循环引用的双方如果都无根可达，一起被回收。

**面试装逼点：** 主动指出 C#/Lua/UE（标记-清扫）都不怕循环引用，怕循环引用的是引用计数 GC（COM、C++ shared_ptr）。

**必考 2：弱引用 Table 的实际用途**

- 缓存系统
- 观察者模式
- 对象池

能主动提起用弱引用实现观察者模式而无需手动 unbind，表明有实战经验。

**必考 3：GC 调优**

> "游戏的 Lua 脚本 GC 卡顿严重，你如何调优？"

回答框架：

1. 先开 profile，确认是 GC 卡顿（`debug.profilebegin/end` 或引擎集成的 Lua profiler）
2. 检查临时 Table/Function 的创建频率——避免每帧创建大量新对象
3. 用弱引用缓存复用频繁创建释放的对象
4. 调 `setpause` 和 `setstepmul`
5. 在切场景/loading 时主动 `collectgarbage("collect")`

#### 4.3 C# 横向对比的面试技巧

面试中能自然横向对比，展现的不是"会多门语言"而是"理解 GC 的本质原理"：

| 对比维度 | 一句话总结 |
|---------|----------|
| GCHandle vs AddToRoot | 都是"主动保活"，场景不同 |
| WeakReference vs 弱引用 Table | C# 是操作式（手动管理 WR 实例），Lua 是声明式（容器级别） |
| 分代策略 | C# 3 代有 compact；Lua 2 代无 compact；UE 无分代 |
| 三种 GC 的"知"的程度 | C# 全知（CLR）、Lua 知 Table 层面、UE 只知道 UPROPERTY |

---

### 第五章：实际开发最值钱的三个能力

#### 5.1 排查 GC 相关崩溃

不同平台下的排查思路：

| 平台 | 症状 | 根因 | 工具 |
|------|------|------|------|
| UE | 随机崩溃，时间不固定 | UPROPERTY 漏标 | `loggc` / IsValid 检查 |
| UE | Destroy 后崩溃 | PendingKill 对象访问 | 引用检查 + 安全检查 |
| Lua | 帧率间歇性掉帧 | 临时 Table/Function 泄漏 | profiler + setpause 调大 |
| C# | 突然卡顿 | Gen 2 full GC | PerfView / ETW 分析大对象 |

#### 5.2 主动控制 GC 时机

**铁律：不要在任何语言的密集型帧中触发 GC。**

```cpp
// UE：在 Loading Screen 触发
if (GEngine->HasPendingKillObjects())
{
    GEngine->ForceGarbageCollection(); // 切场景时主动触发
}
```

```lua
-- Lua：在切场景时做一次完整回收
collectgarbage("collect")  -- 显式触发，而不是等 runtime 自发
```

```csharp
// C#：明确知道大量释放后才调用
for (int i = 0; i < 100; i++)
{
    pool.Clear(); // 释放大量对象
}
GC.Collect(); // 只在大批释放后调用，不滥用
```

#### 5.3 写屏障 + 引用声明的理解

这是一条核心思维：**GC 的"知"的程度不同，开发者的责任也不同。**

| GC | 开发者需要做什么？ |
|----|-----------------|
| C# | 基本什么都不用做 |
| Lua | 弱引用场景才需关注 |
| UE | **必须显式标记 UPROPERTY** |

在 UE 中，漏标一个 UPROPERTY 可能意味着数小时的崩溃排查。在 C# 中，你很少需要思考"这个引用 GC 知不知道"。这两种心态的切换，是从 C# 转 UE 最需要适应的地方。

---

### 总结

三种 GC 机制看似解决同一个问题——自动管理对象生命周期——但实现路径截然不同，反映了各自平台的工程需求：

- **C# 选择自动化**：用分代 + compact + 自动引用追踪，提供对开发者最友好的体验，代价是 STW 卡顿的不可预测性。
- **UE 选择可控性**：用反射驱动 + 增量时间片 + 写屏障，把 GC 卡顿分散到每帧，更适应游戏场景的帧率敏感性要求，代价是开发者必须显式声明引用关系。
- **Lua 选择简练性**：用轻量标记-清扫 + 可选增量/分代模式 + 弱引用 Table，在极小的实现体积下提供了足够的控制力，代价是吞吐量不如 C# 的前代 GC。

理解这三者的本质差异，不只是在面试中展示广度——更是在实际开发中，面对 GC 相关问题时，能准确判断问题属于哪个层面、应该用什么策略来解决。

---

## 元数据

- **创建时间：** 2026-05-29 19:04
- **最后更新：** 2026-05-29 19:04
- **作者：** 吉良吉影
- **分类：** 性能优化
- **标签：** GC, C#, .NET, Unreal Engine, UObject, Lua, 内存管理, 垃圾回收, 面试
- **来源：** 基于日常记录 `2026-05-29-C#与C++Lua的GC异同讨论.md` 的讨论归档

---
*文档基于与吉良吉影的讨论，由小雅整理*
