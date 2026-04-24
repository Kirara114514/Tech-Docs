# ECS实现模式与数据管理

## 摘要
亲手搭建简化的 ECS 框架是深入理解 ECS 精髓的最佳方式。本文从零设计一个最小化 ECS 核心，重点探讨 Component 数据的存储方式（AOS vs SOA、Chunk 布局），并实现 EntityManager、Archetype 和 Query 等核心基础设施。

## 正文

### 背景
Unity DOTS 的高度优化使得部分开发者将其视为黑盒。通过自建 ECS 框架，开发者能真正理解 Entity → Component → System 的数据流和内存布局，这有助于在大型项目中更有效地使用 DOTS，或在传统架构中借鉴 ECS 的局部性原理。

### 自建 ECS 框架的核心组件设计

一个最小化的 ECS 框架需要满足：

1. **管理 Entity**：创建、销毁 Entity，分配唯一 ID
2. **管理 Component**：为 Entity 添加、移除、获取 Component
3. **管理 System**：调度 System，按序更新
4. **数据查询**：根据 Component 类型组合筛选 Entity

### Component 数据存储：AOS vs. SOA 的抉择

这是 ECS 性能的核心。两种存储方式的天壤之别：

```
// AOS (Array of Structs) — 传统 OOP 方式
struct EntityData { 
    Position p; Velocity v; Health h; 
}
EntityData[] entities; // 一个数组包含所有数据

// SOA (Struct of Arrays) — ECS 方式
struct PositionArray { float[] x, y; }
struct VelocityArray { float[] x, y; }
struct HealthArray { float[] value; }
```

**AOS 问题**：System 只需要 Position 和 Velocity，但 AOS 把 Health 也加载到了缓存行，浪费 L1 带宽。

**SOA 优势**：同类数据连续存储，当一个 System 只处理 Position+Velocity 时，缓存行 100% 有效利用。

**Chunk 存储（Unity DOTS 的 Archetype）**：
- 具有相同 Component 类型的 Entity 被分组到同一个 **Archetype**
- 每个 Archetype 拥有多个 **Chunk**（固定大小的连续内存块，如 16KB）
- Chunk 内按 SOA 布局排列 Component 数据

```
Chunk (16KB):
  ┌────────────────────────────────┐
  │ Position[0..N-1] (连续存储)     │
  │ Velocity[0..N-1] (连续存储)     │
  │ Health[0..N-1]   (连续存储)     │
  └────────────────────────────────┘
  每个 Entity 在不同 Arrays 中使用相同索引
```

### 简化的 EntityManager 设计

```csharp
public class EntityManager
{
    int nextEntityId;
    Dictionary<int, EntityData> entities; // Entity ID → Component 集合
    
    public int CreateEntity(params Type[] componentTypes)
    {
        int id = nextEntityId++;
        entities[id] = new EntityData();
        foreach (var t in componentTypes)
            entities[id].AddComponent(t);
        return id;
    }
    
    public T GetComponent<T>(int entityId) where T : struct
    {
        return entities[entityId].Get<T>();
    }
    
    public List<int> Query(params Type[] componentTypes)
    {
        return entities
            .Where(kv => componentTypes.All(t => kv.Value.Has(t)))
            .Select(kv => kv.Key)
            .ToList();
    }
}
```

**真实 DOTS 的优化**：
- 使用 `NativeArray` 代替 Dictionary 避免 GC
- 用 Archetype 和 Chunk 而非 Dictionary 实现 O(1) 查找
- Query 不是每帧遍历，而是维护 Archetype 列表的位运算匹配
- 写操作审计（`EntityManager.GetComponentDataFromEntity` 的读写权限检查）

### 内存布局考量

| 策略 | 优点 | 缺点 | 应用 |
|------|------|------|------|
| Dictionary<Entity, Data> | 实现简单 | GC 压力 | 原型阶段 |
| Chunk + SOA | 缓存友好 | 复杂度高 | 正式项目 |
| 混合（热数据 SOA，冷数据 Dictionary） | 平衡 | 边界复杂 | 大型项目 |

**优化原则**：
- 频繁写入的 Component 尽量小（≤ 32 bytes），避免 Write 时拷贝过多
- 分开"热数据"（每帧更新）和"冷数据"（偶尔读取）
- 使用 `[ChunkSerializable]` 标记需要序列化的 Chunk 数据

### 第一个 ECS 例子：让方块动起来

```csharp
// Component 定义
struct Position { public float X, Y; }
struct Velocity { public float X, Y; }
struct RenderData { public Color Color; } // 冷数据

// System 实现
class MovementSystem : SystemBase
{
    EntityQuery query;
    
    protected override void OnCreate()
    {
        query = GetEntityQuery(typeof(Position), typeof(Velocity));
    }
    
    protected override void OnUpdate()
    {
        Entities.ForEach((ref Position p, in Velocity v) => {
            p.X += v.X * Time.DeltaTime;
            p.Y += v.Y * Time.DeltaTime;
        }).Schedule();
    }
}
```

### 实现方案
1. **原型起步**：用 Dictionary 实现简易 ECS，验证设计后逐步迁移到 Chunk
2. **Component 大小控制**：保持 Component ≤ 32 bytes，超大拆分为多个小 Component
3. **Query 缓存**：频繁使用的查询用 `EntityQuery` 缓存而非每帧构造
4. **避免 Write 冲突**：同一个 Component 在同一个 System 中只能有一个写入者

### 总结
ECS 的性能优势源于 SOA（Struct of Arrays）的连续内存布局和 Cache 局部性。理解 Chunk 存储、Archetype 分组和 Query 匹配的底层机制后，就能在设计 ECS 系统时做出更好的数据布局决策。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** ECS、SOA、AOS、Chunk、EntityManager、内存布局、C#
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
