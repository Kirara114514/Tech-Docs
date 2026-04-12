# Unity入门教程之异步篇第四节：Unity 高性能计算？Job System 与 Burst Compiler ！

## 摘要
 ## Unity 中的高性能计算：Job System 与 Burst Compiler 深度解析 在上一篇文章中，我们了解了 C# 原生多线程（如 `Task.Run`）如何将耗时任务推到子线程，以及处理线程安全和主线程通信所面临的挑战。我们看到了使用 `lock` 或 `Interlocked` 保护共享数据，以及手动将结果传回主线程的复杂性。 那么，有没有一种更优雅、更高效、更安全的...

## 正文


## Unity 中的高性能计算：Job System 与 Burst Compiler 深度解析

在上一篇文章中，我们了解了 C# 原生多线程（如 `Task.Run`）如何将耗时任务推到子线程，以及处理线程安全和主线程通信所面临的挑战。我们看到了使用 `lock` 或 `Interlocked` 保护共享数据，以及手动将结果传回主线程的复杂性。

那么，有没有一种更优雅、更高效、更安全的方式来利用多核 CPU，并且能与 Unity 引擎无缝协作呢？答案就是 Unity 专为高性能、数据密集型任务设计的解决方案：**Job System** 与 **Burst Compiler**。

----------

### 为何需要 Job System？从痛点到解决方案

传统的 C# 多线程虽然灵活，但在 Unity 环境中往往面临几个核心问题：

1.  **GC (Garbage Collection) 开销：** 使用 `Task` 或手动创建线程，涉及到托管对象的分配和回收，这会增加 GC 压力，导致运行时卡顿。
    
2.  **线程安全复杂性：** 需要手动管理锁、原子操作和线程安全集合，极易出错，引入死锁或竞态条件，调试困难。
    
3.  **主线程通信复杂：** 子线程结果需要通过 `SynchronizationContext` 或其他方式“邮寄”回主线程，逻辑分散。
    
4.  **性能瓶颈：** 即使使用了多线程，如果数据结构不优化，CPU 缓存命中率低，或者没有利用好 SIMD 指令，也无法达到极致性能。
    

为了解决这些问题，Unity 推出了 **Job System**。它不是简单地让你创建线程，而是一种**数据导向 (Data-Oriented Design, DOD)** 的并行计算框架。它的核心设计理念是：

-   **零 GC 分配：** Job 内部操作的数据通常是值类型或特殊的 **NativeContainer**（如 `NativeArray`），这些数据直接存储在非托管内存中，不受 GC 管理。
    
-   **自动并行化：** Job System 自动将你的任务分配到 CPU 多个核心上并行执行，你无需关心线程管理。
    
-   **安全系统：** Job System 有一套严格的规则，防止你在 Job 中意外访问不安全或未同步的数据，从源头避免了许多线程安全问题。
    
-   **与 Unity 引擎集成：** 它能更好地与 Unity 的主循环和渲染管线协同工作，尤其是在结合 ECS (Entity Component System) 时能发挥巨大威力。
    

简而言之，Job System 提供了一种在 Unity 中安全、高效地利用多核 CPU 进行并行计算的范式。

----------

### Job System 基础：从 Job 定义到调度

Job System 的基本工作流程是：你定义一个“Job”（一个实现了特定接口的结构体），它包含你需要在子线程执行的计算逻辑和数据。然后你将这个 Job “调度”给 Job System，Job System 会负责将其放入队列，并在合适的时机由工作线程执行。

#### 1. Job 的定义：`IJob` 接口

一个 Job 就是一个实现了 `IJob` 接口的 **结构体 (struct)**。结构体是值类型，复制时是按值复制，这有助于数据隔离，避免共享引用。



```
using Unity.Jobs;
using UnityEngine;

public struct MySimpleJob : IJob
{
    public float InputValue;
    public NativeArray<float> OutputResult;

    public void Execute()
    {
        OutputResult[0] = InputValue * 2.0f;
        Debug.Log($"Job 在子线程执行，计算结果：{OutputResult[0]}");
    }
}

```

**为什么 Job 只能使用值类型或 `NativeContainer`？**

这是 Job System 零 GC 和安全性的基石：

-   **值类型 (struct)：** 结构体在复制时是深拷贝，这意味着 Job 拿到的数据是它自己的副本，不会和主线程或其他 Job 共享同一个引用，从而避免了数据竞争。
    
-   **`NativeArray<T>` (NativeContainer)：** 对于数组或需要大量数据的场景，如果每次都复制会效率低下。`NativeArray<T>` 是 Unity 提供的一种特殊容器，它将数据直接存储在非托管内存（Unmanaged Memory）中。Job System 允许你在 Job 中安全地读写 `NativeArray`，因为它有一套**安全系统**来追踪访问权限，确保不会发生同时读写（Race Condition）。
    

#### 2. 调度 Job：`Schedule()`

定义好 Job 后，你需要在主线程中创建它的实例，并调用 `Schedule()` 方法将其提交给 Job System。`Schedule()` 方法会返回一个 `JobHandle`。



```
using UnityEngine;
using Unity.Jobs;
using Unity.Collections;

public class JobSchedulingExample : MonoBehaviour
{
    private NativeArray<float> _results;
    private JobHandle _jobHandle;

    void Start()
    {
        _results = new NativeArray<float>(1, Allocator.TempJob);

        MySimpleJob job = new MySimpleJob
        {
            InputValue = 10.5f,
            OutputResult = _results
        };

        _jobHandle = job.Schedule();
        Debug.Log("Job 已调度，等待完成...");
    }

    void LateUpdate()
    {
        if (_jobHandle.IsCompleted)
        {
            _jobHandle.Complete();
            Debug.Log($"主线程获取 Job 结果：{_results[0]}");
            _results.Dispose();
            enabled = false;
        }
    }

    void OnDestroy()
    {
        if (_results.IsCreated)
        {
            _results.Dispose();
        }
    }
}

```

**`JobHandle` 的作用：**

`JobHandle` 是一个轻量级的结构体，代表一个 Job 的执行状态和依赖关系。你不需要显式地管理线程，只需要管理这些 `JobHandle`。

-   **`IsCompleted`：** 检查 Job 是否已经完成。
    
-   **`Complete()`：** 强制等待 Job 完成。如果 Job 尚未完成，调用 `Complete()` 会阻塞主线程直到 Job 完成。通常在需要读取 Job 结果前调用。
    
-   **依赖管理：`AddDependency()`：** 这是 Job System 强大的功能之一。你可以指定一个 Job 必须在另一个或多个 Job 完成之后才能开始执行。这允许你构建复杂的并行任务链，而无需手动同步。
    

----------

### 并行 Job：`IJobParallelFor` 与 `IJobParallelForTransform`

对于需要处理大量相似数据（如数组、列表）的计算，Job System 提供了更强大的并行 Job 类型：`IJobParallelFor` 和 `IJobParallelForTransform`。它们会将任务自动拆分成小块，并行分发给多个工作线程。

#### 1. `IJobParallelFor`：高效处理数据数组

`IJobParallelFor` 适用于你需要对一个大型数组的每个元素执行相同操作的场景。Job System 会自动将数组分成多个块，每个线程处理一个或多个块。



```
using Unity.Jobs;
using UnityEngine;
using Unity.Collections;

public struct SquareJob : IJobParallelFor
{
    [ReadOnly] public NativeArray<int> InputNumbers;
    public NativeArray<int> OutputSquares;

    public void Execute(int index)
    {
        OutputSquares[index] = InputNumbers[index] * InputNumbers[index];
    }
}

public class ParallelJobExample : MonoBehaviour
{
    void Start()
    {
        int arraySize = 100000;
        NativeArray<int> numbers = new NativeArray<int>(arraySize, Allocator.TempJob);
        NativeArray<int> squares = new NativeArray<int>(arraySize, Allocator.TempJob);

        for (int i = 0; i < arraySize; i++)
        {
            numbers[i] = i;
        }

        SquareJob job = new SquareJob
        {
            InputNumbers = numbers,
            OutputSquares = squares
        };

        JobHandle handle = job.Schedule(arraySize, 64);
        handle.Complete();

        Debug.Log($"计算完成。前10个结果:");
        for (int i = 0; i < 10; i++)
        {
            Debug.Log($"Square of {numbers[i]} is {squares[i]}");
        }

        numbers.Dispose();
        squares.Dispose();
    }
}

```

`IJobParallelFor` 的效率远高于你手动创建多个 `IJob`。`Schedule` 方法的第二个参数 `batchSize` 很重要，它告诉 Job System 如何将工作分批。通常设置为 32、64、128 这样的数字，可以根据实际测试来调整，以达到最佳性能。

#### 2. `IJobParallelForTransform`：并行处理 `Transform`

`IJobParallelForTransform` 是 `IJobParallelFor` 的特化版本，专门用于并行处理 `Transform` 组件。由于 `Transform` 是 Unity 场景中最频繁被修改的组件之一，这个 Job 类型在性能优化上意义重大。

你可以通过 `TransformAccessArray` 来向 Job 传递 `Transform` 引用，并在 Job 中安全地修改它们的局部位置、旋转、缩放。



```
using Unity.Jobs;
using UnityEngine;
using Unity.Collections;
using Unity.Transforms;

public struct MoveTransformsJob : IJobParallelForTransform
{
    public float MoveSpeed;
    public float DeltaTime;

    public void Execute(int index, TransformAccess transform)
    {
        transform.localPosition += transform.forward * MoveSpeed * DeltaTime;
    }
}

public class ParallelTransformJobExample : MonoBehaviour
{
    public GameObject PrefabToSpawn;
    public int ObjectCount = 10000;

    private TransformAccessArray _transformAccessArray;

    void Start()
    {
        _transformAccessArray = new TransformAccessArray(ObjectCount);
        for (int i = 0; i < ObjectCount; i++)
        {
            GameObject obj = Instantiate(PrefabToSpawn, Random.insideUnitSphere * 10, Quaternion.identity);
            _transformAccessArray.Add(obj.transform);
        }
    }

    void Update()
    {
        MoveTransformsJob job = new MoveTransformsJob
        {
            MoveSpeed = 5.0f,
            DeltaTime = Time.deltaTime
        };

        JobHandle handle = job.Schedule(_transformAccessArray);
        handle.Complete();
    }

    void OnDestroy()
    {
        if (_transformAccessArray.isCreated)
        {
            _transformAccessArray.Dispose();
        }
    }
}

```

`IJobParallelForTransform` 是实现大规模动画、AI 运动、粒子效果等场景的利器。它的优势在于：

-   **高性能：** 专门为 `Transform` 优化，可以高效地并行更新大量物体。
    
-   **安全：** 内部处理了对 `Transform` 的并发访问，避免了竞态条件。
    
-   **自动依赖：** Job System 会自动处理 `TransformAccessArray` 与渲染系统之间的读写依赖，确保数据一致性。
    

----------

### Burst Compiler：极致性能的助推器

Job System 本身已经很高效，但 Unity 还提供了一个“外挂”——**Burst Compiler**，它能让你的 Job 性能更上一层楼。

**Burst Compiler 是什么？**

Burst Compiler 是 Unity 针对高性能 C# 代码（尤其是 Job System 代码）设计的 **即时 (Just-In-Time, JIT) 编译器**。它的作用是：

-   **编译到高度优化的机器码：** Burst Compiler 会将你用 C# 编写的 Job 代码，编译成高度优化的、针对目标 CPU 架构的机器码。
    
-   **利用 SIMD 指令：** 它能自动识别代码中的并行机会，并生成 **SIMD (Single Instruction, Multiple Data)** 指令。SIMD 允许 CPU 一次性处理多个数据点，极大地加速了向量和矩阵运算等数据密集型任务。
    
-   **消除不必要的开销：** 它会移除 C# 语言层面的一些运行时检查（如数组越界检查），在确保安全的前提下，最大限度地提升性能。
    

#### 如何使用 Burst Compiler？

非常简单，你只需要在你的 Job 结构体上添加 `[BurstCompile]` 特性即可：



```
using Unity.Jobs;
using UnityEngine;
using Unity.Collections;
using Unity.Burst;

[BurstCompile]
public struct BurstedSquareJob : IJobParallelFor
{
    [ReadOnly] public NativeArray<int> InputNumbers;
    public NativeArray<int> OutputSquares;

    public void Execute(int index)
    {
        OutputSquares[index] = InputNumbers[index] * InputNumbers[index];
    }
}

public class BurstExample : MonoBehaviour
{
    void Start()
    {
        int arraySize = 1000000;
        NativeArray<int> numbers = new NativeArray<int>(arraySize, Allocator.TempJob);
        NativeArray<int> squares = new NativeArray<int>(arraySize, Allocator.TempJob);

        for (int i = 0; i < arraySize; i++)
        {
            numbers[i] = i;
        }

        BurstedSquareJob job = new BurstedSquareJob
        {
            InputNumbers = numbers,
            OutputSquares = squares
        };

        JobHandle handle = job.Schedule(arraySize, 64);
        handle.Complete();

        Debug.Log($"Burst Job 计算完成。前10个结果:");
        for (int i = 0; i < 10; i++)
        {
            Debug.Log($"Square of {numbers[i]} is {squares[i]}");
        }

        numbers.Dispose();
        squares.Dispose();
    }
}

```

#### Burst Compiler 的限制：

尽管 Burst 强大，但它不是万能的。为了实现极致性能，Burst 编译的代码有严格的限制：

-   **不能使用托管对象 (Managed Objects)：** 不能引用或操作 `class` 类型的实例、字符串、`List<T>`、`Dictionary<T>` 等。只能操作值类型或 `NativeContainer`。
    
-   **不能使用 GC：** 不能分配托管内存。
    
-   **不能调用非 Burst 编译的代码：** 只能调用其他 Burst 兼容的代码、C# 值类型方法或 Burst 内部函数。
    
-   **不能使用某些 C# 特性：** 例如 `try-catch`、反射、`dynamic` 关键字等。
    

这些限制意味着 Burst 更适合纯粹的、数据密集型的数学运算或逻辑处理。如果你的 Job 需要和 Unity 场景中的 `GameObject` 交互，或者需要复杂的逻辑，那么你可能需要重新考虑设计，将计算部分与 Unity API 调用部分分离。

#### Job System 的安全系统与调试

Job System 内置了一套强大的安全系统，在开发模式下（编辑器中）会进行大量的运行时检查，以防止常见的并发编程错误。例如：

-   **数据竞争检测：** 如果你在同一个 `NativeArray` 上，同时调度了两个写入 Job，或者一个写入 Job 和一个读取 Job 没有正确设置依赖，Job System 会在运行时报错。
    
-   **非法内存访问：** 尝试访问已释放的 `NativeArray` 会立即报错。
    
-   **主线程访问检查：** 尝试在 Job 中访问非 Burst 兼容的 Unity API 会报错。
    

这些检查在开发阶段非常有用，可以帮助你及早发现问题。但在 Build 游戏时，这些安全检查会被移除，以获得最终的性能。

**调试 Job System：**

调试 Burst 编译的 Job 代码可能有点挑战，因为它们被编译成了机器码。通常的调试策略包括：

-   **在 C# 层面上调试：** 在 Job 的 `Execute` 方法内放置 `Debug.Log` 或在调试器中设置断点，但在 Burst 编译的代码中，这些日志和断点可能会影响性能或行为。
    
-   **禁用 Burst 编译：** 在调试模式下，暂时移除 `[BurstCompile]` 特性，让 Job 作为普通的 C# 代码运行，方便调试。
    
-   **Unity Profiler：** 这是最重要的工具。Unity Profiler 有专门的 **Jobs** 模块，可以显示 Job 的调度、执行时间、依赖关系，帮助你分析 Job 的性能瓶颈和线程利用率。
    

#### 何时选择 Job System + Burst Compiler？

现在你对 Job System 有了基本的了解，那么在实际项目中，何时应该使用它呢？

1.  **计算密集型任务：** 当你的任务是纯粹的数学计算、物理模拟、AI 寻路、图像处理等，并且会占用大量 CPU 时间时。
    
2.  **数据量大且独立：** 当你需要处理大量相互独立的数据元素，并且这些数据可以表示为值类型或 `NativeArray` 时。
    
3.  **对 GC 敏感：** 在移动端、VR/AR 或性能要求极高的项目中，需要严格控制 GC Alloc，Job System 的零 GC 特性是关键。
    
4.  **可以并行化：** 任务可以被拆分成多个独立的子任务，并行执行不会影响最终结果。
    
5.  **不频繁与主线程交互：** Job System 更适合“一次性计算大量数据，然后将结果传回主线程”的场景。如果你的任务需要频繁地在 Job 和主线程之间切换或访问 Unity API，那么 `UniTask` 可能更适合。
    

**常见适用场景：**

-   **大规模粒子效果模拟：** 计算成千上万个粒子的位置、颜色、大小。
    
-   **AI 行为计算：** 并行计算大量敌人或 NPC 的寻路路径、行为决策。
    
-   **程序化内容生成：** 在后台生成地形网格、纹理或建筑结构。
    
-   **物理模拟：** 轻量级物理计算或碰撞检测。
    

----------

### 结语

Job System 和 Burst Compiler 是 Unity 为开发者提供的强大工具，它们共同构成了 Unity 高性能计算的基石。通过拥抱数据导向设计，并利用多核 CPU 和 SIMD 指令，你可以在 Unity 中实现以前难以想象的性能水平。

当然，Job System 并非“银弹”。理解它的适用场景和限制至关重要。对于简单的异步流程或需要频繁与 Unity API 交互的任务，UniTask 仍然是优秀的选择。而对于需要极致性能的纯计算任务，Job System + Burst Compiler 则是你的不二之选。

希望通过这几篇文章，你能对 Unity 中的异步编程和多线程有一个全面且现代的理解。掌握这些工具，你将能够构建出更流畅、更具沉浸感的 Unity 游戏！


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity, 性能
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*