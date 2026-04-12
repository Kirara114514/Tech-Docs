# UI框架从0到1第六节：【轻量 MVVM】用属性驱动 UI，彻底抛弃命令式调用-CSDN博客

## 摘要
 上一节我们设计了事件上下文系统，让每个控件都能将值变化通过 `ValueChangedContext<T>` 携带上来，供页面逻辑层（Panel）解析使用。 但你可能会问： > “一个 Toggle 不就是变个 bool 吗？为啥还要整一堆泛型上下文、数据包封装？” 本节我们就来解答这个问题，并用实战告诉你：这些设计，不只是为了好看，而是为了**构建一个真正“响应式”的 UI 框架核心机制...

## 正文


上一节我们设计了事件上下文系统，让每个控件都能将值变化通过 `ValueChangedContext<T>` 携带上来，供页面逻辑层（Panel）解析使用。

但你可能会问：

> “一个 Toggle 不就是变个 bool 吗？为啥还要整一堆泛型上下文、数据包封装？”

本节我们就来解答这个问题，并用实战告诉你：这些设计，不只是为了好看，而是为了**构建一个真正“响应式”的 UI 框架核心机制**。

----------

### 🎯 目标：通过数据变化驱动 UI 显隐（类 MVVM 响应式模型）

还记得我们在 `PanelBase` 中写了这段逻辑吗？



```
Dispatch<bool>(eventName, "IsShow", context, (oldVal, newVal) =>
{
    if (newVal) OnShow(); else OnClose();
});

```

但问题是：我们从来没手动发送过一个事件叫 `"IsShow"` 啊？这个事件是怎么来的？

答案是——我们接下来要做的，就是从“状态”中派发这个事件。

----------

### 🧱 新增组件 ViewBase：状态容器 + 数据派发中枢



```
public class ViewBase : Base
{
    protected PanelBase panelBase;
    private bool isShow;

    public bool IsShow
    {
        get => isShow;
        set => SetProperty(ref isShow, value, "IsShow");
    }

    private void Init()
    {
        panelBase = GetComponent<PanelBase>();
    }

    protected void SetProperty<T>(ref T field, T newValue, string eventName)
    {
        if (EqualityComparer<T>.Default.Equals(field, newValue)) return;

        var oldValue = field;
        field = newValue;
        SendEvent(eventName, this, new ValueChangedContext<T>(oldValue, newValue));
    }

    public void SendEvent(string eventName, Base sender, IEventContext context = null)
    {
        panelBase?.ProcessEvent(eventName, sender, context);
    }
}

```

✅ 用法演示（此处的UIManager我们会在后面进行编写，现在仅作示意）



```
UIManager.GetPanelView<HelloWorldView>().IsShow = true;

```

这一行代码会自动派发事件 `"IsShow"`，并将旧值 / 新值传给 `PanelBase`，由它决定是否执行动画、隐藏其他面板、回收资源等。

----------

### 🤔 ViewBase 为什么继承自 Base，而不是 EventUIBase？

因为我们希望：

-   **控件脚本**（按钮、开关）通过 `EventUIBase` 来处理交互；
    
-   **状态脚本**（属性容器）通过 `ViewBase` 来处理数据变化。
    

它们的职责完全不同，不应互相继承。

但为了统一事件通道，我们让它们都继承自一个公共父类 `Base`，这样就可以统一传给：



```
public virtual void ProcessEvent(string eventName, Base sender, IEventContext context = null)

```

### 📡 改造控件事件发射流程：EventUIBase → ViewBase

我们改写 `EventUIBase`，让控件事件不再直接传给 `PanelBase`，而是转发给其 View：



```
public class EventUIBase : Base
{
    protected ViewBase targetPanel;

    protected virtual void Init()
    {
        Transform current = transform;
        while (current != null)
        {
            targetPanel = current.GetComponent<ViewBase>();
            if (targetPanel != null) return;
            current = current.parent;
        }
        Debug.LogWarning("No parent with ViewBase found.");
    }

    protected void Send(string eventName, IEventContext context)
    {
        targetPanel?.SendEvent(eventName, this, context);
    }

    protected void Send(string eventName)
    {
        targetPanel?.SendEvent(eventName, this);
    }
}

```

从此以后，UI 控件 → 触发事件 → `ViewBase` 中转 → `PanelBase` 处理，整个路径清晰、解耦、可扩展。

----------

### 🧠 什么是 MVVM？为什么我们要这么搞？

#### ✅ MVC vs MVVM 简明对比：


| 架构 | 控制方式 | View 与逻辑层关系 | 缺点 |


| MVC | 控制器直接操作 View | View 只是表现，弱感知状态 | Controller 越写越胖、耦合重 |

| MVVM | View 观察数据状态 | 由 ViewModel 提供状态 | 学习成本略高、初期感觉绕 |

#### ✅ 我们做的是什么？

我们没有完整实现复杂的绑定系统，也没有引入外部工具链，而是：

-   简化 MVVM 的思想；
    
-   让 View（或控件）通过设置字段（如 `IsShow = true`）来表达“我现在需要这个状态”；
    
-   而不是主动调用某段逻辑。
    

**这就是响应式编程的起点。**

----------

### 🔁 总结：我们的“类 MVVM”已经成型

-   ✅ 每个 View 持有状态
    
-   ✅ 设置状态就自动派发事件（无需命令式流程）
    
-   ✅ 控件事件全部通过 View 进入
    
-   ✅ 事件处理逻辑集中在 `PanelBase` 中，分层明确
    
-   ✅ 所有事件、值变更都统一走 `ProcessEvent()` → `Dispatch()` 流程
    

这种设计高度契合 MVVM 的核心思想 —— **状态驱动行为，逻辑分离表达**。

但很快你就会发现一个实际问题：

> 我现在已经写好了 `HelloWorldView` 和 `HelloWorldPanel`，但是我**该怎么在别的类中访问这个 View 的实例呢**？

我们当然可以 `GetComponent<HelloWorldView>()`，但这样做有几个致命的问题：

-   引用链不清晰，调试困难；
    
-   对象一旦未初始化或场景结构变化容易出错；
    
-   无法实现“引用可溯源”和“静态安全访问”；
    
-   完全违背我们框架中 **自动注册 / 自动绑定 / 低耦合** 的理念。
    

所以接下来，我们需要补上这最后一块拼图：

----------

### 🚀 第七节预告：全局唯一 UI 管理器 —— `UIManager`

我们将构建一个静态的 `UIManager` 类，用于：

-   自动注册所有 `ViewBase` 派生类；
    
-   提供[泛型](https://so.csdn.net/so/search?q=%E6%B3%9B%E5%9E%8B&spm=1001.2101.3001.7020)安全的获取接口；
    
-   保证每个 UI 面板全局唯一；
    
-   从此摆脱拖引用、手动查找、GetComponent 的老旧做法。
    

你只需要一行代码：



```
UIManager.GetPanelView<HelloWorldView>().IsShow = true;

```

不需要拖，不需要查，只要类型写对，马上就能用！

**我们要做的，不只是构建一个 UI 系统，而是构建一个“任何引用都可溯源”的开发体验。**

马上进入下一节，我们来实现这个全局唯一入口：UIManager！


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** 技术文档
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*