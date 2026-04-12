# 动态编程入门第二节：委托与事件 - Unity 开发者的高级回调与通信艺术

## 摘要
 上次我们聊了 **C# 反射**，它让程序拥有了在运行时“看清自己”的能力。但光能看清还不够，我们还需要让代码能够灵活地“沟通”和“响应”。这就不得不提到 C# 中另外两个非常重要的概念：**委托 (Delegate)** 和 **事件 (Event)**。 作为 Unity 开发者，你可能每天都在使用它们，比如 Unity UI 按钮的 `OnClick` 事件、`SendMessage...

## 正文


上次我们聊了 **C# 反射**，它让程序拥有了在运行时“看清自己”的能力。但光能看清还不够，我们还需要让代码能够灵活地“沟通”和“响应”。这就不得不提到 C# 中另外两个非常重要的概念：**委托 (Delegate)** 和 **事件 (Event)**。

作为 Unity 开发者，你可能每天都在使用它们，比如 Unity UI 按钮的 `OnClick` 事件、`SendMessage` 或 `GetComponent<T>().SomeMethod()` 等等，它们背后或多或少都离不开委托和事件的思想。今天，我们就来深入探讨它们的进阶用法，以及它们如何构建起 Unity 中高效、解耦的回调和消息系统。

----------

### 1. 委托（Delegate）：方法的“引用”或“签名”

简单来说，**委托是一个类型安全的函数指针**。它定义了一个方法的**签名**（包括返回类型和参数列表），可以引用任何符合这个签名的方法。一旦委托引用了一个或多个方法，你就可以通过调用委托来执行这些被引用的方法。

#### 1.1 委托的基础与回顾

你可能已经习惯了使用 Unity 的 `UnityEvent` 或者直接使用 `Action` 和 `Func`。它们都是委托的体现。

-   **定义委托：**
    
    
    
    ```
    // 定义一个委托类型，它能引用一个没有参数，没有返回值的函数
    public delegate void MyActionDelegate();
    
    // 定义一个委托类型，它能引用一个接收一个int参数，返回string的函数
    public delegate string MyFuncDelegate(int value);
    
    ```
    
-   **实例化与调用：**
    
    
    
    ```
    using UnityEngine;
    
    public class DelegateBasicExample : MonoBehaviour
    {
        public delegate void MySimpleDelegate(); // 定义委托
    
        void Start()
        {
            MySimpleDelegate del; // 声明委托变量
    
            // 引用一个方法 (方法签名必须与委托匹配)
            del = SayHello;
            del(); // 调用委托，等同于调用 SayHello()
    
            // 委托可以引用静态方法
            del += SayGoodbye; // += 用于添加方法到委托链 (多播委托)
            del(); // 会依次调用 SayHello() 和 SayGoodbye()
    
            del -= SayHello; // -= 用于从委托链中移除方法
            del(); // 只会调用 SayGoodbye()
        }
    
        void SayHello()
        {
            Debug.Log("Hello from delegate!");
        }
    
        static void SayGoodbye()
        {
            Debug.Log("Goodbye from static delegate!");
        }
    }
    
    ```
    

#### 1.2 `Action` 和 `Func`：泛型委托的便捷性

在 C# 3.0 之后，微软引入了 `Action` 和 `Func` 这两个内置的泛型委托，极大地简化了委托的定义。

-   **`Action`：** 用于引用没有返回值的委托。
    
    -   `Action`：没有参数，没有返回值。
        
    -   `Action<T1, T2, ...>`：接收 T1, T2... 类型参数，没有返回值。
        
    -   最多支持 16 个参数。
        
-   **`Func`：** 用于引用有返回值的委托。
    
    -   `Func<TResult>`：没有参数，返回 TResult 类型。
        
    -   `Func<T1, T2, ..., TResult>`：接收 T1, T2... 类型参数，返回 TResult 类型。
        
    -   最多支持 16 个参数和 1 个返回值。
        

**示例：**



```
using System; // Action 和 Func 在 System 命名空间
using UnityEngine;

public class ActionFuncExample : MonoBehaviour
{
    void Start()
    {
        // Action 示例
        Action greetAction = () => Debug.Log("Hello using Action!");
        greetAction();

        Action<string> printMessage = (msg) => Debug.Log("Message: " + msg);
        printMessage("This is a test.");

        // Func 示例
        Func<int, int, int> addFunc = (a, b) => a + b;
        Debug.Log("10 + 20 = " + addFunc(10, 20));

        Func<string> getRandomString = () => Guid.NewGuid().ToString();
        Debug.Log("Random string: " + getRandomString());
    }
}

```

通过 `Action` 和 `Func`，我们几乎可以满足所有常见委托签名的需求，无需再手动定义 `delegate` 关键字。

#### 1.3 匿名方法与 Lambda 表达式：让委托更简洁

-   **匿名方法：** 在 C# 2.0 引入，允许你定义一个没有名字的方法，直接赋值给委托。
    
    
    
    ```
    MySimpleDelegate del = delegate() { Debug.Log("I'm an anonymous method!"); };
    del();
    
    ```
    
-   **Lambda 表达式：** 在 C# 3.0 引入，是匿名方法的进一步简化和增强，也是现在最常用的写法。
    
    
    
    ```
    // 无参数：
    Action noParam = () => Debug.Log("No parameters!");
    noParam();
    
    // 单参数：
    Action<string> oneParam = msg => Debug.Log($"Message: {msg}"); // 如果只有一个参数，可以省略括号
    oneParam("Hello Lambda!");
    
    // 多参数：
    Func<int, int, int> add = (a, b) => a + b;
    Debug.Log($"Add: {add(3, 5)}");
    
    // 包含多行代码：
    Action multiLine = () =>
    {
        Debug.Log("First line.");
        Debug.Log("Second line.");
    };
    multiLine();
    
    ```
    

Lambda 表达式极大地提高了代码的**可读性**和**简洁性**，使得编写事件回调和 LINQ 查询变得非常流畅。

----------

### 2. 事件（Event）：基于委托的安全发布/订阅机制

委托为我们提供了回调的能力，而 **事件 (Event)** 则是在委托基础上构建的一种特殊的类型成员，它提供了一种**安全的机制**来发布和订阅通知。

事件的核心思想是：**发布者**（拥有事件的类）只负责“发出通知”，而不知道谁会接收；**订阅者**（其他类）只负责“接收通知”，而不需要知道通知来自何方。这种**解耦**是实现松耦合代码的关键。

#### 2.1 事件的优势

事件相对于直接暴露委托变量有以下优势：

1.  **封装性：** 事件只能在声明它的类内部被触发（`Invoke`），外部代码只能通过 `+=` 和 `-=` 运算符来订阅或取消订阅，不能直接赋值或清空整个委托链。这防止了外部代码不小心破坏事件的订阅列表。
    
2.  **安全性：** 外部代码无法得知事件有多少个订阅者，也无法在未经授权的情况下触发事件。
    

#### 2.2 事件的实现与使用



```
using System;
using UnityEngine;

// 事件发布者
public class GameEventManager : MonoBehaviour
{
    // 声明一个事件，通常使用 Action 或自定义委托类型
    public event Action OnPlayerDeath; // 当玩家死亡时触发
    public event Action<int> OnScoreChanged; // 当分数改变时触发，并传递新分数

    // 单例模式，方便全局访问
    public static GameEventManager Instance { get; private set; }

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
        }
    }

    // 外部调用此方法来“发布”或“触发”事件
    public void PlayerDied()
    {
        // 检查是否有订阅者，避免 NullReferenceException
        OnPlayerDeath?.Invoke(); // C# 6.0 的 ?. 操作符糖，等同于 if (OnPlayerDeath != null) OnPlayerDeath.Invoke();
        Debug.Log("玩家死亡事件已发布！");
    }

    public void ChangeScore(int newScore)
    {
        OnScoreChanged?.Invoke(newScore);
        Debug.Log("分数改变事件已发布，新分数: " + newScore);
    }
}

// 事件订阅者
public class PlayerStats : MonoBehaviour
{
    private int currentScore = 0;

    void OnEnable() // 建议在 OnEnable 订阅，在 OnDisable 取消订阅
    {
        if (GameEventManager.Instance != null)
        {
            GameEventManager.Instance.OnPlayerDeath += HandlePlayerDeath;
            GameEventManager.Instance.OnScoreChanged += UpdateScore;
            Debug.Log("PlayerStats 已订阅事件。");
        }
    }

    void OnDisable() // 退出时取消订阅，防止内存泄漏
    {
        if (GameEventManager.Instance != null)
        {
            GameEventManager.Instance.OnPlayerDeath -= HandlePlayerDeath;
            GameEventManager.Instance.OnScoreChanged -= UpdateScore;
            Debug.Log("PlayerStats 已取消订阅事件。");
        }
    }

    void HandlePlayerDeath()
    {
        Debug.Log("PlayerStats 收到玩家死亡事件，执行死亡处理逻辑。");
        // 例如：显示死亡界面
    }

    void UpdateScore(int newScore)
    {
        currentScore = newScore;
        Debug.Log($"PlayerStats 收到分数改变事件，当前分数: {currentScore}");
        // 例如：更新UI显示
    }

    void Update()
    {
        // 测试代码：按下空格键触发玩家死亡事件
        if (Input.GetKeyDown(KeyCode.Space))
        {
            GameEventManager.Instance?.PlayerDied();
        }
        // 测试代码：按下回车键改变分数
        if (Input.GetKeyDown(KeyCode.Return))
        {
            GameEventManager.Instance?.ChangeScore(currentScore + 100);
        }
    }
}

```

在这个例子中：

-   `GameEventManager` 是事件的**发布者**，它声明并触发 `OnPlayerDeath` 和 `OnScoreChanged` 事件。
    
-   `PlayerStats` 是事件的**订阅者**，它通过 `+=` 运算符将自己的方法关联到 `GameEventManager` 的事件上。
    
-   **注意 `OnEnable` 和 `OnDisable`：** 这是 Unity 中管理事件订阅非常重要的模式。在组件激活时订阅事件，在组件禁用或销毁时取消订阅，可以有效防止因订阅者被销毁而发布者仍在触发事件导致的 `NullReferenceException` 和**内存泄漏**问题。
    

----------

### 3. 委托与反射的结合：从性能问题引出表达式树

在上一篇教程中，我们提到了反射的性能开销，特别是 `MethodInfo.Invoke()` 方法。虽然它能让我们动态地调用方法，但每次调用都会有不小的运行时性能损耗。

你可能会想，既然委托就是方法的“引用”，我能不能把反射获取到的 `MethodInfo` 转换为一个委托来调用呢？答案是肯定的，而且这正是**表达式树**出现的重要原因之一。

C# 提供了一个方法 `Delegate.CreateDelegate()`，它可以在运行时根据 `MethodInfo` 创建一个委托。



```
using System;
using System.Reflection;
using UnityEngine;

public class DelegateFromReflectionExample : MonoBehaviour
{
    public void MyTargetMethod(string msg)
    {
        Debug.Log("Target method invoked: " + msg);
    }

    void Start()
    {
        Type type = typeof(DelegateFromReflectionExample);
        MethodInfo methodInfo = type.GetMethod("MyTargetMethod");

        if (methodInfo != null)
        {
            // 尝试创建委托
            // 参数1：委托类型 (例如 Action<string>)
            // 参数2：委托要绑定的对象实例 (如果是静态方法则为 null)
            Action<string> myDelegate = (Action<string>)Delegate.CreateDelegate(typeof(Action<string>), this, methodInfo);

            // 通过委托调用方法
            myDelegate("Hello from Delegate.CreateDelegate!");

            // 测量性能差异（简单粗略测试）
            MeasurePerformance(methodInfo, this);
        }
    }

    void MeasurePerformance(MethodInfo methodInfo, object instance)
    {
        int iterations = 1000000; // 100万次迭代

        // 1. 直接调用
        long startTime = System.Diagnostics.Stopwatch.GetTimestamp();
        for (int i = 0; i < iterations; i++)
        {
            MyTargetMethod("test");
        }
        long endTime = System.Diagnostics.Stopwatch.GetTimestamp();
        double directCallTime = (double)(endTime - startTime) / System.Diagnostics.Stopwatch.Frequency * 1000;
        Debug.Log($"直接调用 {iterations} 次耗时: {directCallTime:F2} ms");

        // 2. 反射 Invoke
        startTime = System.Diagnostics.Stopwatch.GetTimestamp();
        for (int i = 0; i < iterations; i++)
        {
            methodInfo.Invoke(instance, new object[] { "test" });
        }
        endTime = System.Diagnostics.Stopwatch.GetTimestamp();
        double reflectionInvokeTime = (double)(endTime - startTime) / System.Diagnostics.Stopwatch.Frequency * 1000;
        Debug.Log($"反射 Invoke {iterations} 次耗时: {reflectionInvokeTime:F2} ms");

        // 3. Delegate.CreateDelegate 编译后的委托
        Action<string> compiledDelegate = (Action<string>)Delegate.CreateDelegate(typeof(Action<string>), instance, methodInfo);
        startTime = System.Diagnostics.Stopwatch.GetTimestamp();
        for (int i = 0; i < iterations; i++)
        {
            compiledDelegate("test");
        }
        endTime = System.Diagnostics.Stopwatch.GetTimestamp();
        double compiledDelegateTime = (double)(endTime - startTime) / System.Diagnostics.Stopwatch.Frequency * 1000;
        Debug.Log($"Delegate.CreateDelegate 委托 {iterations} 次耗时: {compiledDelegateTime:F2} ms");

        //你会发现：直接调用 > Delegate委托 > 反射Invoke。
        //Delegate.CreateDelegate创建委托的“一次性”开销，是小于反射Invoke每次调用的开销的。
        //尤其是在多次调用同一方法时，委托的性能优势会非常明显。
    }
}

```

运行上面的代码，你会观察到：

-   **直接调用** 的性能是最好的。
    
-   **`Delegate.CreateDelegate` 创建并调用的委托** 性能接近直接调用，远好于 `Invoke`。
    
-   **`MethodInfo.Invoke()`** 的性能是最差的。
    

这是为什么呢？

Delegate.CreateDelegate 在创建委托时，会执行一次性的编译工作，将 MethodInfo 转换为一个高效的委托。一旦这个委托被创建，后续的调用就和直接调用方法几乎一样快。而 MethodInfo.Invoke() 每次调用都需要进行一系列的运行时检查和参数装箱拆箱操作，开销较大。

在你的 `UIManager` 脚本中，你正是利用了这种思想，只不过你用的是更强大、更灵活的**表达式树**来完成这个“一次性编译”的工作。表达式树能够更细粒度地控制委托的生成，实现更复杂的动态调用逻辑。

----------

### 总结与展望

委托和事件是 C# 中实现**回调**和**解耦**的重要机制。

-   **委托** 让你能够像操作变量一样操作方法，实现了代码的**动态绑定**。
    
-   **事件** 在委托之上提供了一层封装，构建了安全、可靠的**发布/订阅通信模型**，这在 Unity 中尤其适用于 UI、游戏状态管理和模块间通信。
    

了解并熟练运用它们，将极大地提升你代码的**灵活性、可维护性**和**扩展性**。

然而，当我们需要在运行时根据类型信息动态生成复杂的代码逻辑，并追求极致的性能时，仅仅依靠 `Delegate.CreateDelegate` 就不够了。这就是**表达式树**大展身手的地方。

在下一篇教程中，我们将深入探索**表达式树**，理解它如何让我们在运行时像写代码一样“构建代码”，并将其编译成高性能的委托，最终揭示你的框架中的 `UIManager` 中 `CacheInitDelegate` 方法的原理。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*