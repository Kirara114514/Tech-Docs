# UE C++ 八股概览

## 摘要

在 Unreal Engine（UE）客户端开发岗位的面试中，UE C++ 八股不是孤立的题目清单，而是一条可以被逐层追问的技术链：UObject 与反射 → UHT 代码生成 → CDO → GC → UObject 指针体系 → 对象生命周期 → Actor/Component → Gameplay Framework → 资源引用与加载 → Delegate → Tick → 多线程 → 网络同步 → UBT/UHT 模块体系 → C++ 语言基础 → 性能优化。这条链的每一环都同时涉及 C++ 语言本身的语义与 UE 引擎的运行时机制，回答质量直接反映候选人是否真正用 UE C++ 写过游戏逻辑，而不只是背过 API。

本文按面试出现频率从高到低，将全部知识点组织为十四个梯队：前三梯队覆盖必须吃透的 UObject/反射/UHT/CDO/GC/指针体系与对象生命周期；中间梯队深入 Gameplay Framework、容器字符串、Delegate/Timer/Tick、多线程与渲染线程；后段覆盖资源加载、网络、UBT 模块、C++ 语言基础、序列化配置、性能优化与架构选择，最后以面试实战连环追问与整套知识地图收尾。文末附知识缺口清单，适合作为面试前系统复习与查漏补缺的索引。全部代码示例基于 Unreal Engine 5 的现代用法；文中对 TObjectPtr 取代裸 UObject* 成员、增量 GC、Replication Graph/Iris 等 UE5 新变化做了专门说明。

## 正文

### 背景

把"100 道 UE 面试题答案"背下来价值有限——背完以后碰到一句追问就容易断。真正有区分度的做法，是把整套知识按优先级串成一条链，让每个知识点都能被追问到机制层面。本文按以下优先级组织内容：

① 面试最常问、开发最常踩 → ② UE C++ 核心机制 → ③ 工程/性能/网络/线程 → ④ 更底层的 C++ 与引擎原理 → ⑤ 面试时应该答到什么深度。

覆盖范围包括 UObject/反射/UHT/GC/CDO/UObject 指针体系/Actor/Component/Gameplay Framework/Subsystem/容器/FString-FName-FText/Delegate/Tick/多线程/锁/GameThread-RenderThread/资源引用/Asset Manager/网络/UBT-模块/C++ 基础（virtual/RAII/move/const/cache/SoA）/性能优化/对象池/GC Spike/Interface 等全部高频知识点，并补充了 Cast 机制、USTRUCT 反射、Timer、数学基础、碰撞系统、输入系统、调试断言、配置文件、异步加载、SaveGame、Level Streaming/World Partition、Live Coding 等原材料未展开的内容。

阅读本文前需要明确几个背景前提：

- **版本口径：** 默认讨论 Unreal Engine 5 的当前体系。一个特别值得注意的新变化是：官方已明确推荐 UObject 成员引用尽可能使用 `TObjectPtr<T>`，很多早期 UE4 教程里"`UPROPERTY() UObject*` 就完事"的说法已经过时。
- **面试定位：** 本文是八股清单，不是官方文档。每个知识点给出"标准回答思路 + 机制解释 + 高频陷阱"，用于帮助组织语言，而不是替代对源码和官方文档的阅读。
- **术语约定：** UE 指 Unreal Engine；UCLASS/UPROPERTY/UFUNCTION/USTRUCT/UENUM 是 UE 的反射宏；UObject 是 UE 所有运行时对象的基类；GC 指垃圾回收（Garbage Collection）；UHT 指 Unreal Header Tool（UE 头文件工具）；UBT 指 Unreal Build Tool（UE 构建工具）。

### 核心内容

#### 第一梯队：UObject、反射与 UHT——UE C++ 的地基

这一梯队是整条知识链的地基。面试官默认你完全掌握，答错任何一个都会让后面的追问失去意义。

**先看一条知识链的串联示范。** 如果只允许先学 20% 的内容，优先级应当是：UObject / 反射 / GC → UObject 指针体系 → 对象生命周期 → CDO → Actor/Component → 资源引用和加载 → Delegate → Tick → 多线程 → 网络同步 → UBT/UHT。这些知识不是孤立的——比如一个看起来很简单的问题：

```cpp
UPROPERTY()
UTexture2D* Icon;
```

实际上可以一路追问：

```text
UPROPERTY 是干什么的？
↓
UHT 怎么知道它？
↓
UHT 和普通 C++ 编译器是什么关系？
↓
反射信息在哪里？
↓
GC 怎么找到这个 UObject？
↓
为什么现在推荐 TObjectPtr<UTexture2D>？
↓
如果不希望 Texture 因为这个对象一起加载怎么办？
↓
换成 TSoftObjectPtr 之后怎么异步加载？
↓
异步回调回来时原 UObject 被 GC 了怎么办？
↓
lambda 捕获 this 安全吗？
↓
回调在哪个线程？
```

一个成员变量声明就能把反射、UHT、GC、指针语义、资源加载、异步线程全部串起来，这就是 UE 面试真正有区分度的地方。本文的梯队顺序正是按这条链展开。

##### 1. 普通 C++ 类和 UObject 有什么本质区别？

普通 C++ 类只是语言层面的类型：

```cpp
class FWeapon
{
};
```

而 UObject 体系下的类：

```cpp
UCLASS()
class UWeapon : public UObject
{
    GENERATED_BODY()
};
```

UObject 并不只是"引擎写的一个基类"。加入 UObject 体系意味着对象能够参与：反射、GC、序列化、编辑器属性、Blueprint、RPC、Replication、对象查找、CDO、资产系统等。UCLASS/UPROPERTY/UFUNCTION/USTRUCT/UENUM 等宏让 UHT 能发现这些声明并生成相应代码。官方的编译过程是两阶段：UBT 先调用 UHT 处理 UObject 元数据并生成代码，然后再交给 C++ 编译器。

##### 2. 反射和 C++ RTTI 是一回事吗？

不是。C++ 的 RTTI（运行时类型识别，Runtime Type Identification）依赖 `dynamic_cast` 和 `typeid`，能力有限且并非所有编译配置都开启。UE 自己实现了一套完整的类型元信息体系：

```text
UObject
   │
   GetClass()
   ↓
UClass
   ├── FProperty
   ├── UFunction
   ├── metadata
   └── superclass
```

例如：

```cpp
Obj->GetClass();
Obj->IsA(UMyObject::StaticClass());
Cast<UMyObject>(Obj);
```

背后靠的是 UE 自己的类型信息，而不是单纯的 `dynamic_cast`。这套元信息不仅描述"对象是什么类型"，还描述"类型有哪些属性、哪些函数、哪些元数据"，是反射、序列化、GC、蓝图、网络复制的公共基础。

展开说：UClass 上挂着一组 FProperty（属性描述）、UFunction（函数描述）和 metadata（元数据）。FProperty 知道属性的名字、类型、偏移、flags，于是编辑器面板才能枚举属性、序列化才能读写属性、GC 才能发现属性里引用的 UObject、蓝图才能暴露属性——同一个反射信息被多方复用。这也解释了为什么"UPROPERTY 到底起什么作用"没有单一答案：它参与的是整个反射驱动体系，而不是某一个子系统。

##### 3. GENERATED_BODY() 到底是什么？

它不是一个神奇语法关键字，而是宏。UHT 扫描头文件之后会生成 `MyActor.generated.h`，里面注入 UE 对该类型需要的胶水代码，包括：

- StaticClass 相关声明
- 注册反射信息
- 序列化相关信息
- 构造相关辅助
- UObject 类型系统胶水

于是 `AMyActor::StaticClass()` 这种能力才能存在。C++ 编译器本身根本不知道 `UPROPERTY(EditAnywhere)` 意味着什么，知道的是 UHT 加 UE runtime。面试时把"UHT 是代码生成器、C++ 编译器只编译生成后的代码"讲清楚，就能证明你不是只会写业务。

##### 4. Cast 机制详解（补充）

UE 提供一组类型转换工具，与 `dynamic_cast` 等价但走 UE 自己的反射系统：

```cpp
UWeapon* Weapon = Cast<UWeapon>(Obj);        // 失败返回 nullptr
UWeapon* Weapon = CastChecked<UWeapon>(Obj); // 失败触发断言，仅在确定类型正确时使用
```

- `Cast<T>`：最常用。类型不匹配时返回 `nullptr`，需要调用方检查空值。适合"可能是某类型"的场景。
- `CastChecked<T>`：类型不匹配时直接触发断言（Debug/Development 构建崩溃），适合"根据上下文必然是该类型"的场景，省去空值判断，但 Shipping 构建中行为退化为不做检查。
- `CastPartial<T>`：用于类型不完整的场景（只前向声明了类），性能更差，仅在无法包含完整头文件时使用。

与 Cast 配套的核心方法是：

- `StaticClass()`：UClass 的静态访问入口，返回该类型对应的 UClass 指针，不依赖实例。
- `GetClass()`：实例方法，返回该实例运行时的 UClass 指针。
- `IsA(UClass*)`：判断对象是否属于某个类或其派生类，是 `Cast` 内部判断的公开形式。

区分三者的关系：`Obj->GetClass() == UWeapon::StaticClass()` 判断"精确类型"，`Obj->IsA(UWeapon::StaticClass())` 判断"是该类或子类"，`Cast<UWeapon>(Obj)` 等价于"IsA 通过后安全转型"。此外，对 UObject 使用 `dynamic_cast` 不是常规做法，UE 类型体系自带的 Cast 才是标准路径；普通 C++ 类之间才用标准 C++ 转型。

##### 5. USTRUCT 反射与序列化（补充）

USTRUCT 是 UE 反射体系中的"值类型"，与 UObject 有本质边界：

```cpp
USTRUCT(BlueprintType)
struct FItemData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 ItemID;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName ItemName;
};
```

USTRUCT 的规则与边界：

- **可以参与反射、序列化、蓝图、编辑器面板**，但不属于 UObject 体系，没有 Outer、没有对象路径、没有 GC 生命周期、不能 AddToRoot。
- **struct 本身不分配 UObject 内存**，它是内嵌在 UObject 属性或栈/堆中的普通数据。因此 GC 不会追踪"一个独立的 struct"，但如果 struct 作为 UPROPERTY 成员挂在某个 UObject 上，struct 内部的 `UPROPERTY() UObject*` 引用仍会被该 UObject 的 GC 引用图追踪。
- **struct 里的 UPROPERTY 规则**：支持绝大部分 specifier（EditAnywhere、BlueprintReadWrite、SaveGame 等），但要注意 struct 没有"实例生命周期"，内部不应持有需要 Outer 管理的资源句柄；跨网络复制 struct 需要配合 `NetSerialize` 或 `ReplicatedUsing` 场景单独设计。
- **序列化**：struct 的 UPROPERTY 字段会被默认的反射序列化自动读写；自定义序列化可以重写 `operator<<` 或实现自定义 `NetSerialize`。

面试高频陷阱：不要把 USTRUCT 当 UObject 用——struct 是值语义，拷贝即复制数据；UObject 是引用语义，拷贝只复制指针。什么时候用 struct（纯数据、需要拷贝、不需要生命周期管理）什么时候用 UObject（需要唯一身份、GC、序列化到资产、蓝图节点持有引用），是 UE 架构的基本功。

#### 第二梯队：对象创建、CDO 与生命周期

##### 6. CDO：类默认对象

CDO（Class Default Object）是 UE 面试超级高频、实际开发也超级重要的概念。每个 UClass 都维护一个类默认对象，官方的定义非常直白：CDO 本质上就是由类构造函数生成的默认模板对象。

```text
AMyCharacter::StaticClass()
            │
            └── CDO
                 Health = 100
                 Speed  = 600
                 Mesh   = ...
```

以后创建实例时，实例的默认属性来自这个模板体系：

```text
CDO
 │
 ├── Actor A
 ├── Actor B
 └── Actor C
```

理解 CDO 的意义在于：构造函数并不只是为"运行时实例"执行，它也为 CDO 执行；蓝图子类继承的默认值、编辑器中看到的默认属性、实例 Spawn 时的初始状态，全都与 CDO 有关。

相关概念 **Archetype（原型/模板对象）**：每个对象都有一个 Archetype，通常是其类的 CDO 或蓝图模板；实例创建时从 Archetype 复制默认值。这也解释了为什么"在构造函数里改了默认值"会影响 CDO、进而影响所有后续实例——构造函数的语义是"定义默认模板"而不是"初始化单个实例"。

##### 7. 为什么 UE 构造函数里不能乱干事情？

这是一个巨坑。比如：

```cpp
AMyActor::AMyActor()
{
    SomeGlobalManager->Register(this);
}
```

你以为"出生一个 Actor，所以注册一下"，但实际上构造函数可能正在构造 CDO。而且 Editor、Blueprint 编译、对象加载过程中都可能发生你意料之外的构造。所以构造函数更适合做：

```cpp
PrimaryActorTick.bCanEverTick = false;
Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
Speed = 600.f;
Health = 100.f;
```

而不是依赖 `GetWorld()`、GameMode、PlayerController、场景 Actor、联网状态、运行时资源。Gameplay 初始化一般应该放到更合适的生命周期（例如 BeginPlay）。官方同样明确建议 Actor/ActorComponent 的运行时初始化放到 BeginPlay 等阶段，而不是把构造函数当普通 C++ 对象初始化来理解。

##### 8. NewObject、CreateDefaultSubobject、SpawnActor 怎么区分？

这是必会题。

**CreateDefaultSubobject** 主要在 UObject/Actor 构造函数中创建默认子对象：

```cpp
Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
```

它创建的是"这个 Class 模板结构的一部分，每个实例默认都有"的 component/subobject，会实例化到这个类的所有实例中。

**NewObject** 用于运行时创建 UObject：

```cpp
UMyObject* Obj = NewObject<UMyObject>(this);
```

官方明确指出 UObject 不应该直接用普通 `new` 创建，而应该使用 UObject 的创建体系（NewObject 及其变体）。

**SpawnActor** 用于创建 Actor：

```cpp
AMyActor* Actor = GetWorld()->SpawnActor<AMyActor>(Class, Transform);
```

因为 Actor 不只是 UObject，它还需要加入 UWorld → ULevel → Actor lifecycle → Components → Tick → Networking。所以不能 `new AActor`，也不应该用 `NewObject<AActor>` 创建场景 Actor。三者选型的本质是问"这个对象是否需要 World 身份"。

进阶场景是 **Deferred Spawn（延迟生成）**：`SpawnActorDeferred` 允许先创建 Actor、修改属性（如初始化数据）后再 `FinishSpawning` 完成生成，常用于需要"生成前注入配置"的对象；它比先 Spawn 再改属性更符合生命周期顺序，避免 BeginPlay 时数据还没就绪的问题。

##### 9. Actor 生命周期

要记住逻辑，而不是死背全部函数。大致流程：

```text
构造
↓
组件创建
↓
Actor Spawn / Load
↓
OnConstruction
↓
Components 初始化/注册
↓
BeginPlay
↓
Tick...
↓
EndPlay
↓
Destroy
↓
GC
```

实际 UE 生命周期比这个复杂很多，特别是 Load From Disk、SpawnActor、PIE、Blueprint、Deferred Spawn 等路径并不完全一样。面试回答应重点区分三个阶段：

- **Constructor（构造函数）：** 建立默认结构——CreateDefaultSubobject、默认属性、Tick 设置。这个阶段没有 World 上下文，不能依赖运行时对象。
- **BeginPlay：** 运行时 Gameplay——获取其他 Actor、访问 World、注册业务系统、开始 Timer。此时组件已注册、World 已可用。
- **EndPlay：** 清理 Gameplay 关系——Unbind Delegate、Stop Timer、注销 Manager。

不要把 Gameplay cleanup 全塞进 BeginDestroy；官方同样建议 gameplay destruction 逻辑主要在 EndPlay 处理。一个经常被追问的细节是：Actor 的 `Destroy()` 不会立刻析构，它会先走 EndPlay，再进入 UObject 的 GC 销毁阶段（BeginDestroy → IsReadyForFinishDestroy → FinishDestroy）；如果 Destroy 后还持有该 Actor 指针，`IsValid()` 才能正确反映状态。

##### 10. Actor、Component、UObject 到底什么时候用？

这是实际架构能力。

**UObject：** 需要反射、GC、序列化、Blueprint，但不需要存在于 World。例如 Inventory Item Instance、技能运行时对象、任务数据、配置对象。

**Actor：** 需要 World 身份、Transform、网络复制主体、生命周期、Tick。例如 Character、Projectile、Pickup、Interactive Object。

**Component：** 是 Actor 的"能力模块"：

```text
Actor
 ├── HealthComponent
 ├── InventoryComponent
 ├── AbilityComponent
 └── InteractionComponent
```

优点是用组合替代继承爆炸：

```text
避免：
AEnemy
 AEnemyWithHealth
  AEnemyWithHealthInventory
   AEnemyWithHealthInventoryInteraction
```

##### 11. UActorComponent / USceneComponent / UPrimitiveComponent 层级

- **UActorComponent：** 没有 Transform，纯逻辑组件。
- **USceneComponent：** 增加 Location、Rotation、Scale、Attachment（挂接关系）。
- **UPrimitiveComponent：** 再增加 Rendering、Collision、Scene representation（场景表示），例如 UStaticMeshComponent、USkeletalMeshComponent。

面试常考一句话总结：PrimitiveComponent 是"可见/可碰撞"的 SceneComponent，SceneComponent 是"有空间位置"的 ActorComponent，ActorComponent 是"不占空间"的纯逻辑模块。

#### 第三梯队：GC 与 UObject 指针体系

##### 12. GC：UE 面试第一大 Boss

一句话：UE 的 UObject 主要使用**可达性分析型 GC**，不是普通引用计数。

```text
Root Set
   │
   ├── A
   │   └── B
   │       └── C
   │
   └── D

E ── F
```

GC 从 Root Set 出发遍历引用图。能访问到的 A、B、C、D 活着；访问不到的 E、F 最终可以回收。Root Set 的来源包括：被 AddToRoot 标记的对象、FReferencer 等显式根引用，以及从"被追踪的 UPROPERTY 引用图"可达的对象。也就是说，一个 UObject 只要还能从任意一个活着的 UObject 的 UPROPERTY 链上找到，就不会被回收；只有彻底不可达才成为垃圾候选。

GC 的触发时机：引擎在 UObject 分配达到一定阈值时自动触发增量 GC（IncrementalPurgeGarbage / CollectGarbage），也可以在关键节点手动调用 `ForceGarbageCollection(true)`；编辑器里还有"Memory 相关的控制台命令"可调试。面试要知道的是：GC 是"延迟"的、按需的，不是对象一失效立刻回收；增量 GC 会拆帧执行降低尖峰，但完全依靠 GC 管理短生命周期对象仍然代价高昂。当前 UE5 的增量 GC 可以借助 TObjectPtr 的写屏障把部分标记工作拆分到多帧，降低单帧 GC 尖峰。

##### 13. TObjectPtr：UE5 的 UObject 强引用

当前 UE5 里这个一定要重新学一遍：

```cpp
UPROPERTY()
TObjectPtr<UWeapon> Weapon;
```

这是现在最常见的 UObject 成员强引用写法。`UPROPERTY + TObjectPtr` 让 GC 知道这条引用：即使没有其他地方引用 Weapon，只要 Owner 活着且这条引用有效，Weapon 就不能因为不可达被 GC。官方当前明确推荐 persistent UObject 字段使用 TObjectPtr<T>；同时新的增量 GC 可借助 TObjectPtr 写屏障跟踪引用变化。

##### 14. TWeakObjectPtr：非拥有弱引用

```cpp
TWeakObjectPtr<AEnemy> Target;
```

语义是："我想知道这个对象，但我不负责让它活着。"对象死掉后 `Target.IsValid() == false`。适合 Target、CachedActor、ObservedObject、异步任务、Delegate callback 这类非拥有关系：

```cpp
if (AEnemy* Enemy = Target.Get())
{
    Enemy->Attack();
}
```

##### 15. TSoftObjectPtr：按路径引用资产

```cpp
UPROPERTY(EditAnywhere)
TSoftObjectPtr<UTexture2D> Icon;
```

它和 `TObjectPtr<UTexture2D>` 最大的区别不是"弱指针"，而是：**Soft Pointer 可以在对象不在内存的时候，仅保存它的资源路径**。假设 Character → Weapon → Skin → Material → Textures → VFX 全部硬引用，结果可能变成"加载 Character → 整条依赖链一起被加载"，于是角色选择界面放 100 个角色配置就会内存爆炸、Loading 变长、首次访问卡顿。Soft reference 只保存路径，只有真正需要的时候才 `RequestAsyncLoad(...)` 加载。官方也专门警告：大量 hard UObject asset reference 会造成级联加载，而 TSoftObjectPtr/FSoftObjectPath 可以用于按需异步加载。

内部表示：`TSoftObjectPtr<T>` 内部持有 `FSoftObjectPath`（含资产路径与子路径），可以序列化为字符串、可以脱离内存仅凭路径存在；`FSoftObjectPath` 是更底层的"路径"类型，TSoftObjectPtr 是"强类型 + 路径"的封装。两者可以互转，Asset Registry 查询、Cook 收录判定都以路径为线索。

##### 16. TWeakObjectPtr 和 TSoftObjectPtr 的区别

这是高频对比题：

| 维度 | TWeakObjectPtr | TSoftObjectPtr |
|------|---------------|----------------|
| 对象当前可能不在内存 | 不主要解决这个 | 是 |
| 是否阻止 GC | 否 | 否 |
| 保存 Asset Path | 否 | 是 |
| 用途 | Runtime 对象弱引用 | Asset 引用/按需加载 |
| 对象 GC 后 | invalid | 仍可能知道资源路径 |

简单记：Weak 是"这个人可能死"；Soft 是"这个人现在甚至可能没来，但我知道他家地址"。

##### 17. TStrongObjectPtr：非 UObject 持有者的强引用

比较新的教程里容易漏掉。用于非 UObject owner 中需要强持有 UObject 的场景：

```cpp
class FMySystem
{
    TStrongObjectPtr<UMyObject> Object;
};
```

因为普通 `class FMySystem` 不能用 `UPROPERTY()`。当前官方建议这类场景可使用 TStrongObjectPtr，但也提醒它会强制影响 GC，因此不应滥用。

##### 18. TSharedPtr 家族：UObject 世界与 C++ 世界

这是另一个特别容易混的东西。TObjectPtr/TWeakObjectPtr/TSoftObjectPtr 是 UObject 世界；而 TSharedPtr/TWeakPtr/TUniquePtr/TSharedRef 主要是普通 C++ 对象世界。

```cpp
class FNode
{
};

TSharedPtr<FNode> Node;
```

- **TUniquePtr：** 唯一所有权。Owner 销毁，对象销毁，近似 `std::unique_ptr`。
- **TSharedPtr：** 引用计数，多个 holder 共享所有权，ref 归零销毁。
- **TWeakPtr：** 不增加引用计数，用来打破 A Shared → B、B Shared → A 的循环引用。
- **TSharedRef：** 类似 TSharedPtr 但是设计上不能为 null，Slate 里特别常见。

核心考点是：不要拿 TSharedPtr 去管 UObject 生命周期——两套生命周期系统不能混用（详见第 19 节）。

##### 19. GC 和引用计数的根本差异

这题值得答深一点。引用计数是 `RefCount = 0 → 马上释放`；GC 是"对象失去可达路径 → 成为垃圾候选 → GC pass → BeginDestroy → FinishDestroy → 释放"。所以：

```cpp
MyObject = nullptr;
```

不等于 UObject 立刻析构。`Actor->Destroy();` 也不等于内存现在立刻 free——Actor 生命周期最后还有 UObject GC 阶段，其中包括 BeginDestroy → IsReadyForFinishDestroy → FinishDestroy。UE 对象是"延迟销毁"模型，这是理解很多"对象还在"诡异现象的前提。

##### 20. IsValid() 为什么比判空重要？

经典事故：

```cpp
if (Actor)
{
    Actor->DoSomething();
}
```

Pointer 非 null 不代表对象仍处于合法可用生命周期。UE 对象可能：不为空 → 已经 Begin Destroy → Pending Kill → 等待 GC。因此 Gameplay UObject 经常用：

```cpp
if (IsValid(Actor))
```

特别是 Timer、Delegate、Async callback、延迟逻辑、网络回调这些"外部可能已使对象失效"的场景。

##### 21. Outer 是什么？

又一个容易学错的概念。`NewObject<UMyObject>(Owner)` 中的 Owner 就是新对象的 Outer。Outer 主要参与：对象命名空间、层级关系、Package、序列化、对象路径、对象归属。比如对象路径可以类似：

```text
/Game/MyMap.MyMap:PersistentLevel.Actor.Component
```

它体现了一层对象 containment（包含关系）。但非常重要：**不要简单把 Outer 理解成 C++ unique_ptr 式"生命周期 owner"**。"我是它的 Outer"并不意味着你可以完全不管 GC 引用关系。这是 UE 初学特别容易踩的坑。

Outer 的实际用途：`GetOuter()` 可以沿层级找到宿主（比如从 Component 找到其 Owner Actor）；对象路径由 Outer 链构成，Outer 影响包归属与序列化；`NewObject` 指定 Outer 也常用于让子对象"挂在"某个父对象名下便于管理与查找。但它不替代 GC 引用——要保证对象存活，仍然需要 UPROPERTY 强引用链或 AddToRoot。

#### 第四梯队：Gameplay Framework

##### 22. Gameplay Framework：必须形成脑图

核心结构：

```text
UGameInstance
     │
     └────────── 跨关卡

UWorld
 │
 ├── AGameMode
 ├── AGameState
 ├── APlayerController
 │       │
 │       └── APawn / ACharacter
 │
 └── APlayerState
```

官方 Gameplay Framework 也把这些作为核心类体系。面试时能把这张图画出来、并说清每个类"负责什么、在哪个机器上存在、生命周期多长"，就已经赢了一半。

补充两个基础概念：

- **UWorld（世界）：** 是关卡、Actor、子系统、网络复制的容器，一个游戏进程可以有多个 World（客户端世界、服务器世界、编辑器 PIE 世界）。几乎所有"我要在当前关卡里找东西/生成东西"的操作都从 `GetWorld()` 出发。
- **ULevel（关卡）：** 是 World 内部的子结构，承载 Actor 集合；World 可以有多个 Level（配合 Level Streaming 动态加载/卸载）。World 与 Level 的关系是"世界包含关卡、关卡包含 Actor"。

##### 23. GameInstance 与跨关卡状态

GameInstance 的生命周期大体覆盖：游戏启动 → 地图 A → 地图 B → 地图 C → 游戏关闭。所以适合放：账号、跨局状态、Online Session、全局 Gameplay 服务；而不是当前地图中的 Enemy Manager。判断标准是"这个状态是否需要跨地图存活"。与之对比：UWorld 随关卡切换重建，UWorldSubsystem 随之销毁；而 GameInstance 从游戏进程启动到退出一直存活，是"进程级单例"。

##### 24. GameMode 和 GameState

多人游戏面试必问。

**GameMode** 承载核心规则：谁可以加入、Spawn 什么 Pawn、比赛怎么开始、胜负怎么算。网络游戏中 GameMode 主要存在于服务器，客户端不能靠 `GetGameMode()` 获取权威比赛数据。

**GameState** 保存所有客户端需要知道的全局比赛状态：Game Time、Score、Match State、Objective。它会参与 replication。官方文档明确区分：Game State 和 Player State 用于在 authoritative server（权威服务器）与客户端之间同步状态，而 GameInstance 本身并不复制。

一个很好记的原则：**规则 → GameMode；规则产生的公共状态 → GameState。**

##### 25. PlayerController、Pawn、Character、PlayerState

- **PlayerController：** 代表"这个玩家在控制谁"，负责输入、Possession（占控）、Camera coordination、RPC ownership、UI coordination。
- **Pawn：** 代表"被控制的东西"，例如人、飞机、坦克、无人机。
- **Character：** 是加强版 Pawn：Pawn + Capsule（胶囊体）+ SkeletalMesh + CharacterMovement（角色移动）。
- **PlayerState：** 代表"玩家本身在这场局里的状态"，例如名字、队伍、比分、Ping、Gameplay statistics。即使 Pawn 死了又 Respawn（Pawn A destroyed → Pawn B spawned），PlayerState 可以继续存在。

##### 26. Subsystem：受管生命周期的系统

以前大家喜欢 SingletonManager、GlobalManager、ManagerActor、GameInstance 巨无霸；现在很多系统更适合：

- UEngineSubsystem
- UGameInstanceSubsystem
- UWorldSubsystem
- ULocalPlayerSubsystem
- UEditorSubsystem

Subsystem 最大优势是**生命周期和所属 Engine/GameInstance/World/LocalPlayer 自动绑定**，官方定义就是"自动实例化、受管理生命周期的类"。比如 MatchManager 如果严格属于一个 World，用 UWorldSubsystem 比硬塞进 GameInstance 干净很多。面试加分点是能说明：Subsystem 与 ManagerActor 的区别在于不需要自己处理 World 切换、不需要手动创建/销毁。

获取方式由引擎统一管理：

```cpp
UMyWorldSubsystem* Sub = GetWorld()->GetSubsystem<UMyWorldSubsystem>();
UMyGameInstanceSubsystem* Sub = GetGameInstance()->GetSubsystem<UMyGameInstanceSubsystem>();
```

Subsystem 的 `Initialize()` / `Deinitialize()` 对应生命周期起止，业务初始化应放这两个回调而不是构造函数。

##### 27. 数学基础：FVector / FTransform / FRotator / FQuat（补充）

UE 游戏逻辑几乎每天都在跟这四类数学类型打交道，面试常以"说说这几个类型怎么选"的形式出现。

- **FVector：** 三维向量，表达位置（Position）或方向（Direction），是最基础的数学类型。
- **FRotator：** 欧拉角旋转（Pitch/Yaw/Roll）。直观、适合编辑，但插值不保证最短路径，且存在万向锁（Gimbal Lock）问题。
- **FQuat：** 四元数旋转。无万向锁，插值平滑（Slerp 球面插值），是引擎内部旋转的主流表示，但不直观，不适合直接给设计师编辑。
- **FTransform：** 组合变换，包含 Translation（位置）+ Rotation（旋转）+ Scale（缩放），是 Actor/Component 在场景中完整空间状态的容器。

转换关系：

```cpp
FQuat Quat = FRotator(0.f, 90.f, 0.f).Quaternion(); // 欧拉角 → 四元数
FRotator Euler = Quat.Rotator();                     // 四元数 → 欧拉角
FTransform Trans = FTransform(Quat, FVector(0,0,100), FVector::OneVector);
FVector Location = Trans.GetLocation();
FRotator Rotation = Trans.GetRotation().Rotator();
```

高频陷阱：两个 FRotator 直接做线性插值可能绕远路；旋转叠加的语义在欧拉角下容易混乱，做动画、朝向、物理旋转时优先用 FQuat；比较旋转不要用 `==`，而要用角度差或四元数点积判断接近程度。

FVector 常用运算也要熟练（面试常以"怎么判断朝向/距离"的形式出现）：

```cpp
FVector Dir = (Target - Pos).GetSafeNormal();   // 归一化方向
float Dist = FVector::Dist(A, B);                // 距离
float Dot = FVector::DotProduct(A, B);           // 点积：判断夹角/朝向
FVector Cross = FVector::CrossProduct(A, B);     // 叉积：求垂直向量/面法线
bool bInFront = FVector::DotProduct(Forward, ToTarget) > 0.f;
```

判断"目标是否在面前/身后"就是点积正负；求"转向目标"常用 `FMath::FindLookAtRotation` 或 Quat 的 Slerp 插值。

##### 28. 碰撞系统：Channel / Object Type / Response / Profile（补充）

UE 的碰撞是一套"分类 + 响应规则"体系，概念容易混，但必考：

- **Collision Channel（碰撞通道）：** 引擎预定义或项目自定义的分类，如 `ECC_WorldStatic`、`ECC_WorldDynamic`、`ECC_Pawn`、`ECC_Visibility`、`ECC_Camera`，自定义通道在 Project Settings 中声明（如 `ECC_GameTraceChannel1`）。
- **Object Type（对象类型）：** 描述"这个物体是什么"，一个 PrimitiveComponent 有唯一的 Object Type，可自定义（如"玩家""敌人""子弹"）。
- **Response（响应）：** 两个通道相遇时的行为——Ignore（忽略）/ Overlap（重叠触发 Overlap 事件，不阻挡）/ Block（阻挡，触发 Hit 事件）。
- **Collision Profile（碰撞预设）：** 把"该物体对各个通道的响应"打包成一个命名配置，例如 Pawn、CharacterMesh、WorldStatic 等预设，组件直接引用 Profile 名，避免到处手写响应矩阵。

查询与事件两条线：

```cpp
// 查询：主动射线/形状检测
FCollisionQueryParams Params;
Params.AddIgnoredActor(this);
FHitResult Hit;
bool bHit = GetWorld()->LineTraceSingleByChannel(
    Hit, Start, End, ECC_Visibility, Params);

// 响应：碰撞事件（需要组件 CollisionEnabled 为 QueryOnly/QueryAndPhysics）
// OnComponentHit / OnComponentBeginOverlap / OnComponentEndOverlap
```

高频陷阱：`LineTraceSingleByChannel` 走的是"通道对通道"的响应矩阵，而 Profile 是组件侧的预设；查询方用通道，被查询方用 Object Type + Response，两侧配置不一致是"明明设置了 Block 却穿过去"的常见根因。

#### 第五梯队：容器与字符串

##### 29. TArray：别只会 Add

TArray 可以理解成 UE 世界里的 dynamic contiguous array（动态连续数组），和 `std::vector` 在很多性质上类似，官方也把它描述为最常用、连续有序的 UE 容器。例如 `TArray<FEnemy> Enemies;`。你至少要知道这些接口：Add、Emplace、Reserve、Reset、Empty、Remove、RemoveAt、RemoveAtSwap、Find、FindByPredicate、Sort。

接口语义辨析（面试常问）：

- `Add` / `AddUnique`：普通追加 vs 去重追加（AddUnique 内部要线性查找，成本更高）。
- `Remove` / `RemoveAt` / `RemoveAtSwap`：按值删除（需要 operator==）vs 按下标删除 vs 无序删除。
- `Reset` / `Empty`：Reset 保留容量只清元素（再次 Add 不触发重新分配），Empty 释放容量。
- `Find` / `FindByPredicate` / `IndexOfByKey`：按值查找 vs 按条件查找 vs 按键字段查找。
- `Sort` / `StableSort`：稳定排序保证相等元素的相对顺序不变。
- `IsValidIndex` / `IsEmpty` / `Num`：边界检查与容量查询，访问前先判断。

##### 30. Add 和 Emplace 的区别

```cpp
Array.Add(FEnemy(...));    // 创建临时对象 → move/copy 到数组
Array.Emplace(...);        // 直接在容器存储位置构造
```

Emplace 本质和 `std::vector::emplace_back` 类似，可以直接在容器存储位置构造，避免临时对象。不过现代编译器加 move 优化下，不要见 Add 就条件反射喊性能差。

##### 31. Reserve 为什么重要？

```cpp
TArray<FVector> Points;
for (...)
{
    Points.Add(...);
}
```

容量可能不断翻倍：4 → 8 → 16 → 32 → 64 → 128……中间涉及 allocate、move/copy、free。如果提前知道数量：

```cpp
Points.Reserve(10000);
```

能减少 realloc（重新分配）次数。

##### 32. TArray 指针失效问题

特别实战：

```cpp
FEnemy* Enemy = &Enemies[0];
Enemies.Add(...);
Enemy->Attack(); // 可能悬空
```

如果 Add 导致 TArray realloc，旧内存被替换、旧指针已经悬空，继续访问就是未定义行为。这个问题既是 UE 题，也是标准 C++ 容器基本功。

##### 33. RemoveAt 和 RemoveAtSwap

普通删除 `RemoveAt` 为了保持顺序，后面的元素要移动；`RemoveAtSwap` 可以把最后一个元素顶过来：

```text
A B C D E    remove C（普通删除）
A B D E      后面的元素移动

A B C D E    RemoveAtSwap(C)
A B E D      最后一个元素顶替，顺序改变
```

所以不需要保持顺序时，RemoveAtSwap 往往更便宜。

##### 34. TMap / TSet 与哈希

底层核心是 Hash，查找平均 O(1)，前提是 hash 分布合理。自定义类型作为 Key 通常涉及：

```cpp
struct FItemKey
{
    int32 Type;
    int32 Level;

    bool operator==(const FItemKey& Other) const;
};

uint32 GetTypeHash(const FItemKey& Key);
```

TSet 本质特别适合：唯一元素 + 不关心顺序 + 高频查询。官方也明确将其描述为基于元素自身 key/hash 的快速 unique container。

高频追问点：

- **TMap 与 TArray 的查找取舍：** 数据量小（几十个）时 TArray 线性查找可能更快——没有哈希开销、缓存友好；数据量大、查询频繁时 TMap 的 O(1) 才真正体现优势。面试别只会背"TMap 快"。
- **GetTypeHash 质量：** 哈希函数分布差（例如所有 key 撞到同一个桶）会让 TMap 退化成链表式查找，自定义 key 时必须提供分布良好的 GetTypeHash 和与之一致的 operator==。
- **遍历删除：** 容器遍历中删除元素会使迭代器失效，UE 容器支持反向遍历删除或收集待删索引后统一删除。
- **TMap 的稀疏性：** TMap 底层是稀疏数组，元素删除后不紧凑，大量增删会积累空洞，必要时用 Compact 清理。

##### 35. FString、FName、FText

巨高频。可以直接记：

- **FString →** 我要操作字符串（可变数据、拼接、路径处理、日志）。
- **FName →** 我要当 ID / Name（Socket Name、Bone Name、Row Name、Gameplay identifiers、Parameter names、Object names）。
- **FText →** 我要给玩家看（UI、Dialog、Quest Description、Button、Localization）。

FName 背后有 UE 维护的 Name Pool/Table，所以 `FName A(TEXT("Head")); FName B(TEXT("Head"));` 比较不需要每次逐字符比较整串——FName 保存的是全局唯一字符串表相关索引及实例信息，用于快速 lookup/comparison。并且 FName 不适合作为用户界面可本地化文本。FText 是 UE Localization 的核心字符串类型，本地化文本语义，面向 UI 和国际化。

面试常见追问与陷阱：

- **三者转换：** FString 转 FName 用 `FName(*Str)`；FString 转 FText 用 `FText::FromString`（不做本地化）；FText 转 FString 用 `ToString()`（仅用于显示/日志，不用于逻辑比较）；FName 与 FText 互转要谨慎，FText 的键语义与 FName 不同。
- **FName 的池：** 运行时动态创建大量唯一 FName 会不断向 Name Table 添加条目，**不会自动释放**，这是"动态拼接字符串转 FName 做 key"导致内存增长的根因。
- **FString 的性能：** 动态字符串拼接、反复 ToString、在热路径里做字符串比较都是 GameThread 性能问题的常见来源，能用 FName 当 key 就不要用 FString。
- **FText 的本地化：** 直接写死 `FText::FromString(TEXT("Hello"))` 无法进本地化流程，应使用 `NSLOCTEXT` / `LOCTEXT` 宏或 `FText::Format`；这也是"给玩家看的文本必须 FText"这条规则背后的原因。

#### 第六梯队：Delegate、Timer、Tick 与回调

##### 36. Delegate：类型安全的事件解耦

Delegate 可以理解成**类型安全的 callback**。例如 HealthComponent 受伤时广播 HealthChanged Delegate，UI、Audio、VFX 各自监听，HealthComponent 不需要知道 HealthBarWidget、BloodVFX、AudioManager 存在。这就是解耦。

##### 37. Single / Multicast / Dynamic Delegate

官方当前文档按 Single / Multicast / Dynamic 对 Delegate 分类：

- **Single Delegate：** 只能绑定一个 callback：`Delegate → Function`。
- **Multicast Delegate：** 可以绑定多个：UI、Audio、VFX 各自监听。Multicast 通常没有返回值，因为"五个监听者的话，返回谁的？"官方也明确指出 multicast delegate 不支持返回值。
- **Dynamic Delegate：** 走 UE Reflection，因此可以被 Blueprint、序列化、UFUNCTION 使用，但代价通常比 native delegate 更高。所以只在 C++ 内部用，优先 native delegate；确实要 Blueprint exposure/serialization 再用 Dynamic。

使用细节：声明用 `DECLARE_DELEGATE` / `DECLARE_MULTICAST_DELEGATE` / `DECLARE_DYNAMIC_MULTICAST_DELEGATE` 系列宏；广播前对单播检查 `IsBound()`、对多播用 `Broadcast()`；解绑用 `Clear()` / `Remove()`。一个常被问到的细节是：多播委托广播期间修改绑定列表（增删监听者）是危险的，应该在广播之外管理绑定关系。

##### 38. AddRaw / AddUObject / AddSP / AddLambda 与生命周期

四种常用绑定方式各有权属语义：

- `AddRaw(this, &FMyClass::OnEvent)`：绑定裸指针，**不持有生命周期**，this 销毁后广播即悬空崩溃，必须保证解绑时机。
- `AddUObject(this, &UMyClass::OnEvent)`：绑定 UObject 成员函数，内部用弱引用跟踪，UObject 失效后绑定自动失效，相对安全。
- `AddSP(SharedPtr, ...)`：绑定 TSharedPtr 管理的对象，共享指针持有权，对象随引用计数释放，适合非 UObject 的共享对象。
- `AddLambda(...)`：绑定匿名 lambda，灵活但难解绑（没有稳定函数身份），适合一次性或明确作用域的监听。

真正危险的是生命周期。假设：

```cpp
Delegate.AddRaw(this, &FMyClass::OnEvent);
```

如果 this 已销毁而 delegate 仍在，Broadcast 就是悬空指针崩溃。所以要理解不同 binding 对象的生命周期语义，尤其异步代码：

```cpp
Async(..., [this]()
{
    DoSomething();
});
```

属于 UE 客户端 crash 大户——task 回来的时候 Actor/Widget/UObject 可能早没了。这时候经常需要：

```cpp
TWeakObjectPtr<UMyObject> WeakThis = this;

// 回调内
if (UMyObject* Strong = WeakThis.Get())
{
    ...
}
```

官方甚至给出了 weak UObject + lambda、再在需要时 pin 成强引用的模式。

##### 39. Timer 机制（补充）

Timer（定时器）由 FTimerManager 统一管理，是"低频延迟逻辑"的标准工具：

```cpp
FTimerHandle Handle;
GetWorld()->GetTimerManager().SetTimer(
    Handle, this, &AMyActor::OnTimerFire, 2.0f, true); // 2 秒后触发，循环执行
```

关键点：

- **生命周期：** Timer 与绑定的 UObject 绑定，对象销毁后对应的 Timer 会失效（管理器持有弱引用检查）；但反过来，**对象还活着时忘了 ClearTimer，Timer 会持续持有回调引用**，是延迟释放和幽灵逻辑的来源。EndPlay 中应清理自己创建的 Timer。
- **FTimerHandle 是句柄：** 用它 ClearTimer、IsTimerActive、IsTimerPaused、SetTimerRate 等；句柄可复制，不能跨 World 使用。
- **与 Tick 的取舍：** 低频逻辑（每秒一次、事件间隔触发）用 Timer 比 Tick 便宜得多——Tick 每帧都跑，Timer 只在到期帧跑；需要每帧连续更新的逻辑才用 Tick。`SetTimerForNextTick` 可以在下一帧执行一次，适合"本帧结束后再处理"的队列化需求。
- **注意：** Timer 回调默认在 GameThread 执行，不要在回调里做重活；循环 Timer 修改自身 Rate 时注意句柄语义。

##### 40. Tick：能不用就别无脑用

最典型反例：

```cpp
void Tick(float DeltaTime)
{
    FindPlayer();
    GetAllActorsOfClass();
    UpdateSomething();
}
```

1000 Actors × 60 FPS = 60000 calls/second，再每个 Tick 做查找就是灾难。

但 Tick 的正确认知是：**Tick 本身不是邪恶，问题是"高频调度 × 大量对象 × 无意义工作"**。UE Tick 可以 Enable/Disable、TickInterval、TickGroup、Prerequisite，官方支持 `TG_PrePhysics`、`TG_DuringPhysics`、`TG_PostPhysics` 以及 Tick dependency。所以不要简单回答"Tick 性能很差所以不能用"，正确说法是：Tick 是合法的 frame update 工具，但要控制 Tick 对象数量、工作量、频率以及依赖关系；低频逻辑可 Timer/Event 驱动，大规模对象更适合集中式更新或数据导向处理。

控制手段示例：

```cpp
PrimaryActorTick.bCanEverTick = true;
PrimaryActorTick.TickInterval = 0.1f;   // 每 0.1 秒 Tick 一次，而不是每帧
PrimaryActorTick.TickGroup = TG_PrePhysics; // 指定更新组
```

TickInterval 是"降频"的最直接手段——很多"每帧其实没必要"的逻辑（UI 刷新、低频扫描）改成间隔 Tick 即可显著减负；TickGroup 用于控制不同类别对象之间的执行顺序（如物理前/物理中/物理后）。

##### 41. 为什么会出现"一帧延迟"的 Bug？

例如 Character Tick 更新 Position，Camera Tick 读取 Character Position，如果实际执行顺序是 Camera 先于 Character，Camera 每次读到的是上一帧位置，于是产生抖动、延迟、Camera lag。这时候应该：

```cpp
CameraComponent->AddTickPrerequisiteActor(Character);
```

而不是"再把 Camera TickGroup 改来改去试试看"。官方特别指出 Tick prerequisites 可以用来解决这种局部依赖，而不必把整个对象组切换到另一个 Tick Group。

##### 42. 输入系统：Enhanced Input 与旧输入系统（补充）

UE5 的输入系统已经全面转向 Enhanced Input（增强输入），但旧系统仍大量存在，面试常考对比。

**旧输入系统（Legacy Input）：** 通过 `BindAxis` / `BindAction` 直接把轴/动作绑定到回调，简单直接，但配置散落在 PlayerController/Pawn 代码里，切换控制方案困难：

```cpp
PlayerInputComponent->BindAxis("MoveForward", this, &AMyPawn::MoveForward);
PlayerInputComponent->BindAction("Jump", IE_Pressed, this, &AMyPawn::Jump);
```

**Enhanced Input：** 引入三层概念——Input Action（输入动作，描述"移动""跳跃"这类语义）、Input Mapping Context（映射上下文，把具体按键映射到动作，可运行时动态添加/移除）、Modifier/Trigger（修饰器与触发器，如长按、连击、摇杆死区）。Pawn/Character 在 Possess 时添加 Mapping Context：

```cpp
if (APlayerController* PC = Cast<APlayerController>(GetController()))
{
    if (UEnhancedInputLocalPlayerSubsystem* Sub =
        ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
    {
        Sub->AddMappingContext(DefaultMappingContext, 0);
    }
}
```

对比要点：

- Enhanced Input 把"按键绑定"从代码解耦到资产，支持运行时按 Context 优先级切换（UI 打开时禁用移动、不同操控模式切换）。
- Trigger/Modifier 体系让"长按蓄力""双击闪避""组合键"不用手写状态机。
- 旧系统简单直接、启动成本低；新系统灵活、可配置、是 UE5 官方推荐路径。
- 高频陷阱：切换 Pawn、Controller 和 InputComponent 时要重新检查绑定有效性；Enhanced Input 的回调参数是 `FInputActionValue`，不要和旧系统的 float/Key 混用。

#### 第七梯队：多线程与渲染线程

##### 43. UE 常见线程模型

先记 UE 常见线程：Game Thread（游戏线程）、Render Thread（渲染线程）、RHI Thread、Task Worker Threads（任务工作线程）、Audio Thread（音频线程）、Loading Threads（加载线程）等。

各线程职责速览：

- **Game Thread（游戏线程）：** 绝大多数 Gameplay 逻辑、Actor/Component、蓝图、物理逻辑入口在此执行，是"主线程"。
- **Render Thread（渲染线程）：** 从 Game Thread 接收场景数据，构建渲染命令。
- **RHI Thread：** 把渲染命令翻译成具体图形 API（DX12/Vulkan 等）调用提交给 GPU。
- **Task Worker Threads：** 执行异步任务（UE::Tasks/TaskGraph 的任务）。
- **Audio Thread：** 音频处理与混音。
- **Loading Threads：** 资产异步加载/IO 解压。

面试答多线程问题前先画这张线程地图，再谈"哪些对象属于哪个线程、数据怎么跨线程"，就比直接背结论稳得多。

##### 44. 最重要原则：UObject 默认不是随便跨线程摸的

很多人写：

```cpp
Async(EAsyncExecution::ThreadPool, [this]()
{
    Actor->SetActorLocation(...); // 危险
});
```

非常危险。Actor/Component/大量 Gameplay UObject 主要应该在 Game Thread 操作。正确思路通常是：

```text
GameThread
↓
采集纯数据 Snapshot（如拷贝 Actor Transform 到 FVector / plain structs）
↓
Worker
↓
纯计算
↓
GameThread
↓
应用结果（如 SetActorLocation）
```

如果工作线程确实需要把结果交还 Game Thread，标准做法是显式派发而不是直接摸 UObject：用 `Async(EAsyncExecution::TaskGraphMainThread, ...)` 把回调排回主线程、用 `ENQUEUE_RENDER_COMMAND` 排给渲染线程，或者在工作线程里只改纯数据、由 Game Thread 的下一帧 Tick 消费。核心原则是：**跨线程传数据，不跨线程传对象**。

##### 45. 为什么 UObject 多线程危险？

因为不仅仅是"变量有没有加锁"，还有：GC、Object lifecycle、World state、Component registration、Delegate、Reflection、Engine subsystem state 都可能假设 Game Thread。官方当前 object pointer 文档特别警告：不应该在 worker thread 上随意解引用 TObjectPtr<UObject>；渲染线程文档则明确说明 Render Thread 不能直接随便访问 Game Thread 的 UObject/Component 状态。

##### 46. UE::Tasks、TaskGraph、ParallelFor、FRunnable 怎么选？

- **UE::Tasks：** 现代 UE 优先考虑，适合大多数小到中型 async work、Task dependency、Job graph。当前 Tasks System 建立在与 TaskGraph 共用的 scheduler/worker backend 之上，并支持 task prerequisites、嵌套任务和 task chain。任务依赖可以用 `UE::Tasks::Launch` 返回的 FTask 句柄组合：

```cpp
using namespace UE::Tasks;
FTask LoadTask = Launch(TEXT("LoadData"), [] { /* 读取数据 */ });
FTask ProcessTask = Launch(TEXT("ProcessData"), [] { /* 处理数据 */ }, LoadTask);
ProcessTask.Wait();
```

依赖关系（prerequisites）由系统调度，而不是自己写"等一会再检查"的轮询。
- **ParallelFor：** 适合 N 个相对独立的工作项：

```cpp
ParallelFor(Count, [&](int32 Index)
{
    Process(Index);
});
```

适合 10000 个 cell、100000 个数据、批量 geometry processing。但工作太小的话 Task scheduling cost > work cost，反而更慢。另外不要往 TaskGraph 塞长期阻塞任务。
- **FRunnable：** 更底层，适合真正需要专属长期线程的场景（持续 IO worker、第三方 SDK、特殊 pipeline），但大多数 Gameplay 并不需要。官方性能文档建议：除非确实需要 dedicated thread，否则优先 Tasks system/thread pool。

##### 47. 锁：会用不等于会多线程

常见同步原语：FCriticalSection、FScopeLock、FEvent、atomics。面试真正要说出四个问题：

- **Race Condition（竞争条件）：** 两个线程同时对同一变量 `Value++`，结果不一定是 +2（读-改-写不是原子的）。
- **Deadlock（死锁）：** 线程 A 持有 Lock A 等待 Lock B，线程 B 持有 Lock B 等待 Lock A，互相等待，全部卡死。解决思路是统一加锁顺序或使用超时锁。
- **Lock Contention（锁竞争）：** 20 个 worker 做并行工作却全等同一把锁，最终是伪并行。
- **False Sharing（伪共享）：** 两个线程修改不同变量，但变量在同一 cache line，导致 cache line 在 CPU core 之间不断 ping-pong。这已经属于高级客户端面试会加分的东西。

工程上的常见选择：短临界区用 `FScopeLock` 包住 FCriticalSection（RAII 保证解锁）；需要线程间信号通知用 FEvent；简单计数器/标志用 `std::atomic` 或 UE 的 `TAtomic`（无锁、避免上下文切换）。加分回答：加锁粒度要尽量小、锁内不要做 IO 或分配；能用原子操作解决的问题不要引入锁；死锁的预防优先于检测。

##### 48. Game Thread 和 Render Thread

这是客户端岗很重要的底层认知：

```text
Game Thread：构建/更新 gameplay scene state
      │
      ↓ commands / proxies
Render Thread：构建 render work
      │
      ↓
RHI
      │
      ↓
GPU
```

关键是：Render Thread 通常不是直接拿着 Game Thread 的 UPrimitiveComponent 任意读。渲染侧有 FPrimitiveSceneProxy 这种 Render Thread representation。官方 threaded rendering 文档明确强调 Render Thread 通常落后 Game Thread 一到两帧，并通过独立 SceneProxy、render command 等机制避免两个线程直接竞争同一 Gameplay 对象。

线程间通信的基本手段是向渲染线程投递命令：

```cpp
ENQUEUE_RENDER_COMMAND(UpdateSceneProxy)(
    [SceneProxy](FRHICommandListImmediate& RHICmdList)
    {
        SceneProxy->UpdateTransform(NewTransform);
    });
```

Game Thread 构造命令闭包，Render Thread 消费执行。正因为数据要通过命令/代理传递，才会出现：

- **为什么 MarkRenderStateDirty：** 通知渲染线程该组件的场景表示需要重建。
- **为什么有 SceneProxy：** 渲染线程持有的、与 Gameplay 对象解耦的渲染侧数据。
- **为什么资源释放需要 Render Fence：** 确保渲染线程不再使用资源后再真正释放。
- **为什么有 ENQUEUE_RENDER_COMMAND：** 跨线程投递工作的标准入口。

这个知识点能解释很多现象，也是客户端岗底层认知的加分项。

#### 第八梯队：资源引用与加载

##### 49. Hard Reference 和 Soft Reference

这是 UE 项目性能中最重要的工程问题之一。

```cpp
UPROPERTY(EditDefaultsOnly)
TObjectPtr<UStaticMesh> Mesh; // 硬引用
```

硬引用会把资产纳入 Reference Graph（引用图），加载该资产时依赖链上的资产会被级联加载。

```cpp
UPROPERTY(EditDefaultsOnly)
TSoftObjectPtr<UStaticMesh> Mesh; // 软引用，只保留资源定位能力
```

所以：高频/必需/小资源 → Hard reference 很自然；低频/巨大/可选/跨角色资源 → 考虑 Soft reference。不是 Soft 永远比 Hard 高级——否则真正使用时每次 Async Load + Wait 也会把系统搞复杂。

##### 50. 同步加载为什么会卡？

```cpp
LoadObject<UStaticMesh>(nullptr, TEXT("/Game/Meshes/SM_Crate.SM_Crate"));
```

对象没在内存时，可能发生：查 package → IO → 反序列化 → 创建 UObject → 加载 dependency → 资源初始化。如果这串发生在 Game Thread，帧时间就可能是：16ms → 16ms → 16ms → 187ms → 16ms，玩家看到的就是"卡一下"。注意同步加载不只是 `LoadObject` 一条路：`TSoftObjectPtr::LoadSynchronous()`、`FSoftObjectPath::LoadSynchronous()`、`FStreamableManager::LoadSynchronous` 都是阻塞式，调用时机的选择比 API 选择更重要。所以大型项目里"什么时候加载、谁负责加载、什么时候卸载、依赖链有多大"本身就是核心架构问题——把加载从 Game Thread 挪到异步、把高频资源预加载、把依赖链拆小，都是围绕这个问题的工程手段。

##### 51. 异步加载细节：FStreamableManager 与 FSoftObjectPath（补充）

软引用拿到手之后，真正的加载动作通常走 FStreamableManager（可流式加载管理器）：

```cpp
FSoftObjectPath Path = SoftMesh.ToSoftObjectPath();

FStreamableManager& Manager = UAssetManager::GetStreamableManager();
TSharedPtr<FStreamableHandle> Handle = Manager.RequestAsyncLoad(
    Path,
    FStreamableDelegate::CreateLambda([WeakThis = MakeWeakObjectPtr(this)]()
    {
        // 回调默认在 Game Thread 执行
        if (UMyActor* Self = WeakThis.Get())
        {
            if (UStaticMesh* Mesh = Cast<UStaticMesh>(Self->SoftMesh.LoadSynchronous()))
            {
                Self->ApplyMesh(Mesh);
            }
        }
    })
);
```

关键点：

- **FSoftObjectPath** 是"路径 + 引用能力"的底层表示，`ToSoftObjectPath()` 可从 TSoftObjectPtr 取出；`LoadSynchronous()` 是阻塞加载，`TryLoad()`/`ResolveObject()` 用于先查内存再决定是否加载。
- **FStreamableManager.RequestAsyncLoad** 返回 TSharedPtr<FStreamableHandle>，可用 `CancelHandle`/`IsLoading`/`BindCompleteDelegate` 管理；Handle 生命周期要持有，否则回调可能被取消。
- **回调线程：** 默认回到 Game Thread，可以安全访问 UObject；但也正因如此，回调里对象可能已被 GC，必须用 Weak 指针在回调内重新 pin。
- **引用保持：** 异步加载期间要确保请求方（通常是 UObject）不销毁，否则回调里访问已销毁对象；这就是"lambda 捕获 this 安全吗"的标准答案——直接捕获不安全，捕获 weak 再 pin 才是安全模式。

##### 52. Asset Manager 是干什么的？

简单来说：更系统地管理 Asset Identity（资产身份）、加载和生命周期。特别是 Primary Asset、Secondary Asset、Asset Bundle、Async load。你可以从"我知道某个 UObject path"升级到"这是一个 WeaponDefinition 类型的资产 ID"，这对大型项目资源管理非常重要。Asset Manager 与 FStreamableManager 配合，是大型项目资源管理的骨架。

##### 53. 一个经典实战问题：Editor 正常，打包后资源找不到

常见原因：编辑器 AssetRegistry 看得到，但 Cooking 不知道它应该被打包；或者写死字符串路径、动态构造资源路径、Soft reference 没被正确纳入 cook、Editor-only dependency。所以"Editor 能 Load" ≠ "Shipping build 一定有这个资源"。这属于 UE 项目很经典的线上坑，排查顺序是：确认引用是否被 Cook 收录 → 检查路径是否在包内 → 检查是否 Editor-only。

#### 第九梯队：网络

##### 54. 网络：先建立正确世界观

UE 网络最核心一句：**Server authoritative（服务器权威）**。真正的 Game State 在 Server，客户端主要持有同步过去的代理状态。官方网络文档也是从 authoritative server 向 connected clients replication state 这个模型出发。所有网络问题的分析起点都是"权威在哪、状态在哪、事件在哪"。

配套概念是 **Role / RemoteRole**（角色/远端角色）：每个 Actor 都有 `GetLocalRole()`（本机角色）与 `GetRemoteRole()`（远端角色），取值 `ROLE_Authority`（权威）/ `ROLE_SimulatedProxy`（模拟代理）/ `ROLE_AutonomousProxy`（自主代理）等。判断"这段逻辑应该在谁那里跑"就是看 Role：服务器上是 Authority，拥有输入权的客户端对自己控制的 Pawn 是 AutonomousProxy，其他客户端看到的是 SimulatedProxy。面试时能主动说出"先看 Role 再写逻辑"，比背一堆 API 更能体现网络意识。

##### 55. Replication 和 RPC 不一样

**Property Replication（属性复制）** 适合状态。例如：

```cpp
UPROPERTY(ReplicatedUsing=OnRep_Health)
float Health;
```

Server 设 `Health = 80`，Client 最终收到 `Health = 80`。重点是"我关心最终状态"。

属性要真正参与复制，还需要在 `GetLifetimeReplicatedProps` 中注册：

```cpp
void AMyActor::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME(AMyActor, Health);
}
```

面试常问"为什么我写了 ReplicatedUsing 却没同步？"——多半是漏了 DOREPLIFETIME 注册，或者该 Actor 没有 `bReplicates = true`。

**RPC** 适合事件/行为：Fire、PlayImpact、RequestInteract。调用后远程执行。

##### 56. RepNotify 为什么好用？

```cpp
UPROPERTY(ReplicatedUsing=OnRep_Weapon)
TObjectPtr<AWeapon> Weapon;
```

客户端收到 Weapon changed 后触发 OnRep_Weapon，在回调里 Update Mesh、Update UI、Play animation，状态和表现可以很好解耦。Epic 当前网络指南甚至直接建议：能用 RepNotify state 表达时，经常比滥用 RPC 更好。

两个高频细节：

- **首次连接也会触发 OnRep：** 客户端进入游戏拿到初始复制快照时，ReplicatedUsing 属性一样会触发 OnRep 回调——所以 OnRep 里不要假设"一定是之后的变化"，要能正确处理初始状态。
- **OnRep 在客户端执行：** 回调在收到复制数据的客户端机器上执行，不要在 OnRep 里修改服务器权威数据；服务端改值直接改即可，不需要也不应该调 OnRep。

##### 57. Server / Client / NetMulticast RPC 与 Ownership

概念上：

- **Server RPC：** Client → Server。
- **Client RPC：** Server → Owning Client。
- **NetMulticast：** Server → Relevant clients。

声明方式示例：

```cpp
UFUNCTION(Server, Reliable)
void ServerRequestFire();

UFUNCTION(Client, Reliable)
void ClientShowHitConfirm();

UFUNCTION(NetMulticast, Unreliable)
void MulticastPlayImpact(FVector Location);
```

但最大坑是：**RPC 能不能执行，和 Ownership（所有权）密切相关**。不是任何客户端拿到某个 Actor 调 `Actor->ServerDoSomething()` 它就一定能送到服务器执行（非 owning client 调 Server RPC 会被拒绝）。所以网络问题调试必须问：谁创建它？谁拥有它？在哪台机器？Role 是什么？Connection 是谁？

##### 58. Reliable 是不是"更好的 RPC"？

不是。Reliable 意味着"必须可靠有序地最终处理"。如果疯狂每帧发 Reliable RPC（Mouse input、Aim update、Movement effect），可能堆积 reliable channel。因此：重要低频事件 → Reliable；高频可丢事件 → Unreliable / 状态复制。Epic 官方网络建议甚至明确提醒不要把高频 Player Input 直接绑定大量 Reliable RPC，否则可能塞满 reliable RPC queue。

##### 59. Replication 优化四件套

必须知道：NetUpdateFrequency、Relevancy、Dormancy、Priority。10000 个 Actor 不是每个 Actor 每帧发给所有 Client，而是回答：这个 Client 关心谁？哪些现在需要更新？谁更重要？谁没变化可以 Dormant？官方建议优化优先级：能不 replicate 就不 replicate → 降低 update frequency → Dormancy → Relevancy。

四个概念的具体含义：

- **NetUpdateFrequency（网络更新频率）：** 控制 Actor 属性复制的节拍，默认值较低即可满足大部分状态同步；高频移动类才需要更高频率。
- **Relevancy（相关性）：** 由服务器判定"该 Actor 对某个连接是否相关"，不相关的连接收不到更新，从源头削减带宽。
- **Dormancy（休眠）：** 对象状态长时间不变时可进入 Dormant 状态，服务器停止对其复制，直到属性变化或显式唤醒。
- **Priority（优先级）：** 服务器在有限带宽下决定"先发谁"，重要对象（玩家、关键目标）优先级高。

大型 Actor 数量项目还会进一步碰到 Replication Graph 和 Iris；当前 UE 网络体系同时包含 Generic Replication、Replication Graph 和 Iris 等方案。

##### 60. UObject 能不能 Replicate？

老八股经常说"只有 Actor 能 Replicate"，这个回答现在不够准确。准确说：**Actor 是 UE 网络复制的主要主体；普通 UObject 可以作为 replicated subobject 跟随 Actor/Component 复制**。当前官方也明确支持 registered subobjects list，并指出这个方式与 Iris 兼容。这在 Inventory Item Instance、Ability object、Equipment instance 类系统里很有用。

#### 第十梯队：UBT、UHT 与模块工程

##### 61. UBT、UHT、Build.cs、Target.cs

这个一定要分清。

**UBT（Unreal Build Tool）** 负责构建整个项目：模块、依赖、Target、编译配置、链接、平台。UE 工程真正的 build graph 不是 Visual Studio .sln，而是 UE Build System。官方明确说明 .sln/.vcxproj 更多是 IDE 辅助，真正构建由 UBT 与 build rules 决定。

**Build.cs** 描述一个模块：每个 Module（如 Inventory、Combat、UI、Gameplay）对应一个 XXX.Build.cs，描述 PublicDependencyModuleNames、PrivateDependencyModuleNames、include paths、definitions、third-party libs。典型结构：

```csharp
using UnrealBuildTool;

public class Inventory : ModuleRules
{
    public Inventory(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "GameplayTags",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "CoreUObject",
            "Engine",
        });
    }
}
```

##### 62. Public 和 Private Dependency 怎么理解？

假设 Module A 的 `Public/A.h` 里公开 `#include "ModuleB/B.h"`，那么使用 A 的模块也需要知道 B——A public API exposes B，通常 B 应作为 **Public dependency**。如果只在 `A.cpp` 里用 B，B 应作为 **Private dependency**。这关系到模块边界、编译依赖、incremental build time、架构耦合。大型 UE 项目编译速度差，很多时候不是电脑不够贵，而是 include/dependency 图已经变成蜘蛛网了。

##### 63. Target.cs

描述"我要构建什么产品"：Game、Editor、Client、Server、Program（当前 UBT Target 类型官方同样包括这些）。所以：Build.cs 决定一个模块怎么构建，Target.cs 决定一整个目标由哪些模块/配置构成。典型形态：

```csharp
public class MyGameTarget : TargetRules
{
    public MyGameTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        ExtraModuleNames.Add("MyGame");
    }
}
```

服务端目标（Dedicated Server）通常在同目录再定义一个 `Type = TargetType.Server` 的 Target.cs，只编译服务端需要的模块。

##### 64. 前向声明为什么很重要？

```cpp
#include "Weapon.h" // 如果头文件只需要 UWeapon* Weapon;
```

很多时候可以：

```cpp
class UWeapon; // 前向声明
```

然后 cpp 再 include。价值是降低 Header dependency。大型 UE 项目中非常重要：改一个头文件 → 几十个依赖它的 header → 几百个 cpp recompilation。这也是 IWYU（Include What You Use，用啥包含啥）思维的核心。

##### 65. Live Coding 热重载机制（补充）

UE 的 Live Coding（热编译）允许在编辑器运行时修改 C++ 并即时生效，不必重启编辑器。机制要点：

- 原理上，UBT 将模块编译成 DLL，Live Coding 监听源码变更 → 触发增量编译 → 将新 DLL 加载进运行中的进程，并重建/更新受影响的 UObject 类型与 CDO。
- 适合：函数体逻辑修改、新增函数、新增普通成员变量等"布局兼容"的改动。
- 局限：**改变类布局（增删 UPROPERTY、改变继承结构、USTRUCT 字段变动）通常需要重启**，否则旧对象内存布局与新代码不匹配，轻则数据错乱，重则崩溃。新增 UCLASS/UPROPERTY 反射信息后，UHT 生成代码变化也可能要求完整重启。
- 与打包构建的关系：Live Coding 是开发期加速手段，不替代 Cook/Package 的正式构建；发布版本仍走完整编译链路。

面试回答加分点：能说清"Live Coding 是模块级 DLL 热替换，不是脚本级热更"，以及它为什么对 USTRUCT 布局变更不友好。

#### 第十一梯队：C++ 基础

##### 66. C++ 本体八股：UE 岗一定会问的部分

不能因为做 UE 就不会 C++。最值得重点掌握：对象生命周期、RAII、virtual、多态、copy/move、左值右值、模板、内存布局、alignment、smart pointer、lambda、const、线程、容器、cache。

##### 67. Virtual 到底发生了什么？

```cpp
class Base
{
public:
    virtual void Foo();
};

class Child : public Base
{
public:
    void Foo() override;
};
```

大多数实现可以抽象理解：每个多态对象带一个 vptr 指向 vtable，调用 `Base* Obj = new Child; Obj->Foo();` 时通过动态分派：vptr → Child::Foo。注意 C++ 标准不要求实现必须叫 vtable/vptr，但主流编译器就是类似机制。

面试常问的延伸：

- **虚函数调用有额外开销：** 一次间接跳转，热路径上高频虚调用可能值得内联化（但 UE 里 UObject 反射调用本身更重，一般不用纠结这一层）。
- **构造/析构与虚函数：** 构造函数和析构函数中调用虚函数不会动态分派（绑定到当前正在构造/析构的类），因为此时派生类部分尚未构造/已销毁。
- **virtual 关键字：** 派生类重写可不写 virtual（隐式虚），但现代风格要求 `override` 显式标注，让编译器检查签名。
- **纯虚函数与抽象类：** `= 0` 声明纯虚函数，含有纯虚函数的类不能实例化，用于定义接口契约。

##### 68. 为什么基类析构通常要 virtual？

```cpp
Base* Obj = new Child;
delete Obj;
```

如果 `~Base()` 不是 virtual，通过 base pointer 删除派生对象是未定义行为，通常表现为派生析构没有被正确调用。所以用于多态删除的基类要写：

```cpp
virtual ~Base() = default;
```

##### 69. override 和 overload

override 是重写：基类有 `virtual void Foo(int);`，派生类 `void Foo(int) override;` 覆盖基类实现。overload 是重载：`Foo(int); Foo(float); Foo(FString);` 同名不同参数。非常基础，但面试天天出现。加分点是主动说明 `override` 关键字能让编译器帮你检查签名是否真的重写了基类虚函数。

##### 70. 指针和引用

```cpp
T* Ptr;  // 可以 null、可以重新指向别处、显式解引用
T& Ref;  // 初始化后绑定对象、语义上应该有效、更像 alias
```

函数如果参数不能为空，`void Process(const FData& Data);` 比 `void Process(const FData* Data);` 表达的 contract 更明确。

##### 71. const 要会到这种程度

```cpp
const T* Ptr;      // 不能通过 Ptr 改 T
T* const Ptr;      // Ptr 本身不能改指向
const T* const Ptr; // 都不能
```

成员函数：

```cpp
int GetHealth() const; // 不修改 observable object state
```

##### 72. 左值右值和 move

```cpp
FString A = TEXT("Hello");
FString B = MoveTemp(A);
```

核心不是"MoveTemp 可以提高性能"，而是"把 A 的资源所有权允许转移给 B，避免复制内部资源"。典型容器 `TArray<FBigData>`：copy 要 allocate + copy N items；move 是 steal buffer pointer，通常便宜很多。但 move 后 A 仍应是合法对象，只是内容状态通常不该再假设。

机制层面：右值引用（`T&&`）绑定到临时值，移动构造函数/移动赋值运算符接收右值，从而"偷走"其内部资源；`MoveTemp` 等价于 C++ 的 `std::move`，把左值显式转成右值以触发移动路径。判断是否真的发生移动，要看类型有没有实现移动语义——自定义类型如果只写了拷贝构造，move 会退化成拷贝。面试加分点：能说清"移动是所有权转移，不是魔法加速；移动后源对象要处于可析构的合法状态"。

##### 73. RAII

这是现代 C++ 最重要思想之一：

```cpp
{
    FScopeLock Lock(&Mutex);
    ...
}
```

退出作用域时 `~FScopeLock()` → unlock，即使 return、exception，资源释放都由生命周期负责。同理：TUniquePtr、TSharedPtr、file handle wrapper、lock guard、scope guard。UE 里大量使用 RAII 包装锁、句柄、作用域事件。

UE 工程里常见的 RAII 场景：

- `FScopeLock`：锁的 RAII 包装，临界区退出自动解锁。
- `TUniquePtr` / `TSharedPtr`：智能指针所有权管理。
- `ON_SCOPE_EXIT`：作用域退出时执行任意清理逻辑（类似 scope guard），适合"函数多处 return 但要统一收尾"的场景。
- 各种 Handle/Guard 类型：渲染命令、动画通知、异步句柄的包装都遵循"构造获得资源、析构释放资源"的模式。

##### 74. Stack 和 Heap

Stack：快、生命周期自动、容量有限、局部性好。Heap：灵活、allocation 成本更高、可能产生碎片、生命周期复杂。不过别背"Stack 一定比 Heap 快"——真正性能问题通常涉及 allocation frequency、cache locality、fragmentation、allocator、object size、access pattern。

UE 相关补充：UE 有自己的一层内存抽象（FMemory / 分配器体系），`new` 在 UE 中默认也走 `FMemory::Malloc`，所以 `TArray` 等容器与 `new` 的内存都归 UE 统计（LLM/MemReport 可见）；大量小对象频繁分配导致的碎片化是客户端常见问题，常用手段是对象池、连续存储（TArray 代替散落指针）、以及把高频对象放入专用池化分配器。

##### 75. Cache Locality：客户端性能真正重要的 C++

```cpp
TArray<FEnemy> // 连续： [E][E][E][E][E]，CPU preload/cache 非常友好
TArray<FEnemy*> // 可能 ptr → anywhere，pointer chasing
```

现代游戏性能经常不是"算法 O(N) 太高"，而是"CPU 在等内存"。这是理解 Mass / ECS / SoA 的基础。

##### 76. AoS 和 SoA

AoS（Array of Structures）：

```cpp
struct Enemy
{
    FVector Position;
    float Health;
    float Speed;
};

Enemy Enemies[10000];
// 内存：P H S | P H S | P H S
```

假如这一轮只处理 Position，CPU 也会不断带入 Health、Speed。SoA（Structure of Arrays）：

```text
Positions[]  P P P P P
Healths[]    H H H H H
Speeds[]     S S S S S
```

做位置运算时 cache/vectorization 都更容易。这就是大量实体系统喜欢 data oriented design（数据导向设计）的原因之一。

更进一步：SoA 布局不仅缓存友好，还天然适合 SIMD（单指令多数据）向量化——连续的内存可以直接装入向量寄存器批量计算。UE 的 Mass Entity、以及各类 ECS（实体组件系统）方案，核心思想就是把"对象属性分散到连续数组"以便并行化与缓存优化；而 AoS 在"一次要访问对象的大部分字段"时反而更好（局部性集中于单对象）。所以面试回答要避免绝对化：布局选型取决于访问模式，不是 SoA 永远正确。

#### 第十二梯队：序列化、配置与存档

##### 77. 序列化与 FArchive

UE 的序列化核心概念之一是 FArchive（归档），可以抽象成：

```text
Data
↔
Archive
```

Archive 可以对应：file、memory、network-ish serialization、reference collection、custom formats。`UObject::Serialize(FArchive&)` 默认处理反射属性，也可以 override 处理 native state。自定义数据类型通过 `operator<<` 接入：

```cpp
FArchive& operator<<(FArchive& Ar, FMyNativeData& Data)
{
    Ar << Data.ValueA;
    Ar << Data.ValueB;
    return Ar;
}
```

面试常问"哪些数据会被序列化"：UPROPERTY 且没有 Transient 的字段默认参与；非反射成员需要手动在 Serialize 里处理；序列化是存档、网络复制、Cook 打包、编辑器保存的公共底层。

##### 78. UPROPERTY 不只负责 GC

这是常见误解。UPROPERTY 参与的事情可能包括：Reflection、Editor exposure、Serialization、Replication、GC reference tracking、Blueprint、Config、SaveGame、Metadata，具体由 Specifier 和 Property flags 决定。例如 `UPROPERTY(EditAnywhere, BlueprintReadWrite)` 和 `UPROPERTY(Transient)` 语义完全不同。

##### 79. Transient 是什么？

```cpp
UPROPERTY(Transient)
int32 CachedResult;
```

意思是：这是 runtime 临时状态，不应该作为正常持久化 property 保存。官方 property flags 同样把 Transient 定义为不应正常保存、加载时按 transient 处理的属性。适合 runtime cache、临时 reference、计算结果。

与 SaveGame 的配合：SaveGame 序列化只保存非 Transient 的 UPROPERTY 字段——运行时缓存、临时引用若标记 Transient，天然不会进存档；反过来，需要持久化的字段绝不能标 Transient。这是"存档字段凭空消失"类问题的常见排查点。

##### 80. 配置文件：UPROPERTY(Config) 与 DefaultEngine.ini（补充）

UE 支持把属性从 ini 配置文件读取，而不需要手写解析：

```cpp
UCLASS(config=Game)
class UMySettings : public UObject
{
    GENERATED_BODY()

    UPROPERTY(Config)
    float Volume;
};
```

关键点：

- `UCLASS(config=Game)` 指定该类读取 `DefaultGame.ini`（常见配置文件有 DefaultEngine.ini、DefaultGame.ini、DefaultInput.ini 等）。
- `UPROPERTY(Config)` 标记的属性会从 ini 对应 Section 读取，也可以在代码里 `SaveConfig()` 写回。
- 配置属性是开发期/运行时调整参数的主要途径，与 SaveGame（玩家存档）是两套东西：Config 面向"开发者/运营调参"，SaveGame 面向"玩家数据持久化"。
- 高频陷阱：Config 属性与 CDO 默认值配合时，加载顺序（ini 覆盖 CDO 默认值）可能造成"改了 ini 没生效"的困惑；改名/删除配置属性后旧 ini 条目会残留。

##### 81. SaveGame 系统（补充）

SaveGame 是 UE 内置的存档方案，本质是"一个特殊 UObject + 反射序列化到槽位文件"：

```cpp
UCLASS()
class UMySaveGame : public USaveGame
{
    GENERATED_BODY()

    UPROPERTY()
    int32 PlayerLevel;

    UPROPERTY()
    TArray<FItemData> Inventory;
};
```

用法：

```cpp
// 保存
UMySaveGame* Save = Cast<UMySaveGame>(UGameplayStatics::CreateSaveGameObject(UMySaveGame::StaticClass()));
Save->PlayerLevel = 5;
UGameplayStatics::SaveGameToSlot(Save, TEXT("Slot1"), 0);

// 读取
UMySaveGame* Loaded = Cast<UMySaveGame>(UGameplayStatics::LoadGameFromSlot(TEXT("Slot1"), 0));
```

关键点：

- 只有 UPROPERTY 标记的字段会被序列化；非反射成员、Transient 属性不会进存档。
- 存档对象内部引用的 UObject 资产（如 UPROPERTY 指向的 DataAsset）会以引用形式保存，依赖引用链完整；不要试图把动态 Actor 直接塞进 SaveGame——应保存"可重建的数据"而非"对象本身"。
- SaveGame 走的是与资产相同的反射序列化体系，因此 USTRUCT 字段、TArray/TMap 等容器都原生支持；自定义序列化类型需要自己处理。
- 存档 IO 是异步的：`SaveGameToSlot` / `LoadGameFromSlot` 默认异步执行，读取结果通过回调/AsyncLoadGameFromSlot 获取；保存大档时不要在热路径同步等待。
- 高频陷阱：存档版本升级（字段增删）需要做迁移逻辑，否则旧档读取后字段错乱或缺失。

#### 第十三梯队：架构选择与性能优化

##### 82. Interface 什么时候优于 Cast？

坏写法：

```cpp
if (Door) ...
else if (Chest) ...
else if (NPC) ...
else if (Vehicle) ...
```

更好的抽象是定义 `IInteractable`，调用方只关心 `CanInteract()` / `Interact()`，不关心对象是 Door、NPC、Lever 还是 Chest。UE Interface 由 UInterface 和 IInterface 两部分组成：U-prefixed 类型负责进入反射系统，I-prefixed 类型是真正的接口声明。

这里有一个很容易阴人的坑：**Blueprint-only implementation 的 interface，不能简单假设 `Cast<IYourInterface>` 和纯 C++ implementation 行为完全一样**。需要理解 ImplementsInterface、Execute_Function、TScriptInterface 这些 UE interface 调用机制。官方也专门说明 Blueprint 实现接口时与纯 C++ Cast 有区别。

调用机制简析：

- **纯 C++ 实现：** 类实现了 I-prefixed 接口，可以 `Cast<IInteractable>(Obj)` 后直接调 `Obj->Interact()`。
- **蓝图实现：** 蓝图类通过"Implement Interface"实现接口，C++ 侧应使用 `Execute_Interact(Obj)`（UHT 为每个接口函数生成的静态执行函数）来调用，它走反射查找到蓝图实现。
- **TScriptInterface：** 一种能同时安全承载"C++ 实现"和"蓝图实现"的接口指针类型，作为 UPROPERTY 声明接口引用时用它。

判断一个对象是否实现接口，用 `Obj->Implements<UInteractable>()`（走反射）而不是简单假设 Cast 一定成功——这正是 Blueprint 接口坑的根源。

##### 83. 继承、Component、Interface、Delegate 怎么选？

可以建立这个判断：

- "它是什么" → inheritance（继承）
- "它拥有什么能力" → component（组件）
- "它能做什么" → interface（接口）
- "某件事发生了，谁想听？" → delegate/event（委托/事件）

例如：Character IS A Pawn；Character HAS InventoryComponent；Character IMPLEMENTS Interactable；HealthComponent BROADCASTS OnHealthChanged。这个架构思维远比背四种 API 重要。

##### 84. 性能优化：第一原则不是优化，是 Profile

碰到"游戏掉帧"，最差答案是直接"把 Tick 优化一下、对象池、多线程、inline"——你甚至不知道瓶颈在哪。正确过程是：先测 CPU? GPU? GameThread? RenderThread? RHI? GPU pass? IO? GC? Network? Memory? 定位后再改。UE 当前官方性能文档也推荐从 Unreal Insights 等工具观察 Game、Render、RHI、Task Pools、Audio、Loading 等线程活动。

完整的性能工作流应该是闭环的：现象 → 假设 → 测量 → 定位 → 修改 → 复测。第一步永远是用工具确认瓶颈线程，第二步才谈优化手段；优化完成后必须复测确认收益，并警惕"优化了 A 导致 B 变慢"的迁移效应。把"先 Profile 再优化"作为默认回答，本身就是面试加分项。

##### 85. 客户端性能应该认识的工具

至少要知道：Unreal Insights、stat unit、stat game、stat gpu、stat memory、stat scenerendering、ProfileGPU、CSV Profiler、MemReport、LLM。面试官如果问"一帧 40ms，你怎么优化？"好的回答不是列 API，而是：先 stat unit → 确定 Game/Render/GPU → Insights/ProfileGPU 定位 → 找到 hotspot → 建立 hypothesis → 修改 → 重新 measurement。

##### 86. 典型 GameThread 性能问题

非常常见：大量 Actor Tick、GetAllActorsOfClass 高频调用、Spawn/Destroy 高频、大量 UObject allocation、Blueprint VM heavy logic、反复 string conversion、频繁 delegate broadcast、大量碰撞查询、同步资源加载、GC spike、锁竞争、任务粒度过小。

对每类的初步对策：

- **大量 Actor Tick：** TickInterval 降频、事件驱动代替轮询、集中式 Manager 统一更新。
- **GetAllActorsOfClass 高频调用：** 缓存结果、用 Subsystem/Manager 维护注册表、按需刷新。
- **Spawn/Destroy 高频：** 评估对象池（见第 87 节）、减少瞬时创建。
- **大量 UObject allocation：** 优先 struct、复用对象、减少短生命周期 UObject。
- **Blueprint VM heavy logic：** 热路径挪到 C++、减少每帧节点图执行。
- **反复 string conversion / delegate broadcast / 碰撞查询：** 缓存字符串与转换结果、合并广播、精简查询数量。
- **同步资源加载 / GC spike：** 异步加载 + 预加载、GC 时机调度。
- **锁竞争 / 任务粒度过小：** 减小临界区、合并任务、避免过度并行化。

##### 87. 为什么对象池不一定万能？

很多人一谈 projectile 就"Object Pool"，但 UE Actor pooling 会带来：Reset state、Component state、Collision、Timer、Delegate、Replication、Ownership、Dormancy、Gameplay Tags、Niagara、Latent actions 全部 reset 问题。所以真正原则是：**当对象创建/销毁已经通过 profiling 证明是瓶颈，并且对象 reset 成本可控时，再考虑 pooling**。别把设计复杂度当免费午餐。

##### 88. GC Spike 怎么理解？

大量 UObject 产生垃圾后，Reachability traversal、标记/清理都需要成本。所以优化不只是"调长 GC interval"，更应该看：为什么产生这么多 UObject？为什么生命周期这么短？是不是普通 struct 就够？是不是重复 Spawn？是不是资产/对象关系不合理？UE 新版本正在进一步支持增量 reachability analysis，把部分 GC 标记工作拆到多帧，并依赖 TObjectPtr write barrier。

工程上的治理思路：

- **减少垃圾产生：** 能用 struct 就不用 UObject、避免高频 Spawn/Destroy、复用临时对象。
- **降低 GC 压力：** 调整 GC 触发阈值、在非关键帧手动 GC、把 GC 调到加载/切场景等"允许卡顿"的时机。
- **缩短可达链：** 检查是否因强引用链把本可回收的对象一直保活（可达性泄漏）——这种对象既不释放也不报错，是隐性内存增长源。
- **配合工具：** 用内存统计工具观察 UObject 数量与类型分布，定位"谁在大量创建 UObject"。

##### 89. 一个非常重要的设计能力：什么时候根本不该用 UObject？

```cpp
struct FPathNode
{
    FVector Position;
    float Cost;
};
```

100000 个寻路节点，如果做成 `UCLASS() class UPathNode : public UObject` 就是离谱——你根本不需要 reflection、editor、blueprint、GC、object identity、serialization，纯 struct 更合理。所以：**UE C++ 不等于所有东西都 UObject 化**。

##### 90. Level Streaming 与 World Partition（补充）

大型关卡的内存管理是 UE 架构绕不开的话题。

**Level Streaming（关卡流送）：** 把大关卡拆成多个 Level，运行时按需加载/卸载：

```cpp
FLatentActionInfo LatentInfo;
UGameplayStatics::LoadStreamLevel(
    this, TEXT("SubLevel_A"), true, false, LatentInfo);
UGameplayStatics::UnloadStreamLevel(this, TEXT("SubLevel_A"), LatentInfo, false);
```

用途：室内外区域切换、剧情区域、多人地图分区。要点是"哪个 Level 何时加载/卸载"的规则设计，以及加载期间避免玩家进入空洞区域。

**World Partition（世界分区）：** UE5 面向开放世界的新方案，编辑器把大地图自动切分为网格单元（Grid），运行时按玩家位置流送单元，不再手动拆 Level。配套概念：Data Layer（数据层，如"白天物体层""夜晚物体层"）、HLOD（分层细节，远处用合并网格）。

对比要点：

- Level Streaming 是"手动控制"的经典方案，适合区域边界明确的关卡。
- World Partition 是"自动按位置流送"的现代方案，适合无缝开放世界；但对 Actor 放置、加载规则、烘焙有额外约束。
- 面试常见追问：流送卸载时对象生命周期如何管理（卸载 Level 里的 Actor 走 EndPlay/Destroy）、流送与网络复制的配合、HLOD 如何降载。

##### 91. 调试与断言：UE_LOG / check / ensure / verify（补充）

UE 的日志与断言体系是日常开发、也是面试判断工程素养的考点。

**UE_LOG：**

```cpp
UE_LOG(LogTemp, Warning, TEXT("Health: %f"), Health);
UE_LOG(LogTemp, Error, TEXT("Failed to load asset: %s"), *AssetPath);
```

Verbosity 级别：VeryVerbose → Verbose → Log → Display → Warning → Error → Fatal。游戏发布版本里 Warning/Error 应保持可见，Log 及以下通常被过滤。工程规范上应自定义 LogCategory 而不是到处用 LogTemp：

```cpp
DECLARE_LOG_CATEGORY_EXTERN(LogCombat, Log, All); // 头文件声明
DEFINE_LOG_CATEGORY(LogCombat);                    // cpp 定义
UE_LOG(LogCombat, Warning, TEXT("Damage: %f"), Damage);
```

自定义 Category 的好处是可以在控制台按类别过滤（`Log LogCombat Verbose`）、按模块开关，便于线上问题定位。格式参数注意：FString 要取 `*Str`，FName 直接传，TCHAR 数组直接传。

**check / ensure / verify：**

- `check(expr)`：Debug/Development 构建下条件为假立即触发断言崩溃；Shipping 构建中被编译掉（表达式不执行）。用于"这里不可能为假"的不变量。
- `ensure(expr)`：条件为假时在 Debug 构建触发断点、记录调用栈，但**不崩溃**（返回 false 让代码继续）；同一表达式多次失败只记录一次，防止刷屏。用于"外部条件可能异常，但可以恢复"的场景。
- `verify(expr)`：与 check 类似，但**表达式在 Shipping 构建中仍会被求值**。用于"表达式本身有副作用（如函数调用）且需要保留"的检查。

高频陷阱：`check` 里不要放有副作用的表达式（Shipping 会被编译掉导致行为差异）；日志参数注意 FString 要取 `*Str` 指针；`ensure` 不是兜底逻辑——它记录错误但代码继续执行，不能依赖它保证状态正确。面试加分点：能说清"check 是不变量、ensure 是可恢复异常、verify 是带副作用的检查"的取舍。

#### 第十四梯队：面试实战与知识地图

##### 92. 开发中最常见的十类事故

把前面的知识点组合起来，真实 Bug 基本长这样：

| 症状 | 常见根因 |
|------|---------|
| 随机 Crash | dangling pointer / async capture this |
| UObject 莫名消失 | GC 引用没保住 |
| UObject 一直不释放 | 强引用链 |
| 切地图 Crash | World 生命周期搞错 |
| 第一帧状态不对 | Tick/order/init timing |
| 偶发卡顿 | Sync asset load / GC |
| Editor 正常、Packaged 挂 | cook / asset path / editor-only |
| Multiplayer 客户端没反应 | authority / ownership / RPC |
| Replication 带宽爆炸 | 高频 RPC / 太多 replicated actors |
| 编译一分钟变十分钟 | module/include dependency 爆炸 |

这十种比背 500 个 API 更接近实际 UE 开发。

##### 93. 连环追问：UE 怎么管理 UObject 内存？

面试官问"UE 怎么管理 UObject 内存"，不要只说"GC"。更完整的回答：

> UObject 生命周期由 UE Object System 管理，主要使用基于可达性的 GC。GC 会从 Root 和被追踪引用形成的引用图判断对象是否可达；UObject 成员长期强引用现在一般使用 UPROPERTY 标记的 TObjectPtr，弱 Runtime 引用用 TWeakObjectPtr，需要按路径引用资产则使用 TSoftObjectPtr。对象不可达后也不是 delete 立即销毁，而会经历 UObject destruction/GC 生命周期。

然后他追"TSharedPtr<UObject> 行吗？"你应该立刻意识到：这是两套生命周期系统，一般不应该拿 TSharedPtr 管 UObject 生命周期。

##### 94. 连环追问：为什么不用 raw pointer？

不要回答"raw pointer 不安全"，因为 `void Foo(UObject* Object)` 完全合理。应该回答：短生命周期局部参数/raw observer 可以用 raw pointer；问题主要在持久 UObject 成员引用。如果它需要进入 GC/reference/serialization/replication 体系，当前 UE5 更推荐 UPROPERTY TObjectPtr<T>。如果只是非拥有 runtime cache，则 TWeakObjectPtr 更能表达语义。这个答案就明显比"裸指针不好"高级。

##### 95. 连环追问：Actor 构造函数和 BeginPlay 区别？

高质量回答：

> Actor 构造函数不仅为 Runtime Actor instance 执行，它也参与 CDO/default object 的构造，所以应该主要建立默认属性和 CreateDefaultSubobject 结构，避免依赖当前 World/GameMode 等运行环境。BeginPlay 才属于 World gameplay 生命周期，更适合依赖其他 runtime Actor、Manager 或网络环境的初始化。

然后继续："如果初始化依赖所有 Component 已经初始化？"这时就开始进入 PostInitializeComponents、BeginPlay 生命周期细节。

##### 96. 连环追问：为什么游戏偶尔卡 100ms？

可以按系统性答：先 profile → 确认 Game/Render/GPU。若 Game Thread，用 Insights 看 stall 时间段，可能是：同步 asset load、GC、Shader/PSO issue、大量 Spawn、IO、锁等待、大批 Component registration。而不是直接"可能 Tick 太多"。

补充具体命令：控制台输入 `stat unit` 会显示 Frame/Game/DrawGPU/RHIT 各项耗时，第一眼就能分辨瓶颈在 Game（逻辑）还是 Draw/GPU（渲染）；`stat game`、`stat gpu` 进一步下钻。面试回答时主动给出"先用 stat unit 分流，再用 Insights 定位 stall 时间段"的路径，比只报原因列表更有说服力。

##### 97. 连环追问：客户端点击开火，网络过程是什么？

一个简化的正确模型：

```text
Client Input
↓
Owning PlayerController/Pawn
↓
Server RPC
↓
Server validate gameplay state
↓
Server creates authoritative result
↓
Replicated state / replicated Actor
↓
Other clients
```

预测型游戏还可能：Client local prediction → Server authority → correction/reconciliation。而不是"Client Spawn Bullet → Multicast 给大家"这么朴素。

##### 98. 再往上的 UE 技术栈

把前面吃透后，还要逐渐扩到这些：Enhanced Input、Gameplay Ability System、Gameplay Tags、Asset Manager、Data Asset / Data Table、Slate / UMG、CommonUI、Animation system、CharacterMovement、Physics / Chaos、Navigation、AI / BehaviorTree / StateTree、Niagara、Audio、Mass Entity、World Partition、Level Streaming、Replication Graph、Iris、Render Graph / RHI、Editor Tooling、Plugin / Module architecture、Automation Tests、Cook / Package / Build Pipeline、Dedicated Server、Platform abstraction。这些不一定所有 UE C++ 岗都问，但不同方向会往不同枝条钻。

##### 99. 学习深度：L1 到 L4

如果是 Gameplay / 客户端岗，建议的学习深度分四层：L1 会用 → L2 知道为什么这么用 → L3 能解释底层机制 → L4 能根据项目约束做 trade-off。例如 TSoftObjectPtr：

- L1：会写 `TSoftObjectPtr<UTexture2D>`。
- L2：知道"避免 hard dependency"。
- L3：知道 soft object path + asset load/cook/reference chain。
- L4：能讨论什么时候 hard 更合理、什么时候 soft；加载策略、生命周期、IO 峰值、内存、preload、Asset Manager 如何设计。

面试真正想招的通常是 L3-L4。

##### 100. 整套 UE C++ 知识地图

最终最好形成这样一张脑图：

```text
UE C++
                       │
       ┌───────────────┼────────────────┐
       │               │                │
      C++            UObject           Engine
       │               │                │
 object model       Reflection       Gameplay
 memory             UHT              Framework
 RAII               GC               World
 template           CDO              Actor
 container          Property         Component
 threads            Serialize        Subsystem
 cache              Pointer          Lifecycle
       │               │                │
       └───────┬───────┴───────┬────────┘
               │               │
             Runtime         Engineering
               │               │
             Tick            UBT
             Async           Modules
             Tasks           Build.cs
             Assets          Target.cs
             Network         Cook
             Render          Package
             Physics         Profile
               │               │
               └───────┬───────┘
                       │
                   Architecture
                       │
             Performance / Scale
```

真正到了比较成熟的阶段，你会发现：UE 八股不是一堆知识点，而是一整套"对象、数据、生命周期和执行线程怎么在一个大型实时引擎里协作"的答案。

##### 101. 七个最值得优先攻克的专题

如果按"面试收益 × 实战收益 × 难度"排，建议按这个顺序深入：

1. **UObject / Reflection / GC / CDO / Pointer：** 做到源码级理解一部分，这是 UE C++ 的核心。只要把 UObject → UClass → CDO → UHT → FProperty → TObjectPtr → Reference Graph → GC → Asset Reference 这一条彻底打通，至少三分之一的 UE 面试题会突然变成同一道题。
2. **Actor / Component / World / Gameplay Framework / 生命周期：** 解决"代码到底放哪"的问题。
3. **C++ 对象模型 / 内存 / 智能指针 / move / cache：** 解决"为什么这个 C++ 写法正确或高效"。
4. **Asset / Hard-Soft Reference / Async Loading / Cook：** 大型 UE 项目必碰。
5. **Delegate / Timer / Tick / Async / UE::Tasks / 多线程：** 随机 crash 和性能问题的重灾区。
6. **Replication / RPC / Ownership / Prediction / RepGraph / Iris：** 联机项目核心。
7. **UBT / UHT / Module / Profile / Render Thread：** 从"会写 Gameplay"进入"真正懂 UE 工程"。

第 1 项应列为最高优先级——它是整张地图的根。

### 总结

UE C++ 八股的本质，是一套"**对象、数据、生命周期和执行线程如何协作**"的答案。从 UObject 与反射的地基出发，UHT 让类型信息可以被引擎发现；CDO 让默认值有单一权威；GC 用可达性而非引用计数管理内存，于是产生了 TObjectPtr/TWeakObjectPtr/TSoftObjectPtr 这一整套指针语义；Actor/Component 与 Gameplay Framework 回答"代码放哪、状态归谁"；Delegate/Timer/Tick 回答"何时执行"；多线程与渲染线程回答"在哪里执行"；资源引用与网络复制回答"数据如何流动"；UBT/UHT 与 C++ 语言基础回答"工程如何构建"；性能优化与架构选择则把前面的所有机制变成工程判断。

回答这类问题的关键在于一个思维转换：**不要把 UE C++ 当"带宏的 C++"，而要把自己当成"一个大型实时引擎的对象系统工程师"。** 面试官想听到的，不是你会背多少 API，而是你能不能讲清机制层为什么——为什么构造函数不能依赖 World、为什么裸指针成员要换成 TObjectPtr、为什么 Reliable 不等于更好、为什么对象池不是万能、为什么先 Profile 再优化。这些机制互相咬合，追一问往往能串起半张地图。

八股只是入口，源码和官方文档才是权威。如果某个问题在面试现场答不上来，最诚实的策略是承认边界，并展示自己知道去哪里查——这比硬编一个答案更能说明工程素养。

### 知识缺口

本文为面试导向的概览，以下知识点有意未展开，建议按需补充：

- **源码级细节：** FUObjectArray / FProperty 的完整布局、UClass 链与 CDO 生成细节、GC 增量标记与 TObjectPtr 写屏障的具体实现、UHT 生成代码的完整形态。
- **游戏性框架深水区：** Gameplay Ability System（GAS）的完整结构、Gameplay Tags 体系、Data Asset / Data Table 的工程实践、Animation 系统（AnimGraph/State Machine/AnimNotify 全貌）、CharacterMovement 的移动网络模型。
- **网络深水区：** RPC 与属性复制的底层通道、Prediction/Reconciliation（预测与回滚）的完整实现、Replication Graph 与 Iris 的架构对比、Dedicated Server 部署。
- **渲染与底层：** Render Graph / RHI 管线、Slate / UMG 的控件树与性能、Chaos 物理、Mass Entity 的数据导向架构。
- **工程专题：** Cook / Package / Build Pipeline 全流程、自动化测试框架、插件与模块架构的最佳实践、大型项目编译加速方案（IWYU/Unity Build/分布式编译）。

## 元数据
- **创建时间：** 2026-08-20
- **最后更新：** 2026-08-20
- **作者：** 吉良吉影
- **分类：** 跨引擎学习
- **标签：** Unreal Engine, C++, 跨引擎学习, 网络同步, 性能优化, GC
- **来源简注：** 由吉良吉影的agent整理

---
*由吉良吉影的agent整理*





