
在上一篇中，我们详细探讨了 UniRx 的核心组件 **`ReactiveProperty<T>`**，了解了它如何让数据变化自动通知订阅者，从而简化了数据绑定和状态管理。`ReactiveProperty<T>` 能够告诉我们“值变了，新值是什么”，这在很多场景下都非常有用。

然而，在实际的游戏开发中，我们经常会遇到这样的需求：**不仅想知道“值变了”，还想知道“值是从什么变成了什么”**——也就是说，我们希望在收到通知时，能够同时获取到**旧值 (Old Value)** 和**新值 (New Value)**。

例如，当玩家血量从 50 变为 30 时，我们可能需要播放一个“受伤”的音效；当从 10 变为 0 时，则需要触发“死亡”动画。如果只有新值，我们通常需要额外记录旧值，并进行比较。这虽然不难，但如果每个需要新旧值的地方都重复这些逻辑，代码就会变得冗余。

这就是我的框架中 **`ObservableProperty<T>`** 类诞生的原因。它正是为了优雅地解决这个痛点，在 `ReactiveProperty<T>` 的基础上，提供一个功能更强大的“可观察属性”。那么现在我们来聊聊`ObservableProperty<T>`类是如何设计的、以及如何使用的。

----------

### `ObservableProperty<T>` 的设计思想

`ObservableProperty<T>` 的核心目标是：**在 `ReactiveProperty<T>` 强大的数据通知能力之上，额外提供对旧值的追踪，并将旧值和新值同时传递给订阅者。**

为了实现这一点，它的设计思想可以概括为以下几点：

1.  **内部封装：** `ObservableProperty<T>` 会在内部私有地持有一个 `ReactiveProperty<T>` 实例。所有的值设置和变化通知，仍然由这个内部的 `ReactiveProperty<T>` 来驱动。
    
2.  **旧值记录：** 引入一个私有变量 `_oldValue`，专门用于保存属性上一次的值。
    
3.  **定制订阅行为：** 在提供给外部的 `Subscribe` 方法中，我们会对内部 `ReactiveProperty<T>` 的通知流进行一些巧妙的操作：
    
    -   **过滤初始值：** 使用 UniRx 的操作符 `Skip(1)`，跳过 `ReactiveProperty<T>` 在订阅时立即发射的那个初始值通知，确保我们只关心真正的“变化”。
        
    -   **注入旧值：** 当 `ReactiveProperty<T>` 实际发生变化时，将我们记录的 `_oldValue` 和当前变化的 `newVal` 一同传递给订阅者。
        
4.  **自动更新旧值：** 在每次值变化并成功通知订阅者后，立即将 `_oldValue` 更新为当前的 `newVal`，为下一次变化做好准备。
    

----------

### `ObservableProperty<T>` 的实现与解析

现在，让我们来详细剖析这个类的代码实现，理解它是如何将上述设计思想变为现实的：



```
using UniRx;
using System;

public class ObservableProperty<T>
{
    private ReactiveProperty<T> _rp;
    private T _oldValue;

    public ObservableProperty(T initialValue)
    {
        _oldValue = initialValue;
        _rp = new ReactiveProperty<T>(initialValue);
    }

    public T Value
    {
        get => _rp.Value;
        set => _rp.Value = value;
    }

    public IDisposable Subscribe(Action<T, T> onChanged)
    {
        return _rp
            .Skip(1) // 忽略 ReactiveProperty 订阅时的初始值发射
            .Subscribe(newVal =>
            {
                onChanged?.Invoke(_oldValue, newVal); // 传递旧值和新值
                _oldValue = newVal; // 更新旧值，为下一次变化做准备
            });
    }
}

```

##### 关键点解析：

1.  **`private T _oldValue;`**: 这个私有变量是整个 `ObservableProperty` 实现旧值记录的关键。它就像一个记忆装置，总能记住上一次的值。
    
2.  **构造函数 `ObservableProperty(T initialValue)`**: 在这里，`_oldValue` 和内部的 `_rp` 都被赋予了相同的 `initialValue`。这确保了在属性的生命周期开始时，所有状态都是同步的。
    
3.  **`Value` 属性**: 这是一个简单的封装层。我们通过它来访问和修改内部 `_rp.Value`。当你 `set` 新值时，`_rp` 会自动触发它的通知机制。
    
4.  **`public IDisposable Subscribe(Action<T, T> onChanged)`**: 这是这个类的核心对外接口。
    
    -   **`Action<T, T> onChanged`**: 注意这个委托的签名。它明确地表示你的回调函数需要接收两个 `T` 类型的参数，这正是我们期望的**旧值**和**新值**。
        
    -   **`.Skip(1)`**: 这是 UniRx 中一个非常常用的**操作符**。它的作用是“跳过序列中的第一个元素”。为什么需要跳过呢？因为 `ReactiveProperty` 在被订阅时，会“礼貌性地”立即发送一次它当前的值。但在 `ObservableProperty` 的上下文中，我们通常只关心“值从 A 变为 B”这种**变化**，而不是初始状态的通知。`Skip(1)` 确保了 `onChanged` 回调只在值真正改变之后才被调用。
        
    -   **`onChanged?.Invoke(_oldValue, newVal);`**: 当内部 `_rp` 的值发生变化时，这个 Lambda 表达式会被执行。我们在这里调用了用户传入的 `onChanged` 回调函数，并巧妙地将 `_oldValue` (我们之前记录的上一次的值) 和 `newVal` (当前最新的值) 一同传递了过去。`?.Invoke` 是 C# 6.0 引入的空条件运算符，它确保只有当 `onChanged` 不为 `null` 时才调用 `Invoke`，防止潜在的空引用异常。
        
    -   **`_oldValue = newVal;`**: **这一步是整个旧值追踪逻辑的关键！** 在通知了所有订阅者之后，我们将 `_oldValue` 更新为当前的 `newVal`。这样，当属性在未来再次发生变化时，`_oldValue` 就能准确地代表它前一个值，从而确保了整个机制的正确性。
        

----------

### `ObservableProperty<T>` 的使用示例

现在，让我们通过一个具体的 Unity 游戏场景来展示 `ObservableProperty<T>` 的实际用法，看看它如何让你的代码更清晰、更强大：



```
using UnityEngine;
using UniRx;
using System;

public class PlayerStatusManager : MonoBehaviour
{
    public ObservableProperty<int> CurrentHealth = new ObservableProperty<int>(100);
    public ObservableProperty<bool> IsPoisoned = new ObservableProperty<bool>(false);

    void Start()
    {
        Debug.Log("--- 游戏开始，初始化玩家状态 ---");

        CurrentHealth.Subscribe((oldHealth, newHealth) =>
        {
            Debug.Log($"玩家血量变化：从 {oldHealth} 变为 {newHealth}");
            if (newHealth <= 0 && oldHealth > 0)
            {
                Debug.Log("<color=red>玩家死亡！触发游戏结束逻辑。</color>");
            }
            else if (newHealth < oldHealth)
            {
                Debug.Log("玩家受到了伤害，播放受击音效或显示伤害数字。");
            }
            else if (newHealth > oldHealth)
            {
                Debug.Log("玩家获得治疗，播放治疗特效或显示治疗数字。");
            }
        }).AddTo(this);

        IsPoisoned.Subscribe((oldState, newState) =>
        {
            Debug.Log($"玩家中毒状态变化：从 {oldState} 变为 {newState}");
            if (newState && !oldState)
            {
                Debug.Log("<color=green>玩家中毒了！开始持续掉血。</color>");
            }
            else if (!newState && oldState)
            {
                Debug.Log("<color=cyan>玩家解毒了！停止持续掉血。</color>");
            }
        }).AddTo(this);

        Invoke("TakeDamage", 2f);
        Invoke("ApplyPoison", 4f);
        Invoke("Heal", 6f);
        Invoke("TakeFatalDamage", 8f);
    }

    void TakeDamage()
    {
        Debug.Log("\n--- 模拟：玩家受到攻击 ---");
        CurrentHealth.Value -= 30;
    }

    void ApplyPoison()
    {
        Debug.Log("\n--- 模拟：玩家中毒 ---");
        IsPoisoned.Value = true;
    }

    void Heal()
    {
        Debug.Log("\n--- 模拟：玩家获得治疗 ---");
        CurrentHealth.Value += 20;
    }

    void TakeFatalDamage()
    {
        Debug.Log("\n--- 模拟：玩家受到致命攻击 ---");
        CurrentHealth.Value = 0;
    }
}

```

----------

### 为什么选择 `ObservableProperty<T>`？

通过 `ObservableProperty<T>`，我们获得了以下显著优势：

-   **更丰富的变化信息：** 同时获得旧值和新值，让你的逻辑判断更加精准和灵活，尤其适用于需要根据变化方向或幅度执行不同行为的场景。
    
-   **更简洁的订阅代码：** 无需在每次订阅时手动处理 `Skip(1)` 和旧值记录的逻辑，`ObservableProperty<T>` 已经为你将这些细节封装起来。
    
-   **统一的接口：** 无论什么类型的数据（`int`, `string`, `bool`, `enum` 甚至自定义类），你都可以用统一的 `Subscribe(Action<T, T>)` 接口来监听其变化，提高代码的可读性和一致性。
    
-   **数据驱动逻辑：** 鼓励你使用数据变化来驱动游戏逻辑，而不是依赖传统的 `Update()` 或复杂的事件链，从而构建更清晰、更模块化、更具响应性的架构。
    
-   **UniRx 生态集成：** 作为 UniRx 家族的一员，`ObservableProperty<T>` 能够无缝地与其他 UniRx 操作符（如 `Where`, `Select`, `Throttle`, `Debounce` 等）结合使用，进一步增强其处理复杂数据流的能力。
    

----------

### 总结

`ReactiveProperty<T>` 是 UniRx 库中一个非常强大和实用的概念，是构建响应式系统的基石。而 **`ObservableProperty<T>` 则是对其能力的进一步拓展和封装，它完美解决了在数据变化时同时获取旧值和新值的需求，使得基于数据变化的逻辑处理更加优雅和高效。**

希望这篇笔记能帮助你深入理解 `ObservableProperty<T>` 的设计思想、实现原理和实际应用。将其融入你的 Unity 框架中，你将能够构建更加健壮、可维护且响应迅速的游戏系统。

如果你对 UniRx 的其他高级操作符感兴趣，或者想了解如何将 `ObservableProperty<T>` 应用到更复杂的场景中，比如结合 MVVM 模式进行 UI 绑定，欢迎在评论区留言讨论！