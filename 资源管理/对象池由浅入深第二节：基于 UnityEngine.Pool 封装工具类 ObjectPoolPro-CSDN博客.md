# 对象池由浅入深第二节：基于 UnityEngine.Pool 封装工具类 ObjectPoolPro-CSDN博客

## 摘要
在游戏开发中，我们经常需要频繁生成和销毁一些游戏对象，例如子弹、敌人、特效等。如果每次都通过  创建和  销毁，将产生较大的**性能开销**和**垃圾回收负担**。为了优化性能，很多开发者会使用**对象池（Object Pool）** 技术：预先创建一批对象，反复利用它们，用激活和隐藏来替代创建和销毁。典型做法是维护一个列表或队列来缓存未使用的对象...

## 正文

## 摘要
在游戏开发中，我们经常需要频繁生成和销毁一些游戏对象，例如子弹、敌人、特效等。如果每次都通过  创建和  销毁，将产生较大的**性能开销**和**垃圾回收负担**。为了优化性能，很多开发者会使用**对象池（Object Pool）** 技术：预先创建一批对象，反复利用它们，用激活和隐藏来替代创建和销毁。典型做法是维护一个列表或队列来缓存未使用的对象...

## 正文

### 背景
# 对象池由浅入深第二节：基于 UnityEngine.Pool 封装工具类 ObjectPoolPro-CSDN博客

### 背景
本文探讨了相关技术主题的背景和重要性。

### 引言：传统对象复用方式的问题

在游戏开发中，我们经常需要频繁生成和销毁一些游戏对象，例如子弹、敌人、特效等。如果每次都通过 `Instantiate` 创建和 `Destroy` 销毁，将产生较大的**性能开销**和**垃圾回收负担**。为了优化性能，很多开发者会使用**对象池（Object Pool）** 技术：预先创建一批对象，反复利用它们，用激活和隐藏来替代创建和销毁。典型做法是维护一个列表或队列来缓存未使用的对象，通过 `SetActive(false)` 隐藏回收，在需要时再取出 `SetActive(true)` 激活。

然而，传统的 GameObject 缓存复用方式存在一些痛点：

-   **管理复杂，易出错：** 手动维护列表、检查对象状态容易出错。如果忘记重置对象的状态，可能导致复用时出现残留数据或逻辑错误。需要开发者小心处理每个脚本的状态重置、事件反注册等，增加了复杂度。
    
-   **重复回收问题：** 开发者必须防止同一对象被回收多次，否则可能出现逻辑混乱甚至错误。例如，不小心两次调用 `obj.SetActive(false)` 并放回列表，就可能造成对象池重复保存同一对象。
    
-   **未注册对象误用：** 如果尝试回收一个不属于对象池管理的对象，可能没有任何提示，造成对象丢失或内存泄漏。
    
-   **资源清理困难：** 场景切换时，如果不及时清理对象池，之前场景缓存的对象可能滞留在内存中，既浪费内存又可能干扰新场景。手动销毁这些缓存对象需要额外的管理代码。
    

总结来说，传统的 `List` 缓存 + 手动激活/隐藏的方法虽然能提高一定性能，但需要很多**额外的管理逻辑**，容易埋下 bug 隐患。幸运的是，Unity在近年来提供了官方的对象池 API，我们可以基于它封装出更安全好用的对象池工具。

----------

### 设计 ObjectPoolPro 对象池管理类

在封装对象池工具类之前，先明确我们的目标功能需求。**ObjectPoolPro** 类应当实现以下功能：

-   **注册Prefab（带预热）：** 能注册需要复用的预制体，初始化相应的对象池，并可以预先创建一定数量的实例作为缓存（预热），避免游戏运行时第一次使用时产生卡顿。
    
-   **获取对象实例并激活：** 提供方法从池中获取对象实例。若池为空则自动创建新实例。获取的对象应自动设置为激活状态，准备投入使用。
    
-   **回收对象并隐藏：** 提供方法回收用完的对象，将其放回池中缓存，并自动设置为非激活隐藏状态。
    
-   **支持延迟回收：** 支持指定延迟时间后再回收对象的功能，方便处理如“子弹在场景中存在2秒后自动回收”这样的需求。
    
-   **自动处理激活/隐藏逻辑：** 获取时自动激活对象，回收时自动隐藏对象，使用者无需每次手动调用 `SetActive`。
    
-   **安全性：防止误用：** 防止对象被重复回收，防止回收未经过池管理的对象。如发生此类情况，应有警告或错误提示，便于开发者调试。
    
-   **场景统一清理：** 当场景切换时，可以方便地清理所有池，销毁缓存的对象，避免跨场景的无用对象残留。
    

为实现上述功能，我们可以使用一个静态的 **ObjectPoolPro** 类来管理所有对象池。在内部，通过字典来存储不同预制体对应的对象池，以及跟踪每个实例与对象池的关系，以实现自动管理和安全检查。下面我们将分步骤展示 ObjectPoolPro 类的代码实现，并附上详细注释进行解释。

----------

### 总结

通过本文教程，我们构建了一个基于 Unity 内置 `UnityEngine.Pool.ObjectPool<T>` 的 GameObject 对象池管理工具 **ObjectPoolPro**。它解决了传统对象池手动管理的诸多问题，提供了简洁易用的接口：

-   自动处理对象的创建、激活、隐藏和销毁，使用者无需繁琐地手动管理。
    
-   内置安全检查机制，防止常见的重复回收、误回收错误，提升开发效率和代码健壮性。
    
-   支持延迟回收等实用功能，一行代码即可实现定时回收效果。
    
-   支持一键清理所有池，方便地管理跨场景的对象生命周期。
    

在实际项目中，你可以根据需要对 ObjectPoolPro 扩展，例如增加按照类型字符串键注册、针对不同类型对象定制回收处理（如重置对象状态），甚至结合 Unity Addressables 或 Asset 管理。但即使不开箱扩展，当前这个对象池工具类已经可以胜任大部分中小型项目的对象复用需求。希望你通过本教程掌握对象池的使用方法，在自己的 Unity 项目中应用对象池技术来优化性能，让游戏运行更加流畅！

### 核心内容
## 摘要
在游戏开发中，我们经常需要频繁生成和销毁一些游戏对象，例如子弹、敌人、特效等。如果每次都通过 `Instantiate` 创建和 `Destroy` 销毁，将产生较大的**性能开销**和**垃圾回收负担**。为了优化性能，很多开发者会使用**对象池（Object Pool）** 技术：预先创建一批对象，反复利用它们，用激活和隐藏来替代创建和销毁。典型做法是维护一个列表或队列来缓存未使用的对象...

## 正文

### 核心内容

### 实现 ObjectPoolPro：代码与详细注释

首先，引入必要的命名空间，包括 `UnityEngine` 以及 Unity 自带的对象池命名空间 `UnityEngine.Pool`：



```
using UnityEngine;
using UnityEngine.Pool;
using System.Collections;
using System.Collections.Generic;

```

接下来，定义我们的 **ObjectPoolPro** 类。为了方便全局访问，我们使用 `public static class` 来封装：



```
public static class ObjectPoolPro
{
    // ... 代码内容 ...
}

```

#### 字段与内部辅助类

在 ObjectPoolPro 内部，我们需要一些私有静态字段来存储对象池数据：

-   一个字典 `prefabPools`，将**预制体 Prefab** 映射到对应的 `IObjectPool<GameObject>` 实例。每种Prefab都有自己独立的池，避免不同类型对象混用。
    
-   一个字典 `instanceToPool`，用于跟踪**场景中激活的对象实例**属于哪个对象池。当回收对象时，我们通过它找到对应的池进行释放。这有助于防止未注册或已回收对象的误回收。
    
-   一个内部类 `PoolCoroutineRunner` 继承自 `MonoBehaviour`，用于在需要延迟回收时执行协程（Unity 的协程必须在挂载了 `MonoBehaviour` 的对象上运行）。我们会在运行时动态创建一个隐藏的游戏对象并附加该脚本，以调度延迟回收逻辑。
    

现在，将上述字段和内部类添加到 ObjectPoolPro 中：



```
public static class ObjectPoolPro
{
    private static Dictionary<GameObject, IObjectPool<GameObject>> prefabPools
        = new Dictionary<GameObject, IObjectPool<GameObject>>();

    private static Dictionary<GameObject, IObjectPool<GameObject>> instanceToPool
        = new Dictionary<GameObject, IObjectPool<GameObject>>();

    private class PoolCoroutineRunner : MonoBehaviour { }

    private static PoolCoroutineRunner runner;

    private static void InitRunner()
    {
        if (runner == null)
        {
            GameObject runnerObj = new GameObject("ObjectPoolProRunner");
            Object.DontDestroyOnLoad(runnerObj);
            runner = runnerObj.AddComponent<PoolCoroutineRunner>();
            UnityEngine.SceneManagement.SceneManager.sceneUnloaded += _ => { ClearAll(); };
        }
    }
}

```

`InitRunner()` 会在第一次需要用到协程时被调用。它创建一个名为 "ObjectPoolProRunner" 的空游戏对象，并标记为 `DontDestroyOnLoad`（这样场景切换时不会被销毁），然后添加 `PoolCoroutineRunner` 脚本组件赋给静态变量 `runner`。今后我们就可以通过 `runner.StartCoroutine(...)` 来运行协程，实现延迟回收功能。

> **实现提示：** 我们将 `ObjectPoolPro` 设计为静态类，全局只需一份。通过在内部创建一个隐藏的 GameObject 来运行协程，使用者无需手动将任何管理脚本拖入场景，一切由工具类自动完成。这种模式在工具类设计中很常见。

----------

#### 注册 Prefab：RegisterPrefab 方法

核心功能之一是注册一个预制体 Prefab，使其具备对象池功能。`RegisterPrefab` 方法的主要职责包括：如果尚未有该 Prefab 的池，则创建一个新的对象池，并按照需要预创建一定数量的对象实例（预热）。

代码实现如下：



```
public static void RegisterPrefab(GameObject prefab, int preloadCount = 0, int maxPoolSize = 100)
{
    if (prefabPools.ContainsKey(prefab))
    {
        Debug.LogWarning($"Prefab {prefab.name} 已经注册过对象池！");
        return;
    }

    IObjectPool<GameObject> pool = new ObjectPool<GameObject>(
        createFunc: () =>
        {
            GameObject obj = Object.Instantiate(prefab);
            obj.SetActive(false);
            return obj;
        },
        actionOnGet: obj =>
        {
            obj.SetActive(true);
        },
        actionOnRelease: obj =>
        {
            obj.SetActive(false);
        },
        actionOnDestroy: obj =>
        {
            Object.Destroy(obj);
        },
        collectionCheck: true,
        defaultCapacity: preloadCount,
        maxSize: maxPoolSize
    );

    prefabPools[prefab] = pool;

    if (preloadCount > 0)
    {
        List<GameObject> tempList = new List<GameObject>();
        for (int i = 0; i < preloadCount; i++)
        {
            GameObject obj = pool.Get();
            tempList.Add(obj);
        }

        foreach (GameObject obj in tempList)
        {
            pool.Release(obj);
        }
        tempList.Clear();
    }
}

```

**代码解析：**

-   我们首先检查传入的 `prefab` 是否已注册过池，避免重复注册造成冲突。如果已存在，同一 Prefab 不需要重复创建池。
    
-   使用 `new ObjectPool<GameObject>(...)` 创建一个泛型对象池，类型为 GameObject。这里通过**lambda 表达式**传入了 4 个重要回调，用于定制对象的创建、获取、回收和销毁行为：
    
    -   `createFunc`: 当池内没有闲置对象时调用。我们在此执行 `Instantiate(prefab)` 实例化一个新的对象，并 `SetActive(false)` 隐藏它（创建时先隐藏，避免在场景中一出现就可见）。
        
    -   `actionOnGet`: 对象从池取出时调用。对于 GameObject，我们在此将其激活 (`obj.SetActive(true)`)，以便立即可以在场景中可见并参与逻辑。
        
    -   `actionOnRelease`: 对象释放回池时调用。我们这里简单地将其隐藏 (`obj.SetActive(false)`)，这样对象在池中保持休眠状态，不会干扰场景。
        
    -   `actionOnDestroy`: 当池容量已满又有对象要回收，或者调用了池的 `Clear()` 方法时，会对多余的对象执行该回调。对于 GameObject，我们选择调用 `Object.Destroy(obj)` 真正销毁，释放内存。
        
-   我们将 `collectionCheck` 参数设为 `true`（默认也是 true），让 Unity 帮助检查错误用法。开启此选项会在回收对象时验证该对象是否已经在池内（已回收）或根本不属于该池，若发现问题会抛出异常或错误日志。这对开发调试非常有帮助。
    
-   `defaultCapacity` 我们传入了 `preloadCount` 预热数量，作为栈的初始容量。如果预热 10 个，那么栈初始就分配空间容纳 10 个元素。`maxSize` 则使用参数 `maxPoolSize`，默认为 100，表示池最多保存 100 个闲置对象，可根据需要调整大小。
    

接下来，把创建好的池存入 `prefabPools` 字典中，键为 Prefab。这允许我们通过 Prefab 快速找到对应的池。

最后是**预热逻辑**：如果 `preloadCount > 0`，我们通过循环从池中 **获取并立即释放** 指定数量的对象。`pool.Get()` 会调用我们定义的 `createFunc` 多次来生成对象，然后我们马上 `pool.Release(obj)` 回收它们。这一出一进过程中，每个对象会被激活再隐藏一次（因为我们在 OnGet/OnRelease 中设置了 SetActive），最终它们都进入池的闲置栈中，以备后续使用。预热操作可以在游戏开始时（如加载场景时）完成，避免第一次使用对象时的创建开销导致卡顿。

**注意：** 预热时我们将新创建的对象立即隐藏并放回池中，玩家不会看到这些对象。建议在游戏开始或不影响画面的时机进行预热。如果对象有初始位置或父节点要求，也可以在创建时设置好（例如 `obj.transform.SetParent(...)` 定义一个专门的对象池节点存放这些隐藏对象，以保持 Hierarchy 整洁）。

----------

#### 获取对象：Get 方法

注册好对象池后，游戏中就可以通过对象池来获取对象实例，而不是每次 `Instantiate`。ObjectPoolPro 提供静态方法 **Get** 来获取对象：



```
public static GameObject Get(GameObject prefab)
{
    if (!prefabPools.ContainsKey(prefab))
    {
        RegisterPrefab(prefab, 0); // 自动注册，不预热
    }

    IObjectPool<GameObject> pool = prefabPools[prefab];
    GameObject obj = pool.Get();
    instanceToPool[obj] = pool; // 记录对象与池的映射关系
    return obj;
}

```

**代码解析：**

-   如果请求的 `prefab` 尚未注册对象池，我们调用 `RegisterPrefab(prefab, 0)` 自动创建一个池（默认不预热）。这样使用者即使忘记提前注册，第一次调用 Get 时也能正常建立池，但会有一次 Instantiate 的开销。建议还是在初始化阶段注册并预热关键 Prefab 以提高首帧性能。
    
-   从字典查找该 Prefab 的对象池 `pool`，然后调用 `pool.Get()` 获取一个对象实例。由于我们设置了 `actionOnGet` 会激活对象，因此返回时 `obj` 已经是激活状态，不需要额外调用 `SetActive`。
    
-   将得到的实例 `obj` 存入 `instanceToPool` 映射，记录它来自哪个池。这一步很重要，**它让我们可以追踪场景中活跃对象的归属**。后续回收时，我们会用这个映射来找到正确的池并进行释放，同时也能检测重复回收的问题。
    
-   返回获取的 GameObject 实例给调用方使用。使用者可以像对待新 Instantiate 的对象一样对它设置位置、状态等。
    

这样，通过 `ObjectPoolPro.Get`，我们轻松获取到了一个对象池管理的实例，无需关心背后是新创建的还是复用的。对象池已经帮我们处理好了对象的创建或取出，并确保它处于激活状态。

----------

#### 回收对象：Recycle 方法

当对象使用完毕，需要回收返回池中以供下次复用。ObjectPoolPro 提供 **Recycle** 方法来释放对象，有两个重载：一个立即回收，另一个支持延迟回收。

**1. 立即回收**



```
public static void Recycle(GameObject obj)
{
    if (obj == null) return;

    if (!instanceToPool.ContainsKey(obj))
    {
        Debug.LogError($"对象 {obj.name} 不属于任何对象池，无法回收！");
        return;
    }

    IObjectPool<GameObject> pool = instanceToPool[obj];
    instanceToPool.Remove(obj); // 从活跃实例映射中移除
    pool.Release(obj); // 释放回池
}

```

**代码解析：**

-   **空对象检查：** 如果传入 `obj == null`，直接返回不处理，以防止 Null 引用错误。
    
-   然后用 `instanceToPool` 检查这个对象实例是否在我们维护的映射中。如果找不到，意味着这个对象**不是通过对象池获取的**，或者已经回收过一次了。我们用 `Debug.LogError` 提示错误，防止错误回收。【防止误用】这一机制保证了不会重复回收同一对象或回收陌生对象，从而维护池内数据一致性。
    
-   若映射存在，则获取对应的对象池引用 `pool`，并在字典中移除该对象记录（表示它将不再是场景中的活跃对象了）。
    
-   调用 `pool.Release(obj)` 将对象释放回池。Unity 的对象池实现会在内部将它压入空闲栈，并调用我们之前提供的 `actionOnRelease` 回调隐藏对象。这一步之后，对象变为非激活状态并在池中待命。
    

使用者调用 `ObjectPoolPro.Recycle(obj)` 后，对象就安全地回到池中了。再次调用 `Get` 时又可以取出复用。通过我们的映射和 Unity 自身的 `collectionCheck` 双保险，避免了重复回收或野对象回收导致的问题。

**2. 延迟回收**

许多情况下，我们希望对象在生成一段时间后自动回收，例如子弹射出后存在 2 秒就回收。为此，我们实现 **Recycle(obj, float delay)** 重载，用于延迟回收对象：



```
public static void Recycle(GameObject obj, float delay)
{
    if (obj == null) return;

    if (delay <= 0f)
    {
        Recycle(obj); // 立即回收
    }
    else
    {
        InitRunner(); // 确保协程执行器存在
        runner.StartCoroutine(DoRecycleAfter(obj, delay));
    }
}

private static IEnumerator DoRecycleAfter(GameObject obj, float delay)
{
    yield return new WaitForSeconds(delay);
    Recycle(obj); // 计时结束后调用立即回收
}

```

**代码解析：**

-   如果延迟时间 `delay <= 0`，就直接调用前面的立即回收方法，等价于没有延迟。这样也兼容了调用传入 0 的情况。
    
-   当 `delay > 0` 时，我们利用之前的协程执行器 `runner` 来启动一个协程 `DoRecycleAfter`。这里先调用 `InitRunner()` 确保协程执行器存在，然后调用 `runner.StartCoroutine(...)`。
    
-   `DoRecycleAfter` 协程非常简单：等待指定秒数后，调用 `Recycle(obj)` 进行真正的回收。因为协程执行时对象依然处于场景中活跃状态，可以继续表现（例如子弹继续飞行），等计时结束才被隐藏回收。
    

通过这种方式，使用者只需一行调用 `ObjectPoolPro.Recycle(obj, 2.0f)`，就能实现对象两秒后自动回收的效果，而无需在自己的脚本里反复写协程逻辑。这大大方便了定时销毁/回收的处理。

值得注意的是，在等待过程中，我们并未再次验证对象的有效性，比如对象是否已经被手动回收。因为我们的设计决定，**一旦调用了 Recycle(obj, t)**，就假定对象会在 t 秒后回收，期间不应再手动回收或 Destroy 该对象。如果开发者可能在延迟期间取消回收，可额外处理标记。但通常情况下，这种简单实现已经能满足大部分使用场景。

----------

#### 场景切换清理：ClearAll 方法

最后，实现**清理**功能。`ClearAll` 方法将清除所有注册的池并销毁池内缓存的对象，用于在场景结束或需要释放内存时调用：



```
public static void ClearAll()
{
    foreach (var pool in prefabPools.Values)
    {
        pool.Clear(); // 清空每个池，销毁其中的对象
    }
    prefabPools.Clear(); // 清空 Prefab 到池的映射
    instanceToPool.Clear(); // 清空实例到池的映射
}

```

这一方法遍历所有已注册的对象池，调用它们的 `Clear()`。Unity 对象池的 `Clear` 会将池内所有未使用的对象逐一调用我们提供的 `actionOnDestroy` 进行处理——在我们实现中，就是销毁 GameObject。这样一来，池中缓存的对象全部被正确销毁，避免内存泄漏。最后我们清空字典，释放掉对这些对象和池的引用。

当切换场景时，调用 `ObjectPoolPro.ClearAll()` 可以有效清理掉旧场景的对象池缓存。实际上，我们在 `InitRunner()` 把协程执行器设为 `DontDestroyOnLoad` 后，可以选择监听 Unity 的场景切换事件，在场景卸载时自动调用 `ClearAll`，实现自动清理。例如：



```
using UnityEngine.SceneManagement;

// 在 InitRunner() 中添加这行
SceneManager.sceneUnloaded += _ => { ClearAll(); };

```

这样，当场景卸载时会自动清理对象池。不过出于明确性，你也可以在自己游戏管理代码中手动调用 `ClearAll`。总之，有了这个方法，我们确保不会有跨场景的无用对象遗留，实现了池的生命周期管理。

至此，**ObjectPoolPro** 的核心实现已经完成。我们将各部分代码整合，附上必要的注释，方便复制使用：



```
using UnityEngine;
using UnityEngine.Pool;
using System.Collections;
using System.Collections.Generic;
using UnityEngine.SceneManagement; // 添加此行用于场景事件监听

public static class ObjectPoolPro
{
    private static Dictionary<GameObject, IObjectPool<GameObject>> prefabPools
        = new Dictionary<GameObject, IObjectPool<GameObject>>();

    private static Dictionary<GameObject, IObjectPool<GameObject>> instanceToPool
        = new Dictionary<GameObject, IObjectPool<GameObject>>();

    private class PoolCoroutineRunner : MonoBehaviour { }

    private static PoolCoroutineRunner runner;

    private static void InitRunner()
    {
        if (runner == null)
        {
            GameObject runnerObj = new GameObject("ObjectPoolProRunner");
            Object.DontDestroyOnLoad(runnerObj);
            runner = runnerObj.AddComponent<PoolCoroutineRunner>();
            // 订阅场景卸载事件，自动清理对象池
            SceneManager.sceneUnloaded += _ => { ClearAll(); };
        }
    }

    public static void RegisterPrefab(GameObject prefab, int preloadCount = 0, int maxPoolSize = 100)
    {
        if (prefabPools.ContainsKey(prefab))
        {
            Debug.LogWarning($"Prefab {prefab.name} 已经注册过对象池！");
            return;
        }

        IObjectPool<GameObject> pool = new ObjectPool<GameObject>(
            createFunc: () =>
            {
                GameObject obj = Object.Instantiate(prefab);
                obj.SetActive(false); // 初始创建时先隐藏
                return obj;
            },
            actionOnGet: obj => { obj.SetActive(true); }, // 取出时激活
            actionOnRelease: obj => { obj.SetActive(false); }, // 回收时隐藏
            actionOnDestroy: obj => { Object.Destroy(obj); }, // 销毁时彻底销毁
            collectionCheck: true,
            defaultCapacity: preloadCount,
            maxSize: maxPoolSize
        );

        prefabPools[prefab] = pool;

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

    public static GameObject Get(GameObject prefab)
    {
        if (!prefabPools.ContainsKey(prefab))
        {
            Debug.LogWarning($"Prefab {prefab.name} 未注册对象池，将自动注册！");
            RegisterPrefab(prefab, 0); // 未注册则自动注册，不预热
        }

        IObjectPool<GameObject> pool = prefabPools[prefab];
        GameObject obj = pool.Get();
        instanceToPool[obj] = pool; // 记录对象归属
        return obj;
    }

    public static void Recycle(GameObject obj)
    {
        if (obj == null) return;

        if (!instanceToPool.ContainsKey(obj))
        {
            Debug.LogError($"对象 {obj.name} 不属于任何对象池，无法回收！请检查是否已回收或未通过ObjectPoolPro获取。");
            return;
        }

        IObjectPool<GameObject> pool = instanceToPool[obj];
        instanceToPool.Remove(obj); // 从活跃映射中移除
        pool.Release(obj); // 释放对象回池
    }

    public static void Recycle(GameObject obj, float delay)
    {
        if (obj == null) return;

        if (delay <= 0f)
        {
            Recycle(obj); // 立即回收
        }
        else
        {
            InitRunner(); // 确保协程执行器已初始化
            runner.StartCoroutine(DoRecycleAfter(obj, delay));
        }
    }

    private static IEnumerator DoRecycleAfter(GameObject obj, float delay)
    {
        yield return new WaitForSeconds(delay);
        // 在延迟结束后再次检查对象是否有效，防止在等待期间被外部销毁
        if (obj != null) 
        {
            Recycle(obj);
        }
    }

    public static void ClearAll()
    {
        foreach (var pool in prefabPools.Values)
        {
            pool.Clear(); // 清空每个池，销毁其所有对象
        }
        prefabPools.Clear(); // 清空所有 Prefab 池的引用
        instanceToPool.Clear(); // 清空所有实例的映射
        
        // 可选：如果runner是DontDestroyOnLoad，可以在这里销毁runnerObj
        // if (runner != null)
        // {
        //     Object.Destroy(runner.gameObject);
        //     runner = null;
        // }
    }
}

```

（以上代码已包含完整实现，可直接复制到 Unity 工程中使用。）

----------

### 总结
对本文内容的总结和未来展望。

### 实现方案
### UnityEngine.Pool.ObjectPool

Unity 的 **UnityEngine.Pool** 命名空间提供了通用的对象池支持，其中最主要的类是 `ObjectPool<T>`（以及接口 `IObjectPool<T>` 和相关的 `CollectionPool` 等）。`ObjectPool<T>` 是一个基于栈实现的通用对象池类，用于缓存引用类型对象（包括游戏对象）以重复利用。它具有以下特性和优点：

-   **自定义对象创建：** 在创建 `ObjectPool<T>` 时，我们可以传入一个 `Func<T> createFunc` 委托，定义池中对象不足时如何创建新对象。例如，对于一般类对象可以是 `() => new T()`，而对于预制体 GameObject，可以提供 `Instantiate(prefab)` 来生成。
    
-   **获取/回收回调：** 我们还能提供 `Action<T> actionOnGet` 和 `Action<T> actionOnRelease` 回调，在对象从池取出和释放回池时自动调用。例如我们可指定 `actionOnGet` 内激活 GameObject（`SetActive(true)`），`actionOnRelease` 内隐藏 GameObject（`SetActive(false)`），这样获取/回收时会自动处理对象的显隐。这使对象池在复用游戏对象时，统一管理激活和隐藏逻辑。
    
-   **最大容量限制：** 可以在构造时指定池的最大大小 `maxSize`。当池中缓存的对象数量超过最大值时，继续释放对象会触发我们提供的销毁回调（`actionOnDestroy`），例如对 GameObject 调用 `Destroy`。这样可防止对象无限增长，占用过多内存。
    
-   **安全检查机制：** 内置的 `collectionCheck` 选项（默认开启）会检查避免重复回收**同一实例**或回收不属于该池的实例。如果发生这种情况，池会抛出错误或警告，帮助我们及时发现误用。这相当于自动防止了上述的“重复释放”和“未注册对象”错误。
    
-   **统一清理：** 提供 `Clear()` 方法可以一次性清空池，销毁所有缓存的对象。这对场景切换等情况非常实用。
    

借助 Unity 官方的对象池 API，我们无需从零编写底层对象池逻辑，只需关注如何利用这些回调和机制来管理游戏对象的复用。接下来，我们将基于 `UnityEngine.Pool.ObjectPool<T>` 封装一个针对 GameObject 的对象池管理工具类 **ObjectPoolPro**，实现更加方便的接口和功能。

----------

### 使用示例：生成子弹并延迟回收

下面通过一个简单示例演示 **ObjectPoolPro** 的用法。假设我们有一个子弹的 Prefab，想在游戏中生成子弹并让它在 2 秒后自动回收。

首先，在游戏开始时注册并预热子弹对象池。例如我们在某初始化脚本的 `Start()` 方法中执行：



```
public GameObject bulletPrefab;

void Start()
{
    // 注册子弹Prefab，预热10个，最大池大小为20
    ObjectPoolPro.RegisterPrefab(bulletPrefab, preloadCount: 10, maxPoolSize: 20);
}

```

这样，子弹池创建并预先实例化了 10 个子弹对象（此时它们被隐藏缓存起来）。池最多保留 20 个子弹，多余的将直接销毁。

接下来，在需要发射子弹时：



```
void ShootBullet(Vector3 position, Vector3 direction)
{
    GameObject bullet = ObjectPoolPro.Get(bulletPrefab); // 从池中获取子弹实例
    bullet.transform.position = position;
    bullet.transform.forward = direction;
    // 子弹在2秒后自动回收到池中
    ObjectPoolPro.Recycle(bullet, 2.0f); 
}

```

当我们调用 `ObjectPoolPro.Get(bulletPrefab)` 时，如果池中有闲置子弹就直接复用，没有的话则会自动 Instantiate 一个。拿到子弹后，我们设置它的位置和朝向，使其出现在枪口并朝向射击方向。然后调用 `ObjectPoolPro.Recycle(bullet, 2.0f)`，那么该子弹将在 2 秒后自动被隐藏并放回池中。如此循环，后续每次射击都可以重复利用这些子弹对象，而不会反复创建和销毁。

整个过程对游戏逻辑来说非常简单，我们不需要关心子弹何时销毁，只要设置好回收时间即可。对象池则在幕后帮我们管理了对象的生命周期，提高了性能并保持代码整洁。

最后，在场景切换或不再需要这些子弹时，记得调用 `ObjectPoolPro.ClearAll()` 清理池子（如果协程执行器设置了自动清理，也可以省略手动调用）。这会确保所有缓存的对象都正确销毁，避免内存泄漏。

----------

### 实现方案
具体的实现方法和实践指导。

### 总结
## 元数据
- **创建时间：** 2026-04-11 21:55:13
- **最后更新：** 2026-04-11 21:55:13
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 对象池, 游戏开发, unity, 开发
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-11 22:02:38
- **最后更新：** 2026-04-11 22:02:38
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** unity, 开发, 缓存, 对象池, 游戏开发
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-11 22:04:43
- **最后更新：** 2026-04-11 22:04:43
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** unity, 性能, 优化, 对象池
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*