# UI框架从0到1第五节：【事件消息体】不仅知道你点了啥，还知道你改了啥-CSDN博客

## 摘要
 到目前为止，我们的框架已经支持： -  多个 UI 控件自动触发事件；   -  所有事件汇总进 `PanelBase.ProcessEvent()`；   -  页面之间逻辑独立、结构清晰。    但问题还远未解决。 ---------- > ❓ 如果我们想知道 [Toggle](https://so.csdn.net/so/search?q=Toggle&spm=1001.2101.3...

## 正文


到目前为止，我们的框架已经支持：

-   多个 UI 控件自动触发事件；
    
-   所有事件汇总进 `PanelBase.ProcessEvent()`；
    
-   页面之间逻辑独立、结构清晰。
    

但问题还远未解决。

----------

> ❓ 如果我们想知道 [Toggle](https://so.csdn.net/so/search?q=Toggle&spm=1001.2101.3001.7020) 的勾选状态？或者 InputField 输入了什么？我们该怎么做？

我们无法仅靠 `sender.name` 来判断控件类型或获取其值 —— 这就是我们今天要补上的最大漏洞。

----------

### 🎯 目标：为事件附加“上下文信息”

我们需要一种通用机制，让控件在触发事件时携带额外的数据（比如 bool 值、string 文本），并在 `PanelBase` 中便捷地读取这些数据。

----------

### 📦 定义事件上下文接口

我们从一个空接口 `IEventContext` 开始，用作所有“事件附带数据”的统一标识。



```
public interface IEventContext { }

```

然后我们定义一个通用的数据结构 `ValueChangedContext<T>`，用于描述“旧值 → 新值”的变更：



```
public class ValueChangedContext<T> : IEventContext
{
    public T OldValue;
    public T NewValue;

    public ValueChangedContext(T oldVal, T newVal)
    {
        OldValue = oldVal;
        NewValue = newVal;
    }
}

```

### 🔍 为啥用 class，不用 struct？

你可能会好奇，为啥不用 `struct`？不是更轻量吗？

答：这是一种有意识的取舍。

-   ✅ 我们需要**支持多态**，而 `struct` 不擅长这个场景；
    
-   ✅ 如果[结构体](https://so.csdn.net/so/search?q=%E7%BB%93%E6%9E%84%E4%BD%93&spm=1001.2101.3001.7020)实现接口，在使用接口接收时会发生**装箱**，反而导致 GC；
    
-   ✅ 有些值本身就是引用类型（如 `string`、`GameObject`），用 `struct` 也没性能提升；
    

结论：这里明确使用类，是为了让事件上下文系统更加灵活与安全。

----------

### 🔄 控件发送事件时传入上下文

我们修改 `EventUIBase`，加入 `Send()` 方法重载，统一事件发射接口：



```
protected void Send(string eventName, IEventContext context)
{
    targetPanel?.ProcessEvent(eventName, this, context);
}

protected void Send(string eventName)
{
    targetPanel?.ProcessEvent(eventName, this);
}

```

### 🧪 示例：改造 Button 与 Toggle 的 Custom 脚本

#### ✅ `ButtonCustom.cs`

按钮没有附加值，仅发送事件名即可。



```
public class ButtonCustom : EventUIBase
{
    private Button btn;

    protected override void Init()
    {
        base.Init();
        btn = GetComponent<Button>();
        btn.onClick.AddListener(() =>
        {
            Send("OnClick");
            Debug.Log($"{name} 被点击");
        });
    }
}

```

#### ✅ `ToggleCustom.cs`

开关需要传递勾选状态变化。



```
public class ToggleCustom : EventUIBase
{
    private Toggle tog;
    private bool previousValue;

    protected override void Init()
    {
        base.Init();
        tog = GetComponent<Toggle>();
        previousValue = tog.isOn;
        tog.onValueChanged.AddListener(newValue =>
        {
            Send("OnToggleValueChanged", new ValueChangedContext<bool>(previousValue, newValue));
            previousValue = newValue;
        });
    }
}

```

### 📬 PanelBase 中统一处理事件 + 解析上下文

现在我们来改造 `PanelBase`，让它支持事件分发与类型识别：



```
public class PanelBase : MonoBehaviour
{
    public virtual void ProcessEvent(string eventName, EventUIBase sender, IEventContext context = null)
    {
        Debug.Log($"[{name}] 收到事件: {eventName}");

        Dispatch<bool>(eventName, "IsShow", context, (oldVal, newVal) =>
        {
            Debug.Log($"IsShow 从 {oldVal} → {newVal}");
            if (newVal) OnShow(); else OnClose();
        });
    }

    protected void Dispatch<T>(string eventName, string targetEvent, IEventContext context, Action<T, T> callback)
    {
        if (eventName == targetEvent && context is ValueChangedContext<T> valCtx)
        {
            callback?.Invoke(valCtx.OldValue, valCtx.NewValue);
        }
    }

    protected void Dispatch(string eventName, string targetEvent, Action callback)
    {
        if (eventName == targetEvent)
        {
            callback?.Invoke();
        }
    }

    protected virtual void OnShow() => transform.localScale = Vector3.one;
    protected virtual void OnClose() => transform.localScale = Vector3.up;
}

```

🧠 示例：HelloWorldPanel 的完整事件处理



```
public class HelloWorldPanel : PanelBase
{
    public override void ProcessEvent(string eventName, EventUIBase sender, IEventContext context = null)
    {
        base.ProcessEvent(eventName, sender, context);

        Dispatch(eventName, "OnClick", () =>
        {
            if (sender.name == "按钮1")
            {
                Debug.Log("处理按钮1逻辑");
            }
        });

        Dispatch<bool>(eventName, "OnToggleValueChanged", context, (oldVal, newVal) =>
        {
            if (sender.name == "toggle1")
            {
                Debug.Log($"切换状态变更为：{newVal}");
            }
        });
    }
}

```

💡 Tips：Dispatch 的本质是“事件判断器 + 执行器”



```
Dispatch("OnClick", "OnClick", () => Debug.Log("执行了按钮逻辑"));

```

其实就是：



```
if (eventName == "OnClick")
{
    // 执行逻辑
}

```

这就是事件驱动编程的核心思想：**“把要做的事交给框架，在恰当的时机自动触发”**。

----------

### 🔚 本节总结

能力

是否完成

控件支持传递自定义值

✅ 是

面板能够类型安全地解析数据

✅ 是

不再依赖 `sender.name` 获取数据

✅ 是

同名按钮是否区分？

✅ 可区分控件类型

同类控件是否仍不能重名？

❌ 还没解决（将在后面处理）

### 🔮 下一节预告：我们真的需要这么复杂的上下文吗？

现在你可能在想：

> “按钮不就一个点击事件？Toggle 也就传个 bool，有必要搞这么多类、泛型、接口吗？”

下节我们就来探讨这个问题，并通过一个“类 MVVM”风格的 View → Logic 数据派发例子，让你真正理解这个系统背后的设计哲学。



## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** 技术文档
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*