# 对象池由浅入深第一节：Unity对象池教程--原理与实践_unity对象池的原理-CSDN博客

## 摘要
在游戏开发中，频繁创建和销毁对象会带来明显的性能开销。每次生成一个 **GameObject** 不仅需要分配内存，还可能触发垃圾回收（GC）和磁盘I/O，而频繁销毁对象则容易导致内存碎片。这些问题会加重CPU负担，引发帧率波动甚至卡顿。**对象池（Object Pool）** 是一种常用的优化技术，核心思想是预先创建一批对象缓存起来，在需要时重复使用...

## 正文

## 摘要
在游戏开发中，频繁创建和销毁对象会带来明显的性能开销。每次生成一个 **GameObject** 不仅需要分配内存，还可能触发垃圾回收（GC）和磁盘I/O，而频繁销毁对象则容易导致内存碎片。这些问题会加重CPU负担，引发帧率波动甚至卡顿。**对象池（Object Pool）** 是一种常用的优化技术，核心思想是预先创建一批对象缓存起来，在需要时重复使用而不是每次新建和销毁。通过将用过的对象“...

## 正文

### 背景
### 背景
本文探讨了相关技术主题的背景和重要性。

### 1. 对象池原理：为什么要使用对象池？

在游戏开发中，频繁创建和销毁对象会带来明显的性能开销。每次生成一个 **GameObject** 不仅需要分配内存，还可能触发垃圾回收（GC）和磁盘I/O，而频繁销毁对象则容易导致内存碎片。这些问题会加重CPU负担，引发帧率波动甚至卡顿。**对象池（Object Pool）** 是一种常用的优化技术，核心思想是预先创建一批对象缓存起来，在需要时重复使用而不是每次新建和销毁。通过将用过的对象“放回池中”待下次使用，可以显著减少反复实例化/销毁带来的开销和垃圾回收压力。

对象池特别适合管理生命周期短、重复出现的游戏对象，例如子弹、爆炸特效、敌人角色等。这些对象在典型游戏场景中会大量生成和消失，如果每次都动态创建和销毁，将占用过多CPU和内存资源。使用对象池可以让这类对象的**重复利用**变得高效：对象池在启动时一次性创建好一定数量的对象，每次需要时从池中取出，用完后再归还。这种方式能避免内存反复分配释放所造成的碎片和额外开销，同时降低内存占用。**总结来说，对象池通过对象复用减少了资源浪费，提升了游戏运行的流畅度和稳定性。**

----------

### 3. 使用示例：子弹发射与回收

假设我们在一款射击游戏中管理子弹，如果每次射击都创建新子弹而事后销毁，大量弹幕会造成性能问题。现在我们利用上面的 **GameObjectPool** 来优化这一过程。步骤如下：

**1. 场景配置**：将 `GameObjectPool` 脚本挂载到场景中的一个管理对象（如 `BulletManager` 空物体），在 Inspector 面板中指定 `prefab` 为子弹的预制体，设置初始池大小（例如10），并将 `allowExpansion` 视需求开关。子弹预制体应包含必要的组件（如刚体、碰撞体和子弹行为脚本）。

**2. 发射脚本**：编写一个脚本控制玩家开火，从对象池获取子弹并激活。例如：



```
public class Gun : MonoBehaviour
{
    public Transform firePoint;
    public float bulletSpeed = 20f;

    void Update() {
        if (Input.GetMouseButtonDown(0)) {
            GameObject bullet = GameObjectPool.Instance.GetObject();
            if (bullet != null) {
                bullet.transform.position = firePoint.position;
                bullet.transform.rotation = firePoint.rotation;
                Rigidbody rb = bullet.GetComponent<Rigidbody>();
                if (rb != null) {
                    rb.velocity = bullet.transform.forward * bulletSpeed;
                }
            }
        }
    }
}

```

在上述代码中，每次鼠标左键点击都会从池中取出一个子弹对象。如有空闲子弹则复用，没有则（允许扩展时）创建新弹加入池。获取到子弹后，我们将其移动到枪口位置并设置运动。无需调用 `Instantiate`，大幅减少了运行时开销。

**3. 子弹脚本**：为子弹对象添加一个脚本，在碰撞或飞行一定时间后自动将自身回收到池中（通过失活实现）。例如：



```
public class Bullet : MonoBehaviour
{
    void OnCollisionEnter(Collision collision) {
        gameObject.SetActive(false);
    }

    void OnEnable() {
        StartCoroutine(AutoDisable());
    }

    IEnumerator AutoDisable() {
        yield return new WaitForSeconds(5f);
        if (gameObject.activeInHierarchy) {
            gameObject.SetActive(false);
        }
    }
}

```

上述 `Bullet` 脚本演示了两种回收方式：**碰撞回收**和**定时回收**。实际项目中可以二选一或结合使用。当子弹命中目标（触发 `OnCollisionEnter`）时，我们将其 `SetActive(false)`，这样子弹就回到池可再次使用；如果子弹一直未碰到东西，`OnEnable` 中启动的协程会在5秒后自动将其失活，防止子弹永久留在场景中。无需调用 `Destroy`，子弹对象始终在内存中被复用。

**运行效果**：初始时，对象池生成的子弹对象都是隐藏状态，不会参与游戏逻辑。当玩家不停点击开火时，池中的子弹会被激活并重复利用——可以看到子弹从枪口出现飞出，碰到场景中的地面或目标后消失，但实际并未销毁，而是回到了对象池待命。如果连续射击次数超过初始池容量且允许扩容，池会自动增加新子弹；反之，如果池大小固定且所有子弹都在飞行，再请求时 `GetObject()` 会返回 `null`（此时应当做好判空处理）。通过 Profiler 观察，可以发现整个过程中几乎没有新的内存分配和垃圾回收生成，游戏运行更加平稳。

----------

### 核心内容
# 对象池由浅入深第一节：Unity对象池教程--原理与实践_unity对象池的原理-CSDN博客

## 摘要
在游戏开发中，频繁创建和销毁对象会带来明显的性能开销。每次生成一个 **GameObject** 不仅需要分配内存，还可能触发垃圾回收（GC）和磁盘I/O，而频繁销毁对象则容易导致内存碎片。这些问题会加重CPU负担，引发帧率波动甚至卡顿。**对象池（Object Pool）** 是一种常用的优化技术，核心思想是预先创建一批对象缓存起来，在需要时重复使用而不是每次新建和销毁。通过将用过的对象“...

## 正文

### 核心内容

### 2. 手写一个简单的 GameObject 对象池

了解了原理，我们来实际编写一个简单的 **GameObject** 对象池类。这个对象池将**预先创建一组对象并缓存**起来，用一个列表保存它们。当需要对象时，从列表中**找出未激活（闲置）的对象**返回；如果没有可用对象且允许扩容，则实例化新的对象加入池中。对象使用完毕后，我们通过将其 `SetActive(false)` 停用来回收，下次再利用。下面是对象池类的实现代码：



```
using UnityEngine;
using System.Collections.Generic;

public class GameObjectPool : MonoBehaviour
{
    public static GameObjectPool Instance;
    public GameObject prefab;
    public int initialSize = 10;
    public bool allowExpansion = true;

    private List<GameObject> poolList;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        poolList = new List<GameObject>();
        for (int i = 0; i < initialSize; i++)
        {
            GameObject obj = Instantiate(prefab);
            obj.SetActive(false);
            poolList.Add(obj);
        }
    }

    public GameObject GetObject()
    {
        foreach (GameObject obj in poolList)
        {
            if (!obj.activeInHierarchy)
            {
                obj.SetActive(true);
                return obj;
            }
        }

        if (allowExpansion)
        {
            GameObject newObj = Instantiate(prefab);
            newObj.SetActive(true);
            poolList.Add(newObj);
            return newObj;
        }

        return null;
    }
}

```

上面的代码实现了一个通用的 **GameObject** 对象池。**其工作机制如下**：

-   **初始化池**：在 `Start()` 中预先实例化 `initialSize` 个 `prefab` 对象，并将它们 `SetActive(false)` 隐藏，存入列表进行缓存。这一步相当于提前做好对象的内存分配，避免游戏运行过程中频繁的实例化开销。
    
-   **获取对象**：通过 `GetObject()` 方法从池中请求对象。函数内部遍历列表，找到第一个未激活（空闲）的对象，将其 `SetActive(true)` 激活并返回给调用方使用。如果列表中所有对象都在使用且 `allowExpansion=true`，则说明池容量不够，额外 `Instantiate` 一个新对象加入池并返回。若不允许扩展且无空闲对象，则返回 `null` 表示资源耗尽。
    
-   **回收对象**：对象使用完毕后，并不调用 `Destroy` 销毁，而是通过将对象 `SetActive(false)` 来停用它。这样该对象依然在池的列表中，处于“未激活”状态，可供下次 `GetObject()` 时复用。回收动作可以由对象自身的脚本完成（例如在碰撞或动画结束时自行失活），也可以由管理器脚本监测后统一处理。关键是确保对象被设为未激活状态即可重新回到池中。
    

通过上述实现，我们手写了一个最简单的对象池工具类。它利用 `List<GameObject>` 保存对象引用，结合激活/停用机制，实现了对象的重复利用。这种传统实现方法清晰直观，能帮助我们理解对象池的工作原理，但需要手动管理对象状态和池容量。下面，我们通过一个具体示例来看该对象池的使用效果。

----------

### 4. Unity 内置的 ObjectPool

手动实现对象池能帮助我们加深理解，但在实际开发中也增加了自己维护代码的负担。**Unity 引擎从 2021 版开始提供了内置的对象池 API**（命名空间 `UnityEngine.Pool`），包含通用的[泛型类](https://so.csdn.net/so/search?q=%E6%B3%9B%E5%9E%8B%E7%B1%BB&spm=1001.2101.3001.7020) `ObjectPool<T>` 用于对象池管理。Unity 官方文档指出，对象池是一种优化项目性能的设计模式，能够降低快速创建和销毁对象对 CPU 造成的负担。利用官方提供的 `ObjectPool<T>` 类，我们无需从零编写池逻辑，只需配置好如何创建对象以及取出/回收时的行为，即可方便地管理对象的复用。

**基本用法**：使用 `ObjectPool<T>` 前，先引用命名空间：



```
using UnityEngine.Pool;

```

然后可以通过构造函数创建一个对象池实例，例如针对子弹预制体创建 `ObjectPool<GameObject>`：



```
ObjectPool<GameObject> bulletPool = new ObjectPool<GameObject>
(
    createFunc: () => { return GameObject.Instantiate(bulletPrefab); },
    actionOnGet: (obj) => { obj.SetActive(true); },
    actionOnRelease: (obj) => { obj.SetActive(false); },
    actionOnDestroy: (obj) => { GameObject.Destroy(obj); },
    collectionCheck: true,
    defaultCapacity: 10,
    maxSize: 20
);

```

上面的代码初始化了一个子弹对象池，功能等价于我们之前手写的池，但多数繁琐工作由 Unity 替我们实现了。值得注意的是：

-   **获取与回收**：使用 `bulletPool.Get()` 从池中获取对象，使用 `bulletPool.Release(obj)` 将对象归还池中。与手写对象池不同的是，这里**必须**通过 `Release` 显式归还对象，否则池不会知道该对象已空闲。也就是说，在官方 `ObjectPool` 中，仅停用对象不足以回收，还需调用 Release 通知池将其放回。忘记归还会导致池认为对象仍在使用，从而可能重复生成新对象。
    
-   **自动管理状态**：通过 `actionOnGet` 和 `actionOnRelease`，我们可以定制对象取出和回收时的状态变化。例如上面设置了对象取出时自动 `SetActive(true)`，回收时自动 `SetActive(false)`，开发者无需每次手动激活/隐藏对象。这使得池的使用更加简洁，也减少了出错的可能。
    
-   **容量限制**：官方池允许设定 `maxSize` 来限制池中对象总数。如果池已满还发生归还，多余的对象会被销毁而不是留在池中。例如我们将 `maxSize` 设为 20，则第 21 个归还的子弹将触发 `actionOnDestroy` 将其真正销毁，避免池无限增长占用内存。同样，如果池内没有空闲对象且总数尚未达上限，`Get()` 会自动创建新对象，无需我们手动扩容逻辑。
    
-   **安全检查**：构造函数的 `collectionCheck` 默认为 `true`，开启时会检查对象重复回收的错误情形。如果开发者不小心两次调用 `Release` 归还同一对象，Unity 会抛出警告或错误，防止对象被多次加入池导致状态混乱。这种安全检查在调试阶段非常有用，不过开启它会有微小的性能开销。如果确定自己能严格遵循“一次取出、一旦用完就归还一次”的规范，也可以将 `collectionCheck` 设为 `false` 略微提升性能。
    

**适用场景**：Unity 内置的 `ObjectPool<T>` 适用于**绝大多数需要对象池的场景**。不仅可以池化 `GameObject`，还可以用于任何 C# 对象，例如大量反复使用的 **数据结构**（Unity 还提供了 `CollectionPool`/`ListPool` 等用于池化集合，减少 GC）。总的来说，官方对象池提供了**更灵活和安全**的实现，相比我们手写的简单池，它具备以下优势：

-   **开箱即用**：由 Unity 提供并维护，可靠性高，无需自行编写复杂代码。
    
-   **接口友好**：通过 `Get/Release` 方法即可完成取用和回收，还有 `Clear()` 等方法方便地清空池内容。
    
-   **可定制扩展**：通过委托参数自定义对象创建和销毁逻辑，以及获取/回收时的行为（如自动激活、重置状态等）。
    
-   **防止误用**：内置重复归还检查机制，及时发现并警告错误用法，避免一对象多次入池导致的漏洞。
    
-   **容量管理**：支持池容量上限，能自动销毁超出上限的对象，节省内存并防止无限增长。
    

使用 Unity 的 `ObjectPool<T>` 类，我们可以更方便地实现与前述相同的子弹复用系统。唯一需要注意的是，在子弹用完时要调用 `bulletPool.Release(bullet)` 归还对象，而不像手写对象池那样仅设置不活跃即可。这一点可以通过设计**辅助脚本**来解决：例如 Unity 官方教程中提供了 `ReturnToPool` 脚本，将其挂在子弹或特效对象上，在对象的动画/粒子完成事件中自动调用 `pool.Release(thisObject)` 归还自身。我们也可以自己实现类似机制，确保对象生命周期结束时正确地释放回池。总之，Unity 内置对象池为对象的重复利用提供了统一而高效的方案，建议在支持的 Unity 版本中优先考虑使用。

----------

### 5. 总结与下一篇预告

本篇教程从零讲解了对象池的概念和作用，并通过手写代码演示了如何实现一个简单的 **GameObject** 对象池以及在子弹系统中的应用。我们也了解了Unity 引擎自带的 `ObjectPool<T>` 工具类，它封装了对象池的通用逻辑，提供了更安全高效的复用功能。在实际开发中，**对象池可以显著优化大量对象反复生成/销毁的场景**，减少性能消耗和内存压力，是 Unity 初中级开发者需要掌握的重要技巧。

在下一篇教程中，我们将更进一步，**基于 Unity 官方 API 封装一个更健壮的 GameObject 对象池工具类**（暂称“ObjectPoolPro”）。届时会结合 `UnityEngine.Pool` 的优点，实现更安全（避免重复回收等错误）且更高效的对象复用管理器，例如自动处理对象的归还、状态重置等功能。敬请期待下一篇《基于 Unity ObjectPool 的 GameObject 对象池封装》，让我们在实战中构建属于自己的高性能对象池组件，提升游戏开发效率和质量！

### 总结
对本文内容的总结和未来展望。

## 元数据
- **创建时间：** 2026-04-11 21:55:13
- **最后更新：** 2026-04-11 21:55:13
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 对象池, unity, 开发, 游戏开发, 原理
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

### 实现方案
### 实现方案
具体的实现方法和实践指导。

### 总结
对本文内容的总结和未来展望。

## 元数据
- **创建时间：** 2026-04-11 22:02:38
- **最后更新：** 2026-04-11 22:02:38
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 教程, unity, 开发, 缓存, 对象池, 实践, 原理, 游戏开发
- **来源：** CSDN博客

---
*文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-11 22:04:43
- **最后更新：** 2026-04-11 22:04:43
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** unity, 性能, 优化, 内存, gc, 对象池
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*