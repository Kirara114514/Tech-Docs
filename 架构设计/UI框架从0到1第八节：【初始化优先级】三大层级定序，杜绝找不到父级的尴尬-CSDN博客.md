# UI框架从0到1第八节：【初始化优先级】三大层级定序，杜绝找不到父级的尴尬-CSDN博客

## 摘要
 在上一节中，我们成功实现了通过 `UIManager` 获取每个页面的 `ViewBase` 派生类实例，彻底告别了 `GetComponent`、拖引用、硬查找这些低效方式。我们的框架第一次拥有了一个真正意义上的“统一面板入口”。 但随着使用深入，一个令人不安的问题浮出水面： > 我们的控件（`ButtonCustom`、`ToggleCustom`）是在各自的 `Init()` 方法中...

## 正文


在上一节中，我们成功实现了通过 `UIManager` 获取每个页面的 `ViewBase` 派生类实例，彻底告别了 `GetComponent`、拖引用、硬查找这些低效方式。我们的框架第一次拥有了一个真正意义上的“统一面板入口”。

但随着使用深入，一个令人不安的问题浮出水面：

> 我们的控件（`ButtonCustom`、`ToggleCustom`）是在各自的 `Init()` 方法中通过 `transform.parent` 向上查找父级的 `ViewBase`，那如果控件的 `Init()` 比 `ViewBase` 先执行了，会发生什么？

答案是——**会直接找不到 ViewBase，事件无法转发，控件注册失败**。

这不是小问题，这是灾难级的初始化顺序隐患。于是本节我们要解决的就是它：

> 如何确保初始化顺序永远是：`ViewBase` → `PanelBase` → `EventUIBase`？

----------

### ✅ 为什么 Init() 的顺序如此重要？

我们前面做了这么多“自动化”的工作：让控件自动注册、让 View 自动绑定 Panel、让框架自动反射 `Init()`……所有这些自动，其实都是建立在“谁先初始化”这个前提上的。

如果初始化顺序不正确，比如控件先于 View 执行了 `Init`，那就意味着：

-   无法找到目标父级 `ViewBase`
    
-   无法注册事件转发
    
-   无法通过 View 查询控件
    
-   所有事件和数据都将中断
    

所以，我们需要的不只是“自动初始化”，而是**“自动且有序”**的初始化流程。

----------

### ✅ 解决方案：按类型定义初始化优先级

我们给所有 `Base` 的子类打上“初始化优先级”，越小越先执行：


| 类型层级 | 类名 | 优先级 |

| 视图层 | ViewBase | 0（最早） |

| 逻辑层 | PanelBase | 1 |

| 控件层 | EventUIBase | 2（最晚） |

实现方式其实很朴素，就是在 `UIManager` 中维护一张优先级表：



```
private static readonly Dictionary<Type, int> InitOrder = new()
{
    { typeof(ViewBase), 0 },
    { typeof(PanelBase), 1 },
    { typeof(EventUIBase), 2 }
};

```

然后我们在执行反射 `Init()` 的时候，统一按照这个顺序来排序执行。

----------

### ✅ 完整升级版 UIManager.Init()

以下是改造之后的 `Init()` 方法：



```
private static void Init()
{
    Base[] allBases = Resources.FindObjectsOfTypeAll<Base>();

    var ordered = allBases.OrderBy(b => GetPriority(b.GetType()));

    foreach (var item in ordered)
    {
        if (!IsValid(item)) continue;

        var initMethod = item.GetType().GetMethod("Init", BindingFlags.Instance | BindingFlags.NonPublic);
        initMethod?.Invoke(item, null);
    }
}

private static int GetPriority(Type t)
{
    return InitOrder.TryGetValue(t, out var priority) ? priority : 3;
}

private static bool IsValid(Base b)
{
    return b != null &&
           b.gameObject != null &&
           b.gameObject.scene.IsValid() &&
           !b.hideFlags.HasFlag(HideFlags.NotEditable) &&
           !b.hideFlags.HasFlag(HideFlags.HideAndDontSave);
}

```

我们做了三件事：

1.  用 `InitOrder` 表定义优先级；
    
2.  用 `OrderBy()` 按优先级排序所有 `Base` 派生类；
    
3.  统一执行它们的 `Init` 方法，确保从 View → [Logic](https://so.csdn.net/so/search?q=Logic&spm=1001.2101.3001.7020) → UI 控件。
    

从此以后，哪怕你在场景中放置顺序错乱、激活状态不同，甚至 prefab 嵌套得再复杂，也不会再出现初始化找不到引用的问题了。

----------

#### ✅ 总结

-   自动化不是全部，**顺序才是稳定性的关键**；
    
-   引入 `InitOrder`，确保初始化流程可靠、可控；
    
-   框架启动再复杂，也能保证每个引用都正确可用。
    

----------

#### 🔜 下一节预告

现在，我们已经能手动创建 View 和 Panel，并稳定完成注册和调用。但很快你就会觉得——

> “每次都复制粘贴模板代码、改类名、查拼写，好烦啊……”

是的，框架再好用，流程再优雅，如果创建脚本还得手写，那开发者的尊严就无处安放。

下一节，我们就来编写一个**编辑器工具**：一键生成符合框架规范的 View 与 Panel 脚本，让你输入类名和作者名，其他交给代码来完成！

真正做到：

🧠 脑子想好 → ⌨️ 输入类名 → ✅ 自动生成 → 🧱 开始开发

敬请期待——第九节：**脚本模板自动生成器**。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** 技术文档
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*