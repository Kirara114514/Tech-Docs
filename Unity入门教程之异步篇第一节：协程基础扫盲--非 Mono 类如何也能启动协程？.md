



初学 Unity 的小伙伴可能都会遇到这样一个疑惑：**在普通的 C# 类里，为什么不能直接使用协程？** 我记得自己第一次尝试在非 MonoBehaviour 的类里调用 `StartCoroutine` 时，要么编译报错，要么啥也不发生。当时我一脸懵逼：明明协程这么好用，为什么非得在 MonoBehaviour 脚本里才能启动呢？

别急，今天就来聊聊 Unity 协程。我们会一起看看协程的基本原理、为什么 `StartCoroutine` 只能在 `MonoBehaviour` 调用，以及如果我们**在非 Mono 类，如何照样启动协程**。同时，我也会分享两个常用的解决方案，并给出示例代码。此外，还会提到一些协程的生命周期陷阱（比如对象销毁导致协程中断、`yield return null` 的真正含义等），以及协程相对于 async/await 的局限和未来可能的替代方案。

好了，话不多说，让我们从基础开始补补课吧！

----------

### 什么是 Unity 协程？

协程（**Coroutine**）是 Unity 提供的一种在多帧间执行代码的机制，能让我们用同步的代码写出异步的效果。在 Unity 脚本中，协程通常表现为一个返回 **`IEnumerator`** 的函数，内部使用 `yield return` 来暂停执行。例如，一个简单的协程可以这样写：



```
IEnumerator HelloWorldCoroutine() {
    Debug.Log("Hello");
    yield return new WaitForSeconds(1f);
    Debug.Log("World");
}

```

如果我们在 MonoBehaviour 脚本中通过 `StartCoroutine(HelloWorldCoroutine())` 启动它，那么它会先打印 "Hello"，然后等待1秒，再打印 "World"。整个过程**没有堵塞主线程**，因为 `yield return` 将函数挂起，等下一帧或指定时间后再继续执行。

请注意两个要点：

-   **返回类型必须是 IEnumerator**：协程函数定义为 `IEnumerator`，Unity 会利用 C# 的迭代器机制来实现暂停和恢复执行。
    
-   **`yield return` 实现暂停**：每当执行到 `yield return` 时，协程会把控制权交还给 Unity，引擎会根据返回的指令决定什么时候恢复协程。例如，`yield return null` 就表示**等待一帧**，“下一帧再继续”，而 `yield return new WaitForSeconds(1f)` 则表示等待1秒后再继续。
    

换句话说，**协程让我们可以写出像同步代码一样的逻辑，但在幕后却可以按帧或按时间间隔执行，非常适合处理需要**“**一段时间后**”**完成的任务**。比如渐变动画、计时器、等待异步加载资源或网络请求完成等，协程都能派上用场。

举个例子，如果我们直接用 for 循环在一帧内把一个物体透明度从1降到0，玩家会看到它瞬间消失，没有渐变过程。而用协程的话，我们可以每帧降低一点透明度并 `yield return null` 等待下一帧渲染，如此在多帧内逐渐完成过渡。

总之，协程是 Unity 新手必须掌握的利器。但是！很多人在初学时都会踩到一个坑：**`StartCoroutine` 只能在继承 MonoBehaviour 的类中调用**。这是为什么呢？下面我们就来揭秘这个谜题。

----------

### StartCoroutine 为何只能在 MonoBehaviour 上调用？

在 Unity 脚本生命周期中，`StartCoroutine` 并不是一个全局函数，而是 **`MonoBehaviour` 类的实例方法**。这意味着只有挂在 GameObject 上、继承自 `MonoBehaviour` 的脚本组件才能调用它。这是 Unity 设计上的一个特点：**协程的执行是绑定在某个 MonoBehaviour 对象上的**。

简而言之，每当我们用 `MonoBehaviour.StartCoroutine` 启动一个协程时，Unity 引擎会把这个协程登记在该 MonoBehaviour 实例名下，并在每帧驱动它的执行。从实现角度来看，Unity 会为传入的 `IEnumerator` 创建一个内部的 Coroutine 对象，将其加入对应 MonoBehaviour 的协程列表中，然后每帧根据协程当前的状态（yield了什么）去决定是否调用下一次 `MoveNext()`。**协程的生命周期因此和那个 MonoBehaviour 所属的 GameObject 紧密相连**。

为什么要这么设计呢？主要有以下考虑：

-   **协程需要由引擎驱动**：Unity本身并不知道你的 IEnumerator 什么时候该执行下一步，必须通过 `StartCoroutine` 把控制权交给引擎，由 Unity 在每帧或特定事件后调用你的协程的 `MoveNext()`。MonoBehaviour 正是 Unity 管理脚本生命周期的载体，所以以它为纽带来调度协程最自然。
    
-   **便于自动管理停止**：如果一个协程挂在某个对象上，当那个对象被停用或销毁时，引擎就可以自动停止其上所有协程，避免无主协程继续执行造成错误。Unity 官方文档也明确说明：**当 MonoBehaviour 被销毁，或其 GameObject 被禁用时，协程会自动停止**。这样一来，我们不用担心协程引用的对象已经没了还在跑（当然，前提是协程就是由该对象启动的，下文我们会讨论这种情况带来的坑）。
    
-   **MonoBehaviour 提供控制接口**：因为协程隶属于 MonoBehaviour，所以可以通过 MonoBehaviour 的 `StopCoroutine` 或 `StopAllCoroutines` 去停止它们。实际上 Unity 通过在 MonoBehaviour 内部维护一个协程列表，实现了按引用停止协程的功能。
    

因此，**`StartCoroutine` 被设计成非静态方法，强制要求调用者必须是 MonoBehaviour**。这就是为什么你在普通类里直接 call 会报错的原因：编译器会说 “找不到 StartCoroutine 方法” 或 “需要对象引用来调用非静态成员”。本质上，我们缺少一个协程的“宿主”。

顺带一提，**协程挂靠在 MonoBehaviour 上还有个副作用**：如果那个脚本所在的 GameObject 被 SetActive(false)，那么协程也会跟着停掉，并且不会自动恢复（注意，这跟脚本enabled=false不同，禁用脚本不会停止协程）。总之，这个机制一方面很方便帮我们管理协程生命周期，但另一方面也埋下了一些坑，我们稍后细说。

理解了以上原理，我们可以总结：**协程必须由 Unity 的脚本对象驱动**。所以在**非 MonoBehaviour 的普通类**里直接用协程是不行的，因为它没有被 Unity 托管，自然也就没有 `StartCoroutine` 来帮你调度。那问题来了，如果我们的代码恰好写在非 Mono 的类里，难道就完全没法优雅地等待了么？别灰心，其实还是有办法滴。下面介绍两个常见的解决方案。

----------

### 非 MonoBehaviour 类中使用协程的难题

在探讨解决方案之前，我们先明确问题：**非 MonoBehaviour 的类无法直接使用 `StartCoroutine`**。这会在以下情况中造成困扰：

-   **纯 C# 的逻辑类**：有些项目喜欢把游戏逻辑写在纯粹的 C# 类中（不继承 MonoBehaviour），例如状态机的状态类、数据模型类、网络通信管理类等等。这些类可能仍想利用协程来处理异步流程。如果直接写 `StartCoroutine`，会发现压根调不出来（IDE 提示不存在该方法）。
    
-   **静态工具类**：有些工具类可能想提供静态方法封装异步流程，比如静态的网络请求方法。如果不能在其中启动协程，那就无法使用 `yield return UnityWebRequest...` 这种方便的写法了。
    
-   **扩展方法**：假如我们试图写个扩展方法 `MyExtensions.RunCoroutine(this IEnumerator routine)` 直接调用协程，也不行，因为扩展方法本质上也需要在某个 MonoBehaviour 上调用 `StartCoroutine`。
    

简单说，**在非 Mono 环境下，协程函数虽然可以写（毕竟 IEnumerator 哪里都能用），但没人帮你调用 MoveNext，于是就不会执行**。如果你强行 `routine.MoveNext()` 手动迭代，虽然能走过 yield，但那就失去了帧同步的意义，也脱离了 Unity 环境，无法等待引擎的那些异步操作（如 WaitForSeconds 等）。

因此，我们的目标是：**让非 Mono 的代码也能“借用” Unity 的协程调度机制**来执行 IEnumerator 流程。本质思路就是**找一个 MonoBehaviour 来帮忙跑协程**。

接下来介绍两种常见解决方法，一种是“找个现成的 Mono 帮忙”，另一种是“自建一个协程跑腿（**CoroutineRunner**）”。

----------

#### 方案一：借用现有的 MonoBehaviour 来启动协程

这是**最简单直接**的方法：**把需要启动的协程交给一个现成的 `MonoBehaviour` 实例来调用**。

具体有两种方式：

##### 方式A：在非 Mono 类中持有一个 MonoBehaviour 引用。

我们可以设计非 Mono 类，让它有一个公开的 `MonoBehaviour` 字段，由外部在初始化时赋值。然后非 Mono 类在需要协程时，就通过这个引用来调用 `StartCoroutine`。比如：



```
public class MyController : MonoBehaviour {
    void Start() {
        NonMonoLogic.Instance.mono = this;
        NonMonoLogic.Instance.DoSomething();
    }
}

public class NonMonoLogic {
    public MonoBehaviour mono;
    public static NonMonoLogic Instance { get; } = new NonMonoLogic();

    public void DoSomething() {
        mono.StartCoroutine(SomeCoroutine());
    }

    private IEnumerator SomeCoroutine() {
        yield return new WaitForSeconds(3f);
        Debug.Log("协程执行完毕！");
    }
}

```

在上面的例子中，`MyController` 是个挂在场景物体上的脚本，在 `Start()` 里把自己的引用赋给了 `NonMonoLogic` 单例。这样 `NonMonoLogic` 就“持有”了一个 MonoBehaviour，可以用它来启动协程了。调用 `NonMonoLogic.Instance.DoSomething()` 时，其内部实际上是 `this.mono.StartCoroutine(...)`。**效果：协程成功运行，且绑定在 `MyController` 那个 GameObject 上**。

##### 方式B：调用时传参。

我们也可以不保留引用，而是在调用协程的时候从外部传入一个 MonoBehaviour。例如：



```
public class Utility {
    public static void DelayedCall(float delay, Action action, MonoBehaviour runner) {
        runner.StartCoroutine(DelayRoutine(delay, action));
    }

    private static IEnumerator DelayRoutine(float delay, Action action) {
        yield return new WaitForSeconds(delay);
        action?.Invoke();
    }
}

```

使用时，比如在某个脚本里调用：`Utility.DelayedCall(2f, ()=>Debug.Log("Hi"), this);` 。这里把 `this`（MonoBehaviour 本身）作为参数传进去，让它帮忙跑协程。这样 `Utility` 里的静态方法也能借力执行异步逻辑。

两种做法其实本质一样：**借鸡生蛋**，利用现有 MonoBehaviour 的 `StartCoroutine` 能力来启动我们想要的协程。

这种方案简单易懂，也不需要写额外脚本，在很多场景下都很好使。然而，它也有局限：

-   **必须有合适的 MonoBehaviour 可以传入**：有时候我们的非 Mono 类可能并没有天然和某个 MonoBehaviour 同步存在。例如一个纯粹的后台管理类，不属于具体某个场景对象，那传谁呢？硬要传的话可能到处都要把 Mono 参塞进去，增加了耦合。
    
-   **依赖提供者生命周期**：协程跑在谁上面，就受谁的生命周期影响。如果传入的那个 MonoBehaviour 挂在一个随时可能销毁的对象上，协程也会提早终止（稍后详谈这个坑）。
    

如果以上问题不突出，用方案一其实足够了。但要是嫌麻烦或者场景复杂，没有合适的 Mono 对象可用，那就需要第二种方案出场了。

----------

#### 方案二：使用协程中转器（CoroutineRunner）封装静态调用

**协程中转器**这个名字听起来高大上，其实就是说**写一个专门的工具类，内部自己托管一个隐藏的 MonoBehaviour，用来统一启动协程**。这样我们在任何地方想用协程时，只要调用这个工具类提供的静态方法即可，不再需要手动传递 MonoBehaviour 了。

具体怎么实现呢？思路如下：

1.  **创建一个继承 MonoBehaviour 的类**（比如就叫 `CoroutineRunner`）。这个类本身没什么逻辑，只负责当“跑腿”启动协程。
    
2.  **设计成单例或静态工具**：我们希望全局就一个协程跑腿就够了，不需要每次new好多对象出来。所以常用单例模式，或者干脆用静态类+静态方法实现。
    
3.  **隐藏在场景中**：因为需要 MonoBehaviour 才能调度协程，我们会在幕后弄一个 GameObject 挂上这个 `CoroutineRunner` 脚本。一种做法是在第一次使用时动态 `new GameObject("CoroutineRunner").AddComponent<CoroutineRunner>()`。可以把这个 GameObject 标记为 `DontDestroyOnLoad`，这样切场景也不会丢失它。
    
4.  **提供静态接口**：比如写一个 `public static Coroutine Run(IEnumerator routine)` 方法，对外封装 `StartCoroutine` 调用。内部会确保初始化 MonoBehaviour 实例并执行协程。
    

说了这么多，直接看代码更直观：



```
using UnityEngine;
using System.Collections;

public class CoroutineRunner : MonoBehaviour {
    private static CoroutineRunner _instance;

    private static CoroutineRunner Instance {
        get {
            if (_instance == null) {
                GameObject runnerObj = new GameObject("CoroutineRunner");
                runnerObj.hideFlags = HideFlags.HideAndDontSave;
                DontDestroyOnLoad(runnerObj);
                _instance = runnerObj.AddComponent<CoroutineRunner>();
            }
            return _instance;
        }
    }

    public static Coroutine Run(IEnumerator routine) {
        return Instance.StartCoroutine(routine);
    }
}

```

上面这段 `CoroutineRunner` 实现了一个**懒加载单例**：第一次调用 `Run` 时检查 `_instance`，如果还没有，就动态创建一个游戏对象并挂载自己，然后标记为不销毁和隐藏【**设计考量1：单例隐藏对象**】。此后 `_instance` 就存在了，后续再调用就直接用已有实例来启动协程。

有了这个工具类，我们就可以这样使用协程：



```
CoroutineRunner.Run(MyCoroutine());

public static class HttpManager {
    public static void DownloadImage(string url, System.Action<Texture2D> onComplete) {
        CoroutineRunner.Run(DownloadImageRoutine(url, onComplete));
    }

    private static IEnumerator DownloadImageRoutine(string url, System.Action<Texture2D> onComplete) {
        using (UnityEngine.Networking.UnityWebRequest req = UnityEngine.Networking.UnityWebRequestTexture.GetTexture(url)) {
            yield return req.SendWebRequest();

            if (req.result != UnityEngine.Networking.UnityWebRequest.Result.Success) {
                Debug.LogError("下载失败: " + req.error);
            } else {
                Texture2D tex = UnityEngine.Networking.DownloadHandlerTexture.GetContent(req);
                onComplete?.Invoke(tex);
            }
        }
    }
}

```

如上，任何地方都可以通过 `CoroutineRunner.Run(...)` 静态方法来启动协程，而不用关心当前是不是在 MonoBehaviour 环境。**底层实际上是我们的隐藏对象在跑这个协程**。这样设计有几个好处：

-   **全局唯一，统一管理**：我们只有一个 `CoroutineRunner` GameObject，所有协程都跑在它上面，集中管理。也避免创建太多无谓的对象。
    
-   **生命周期可控**：我们将 `CoroutineRunner` 对象标记为 DontDestroyOnLoad，因此**整个游戏运行期间它都存在**。这意味着即使切换场景、原先发起协程的对象被销毁，我们的协程也能继续跑下去，不会受场景更换的影响【**设计考量2：避免协程中途中断**】。这点对于需要跨场景的后台任务非常有用。
    
-   **对使用方透明**：调用协程就像调用一个普通静态方法，没有额外参数，更简洁。外部也不需要了解协程细节，符合“工具类封装”的思想。
    

当然，实现这种中转器时也要注意几点：

-   **避免重复创建**：我们用单例模式确保只会创建一个隐藏物体。如果粗心每次 new GameObject，反而增加开销还可能管理混乱。
    
-   **隐藏物体不必渲染**：可以把 `hideFlags` 设为 `HideAndDontSave`，这样它不会显示在 Hierarchy 面板（运行时）且不会被场景保存【**设计考量3：不干扰场景**】。
    
-   **退出时清理**：通常不用特别清理，因为游戏退出脚本都销毁。但如果有 Editor 扩展的情况，可能要在 Editor 停止时清除实例（上面代码里我们没展开 Editor 模式处理，那是更高级场景了）。
    
-   **线程限制**：CoroutineRunner 启动的协程依然是在主线程执行（因为 Unity 的协程本就是在主线程按帧更新）。它不能绕开Unity的单线程限制，但可以方便地等待主线程上的异步操作。
    

很多 Unity 开发者会把这个 `CoroutineRunner` 脚本做成**预制单例**或**游戏管理器**的一部分。也有一些开源框架提供了类似的 **MonoHelper** 或 **CoroutineManager** 功能，把协程、Update等托管集中起来。原理都类似，不再细述。

总而言之，方案二通过**封装一个永久存在的隐藏 MonoBehaviour**，成功让我们在**任何地方都能悠然自得地使用协程**。以后再也不用为“手上没有 MonoBehaviour 可以调协程”而抓狂了！

----------

### 协程的生命周期陷阱与常见误区

Unity 协程虽好用，但也有一些坑点值得初学者注意。在这里我结合个人踩过的雷，列举几个协程生命周期相关的**常见陷阱**，帮大家避坑。

-   GameObject 被销毁或停用，协程会自动中断：如前文所述，协程是挂在 MonoBehaviour 对象上的。如果那个对象消失了，协程也跟着GG。这意味着如果你用某个短命的对象来跑协程，比如一发射出去就很快销毁的子弹对象，那么它上面的协程可能尚未完成就突然停止了，后续代码永远不会执行。比如很多人曾遇到过这种情况：子弹对象上启动了一个协程打算2秒后爆炸，结果子弹提前碰撞被 Destroy，协程直接被切断。
    
    对策：确保重要协程挂靠在长寿命的对象上（比如游戏管理器、CoroutineRunner那种全局对象）。如果一定要销毁对象，可以在销毁前用 StopCoroutine 等方法优雅地结束协程，或者把协程要做的事转移到别的对象上。
    
-   **`yield return null` 的真正含义**：很多新手看到 `yield return null` 可能会困惑，这里返回个 null 是啥意思，难道是结束协程吗？其实完全不是！**`yield return null` 并不会终止协程，而是表示等待**“**下一帧**”**再继续**。Unity 引擎看到协程 Current 返回 null，会理解为什么都不等，于是在**下一帧**重新调度协程的执行。所以它的作用相当于“暂停协程到下一帧”。如果你想彻底退出协程，需要用的是 `yield break`（或者让IEnumerator函数自然执行完返回）——`yield break` 才是立即终止协程的意思。
    
    另外，Unity 提供了许多不同的 yield 指令：例如返回 `WaitForSeconds` 可以等待指定秒数，返回 `WaitUntil` 等待某条件满足等。但无论返回什么，本质都是**协程把控制权交还给引擎，等引擎判定条件达成后，再继续调用协程函数往下执行**。
    
-   **协程并不是新线程**：协程在本质上仍然是**在主线程执行**的，只是通过分帧异步避免一次性执行太久。因此，不要误以为启动协程就进入了多线程环境。协程里的代码和 Update 一样，都是每帧跑一点。如果你需要真正的后台线程处理，应该使用 C# 的 `Task` 或线程，而**不能指望协程提升性能**（协程主要提升的是代码写法的直观性和主线程的利用率，而非让你突破CPU瓶颈）。
    
-   **多个协程的调度**：Unity 允许同时启动多个协程，它们会并行推进。协程之间互不阻塞，但可能交叉执行顺序不确定。例如即便你先调用 CoroutineA 再 CoroutineB，两者也可能独立运行各自的等待逻辑，并不保证先启动的一定先结束。如果有协程需要等待另一个协程完成，可以使用 `yield return StartCoroutine(OtherCoroutine())` 这种嵌套等待的方式。
    
-   **异常处理**：如果协程函数里抛出了未捕获的异常，Unity 通常会在控制台报错并终止该协程。因此，重要的协程代码里可以考虑用 try-catch 包裹，以免某帧的异常导致整个协程中断而你还蒙在鼓里。
    

总的来说，协程的机制虽然简单，但**和 Unity 对象的生命周期息息相关**，稍不注意就可能出现协程半路夭折的情况。新手要特别留意**对象销毁/停用**对协程的影响。善加利用像 CoroutineRunner 这样的工具，可以降低协程中断的风险，因为它跑在一个全局对象上，不太可能莫名没了。

----------

### 协程 vs async/await：局限与未来展望

自从 C# 引入了 `async/await` 关键字，异步编程变得更加优雅和强大。相比之下，Unity 的协程显得有点“土生土长”，在现代 C# 环境下有一些**局限性**：

-   **无法直接获取返回值**：协程本质是 `IEnumerator`，不像 `Task<T>` 那样自带泛型结果。要从协程获取运行结果，只能通过回调、全局变量或 `out` 参数等方式，略显麻烦。
    
-   **错误处理不够方便**：如上所述，协程内部异常只能靠日志或try-catch自己处理，不能像 `await` 那样用常规的 try-catch 流程捕获任务异常（因为协程不是函数返回 Task，无法 `await` 自然捕获异常传播）。
    
-   **调试难度**：协程的执行路径是分段的，调用栈在挂起时并不连贯。这给调试带来一些困难。而使用 async/await 时，Visual Studio 等对 Task 异步有更好的支持（比如能抓到 async 中的异常和调用栈）。
    
-   **与 .NET 异步生态脱节**：Unity 协程是 Unity 自己的一套东西，和标准 .NET 的 Task 并不直接兼容。如果你想 `await` 一个协程，得借助特殊工具（如 Unity 提供的 AsyncOperationAwaiter 或第三方库）才能做到。
    

基于这些原因，Unity 社区近年来出现了一些针对性的方案，**试图将 async/await 模式引入 Unity** 来替代或补强化程。其中最有名的就是 **UniTask**。UniTask 是由 Cysharp 开发的一个高性能异步库，它让你可以在 Unity 中使用 `async/await` 编写异步代码，同时内部通过魔法实现了零GC开销、主线程调度等特性。简单来说，**UniTask 把协程能做的事情基本都能做到了，而且语法更简洁，性能也更好**（比如可以返回结果、合并异步任务、并发等待等）。有了 UniTask，我们很多原来用协程写的代码可以改写成 `async` 函数，更加贴近 C# 原生的异步风格。

举个小对比：

协程写法：



```
IEnumerator LoadDataCoroutine() {
    yield return new WaitForSeconds(1f);
    Debug.Log("数据加载完毕");
}

```

UniTask 异步写法：



```
async UniTask LoadDataAsync() {
    await UniTask.Delay(TimeSpan.FromSeconds(1));
    Debug.Log("数据加载完毕");
}

```

看起来后者是不是更直观？而且 `UniTask.Delay` 等价于 WaitForSeconds，但没有GC分配。更棒的是，我们可以直接在代码中 `await LoadDataAsync()`，拿到结果或者 catch 异常，就跟普通 C# 异步函数一样，这都是协程很难优雅做到的。

当然，引入 UniTask 也有成本，比如需要额外的库支持，而且对于非常简单的场景，协程已经够用了。

----------

### 总结

好了，写了这么多，恭喜你坚持看到了这里！我们从协程的基础原理一路聊到如何在非 MonoBehaviour 类中使用协程，以及一些协程使用过程中的坑和进阶话题。希望这篇教程能帮你**厘清 Unity 协程的工作方式**，并掌握在特殊场景下启动协程的技巧。

简单回顾一下核心要点：

-   **协程必须由 MonoBehaviour 驱动**：`StartCoroutine` 是 MonoBehaviour 的方法，协程的执行和 MonoBehaviour 生命周期绑定。非 Mono 类直接用协程会遇到限制。
    
-   **解决方案一**：传入或持有一个 MonoBehaviour 引用，在非 Mono 类中借助它来调用协程。简单直接，但需管理好引用的生命周期。
    
-   **解决方案二**：封装一个 **CoroutineRunner** 工具类，内部用隐藏的 MonoBehaviour 来统一启动协程。提供静态方法让任意地方都能方便地跑协程而无需关心 Mono 对象。
    
-   **协程生命周期陷阱**：注意 GameObject 的激活/销毁对协程的影响，`yield return null` 只是等一帧不是结束协程，使用协程要防范半途终止等情况。
    
-   **协程局限与展望**：协程无法返回值、异常处理麻烦，在更现代的 async/await 模式面前有些不足。社区推出了 UniTask 等方案来弥补这些不足，使异步代码更强大易用。
    

作为一名 Unity 开发者，协程绝对是日常工作中的好帮手。掌握了上述技巧后，你就不用再担心“非 Mono 类里不能用协程”这样的问题了，大可按照代码架构需要选择合适的方法去启动协程。更进阶的异步技巧（比如 UniTask）也值得一试，但协程依然会在相当长一段时间内是 Unity 编程的主力工具。

希望这篇教程对你有所帮助！