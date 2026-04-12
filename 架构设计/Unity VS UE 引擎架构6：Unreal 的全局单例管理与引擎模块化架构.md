# Unity VS UE 引擎架构6：Unreal 的全局单例管理与引擎模块化架构

## 摘要
您好！这是本系列的第六篇文章，也是收官之作。我们已经从宏观的对象模型和生命周期，到中观的 Gameplay Framework 和底层内存管理，再到微观的坐标系和关卡体系，一步步深入 Unreal 的核心。 现在，我们将探索 Unreal 架构的最后一块拼图：**全局数据管理与引擎模块化**。这部分内容对于习惯了 Unity 的“All-in-One”脚本模式的开发者来说，是理解 Unrea...

## 正文

您好！这是本系列的第六篇文章，也是收官之作。我们已经从宏观的对象模型和生命周期，到中观的 Gameplay Framework 和底层内存管理，再到微观的坐标系和关卡体系，一步步深入 Unreal 的核心。

现在，我们将探索 Unreal 架构的最后一块拼图：**全局数据管理与引擎模块化**。这部分内容对于习惯了 Unity 的“All-in-One”脚本模式的开发者来说，是理解 Unreal 工程化、可定制化和大规模协作能力的关键。

----------

# 深度剖析：Unreal 的全局单例管理与引擎模块化架构

### Unity 的全局单例模式

在 Unity 中，你可能会用以下模式来管理那些需要在不同场景之间持久存在的数据和功能：

1.  **`DontDestroyOnLoad`**：将一个 `GameObject` 标记为“不随场景加载而销毁”。
    
2.  **静态单例**：创建一个静态的 `Instance` 变量，并通过它来访问全局数据。
    

C#

```
public class GameManager : MonoBehaviour
{
    public static GameManager Instance;

    void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }
}

```

这种模式简单易用，但缺点也很明显：所有全局功能都被集中在一个巨大的类中，导致代码耦合度高、职责不清晰，并且在大型项目中难以维护。

----------

### Unreal 的全局单例管理：结构化方案

Unreal 为全局管理提供了更具结构化的解决方案，它将全局数据的职责分配给两个核心类：`GameInstance` 和 `Subsystem`。

#### `GameInstance`

`GameInstance` 是一个全局单例，它会在游戏进程启动时创建，并且**贯穿整个游戏生命周期，即使切换关卡也不会被销毁**。

-   **职责**：管理需要在**多个关卡之间共享的全局数据**。例如，玩家的存档进度、网络连接状态、账户信息、或一些全局性的配置。
    
-   **如何访问**：你可以通过 `GetGameInstance()` 函数随时获取 `GameInstance` 的引用。
    

你可以将 `GameInstance` 看作是 Unity 中 `DontDestroyOnLoad` 和单例模式的结合体，但它的职责更加明确。

#### `Subsystem` (子系统)

Unreal Engine 4.22 引入的 `Subsystem` 模式是对 `GameInstance` 的补充，它提供了一种更优雅、更解耦的全局功能管理方式。

-   **核心概念**：`Subsystem` 是一种轻量级的、可复用的单例，用于管理更精细的、特定于某个范围的功能。
    
-   **类型**：Unreal 提供了多种类型的 `Subsystem`，最常见的是：
    
    -   **`GameInstanceSubsystem`**：用于管理跨关卡的全局数据，可以完美替代那些需要在 `GameInstance` 中创建的复杂功能。
        
    -   **`WorldSubsystem`**：用于管理特定于某个 `World`（即关卡）的功能，比如关卡内特定类型的 AI 管理器。
        
    -   **`EngineSubsystem`**：用于管理贯穿整个引擎生命周期的功能。
        

**优点**：`Subsystem` 模式通过接口和多态，实现了高度的解耦。每个子系统都专注于单一职责，这使得代码更易于测试、维护和重用。

**示例：创建一个简单的 `GameInstanceSubsystem`**

C++

```
// MySaveGameSubsystem.h
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "MySaveGameSubsystem.generated.h"

UCLASS()
class UMySaveGameSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // A function to save player progress
    void SavePlayerProgress(int32 PlayerScore);
};

```

在 `.cpp` 文件中实现 `Initialize` 和 `SavePlayerProgress` 逻辑。要访问这个子系统，你只需要：

C++

```
UMySaveGameSubsystem* SaveSystem = GetGameInstance()->GetSubsystem<UMySaveGameSubsystem>();
if (SaveSystem)
{
    SaveSystem->SavePlayerProgress(100);
}

```

这种方式比直接在 `GameInstance` 中编写所有逻辑要清晰得多。

----------

### 引擎模块化架构

Unreal Engine 的另一个巨大优势是其**模块化架构**。这与 Unity 的封闭引擎架构形成鲜明对比。

-   **核心概念**：Unreal 引擎本身就是由一系列独立的**模块（Modules）**组成的，每个模块都有其独立的构建脚本 `Build.cs`。你的游戏项目也是一个或多个模块。
    
-   **`Build.cs` 与 Unity 的 `.asmdef`**：在 Unity 中，你用 `.asmdef` 来组织代码，以便进行编译和管理依赖。Unreal 的 `Build.cs` 脚本则强大得多，它不仅定义了模块的依赖关系，还控制了编译设置、宏定义、头文件路径等。
    
-   **优点**：
    
    1.  **高度可定制**：你可以选择性地启用或禁用引擎模块，只编译你需要的部分，从而减小最终游戏的大小。
        
    2.  **插件系统**：Unreal 的插件本质上就是可独立分发的模块。你可以将你的游戏核心功能封装成插件，方便在不同项目之间重用和分享。
        
    3.  **源码访问**：如果你有引擎源码，可以随意修改任何模块，以满足你的项目需求，这是 Unity 无法比拟的。
        

与 Unity 的根本区别：

Unity 引擎是黑盒，你只能通过 C# 脚本和 Assembly Definition 来组织你的游戏逻辑。而 Unreal 引擎是白盒，你的项目代码本身就是引擎模块体系的一部分，你可以深度参与到引擎的架构中。

----------

### 核心对比与迁移思路


| 特性 | Unity |Unreal Engine|
|--|--|--|
| **全局管理** | 单例模式，`DontDestroyOnLoad` |`GameInstance` 和 `Subsystem`|
| **代码组织** | `.asmdef` |`Build.cs` 和模块化|
| **可定制性** | 封闭式，无法修改引擎源码 |白盒，可修改和定制任何模块|

**迁移关键点**：

-   **告别大型单例**：在 Unreal 中，忘记在 Unity 中用惯的“一个巨型 `GameManager` 脚本”模式。学会将全局职责分解，将跨关卡数据放入 `GameInstance`，将更细粒度的功能放入相应的 `Subsystem`。
    
-   **理解 `Build.cs`**：虽然在小项目中你可能不需要经常修改它，但理解 `Build.cs` 的作用，知道如何添加新的依赖，是进行 Unreal C++ 开发的基础。
    

通过这六篇文章，我们已经完整地从 Unity 的视角，剖析了 Unreal Engine 的核心架构。从对象模型、生命周期、框架，到内存管理、场景组织，再到全局单例和模块化，你应该已经对 Unreal 的设计哲学有了全面的认识。

现在，你已经具备了从零开始构建 Unreal 项目的知识基础。接下来，就请尽情地探索这个强大的引擎吧！


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** unity, ue, unreal, 架构
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*