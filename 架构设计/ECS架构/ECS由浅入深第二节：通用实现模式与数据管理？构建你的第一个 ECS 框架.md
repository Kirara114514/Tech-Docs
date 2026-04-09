# ECS由浅入深第二节：通用实现模式与数据管理？构建你的第一个 ECS 框架

## 摘要
[文档核心内容摘要]

## 正文

在 Unity 官方的 DOTS 仍在不断发展和成熟之际，理解并能够**亲手搭建一个简化的通用 ECS 框架**对于深入掌握 ECS 精髓至关重要。这不仅能让你摆脱对特定实现的依赖，更能让你理解 ECS 背后的运行机制，为你未来应对各种复杂场景打下坚实基础。

本篇文章中，我们将一起思考如何设计一个最简 ECS 框架，并重点探讨 **Component 数据的存储方式**，这是实现高性能 ECS 的核心。

----------

### 自建 ECS 框架的核心组件设计

一个最小化的 ECS 框架需要满足以下几个基本要求：

1.  **管理 Entity：** 能够创建、销毁 Entity，并为它们分配唯一的 ID。
    
2.  **管理 Component：** 能够为 Entity 添加、移除、获取 Component。
    
3.  **调度 System：** 能够按照某种顺序执行 System，让它们处理 Entity 的数据。
    

基于此，我们可以设想几个核心的类/接口：

-   **`IComponentData`：** 定义所有 **Component** 需要实现的接口，确保它们是纯数据结构。
    
-   **`Entity`：** 一个简单的结构体，只包含一个 ID。
    
-   **`EntityManager`：** 负责 Entity 和 Component 的生命周期管理，是 ECS 框架的核心。
    
-   **`ISystem`：** 定义所有 **System** 需要实现的接口，包含更新逻辑。
    
-   **`World` (或 `GameLoop`)：** 负责持有 `EntityManager` 和所有 `System`，并在游戏循环中调度 `System` 的执行。
    

今天，我们主要聚焦在 `EntityManager` 和 Component 的数据存储。

----------

### Component 数据存储：AOS vs. SOA 的抉择

在 ECS 中，数据存储方式对性能有着决定性的影响。我们知道 **CPU 缓存**的原理是当访问一个内存地址时，会顺带将附近的数据也加载到缓存中。为了最大化缓存利用率，我们希望相关数据在内存中是**连续的**。

这里就引出了两种常见的数据组织方式：

#### 1. AOS (Array of Structs) - 结构体数组

传统的面向对象或简单列表存储，通常是 AOS 模式。比如，你有一个 `Player` 类，里面包含 `Position` 和 `Health`。如果你有多个 `Player` 对象，它们在内存中可能是这样的：

```
[ Player1_Pos, Player1_Health, Player2_Pos, Player2_Health, Player3_Pos, Player3_Health, ... ]

```

**特点：**

-   **直观易懂：** 一个结构体/对象包含了所有相关数据，符合传统编程习惯。
    
-   **缓存效率低：** 当你只需要遍历所有 Player 的 `Position` 来更新它们时，CPU 不得不跳过 `Health` 数据。这些跳过的数据占用了缓存空间，导致缓存中的有效数据减少，增加了**缓存未命中**（Cache Miss）的几率。
    

#### 2. SOA (Struct of Arrays) - 数组结构体（ECS 倾向）

ECS 更推崇的便是 SOA 模式。它将不同类型的 Component 数据分别存储在各自独立的连续数组中。

例如，对于 Entity A、B、C 都拥有 `Position` 和 `Health` 这两种 Component：

```
// Positions 数组：
[ EntityA_Pos, EntityB_Pos, EntityC_Pos, ... ]  (内存连续)

// Healths 数组：
[ EntityA_Health, EntityB_Health, EntityC_Health, ... ] (内存连续)

```

**特点：**

-   **缓存效率高：** 当 `MovementSystem` 需要更新所有 `Position` 时，它会遍历 `Positions` 数组。由于所有 `Position` 数据在内存中是连续的，CPU 可以高效地加载一大块 `Position` 数据到缓存，并持续处理，极大地减少了缓存未命中。同样，`DamageSystem` 遍历 `Healths` 数组时也能获得同样的好处。
    
-   **并行化友好：** 不同的 System 可以同时访问不同的 Component 数组，减少了数据竞争。
    
-   **管理复杂性增加：** 需要一种机制来将 Entity ID 与它拥有的 Component 在不同数组中的索引关联起来。
    

**总结：** ECS 倾向于 SOA，正是为了最大化数据局部性，从而提升 CPU 缓存命中率，最终实现高性能。

----------

### 简化的 `EntityManager` 设计：Component 如何存储？

基于 SOA 的思想，我们可以设计一个简化的 `EntityManager` 来存储 Component。

首先，定义我们的核心接口：



```
// 1. IComponentData: 所有组件的基接口，表示它们是纯数据
public interface IComponentData { }

// 2. Entity: 仅一个 ID
public struct Entity
{
    public int Id;
    public override string ToString() => $"Entity({Id})";
}

```

接下来，`EntityManager` 需要一种方式来存储不同类型的 Component 数组，并能根据 `Entity` ID 找到对应的 Component。

一种简单的实现思路是使用 `Dictionary<Type, IList>` 来存储每种 Component 类型的数组，并使用另一个 `Dictionary<int, Dictionary<Type, int>>`（其中键是 Entity ID）来记录每个 Entity 拥有哪些 Component 以及它们在对应 Component 数组中的索引。



```
using System;
using System.Collections.Generic;

public class EntityManager
{
    // 存储所有 Component 数组，键是 Component 类型
    private Dictionary<Type, List<IComponentData>> _componentArrays = new Dictionary<Type, List<IComponentData>>();

    // 存储每个 Entity 拥有的 Component 及其在对应 Component 数组中的索引
    // 外层字典的键是 Entity ID
    // 内层字典的键是 Component 类型，值是该 Entity 的 Component 在 List 中的索引
    private Dictionary<int, Dictionary<Type, int>> _entityComponentIndices = new Dictionary<int, Dictionary<Type, int>>();

    private int _nextEntityId = 0; // 用于生成新的 Entity ID

    // ---- Entity 管理 ----
    public Entity CreateEntity()
    {
        Entity newEntity = new Entity { Id = _nextEntityId++ };
        _entityComponentIndices[newEntity.Id] = new Dictionary<Type, int>();
        Console.WriteLine($"Created Entity: {newEntity}");
        return newEntity;
    }

    public void DestroyEntity(Entity entity)
    {
        if (!_entityComponentIndices.ContainsKey(entity.Id))
        {
            Console.WriteLine($"Entity {entity} does not exist.");
            return;
        }

        // 移除 Entity 拥有的所有 Component
        // 注意：这是一个简化的移除逻辑，真实 ECS 会有更复杂的 chunk 和稀疏数组管理
        // 在此处，我们仅从索引映射中移除，不实际操作 _componentArrays 以避免复杂性
        foreach (var pair in _entityComponentIndices[entity.Id])
        {
            Type componentType = pair.Key;
            int indexToRemove = pair.Value;
            // Console.WriteLine($"   Removing {componentType.Name} from Entity {entity} (index was {indexToRemove})");
            // 真实情况下此处需要处理 _componentArrays 中数据的实际移除和索引更新
        }
        _entityComponentIndices.Remove(entity.Id);
        Console.WriteLine($"Destroyed Entity: {entity}");
    }

    // ---- Component 管理 ----

    // 添加 Component
    public void AddComponent<T>(Entity entity, T component) where T : IComponentData
    {
        Type componentType = typeof(T);

        if (!_entityComponentIndices.ContainsKey(entity.Id))
        {
            Console.WriteLine($"Error: Entity {entity} does not exist.");
            return;
        }

        if (_entityComponentIndices[entity.Id].ContainsKey(componentType))
        {
            Console.WriteLine($"Warning: Entity {entity} already has Component {componentType.Name}. Updating it.");
            // 如果已存在，更新现有Component。需要找到旧索引并替换 List 中的值。
            // 由于 GetComponent/AddComponent 传递的是结构体副本，这里需要先移除再添加。
        }

        // 确保该 Component 类型的 List 存在
        if (!_componentArrays.ContainsKey(componentType))
        {
            _componentArrays[componentType] = new List<IComponentData>();
        }

        List<IComponentData> componentList = _componentArrays[componentType];
        int index = componentList.Count;
        componentList.Add(component); // 将组件添加到对应类型的列表末尾

        _entityComponentIndices[entity.Id][componentType] = index; // 记录 Entity 拥有该组件，以及它在列表中的索引
        Console.WriteLine($"   Added {componentType.Name} to Entity {entity} at index {index}");
    }

    // 获取 Component
    public T GetComponent<T>(Entity entity) where T : IComponentData
    {
        Type componentType = typeof(T);

        if (_entityComponentIndices.TryGetValue(entity.Id, out var entityComponents))
        {
            if (entityComponents.TryGetValue(componentType, out int index))
            {
                if (_componentArrays.TryGetValue(componentType, out var componentList) && index < componentList.Count)
                {
                    return (T)componentList[index];
                }
            }
        }
        // Console.WriteLine($"   Entity {entity} does not have Component {componentType.Name}.");
        return default(T); // 或者抛出异常
    }

    // 判断 Entity 是否拥有某个 Component
    public bool HasComponent<T>(Entity entity) where T : IComponentData
    {
        Type componentType = typeof(T);
        return _entityComponentIndices.ContainsKey(entity.Id) && _entityComponentIndices[entity.Id].ContainsKey(componentType);
    }

    // 移除 Component
    public void RemoveComponent<T>(Entity entity) where T : IComponentData
    {
        Type componentType = typeof(T);

        if (!_entityComponentIndices.ContainsKey(entity.Id) || !_entityComponentIndices[entity.Id].ContainsKey(componentType))
        {
            Console.WriteLine($"Warning: Entity {entity} does not have Component {componentType.Name} to remove.");
            return;
        }

        int indexToRemove = _entityComponentIndices[entity.Id][componentType];
        _entityComponentIndices[entity.Id].Remove(componentType);

        if (_componentArrays.TryGetValue(componentType, out var componentList))
        {
            // !!! 重要提示：这里是一个为教学目的简化的处理，直接移除会导致 List 不连续，且其他 Entity 的索引失效 !!!
            // 在实际高性能 ECS 框架中，移除操作会更复杂，比如使用“交换-移除”法
            // 即将最后一个元素移到 indexToRemove 的位置，然后移除最后一个元素。
            // 还需要更新被移动元素的 Entity 索引。
            // 对于本教程，我们暂时接受这种简化，但请务必理解其性能和逻辑上的局限性。
            // ((List<IComponentData>)componentList).RemoveAt(indexToRemove); // 此行代码在简化示例中被注释，以避免复杂性
            Console.WriteLine($"   Removed {componentType.Name} from Entity {entity} (index was {indexToRemove}).");
        }
    }

    // 为 System 提供遍历 Entity 的机制
    // 注意：这里的迭代器是一个非常简化的版本，实际 ECS 会通过 EntityQuery 优化
    public IEnumerable<(Entity entity, T1 comp1, T2 comp2)> ForEach<T1, T2>()
        where T1 : IComponentData
        where T2 : IComponentData
    {
        Type type1 = typeof(T1);
        Type type2 = typeof(T2);

        foreach (var entityId in _entityComponentIndices.Keys)
        {
            Entity entity = new Entity { Id = entityId };
            if (HasComponent<T1>(entity) && HasComponent<T2>(entity))
            {
                yield return (entity, GetComponent<T1>(entity), GetComponent<T2>(entity));
            }
        }
    }

    public IEnumerable<(Entity entity, T1 comp1)> ForEach<T1>()
        where T1 : IComponentData
    {
        Type type1 = typeof(T1);

        foreach (var entityId in _entityComponentIndices.Keys)
        {
            Entity entity = new Entity { Id = entityId };
            if (HasComponent<T1>(entity))
            {
                yield return (entity, GetComponent<T1>(entity));
            }
        }
    }
}

// 示例 Component
public struct Position : IComponentData { public float X, Y; }
public struct Velocity : IComponentData { public float VX, VY; }
public struct Health : IComponentData { public int Value; }

```

**代码解释与设计意图：**

-   **`_componentArrays`:** 这是实现 **SOA** 的核心。它是一个字典，键是 Component 的 `Type`，值是该类型所有 Component 的 `List<IComponentData>`。这样，所有 `Position` Component 存储在一个 List 中，所有 `Velocity` Component 存储在另一个 List 中，以此类推，保证了**同类型数据的内存连续性**。
    
-   **`_entityComponentIndices`:** 这个字典负责将 `Entity` ID 与它拥有的各个 Component 在 `_componentArrays` 列表中的**具体索引**关联起来。这是连接 Entity 和 Component 的“桥梁”。
    
-   **`AddComponent` / `GetComponent`：** 这些方法负责 Component 的添加和获取。需要注意的是，由于 `IComponentData` 通常是 `struct`，`GetComponent` 返回的是一个**值类型副本**。因此，如果需要修改 Component，你必须先获取副本，修改后，再通过 `RemoveComponent` (旧的) 和 `AddComponent` (新的) 重新写入 `EntityManager`。真实的 ECS 框架通常会提供直接的 `ref` 访问或在 `System` 内部直接操作 `NativeArray` 以优化此过程。
    
-   **`ForEach`：** 这是一个非常简化的 System 遍历接口。它会遍历所有 Entity，然后检查它们是否拥有 System 所需的 Component。这是 `System` 如何“查询”数据的最基础方式。
    

**重要提示：`RemoveComponent` 的简化处理**

上述 `EntityManager` 中的 `RemoveComponent` 逻辑是为了教学目的而简化的。在真实的、高性能的 ECS 框架中，直接 `RemoveAt()` 或 `Remove()` 一个 `List` 中的元素会导致后续元素前移，这不仅会引发性能开销，更重要的是，会使得其他 Entity 存储的索引失效。

**真实的 ECS 框架会采取更复杂的策略，例如：**

-   **交换-移除 (Swap and Remove)：** 将 `List` 中最后一个元素与要移除的元素交换位置，然后移除最后一个元素。这避免了大量元素前移，但需要额外更新被移动元素所属 Entity 的索引。
    
-   **Chunk (内存块)：** Unity DOTS 和其他一些 ECS 框架会使用 Chunk 来组织 Entity 和 Component。Chunk 是预分配的连续内存块，里面存储了一组拥有相同 Component 组合的 Entity 的 Component 数据。当 Entity 移除 Component 时，它可能会从一个 Chunk 移动到另一个 Chunk，或者标记为“待销毁”，而非直接从数组中移除。这种方式能更好地保持内存连续性和高速存取。
    

我们这里选择了一个折衷方案，让你能理解 SOA 的基本原理和 `EntityManager` 的作用，同时避免一开始就陷入复杂的底层优化细节。

----------

### 第一个 ECS 例子：让方块动起来

让我们用这个简化的 `EntityManager` 来实现一个简单的移动方块示例。

假设我们有一个 `MovementSystem`，它负责更新所有带有 `Position` 和 `Velocity` Component 的 Entity。



```
// 3. ISystem: 所有系统的基接口，包含更新逻辑
public interface ISystem
{
    void OnUpdate(EntityManager entityManager);
}

// 示例 System: 移动系统
public class MovementSystem : ISystem
{
    public void OnUpdate(EntityManager entityManager)
    {
        Console.WriteLine("\n--- Running MovementSystem ---");
        // 遍历所有拥有 Position 和 Velocity Component 的 Entity
        foreach (var (entity, pos, vel) in entityManager.ForEach<Position, Velocity>())
        {
            // 更新位置：注意这里需要先移除旧的，再添加新的，因为 GetComponent 返回的是 struct 副本
            Position newPos = new Position { X = pos.X + vel.VX, Y = pos.Y + vel.VY };
            entityManager.RemoveComponent<Position>(entity); // 先移除旧的
            entityManager.AddComponent(entity, newPos);      // 再添加新的

            Console.WriteLine($"   Entity {entity}: Pos ({pos.X:F2}, {pos.Y:F2}) + Vel ({vel.VX:F2}, {vel.VY:F2}) => New Pos ({newPos.X:F2}, {newPos.Y:F2})");
        }
    }
}

// 示例 System: 生命值检查系统
public class HealthSystem : ISystem
{
    public void OnUpdate(EntityManager entityManager)
    {
        Console.WriteLine("\n--- Running HealthSystem ---");
        foreach (var (entity, health) in entityManager.ForEach<Health>())
        {
            if (health.Value <= 0)
            {
                Console.WriteLine($"   Entity {entity} has 0 health. Destroying...");
                entityManager.DestroyEntity(entity);
            }
        }
    }
}

```

现在，我们可以在一个简单的游戏循环中运行它：



```
using System;
using System.Collections.Generic;

public class GameLoop
{
    private EntityManager _entityManager = new EntityManager();
    private List<ISystem> _systems = new List<ISystem>();

    public GameLoop()
    {
        // 添加系统
        _systems.Add(new MovementSystem());
        _systems.Add(new HealthSystem()); // 示例中未给 Health 添加变化，但 System 可以检测

        // 创建一些实体并添加组件
        Entity player = _entityManager.CreateEntity();
        _entityManager.AddComponent(player, new Position { X = 0, Y = 0 });
        _entityManager.AddComponent(player, new Velocity { VX = 0.1f, VY = 0.05f });
        _entityManager.AddComponent(player, new Health { Value = 100 });

        Entity enemy = _entityManager.CreateEntity();
        _entityManager.AddComponent(enemy, new Position { X = 5, Y = 5 });
        _entityManager.AddComponent(enemy, new Velocity { VX = -0.05f, VY = -0.1f });
        _entityManager.AddComponent(enemy, new Health { Value = 50 });

        Entity staticObject = _entityManager.CreateEntity();
        _entityManager.AddComponent(staticObject, new Position { X = 10, Y = 10 });
        // staticObject 没有 Velocity，MovementSystem 不会处理它
    }

    public void RunSimulation(int iterations)
    {
        for (int i = 0; i < iterations; i++)
        {
            Console.WriteLine($"\n--- Simulation Frame {i + 1} ---");
            foreach (var system in _systems)
            {
                system.OnUpdate(_entityManager);
            }
        }
    }

    public static void Main(string[] args)
    {
        GameLoop game = new GameLoop();
        game.RunSimulation(5); // 运行5帧模拟
    }
}

```

运行上述代码，你将看到 Entity 的位置数据在每一帧都被 `MovementSystem` 更新。这虽然是一个非常简化的 ECS 实现，但它清楚地展示了 ECS 的基本流程：

1.  创建 `Entity` (ID)。
    
2.  为 `Entity` 添加 `Component` (纯数据)。
    
3.  `System` (纯逻辑) 遍历所有符合条件的 `Entity`，并更新它们的 `Component`。
    

----------

### 小结

在本篇文章中，我们初步设计了一个简化的 ECS 框架，并深入探讨了 Component 数据存储的两种核心模式：**AOS (Array of Structs)** 和 **SOA (Struct of Arrays)**。我们了解到，ECS 之所以能够实现高性能，很大程度上得益于其对 SOA 的倾向性，这极大地提升了 CPU 缓存的利用率。

通过亲手实现一个基础的 `EntityManager` 和 `System`，你现在应该对 ECS 的数据流和基本运作方式有了更直观的理解。

当然，我们这里的实现为了教学目的进行了简化。在真实的 ECS 框架（如 Unity DOTS 或其他商业/开源库）中，`EntityManager` 和 `System` 的内部机制会更加复杂和高效，例如会引入 **Chunk**、**稀疏数组**、**EntityQuery 优化**等概念，以应对大规模数据的增删改查和高效遍历。但这并不影响我们对 ECS 核心思想的理解。

在下一篇文章中，我们将继续深入，探讨 ECS 中更复杂的行为管理、事件处理以及 Entity 间的交互模式。敬请期待！

## 元数据
- **创建时间：** 2026-04-10
- **最后更新：** 2026-04-10
- **作者：** 吉良吉影
- **分类：** 架构设计/ECS架构
- **标签：** [相关标签]
- **状态：** ✅ 完成

---
*文档由小雅协助整理*
