# 对象池由浅入深第三节：基于 ObjectPoolPro 扩展 Unity 对象池--泛型对象池、自动回收和场景隔离-CSDN博客

## 摘要
在上一节中，我们实现了一个功能完善的对象池工具 **ObjectPoolPro**，用于优化频繁生成和销毁的 **GameObject** 对象。本节将在此基础上进一步扩展对象池功能，增加更高级的特性，包括： -   **泛型对象池 GenericObjectPool** 支持非 **GameObject** 类型的对象复用，可用于逻辑对象（例如 Bu...

## 正文

## 摘要
在上一节中，我们实现了一个功能完善的对象池工具 **ObjectPoolPro**，用于优化频繁生成和销毁的 **GameObject** 对象。本节将在此基础上进一步扩展对象池功能，增加更高级的特性，包括： -   **泛型对象池 GenericObjectPool** 支持非 **GameObject** 类型的对象复用，可用于逻辑对象（例如 Buff、行为树节点、路径点等）的池化管理。...

## 正文

### 背景
# 对象池由浅入深第三节：基于 ObjectPoolPro 扩展 Unity 对象池--泛型对象池、自动回收和场景隔离-CSDN博客

### 背景
本文探讨了相关技术主题的背景和重要性。

### 前言

在上一节中，我们实现了一个功能完善的对象池工具 **ObjectPoolPro**，用于优化频繁生成和销毁的 **GameObject** 对象。本节将在此基础上进一步扩展对象池功能，增加更高级的特性，包括：

-   **泛型对象池 GenericObjectPool** 支持非 **GameObject** 类型的对象复用，可用于逻辑对象（例如 Buff、行为树节点、路径点等）的池化管理。
    
-   **AutoRecycle 自动回收组件：** 一个可挂载在 **GameObject** 上的脚本，在物体失活（`OnDisable`）或指定时间后，自动将该对象回收到对象池，免去手动回收的繁琐。
    
-   **场景隔离机制：** 为对象池增加“按场景ID分类”的管理，在不同场景使用各自的对象池，并在场景切换（通过 `SceneManager.sceneUnloaded` 事件）时自动清理当前场景相关的池，防止跨场景的资源残留。
    

接下来，我们将分三部分详细讲解每个特性的实现，每部分提供完整的示例代码（包含详细中文注释）和实践讲解。

----------

### 一、实现泛型对象池 GenericObjectPool

**为什么需要泛型对象池？** 在游戏开发中，不仅仅是游戏物体需要池化，很多纯逻辑对象也会被频繁创建和销毁，例如技能 Buff 类、AI 的行为树节点、路径点对象等。频繁 `new` 和 GC 这些对象同样会影响性能。通过**泛型对象池**，我们可以重复利用这些非 **GameObject** 对象，减少 GC 压力。

下面我们实现一个通用的泛型对象池类 **GenericObjectPool**，用于管理任意引用类型对象的获取和回收。该类使用 C# 泛型和约束 `where T : class, new()` 来确保类型 T 有无参构造函数，以便在池空时可以直接创建新实例。



```
using System.Collections.Generic;
using UnityEngine; // 尽管是逻辑对象，但可能需要Debug或其他Unity功能

public class GenericObjectPool<T> where T : class, new()
{
    private Stack<T> pool;
    private int maxCount;

    /// <summary>
    /// 构造函数，创建泛型对象池
    /// </summary>
    /// <param name="initialCount">初始预热数量</param>
    /// <param name="maxCount">池中最大对象数量，达到此数量后多余对象不再入池</param>
    public GenericObjectPool(int initialCount = 0, int maxCount = int.MaxValue)
    {
        this.pool = new Stack<T>();
        this.maxCount = maxCount;
        // 预热：预先创建指定数量的对象放入池中
        for (int i = 0; i < initialCount; i++)
        {
            pool.Push(new T());
        }
    }

    /// <summary>
    /// 从对象池中获取一个对象实例
    /// </summary>
    /// <returns>T类型的对象实例</returns>
    public T Get()
    {
        if (pool.Count > 0)
        {
            return pool.Pop(); // 从栈中取出
        }
        else
        {
            return new T(); // 池中无可用对象，创建新实例
        }
    }

    /// <summary>
    /// 将对象实例回收到对象池中
    /// </summary>
    /// <param name="obj">待回收的对象实例</param>
    public void Release(T obj)
    {
        if (obj == null) return;

        // 如果池已满，则不再回收，直接放弃该对象
        if (pool.Count >= maxCount)
        {
            // Debug.LogWarning($"对象池已达最大容量 {maxCount}，对象不再回收。");
            return; 
        }
        
        pool.Push(obj); // 将对象压回栈中
    }

    /// <summary>
    /// 清空对象池中的所有对象
    /// </summary>
    public void Clear()
    {
        pool.Clear();
    }

    /// <summary>
    /// 获取当前池中对象的数量
    /// </summary>
    public int Count
    {
        get { return pool.Count; }
    }
}

```

**实现解析：** 上面的 `GenericObjectPool<T>` 使用了栈（`Stack`）作为内部存储结构，这在对象池中很常见。`Get()` 方法从栈顶弹出一个对象，如果池为空则新建一个 T 对象返回。`Release()` 方法则将对象压回栈中，如果已经达到设定的最大容量 `maxCount`，则放弃该对象（不再入池）以防止池无限增长占用内存。这里可以根据需要设置 `maxCount` 来控制池大小；如果不传则默认为 `int.MaxValue` 表示不限制数量。另外提供了 `Clear()` 方法可以一次性清空池，以及 `Count` 属性方便调试查看池内剩余对象数量。

**使用示例：** 假设我们有一个表示 Buff 效果的类，例如：



```
public class Buff
{
    public int id;
    public float duration;

    /// <summary>
    /// 重置Buff状态，以便下次复用
    /// </summary>
    public void Reset()
    {
        id = 0;
        duration = 0f;
    }
}

```

现在我们可以使用 `GenericObjectPool<Buff>` 来管理 Buff 对象的复用：



```
// 创建一个Buff对象池，初始预热10个，最大容量50
GenericObjectPool<Buff> buffPool = new GenericObjectPool<Buff>(initialCount: 10, maxCount: 50);

// 从池中获取一个Buff对象
Buff buff = buffPool.Get(); 
buff.id = 101;
buff.duration = 5.0f;
Debug.Log($"使用 Buff {buff.id}, 持续时间 {buff.duration} 秒");

// 使用完毕后，重置Buff状态并回收到池中
buff.Reset(); 
buffPool.Release(buff); 

```

通过上述方式，我们就无需每次都 `new Buff()` 或等待垃圾回收。当需要大量逻辑对象（如 Buff、任务、AI节点等）反复使用时，泛型对象池能够显著降低内存分配和 GC 压力，提高游戏性能。

----------

### 二、编写 AutoRecycle 自动回收组件

**为什么需要 AutoRecycle？** 在很多情况下，我们生成一个临时的游戏对象（例如特效、子弹、抛洒物等），希望它在**一段时间后**或**用完即弃**时自动回收到对象池，而不需要手动调用回收方法。如果遗漏回收，不仅浪费内存，还可能导致场景切换时遗留无用的对象。为了解决这个问题，我们可以编写一个 **AutoRecycle** 脚本组件，把它挂载到预制体上，使对象在**失活（`OnDisable`）或达到回收时间**时自动返回池中。

下面是 **AutoRecycle.cs** 脚本的实现：



```
using System.Collections;
using UnityEngine;

/// <summary>
/// 自动将GameObject回收到ObjectPoolPro的对象池中
/// 可在对象失活时自动回收，或在指定延迟时间后自动回收
/// </summary>
public class AutoRecycle : MonoBehaviour
{
    [Tooltip("对象启用后自动回收的延迟时间（秒）。<=0 表示不使用延时自动回收。")]
    public float recycleAfterTime = 0f;

    private Coroutine recycleTimer; // 用于存储延迟回收协程的引用

    void OnEnable()
    {
        // 如果设置了延迟时间，则启动计时协程
        if (recycleAfterTime > 0f)
        {
            recycleTimer = StartCoroutine(AutoRecycleTimer());
        }
    }

    void OnDisable()
    {
        // 在对象失活时，停止可能正在运行的延迟回收协程
        if (recycleTimer != null)
        {
            StopCoroutine(recycleTimer);
            recycleTimer = null;
        }
        // 将当前GameObject回收到ObjectPoolPro中
        ObjectPoolPro.Recycle(this.gameObject);
    }

    private IEnumerator AutoRecycleTimer()
    {
        yield return new WaitForSeconds(recycleAfterTime);
        // 计时结束后，如果对象仍处于激活状态，则将其失活（从而触发OnDisable进行回收）
        if (this.gameObject.activeSelf)
        {
            this.gameObject.SetActive(false); 
        }
    }
}

```

**实现解析：** 我们在 `OnEnable` 中判断如果 `recycleAfterTime` 大于 0，就启动一个协程 `AutoRecycleTimer()` 来等待指定时间。协程等待结束后，再次检查对象是否仍然处于激活状态，如果是，则调用 `gameObject.SetActive(false)` 将对象失活。**这样做的好处**是利用 `OnDisable` 回调统一处理回收逻辑，避免直接在协程中调用回收可能出现的竞态条件。在 `OnDisable` 中，我们首先停止并清除尚未完成的协程（如果对象提前被禁用，协程也会自动停止，但出于稳妥我们手动停止以防万一），然后调用 `ObjectPoolPro.Recycle(this.gameObject)` 将当前对象归还池中。

**使用说明：** 将 `AutoRecycle` 脚本添加到需要自动回收的预制体上，并根据需求设置 `RecycleAfterTime` 延迟秒数：

-   **按失活回收：** 如果不设置延迟（`recycleAfterTime <= 0`），则当该对象被手动禁用时，会立刻触发 `OnDisable`，自动回收到池。例如，一个敌人死亡时其 GameObject 被设置为不可见，这时 `AutoRecycle` 会检测到 `OnDisable` 并将其回收到池中，无需额外代码。
    
-   **按定时回收：** 如果设置了延迟时间，例如 5 秒，那么对象每次激活后会在 5 秒计时结束时自动失活自己并回收。常见用于粒子特效、抛射物等场景，例如子弹壳在掉落 5 秒后自动消失归还，爆炸特效播完 2 秒后自动回收等。
    

**实践示例：** 假设我们有一个爆炸特效预制体 **ExplosionPrefab**，我们希望它在生成后 2 秒自动回收。我们可以这样设置：

1.  在 **ExplosionPrefab** 上添加 **AutoRecycle** 组件，将 `Recycle After Time` 设为 2。
    
2.  使用对象池生成爆炸特效：调用 `ObjectPoolPro.Get(explosionPrefab)` 来获取实例。特效播放开始计时，两秒后 `AutoRecycle` 协程会自动将其失活并回收。
    
3.  若在 2 秒内手动禁用了该特效对象，`AutoRecycle` 的 `OnDisable` 仍然会保证回收逻辑被执行。
    

通过 `AutoRecycle`，我们大大简化了临时对象的生命周期管理，在脚本中无需反复调用回收函数，一切交给组件自动处理，减少了遗忘回收导致问题的风险。

----------

### 三、增加场景隔离的对象池管理机制

**为什么需要场景隔离？** 当游戏切换场景时，之前场景中缓存的对象如果不清理，可能会在内存中滞留，甚至误被下一场景重用，造成意想不到的行为。例如，在场景 A 中创建了一批子弹对象池，切换到场景 B 时，这些子弹对象仍挂在内存中（尤其如果对象池管理器是全局单例且标记为 `DontDestroyOnLoad`），这不仅浪费内存，还可能因为场景不一致导致错误。理想情况是**不同场景拥有各自的对象池**，场景卸载时自动清空相关池子，真正做到资源隔离。

为此，我们修改 **ObjectPoolPro** 工具以支持**按场景 ID 注册对象池**。核心思路是：使用一个数据结构将 `UnityEngine.Pool.ObjectPool<GameObject>` 实例与场景关联，每个场景有自己的池字典；在场景卸载事件中，清理该场景的所有池和对象。

下面是修改后的 **ObjectPoolPro** 部分代码，实现场景隔离管理：



```
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Pool; // 引入Unity内置对象池命名空间
using UnityEngine.SceneManagement;

public static class ObjectPoolPro
{
    // 存储按场景ID分类的对象池字典：场景ID -> (Prefab -> ObjectPool<GameObject>)
    private static Dictionary<int, Dictionary<GameObject, IObjectPool<GameObject>>> scenePools 
        = new Dictionary<int, Dictionary<GameObject, IObjectPool<GameObject>>>();

    // 存储对象实例与原始Prefab的映射关系 (用于回收时找到对应的池)
    private static Dictionary<GameObject, GameObject> instanceToPrefabMap 
        = new Dictionary<GameObject, GameObject>();

    // 协程运行器，用于延迟回收
    private class PoolCoroutineRunner : MonoBehaviour { }
    private static PoolCoroutineRunner runner;

    // 静态构造函数，用于初始化和订阅事件
    static ObjectPoolPro()
    {
        // 订阅场景卸载事件，用于自动清理对应场景的对象池
        SceneManager.sceneUnloaded += OnSceneUnloaded;
        InitRunner(); // 初始化协程运行器
    }

    // 初始化协程运行器（确保只创建一次）
    private static void InitRunner()
    {
        if (runner == null)
        {
            GameObject runnerObj = new GameObject("ObjectPoolProRunner");
            Object.DontDestroyOnLoad(runnerObj); // 使其在场景切换时不被销毁
            runner = runnerObj.AddComponent<PoolCoroutineRunner>();
        }
    }

    /// <summary>
    /// 为当前活跃场景注册一个Prefab的对象池。
    /// </summary>
    /// <param name="prefab">要注册的预制体</param>
    /// <param name="preloadCount">初始预热数量</param>
    /// <param name="maxPoolSize">池中最大对象数量</param>
    public static void RegisterPrefab(GameObject prefab, int preloadCount = 0, int maxPoolSize = 100)
    {
        int currentSceneId = SceneManager.GetActiveScene().buildIndex;

        // 如果该场景的池字典不存在，则创建
        if (!scenePools.ContainsKey(currentSceneId))
        {
            scenePools[currentSceneId] = new Dictionary<GameObject, IObjectPool<GameObject>>();
        }

        var currentScenePrefabPools = scenePools[currentSceneId];

        // 如果该Prefab的池已存在，则警告并返回
        if (currentScenePrefabPools.ContainsKey(prefab))
        {
            Debug.LogWarning($"场景 {SceneManager.GetActiveScene().name} (ID: {currentSceneId}) 中 Prefab {prefab.name} 已经注册过对象池！");
            return;
        }

        // 创建Unity内置的ObjectPool<GameObject>
        IObjectPool<GameObject> pool = new ObjectPool<GameObject>(
            createFunc: () =>
            {
                GameObject obj = Object.Instantiate(prefab);
                obj.SetActive(false); // 初始创建时先隐藏
                return obj;
            },
            actionOnGet: obj =>
            {
                obj.SetActive(true); // 从池中取出时激活
                // 确保对象被激活时其所属场景是当前活动场景，或设置为合适的父对象
                // 例如：obj.transform.SetParent(null); 或 obj.transform.SetParent(SceneManager.GetActiveScene().GetRootGameObjects()[0].transform);
            },
            actionOnRelease: obj =>
            {
                obj.SetActive(false); // 回收到池中时隐藏
                // 可选：将回收对象移到某个统一的根节点下，保持Hierarchy整洁
            },
            actionOnDestroy: obj =>
            {
                Object.Destroy(obj); // 池满或Clear时销毁对象
            },
            collectionCheck: true, // 开启安全检查
            defaultCapacity: preloadCount,
            maxSize: maxPoolSize
        );

        currentScenePrefabPools[prefab] = pool; // 将新创建的池存入对应场景的字典

        // 预热逻辑
        if (preloadCount > 0)
        {
            List<GameObject> tempList = new List<GameObject>();
            for (int i = 0; i < preloadCount; i++)
            {
                GameObject obj = pool.Get(); // 从池中获取以创建对象
                tempList.Add(obj);
            }
            foreach (GameObject obj in tempList)
            {
                pool.Release(obj); // 立即释放回池
            }
            tempList.Clear();
        }
    }

    /// <summary>
    /// 从当前活跃场景的对象池中获取一个GameObject实例。
    /// 如果Prefab未注册或池空，会自动创建。
    /// </summary>
    /// <param name="prefab">要获取的预制体</param>
    /// <returns>GameObject实例</returns>
    public static GameObject Get(GameObject prefab)
    {
        int currentSceneId = SceneManager.GetActiveScene().buildIndex;

        // 检查当前场景是否有该Prefab的池，如果没有则自动注册（不预热）
        if (!scenePools.ContainsKey(currentSceneId) || !scenePools[currentSceneId].ContainsKey(prefab))
        {
            Debug.LogWarning($"场景 {SceneManager.GetActiveScene().name} (ID: {currentSceneId}) 中 Prefab {prefab.name} 未注册对象池，将自动注册！");
            RegisterPrefab(prefab, 0); 
        }

        IObjectPool<GameObject> pool = scenePools[currentSceneId][prefab];
        GameObject obj = pool.Get();
        instanceToPrefabMap[obj] = prefab; // 记录实例与原始Prefab的映射

        return obj;
    }

    /// <summary>
    /// 将GameObject实例回收到其所属的对象池中。
    /// </summary>
    /// <param name="obj">要回收的GameObject实例</param>
    public static void Recycle(GameObject obj)
    {
        if (obj == null) return;

        GameObject originalPrefab;
        // 尝试从映射中找到该对象对应的原始Prefab
        if (!instanceToPrefabMap.TryGetValue(obj, out originalPrefab))
        {
            Debug.LogError($"对象 {obj.name} 不属于任何通过 ObjectPoolPro 获取的对象池，将直接销毁。");
            Object.Destroy(obj); // 如果不是通过池获取的，直接销毁
            return;
        }

        int objSceneId = obj.scene.buildIndex; // 获取对象当前所在的场景ID

        // 检查该对象原始所属场景和Prefab对应的池是否存在
        if (scenePools.ContainsKey(objSceneId) && scenePools[objSceneId].ContainsKey(originalPrefab))
        {
            IObjectPool<GameObject> pool = scenePools[objSceneId][originalPrefab];
            instanceToPrefabMap.Remove(obj); // 从映射中移除该实例
            pool.Release(obj); // 释放对象回池
        }
        else
        {
            // 理论上不应该发生，除非场景池在对象未回收前被清空或销毁
            Debug.LogWarning($"尝试回收对象 {obj.name} 但其原始所属场景的池或Prefab的池已不存在，将直接销毁。");
            Object.Destroy(obj);
            instanceToPrefabMap.Remove(obj); // 尝试移除映射
        }
    }

    /// <summary>
    /// 延迟一段时间后将GameObject实例回收到其所属的对象池中。
    /// </summary>
    /// <param name="obj">要回收的GameObject实例</param>
    /// <param name="delay">延迟时间（秒）</param>
    public static void Recycle(GameObject obj, float delay)
    {
        if (obj == null) return;

        if (delay <= 0f)
        {
            Recycle(obj); // 无延迟则立即回收
        }
        else
        {
            // 启动协程进行延迟回收
            runner.StartCoroutine(DoRecycleAfter(obj, delay));
        }
    }

    private static IEnumerator DoRecycleAfter(GameObject obj, float delay)
    {
        yield return new WaitForSeconds(delay);
        // 在延迟结束后，确保对象仍然存在且未被手动回收过，才执行回收
        if (obj != null && instanceToPrefabMap.ContainsKey(obj)) 
        {
            Recycle(obj);
        }
        else if (obj != null)
        {
             // 如果obj存在但不在instanceToPrefabMap中，说明它可能在延迟期间被外部销毁或回收了
             // Debug.LogWarning($"对象 {obj.name} 在延迟回收前已被处理或销毁。");
        }
    }

    /// <summary>
    /// 当场景卸载时调用，清理该场景相关的所有对象池。
    /// </summary>
    /// <param name="scene">卸载的场景</param>
    private static void OnSceneUnloaded(Scene scene)
    {
        int sceneId = scene.buildIndex;
        if (!scenePools.ContainsKey(sceneId)) return;

        // 遍历该场景的所有Prefab对应的对象池，并清空
        foreach (var kvp in scenePools[sceneId])
        {
            IObjectPool<GameObject> pool = kvp.Value;
            pool.Clear(); // 清空池会调用 actionOnDestroy 销毁所有对象
        }
        
        // 移除该场景的所有池字典
        scenePools.Remove(sceneId);

        // 遍历 instanceToPrefabMap，移除属于该场景的对象映射
        // 注意：这里需要创建一个临时列表来存储要移除的键，因为不能在迭代时修改字典
        List<GameObject> instancesToRemove = new List<GameObject>();
        foreach (var pair in instanceToPrefabMap)
        {
            if (pair.Key != null && pair.Key.scene.buildIndex == sceneId)
            {
                instancesToRemove.Add(pair.Key);
            }
        }
        foreach (GameObject inst in instancesToRemove)
        {
            instanceToPrefabMap.Remove(inst);
        }

        Debug.Log($"[ObjectPoolPro] 场景 {scene.name} (ID: {sceneId}) 卸载，已清理相关对象池和活跃实例映射。");
    }

    /// <summary>
    /// 清空所有场景的所有对象池及活跃实例映射。通常用于游戏结束或需要彻底重置时。
    /// </summary>
    public static void ClearAllPools()
    {
        foreach (var sceneIdToPools in scenePools.Values)
        {
            foreach (var pool in sceneIdToPools.Values)
            {
                pool.Clear(); // 清空每个具体的对象池
            }
        }
        scenePools.Clear(); // 清空场景池的字典
        instanceToPrefabMap.Clear(); // 清空所有活跃实例的映射

        Debug.Log("[ObjectPoolPro] 所有对象池及活跃实例映射已全部清理。");
    }
}

```

**实现解析：** 上述代码将 **ObjectPoolPro** 修改为**静态类**（假定其在整个游戏生命周期常驻）。核心改动在于引入了 `scenePools` 字典和 `instanceToPrefabMap`：

-   `scenePools`：以场景 ID 为键，值为该场景的**预制体池字典**。每个预制体对应一个 `IObjectPool<GameObject>` 实例。我们使用场景的 `BuildIndex` 作为场景标识（当然也可以用场景名称字符串）。
    
-   `instanceToPrefabMap`：记录**对象实例与其原始预制体**的对应关系。因为在 `Recycle` 时，我们只有对象实例，需要知道应放回哪一个池。这可以通过预制体引用来定位池。我们在每次从池中 `Get` 对象时，都在 `instanceToPrefabMap` 中登记 `instanceToPrefabMap[实例] = 预制体`。这样在回收时快速找到所属的预制体类型。如果发现回收的对象不在映射中（通常不应该发生，说明该对象不是通过池获取或已被处理），保险起见直接销毁处理。
    

`RegisterPrefab` 方法负责在当前场景中创建一个特定预制体的池，并可以预先生成一定数量的对象放入池中备用。`Get` 方法则尝试从池获取对象，没有可用对象时会实例化新的。需要注意的是，我们每次 `Get` 都调用 `RegisterPrefab(prefab, 0)` 来保证池存在（如果之前未注册过，会建立空池）。这样即使不显式注册，也能在第一次 `Get` 时自动初始化池。`Recycle` 方法将对象失活后放回其原始所属场景的池列表中，并更新映射关系。

**场景卸载的清理：** 在静态构造函数中，我们订阅了 `SceneManager.sceneUnloaded` 事件。当某个场景卸载时，Unity会调用 `OnSceneUnloaded(Scene scene)`。我们在该回调中取得卸载的场景 ID，然后：

-   遍历对应场景的所有 `IObjectPool<GameObject>` 实例，调用它们的 `Clear()`。Unity 对象池的 `Clear` 会将池内所有未使用的对象逐一调用我们提供的 `actionOnDestroy` 进行处理——在我们实现中，就是销毁 **GameObject**。这样一来，池中缓存的对象全部被正确销毁，避免内存泄漏。
    
-   将该场景的池字典从 `scenePools` 中移除，清空对这些对象池的引用。
    
-   **重要：** 还需要遍历 `instanceToPrefabMap`，移除所有属于该卸载场景的活跃对象的映射条目。这是因为 `OnSceneUnloaded` 触发时，某些对象可能仍处于活跃状态，但随着场景卸载它们也会被 Unity 销毁，此时需要同步清理 `instanceToPrefabMap` 以避免残留引用或后续尝试回收已销毁对象。
    

通过这一机制，场景 A 的对象不会“泄漏”到场景 B 中，每次切换场景都能确保上一个场景的池已彻底释放。此外，如果你的对象池管理器是一个挂载了 `DontDestroyOnLoad` 的对象（例如 `PoolCoroutineRunner`），那么跨场景保留池管理代码依然有效，但实际对象会根据场景分类管理，不会混用。

**使用说明：** 使用场景隔离的对象池系统时，要稍微注意以下事项：

-   **池注册：** 建议在每个场景初始化时（例如 `Start()` 或场景管理脚本中）调用 `ObjectPoolPro.RegisterPrefab(prefab, initialCount)` 为本场景所需的每种预制体创建对象池。这可以预加载对象，避免游戏过程中第一次生成对象的卡顿。如果忘记注册也没关系，首次 `Get` 会自动注册池。
    
-   **Get 和 Recycle：** 和之前用法相同，直接使用 `ObjectPoolPro.Get(prefab)` 获取对象实例，用完后调用 `ObjectPoolPro.Recycle(obj)` 回收即可。**重要**的是，**不要在场景切换后继续使用旧场景的对象**——本机制会在场景卸载时销毁它们。如果尝试访问，将发现对象已被销毁或不存在。一般情况下，场景卸载意味着旧场景对象用不到了，因此这不是问题。
    
-   **场景索引匹配：** 我们使用 `BuildIndex` 作为场景 ID。如果你的项目没有在 Build Settings 中设置场景索引，或者需要使用场景名称，也可以改用 `Scene.name` 作为字典键。使用索引的好处是避免重名场景冲突，并且整数键效率更高。
    

**小提示：** 如果我们的游戏使用**多场景加载（additive）**并行存在多个场景，也可以使用类似方式扩展。本例中假定每次只有一个活动场景，当卸载时清理对应池。如果同时有多个场景，我们可以在 `Get`/`Recycle` 时使用对象所属场景作为键（例如 `obj.scene.buildIndex` 而不总是当前活动场景），并在 `sceneUnloaded` 回调中清理卸载场景。根据具体需求稍作调整即可。

----------

通过以上三部分的实现，我们为 **ObjectPoolPro** 工具增添了强大的扩展功能。现在，它不仅能管理传统的 **GameObject** 实例池，还支持任意类型对象的复用（逻辑层对象池），可以通过组件自动管理对象的生命周期回收，并且在场景切换时自动隔离和清理，提高了资源管理的安全性。在实际项目中，这些改进将有效减少垃圾回收和内存泄漏风险，提升游戏运行效率和稳定性。希望这个进阶教程对你有所帮助，能够在 Unity 开发中更加得心应手地运用对象池优化游戏性能！

### 核心内容
## 正文

### 核心内容

### 总结
对本文内容的总结和未来展望。

### 实现方案
## 摘要
在上一节中，我们实现了一个功能完善的对象池工具 **ObjectPoolPro**，用于优化频繁生成和销毁的 **GameObject** 对象。本节将在此基础上进一步扩展对象池功能，增加更高级的特性，包括： -   **泛型对象池 GenericObjectPool** 支持非 **GameObject** 类型的对象复用，可用于逻辑对象（例如 Buff、行为树节点、路径点等）的池化管理。...

### 实现方案
具体的实现方法和实践指导。

## 元数据
- **创建时间：** 2026-04-11 21:55:13
- **最后更新：** 2026-04-11 21:55:13
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 对象池, 实践, unity, 高级
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

### 总结
对本文内容的总结和未来展望。

## 元数据
- **创建时间：** 2026-04-11 22:02:38
- **最后更新：** 2026-04-11 22:02:38
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 开发, unity, 游戏开发, 对象池
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-11 22:04:43
- **最后更新：** 2026-04-11 22:04:43
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** unity, 优化, 对象池
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*