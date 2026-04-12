# 动态编程入门第一节：C#反射 - Unity 开发者的超级工具箱

## 摘要
 你是否曾好奇，在 Unity 引擎中，某些强大的功能是如何在运行时动态地获取组件、调用方法或创建对象的？比如，我们常说的“**序列化/反序列化**”是怎么工作的？或者，某些编辑器工具是如何读取你的代码结构的？答案很可能藏在一个叫做 **C# 反射 (Reflection)** 的强大特性里。 反射就像一个代码的“透视眼”，它允许程序在运行时检查自身，动态地获取类型信息、构造函数、方法、属性...

## 正文


你是否曾好奇，在 Unity 引擎中，某些强大的功能是如何在运行时动态地获取组件、调用方法或创建对象的？比如，我们常说的“**序列化/反序列化**”是怎么工作的？或者，某些编辑器工具是如何读取你的代码结构的？答案很可能藏在一个叫做 **C# 反射 (Reflection)** 的强大特性里。

反射就像一个代码的“透视眼”，它允许程序在运行时检查自身，动态地获取类型信息、构造函数、方法、属性、字段等，甚至还能在运行时动态地调用方法和创建对象。听起来是不是很酷？今天，我们就来揭开反射的神秘面纱，看看它在 Unity 开发中能发挥怎样的作用。

----------

### 什么是反射？为什么我们需要它？

简单来说，**反射就是程序在运行时检查其自身结构和行为的能力。** 平时我们写代码，都是在编译时确定好类型、方法调用等。但有时候，我们希望程序能更灵活，比如：

-   **动态加载和执行代码：** 我想写一个插件系统，允许用户上传新的脚本，并在我的游戏里运行它。
    
-   **通用工具或框架：** 我想写一个通用的数据解析器，它不需要提前知道数据结构，就能自动把数据填充到任何对象里。
    
-   **运行时行为修改：** 我想在运行时，根据某些条件，动态地调用一个方法，而不是在代码里写死。
    
-   **游戏编辑器扩展：** Unity 的 Inspector 窗口是怎么显示你的公共字段和属性的？正是通过反射来获取这些信息。
    

在这些场景下，传统的编译时绑定就显得力不从心了，而反射则能轻松应对。

----------

### C# 反射的常用 API

C# 反射的核心都在 `System.Reflection` 命名空间下。下面我们介绍一些最常用的类和方法：

#### 1. `Type` 类：类型信息的总入口

`Type` 是反射的中心。它代表了一个类型（如类、接口、枚举、结构体等）的声明。你可以通过以下几种方式获取 `Type` 对象：

-   **`typeof()` 操作符：** 最常用、性能最好的方式，用于编译时已知类型。
    
    
    
    ```
    using System;
    using UnityEngine;
    
    public class MyClass : MonoBehaviour
    {
        public int myInt;
        public void MyMethod() { }
    
        void Start()
        {
            // 获取 MyClass 的 Type 对象
            Type myClassType = typeof(MyClass);
            Debug.Log("类型名称：" + myClassType.Name); // 输出：MyClass
            Debug.Log("完整名称：" + myClassType.FullName); // 输出：MyClass
        }
    }
    
    ```
    
-   **`GetType()` 方法：** 用于运行时获取对象的实际类型。
    
    
    
    ```
    MyClass instance = new MyClass();
    Type instanceType = instance.GetType();
    Debug.Log("实例类型名称：" + instanceType.Name); // 输出：MyClass
    
    ```
    
-   **`Type.GetType(string typeName)`：** 根据类型的完整名称字符串获取 `Type` 对象。这在动态加载类型时非常有用。
    
    
    
    ```
    // 需要完整的命名空间和程序集名称 (如果类型不在当前程序集)
    Type myClassTypeFromString = Type.GetType("MyClass"); // 如果 MyClass 在当前程序集
    // 如果 MyClass 在某个特定的DLL中，可能需要 "MyNamespace.MyClass, MyAssembly"
    Debug.Log("通过字符串获取类型：" + (myClassTypeFromString != null ? myClassTypeFromString.Name : "未找到"));
    
    ```
    

有了 `Type` 对象，你就能获取该类型的所有信息：



```
using System;
using System.Reflection; // 别忘了引入这个命名空间
using UnityEngine;

public class ReflectionExample : MonoBehaviour
{
    public int publicField = 10;
    private string privateField = "Hello";

    public void PublicMethod(string message)
    {
        Debug.Log("PublicMethod called: " + message);
    }

    private int PrivateMethod(int value)
    {
        return value * 2;
    }

    void Start()
    {
        Type thisType = typeof(ReflectionExample);

        // 获取公共字段
        FieldInfo publicFieldInfo = thisType.GetField("publicField");
        if (publicFieldInfo != null)
        {
            Debug.Log($"字段名称: {publicFieldInfo.Name}, 值: {publicFieldInfo.GetValue(this)}");
        }

        // 获取私有字段 (需要指定 BindingFlags)
        FieldInfo privateFieldInfo = thisType.GetField("privateField", BindingFlags.Instance | BindingFlags.NonPublic);
        if (privateFieldInfo != null)
        {
            Debug.Log($"私有字段名称: {privateFieldInfo.Name}, 值: {privateFieldInfo.GetValue(this)}");
        }

        // 获取公共方法
        MethodInfo publicMethodInfo = thisType.GetMethod("PublicMethod");
        if (publicMethodInfo != null)
        {
            // 动态调用公共方法
            publicMethodInfo.Invoke(this, new object[] { "来自反射的调用！" });
        }

        // 获取私有方法 (需要指定 BindingFlags)
        MethodInfo privateMethodInfo = thisType.GetMethod("PrivateMethod", BindingFlags.Instance | BindingFlags.NonPublic);
        if (privateMethodInfo != null)
        {
            // 动态调用私有方法
            object result = privateMethodInfo.Invoke(this, new object[] { 5 });
            Debug.Log($"私有方法调用结果: {result}");
        }

        // 获取所有公共方法
        MethodInfo[] methods = thisType.GetMethods(BindingFlags.Public | BindingFlags.Instance);
        foreach (MethodInfo method in methods)
        {
            Debug.Log($"找到公共方法: {method.Name}");
        }
    }
}

```

-   **`BindingFlags` 枚举：** 这是反射中非常重要的一个枚举，用于过滤你想要获取的成员（字段、属性、方法等）。它允许你指定是获取公共的、私有的、静态的、实例的等等。
    
    -   `BindingFlags.Instance`: 实例成员 (非静态)
        
    -   `BindingFlags.Static`: 静态成员
        
    -   `BindingFlags.Public`: 公共成员
        
    -   `BindingFlags.NonPublic`: 非公共成员 (包括 private, protected, internal)
        
    -   `BindingFlags.DeclaredOnly`: 只获取当前类型声明的成员，不包括继承的。
        

#### 2. `MethodInfo`：方法信息

`MethodInfo` 代表了一个方法的声明。你可以用它来：

-   **`Invoke(object obj, object[] parameters)`：** 在指定的对象实例上调用该方法，并传入参数。如果方法是静态的，`obj` 可以是 `null`。
    

#### 3. `FieldInfo`：字段信息

`FieldInfo` 代表了一个字段的声明。你可以用它来：

-   **`GetValue(object obj)`：** 获取指定对象实例上该字段的值。
    
-   **`SetValue(object obj, object value)`：** 设置指定对象实例上该字段的值。
    

#### 4. `PropertyInfo`：属性信息

`PropertyInfo` 代表了一个属性的声明。与字段类似，你可以用它来获取和设置属性的值。

-   **`GetValue(object obj)`**
    
-   **`SetValue(object obj, object value)`**
    

#### 5. `Activator` 类：动态创建实例

`Activator` 类提供了一种在运行时动态创建对象实例的方法，而不需要知道其构造函数。



```
using System;
using UnityEngine;

public class AnotherClass
{
    public string Message { get; set; }
    public AnotherClass() { Message = "Default Message"; }
    public AnotherClass(string msg) { Message = msg; }
}

public class ActivatorExample : MonoBehaviour
{
    void Start()
    {
        Type typeToCreate = typeof(AnotherClass);

        // 使用默认构造函数创建实例
        AnotherClass instance1 = Activator.CreateInstance(typeToCreate) as AnotherClass;
        Debug.Log("实例1消息：" + instance1.Message); // 输出：Default Message

        // 使用带参数的构造函数创建实例
        AnotherClass instance2 = Activator.CreateInstance(typeToCreate, "Custom Message") as AnotherClass;
        Debug.Log("实例2消息：" + instance2.Message); // 输出：Custom Message
    }
}

```

----------

### 反射的优缺点

了解了反射的用法，我们也需要知道它的两面性：

#### 优点：

1.  **动态性与灵活性：** 能够在运行时获取和操作类型信息，实现高度灵活的通用代码。
    
2.  **通用性：** 可以编写不依赖于特定类型的通用方法和工具，比如你的 `UIManager` 可以在运行时找到所有 `Base` 类型的脚本并调用 `Init` 方法，而无需在编译时硬编码。
    
3.  **扩展性：** 方便实现插件系统、依赖注入框架等。
    

#### 缺点：

1.  **性能开销：** 这是反射最主要的缺点。相比直接的代码调用，反射涉及到更多的运行时检查和查找，因此性能会显著降低。**每次使用 `GetMethod`、`Invoke` 等操作都会有开销。**
    
2.  **编译期检查缺失：** 反射调用是在运行时进行的，如果方法名、参数类型等不匹配，编译时不会报错，只会在运行时抛出异常。这增加了调试难度。
    
3.  **代码可读性降低：** 大量的反射代码可能使代码变得复杂，难以理解和维护。
    
4.  **混淆问题：** 如果代码被混淆，通过字符串获取类型或成员可能会失败。
    

----------

### 反射在 `UIManager` 脚本中的应用

现在我们来看看我的框架中的 `UIManager` 脚本中是如何巧妙地运用反射的：



```
// UIManager 脚本片段
private static void Init()
{
    Base[] allObjects = Resources.FindObjectsOfTypeAll<Base>();

    // ... 省略了过滤逻辑 ...

    foreach (var obj in sceneObjects)
    {
        var baseScripts = obj.GetComponents<Base>() // 获取 GameObject 上所有 Base 派生脚本
            .OrderBy(s => GetScriptOrderPriority(s.GetType())); // 根据类型获取优先级并排序

        foreach (var script in baseScripts)
        {
            // 获取脚本的类型
            Type scriptType = script.GetType();
            // 通过反射获取其 Init 方法，并准备调用
            // ... （这里的具体实现使用了表达式树，我们会在第三篇详细讲解其如何优化性能）
            // init(script); // 最终调用 Init 方法
        }
    }
}

private static void CacheInitDelegate(Type type)
{
    // 这里就是反射的核心应用之一：获取指定类型的 Init 方法
    var method = type.GetMethod("Init", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
    // ... （后续会通过表达式树将这个 MethodInfo 编译成一个高效的委托）
}

```

在我的 `Init` 方法中，我利用了反射的以下能力：

1.  **`Resources.FindObjectsOfTypeAll<Base>()`：** 查找场景中所有继承自 `Base` 的组件。虽然这个方法本身不是反射 API，但它能找到运行时存在的对象，为后续的反射操作提供了基础。
    
2.  **`obj.GetComponents<Base>()`：** 获取某个 `GameObject` 上挂载的所有 `Base` 派生组件。
    
3.  **`script.GetType()`：** 获取每一个 `Base` 派生脚本的运行时类型。
    
4.  **`type.GetMethod("Init", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)`：** 这是关键！我们通过反射获取了这些运行时脚本中名为 "Init" 的方法（无论是公共还是私有，实例方法），从而能够统一调用它们的初始化逻辑。
    

正是因为有了反射，我的 `UIManager` 才能在不需要预先知道所有 `ViewBaseUI`、`LogicBaseUI` 等具体类型的情况下，动态地发现并初始化它们，这大大提高了 UI 系统的可扩展性和维护性。

----------

### 总结

C# 反射是一个强大的工具，它赋予了程序在运行时检查和操作自身的能力，为实现动态、通用的功能提供了可能。在 Unity 开发中，它在编辑器工具、框架设计和某些特定需求场景下发挥着不可替代的作用。

然而，我们也要牢记反射的缺点，特别是其**性能开销**。因此，在实际项目中，我们应该**谨慎使用反射，并尽可能在性能敏感的地方避免或优化它**。

在下一篇教程中，我们将探讨**委托 (Delegate)** 和**事件 (Event)** 的高级用法，为我们最终理解更深层次的性能优化（表达式树）打下基础。敬请期待！


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity, c#
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*