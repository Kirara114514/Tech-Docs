# UI框架从0到1第九节：【脚本模板生成】怎么用代码生成代码？_unity,0到1ui框架设计-CSDN博客

## 摘要
 经过前面几节的学习，我们已经可以手动创建一套完整的 UI 面板结构，例如： -  创建一个继承自 `ViewBase` 的 `HelloWorldView`   -  创建一个继承自 `PanelBase` 的 `HelloWorldPanel`   -  将它们挂载到 Canvas 下的 UI 对象上，实现事件响应与状态绑定    听起来没毛病，但写到第三个页面你就会发现：**这活儿太机...

## 正文


经过前面几节的学习，我们已经可以手动创建一套完整的 UI 面板结构，例如：

-   创建一个继承自 `ViewBase` 的 `HelloWorldView`
    
-   创建一个继承自 `PanelBase` 的 `HelloWorldPanel`
    
-   将它们挂载到 Canvas 下的 UI 对象上，实现事件响应与状态绑定
    

听起来没毛病，但写到第三个页面你就会发现：**这活儿太机械、太重复了！**

每次都要：

1.  手动复制旧文件
    
2.  改类名、改文件名、改注释
    
3.  忘了改地方编译还报错
    
4.  写着写着忘了有没有加 `IsShow`、有没有继承 `PanelBase`
    

**这不就是开发者的尊严之殇吗？**

所以这一节我们要做的就是：**写一个编辑器工具，一键生成符合规范的 UI 脚本模板，只需输入类名和作者名，其它交给工具代劳！**

----------

### 一、原理说明：为什么能用“代码生成代码”？

有小伙伴可能会疑惑：“我们不是在写代码吗？怎么还能写代码来写代码？”

其实这里的“生成代码”指的是：

-   **我们先写好一份代码模板（普通的 `.txt` 文件）**
    
-   **再用 C# 脚本读取这个模板，替换里面的占位符**
    
-   **最后把替换好的文本写入 `.cs` 文件保存到目标路径**
    

换句话说，我们并不是生成语法树或动态编译，而是“**批量定制模板文本**”——这个是 Unity编辑器扩展最擅长的活儿。

----------

### 二、准备模板文件（教学版）

我们首先准备两份标准模板，分别是：

-   `TemplatePanelView.txt`（视图层脚本）
    
-   `TemplatePanelLogic.txt`（逻辑层脚本）
    

它们都放在固定路径下：

```
Assets/UIFrameWork/TemplateScripts/

```

#### 📝 TemplatePanelView.txt



```
using UnityEngine;

public class TemplatePanelView : ViewBase
{
    private int templateValue;

    public int TemplateValue
    {
        get => templateValue;
        set => SetProperty(ref templateValue, value, "TemplateValue");
    }
}

```

#### 📝 TemplatePanelLogic.txt



```
using UnityEngine;

public class TemplatePanelLogic : PanelBase
{
    protected override void Init()
    {
        base.Init();
    }

    public override void ProcessEvent(string eventName, Base sender, IEventContext context = null)
    {
        base.ProcessEvent(eventName, sender, context);

        Dispatch(eventName, "OnClick", () =>
        {
            switch (sender.name)
            {
                case "按钮1":
                    Debug.Log("点击了按钮1");
                    break;
            }
        });

        Dispatch<bool>(eventName, "OnToggleValueChanged", context, (oldVal, newVal) =>
        {
            switch (sender.name)
            {
                case "切换开关":
                    Debug.Log($"切换开关状态变为: {newVal}");
                    break;
            }
        });

        Dispatch<bool>(eventName, "IsShow", context, (oldVal, newVal) =>
        {
            if (newVal)
                Debug.Log("显示面板");
            else
                Debug.Log("隐藏面板");
        });
    }
}

```

----------

### 三、创建编辑器窗口（KiraEditorExtensionUI）

我们接下来创建一个编辑器扩展脚本，放入路径：

```
Assets/UIFrameWork/Editor/KiraEditorExtensionUI.cs

```

这个窗口允许你填写：

-   作者名（会替换模板里的 `AuthorName`）
    
-   类名（自动拼接为 `xxxPanelView.cs` 和 `xxxPanelLogic.cs`）
    

#### 📜 KiraEditorExtensionUI.cs



```
using UnityEditor;
using UnityEngine;
using System;
using System.IO;
using System.Linq; // Add this using directive for LINQ methods like ToLower()

public class KiraEditorExtensionUI : EditorWindow
{
    private string authorName = string.Empty;
    private string className = string.Empty;
    private string message = string.Empty;
    private Color messageColor = Color.green;
    private bool classNameExists = false;
    private string lastCheckedClassName = string.Empty;

    [MenuItem("FrameWorkTools!/创建UI模板脚本")]
    public static void ShowWindow()
    {
        GetWindow<KiraEditorExtensionUI>("创建UI模板脚本");
    }

    private void OnGUI()
    {
        GUILayout.Label("请输入作者名字", EditorStyles.boldLabel);
        authorName = EditorGUILayout.TextField(authorName);

        GUILayout.Space(10);

        GUILayout.Label("请输入类名（不含后缀）", EditorStyles.boldLabel);
        className = CapitalizeFirstLetter(EditorGUILayout.TextField(className));

        GUILayout.Space(20);

        CheckInput();

        GUI.color = messageColor;
        GUILayout.Label(message);
        GUI.color = Color.white;

        GUILayout.Space(20);

        GUILayout.BeginHorizontal();
        if (GUILayout.Button("确定", GUILayout.Width(100)))
        {
            GUI.FocusControl(null);
            if (string.IsNullOrEmpty(authorName) || string.IsNullOrEmpty(className)) return;

            if (classNameExists)
            {
                Debug.LogError("类名已存在！");
                return;
            }

            CreateUIScripts();
            Close();
        }

        if (GUILayout.Button("取消", GUILayout.Width(100)))
        {
            Close();
        }
        GUILayout.EndHorizontal();
    }

    private void CheckInput()
    {
        if (!string.IsNullOrEmpty(className) && className != lastCheckedClassName)
        {
            classNameExists = DoesClassNameExist($"{className}PanelLogic") || DoesClassNameExist($"{className}PanelView");
            lastCheckedClassName = className;
        }

        if (string.IsNullOrEmpty(authorName) || string.IsNullOrEmpty(className))
        {
            message = "请输入有效的作者名和类名";
            messageColor = Color.red;
        }
        else if (classNameExists)
        {
            message = "类名已存在！";
            messageColor = Color.red;
        }
        else
        {
            message = "输入有效，点击确定生成脚本";
            messageColor = Color.green;
        }
    }

    private bool DoesClassNameExist(string fullClassName)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.GetType(fullClassName) != null)
                return true;
        }
        return false;
    }

    private void CreateUIScripts()
    {
        try
        {
            string folderPath = $"Assets/Scripts/{className}Panel/";
            string viewPath = $"{folderPath}{className}PanelView.cs";
            string logicPath = $"{folderPath}{className}PanelLogic.cs";

            string viewTemplate = ReadTemplate("Assets/UIFrameWork/TemplateScripts/TemplatePanelView.txt");
            string logicTemplate = ReadTemplate("Assets/UIFrameWork/TemplateScripts/TemplatePanelLogic.txt");

            string today = DateTime.Now.ToString("yyyy年MM月dd日");

            viewTemplate = ReplacePlaceholders(viewTemplate, today);
            logicTemplate = ReplacePlaceholders(logicTemplate, today);

            if (!Directory.Exists(folderPath))
                Directory.CreateDirectory(folderPath);

            File.WriteAllText(viewPath, viewTemplate);
            File.WriteAllText(logicPath, logicTemplate);

            AssetDatabase.Refresh();
            Debug.Log($"成功生成 UI 脚本：{viewPath} 和 {logicPath}");
        }
        catch (Exception ex)
        {
            Debug.LogError($"生成 UI 脚本时出错：{ex.Message}");
        }
    }

    private string ReadTemplate(string path)
    {
        if (!File.Exists(path))
        {
            Debug.LogError($"模板文件不存在：{path}");
            return string.Empty;
        }
        return File.ReadAllText(path);
    }

    private string ReplacePlaceholders(string template, string date)
    {
        return template
            .Replace("Template", className)
            .Replace("AuthorName", authorName)
            .Replace("x年x月x日", date);
    }

    private string CapitalizeFirstLetter(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        return input.Substring(0, 1).ToUpper() + input.Substring(1);
    }
}

```

----------

### 四、使用方式

1.  打开 Unity；
    
2.  点击菜单栏 → **FrameWorkTools! → 创建UI模板脚本**；
    
3.  在弹出的窗口中填写：
    
    -   类名（比如：`HelloWorld`）；
        
    -   作者名（比如：`Kira`）；
        
4.  点击「确定」，即可在 `Assets/Scripts/HelloWorldPanel/` 目录下生成：
    
    -   `HelloWorldPanelView.cs`
        
    -   `HelloWorldPanelLogic.cs`
        

----------

### 总结

从现在开始，再也不用为了每个页面手动创建 View 和 Logic 脚本了。只需填好信息，点个按钮，脚本就生成好了，命名规范、结构统一、注释清晰、还自动带事件派发模板，哪怕你新手入门也能快速写出业务逻辑。

下一节，我们将继续围绕实际开发痛点，解决另一个 UI 页面构建中非常常见但令人抓狂的问题：

> “怎么快速创建标准 Canvas + Panel 结构？”
> 
> “怎么从 View 脚本中直接获取控件？”

我们即将迎来 UI 框架的最后优化阶段，敬请期待！


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** unity
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*