# 基于UnityEngine.Pool封装对象池

## 摘要
UnityEngine.Pool 提供了官方的对象池实现，但直接使用较为基础。本文介绍如何基于 UnityEngine.Pool 封装更强大的 ObjectPoolPro 工具类，实现预制体注册、预热、延迟回收等高级功能，提升开发效率和代码质量。

## 正文

### 背景
在游戏开发中，我们经常需要频繁生成和销毁游戏对象，如子弹、敌人、特效等。每次都通过 `Instantiate` 和 `Destroy` 会产生较大的性能开销和 GC 压力。对象池技术通过预先创建一批对象并反复利用它们来解决这个问题。

然而，传统的手动维护列表方式存在诸多痛点：

- **管理复杂**：需要手动维护对象列表、检查状态，容易遗漏重置逻辑
- **重复回收问题**：同一对象可能被多次回收，造成逻辑混乱
- **未注册对象误用**：回收不属于池的对象时无提示，可能造成泄漏
- **资源清理困难**：场景切换时缓存对象不自动清理

UnityEngine.Pool 命名空间提供了官方解决方案，帮助解决这些问题。

### 1. UnityEngine.Pool.ObjectPool 核心

Unity 的 `ObjectPool<T>` 是一个基于栈实现的通用对象池，核心特性包括：

- **自定义创建**：通过 `Func<T> createFunc` 定义对象创建方式
- **获取/回收回调**：`actionOnGet` 和 `actionOnRelease` 在获取和回收时自动调用
- **最大容量限制**：`maxSize` 防止对象无限增长
- **安全检查**：`collectionCheck` 防止重复回收和未注册对象
- **统一清理**：`Clear()` 方法一次性清空池

```csharp
var pool = new ObjectPool<GameObject>(
    createFunc: () => Instantiate(prefab),
    actionOnGet: obj => obj.SetActive(true),
    actionOnRelease: obj => obj.SetActive(false),
    actionOnDestroy: Destroy,
    collectionCheck: true,
    defaultCapacity: 10,
    maxSize: 100
);
```

### 2. 封装 ObjectPoolPro 管理类

基于 `ObjectPoolPro` 封装一个面向 GameObject 的池化管理工具：

**功能目标**：
- 注册预制体并预热
- 获取/回收对象
- 支持延迟回收
- 内建安全检查

以下是完整实现（包含中文注释）：

```csharp
using UnityEngine;
using UnityEngine.Pool;
using System.Collections;
using System.Collections.Generic;

public class ObjectPoolPro : MonoBehaviour
{
    [System.Serializable]
    public class PoolConfig
    {
        public GameObject prefab;
        public int preloadCount = 5;
        public int maxSize = 50;
    }

    public List<PoolConfig> poolConfigs = new List<PoolConfig>();

    private Dictionary<GameObject, IObjectPool<GameObject>> _pools;
    private Dictionary<GameObject, GameObject> _activeObjects;

    private void Awake()
    {
        _pools = new Dictionary<GameObject, IObjectPool<GameObject>>();
        _activeObjects = new Dictionary<GameObject, GameObject>();

        foreach (var config in poolConfigs)
        {
            RegisterPrefab(config.prefab, config.preloadCount, config.maxSize);
        }
    }

    public void RegisterPrefab(GameObject prefab, int preloadCount = 0, int maxSize = 50)
    {
        if (_pools.ContainsKey(prefab))
        {
            Debug.LogWarning($"[ObjectPoolPro] 预制体 {prefab.name} 已注册");
            return;
        }

        var pool = new ObjectPool<GameObject>(
            createFunc: () =>
            {
                var instance = Instantiate(prefab);
                instance.transform.SetParent(transform);
                return instance;
            },
            actionOnGet: obj =>
            {
                obj.SetActive(true);
                var recyclable = obj.GetComponent<IPoolRecyclable>();
                recyclable?.OnGet();
            },
            actionOnRelease: obj =>
            {
                obj.SetActive(false);
                var recyclable = obj.GetComponent<IPoolRecyclable>();
                recyclable?.OnRelease();
            },
            actionOnDestroy: Destroy,
            collectionCheck: true,
            defaultCapacity: Mathf.Max(preloadCount, 10),
            maxSize: maxSize
        );

        _pools[prefab] = pool;

        // 预热
        var tempList = new List<GameObject>();
        for (int i = 0; i < preloadCount; i++)
        {
            tempList.Add(pool.Get());
        }
        foreach (var obj in tempList)
        {
            pool.Release(obj);
        }
    }

    public GameObject Get(GameObject prefab)
    {
        if (!_pools.TryGetValue(prefab, out var pool))
        {
            Debug.LogError($"[ObjectPoolPro] 预制体 {prefab.name} 未注册");
            return null;
        }

        var instance = pool.Get();
        _activeObjects[instance] = prefab;
        return instance;
    }

    public void Recycle(GameObject instance)
    {
        if (instance == null) return;

        if (_activeObjects.TryGetValue(instance, out var prefab))
        {
            if (_pools.TryGetValue(prefab, out var pool))
            {
                pool.Release(instance);
                _activeObjects.Remove(instance);
                return;
            }
        }

        Debug.LogWarning($"[ObjectPoolPro] 对象 {instance.name} 不属于任何已注册池");
        Destroy(instance);
    }

    public void Recycle(GameObject instance, float delay)
    {
        StartCoroutine(DelayedRecycle(instance, delay));
    }

    private IEnumerator DelayedRecycle(GameObject instance, float delay)
    {
        yield return new WaitForSeconds(delay);
        if (instance != null && instance.activeInHierarchy)
        {
            Recycle(instance);
        }
    }

    public void ClearAll()
    {
        foreach (var pool in _pools.Values)
        {
            pool.Clear();
        }
        _pools.Clear();
        _activeObjects.Clear();
    }

    private void OnDestroy()
    {
        ClearAll();
    }
}

// 池化对象生命周期接口
public interface IPoolRecyclable
{
    void OnGet();    // 从池中取出时调用
    void OnRelease(); // 回收到池时调用
}
```

**设计要点**：

1. **安全检查**：`collectionCheck = true` 自动防止重复回收
2. **预热机制**：注册时先 Get 再 Release，创建预缓存
3. **生命周期接口**：`IPoolRecyclable` 让池化对象在取出/回收时自动重置状态
4. **映射追踪**：`_activeObjects` 字典追踪活跃实例的归属，回收时校验
5. **延迟回收**：协程实现指定时间后自动回收
6. **统一清理**：`OnDestroy` 时清空所有池

### 3. 使用示例

```csharp
public class BulletSpawner : MonoBehaviour
{
    public ObjectPoolPro poolPro;
    public GameObject bulletPrefab;

    public void Fire()
    {
        var bullet = poolPro.Get(bulletPrefab);
        bullet.transform.position = transform.position;
        bullet.transform.rotation = transform.rotation;

        // 3秒后自动回收
        poolPro.Recycle(bullet, 3f);
    }
}

public class Bullet : MonoBehaviour, IPoolRecyclable
{
    private Rigidbody _rb;

    private void Awake()
    {
        _rb = GetComponent<Rigidbody>();
    }

    public void OnGet()
    {
        _rb.velocity = Vector3.zero;
        _rb.angularVelocity = Vector3.zero;
    }

    public void OnRelease()
    {
        _rb.velocity = Vector3.zero;
        _rb.angularVelocity = Vector3.zero;
    }
}
```

### 实现方案

1. **统一注册入口**：通过 `PoolConfig` 列表在 Inspector 中配置预制体和预热数量
2. **使用 `ObjectPool<T>` 内置安全检查**：避免重复回收和未注册对象误用
3. **`IPoolRecyclable` 接口**：池化对象实现状态重置，生命周期自动管理
4. **延迟回收**：协程实现，无需手写计时器
5. **`_activeObjects` 映射**：追踪活跃实例，回收时验证归属

### 总结
基于 `UnityEngine.Pool` 封装的对象池管理工具，在官方 API 的安全检查基础上添加了预热、延迟回收和生命周期接口，大幅降低了手动管理对象池的复杂度和出错概率。对于频繁生成和销毁 GameObject 的场景，这是 Unity 项目中最推荐的对象池方案。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 资源管理
- **标签：** 对象池、ObjectPool、UnityEngine.Pool、GOAP、性能优化
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
