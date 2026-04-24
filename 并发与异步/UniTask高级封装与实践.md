# UniTask高级封装与实践

## 摘要
在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

## 正文

### 背景
在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

### 核心内容
在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

### 1. 提高易用性和开发效率

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。
    
-   **统一接口：** `UniTask` 本身有多种等待方式（按时间、按帧、等待条件），通过封装可以提供一个更统一、更语义化的接口。
    
-   **隐藏底层细节：** 封装可以将线程切换、取消令牌管理、异常处理等底层复杂性隐藏起来，让业务逻辑开发者能更专注于他们要实现的功能，而不是异步编程的细节。
    

### 2. 增强代码可读性和可维护性

-   **语义化命名：** 通过封装，我们可以用更具业务含义的名称来命名异步操作，例如 `DownloadAssetAsync`、`FadeOutUI`，而不是泛泛的 `DoSomethingAsync`。
    
-   **降低心智负担：** 当你看到 `await MyTaskUtils.WaitFor(2.5f)` 时，立刻就知道它是在等待，而不需要去思考 `UniTask.Delay` 内部参数的含义。
    
-   **集中修改：** 如果未来 `UniTask` 某个 API 的使用方式发生变化，或者需要统一修改某个异步行为（例如统一的日志输出），只需要修改封装层，而不需要修改所有使用到该 API 的地方。
    

### 3. 提升代码健壮性和安全性

-   **统一异常处理：** 异步操作中的异常处理往往容易被忽略。封装层可以内置 `try-catch` 块，确保所有异步任务的异常都能被捕获和处理，避免程序崩溃。
    
-   **自动取消管理：** `CancellationToken` 是 `UniTask` 的核心，但手动管理 `CancellationTokenSource` 的生命周期容易出错。封装可以自动绑定任务与 `MonoBehaviour` 的生命周期，防止内存泄漏和僵尸任务。
    
-   **线程安全：** 封装可以确保敏感操作（如文件 IO）在正确的线程（后台线程）上执行，并在必要时安全地切回主线程，避免多线程访问 Unity API 的错误。
    

----------

## 如何对 UniTask 进行二次封装（代码示例与设计意图）

我们将通过四个常用场景来展示如何进行二次封装，涵盖了延迟等待、文件 IO、周期性任务和生命周期绑定。

----------

### 1. 统一的延迟等待方法：`MyTaskUtils.WaitFor`

这个方法旨在提供一个统一的“等待”功能，智能地根据传入参数选择按时间或按帧等待。

**代码：**

```
using Cysharp.Threading.Tasks;
using System.Threading;
using System;
using UnityEngine;

public static class MyTaskUtils
{
    /// <summary>
    /// 异步等待指定的时间（秒）或帧数。
    /// 默认在主线程更新。
    /// </summary>
    /// <param name="delayTime">等待时间（秒）。如果小于等于 0，则等待指定帧数。</param>
    /// <param name="delayFrames">如果 delayTime <= 0，则等待此帧数。</param>
    /// <param name="ignoreTimeScale">是否忽略 Time.timeScale 的影响。</param>
    /// <param name="cancellationToken">可选的取消令牌。</param>
    /// <returns>UniTask。</returns>
    public static async UniTask WaitFor(
        float delayTime,
        int delayFrames = 1,
        bool ignoreTimeScale = false,
        CancellationToken cancellationToken = default)
    {
        if (delayTime > 0)
        {
            await UniTask.Delay(TimeSpan.FromSeconds(delayTime), ignoreTimeScale, PlayerLoopTiming.Update, cancellationToken);
        }
        else
        {
            await UniTask.DelayFrame(delayFrames, PlayerLoopTiming.Update, cancellationToken);
        }
    }
}

```

**设计意图：**

-   **单一职责与智能判断：** 将 Unity 中常见的按时间或按帧等待逻辑封装到单一的 `WaitFor` 方法中，通过判断 `delayTime` 来智能选择调用 `UniTask.Delay` 或 `UniTask.DelayFrame`，简化了调用方的心智负担。
    
-   **默认参数：** 提供了合理的默认参数 (`delayFrames = 1`, `ignoreTimeScale = false`, `cancellationToken = default`)，使得最常见的“等待一小段时间”或“等待一帧”的调用非常简洁，例如 `await WaitFor(2.5f);` 或 `await WaitFor(0);`。
    
-   **明确的 PlayerLoopTiming：** 明确指定在 `PlayerLoopTiming.Update` 阶段进行等待，这是最常用的游戏逻辑更新时机。
    
-   **保留可取消性：** 依然保留了 `cancellationToken` 参数，确保封装后的方法仍然支持任务取消，这是 `UniTask` 的核心优势之一。
    

----------

### 2. 安全的文件 IO 操作：`FileIOTaskUtils`

文件 IO 是典型的 IO 密集型操作，将其放在后台线程执行可以避免阻塞主线程。

**代码：**

```
using Cysharp.Threading.Tasks;
using System.IO;
using System.Text;
using System.Threading;
using UnityEngine;
using System;

public static class FileIOTaskUtils
{
    /// <summary>
    /// 异步读取文件所有文本内容。在后台线程执行。
    /// </summary>
    /// <param name="filePath">文件路径。</param>
    /// <param name="cancellationToken">可选的取消令牌。</param>
    /// <returns>文件的文本内容，如果失败则返回 null。</returns>
    public static async UniTask<string> ReadAllTextAsyncSafe(string filePath, CancellationToken cancellationToken = default)
    {
        string content = null;
        try
        {
            await UniTask.SwitchToThreadPool(); // 切换到后台线程
            cancellationToken.ThrowIfCancellationRequested(); // 检查取消

            if (!File.Exists(filePath))
            {
                Debug.LogWarning($"文件不存在: {filePath}");
                return null;
            }

            content = await File.ReadAllTextAsync(filePath, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            Debug.LogWarning($"读取文件操作被取消: {filePath}");
            return null;
        }
        catch (Exception ex)
        {
            Debug.LogError($"读取文件失败: {filePath} - {ex.Message}");
            return null;
        }
        finally
        {
            await UniTask.SwitchToMainThread(); // 确保回到主线程
        }
        return content;
    }

    /// <summary>
    /// 异步写入文本内容到文件。在后台线程执行。
    /// </summary>
    /// <param name="filePath">文件路径。</param>
    /// <param name="content">要写入的文本内容。</param>
    /// <param name="cancellationToken">可选的取消令牌。</param>
    /// <returns>写入成功则返回 true，否则返回 false。</returns>
    public static async UniTask<bool> WriteAllTextAsyncSafe(string filePath, string content, CancellationToken cancellationToken = default)
    {
        bool success = false;
        try
        {
            await UniTask.SwitchToThreadPool();
            cancellationToken.ThrowIfCancellationRequested();

            string directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await File.WriteAllTextAsync(filePath, content, cancellationToken);
            success = true;
        }
        catch (OperationCanceledException)
        {
            Debug.LogWarning($"写入文件操作被取消: {filePath}");
            success = false;
        }
        catch (Exception ex)
            {
                Debug.LogError($"写入文件失败: {filePath} - {ex.Message}");
                success = false;
            }
        finally
        {
            await UniTask.SwitchToMainThread();
        }
        return success;
    }
}

```

**设计意图：**

-   **线程安全：** 通过在 `try` 块开始时 `await UniTask.SwitchToThreadPool()`，并在 `finally` 块中 `await UniTask.SwitchToMainThread()`，确保了整个 IO 过程的线程安全性，并能在操作完成后安全地回到主线程，避免阻塞 Unity 主线程。
    
-   **健壮性与错误处理：**
    
    -   内置 `try-catch` 块，能够捕获 `OperationCanceledException` 和其他 `Exception`，并在控制台输出警告/错误信息，防止未处理的异常导致程序崩溃。
        
    -   `ReadAllTextAsyncSafe` 增加了 `File.Exists(filePath)` 检查，避免尝试读取不存在的文件。
        
    -   `WriteAllTextAsyncSafe` 在写入前会检查并自动创建目标文件的父目录，增加了便利性。
        
-   **直观的返回值：** `ReadAllTextAsyncSafe` 返回 `string` 或 `null` (表示失败)，`WriteAllTextAsyncSafe` 返回 `bool` (表示成功或失败)。这种设计让调用方更容易通过返回值判断操作结果，而无需强制使用 `try-catch`。
    
-   **完整可取消性：** 每次操作前都 `cancellationToken.ThrowIfCancellationRequested()`，并将其传递给底层的 IO 方法，确保长时间运行的 IO 操作也能被及时取消。
    

----------

### 3. 可控的定时器和循环：`LoopTaskUtils.DoPeriodicTask`

这个封装提供了灵活的周期性任务执行能力，可以精确控制任务的执行间隔、停止条件和线程。

**代码：**

```
using Cysharp.Threading.Tasks;
using System;
using System.Threading;
using UnityEngine;

public static class LoopTaskUtils
{
    /// <summary>
    /// 异步执行一个周期性任务，直到满足停止条件或被取消。
    /// </summary>
    /// <param name="intervalSeconds">每次迭代之间的间隔时间（秒）。</param>
    /// <param name="action">每次迭代执行的动作。</param>
    /// <param name="stopCondition">停止循环的条件函数。返回 true 则停止。</param>
    /// <param name="cancellationToken">可选的取消令牌。</param>
    /// <param name="runOnMainThread">任务是否在主线程执行。如果为 false，action 会在后台线程执行。</param>
    /// <returns>UniTask。</returns>
    public static async UniTask DoPeriodicTask(
        float intervalSeconds,
        Action action,
        Func<bool> stopCondition = null,
        CancellationToken cancellationToken = default,
        bool runOnMainThread = true)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested && (stopCondition == null || !stopCondition()))
            {
                if (!runOnMainThread)
                {
                    await UniTask.SwitchToThreadPool();
                }
                
                action?.Invoke();

                if (!runOnMainThread)
                {
                    await UniTask.SwitchToMainThread();
                }

                if (!cancellationToken.IsCancellationRequested && (stopCondition == null || !stopCondition()))
                {
                    await UniTask.Delay(TimeSpan.FromSeconds(intervalSeconds), false, PlayerLoopTiming.Update, cancellationToken);
                }
            }
        }
        catch (OperationCanceledException)
        {
            Debug.Log("周期性任务被取消。");
        }
        catch (Exception ex)
        {
            Debug.LogError($"周期性任务发生错误: {ex.Message}");
        }
        finally
        {
            Debug.Log("周期性任务结束。");
        }
    }
}

```

**设计意图：**

-   **灵活的循环控制：**
    
    -   `intervalSeconds` 控制每次迭代的时间间隔。
        
    -   `action` 委托使得循环体逻辑可定制。
        
    -   `stopCondition` 委托允许基于任意动态条件（如计数器达到上限、特定状态变化）自动终止循环，比简单的固定次数循环更强大。
        
-   **可靠的取消机制：** `while` 循环内部始终检查 `cancellationToken.IsCancellationRequested`，并将其传递给 `UniTask.Delay`，确保任务可以在外部被随时取消，避免无限循环或资源浪费。
    
-   **智能的线程选择：** `runOnMainThread` 参数允许你决定 `action` 中的逻辑是在主线程还是后台线程执行。如果设置为 `false`，则会在执行 `action` 前后自动进行线程切换，确保 `action` 的**耗时计算部分**可以在后台线程运行，并且之后安全地回到主线程。
    
-   **内建的错误处理：** 内置 `try-catch` 块捕获 `OperationCanceledException` 和其他 `Exception`，为周期性任务提供统一的错误处理，提升稳定性。
    
-   **`Forget()` 友好：** 这种周期性任务通常是“启动后即运行”，调用方不关心其返回值，常结合 `Forget()` 使用以避免警告。
    

----------

### 4. 与 MonoBehaviour 生命周期绑定的任务启动器：`TaskRunner`

这个工具类提供了一种优雅的方式，将 `UniTask` 与 `MonoBehaviour` 的生命周期紧密绑定，从而实现任务的自动管理和取消。

**代码：**

```
using Cysharp.Threading.Tasks;
using UnityEngine;
using System.Threading;
using System;

public static class TaskRunner
{
    /// <summary>
    /// 在指定 MonoBehaviour 的生命周期内启动一个 UniTask。
    /// 任务会在 MonoBehaviour 销毁时自动取消。
    /// </summary>
    /// <param name="monoBehaviour">绑定生命周期的 MonoBehaviour 实例。</param>
    /// <param name="taskFunc">要执行的 UniTask 函数。</param>
    public static UniTask RunOnDestroy(this MonoBehaviour monoBehaviour, Func<CancellationToken, UniTask> taskFunc)
    {
        return RunTaskWithLifecycle(monoBehaviour, taskFunc, monoBehaviour.GetCancellationTokenOnDestroy());
    }

    /// <summary>
    /// 在指定 MonoBehaviour 的生命周期内启动一个 UniTask。
    /// 任务会在 MonoBehaviour 禁用时自动取消。
    /// </summary>
    /// <param name="monoBehaviour">绑定生命周期的 MonoBehaviour 实例。</param>
    /// <param name="taskFunc">要执行的 UniTask 函数。</param>
    public static UniTask RunOnDisable(this MonoBehaviour monoBehaviour, Func<CancellationToken, UniTask> taskFunc)
    {
        return RunTaskWithLifecycle(monoBehaviour, taskFunc, monoBehaviour.GetCancellationTokenOnDisable());
    }

    private static async UniTask RunTaskWithLifecycle(MonoBehaviour monoBehaviour, Func<CancellationToken, UniTask> taskFunc, CancellationToken lifecycleToken)
    {
        if (monoBehaviour == null)
        {
            Debug.LogWarning("TaskRunner: MonoBehaviour 实例为空，任务无法启动。");
            return;
        }

        try
        {
            await taskFunc(lifecycleToken);
        }
        catch (OperationCanceledException)
        {
            if (monoBehaviour != null)
            {
                Debug.Log($"任务绑定到 {monoBehaviour.name} 生命周期，因取消令牌触发而结束。");
            }
        }
        catch (Exception ex)
        {
            if (monoBehaviour != null)
            {
                Debug.LogError($"任务绑定到 {monoBehaviour.name} 发生未处理的错误: {ex.Message}");
            }
            else
            {
                Debug.LogError($"一个绑定生命周期的任务在 MonoBehaviour 销毁后发生未处理的错误: {ex.Message}");
            }
        }
    }
}

```

**设计意图：**

-   **直观的扩展方法：** `RunOnDestroy` 和 `RunOnDisable` 被设计为 `MonoBehaviour` 的扩展方法，可以直接在任何 `MonoBehaviour` 实例上调用，如 `this.RunOnDestroy(...)`，极大地提高了代码的简洁性和直观性。
    
-   **自动生命周期绑定：** 这是核心功能。它利用 `UniTask` 提供的 `GetCancellationTokenOnDestroy()` 和 `GetCancellationTokenOnDisable()` 扩展，自动将任务的生命周期与 `MonoBehaviour` 的销毁或禁用事件绑定，防止常见的内存泄漏和僵尸任务问题。
    
-   **统一任务启动与错误处理：** `RunTaskWithLifecycle` 作为私有辅助方法，负责实际的任务启动和通用的异常捕获。它能智能地判断 `MonoBehaviour` 实例是否仍然存在，并在日志中提供更准确的上下文信息。
    
-   **`Func<CancellationToken, UniTask>` 参数：** 这种委托签名强制你传入的任务函数接收一个 `CancellationToken` 参数。这样，你的任务内部就可以方便地访问并响应取消请求，确保协同取消的正确实现。
    
-   **通常与 `Forget()` 结合：** 绑定生命周期的任务通常是“启动后运行”的，调用方不关心其完成结果，因此常常会配合 `Forget()` 方法使用，以避免编译器的 `await` 警告，同时确保任务在后台安全运行。
    

----------

## 总结

通过上述的二次封装示例，我们能清楚地看到，对 `UniTask` 进行封装不仅仅是代码上的简单复制粘贴，更是一种**设计模式**的体现。它让我们能够：

1.  **提升代码的抽象层级：** 将底层异步细节抽象为更符合业务语义的高级接口。
    
2.  **强制最佳实践：** 在封装内部嵌入线程安全、异常处理、取消机制等最佳实践，避免开发者遗漏。
    
3.  **提高团队协作效率：** 统一的接口和规范让团队成员能够更快上手，并产出更高质量、更一致的代码。
    

掌握 `UniTask` 本身是基础，而学会如何根据项目需求对其进行**高层次的二次封装**，则是一个经验丰富的 Unity 开发者迈向卓越的关键一步。

希望这些示例和解释能帮助你更好地理解 `UniTask` 的二次封装及其带来的巨大价值！在你的项目中，是否还有其他你认为特别适合进行 `UniTask` 二次封装的场景呢？

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

-   **统一接口：** `UniTask` 本身有多种等待方式（按时间、按帧、等待条件），通过封装可以提供一个更统一、更语义化的接口。

-   **隐藏底层细节：** 封装可以将线程切换、取消令牌管理、异常处理等底层复杂性隐藏起来，让业务逻辑开发者能更专注于他们要实现的功能，而不是异步编程的细节。

希望这些示例和解释能帮助你更好地理解 `UniTask` 的二次封装及其带来的巨大价值！在你的项目中，是否还有其他你认为特别适合进行 `UniTask` 二次封装的场景呢？

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

希望这些示例和解释能帮助你更好地理解 `UniTask` 的二次封装及其带来的巨大价值！在你的项目中，是否还有其他你认为特别适合进行 `UniTask` 二次封装的场景呢？

### 实现方案
在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

在开始前，我们首先需要回答一个核心问题：**为什么我们要对 `UniTask` 进行二次封装？** 答案是：`UniTask` 提供了底层的异步操作原语，就像搭乐高的基础砖块。然而，直接使用这些基础砖块在大型或复杂的项目中可能会遇到一些挑战：

-   **减少重复代码：** 许多异步操作模式在项目中会反复出现，例如：等待一段时间、加载文件、网络请求等。如果每次都从头编写 `UniTask.Delay`、`await UniTask.SwitchToThreadPool()` 等，会产生大量重复且相似的代码。

### 总结
希望这些示例和解释能帮助你更好地理解 `UniTask` 的二次封装及其带来的巨大价值！在你的项目中，是否还有其他你认为特别适合进行 `UniTask` 二次封装的场景呢？

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-20 21:05
- **作者：** 吉良吉影
- **分类：** 并发与异步
- **标签：** 并发与异步、UniTask高级封装与实践
- **来源：** 已有文稿整理

---
*文档基于与吉良吉影的讨论，由小雅整理*
