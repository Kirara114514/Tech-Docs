---
title: "Unity GC 系列教程第三篇：GC Alloc 优化技巧与实践（上）"
date: "2026-03-28"
category: "性能优化"
tags: ["C#", "GC", "Unity", "内存管理", "对象池", "异步编程", "性能优化", "物理系统"]
---



## Unity GC 系列教程第三篇：GC Alloc 优化技巧与实践（上）

欢迎来到 Unity GC 系列教程的第三篇！在前面两篇文章中，我们已经打下了坚实的基础：理解了 GC 的基本概念、工作原理，并掌握了如何使用 Unity Profiler 来识别常见的 GC Alloc 场景。现在，是时候拿起我们的“手术刀”，针对这些问题进行实际的优化了！

本篇将深入探讨一系列具体的代码优化技巧，帮助你有效地减少 **GC Alloc**。我们将从最常见的装箱和字符串优化开始，逐步深入到集合、Unity API 调用和协程的优化。这些技巧都是你在日常 Unity 开发中能够立即应用并看到效果的“武功秘籍”。

----------

### 3.1 减少装箱 (Boxing)

装箱是 GC Alloc 的一个常见且隐蔽的来源，它发生在 **值类型被隐式或显式地转换为引用类型** 时。虽然单个装箱操作开销很小，但在循环或频繁调用的方法中发生时，累积效应会非常显著。

**回顾**：装箱的本质是将值类型的数据复制到一个新创建的 **`object`** 对象中（这个对象在托管堆上分配内存），以便它可以被当作引用类型来处理。

#### 3.1.1 避免在字符串拼接中使用值类型

这是最常见的装箱场景之一。当你在字符串拼接中混合使用值类型和字符串时，值类型会被装箱成字符串，然后进行拼接。

**坏代码示例**：

C#

```
void Update()
{
    // 假设每帧调用
    int currentScore = GetCurrentScore();
    float currentHealth = GetCurrentHealth();

    // 每次拼接都会发生装箱
    string uiText = "Score: " + currentScore + " Health: " + currentHealth + "%";
    Debug.Log(uiText); // 实际游戏中会赋值给 UI Text
}

int GetCurrentScore() { return 100; }
float GetCurrentHealth() { return 85.5f; }

```

上述代码中，`currentScore` 和 `currentHealth` 都会在拼接时被装箱。

好代码示例（使用 StringBuilder）：

对于需要频繁拼接字符串的场景，特别是涉及值类型时，System.Text.StringBuilder 是你的最佳选择。它提供了可变的字符串操作，在内部维护一个字符缓冲区，避免了每次拼接都创建新字符串对象。只有当你调用 ToString() 方法时，它才会生成最终的字符串对象（一次 GC Alloc）。

C#

```
using System.Text;
using UnityEngine;

public class UIManager : MonoBehaviour
{
    // 缓存 StringBuilder 实例，避免每次都 new
    private StringBuilder _stringBuilder = new StringBuilder(256); // 预设一个合理容量

    void Update()
    {
        int currentScore = GetCurrentScore();
        float currentHealth = GetCurrentHealth();

        // 清空 StringBuilder
        _stringBuilder.Clear();
        // Append 各种类型，内部高效处理，不产生装箱（或仅在必要时进行极少装箱）
        _stringBuilder.Append("Score: ").Append(currentScore)
                      .Append(" Health: ").Append(currentHealth).Append("%");
        
        string uiText = _stringBuilder.ToString(); // 只有这里会产生一次 GC Alloc
        Debug.Log(uiText);
    }

    int GetCurrentScore() { return 100; }
    float GetCurrentHealth() { return 85.5f; }
}

```

**注意**：`StringBuilder` 自身也是一个引用类型，需要 `new` 一次。但只要你重用这个实例，就可以显著减少后续拼接的 GC Alloc。预设一个合理的容量（如 `StringBuilder(256)`）可以减少内部扩容时的开销。

#### 3.1.2 避免向非泛型集合添加值类型

在 Unity 中，虽然现代 C# 代码更倾向于使用泛型集合（如 `List<T>`），但偶尔你可能会遇到 `ArrayList` 或 `Hashtable` 等非泛型集合。向这些集合中添加值类型时，会发生装箱。

**坏代码示例**：

C#

```
using System.Collections; // 注意是非泛型命名空间

void Start()
{
    ArrayList myInts = new ArrayList();
    myInts.Add(1); // 1 (int) 被装箱
    myInts.Add(2); // 2 (int) 被装箱

    Hashtable myTable = new Hashtable();
    myTable.Add("Key", 100); // 100 (int) 被装箱
}

```

好代码示例（使用泛型集合）：

始终优先使用泛型集合，如 List<T>, Dictionary<TKey, TValue> 等。它们在编译时知道元素的类型，因此不需要进行装箱操作。

C#

```
using System.Collections.Generic; // 注意是泛型命名空间

void Start()
{
    List<int> myInts = new List<int>();
    myInts.Add(1); // 不会装箱
    myInts.Add(2); // 不会装箱

    Dictionary<string, int> myTable = new Dictionary<string, int>();
    myTable.Add("Key", 100); // 不会装箱
}

```

#### 3.1.3 避免通过 `object` 类型传递值类型参数

当一个方法的参数类型是 `object`，而你传入了一个值类型时，就会发生装箱。

**坏代码示例**：

C#

```
void LogValue(object value) // 参数是 object 类型
{
    Debug.Log(value); // 这里如果 value 是值类型，就发生了装箱
}

void Update()
{
    float deltaTime = Time.deltaTime;
    LogValue(deltaTime); // deltaTime (float) 被装箱
}

```

好代码示例（使用泛型方法或重载）：

如果可能，使用 泛型方法 或 方法重载 来避免装箱。

C#

```
// 泛型方法，类型安全，不会装箱
void LogValue<T>(T value)
{
    Debug.Log(value);
}

// 方法重载，为特定值类型提供版本
void LogValue(float value)
{
    Debug.Log(value);
}

void Update()
{
    float deltaTime = Time.deltaTime;
    LogValue(deltaTime); // 调用泛型方法或 float 重载，不装箱
}

```

对于 `Debug.Log` 自身，它的重载已经处理了大部分常见类型，所以直接 `Debug.Log(deltaTime)` 通常不会引起装箱。但当你自定义方法时，需要注意参数类型。

#### 3.1.4 `Enum.ToString()` 的潜在装箱

虽然 `Enum` 是值类型，但其 `ToString()` 方法在某些情况下（尤其是在旧版本的 .NET / Mono 中，或通过反射调用时）可能会导致装箱。

**坏代码示例**：

C#

```
public enum GameState { Playing, Paused, GameOver }

void UpdateUI(GameState state)
{
    // 如果 Debug.Log 内部没有针对 Enum 的优化，这里可能装箱
    Debug.Log("Current State: " + state.ToString()); 
}

```

好代码示例：

如果需要频繁地将 Enum 转换为字符串用于 UI 或日志，可以考虑：

-   **提前转换为字符串**：在不那么频繁的 `Start` 或 `Awake` 中将 `Enum` 映射到一个字符串字典。
    
-   **使用 `StringBuilder.Append(enumValue)`**：`StringBuilder` 对 `Enum` 类型的 `Append` 方法有优化，通常不会导致装箱。
    

C#

```
using System.Collections.Generic;
using System.Text;
using UnityEngine;

public class GameStateManager : MonoBehaviour
{
    public enum GameState { Playing, Paused, GameOver }
    private Dictionary<GameState, string> _gameStateStrings = new Dictionary<GameState, string>();
    private StringBuilder _stringBuilder = new StringBuilder();

    void Awake()
    {
        // 提前生成字符串，避免运行时频繁转换
        foreach (GameState state in System.Enum.GetValues(typeof(GameState)))
        {
            _gameStateStrings[state] = state.ToString();
        }
    }

    void UpdateUI(GameState state)
    {
        // 使用缓存的字符串
        Debug.Log("Current State: " + _gameStateStrings[state]); 

        // 或者使用 StringBuilder
        _stringBuilder.Clear();
        _stringBuilder.Append("Current State: ").Append(state); // StringBuilder 内部优化
        Debug.Log(_stringBuilder.ToString());
    }
}

```

----------

### 3.2 优化字符串操作 (String Operations)

字符串的不可变性是 GC Alloc 的另一个主要贡献者。任何看似修改字符串的操作都会创建新的字符串对象。

#### 3.2.1 使用 `StringBuilder` 进行字符串拼接

这与减少装箱的技巧是相辅相成的。对于任何需要频繁拼接多个字符串或混合类型数据的场景，**`StringBuilder`** 都是首选。

**复习**：

C#

```
using System.Text;
using UnityEngine;

public class ExampleStringOps : MonoBehaviour
{
    private StringBuilder _sharedStringBuilder = new StringBuilder(512); // 缓存并预设容量

    void Update()
    {
        string playerName = "Hero";
        int level = 10;
        float exp = 123.45f;

        // 避免重复 new StringBuilder
        _sharedStringBuilder.Clear(); 
        _sharedStringBuilder.Append("Player: ").Append(playerName)
                            .Append(", Level: ").Append(level)
                            .Append(", EXP: ").Append(exp.ToString("F2")); // 格式化浮点数

        string output = _sharedStringBuilder.ToString();
        Debug.Log(output);
    }
}

```

**最佳实践**：

-   **缓存 `StringBuilder` 实例**：不要在每次需要拼接时都 `new StringBuilder()`。在一个类中声明一个 `private static readonly` 或 `private` 字段来缓存它。
    
-   **预设容量**：在创建 `StringBuilder` 时，可以传入一个预估的容量，如 `new StringBuilder(256)`。这可以减少 `StringBuilder` 内部在追加数据时因容量不足而进行的内存重新分配（这个重新分配本身也是 GC Alloc）。
    
-   **`Clear()` 方法**：每次使用前调用 `Clear()` 来重置 `StringBuilder`。
    
-   **格式化浮点数**：对于浮点数，`ToString("F2")` 这样的格式化方法比直接拼接更能避免额外的精度问题和潜在的中间字符串。
    

#### 3.2.2 避免频繁的 `Substring()`、`Split()`、`Replace()`

这些方法都会返回新的字符串，因此在热路径中应尽量避免。

**坏代码示例**：

C#

```
void ParseData(string rawData)
{
    // 假设 rawData 格式为 "ID:123,Name:ABC,Value:456"
    string[] parts = rawData.Split(','); // GC Alloc
    foreach (string part in parts)
    {
        if (part.StartsWith("ID:"))
        {
            string idStr = part.Substring(3); // GC Alloc
            int id = int.Parse(idStr);
            // ...
        }
    }
}

```

好代码示例（使用 Span<char> / ReadOnlySpan<char> 或字符遍历）：

对于需要处理大量文本但又不想产生 GC Alloc 的场景，C# 7.2+ 引入的 Span<T> 和 ReadOnlySpan<T> 是革命性的。它们允许你操作内存块（包括字符串的内部字符数组）的“视图”，而不会创建新的内存拷贝。

虽然 Unity 对 `Span<T>` 的支持在早期版本中可能受限，但随着 .NET Standard 2.1 或 .NET 6 的升级，它正变得越来越可用。即便无法直接使用 `Span<T>`，你也可以通过 **直接遍历字符** 或 **寻找索引** 的方式来避免字符串操作。

C#

```
// 假设目标：从 "ID:123,Name:ABC,Value:456" 中提取 ID
void ParseDataOptimized(string rawData)
{
    // 查找逗号分隔符和冒号分隔符的索引
    int idStartIndex = rawData.IndexOf("ID:");
    if (idStartIndex != -1)
    {
        idStartIndex += 3; // 跳过 "ID:"
        int idEndIndex = rawData.IndexOf(',', idStartIndex); // 查找下一个逗号或字符串末尾

        // 计算长度
        int length = (idEndIndex == -1) ? (rawData.Length - idStartIndex) : (idEndIndex - idStartIndex);

        if (length > 0)
        {
            // 方法1: 使用 Span<char> (如果Unity版本支持且允许) - 无GC Alloc
            #if UNITY_2021_2_OR_NEWER // 示例：具体版本请查阅 Unity 文档
            ReadOnlySpan<char> idSpan = rawData.AsSpan(idStartIndex, length);
            int id = int.Parse(idSpan); // int.Parse(ReadOnlySpan<char>) 不会产生新字符串
            Debug.Log($"Optimized ID: {id}");
            #else
            // 方法2: 避免 Substring，直接使用字符遍历和数字解析
            // 这仍然会产生一个临时字符串用于 int.Parse，但比 Substring 更加可控
            // 更极致的优化是手动解析数字字符
            string idStr = rawData.Substring(idStartIndex, length); // 这里仍然会 GC Alloc，但比多次 Substring 好
            int id = int.Parse(idStr);
            Debug.Log($"Fallback ID: {id}");
            #endif
        }
    }
}

// 另一个更极致的例子：手动解析数字，完全避免字符串分配
int ParseIntFromSubstring(string source, int startIndex, int length)
{
    int result = 0;
    int sign = 1;
    for (int i = 0; i < length; i++)
    {
        char c = source[startIndex + i];
        if (i == 0 && c == '-')
        {
            sign = -1;
            continue;
        }
        result = result * 10 + (c - '0');
    }
    return result * sign;
}

// 使用方式
// int id = ParseIntFromSubstring(rawData, idStartIndex, length); // 完全无 GC Alloc

```

当 Unity 的 .NET Standard 版本升级到支持 `Span<char>` 的时候，字符串的 GC Alloc 问题将得到极大缓解。在此之前，你可能需要自行实现一些字符遍历和解析的逻辑。

----------

### 3.3 优化集合类型操作

集合类型在游戏中无处不在，但如果使用不当，它们也可能是 GC Alloc 的主要来源。

#### 3.3.1 预先分配集合容量

当 `List<T>` 或 `Dictionary<TKey, TValue>` 的容量不足时，它们会在内部重新分配更大的底层数组，并将现有元素复制过去。这个重新分配和复制的过程会产生 GC Alloc。通过预先设置一个合理的初始容量，可以减少甚至避免多次扩容。

**坏代码示例**：

C#

```
void CreateManyItems()
{
    List<GameObject> items = new List<GameObject>(); // 默认初始容量很小
    for (int i = 0; i < 1000; i++)
    {
        items.Add(new GameObject($"Item_{i}")); // 频繁扩容，导致 GC Alloc
    }
}

```

好代码示例：

根据预期要存储的元素数量，在创建集合时指定初始容量。

C#

```
void CreateManyItemsOptimized()
{
    // 预估最大数量，分配初始容量
    List<GameObject> items = new List<GameObject>(1000); 
    for (int i = 0; i < 1000; i++)
    {
        items.Add(new GameObject($"Item_{i}")); // 不会频繁扩容
    }
}

```

**经验法则**：如果知道集合的最大尺寸，就直接设置。如果不知道，可以设置一个合理的初始值（例如 16, 32, 64），或者在加载时动态计算。

#### 3.3.2 使用 `Clear()` 而不是 `new List<T>()` / `new Dictionary<TKey, TValue>()`

在循环中重复创建和销毁集合实例是非常糟糕的做法。如果你需要清空集合并在下一帧重新填充，重用同一个集合实例并调用 `Clear()` 方法是更优的选择。

**坏代码示例**：

C#

```
public class ItemManager : MonoBehaviour
{
    void Update()
    {
        // 每次 Update 都创建新的 List 和 Dictionary
        List<GameObject> activeItems = new List<GameObject>(); // GC Alloc
        Dictionary<string, GameObject> itemMap = new Dictionary<string, GameObject>(); // GC Alloc

        // 填充并使用集合...
    }
}

```

好代码示例：

声明集合为类的成员变量，并在每次使用前调用 Clear()。

C#

```
using System.Collections.Generic;
using UnityEngine;

public class ItemManagerOptimized : MonoBehaviour
{
    // 声明为成员变量，只在 Start 时 new 一次
    private List<GameObject> _activeItems = new List<GameObject>();
    private Dictionary<string, GameObject> _itemMap = new Dictionary<string, GameObject>();

    void Update()
    {
        // 每帧清空并重用集合
        _activeItems.Clear(); 
        _itemMap.Clear();

        // 填充并使用集合...
        // 例如：_activeItems.Add(FindNextActiveItem());
        // _itemMap.Add("Player", playerGameObject);
    }
}

```

**核心思想**：避免在热路径（如 `Update`、`LateUpdate`、`FixedUpdate` 或其他高频调用的方法）中创建新的引用类型对象。

#### 3.3.3 优化 `List<T>.ToArray()` 和 `List<T>.ToList()`

`ToArray()` 和 `ToList()` 方法都会创建新的数组或 `List` 对象，并将原始集合中的元素复制过去。这在频繁调用时会产生大量 GC Alloc。

**坏代码示例**：

C#

```
void ProcessItems(List<Item> currentItems)
{
    Item[] itemsArray = currentItems.ToArray(); // GC Alloc
    foreach (Item item in itemsArray)
    {
        // 处理...
    }
}

```

**好代码示例**：

-   **直接使用原始 `List<T>` 进行迭代**：如果你的目的是迭代并处理 `List` 中的元素，直接使用 `for` 循环或 `foreach` 循环即可，不需要创建数组副本。
    
-   **传入预分配的数组**：对于某些需要数组作为参数的 API，可以创建一个私有的预分配数组，并手动将 `List` 中的元素复制进去。
    

C#

```
public class ItemProcessor : MonoBehaviour
{
    private Item[] _cachedItemsArray; // 缓存一个数组用于重用

    void Start()
    {
        // 预分配足够大的数组，或者根据最大预期容量分配
        _cachedItemsArray = new Item[100]; 
    }

    void ProcessItemsOptimized(List<Item> currentItems)
    {
        // 方法1：直接迭代 List，不产生 GC Alloc
        for (int i = 0; i < currentItems.Count; i++)
        {
            Item item = currentItems[i];
            // 处理...
        }

        // 方法2：如果确实需要数组，手动复制到预分配数组中
        if (currentItems.Count > _cachedItemsArray.Length)
        {
            // 如果缓存数组不够大，可以考虑重新分配或报错
            Debug.LogError("Cached array is too small! Consider increasing its size.");
            // 紧急情况下可以 new，但会产生 GC Alloc
            _cachedItemsArray = new Item[currentItems.Count]; 
        }
        currentItems.CopyTo(_cachedItemsArray, 0); // 复制到预分配数组
        
        // 现在使用 _cachedItemsArray，但要注意其有效长度
        for (int i = 0; i < currentItems.Count; i++)
        {
            Item item = _cachedItemsArray[i];
            // 处理...
        }
    }
}

```

**注意**：方法2相对复杂，只在确实需要 `T[]` 类型的场景下使用。大多数情况下，直接迭代 `List<T>` 是最好的选择。

#### 3.3.4 对象池 (Object Pooling) - 减少 GC Alloc 的核心策略

**对象池** 是优化 GC Alloc **最重要、最有效** 的策略之一。它的核心思想是：**与其频繁地创建和销毁对象（产生 GC Alloc），不如预先创建一批对象，并在需要时从池中“借用”它们，用完后再“归还”到池中以便重用。**

为什么需要对象池？

在游戏中，很多对象是短暂存在的，例如：

-   **子弹、特效 (VFX)**
    
-   **掉落物品、拾取物**
    
-   **敌人、NPC (某些情况下)**
    
-   **UI 元素 (如伤害数字、滚动公告)**
    
-   **一次性消息或数据结构**
    

如果这些对象每创建一次就 `new GameObject()`，每销毁一次就 `Destroy()`，那么将会导致大量的 GC Alloc 和 GC 暂停。对象池通过重用现有对象，将“分配”和“销毁”的开销转换为“激活”和“失活”的开销，从而彻底避免了运行时频繁的 GC Alloc。

**对象池的基本原理**：

1.  **预创建 (Pre-instantiate)**：在游戏开始或某个场景加载时，根据预估的需求量，提前创建一定数量的对象，并将它们设置为非激活状态。
    
2.  **“借用” (Borrow)**：当需要一个对象时，从池中取出一个非激活的对象，激活它，并进行初始化。
    
3.  **“归还” (Return)**：当对象不再需要时，将其设置为非激活状态，并放回池中，而不是销毁它。
    

**实现一个简单的对象池**：

C#

```
using System.Collections.Generic;
using UnityEngine;

public class SimpleObjectPool : MonoBehaviour
{
    public GameObject prefab; // 要池化的预制体
    public int initialPoolSize = 10; // 初始池大小

    private Queue<GameObject> _objectPool = new Queue<GameObject>();

    void Awake()
    {
        // 预创建对象并放入池中
        for (int i = 0; i < initialPoolSize; i++)
        {
            GameObject obj = Instantiate(prefab);
            obj.transform.SetParent(this.transform); // 统一管理层级
            obj.SetActive(false); // 初始时设置为非激活
            _objectPool.Enqueue(obj);
        }
    }

    // 从池中获取对象
    public GameObject GetPooledObject()
    {
        if (_objectPool.Count > 0)
        {
            GameObject obj = _objectPool.Dequeue();
            obj.SetActive(true); // 激活对象
            return obj;
        }
        else
        {
            // 池中没有可用对象，按需创建（会产生 GC Alloc，但这是 fallback）
            Debug.LogWarning("Pool exhausted! Creating new object.");
            GameObject obj = Instantiate(prefab);
            obj.transform.SetParent(this.transform);
            obj.SetActive(true);
            return obj;
        }
    }

    // 将对象归还到池中
    public void ReturnPooledObject(GameObject obj)
    {
        obj.SetActive(false); // 失活对象
        // 确保对象回到池管理下的层级，避免父子关系错乱
        obj.transform.SetParent(this.transform); 
        _objectPool.Enqueue(obj);
    }
}

```

**使用对象池的示例**：

C#

```
using UnityEngine;

public class BulletSpawner : MonoBehaviour
{
    public SimpleObjectPool bulletPool; // 引用对象池

    void Update()
    {
        if (Input.GetMouseButtonDown(0))
        {
            GameObject bullet = bulletPool.GetPooledObject(); // 从池中获取子弹
            if (bullet != null)
            {
                bullet.transform.position = transform.position;
                bullet.transform.rotation = transform.rotation;
                // bullet.GetComponent<Bullet>().Fire(); // 初始化子弹逻辑
            }
        }
    }
}

// 子弹脚本，在不再需要时归还到池中
public class Bullet : MonoBehaviour
{
    public SimpleObjectPool parentPool; // 引用父级对象池

    void OnCollisionEnter(Collision other)
    {
        // 子弹碰到东西后，归还到池中
        if (parentPool != null)
        {
            parentPool.ReturnPooledObject(gameObject);
        }
    }

    // 也可以通过计时器，在一定时间后归还
    void OnEnable() // 对象激活时调用
    {
        Invoke("DisableAndReturnToPool", 3f); // 3秒后归还
    }

    void DisableAndReturnToPool()
    {
        if (parentPool != null)
        {
            parentPool.ReturnPooledObject(gameObject);
        }
    }

    void OnDisable() // 对象失活时调用
    {
        // 取消所有 Invoke，避免对象被归还后仍然触发
        CancelInvoke(); 
    }
}

```

**对象池的注意事项**：

-   **池的大小**：池的初始大小需要根据游戏玩法进行预估。如果池太小，仍然会频繁 `new` 新对象；如果池太大，则会占用过多内存。
    
-   **初始化和重置**：从池中取出的对象可能带有上次使用时的状态。务必在 `OnEnable()` 或 `GetPooledObject()` 中对对象进行完整的**重置和初始化**。
    
-   **归还时状态**：归还到池中的对象应立即被设置为非激活状态 (`SetActive(false)`)，并清除其所有引用（例如，如果子弹上有计时器，`CancelInvoke()`）。
    
-   **父子关系**：如果池化的对象会被设置为其他对象的子对象，当归还时，最好将其父级重新设置回池的管理器对象，以保持层级整洁和管理方便。
    
-   **数据结构**：`Queue<GameObject>` 是一个很好的选择，因为它保证了 FIFO (先进先出) 的顺序，并且 `Enqueue`/`Dequeue` 操作效率高。`Stack<GameObject>` (LIFO) 也可以。
    
-   **复杂对象**：对于包含大量组件和复杂逻辑的对象，池化效果更显著。但要确保重置逻辑正确。
    
-   **泛型对象池**：为了提高复用性，你可以创建一个泛型对象池，支持池化任何类型的 `Component` 或 `GameObject`。
    

----------

### 3.4 避免 Unity API 带来的 GC Alloc

Unity 的 API 提供了很多便利，但有些 API 在内部会创建临时对象或数组，导致 GC Alloc。了解这些“陷阱”并使用它们的“非分配”版本是关键。

#### 3.4.1 缓存 `GetComponent<T>()` 结果

尽管 `GetComponent<T>()` 本身不产生 GC Alloc（它返回的是现有组件的引用），但频繁调用它仍然有性能开销（查找组件）。更重要的是，它的变体 **`GetComponents<T>()`** 或 **`GetComponentsInChildren<T>()`** 会返回一个新的数组。

**坏代码示例**：

C#

```
void Update()
{
    // 每帧调用 GetComponent<MeshRenderer>() 查找，即便它不产生 GC Alloc，也有 CPU 开销
    MeshRenderer renderer = GetComponent<MeshRenderer>(); 
    if (renderer != null)
    {
        renderer.material.color = Color.red;
    }

    // 更糟糕的是 GetComponents，每次都 new 一个数组
    BoxCollider[] colliders = GetComponents<BoxCollider>(); // GC Alloc
    foreach (var collider in colliders)
    {
        collider.enabled = false;
    }
}

```

**好代码示例**：

-   **缓存 `GetComponent` 结果**：在 `Awake()` 或 `Start()` 中获取组件引用并缓存起来。
    
-   **使用 `GetComponentsNonAlloc<T>()` 或 `GetComponents(List<T>)`**：Unity 提供了不产生 GC Alloc 的 API 变体。
    

C#

```
using System.Collections.Generic; // 用于 List<T>

public class MyGameObjectProcessor : MonoBehaviour
{
    private MeshRenderer _meshRenderer; // 缓存 GetComponent 结果
    private List<BoxCollider> _cachedColliders = new List<BoxCollider>(); // 缓存 GetComponents 结果的 List

    void Awake()
    {
        // 缓存 GetComponent 结果
        _meshRenderer = GetComponent<MeshRenderer>(); 
    }

    void Update()
    {
        if (_meshRenderer != null)
        {
            _meshRenderer.material.color = Color.red;
        }

        // 使用 GetComponents 的无 GC Alloc 版本
        // Unity 2021.2 及更高版本推荐 GetComponentsNonAlloc<T>()
        // 在老版本中，使用 GetComponents(List<T>)
        #if UNITY_2021_2_OR_NEWER
        int count = GetComponentsNonAlloc(_cachedColliders.ToArray()); // 注意这里 ToArray() 仍然 GC Alloc
        // 正确用法是 GetComponentsNonAlloc(T[] results)
        // Better:
        // int count = _cachedColliders.Capacity < desiredSize ? _cachedColliders.Capacity : desiredSize; // 预分配数组
        // Actually, Unity's GetComponentsNonAlloc takes a pre-allocated array and returns count.
        // Example:
        // int count = GetComponentsNonAlloc<BoxCollider>(_preallocatedColliderArray);
        // for (int i = 0; i < count; i++) { /* ... */ }
        #else
        GetComponents(_cachedColliders); // 填充到预分配的 List，不产生 GC Alloc
        for (int i = 0; i < _cachedColliders.Count; i++)
        {
            _cachedColliders[i].enabled = false;
        }
        _cachedColliders.Clear(); // 清空 List，以便下次重用
        #endif
    }

    // 假设你有这个预分配数组
    private BoxCollider[] _preallocatedColliderArray = new BoxCollider[10]; // 根据需要预设大小
}

```

**`GetComponentsNonAlloc<T>(T[] results)`**：这是 Unity 2021.2 之后引入的，推荐用于需要获取组件数组的场景。它要求你传入一个预先分配好的数组，并将结果填充进去。你需要根据返回的整数值来确定实际填充了多少个组件。

#### 3.4.2 优化物理查询 (Physics Queries)

`Physics.RaycastAll`、`Physics.OverlapSphere` 等方法在返回结果时会创建新的数组。如果这些查询在 `Update` 或 `FixedUpdate` 中频繁执行，会导致大量 GC Alloc。

**坏代码示例**：

C#

```
void FixedUpdate()
{
    // 每帧都进行射线检测，返回新的 RaycastHit[] 数组
    RaycastHit[] hits = Physics.RaycastAll(transform.position, transform.forward, 10f); // GC Alloc
    foreach (var hit in hits)
    {
        Debug.Log("Hit: " + hit.collider.name);
    }
}

```

好代码示例（使用 NonAlloc 变体）：

Unity 提供了所有物理查询方法的 NonAlloc 变体。它们接受一个预分配好的数组作为参数，并将查询结果填充到这个数组中，返回实际填充的数量，而不是创建新数组。

C#

```
using UnityEngine;

public class PhysicsQueryOptimizer : MonoBehaviour
{
    // 缓存一个足够大的数组来存储射线检测结果
    private RaycastHit[] _raycastHits = new RaycastHit[10]; // 预设最大可能命中数量
    private Collider[] _overlapResults = new Collider[20]; // 用于 OverlapSphereNonAlloc

    void FixedUpdate()
    {
        // 使用 Physics.RaycastNonAlloc
        int hitCount = Physics.RaycastNonAlloc(transform.position, transform.forward, _raycastHits, 10f);
        for (int i = 0; i < hitCount; i++)
        {
            Debug.Log("Hit (NonAlloc): " + _raycastHits[i].collider.name);
        }

        // 使用 Physics.OverlapSphereNonAlloc
        int overlapCount = Physics.OverlapSphereNonAlloc(transform.position, 5f, _overlapResults);
        for (int i = 0; i < overlapCount; i++)
        {
            Debug.Log("Overlapped (NonAlloc): " + _overlapResults[i].name);
        }
    }
}

```

**关键**：

-   **预分配数组**：根据你对最大可能命中数或重叠数的预估，声明一个足够大的 `T[]` 类型的私有字段。
    
-   **使用 `NonAlloc` 方法**：调用相应的 `Physics.XXXNonAlloc` 方法，传入你的预分配数组。
    
-   **检查返回数量**：`NonAlloc` 方法会返回实际填充到数组中的元素数量。**只遍历这个数量，而不是整个数组的长度。**
    

#### 3.4.3 缓存 `Camera.main` 和避免 `Camera.allCameras`

-   **`Camera.main`**：Unity 内部会查找带有 "MainCamera" 标签的相机。虽然第一次查找后会缓存结果，但如果在非编辑器模式下修改了主相机，或没有设置标签，每次调用仍然会进行查找。**最安全和性能最佳的做法是始终在 `Awake()` 或 `Start()` 中缓存其引用。**
    
-   **`Camera.allCameras`**：每次调用都会创建一个新的 `Camera[]` 数组，包含场景中所有激活的相机。在 `Update` 或其他高频方法中调用它会产生大量 GC Alloc。
    

**坏代码示例**：

C#

```
void Update()
{
    // 频繁获取主相机（如果标签没设置好，每次都查找）
    Camera mainCam = Camera.main; 
    
    // 每次都 new 一个数组
    foreach (Camera cam in Camera.allCameras) // GC Alloc
    {
        // ...
    }
}

```

**好代码示例**：

C#

```
using UnityEngine;
using System.Collections.Generic;

public class CameraManager : MonoBehaviour
{
    private Camera _mainCamera; // 缓存主相机引用
    private List<Camera> _cachedAllCameras = new List<Camera>(); // 用于 GetActiveCameras 填充

    void Awake()
    {
        _mainCamera = Camera.main; // 在 Awake 中缓存一次
    }

    void Update()
    {
        if (_mainCamera != null)
        {
            // 使用缓存的主相机
            // Debug.Log(_mainCamera.name); 
        }

        // 使用 Camera.GetActiveCameras(List<Camera>)
        Camera.GetActiveCameras(_cachedAllCameras); // 不产生 GC Alloc
        foreach (Camera cam in _cachedAllCameras)
        {
            // Debug.Log(cam.name);
        }
        _cachedAllCameras.Clear(); // 清空 List，以便下次重用
    }
}

```

**关键**：

-   对于 `Camera.main`，**只缓存一次**。
    
-   对于获取所有相机，使用 **`Camera.GetActiveCameras(List<Camera> cameras)`** 方法，传入一个预分配的 `List<Camera>`，它会填充这个 List 而不产生新的 GC Alloc。
    

#### 3.4.4 优化 `Input.touches` / `Input.GetTouch()`

在移动设备上，触摸输入是常见的操作。`Input.touches` 属性会返回一个 `Touch[]` 数组，每次访问都会创建新数组。

**坏代码示例**：

C#

```
void Update()
{
    // 每帧访问 Input.touches 都会产生新的数组
    foreach (Touch touch in Input.touches) // GC Alloc
    {
        if (touch.phase == TouchPhase.Began)
        {
            Debug.Log("Touch started at: " + touch.position);
        }
    }
}

```

好代码示例：

直接使用 Input.touchCount 和 Input.GetTouch(index) 来迭代，避免创建数组。

C#

```
void Update()
{
    for (int i = 0; i < Input.touchCount; i++)
    {
        Touch touch = Input.GetTouch(i); // 不会产生 GC Alloc
        if (touch.phase == TouchPhase.Began)
        {
            Debug.Log("Touch started at: " + touch.position);
        }
    }
}

```

虽然 `Input.GetTouch(index)` 内部可能仍有少量开销，但相比每次创建一个新数组，这种方式能显著减少 GC Alloc。

----------

### 3.5 协程 (Coroutines) 优化

协程是 Unity 中处理异步和延迟操作的强大工具。然而，如果不注意，协程也可能成为 GC Alloc 的来源，特别是当你在 `yield return` 语句中使用 `new` 关键字时。

**原理**：`yield return` 语句返回的对象，如果是引用类型，并且每次都 `new`，那么每次都会在堆上分配内存。

#### 3.5.1 缓存 `yield return new WaitForSeconds()` 等

这是协程中最常见的 GC Alloc 场景。每次 `yield return new WaitForSeconds(time)` 都会创建一个新的 `WaitForSeconds` 实例。

**坏代码示例**：

C#

```
IEnumerator RepeatAction()
{
    while (true)
    {
        yield return new WaitForSeconds(1.0f); // 每次循环都 new，产生 GC Alloc
        Debug.Log("Action repeated after 1 second.");
    }
}

```

好代码示例：

将常用的 WaitForSeconds 对象缓存起来，重用它们。

C#

```
using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class CoroutineOptimizer : MonoBehaviour
{
    // 缓存常用的 WaitForSeconds 对象
    private static readonly WaitForSeconds _oneSecondDelay = new WaitForSeconds(1.0f);
    private static readonly WaitForSeconds _halfSecondDelay = new WaitForSeconds(0.5f);
    private static readonly WaitForEndOfFrame _waitForEndOfFrame = new WaitForEndOfFrame();
    private static readonly WaitForFixedUpdate _waitForFixedUpdate = new WaitForFixedUpdate();

    IEnumerator RepeatActionOptimized()
    {
        while (true)
        {
            yield return _oneSecondDelay; // 使用缓存的对象，不产生 GC Alloc
            Debug.Log("Action repeated after 1 second (optimized).");
        }
    }

    IEnumerator FrameActions()
    {
        yield return _waitForEndOfFrame; // 不产生 GC Alloc
        Debug.Log("End of frame.");
        yield return _waitForFixedUpdate; // 不产生 GC Alloc
        Debug.Log("Fixed update.");
    }

    void Start()
    {
        StartCoroutine(RepeatActionOptimized());
        StartCoroutine(FrameActions());
    }
}

```

**关键**：对于 `WaitForSeconds`、`WaitForEndOfFrame`、`WaitForFixedUpdate` 这些常用的 `yield return` 类型，如果它们的参数是固定的，就**声明为 `static readonly` 字段并在第一次访问时初始化**，或者在 `Awake()` / `Start()` 中初始化为 `private readonly` 字段。这样它们就只会被创建一次，之后都可以重用。

#### 3.5.2 避免在协程中创建不必要的临时对象

除了 `WaitForSeconds`，协程内部的其他逻辑也可能产生 GC Alloc。例如，字符串拼接、集合操作等。

**坏代码示例**：

C#

```
IEnumerator LoadDataCoroutine(string dataPath)
{
    // 每次循环都拼接字符串
    string fullPath = "Assets/Data/" + dataPath; // GC Alloc
    yield return StartCoroutine(DownloadFile(fullPath)); // 假设 DownloadFile 也是协程

    // 每次都 new 一个 List
    List<string> processedData = new List<string>(); // GC Alloc
    // ...
}

```

好代码示例：

应用前面提到的字符串和集合优化技巧。

C#

```
using System.Text; // for StringBuilder

public class DataLoader : MonoBehaviour
{
    private StringBuilder _pathBuilder = new StringBuilder(); // 缓存 StringBuilder

    IEnumerator LoadDataCoroutineOptimized(string dataPath)
    {
        // 重用 StringBuilder
        _pathBuilder.Clear();
        _pathBuilder.Append("Assets/Data/").Append(dataPath);
        string fullPath = _pathBuilder.ToString(); // 只在这里产生一次 GC Alloc
        
        yield return StartCoroutine(DownloadFile(fullPath));

        // 避免在协程内部频繁 new List
        // 如果 processedData 是一个需要被重用的 List，将其声明为成员变量并在外面 new 一次
        // 例如：
        // private List<string> _processedDataCache = new List<string>();
        // 然后在协程中：_processedDataCache.Clear();
    }

    IEnumerator DownloadFile(string path)
    {
        // 模拟下载过程
        yield return _oneSecondDelay; // 使用缓存的 WaitForSeconds
        Debug.Log($"Downloaded: {path}");
    }

    private static readonly WaitForSeconds _oneSecondDelay = new WaitForSeconds(1.0f);
}

```

----------

### 总结

在本篇中，我们学习了大量实用的 GC Alloc 优化技巧。我们针对最常见的 GC Alloc 场景，包括：

-   **装箱**：通过使用 `StringBuilder`、泛型集合和泛型方法，以及合理处理 `Enum` 来避免不必要的装箱。
    
-   **字符串操作**：强调了 `StringBuilder` 的重要性，并展望了 `Span<char>` 等高级优化手段。
    
-   **集合类型操作**：通过预分配容量、重用集合实例（`Clear()`），以及避免 `ToArray()` / `ToList()` 来减少 GC Alloc。
    
-   **对象池**：作为减少 GC Alloc 的核心策略，详细介绍了其原理和实现，强调了它的重要性和注意事项。
    
-   **Unity API 调用**：学习了如何缓存 `GetComponent` 结果，以及使用 `NonAlloc` 变体（如 `Physics.RaycastNonAlloc`、`GetComponentsNonAlloc`、`Camera.GetActiveCameras`）和直接迭代 `Input.touchCount` 来规避 Unity API 带来的 GC Alloc。
    
-   **协程优化**：通过缓存 `WaitForSeconds` 等 `yield return` 对象来减少协程中的内存分配。
    

这些技巧都是你在日常 Unity 开发中能够立即采纳并看到显著效果的。然而，优化是一个持续的过程，过度优化也可能导致代码变得复杂。**记住，永远先用 Profiler 找出真正的性能瓶颈，再进行有针对性的优化。**

在下一篇中，我们将继续深入 GC Alloc 的优化技巧，并开始探讨如何进行 GC 自身的调优，包括 Incremental GC 的使用。敬请期待！