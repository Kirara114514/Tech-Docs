# ECS系统行为与交互模式

## 摘要
在 ECS 架构中，System 是驱动所有逻辑的核心。本文深入探讨 System 的运行机制（生命周期、调度顺序），以及如何通过 One-Shot Component、Buffer 和 Event Bus 实现纯数据驱动的事件通信，同时覆盖 Entity 间的交互模式（Tag 筛选、Relationship 建模）和 struct 与 class 在 ECS 组件中的选择考量。

## 正文

### 背景
System 在 ECS 中不仅执行逻辑，还决定着数据流的组织和系统的可扩展性。理解 System 的生命周期、事件通信和 Entity 交互模式，是构建大型 ECS 项目的基础。

### System 的生命周期与调度

在一个通用的 ECS 框架中，System 通常会遵循一个简单的生命周期：

1. **初始化 (`OnCreate`)**：在 System 创建时调用一次，用于初始化内部状态或缓存必要数据。
2. **更新 (`OnUpdate`)**：核心方法，每个帧或固定时间步长被调用，执行主要的逻辑处理。
3. **销毁 (`OnDestroy`)**：移除 System 时调用，用于清理原生内存、解除事件订阅等。

```csharp
public interface ISystem
{
    void OnCreate(ref World world);
    void OnUpdate(ref World world);
    void OnDestroy(ref World world);
}

public class SystemManager
{
    List<ISystem> systems = new List<ISystem>();
    
    public void AddSystem(ISystem system)
    {
        system.OnCreate(ref world);
        systems.Add(system);
    }
    
    public void Update()
    {
        foreach (var sys in systems)
            sys.OnUpdate(ref world);
    }
}
```

**System 调度顺序**：在 Unity DOTS 中，通过 **System Group** 组织执行顺序。例如，`FixedStepSimulationSystemGroup` 中的 Physics 系统必须在 `PresentationSystemGroup` 中的渲染系统之前执行。可以通过 `[UpdateBefore/After]` 属性显式控制依赖。

### ECS 中的行为与状态管理

传统 OOP 中，行为是对象的方法调用；在 ECS 中，行为是 System 对 Component 数据的读写。

```
// OOP 中的行为
class Player { public void Jump() { velocity.y = 10; } }

// ECS 中的行为
struct JumpRequest : IComponentData { public float Force; }
class JumpSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((ref Velocity v, in JumpRequest j) => {
            v.Value.y = j.Force;
        }).Schedule();
    }
}
```

行为不再属于 Entity，而是由 System 根据 Entity 是否拥有某组件数据来选择处理。一个 Entity 拥有 `JumpRequest` 组件，`JumpSystem` 就会对它施加跳跃逻辑。

### ECS 中的事件系统设计

ECS 中没有 OOP 的事件委托，但提供了更高效的事件模式：

#### 1. 基于一次性 Component 的事件（One-Shot Component）

创建组件标记事件，System 在处理后将其销毁。

```csharp
struct DamageEvent : IComponentData
{
    public Entity Target;
    public int Amount;
}

class DamageSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((Entity entity, ref Health h, in DamageEvent d) => {
            h.Value -= d.Amount;
            EntityManager.RemoveComponent<DamageEvent>(entity);
        }).Schedule();
    }
}
```

**优点**：零分配、类型安全、完全兼容 ECS 调度。**缺点**：需要 System 负责清理，逻辑散布在多个 System 中。

#### 2. 基于 Buffer 的事件队列

使用 `DynamicBuffer` 存储事件，System 一次性处理并清空。

```csharp
struct CollisionEvent : IBufferElementData
{
    public Entity EntityA;
    public Entity EntityB;
    public float3 ContactPoint;
}
```

适用于批量处理（一帧内发生多次同类型事件）。

#### 3. 单例 Component 作为事件总线

```csharp
struct GlobalEventDispatcher : IComponentData
{
    public int DeathCount;
    public Entity LastKilled;
}
```

所有 System 通过查询这个单例组件获取全局状态。

### Entity 之间的交互：如何"找"到彼此？

| 模式 | 实现方式 | 适用场景 |
|------|---------|---------|
| Tag 筛选 | 用特定 Component 标记 Entity | 所有敌人共享 `EnemyTag` |
| Relationship Component | 用 Component 存储目标 Entity 引用 | 父子关系、跟随目标 |
| 查询缓存 | 用 `EntityQueryDesc` 缓存查询结果 | 频繁查询固定 Entity 集合 |
| 共享 Component | 用 `ISharedComponentData` 分组 | 按材质/网格分组的渲染系统 |

```csharp
// Relationship Component
struct FollowTarget : IComponentData
{
    public Entity Target;
}

class FollowSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((ref Translation t, in FollowTarget ft) => {
            var targetTrans = GetComponent<Translation>(ft.Target);
            t.Value = targetTrans.Value;
        }).Schedule();
    }
}
```

### 结构体与引用类型 Component 的考量

| 类型 | 优点 | 缺点 |
|------|------|------|
| `struct` (IComponentData) | 值类型，缓存友好，无 GC | 大小有限，需谨慎设计布局 |
| `class` (非 IComponentData) | 灵活可包含引用 | GC 压力，破坏缓存 |
| `ISharedComponentData` | 自动分组，存储高效 | 不可频繁修改，不可包含字段引用 |
| `IBufferElementData` | 支持动态数组 | 需固定容量 |

**实践原则**：
- 核心数据用 `struct` + `IComponentData`
- 按帧更新的数据单独拆分，减少写入代价
- `ISharedComponentData` 用于渲染分组、LOD 分类等不频繁变化的属性

### 实现方案
1. **System 执行顺序**：用自定义 Attribute `[UpdateAfter(typeof(PhysicsSystem))]` 管理依赖
2. **小规模事件**用 One-Shot Component，大批量事件用 Buffer Component
3. **Entity 间关系**优先用 Relationship Component，避免每帧用 `EntityQuery` 查找
4. **Component 布局**：按更新频率拆分（高频更新的字段独立为一个组件降低写代价）

### 总结
ECS 的 System 设计核心在于将逻辑从数据中剥离，通过组件组合驱动行为。事件通信从传统的 OOP 委托转变为组件驱动的模式，Entity 间交互则通过关系型组件和查询来实现。理解这些模式后，就能在纯数据驱动架构下构建高效、可扩展的游戏逻辑。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** ECS、System、事件系统、Entity交互、架构设计、C#
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
