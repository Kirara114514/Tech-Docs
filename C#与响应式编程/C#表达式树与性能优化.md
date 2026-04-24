# C#表达式树与性能优化

## 摘要
表达式树是 C# 中实现动态代码生成和性能优化的高级技术，允许开发者在运行时构建和编译代码。本文介绍表达式树的原理、构建方法和在 Unity 中的性能优化应用，帮助开发者在享受动态编程灵活性的同时，达到接近手写代码的运行性能。

## 正文

### 背景
我们前面已经探讨了 **C# 反射** 的强大之处，以及 **委托** 和 **事件** 如何构建灵活的回调机制。我们还看到了 `MethodInfo.Invoke()` 在性能上的不足，以及 `Delegate.CreateDelegate()` 如何提供了更高效的替代方案。然而，当我们需要在运行时执行更复杂的逻辑，或者动态构建更灵活的方法调用时，就需要一个更强大的工具——**表达式树（Expression Tree）**。

表达式树允许你在运行时以代码形式表示逻辑结构，然后将其编译为可执行的委托。这在需要根据配置动态执行不同规则、序列化方法调用、或绕过访问限制的场景中非常有用。

### 1. 什么是表达式树？

表达式树不是可执行代码，而是代码的**数据结构化表示**。它将 C# 代码（如 `a + b`、`x => x.Name`）转化为一棵由 `Expression` 节点构成的树形结构，每个节点代表一个操作（加法、属性访问、方法调用等）。

```csharp
// 表达式树定义：a + b
ParameterExpression paramA = Expression.Parameter(typeof(int), "a");
ParameterExpression paramB = Expression.Parameter(typeof(int), "b");
BinaryExpression body = Expression.Add(paramA, paramB);

// 编译为委托
Expression<Func<int, int, int>> lambdaExpr = Expression.Lambda<Func<int, int, int>>(body, paramA, paramB);
Func<int, int, int> compiled = lambdaExpr.Compile();

Console.WriteLine(compiled(3, 5)); // 输出: 8
```

表达式树位于 `System.Linq.Expressions` 命名空间，是 LINQ to SQL、Entity Framework 等 ORM 框架实现查询翻译的底层基础设施，也是很多高级序列化和代码生成工具的核心。

### 2. 构建基础表达式

```csharp
// 常量: 42
ConstantExpression constExpr = Expression.Constant(42);

// 变量参数: x
ParameterExpression paramExpr = Expression.Parameter(typeof(int), "x");

// 属性访问: obj.Name
MemberExpression memberExpr = Expression.Property(paramExpr, "Name");

// 方法调用: obj.ToString()
MethodCallExpression callExpr = Expression.Call(paramExpr, typeof(object).GetMethod("ToString"));

// 条件: a > b ? a : b
ConditionalExpression condExpr = Expression.Condition(
    Expression.GreaterThan(paramA, paramB),
    paramA,
    paramB
);
```

表达式树的关键是每个节点类型明确，组合起来构成完整的运算逻辑。

### 3. 编译与调用

```csharp
// 构建: x => x.Length > 5
ParameterExpression strParam = Expression.Parameter(typeof(string), "x");
MemberExpression lengthProp = Expression.Property(strParam, "Length");
BinaryExpression greaterThan = Expression.GreaterThan(lengthProp, Expression.Constant(5));
Expression<Func<string, bool>> lambda = Expression.Lambda<Func<string, bool>>(greaterThan, strParam);

// 编译为委托
Func<string, bool> compiled = lambda.Compile();
Console.WriteLine(compiled("Hello World")); // true
Console.WriteLine(compiled("Hi"));          // false
```

`Compile()` 方法将表达式树转化为 IL 指令，生成的委托性能接近手动编写的代码。**缓存的委托与手写代码的性能差距通常在 5% 以内**，非常适合热路径中使用。

### 4. 表达式树 vs 反射 vs 委托创建

| 方式 | 性能（调用1M次） | 灵活性 | 适用场景 |
|:---|:---|:---|:---|
| 直接调用 | 极快 | 编译期固定 | 绝大多数场景 |
| 表达式树 (编译后) | ≈直接调用的95% | 运行时动态构建 | 动态规则、序列化 |
| Delegate.CreateDelegate | 极快 | 仅限方法签名匹配 | 已知签名的方法调用 |
| MethodInfo.Invoke | 慢 | 完全灵活 | 低频调用 |

表达式树在保持极高性能的同时，提供了最大程度的运行时灵活性。

### 工程化深化：表达式树在 Unity 中的实用策略

#### 1. 表达式树的核心竞争力是动态构建 + 编译期性能
表达式树不同于反射的地方在于：反射的调用链（类型查找、方法解析、参数装箱、安全检查）每次调用都要走一遍；表达式树只需编译一次，编译后的委托可以缓存，后续调用的成本就是一次间接函数调用。在 Unity 中，对频率低于每帧一次的调用，甚至可以用 `MethodInfo.Invoke`；但对帧循环中的多态调用、序列化还原、富文本解析，表达式树的缓存优势就非常明显。

#### 2. 性能瓶颈主要来自 Compile，而不是执行
`Expression<T>.Compile()` 会触发 JIT（或 IL2CPP 的 AOT 编译路径），首次编译的开销是百微秒到毫秒级别。这决定了表达式树的范式是“一次编译，多次调用”。如果每次调用都重新构建并编译，性能反而比直接反射更差。实践中需要为表达式树建立缓存层。

#### 3. 缓存策略决定了表达式树的实用价值
缓存应命中表达式结构而非参数值：`(x, y) => x + y` 是结构，`(x, y) => x + 5` 是带常量的结构。推荐用表达式结构指纹作为缓存键：操作符类型、参数类型和数量、成员路径。可考虑编译期表达式（静态字段存储）、按类型缓存（`Dictionary<Type, Func<>>`）、LRU 缓存。

#### 4. 表达式树最适合数据绑定/序列化/配置驱动的逻辑
典型场景包括：UI 数据绑定（将配置路径映射到属性访问）、配置化战斗公式（从文本解析为表达式树并编译）、动态过滤与排序、序列化中属性赋值（`SetValue` 替代反射）、运行时生成 getter/setter。

#### 5. IL2CPP 对表达式树有严格限制
这是 Unity 开发中最容易踩的坑。IL2CPP 不支持 `Expression.Compile()` 生成新的 IL，因为它没有 JIT 运行时。解决方案包括：**AOT 提前编译**（用 `Func<>` 静态字段 + 初始化时构建）；**解释执行**（用 `ExpressionVisitor` 遍历树，逐节点求值，性能差但跨平台）；**混合策略**（Editor/开发构建用 Compile，Release IL2CPP 用解释）。

#### 6. 表达式树不是序列化/配置规则的唯一选择
对于纯数据驱动的规则（数值、公式、条件），可以考虑 Lua、ScriptableObject 配置表、自定义 DSL、代码生成或简单的策略模式。表达式树更适合已经确定走 C# 动态路径的场景。

#### 7. 表达式树框架应有良好的可观测性
应暴露统计信息：表达式数量、编译耗时、缓存命中率、解释执行比例、失败规则列表。没有统计和诊断，表达式树框架很容易变成"能跑但没人敢改"的黑盒。

#### 8. 上线验收要覆盖规则正确性和平台一致性
至少覆盖三类验收：规则正确性（手写基准 vs 表达式结果一致）、平台一致性（编辑器、Mono、IL2CPP 行为一致或明确差异）、缓存稳定性（程序集热更新后缓存是否失效）。

### 实现方案

1. **编译一次，缓存永远**：所有表达式树编译后必须缓存，在 AppDomain / 程序集初始化阶段预热。
2. **按结构指纹缓存**：使用操作符类型、参数类型和成员路径的组合作为缓存键。
3. **IL2CPP 预留解释执行降级**：关键路径提供 AOT 编译方案，非关键路径用 ExpressionVisitor 解释执行。
4. **建立可观测性**：记录编译耗时、缓存命中率和执行耗时，避免黑盒化。
5. **验收标准化**：检查规则正确性、平台一致性和缓存稳定性。

### 总结
表达式树是 C# 中动态代码生成的终极武器，在保持接近手写代码性能的同时提供了最大的运行时灵活性。在 Unity 中，表达式树最适合数据绑定、序列化还原和配置驱动逻辑等场景。关键在于理解 IL2CPP 限制、建立完善的缓存策略，并确保适度的可观测性。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** 表达式树、C#、性能优化、IL2CPP、反射
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
