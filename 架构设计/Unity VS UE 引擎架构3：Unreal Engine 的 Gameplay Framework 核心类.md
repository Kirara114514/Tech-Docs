# Unity VS UE 引擎架构3：Unreal Engine 的 Gameplay Framework 核心类

## 摘要
经过前面两篇文章的铺垫，我们已经掌握了 Unreal 的核心对象模型和生命周期。现在，我们将进入一个完全不同的领域，也是许多从 Unity 转向 Unreal 的开发者遇到的最大挑战之一：**Gameplay Framework**。 在 Unity 中，你拥有极高的自由度。你可以创建一个 `GameManager` 单例，用一个巨大的脚本来处理所有游戏逻辑，也可以用 `Scriptable...

## 正文

经过前面两篇文章的铺垫，我们已经掌握了 Unreal 的核心对象模型和生命周期。现在，我们将进入一个完全不同的领域，也是许多从 Unity 转向 Unreal 的开发者遇到的最大挑战之一：**Gameplay Framework**。

在 Unity 中，你拥有极高的自由度。你可以创建一个 `GameManager` 单例，用一个巨大的脚本来处理所有游戏逻辑，也可以用 `ScriptableObject` 来管理数据，一切都取决于你的个人喜好和架构能力。这把双刃剑的利在于灵活，弊在于当项目复杂时，很容易变得混乱和难以维护。

Unreal 的设计哲学则截然不同。它提供了一套**成熟且结构化的 Gameplay Framework**，这是一套为游戏量身定制的蓝图，旨在解决大型项目中的常见问题，尤其是在多人联网游戏中。理解这套框架的每一个组成部分及其职责，是你在 Unreal 中高效开发的关键。

----------

# 深度剖析：Unreal Engine 的 Gameplay Framework 核心类

### 核心 Gameplay Framework 类职责

Unreal 的 Gameplay Framework 由一系列职责分明的核心类组成，它们共同协作，构成了游戏运行的骨架。

#### `AGameMode` (游戏模式)

你可以把 `AGameMode` 想象成整个游戏的“总导演”或“心脏”。它定义了游戏的**规则**，但本身并不存在于游戏世界中。

-   **职责**：
    
    -   定义游戏类型和规则，如玩家数量、胜利条件、失败条件等。
        
    -   负责玩家的生成（Spawn）和管理。
        
    -   在服务器端运行，所有客户端共享一套相同的游戏规则。
        
-   **与 Unity 的区别**：它类似于 Unity 中一个巨大的 `GameManager` 单例，但职责更加明确和固定。在 Unreal 中，你不应该把所有游戏逻辑都塞进 `GameMode` 里，它的主要任务是**定义规则和流程**，而不是执行具体的游戏操作。
    

#### `AController` (控制器)

如果说 `GameMode` 是“导演”，那么 `AController` 就是玩家或 AI 的“大脑”。它负责**接收输入**并**控制**一个**Pawn**或**Character**。

-   **职责**：
    
    -   接收玩家的输入（键盘、鼠标、手柄）或 AI 的指令。
        
    -   控制其所拥有的 **Pawn/Character** 进行移动、射击等操作。
        
-   **类型**：
    
    -   `APlayerController`：由真人玩家控制。
        
    -   `AAIController`：由 AI 逻辑控制。
        
-   **关系**：一个 `Controller` **拥有（Possess）一个 `Pawn`。两者是一对一**的关系。但一个 `Pawn` 不一定被 `Controller` 控制，比如场景中的静态物体。
    

#### `APawn` 与 `ACharacter` (可控角色)

`APawn` 是游戏中可以被 `Controller` **拥有**的物理实体。它具备在游戏世界中移动、与物理引擎交互的能力。

-   **`APawn`**：一个基础的、可被控制的实体。你可以用它来表示一辆车、一个无人机、或者一个自由移动的摄像头。
    
-   **`ACharacter`**：一个**专门为人形角色设计的 `Pawn` 子类**。它内置了 `CapsuleComponent` 和 `CharacterMovementComponent` 等组件，专门用于处理复杂的人形移动、跳跃、攀爬等逻辑。在开发第三人称或第一人称游戏时，几乎总是使用 `ACharacter`。
    

#### `AGameState` 与 `APlayerState` (游戏状态)

这两个类是 Unreal 架构中为了处理**网络同步**而设计的。它们都在服务器和客户端之间进行数据同步。

-   **`AGameState`**：用于同步**全局游戏状态**。
    
    -   **职责**：存储和同步所有玩家都能访问的全局信息，比如当前游戏时间、回合数、总比分等。
        
-   **`APlayerState`**：用于同步**单个玩家的状态**。
    
    -   **职责**：存储和同步一个特定玩家的信息，比如玩家名称、当前分数、生命值、团队等。
        
-   **与 Unity 的区别**：在 Unity 中，如果你要做一个多人游戏，你需要手动编写复杂的网络代码来同步这些全局和玩家数据。Unreal 的这套框架则将这些职责划分到了 `GameState` 和 `PlayerState` 中，大大简化了网络同步的开发。
    

#### `AHUD` (抬头显示)

-   **职责**：管理游戏中的 2D UI 元素，如血条、弹药数、小地图等。
    
-   **与 UMG 的关系**：通常在 `AHUD` 类中创建并显示基于 **UMG（Unreal Motion Graphics）**的 UI Widget。
    

----------

### 框架运作流程图解

下面这张流程图将清晰地展示这些核心类在游戏中的运作流程，尤其是在一个简单的网络游戏中：

代码段

```
graph TD
    A[服务器启动] --> B(GameMode 被创建);
    B --> C{玩家加入游戏};
    C --> D[GameMode 创建 APlayerController];
    D --> E[GameMode 创建 APlayerState];
    D --> F[GameMode 创建并拥有 APawn/ACharacter];
    E --> G[APlayerState 同步玩家数据到客户端];
    G --> H[客户端显示玩家UI];
    F --> I{Controller 接收玩家输入};
    I --> J[Controller 控制 Pawn 移动];
    F --> K{游戏运行};
    K --> L[AGameState 同步全局游戏数据];
    L --> M[客户端显示全局UI];

```

-   当游戏开始时，`GameMode` 首先被创建。
    
-   有玩家加入时，`GameMode` 负责创建这个玩家的 `PlayerController` 和 `PlayerState`。
    
-   接着，`PlayerController` 会被 `GameMode` 赋予一个 `Pawn` 来控制。
    
-   在整个游戏过程中，`PlayerState` 负责同步玩家自己的数据，而 `GameState` 负责同步全局数据。
    

----------

### 核心对比与迁移思路

对 Unity 开发者来说，理解并适应这套框架是转型的最大挑战。你的第一反应可能是：“为什么需要这么多类？我用一个脚本就能搞定！”。但正是这种分工，让 Unreal 项目在扩展性、可维护性和多人开发协作方面具有巨大优势。

-   **Unity GameManager -> Unreal Gameplay Framework**：在 Unity 中，你可能会用一个 `GameManager` 单例来管理游戏状态、玩家信息和游戏规则。在 Unreal 中，这些职责被明确地拆分给了 `GameMode`、`GameState` 和 `PlayerState`。
    
-   **Unity 角色脚本 -> Unreal Pawn/Controller**：在 Unity 中，玩家的输入、移动逻辑和角色状态可能都集中在一个 `MonoBehaviour` 脚本里。在 Unreal 中，**输入逻辑属于 `Controller`，而移动和物理相关的逻辑属于 `Pawn`**。这种分离让多人游戏开发变得更容易，因为你可以通过交换 `Controller` 来让 AI 或另一个玩家来控制同一个 `Pawn`。
    

**如何用 Unity 的模式类比 Unreal 的 Gameplay Framework？**

-   **`GameMode`**：相当于一个 `ScriptableObject`，里面包含了所有游戏规则和设置，但它不执行任何游戏逻辑。它只是一个**数据和配置**的容器。
    
-   **`Controller`**：相当于一个专门负责**处理输入**的 `MonoBehaviour`，它不直接管理角色的物理移动，而是通过引用来调用另一个脚本的移动函数。
    
-   **`Pawn`**：相当于一个专门负责**物理移动和碰撞**的 `MonoBehaviour`，它不处理输入，只执行 `Controller` 传递给它的指令。
    

**最重要的迁移建议**：在 Unreal 中，不要试图把所有代码都塞进一个类里。养成习惯，在对应的类里编写对应的逻辑：

-   **游戏规则**：写在 `AGameMode` 里。
    
-   **玩家输入和“思考”**：写在 `AController` 里。
    
-   **角色物理移动和动画**：写在 `APawn` 或 `ACharacter` 里。
    
-   **全局游戏状态**：写在 `AGameState` 里。
    
-   **单个玩家状态**：写在 `APlayerState` 里。
    

通过这种方式，你的代码会更加清晰、可维护，并且从一开始就为多人游戏做好了准备。这套框架的精妙之处，只有在真正开始用它构建项目后才能体会到。

在下一篇文章中，我们将深入 Unreal 的底层：**UObject 反射系统与垃圾回收机制**。这是理解 Unreal C++ 的核心，也是你在 C++ 和蓝图之间无缝切换的魔法所在。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** unity, ue, unreal, 架构
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*