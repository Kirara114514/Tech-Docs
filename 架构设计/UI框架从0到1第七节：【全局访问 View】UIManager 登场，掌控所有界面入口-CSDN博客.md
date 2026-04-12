# UI框架从0到1第七节：【全局访问 View】UIManager 登场，掌控所有界面入口-CSDN博客

## 摘要
 在上一节中，我们设计了 `ViewBase` 脚本，并初步实现了类 MVVM 风格的数据派发机制，真正做到了“UI 控件通过设置状态值，就能驱动逻辑执行”。乍一看框架已经初具雏形，但很快就有细心的小伙伴意识到了一个问题： > 我们的 `HelloWorldView` 是 `HelloWorldPanel` 对应的 `ViewBase` 派生类，那我们该怎么获取它的引用呢？ 一个最直接的思路...

## 正文


在上一节中，我们设计了 `ViewBase` 脚本，并初步实现了类 MVVM 风格的数据派发机制，真正做到了“UI 控件通过设置状态值，就能驱动逻辑执行”。乍一看框架已经初具雏形，但很快就有细心的小伙伴意识到了一个问题：

> 我们的 `HelloWorldView` 是 `HelloWorldPanel` 对应的 `ViewBase` 派生类，那我们该怎么获取它的引用呢？

一个最直接的思路是——用 `GetComponent<HelloWorldView>()`，但这正是我们要避免的老路。前面我们反复强调“**所有引用必须可溯源**”，而 `GetComponent` 显然不符合这个原则，它带来的是动态查找、隐式依赖、调试困难。那我们该怎么做？

答案很简单：

我们要做的是，引入一个全局静态类 —— **UIManager**，负责集中注册和管理所有的 `ViewBase` 派生类对象。通过这个管理器，我们可以：



```
UIManager.GetPanelView<HelloWorldView>().IsShow = true;

```

一行代码，类型安全，全局唯一，不用手动拖引用，也不用动态查找。

----------

### ✅ 第一步：ViewBase 自动注册到 UIManager

我们在 `ViewBase` 的 `Init()` 方法中加入这一句：



```
UIManager.AddPanelView(this.GetType(), this);

```

每一个挂载了 `ViewBase` 派生类的对象都会在初始化时自动将自己注册进 `UIManager` 的字典中，类型就是 key，实例就是 value。

----------

### ✅ 第二步：UIManager 实现注册与获取逻辑

我们来实现 `UIManager` 脚本的基本功能。核心职责只有两点：

-   **注册**：某个 `ViewBase` 派生类在初始化时注册进来
    
-   **获取**：通过泛型方法获取已注册的实例
    



```
public static class UIManager
{
    private static readonly Dictionary<Type, ViewBase> panelViews = new();

    public static void AddPanelView(Type viewType, ViewBase view)
    {
        if (panelViews.ContainsKey(viewType))
            panelViews[viewType] = view;
        else
            panelViews.Add(viewType, view);
    }

    public static T GetPanelView<T>() where T : ViewBase
    {
        Type key = typeof(T);
        if (panelViews.TryGetValue(key, out var view))
            return view as T;

        Debug.LogError($"未找到面板类型：{key}");
        return null;
    }
}

```

----------

### ✅ 第三步：自动执行所有 Init()

既然我们在 `ViewBase` 的 `Init()` 方法里注册，那问题就来了：

> Unity 默认不会调用我们写的 `Init()` 方法，我们得自己手动执行，怎么办？

这时候，就轮到 `UIManager` 出场了。我们可以在 `UIManager` 中统一调用所有 `Base` 派生类的 `Init()` 方法，实现一次性、自动化、稳定的初始化流程。



```
static UIManager()
{
    Init();
}

private static void Init()
{
    Base[] allBases = Resources.FindObjectsOfTypeAll<Base>();

    foreach (var item in allBases)
    {
        if (item == null || item.gameObject == null) continue;
        if (!item.gameObject.scene.IsValid()) continue;
        if (item.hideFlags.HasFlag(HideFlags.NotEditable) || item.hideFlags.HasFlag(HideFlags.HideAndDontSave)) continue;

        var initMethod = item.GetType().GetMethod("Init", BindingFlags.Instance | BindingFlags.NonPublic);
        initMethod?.Invoke(item, null);
    }
}

```

这个 `Init()` 做了几件事：

-   找到所有继承自 `Base` 的组件
    
-   过滤掉无效、隐藏、资源文件中的对象
    
-   通过反射执行它们的 `Init()` 方法（哪怕是 `private`）
    

最妙的是：我们把它放在了 `UIManager` 的**静态构造函数**中。这意味着，只要你在任何地方首次调用 `UIManager.GetPanelView<T>()`，框架就会立刻自动初始化，再也不需要手动管理。

----------

#### ✅ 总结

-   我们引入了 **UIManager**，全局统一管理所有 `ViewBase` 实例。
    
-   `ViewBase` **自动注册**，`UIManager` 提供**泛型获取**。
    
-   框架初始化通过**静态构造** + **反射 Init**，全自动无感知。
    

----------

#### 🔜 下一节预告

虽然我们已经实现了自动注册和泛型获取，但还是埋下了一个隐患：如果控件（`EventUIBase`）在 `ViewBase` 尚未初始化时就执行了自己的 `Init`，那就会导致找不到父级 `View`，注册失败。

这就意味着：**Init 的执行顺序**必须严格控制！我们需要构建一套可控的“初始化优先级系统”，让框架自动以 **View > Panel > 控件** 的顺序初始化，确保所有引用都能被正确建立。

下一节，我们就来解决这个至关重要的问题：**UI 初始化优先级机制**。



## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** 技术文档
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*