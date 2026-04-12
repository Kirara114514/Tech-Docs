# UI框架从0到1第四节：【页面逻辑拆分】让每一个面板都拥有自己的灵魂-CSDN博客

## 摘要
好的，这是优化缩进和格式后的文章内容： 上一节我们成功实现了编辑器扩展工具 `FrameWorkTools`，可以一键为所有 UI 控件自动挂载对应的 `xxxCustom` 脚本。 这标志着我们的UI 框架开始具备自动化的“控件感知”能力。但紧接着，一个新的问题摆在我们面前： > ❓ 我们目前只有一个 `PanelBase` 类，难道所有页面逻辑都要堆在一起？ 当然不行。 --------...

## 正文

好的，这是优化缩进和格式后的文章内容：

上一节我们成功实现了编辑器扩展工具 `FrameWorkTools`，可以一键为所有 UI 控件自动挂载对应的 `xxxCustom` 脚本。

这标志着我们的UI 框架开始具备自动化的“控件感知”能力。但紧接着，一个新的问题摆在我们面前：

> ❓ 我们目前只有一个 `PanelBase` 类，难道所有页面逻辑都要堆在一起？

当然不行。

----------

### 🎯 正确思路：每个页面一个子类

我们应该将 `PanelBase` 当作页面的基础框架，然后为每个具体的 UI 页面创建对应的派生类，比如 `HelloWorldPanel`、`SettingsPanel`、`InventoryPanel` 等。

每个页面只需要重写 `ProcessEvent()` 方法，就能拥有属于自己的业务逻辑。

----------

### ✍️ 示例：定义 PanelBase 与 HelloWorldPanel



```
using UnityEngine;

public class PanelBase : MonoBehaviour
{
    public virtual void ProcessEvent<T>(T eventUI) where T : EventUIBase
    {
        Debug.Log($"{eventUI.name} 发来事件");
        switch (eventUI.name)
        {
            case "开始游戏":
                Debug.Log("开始游戏");
                break;
            case "退出游戏":
                Debug.Log("退出游戏");
                break;
            default:
                Debug.LogWarning("未知 UI 事件！");
                break;
        }
    }
}

```



```
using UnityEngine;

public class HelloWorldPanel : PanelBase
{
    public override void ProcessEvent<T>(T eventUI)
    {
        base.ProcessEvent(eventUI);
        switch (eventUI.name)
        {
            case "按钮1":
                Debug.Log("HelloWorldPanel 处理了按钮1");
                break;
            default:
                Debug.LogWarning($"HelloWorldPanel 未处理的控件：{eventUI.name}");
                break;
        }
    }
}

```

### 🧠 当前处理方式的局限性

虽然我们现在实现了“逻辑分离”，每个面板可以有自己的事件逻辑处理类，但你可能已经感受到不太对劲的地方了：

#### ❌ 只靠 `eventUI.name` 存在几个问题：

1.  无法区分控件类型
    
    是 Button 触发的？还是 Toggle？还是 TMP_InputField？
    
2.  无法拿到控件的值
    
    比如你想知道 Toggle 的当前勾选状态，只靠 eventUI.name 根本无法判断。
    
3.  控件重名会冲突
    
    多个页面中有同名控件（比如都叫“确认”），就可能误处理事件或无法识别。
    

这些问题如果不解决，框架将难以扩展到中大型项目。

----------

### 🔍 小结：本节达成的阶段性目标

目标

是否完成

为不同页面创建独立逻辑类

✅ 已实现

支持页面继承统一接口进行事件响应

✅ 已实现

每个页面只负责自己的业务

✅ 已实现

事件信息足够丰富？类型可识别？值可获取？

❌ 还未解决

### 🔜 展望下一节：构建事件上下文体系

在下一节中，我们将进一步重构事件派发机制：

-   为控件事件引入**事件上下文对象（EventContext）**
    
-   使用泛型封装**控件值的变更信息**
    
-   引入统一的 `Dispatch()` 方法进行**事件路由 + 类型匹配**
    

通过这些手段，我们将相对摆脱对 `eventUI.name` 的硬编码依赖，让事件处理更安全、可扩展、类型友好。




## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** 技术文档
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*