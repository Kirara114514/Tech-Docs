# ECS与Unity传统开发结合

## 摘要
完全摒弃 GameObject 和 MonoBehaviour 去使用 ECS 在现实中往往不可行。本文提出混合架构策略——以 ECS 作为核心逻辑层处理大量实体的数据计算，以 GameObject 作为表现层负责渲染、动画、UI 等 Unity 原生功能，并介绍 HybridECS Component、ConvertToEntity 和组件数据同步等桥接技术。

## 正文

### 背景
Unity 的 UI 系统、Mecanim 动画、粒子系统、物理引擎乃至编辑器扩展都深度依赖于 GameObject。混合模式不是妥协，而是务实的架构选择——在性能关键区域用 ECS，在需要引擎集成的区域保留 GameObject。

### 何时采用混合模式？

| 场景 | 策略 | 原因 |
|------|------|------|
| UI 系统 | 保留 GameObject | UGUI/UIToolkit 基于 MB，ECS 重建 UI 成本过高 |
| 复杂动画 | 保留 GameObject | Mecanim 成熟稳定，ECS 动画系统成本极高 |
| 粒子系统 | 保留 GameObject | 原生粒子系统更优 |
| 第三方插件 | 保留 GameObject | 绝大多数插件为 GameObject 设计 |
| 物理引擎 | 可选 | 非 DOTS 物理依赖 GameObject；DOTS Physics 纯 ECS |
| **大量实体逻辑** | **ECS** | 上万个单位的移动、AI、碰撞计算 |

### 混合架构的核心模式

#### 模式一：ECS 计算 → GameObject 渲染

最适合大量单位的场景（RTS、割草、弹幕游戏）。

```csharp
// ECS 侧：纯数据
struct UnitPosition : IComponentData { public float3 Value; }

// 桥接 System：将 ECS 数据同步到 Transform
class TransformSyncSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((in UnitPosition pos, in TransformGO go) => {
            go.Transform.position = pos.Value;
        }).Schedule();
    }
}
```

#### 模式二：GameObject 驱动 ECS

适合 Boss、玩家角色等较少但逻辑复杂的对象。

```csharp
public class PlayerAuthoring : MonoBehaviour, IConvertGameObjectToEntity
{
    public float MoveSpeed = 5f;
    
    public void Convert(Entity entity, EntityManager manager, 
                        GameObjectConversionSystem conversionSystem)
    {
        manager.AddComponentData(entity, new PlayerInput());
        manager.AddComponentData(entity, new MoveSpeed { Value = MoveSpeed });
        manager.AddComponentData(entity, new Position());
    }
}
```

#### 模式三：Hybrid ECS Component

ECS Component 持有 GameObject 引用，适用于低频同步。

```csharp
struct HealthBarLink : IComponentData
{
    public Entity LinkedEntity;    // ECS Entity
    public Slider UIHealthBar;     // GameObject 引用
}

class HealthBarSyncSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((in Health h, in HealthBarLink link) => {
            link.UIHealthBar.value = h.Value / h.MaxValue;
        }).Schedule();
    }
}
```

**注意**：GameObject 引用在 ECS 的 Job System 中不能并行访问（非线程安全），这种模式只适合在主线程运行的 System。

### 组件数据同步

混合架构的核心挑战：**ECS 数据（NativeContainer）↔ GameObject 数据（托管对象）**。

**同步方向**：
- **ECS → GameObject**（大量单位位置同步）→ TransformSyncSystem
- **GameObject → ECS**（玩家输入、碰撞事件）→ 使用 `ComponentSystemGroup` 在同步 System 中处理
- **双向**（生命值、状态变化）→ 谨慎设计，避免乒乓同步

**同步策略对比**：

| 策略 | 性能 | 开发成本 | 延迟 | 适用 |
|------|------|---------|------|------|
| 每帧同步 | 低 | 低 | 0 | 位置、旋转 |
| 事件触发同步 | 高 | 中 | 1帧 | 生命值更新 |
| 定时同步 | 可配置 | 中 | 可控 | 不需要实时更新 |
| 差分同步 | 最高 | 高 | 1帧 | 网络同步 |

```csharp
// 事件触发同步
struct HealthChangedEvent : IComponentData { public float OldValue; public float NewValue; }

class HealthBarSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((Entity e, in HealthChangedEvent evt, in HealthBarLink link) => {
            link.UIHealthBar.value = evt.NewValue / 100f;
            EntityManager.RemoveComponent<HealthChangedEvent>(e); // 处理后清除
        }).WithStructuralChanges().Run(); // 结构变更需在主线程
    }
}
```

### ConvertToEntity 与 Authoring

Unity DOTS 提供 `ConvertToEntity` 机制，使得 GameObject 在进入 Play 模式时自动转换为 ECS Entity。

```csharp
[RequiresEntityConversion]
public class BulletAuthoring : MonoBehaviour, IConvertGameObjectToEntity
{
    public float Speed = 20f;
    
    public void Convert(Entity entity, EntityManager manager, 
                        GameObjectConversionSystem system)
    {
        manager.AddComponentData(entity, new Velocity { Value = Speed * transform.forward });
        manager.AddComponentData(entity, new Lifetime { Remaining = 3f });
    }
}
```

**转换模式**：
- **Convert To Entity and Destroy**：运行时删除 GameObject，纯 ECS
- **Convert To Entity**：保留 GameObject，用于同步模式

### 实现方案
1. **从少量实体开始**：先在非关键系统尝试混合模式，验证后再扩展
2. **定位性能瓶颈**：用 Profiler 找出哪些 System 在 GameObject → ECS 同步上消耗过多
3. **同步降频**：不重要的视觉效果（浮动文字、粒子）降低同步频率
4. **Authoring 优先**：所有 ECS 数据尽量通过 Authoring 脚本配置，减少运行时转换

### 总结
混合模式是 ECS 在 Unity 项目中落地的务实选择。核心在于明确切割边界——ECS 层负责大规模数据计算，GameObject 层负责引擎集成部分。通过 ConvertToEntity 机制和 ComponentData 同步，两层的协作可以做到高效且解耦。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** ECS、混合架构、HybridECS、ConvertToEntity、GameObject、架构设计、C#
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
