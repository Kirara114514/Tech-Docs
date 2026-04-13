

### 第一篇文章大纲：Unity GameObject/组件 vs Unreal Actor/UObject

这篇文章将作为整个系列的开篇，重点对比 Unity 的核心设计哲学与 Unreal 的核心对象模型。

1.  **引言：**
    
    -   Unity 的“万物皆对象”与组件化哲学。
        
    -   Unreal 的“万物皆可被实例”与 C++/蓝图分层。
        
2.  **Unity GameObject/Component 架构回顾：**
    
    -   **GameObject：** 仅作为容器，承载位置、旋转、缩放等基本变换信息。
        
    -   **Component：** 真正的逻辑载体，所有功能通过挂载组件实现，例如 `MeshRenderer`, `BoxCollider`, `MonoBehaviour` 等。
        
    -   **组合优于继承：** 通过组合不同的组件来构建复杂对象，实现高度的灵活性和可重用性。
        
3.  **Unreal Actor/UObject 对象系统核心概念：**
    
    -   **UObject：**
        
        -   Unreal 的基础对象，具备反射、垃圾回收和序列化等核心特性。
            
        -   **UClass：** 描述 UObject 的元数据，用于反射和蓝图。
            
        -   讲解 UObject 如何通过宏 `UCLASS()` 和 `USTRUCT()` 暴露给引擎。
            
    -   **AActor (Actors)：**
        
        -   能在游戏世界中“存在”的对象，拥有位置和旋转等变换属性。
            
        -   每个 Actor 都继承自 UObject，并拥有一个 **Root Component** 作为变换的根节点。
            
        -   强调 Actor 是可被放置在关卡中的实体。
            
    -   **UActorComponent (Actor Components)：**
        
        -   与 Unity Component 类似，可以被附加到 Actor 上，提供特定功能。
            
        -   **区分：** Unity Component 必须挂在 GameObject 上，而 Unreal Component 必须挂在 Actor 上。
            
        -   **常用组件：** `StaticMeshComponent`, `BoxComponent`, `CharacterMovementComponent` 等。
            
4.  **核心对比与迁移思路：**
    
    -   **Unity GameObject + Component** -> **Unreal Actor + ActorComponent**。
        
    -   Unity 中一个空 GameObject 常常用来组织结构，在 Unreal 中，通常会创建一个 Actor 或使用一个不带网格的 `USceneComponent` 作为根组件来组织子组件。
        
    -   讲解 C++ 代码中如何定义一个继承自 **AActor** 的类，并在其中添加 **UActorComponent**。
        
5.  **小结：** 总结两个引擎核心对象架构的异同，并强调理解 Unreal Actor 的“内置”和“可附加”组件概念是转型的第一步。
    

----------

### 第二篇文章大纲：生命周期与组件关系

本文将深入探讨 Unity 与 Unreal 对象生命周期的异同，并详细解释 Unreal 中 Actor 与其组件之间的生命周期联动。

1.  **引言：**
    
    -   生命周期是游戏开发中处理初始化、更新、销毁等逻辑的核心。
        
    -   Unity MonoBehaviour 的生命周期非常明确，Unreal 的生命周期相对分散，需要系统性地理解。
        
2.  **Unity MonoBehaviour 生命周期回顾：**
    
    -   **Awake()：** 对象实例化后立即调用，无论是否启用。
        
    -   **OnEnable()：** 启用时调用。
        
    -   **Start()：** 在第一帧 `Update()` 前调用。
        
    -   **Update()/FixedUpdate()/LateUpdate()：** 核心的每帧更新循环。
        
    -   **OnDisable()/OnDestroy()：** 对象被禁用或销毁时调用。
        
3.  **Unreal Actor 生命周期详解：**
    
    -   **构造函数 (Constructor)：**
        
        -   **何时调用：** 对象创建时（例如 `NewObject` 或 `SpawnActor`），以及在编辑器中每次更改属性时都会调用。
            
        -   **职责：** 主要用于设置对象的默认值和创建组件。
            
        -   **注意事项：** 构造函数中不应进行任何与世界（World）相关的操作，如获取其他 Actor 或进行物理查询。
            
    -   **PostInitializeComponents()：**
        
        -   在所有组件都已构造后调用，是 Actor 初始化链中的一个关键点。
            
    -   **BeginPlay()：**
        
        -   **何时调用：** 在游戏开始时（`BeginPlay` 相当于 Unity 的 `Start`）。
            
        -   **职责：** 进行游戏逻辑的初始化，如注册事件、获取其他对象引用等。
            
        -   **重要性：** 这是进行游戏交互的第一个安全时机。
            
    -   **Tick()：**
        
        -   **何时调用：** 默认每帧调用。
            
        -   **职责：** 处理每帧更新的游戏逻辑。
            
        -   **注意事项：** 讲解如何关闭或控制 `Tick` 频率以优化性能。
            
    -   **EndPlay()：**
        
        -   **何时调用：** 当 Actor 被销毁或关卡结束时。
            
        -   **职责：** 销毁前释放资源、注销事件、清理引用等。
            
4.  **Actor 与组件的生命周期关系：**
    
    -   组件的生命周期与其所属的 Actor 紧密相连。
        
    -   `UActorComponent` 也有自己的 `InitializeComponent()`, `BeginPlay()` 和 `Tick()`。
        
    -   **执行顺序：** 讲解 Actor 的 `BeginPlay()` 和其组件的 `BeginPlay()` 的执行顺序，帮助读者理解初始化流程。
        
    -   **销毁：** 当 Actor 被销毁时，其拥有的所有组件也会被自动销毁。
        
5.  **核心对比与迁移思路：**
    
    -   **Awake()** -> **Constructor (构造函数)**。
        
    -   **Start()** -> **BeginPlay()**。
        
    -   **Update()** -> **Tick()**。
        
    -   **OnDestroy()** -> **EndPlay()**。
        
    -   通过代码示例，演示如何用 Unreal 的生命周期函数实现 Unity 中的常见逻辑。
        

----------

### 第三篇文章大纲：Gameplay Framework 核心类详解

本篇文章将介绍 Unreal Engine 独特的 Gameplay Framework，这是构建所有游戏的基础，与 Unity 的自由模式完全不同。

1.  **引言：**
    
    -   Unity 允许开发者从零开始构建游戏结构，Unreal 则提供一套成熟的 Gameplay Framework，极大地提升了开发效率。
        
    -   理解这套框架的各个类及其职责，是掌握 Unreal 架构的关键。
        
2.  **核心 Gameplay Framework 类职责：**
    
    -   **AGameMode (游戏模式)：**
        
        -   **职责：** 定义游戏的规则，例如游戏胜利条件、玩家生成点、玩家类型等。
            
        -   **重要性：** 整个游戏的“心脏”，只存在于服务器端。
            
        -   **与 Unity 区分：** 类似于 Unity 中一个大的 GameManager，但职责更加明确和固定。
            
    -   **AController (控制器)：**
        
        -   **职责：** 充当玩家或 AI 与其控制的 Pawn/Character 之间的“大脑”。
            
        -   **类型：** 分为 `APlayerController` (玩家) 和 `AAIController` (AI)。
            
        -   **关系：** **AController** 拥有一个 **APawn** 或 **ACharacter**，但一个 **Pawn** 不一定被控制。
            
    -   **APawn/ACharacter (可控角色)：**
        
        -   **APawn：** 游戏中可被控制器拥有的物理实体，如一个摄像头或一辆车。
            
        -   **ACharacter：** `APawn` 的子类，专门用于人形角色，内置了 `CharacterMovementComponent` 等组件。
            
    -   **AGameState/APlayerState (游戏状态)：**
        
        -   **AGameState：** 同步服务器端的游戏全局状态到所有客户端，例如游戏时间、得分。
            
        -   **APlayerState：** 同步单个玩家的状态到所有客户端，例如玩家名称、分数、血量。
            
        -   **与 Unity 区分：** 相当于 Unity 中需要手动编写同步逻辑才能实现的全局/玩家状态管理器。
            
    -   **AHUD (抬头显示)：**
        
        -   **职责：** 管理游戏中的 2D UI 元素，如血条、弹药数。
            
        -   **与 UMG 关系：** 通常在 HUD 中创建并显示 UMG Widgets。
            
3.  **框架运作流程图解：**
    
    -   通过一张流程图，清晰地展示 `GameMode` 如何生成 `Pawn` 和 `Controller`，以及 `GameState` 和 `PlayerState` 如何在网络游戏中同步状态。
        
4.  **核心对比与迁移思路：**
    
    -   Unity 开发者在转到 Unreal 后，最大的挑战之一就是适应这套框架。
        
    -   讲解如何在 Unity 中用单例模式或 `ScriptableObject` 模拟类似的功能，帮助读者建立类比。
        
    -   强调应在各自对应的类中编写逻辑，而不是将所有逻辑都塞进一个 `Pawn` 或 `Controller` 类中。
        

----------

### 第四篇文章大纲：UObject 反射系统与垃圾回收机制

本文将详细解析 Unreal 引擎独特的 UObject 类反射系统，并重点阐述其基于引用计数的垃圾回收机制，这是与 Unity 的 GC 截然不同的设计。

1.  **引言：**
    
    -   Unity C# 的反射和垃圾回收由 .NET 虚拟机自动处理。
        
    -   Unreal 在 C++ 层实现了一套独特的系统，用于管理内存和对象属性，这对于理解引擎底层至关重要。
        
2.  **UObject 类反射系统：**
    
    -   **UFUNCTION/UPROPERTY 宏：**
        
        -   讲解这两个宏的作用，它们是 Unreal 反射系统的核心。
            
        -   `UPROPERTY()` 宏：暴露变量给编辑器、蓝图，并使其参与垃圾回收和序列化。
            
        -   `UFUNCTION()` 宏：使 C++ 函数可以在蓝图中被调用、被 RPC (远程过程调用) 或被事件系统触发。
            
    -   **UClass 与元数据：**
        
        -   每个 `UObject` 在运行时都会有一个对应的 `UClass`，存储其元数据（属性、函数信息等）。
            
        -   解释如何通过 `UObject` 指针来获取其 `UClass`，并进行动态类型转换。
            
3.  **Unreal 的垃圾回收机制：**
    
    -   **核心：** 基于引用图的标记-清除垃圾回收。
        
    -   **工作原理：** 解释垃圾回收器如何从“根集（Root Set）”开始遍历所有 `UObject` 指针，将可达的对象标记为“活着”，然后销毁未标记的对象。
        
    -   **根集：** 讲解哪些对象被认为是根集，例如 `UWorld`, `AGameMode`, `AActor` 等。
        
    -   **智能指针：**
        
        -   `TStrongObjectPtr`：强引用智能指针，可以防止对象被垃圾回收。
            
        -   `TWeakObjectPtr`：弱引用智能指针，不会阻止对象被回收，在访问前需检查指针是否有效。
            
        -   **对比：** 强调**UObject**的指针管理与**C++普通对象**（需要手动 `new`/`delete`）的区别。
            
4.  **核心对比与迁移思路：**
    
    -   **垃圾回收：** **Unity 的 GC** vs **Unreal 的 UObject GC**。
        
    -   **内存管理：** C++ 中普通对象需要手动管理内存，这一点是 C# 开发者需要格外注意的。
        
    -   **指针使用：** C# 开发者不常接触指针，需要适应 Unreal 中的 `->` 操作符以及对悬空指针的检查。
        
    -   通过实例，演示如何正确地使用 `UPROPERTY` 宏来管理引用，以及如何使用 `TWeakObjectPtr` 来避免循环引用。
        

----------

### 第五篇文章大纲：关卡与世界体系及坐标系与单位

这篇文章将解释 Unreal 中独特的 Level/World 体系，并详细对比两个引擎在坐标系和单位上的差异，这直接影响到模型的导入和游戏对象的放置。

1.  **引言：**
    
    -   在游戏开发中，场景的组织与管理是关键。
        
    -   Unreal 的关卡体系提供了更强大的流式加载和协作功能。
        
2.  **Unity Scene (场景) 体系回顾：**
    
    -   **核心概念：** 一个场景文件 (`.unity`) 包含所有游戏对象、光照、渲染设置等。
        
    -   **流式加载：** 通过 `SceneManager.LoadScene` 的 `Additive` 模式，将多个场景叠加在一起。
        
3.  **Unreal Level/World (关卡/世界) 体系详解：**
    
    -   **World (世界)：**
        
        -   **核心概念：** 是一个容器，用于存放所有 `Level`。每个游戏进程只有一个 `World`。
            
    -   **Level (关卡)：**
        
        -   **核心概念：** 存储一组 `Actor` 的文件 (`.umap`)，相当于 Unity 的场景。
            
        -   **Persistent Level (持久关卡)：** 在游戏中始终加载的主关卡。
            
        -   **Sub-Level (子关卡)：**
            
            -   可以被动态加载或卸载，用于大型开放世界中的场景流式加载（**Streaming Levels**）。
                
            -   支持多人同时编辑不同的子关卡，提高协作效率。
                
            -   讲解 **World Partition**（UE5 新功能）如何简化了超大世界的管理。
                
4.  **坐标系与单位差异：**
    
    -   **Unity：**
        
        -   单位：默认使用**米 (m)**。
            
        -   坐标系：**Y 轴朝上**。
            
        -   **右手坐标系**。
            
    -   **Unreal：**
        
        -   单位：默认使用**厘米 (cm)**。
            
        -   **模型导入：** 从 Unity 迁移到 Unreal 的美术资源，需要在导入前将单位调整为厘米。
            
        -   坐标系：**Z 轴朝上**。
            
        -   **左手坐标系**。
            
    -   **核心对比与迁移思路：**
        
        -   用图示直观对比两个引擎的坐标系。
            
        -   强调在模型导出、导入和物理计算中，单位和轴向的转换是必须的步骤。
            

----------

### 第六篇文章大纲：全局单例管理与引擎模块化

本文将探讨 Unreal Engine 中如何管理全局数据和代码结构，并深入解析其模块化架构，这是 Unity 开发者较少接触到的概念。

1.  **引言：**
    
    -   Unity 开发者习惯使用单例模式来管理全局数据，Unreal 提供了更结构化的方案。
        
    -   Unreal 的模块化设计，使得开发者能够深度定制引擎，这是 Unity 无法比拟的优势。
        
2.  **Unity 的全局单例管理：**
    
    -   **常见模式：** 通过 `DontDestroyOnLoad` 和静态单例模式来实现全局管理，例如 `GameManager`, `SoundManager`。
        
    -   **优缺点：** 简单易用，但耦合度高，且在大型项目中难以管理。
        
3.  **Unreal 的全局单例管理：**
    
    -   **GameInstance：**
        
        -   **核心概念：** 是一个全局单例，贯穿整个游戏生命周期，即使切换关卡也不会销毁。
            
        -   **职责：** 管理跨关卡的全局数据，例如玩家进度、网络连接等。
            
    -   **Subsystem (子系统)：**
        
        -   **核心概念：** Unreal 4.22+ 引入的新模式，用于管理更精细的全局功能。
            
        -   **类型：** `GameInstanceSubsystem`, `WorldSubsystem`, `EngineSubsystem` 等。
            
        -   **优点：** 替代了传统的单例模式，可以更好地解耦和组织代码。
            
4.  **引擎模块化架构：**
    
    -   **核心概念：** Unreal 引擎由一系列独立的模块（Modules）组成，每个模块有其独立的 `Build.cs` 构建脚本。
        
    -   **模块分类：** 引擎模块、编辑器模块、插件模块等。
        
    -   **优点：** * **高度可定制：** 可以按需编译特定模块，甚至修改引擎源码。
        
        -   **代码分离：** 项目逻辑可以封装在独立的模块中，方便管理和重用。
            
    -   **与 Unity 区分：**
        
        -   Unity 引擎是封闭的，游戏逻辑主要在脚本层，通过 `Assembly Definition` (`.asmdef`) 来组织代码。
            
        -   Unreal 允许你将核心游戏逻辑作为独立的模块（如 `ProjectName.Build.cs`），甚至可以创建插件来分发功能。
            
5.  **核心对比与迁移思路：**
    
    -   **Unity 的单例** -> **Unreal 的 GameInstance/Subsystem**。
        
    -   **Unity 的 `.asmdef`** -> **Unreal 的 `.Build.cs`**。
        
    -   通过实例，展示如何创建一个简单的 `GameInstanceSubsystem` 来管理全局玩家数据，以及如何创建并配置一个简单的模块。
        





