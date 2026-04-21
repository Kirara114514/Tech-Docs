# C#表达式树与性能优化

## 摘要
我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。 然而，当我们需要在运行时执行更复杂的逻辑，或者动态构建更灵活的方法调用时，`Delegate.CreateDeleg

## 正文

### 背景
表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

### 核心内容
表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

然而，当我们需要在运行时执行更复杂的逻辑，或者动态构建更灵活的方法调用时，`Delegate.CreateDelegate()` 就不够用了。这时，我们需要更底层的“代码生成”工具——**表达式树 (Expression Trees)**！

表达式树就像是把你的 C# 代码语句，转换成了一种**数据结构**。你可以像操作普通数据一样，在运行时构建、修改这些代码结构，然后将它们**编译**成高性能的委托。这正是你的 `UIManager` 脚本中 `CacheInitDelegate` 方法能够高效初始化各种 `Base` 派生类脚本的奥秘！

----------

### 1. 为什么需要表达式树？

让我们再次回到性能问题。当你通过反射调用方法时，例如：

methodInfo.Invoke(instance, new object[] { param1, param2 });

每次调用 Invoke，运行时都需要做很多工作：

1.  查找 `methodInfo` 对应的实际方法。
    
2.  检查参数类型是否匹配，进行装箱/拆箱操作。
    
3.  执行方法体。
    

这个过程涉及大量的运行时开销。而**表达式树**提供了一种“一劳永逸”的解决方案：它允许你**在运行时动态地构建一个方法调用（或任何其他代码逻辑）的抽象语法树，然后将这个语法树一次性编译成一个可执行的委托。** 一旦编译完成，这个委托的性能几乎与直接编写的代码相同。

简单来说：

-   **反射 `Invoke`：** 每次调用都“解释”一次。
    
-   **表达式树：** 运行时“编写”并“编译”一次，然后可以高效地“运行”多次。
    

----------

### 2. 表达式树的核心概念

表达式树位于 `System.Linq.Expressions` 命名空间下。它由一系列 `Expression` 派生类的对象组成，每个对象代表了代码中的一个元素（如变量、常量、方法调用、属性访问、类型转换等）。

-   **`Expression`：** 所有表达式的基类。
    
-   **`ParameterExpression`：** 表示方法的参数或局部变量。
    
-   **`ConstantExpression`：** 表示常量值。
    
-   **`MethodCallExpression`：** 表示方法调用。
    
-   **`MemberExpression`：** 表示字段或属性访问。
    
-   **`NewExpression`：** 表示构造函数调用（创建新对象）。
    
-   **`UnaryExpression`：** 表示一元操作（如类型转换 `(T)`、取反 `!`）。
    
-   **`LambdaExpression`：** 表示一个 Lambda 表达式，也是将表达式树编译成委托的入口。它包含表达式的主体和参数。
    

----------

### 3. 构建与编译表达式树：一个动态初始化实例

为了更好地理解表达式树，我们暂时不直接使用你的框架中的 `UIManager` 来举例，而是创建一个类似的场景：假设我们有一个通用的“组件初始化器”，它需要在运行时找到所有实现了 `IInitializable` 接口的组件，并调用它们的 `Initialize()` 方法。我们希望这个调用是高性能的。

**首先，定义一个接口和一些示例组件：**

```
// 1. 定义一个初始化接口
public interface IInitializable
{
    void Initialize();
    void InitializeWithParam(string message);
}

// 2. 示例组件A
public class ComponentA : MonoBehaviour, IInitializable
{
    public void Initialize()
    {
        Debug.Log("ComponentA initialized!");
    }

    public void InitializeWithParam(string message)
    {
        Debug.Log($"ComponentA initialized with message: {message}");
    }
}

// 3. 示例组件B (可能是一个私有方法，反射和表达式树的优势)
public class ComponentB : MonoBehaviour, IInitializable
{
    private void Initialize() // 私有方法
    {
        Debug.Log("ComponentB initialized privately!");
    }

    public void InitializeWithParam(string message)
    {
        Debug.Log($"ComponentB initialized privately with message: {message}");
    }
}

```

**然后，我们来编写一个“组件初始化器”：**

```
using System;
using System.Collections.Generic;
using System.Linq.Expressions; // 别忘了引入这个命名空间
using System.Reflection;
using UnityEngine;

// 这是一个通用的组件初始化器
public static class ComponentInitializer
{
    // 缓存已编译的初始化委托，键是组件类型，值是 Action<IInitializable>
    private static readonly Dictionary<Type, Action<IInitializable>> cachedInitDelegates = new();
    private static readonly Dictionary<Type, Action<IInitializable, string>> cachedInitWithParamDelegates = new();

    /// <summary>
    /// 在运行时获取并缓存指定类型 IInitializable 组件的 Initialize 方法委托。
    /// </summary>
    /// <param name="componentType">要初始化的组件类型</param>
    public static Action<IInitializable> GetOrCompileInitializeDelegate(Type componentType)
    {
        if (cachedInitDelegates.TryGetValue(componentType, out var compiledDelegate))
        {
            return compiledDelegate;
        }

        // --- 核心：通过表达式树构建委托 ---

        // 1. 获取要调用的方法信息 (可能是私有的)
        MethodInfo methodInfo = componentType.GetMethod("Initialize", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (methodInfo == null)
        {
            Debug.LogError($"Type {componentType.Name} does not have an 'Initialize' method!");
            // 如果没有 Initialize 方法，缓存一个空操作委托
            cachedInitDelegates[componentType] = (instance) => { };
            return cachedInitDelegates[componentType];
        }

        // 2. 创建一个参数表达式，代表将要传入委托的实例 (例如，IInitializable instance)
        // 它的类型是 IInitializable，但运行时会传入具体的 ComponentA/B 实例
        ParameterExpression instanceParam = Expression.Parameter(typeof(IInitializable), "instance");

        // 3. 创建一个类型转换表达式：将 IInitializable 类型的 instance 转换为其具体类型 (componentType)
        // 这是因为 Initialize 方法是定义在具体类型上的，而不是 IInitializable 接口上
        UnaryExpression convertExpression = Expression.Convert(instanceParam, componentType);

        // 4. 创建一个方法调用表达式：调用转换后的实例的 Initialize 方法
        MethodCallExpression methodCall = Expression.Call(convertExpression, methodInfo);

        // 5. 将方法调用表达式封装成一个 Lambda 表达式，并指定它的参数
        // 最终编译成 Action<IInitializable> 委托
        LambdaExpression lambda = Expression.Lambda<Action<IInitializable>>(methodCall, instanceParam);

        // 6. 编译 Lambda 表达式成可执行的委托
        compiledDelegate = (Action<IInitializable>)lambda.Compile();

        // 7. 缓存编译好的委托
        cachedInitDelegates[componentType] = compiledDelegate;

        Debug.Log($"Compiled 'Initialize' delegate for type: {componentType.Name}");
        return compiledDelegate;
    }

    /// <summary>
    /// 额外示例：获取并缓存带参数的 InitializeWithParam 方法委托
    /// </summary>
    public static Action<IInitializable, string> GetOrCompileInitializeWithParamDelegate(Type componentType)
    {
        if (cachedInitWithParamDelegates.TryGetValue(componentType, out var compiledDelegate))
        {
            return compiledDelegate;
        }

        MethodInfo methodInfo = componentType.GetMethod("InitializeWithParam", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (methodInfo == null)
        {
            Debug.LogError($"Type {componentType.Name} does not have an 'InitializeWithParam' method!");
            cachedInitWithParamDelegates[componentType] = (instance, msg) => { };
            return cachedInitWithParamDelegates[componentType];
        }

        ParameterExpression instanceParam = Expression.Parameter(typeof(IInitializable), "instance");
        ParameterExpression messageParam = Expression.Parameter(typeof(string), "message"); // 新增一个参数表达式

        UnaryExpression convertExpression = Expression.Convert(instanceParam, componentType);
        // 方法调用表达式现在需要传入参数
        MethodCallExpression methodCall = Expression.Call(convertExpression, methodInfo, messageParam);

        // Lambda 表达式需要包含两个参数
        LambdaExpression lambda = Expression.Lambda<Action<IInitializable, string>>(methodCall, instanceParam, messageParam);

        compiledDelegate = (Action<IInitializable, string>)lambda.Compile();
        cachedInitWithParamDelegates[componentType] = compiledDelegate;

        Debug.Log($"Compiled 'InitializeWithParam' delegate for type: {componentType.Name}");
        return compiledDelegate;
    }
}

// 测试类
public class ExpressionTreeTest : MonoBehaviour
{
    void Start()
    {
        ComponentA compA = gameObject.AddComponent<ComponentA>();
        ComponentB compB = gameObject.AddComponent<ComponentB>();

        // 第一次调用会触发编译，后续调用直接使用缓存的委托
        Debug.Log("\n--- 调用 Initialize() ---");
        Action<IInitializable> initA = ComponentInitializer.GetOrCompileInitializeDelegate(typeof(ComponentA));
        initA(compA); // 高效调用

        Action<IInitializable> initB = ComponentInitializer.GetOrCompileInitializeDelegate(typeof(ComponentB));
        initB(compB); // 高效调用

        // 第二次调用，直接使用缓存的委托，不会再编译
        Debug.Log("\n--- 第二次调用 Initialize() ---");
        initA = ComponentInitializer.GetOrCompileInitializeDelegate(typeof(ComponentA)); // 从缓存获取
        initA(compA);
        initB = ComponentInitializer.GetOrCompileInitializeDelegate(typeof(ComponentB)); // 从缓存获取
        initB(compB);

        Debug.Log("\n--- 调用 InitializeWithParam() ---");
        Action<IInitializable, string> initParamA = ComponentInitializer.GetOrCompileInitializeWithParamDelegate(typeof(ComponentA));
        initParamA(compA, "Hello World from A!");

        Action<IInitializable, string> initParamB = ComponentInitializer.GetOrCompileInitializeWithParamDelegate(typeof(ComponentB));
        initParamB(compB, "Greetings from B!");
    }
}

```

**代码解析：**

1.  **`GetMethod()`：** 仍然使用反射来获取 `MethodInfo` 对象，这是我们构建表达式树的基础。
    
2.  **`ParameterExpression`：** `Expression.Parameter(typeof(IInitializable), "instance")` 创建了一个代表委托参数的表达式。这个参数将是我们要初始化组件的实例。
    
3.  **`UnaryExpression`：** `Expression.Convert(instanceParam, componentType)` 创建了一个类型转换表达式。因为 `instanceParam` 是 `IInitializable` 类型，而实际调用的方法（`Initialize`）可能在具体类型 `ComponentA` 或 `ComponentB` 上，所以需要这个转换。
    
4.  **`MethodCallExpression`：** `Expression.Call(convertExpression, methodInfo)` 创建了一个方法调用表达式。它指定了要调用的实例 (`convertExpression`) 和方法 (`methodInfo`)。
    
5.  **`LambdaExpression`：** `Expression.Lambda<Action<IInitializable>>(methodCall, instanceParam)` 是最关键的一步。它将方法调用表达式 (`methodCall`) 和其参数 (`instanceParam`) 封装成一个 `Lambda` 表达式。`<Action<IInitializable>>` 指定了最终编译成的委托类型。
    
6.  **`Compile()`：** `lambda.Compile()` 是魔法发生的地方！它将我们构建的表达式树编译成一个可以在运行时高效执行的 `Action<IInitializable>` 委托。这个编译过程是有一定开销的，但它只发生一次。
    
7.  **缓存：** `cachedInitDelegates` 字典用于缓存编译好的委托。这样，在后续的调用中，可以直接从缓存中获取并使用这个高性能委托，避免了重复编译的开销。
    

----------

### 4. 表达式树的优点与缺点

#### 优点：

1.  **运行时代码生成：** 能够在运行时动态构建和执行代码，极大地增强了程序的**灵活性**。
    
2.  **高性能：** 一旦编译为委托，其执行性能接近直接编写的代码，远超 `MethodInfo.Invoke()`。这对于需要频繁动态调用的场景至关重要。
    
3.  **类型安全：** 虽然在构建表达式树时是动态的，但最终编译成的委托是类型安全的，调用时会进行类型检查。
    
4.  **强大且灵活：** 可以构建比 `Delegate.CreateDelegate()` 更复杂的逻辑，包括条件语句、循环、属性赋值、对象创建等。
    

#### 缺点：

1.  **学习曲线陡峭：** 表达式树的概念和 API 相对复杂，理解和编写起来需要一定的时间和精力。
    
2.  **构建开销：** 第一次构建和编译表达式树时会有一定的性能开销。因此，它最适合于那些需要动态调用但后续会频繁调用的场景（比如初始化时可以构建和编译各基类的Init方法然后大量调用）。
    
3.  **调试困难：** 运行时生成的代码在调试时不如直接代码直观。
    

----------

### 5. 表达式树在 Unity 项目中的其他应用场景

除了通用初始化逻辑，表达式树在 Unity 开发中还有其他潜力：

-   **通用事件系统：** 构建一个能够根据字符串事件名动态绑定不同事件处理器的方法，性能优于 `SendMessage`。
    
-   **配置解析器/ORM：** 如果你需要从 JSON/XML 等文件动态映射数据到 C# 对象，表达式树可以用来动态生成属性赋值器，提高数据绑定性能。
    
-   **动态查询：** 某些高级的数据查询框架（如 LINQ to SQL）内部使用表达式树来构建和优化查询。
    
-   **反射性能优化工具：** 开发自己的工具来替代 `MonoBehaviour.SendMessage` 或优化其他需要频繁反射的场景。
    

----------

我们的 `UIManager` 脚本正是巧妙地利用了表达式树这一特性，实现了各种 `Base` 派生类组件的自动且高效的初始化。

至此，我们的三篇教程：《C# 反射》、《委托与事件的用法》以及《表达式树与运行时性能优化》就全部讲解完毕了。希望通过这一系列技巧分享，你能对这些核心概念有更深入的理解，并能将它们运用到你未来的 Unity 项目中！

### 总结\n本文深入探讨了表达式树技术在动态编程和性能优化中的应用。通过分析表达式树的构建、编译和执行过程，展示了如何在运行时生成高性能的委托代码。文章重点介绍了在反射替代、动态查询构建和AOT编译环境中的优化场景，提供了具体的性能对比数据。本文帮助开发者掌握这一高级技术，在需要极致性能的场景中实现反射的替代方案。

- **创建时间：** 2026-04-12 23:47
- **最后更新：** 2026-04-12 23:47
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** 编程范式, 设计模式, 软件开发
- **来源：** StackEdit导出文档

---
*文档基于与吉良吉影的讨论，由小雅整理*

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

然而，当我们需要在运行时执行更复杂的逻辑，或者动态构建更灵活的方法调用时，`Delegate.CreateDelegate()` 就不够用了。这时，我们需要更底层的“代码生成”工具——**表达式树 (Expression Trees)**！

表达式树就像是把你的 C# 代码语句，转换成了一种**数据结构**。你可以像操作普通数据一样，在运行时构建、修改这些代码结构，然后将它们**编译**成高性能的委托。这正是你的 `UIManager` 脚本中 `CacheInitDelegate` 方法能够高效初始化各种 `Base` 派生类脚本的奥秘！

--- *文档基于与吉良吉影的讨论，由小雅整理*

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

--- *文档基于与吉良吉影的讨论，由小雅整理*

### 实现方案
表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

表达式树是C#中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在Unity中的性能优化应用，帮助开发者释放极致性能潜力。

我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了一种更高效的替代方案。

### 总结
--- *文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-20 21:05
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** C#与响应式编程、C#表达式树与性能优化、C#、性能优化
- **来源：** 已有文稿整理

---
*文档基于既有内容整理并统一为正式文档模板*
