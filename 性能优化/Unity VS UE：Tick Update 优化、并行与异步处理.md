# Unity VS UE：Tick Update 优化、并行与异步处理

## 摘要
 > 本篇从 **CPU 性能** 出发，拆解 Unity 与 Unreal 的每帧更新循环（Update/Tick），并给出**并行与异步**的落地方案与代码示例。目标是：**把不必要的工作从主线程移走，把必要的工作做得更少、更准、更稀疏**。 ---------- ## 引言：Update/Tick 是怎么“吃掉”帧时间的？ 频繁、分散且无差别地在每帧做事，是 CPU 性能的头号敌人。调...

## 正文



> 本篇从 **CPU 性能** 出发，拆解 Unity 与 Unreal 的每帧更新循环（Update/Tick），并给出**并行与异步**的落地方案与代码示例。目标是：**把不必要的工作从主线程移走，把必要的工作做得更少、更准、更稀疏**。

----------

## 引言：Update/Tick 是怎么“吃掉”帧时间的？

频繁、分散且无差别地在每帧做事，是 CPU 性能的头号敌人。调度学上讲，这会造成**高频短任务洪泛**（大量小任务不停触发），线程切换与缓存失效拖垮整帧。解决方向很朴素：  
1）**减少调用频率**；2）**批处理/合并**；3）**把耗时工作丢到别的线程**；4）**只在必要时启用**。  
在引擎层面，Unreal 提供了更细的 Tick 组织（Tick Group、Tick Interval 等），并把渲染与游戏逻辑分到不同线程；Unity 则用协程、Job System（配合 Burst）与各类异步 API 来分摊主线程压力。

----------

## Tick/Update 优化

### Unity：把 Update 当作“稀缺资源”来用

**1）避免在 Update 里做耗时与分配**

-   I/O、反射、正则、复杂 LINQ、字符串频繁拼接、装箱/拆箱与临时对象分配，都会带来抖动与 GC。
    
-   缓存组件与引用；把热路径上会重复计算的量做**一次性预计算**或搬到 Job/Burst。
    
-   典型坑：`new WaitForSeconds(x)` 等协程定时本质上受 `timeScale` 与帧步长影响，并非严格计时。需要“真时间”请用 `WaitForSecondsRealtime` 或自行做时钟累计。
    

**2）降低 Update 频率：协程 / 自定义定时器**

-   **协程**：把“非每帧必需”的逻辑改成定期跑。例如每 100ms 刷新一次小地图/血条即可。
    
    ```csharp
    IEnumerator RefreshHudRoutine() {
        var wait = new WaitForSeconds(0.1f); // 受 timeScale 影响
        while (true) {
            RefreshHud(); // 轻量逻辑
            yield return wait;
        }
    }
    // 在需要时 StartCoroutine(RefreshHudRoutine());
    
    ```
    
    Unity 官方也建议用协程把“需要周期执行但不必每帧执行”的任务从 Update 中移出。
    
-   **自定义定时器（更稳定）**：用累计时间来“分频”，避免协程与缩放时间带来的误差。
    
    ```csharp
    float _acc; const float Interval = 0.1f;
    void Update() {
        _acc += Time.unscaledDeltaTime;        // 不受 timeScale 影响
        if (_acc >= Interval) {
            _acc = 0f;
            RefreshHud();
        }
    }
    
    ```
    

**3）ECS/DOTS：从“面向对象每帧遍历”切到“数据驱动批处理”**

-   DOTS 的 **Entities**（ECS）用**结构化数组**布局批量处理组件数据；配合 **Burst** 编译器与 **Job System**，把热点循环搬到多核运行。
    
-   以 `IJobFor`/`IJobParallelFor` 为例：对 `NativeArray` 做无分配、可并行的处理，并可 `[BurstCompile]`。
    
    ```csharp
    using Unity.Burst;
    using Unity.Collections;
    using Unity.Jobs;
    using UnityEngine;
    
    [BurstCompile]
    struct IntegrateJob : IJobParallelFor {
        public float dt;
        public NativeArray<Vector3> pos;
        [ReadOnly] public NativeArray<Vector3> vel;
    
        public void Execute(int i) {
            pos[i] += vel[i] * dt; // 简单积分
        }
    }
    
    // 调度：
    void Step(NativeArray<Vector3> pos, NativeArray<Vector3> vel, float dt) {
        var job = new IntegrateJob { dt = dt, pos = pos, vel = vel };
        JobHandle handle = job.Schedule(pos.Length, 64); // batch size
        handle.Complete(); // 或合并到更大的依赖图
    }
    
    ```
    
    _要点_：只在 Job 中使用 `NativeArray` 等原生容器；不要捕获托管对象。`Burst` 与 Job System 协同设计，可显著提升吞吐。
    _关于 ECS 系统形态_：Entities 1.0 提供 `ISystem`/`SystemBase` 等组织形式，`OnUpdate` 中可直接构建 **Entities.ForEach** 或调度 Jobs。
    

----------

### Unreal：让 Tick“只在该来时才来”

**1）AActor 的 Tick 基础**

-   在构造函数启用：`PrimaryActorTick.bCanEverTick = true;`
    
-   覆写：
    
    ```cpp
    // .h
    virtual void Tick(float DeltaSeconds) override;
    
    // .cpp
    AMyActor::AMyActor() {
        PrimaryActorTick.bCanEverTick = true;
    }
    void AMyActor::Tick(float Dt) {
        Super::Tick(Dt);
        // Do lightweight work
    }
    
    ```
    
-   不需要时**关闭 Tick**：`SetActorTickEnabled(false);` 或 `PrimaryActorTick.SetTickFunctionEnable(false);`
    
-   **降低频率**：`PrimaryActorTick.TickInterval = 0.1f;` —— 每 0.1s 才触发一次 Tick。
    
-   **Tick Group**：按帧阶段组织（如 `TG_PrePhysics`, `TG_DuringPhysics`, `TG_PostPhysics`, `TG_PostUpdateWork`），可用于确保依赖顺序与物理一致性：
    
    ```cpp
    PrimaryActorTick.TickGroup = TG_PostPhysics; // 物理后执行
    
    ```
    
    Unreal 的 Tick 会按 **Tick Group** 分批完成后再进入下一组；Actor/Component 默认每帧各 Tick 一次，若设定了 **最小 Tick 间隔** 则会降频。
    

----------

## 并行与异步处理

### Unreal：线程模型、异步加载与 Gameplay Tasks

**1）游戏线程与渲染线程分离**  
Unreal 的渲染器运行在**独立渲染线程**，通常落后游戏线程 1~2 帧；在更底层还可能存在 **RHI 线程** 负责 API 级提交。这使得渲染命令与后台提交得以并行，提高多核利用率。

**2）异步加载（`TSoftObjectPtr` + `FStreamableManager`）**  
通过**软引用**与可追踪路径，按需异步载入资产，避免阻塞主线程/游戏线程。典型写法：

```cpp
// 假设你在 UObject/Subsystem 里
#include "Engine/StreamableManager.h"
#include "Engine/AssetManager.h"

TSoftObjectPtr<UStaticMesh> SoftMesh = TSoftObjectPtr<UStaticMesh>(
    FSoftObjectPath(TEXT("/Game/Props/SM_Rock.SM_Rock")));

void UMyLoader::LoadAsync() {
    FStreamableManager& SM = UAssetManager::GetStreamableManager();
    SM.RequestAsyncLoad(SoftMesh.ToSoftObjectPath(),
        FStreamableDelegate::CreateUObject(this, &UMyLoader::OnLoaded));
}

void UMyLoader::OnLoaded() {
    if (UStaticMesh* Mesh = SoftMesh.Get()) {
        // Mesh 已在内存，可安全使用
    }
}

```

`TSoftObjectPtr` 可直接 `Get()` 命中内存，否则用 `ToSoftObjectPath()` 提交给 `FStreamableManager` 做异步拉起。

**3）Gameplay Tasks：把“非关键任务”放后台**  
`GameplayTasks` 模块提供了**可被调度、可被中止、可声明资源占用**的任务抽象（如 `UGameplayTask_SpawnActor`）。常见做法是在拥有 `UGameplayTasksComponent` 的对象上初始化并激活任务，由引擎的任务系统在后台驱动它直至完成/终止。

```cpp
// 以 SpawnActor 任务为例（示意）
#include "GameplayTask_SpawnActor.h"
UGameplayTask_SpawnActor* Task =
    UGameplayTask_SpawnActor::SpawnActor(this, SpawnTransform, AMyUnit::StaticClass());
Task->ReadyForActivation();

```

更复杂场景可以自定义 `UGameplayTask` 派生类，通过 `InitTask` / `Activate` 生命周期接入，并让系统统一管理取消与资源冲突。

> 备注：纯 CPU 重任务（寻路、网格烘焙、离线生成等）在 UE5 中也常用 `Async(EAsyncExecution::ThreadPool, ...)` 或 UE::Tasks（任务图）实现；本文按大纲聚焦 `GameplayTasks` 与资源加载。

----------

### Unity：Job System 与异步 API

**1）Job System：把循环丢给多核 + Burst**

-   典型并行 Job：
    
    ```csharp
    using Unity.Burst;
    using Unity.Collections;
    using Unity.Jobs;
    using Unity.Mathematics;
    
    [BurstCompile]
    struct BoidsSteerJob : IJobParallelFor {
        public float dt;
        public NativeArray<float3> vel;
        [ReadOnly] public NativeArray<float3> pos;
        public void Execute(int i) {
            float3 v = vel[i];
            // … 邻域/力求和，略 …
            vel[i] = math.normalize(v) * math.length(v);
        }
    }
    
    // 调度：BoidsSteerJob.Schedule(count, 128) -> handle
    
    ```
    
-   用法要点：
    
    -   数据放到 `NativeArray`/`NativeSlice` 等；**不要**在 Job 里访问 `GameObject/Transform`。
        
    -   合理设置 batch size，避免过度切分。
        
    -   尽量 `[BurstCompile]`，把 SIMD 与别名分析交给 Burst。
        

**2）异步 API：场景与资源加载**

-   **场景异步**：
    
    ```csharp
    using UnityEngine.SceneManagement;
    IEnumerator LoadSceneCo(string name) {
        var op = SceneManager.LoadSceneAsync(name, LoadSceneMode.Additive);
        op.allowSceneActivation = false;
        while (op.progress < 0.9f) { yield return null; } // 0.9 == ready
        // 做转场动画/预热
        op.allowSceneActivation = true;
    }
    
    ```
    
    `LoadSceneAsync` 在后台加载场景；可用 `allowSceneActivation` 控制切换时机。
    
-   **Addressables（可选）**：
    
    ```csharp
    using UnityEngine.AddressableAssets;
    using UnityEngine.ResourceManagement.AsyncOperations;
    
    async Task<GameObject> LoadPrefabAsync(object key) {
        AsyncOperationHandle<GameObject> h = Addressables.LoadAssetAsync<GameObject>(key);
        await h.Task;                 // 原生即异步句柄
        return h.Result;
    }
    
    ```
    
    Addressables 的加载是**全异步**并返回 `AsyncOperationHandle`，便于用 `await`/进度条整合。
    

----------

## 组合拳：把“能少做的事”变少、“能排队的事”排队

-   **可关则关**：不需要每帧更新的对象在 Unreal 里**直接关掉 Tick**；Unity 里则用**协程/定时器**替代 Update。
    
-   **能批就批**：Unity 用 Job/Burst 批量算，Unreal 用任务系统或线程池把重活丢后台。
    
-   **异步加载**：两边都提供**不阻塞主线程**的加载方案（`FStreamableManager` / `Addressables` / `SceneManager.LoadSceneAsync`）。
    
-   **线程模型**：Unreal 天生把渲染从游戏线程拆出，并可进一步用 RHI 线程并行提交。
    

----------

## 核心对比与迁移思路

|主题|Unity 做法|Unreal 做法|迁移要点|
|-|-|-|-|
|每帧循环|`Update`/`LateUpdate`/`FixedUpdate`；尽量移出耗时逻辑，用协程或自定义定时器稀疏化|`AActor::Tick`；`PrimaryActorTick.bCanEverTick`、`SetActorTickEnabled(false)`、`TickInterval`、`TickGroup` 组织顺序|**能关就关**（不需每帧的逻辑禁用 Tick / 降频）；有依赖就用 TickGroup 保序|
|并行计算|**Job System** + **Burst** + `NativeArray`；`IJobFor / IJobParallelFor`|后台计算用 `Async(EAsyncExecution::ThreadPool, ...)`、UE::Tasks；需要生命周期/资源控制时用 **GameplayTasks**|把“可并行”的纯数据计算抽成批处理；Unity Job → UE 后台任务/GameplayTasks|
|异步加载|`SceneManager.LoadSceneAsync`；Addressables `LoadAssetAsync/LoadAssetsAsync`|`TSoftObjectPtr` + `FStreamableManager::RequestAsyncLoad`；或 Asset Manager|统一“软引用 + 按需加载”的思路；预热与切换时机控制（进度 0.9 → 激活）|
|线程模型|主线程 +（可选）Job 工作线程|**游戏线程 + 渲染线程（+ RHI 线程）**|明确“逻辑→渲染”流水线，拆分 CPU/GPU 问题排查路径|


----------

## 实战清单（可直接落地）

1.  **Unity**
    
    -   把 UI 刷新、目标检测、MiniMap 等从 `Update` 改为协程/定时器（≥ 100ms）。
        
    -   热路径循环改 Job + Burst；确认无托管访问、无 GC 分配。
        
    -   过场用 `LoadSceneAsync` + 动画，合适时机再 `allowSceneActivation = true`。
        
    -   大量资源走 Addressables 异步加载，统一依赖与进度管理。
        
2.  **Unreal**
    
    -   逐个检查 Actor：不必每帧的 **关 Tick**；能降频的设 `TickInterval`。
        
    -   顺序相关的逻辑放合适的 **TickGroup**（如物理后修正位置用 `TG_PostPhysics`）。
        
    -   资产用 `TSoftObjectPtr` + `FStreamableManager` 异步拉起；加载完成回调里再安全访问。
        
    -   大计算放后台（Async/UE::Tasks），需要资源/生命周期治理时抽成 **Gameplay Task**。
        

----------

## 总结

两家引擎路线不同、目标一致：**让主线程少干活**。

-   Unity 借助 **Job System + Burst + 协程/异步 API**，把大循环改成批处理，把等待与加载改成异步。
    
-   Unreal 则在引擎层面就把**渲染与逻辑**拆成多线程，并提供 **TickGroup/Interval** 的细粒度调度，配合 **StreamableManager** 与 **GameplayTasks** 把“慢事”移出主线程。
    

当你能清楚回答下面三问时，你的 CPU 帧时间基本就稳了：  
1）**哪些逻辑必须每帧做？**（其余都降频/条件触发）  
2）**哪些逻辑能批处理/并行？**（Job、Tasks、线程池）  
3）**哪些逻辑能异步？**（加载、I/O、等待）

> 下一篇将进入移动端优化与平台适配专题，把“能量用在刀刃上”的思路继续贯彻。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 性能优化
- **标签：** unity, ue, 优化
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*