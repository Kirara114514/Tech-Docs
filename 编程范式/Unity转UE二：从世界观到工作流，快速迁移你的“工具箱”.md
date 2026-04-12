# Unity转UE二：从世界观到工作流，快速迁移你的“工具箱”

## 摘要
上一篇文章我们完成了概念层面的类比，今天，我们将进一步深入，聚焦到具体的**功能实现**上。 你可能会觉得，从一个引擎切换到另一个，最大的挑战就是如何找到那些熟悉功能的**“翻译”**。比如，Unity 里的“刚体”在 Unreal 里叫什么？怎么实现“射线检测”？别担心，今天这篇文章就是你的“功能词典”。 ---------- ## 引言：从世界观到工作流，快速迁移你的“工具箱” 上一篇我...

## 正文

上一篇文章我们完成了概念层面的类比，今天，我们将进一步深入，聚焦到具体的**功能实现**上。

你可能会觉得，从一个引擎切换到另一个，最大的挑战就是如何找到那些熟悉功能的**“翻译”**。比如，Unity 里的“刚体”在 Unreal 里叫什么？怎么实现“射线检测”？别担心，今天这篇文章就是你的“功能词典”。

----------

## 引言：从世界观到工作流，快速迁移你的“工具箱”

上一篇我们探讨了 Unity 的 **GameObject** 和 Unreal 的 **Actor** 在设计哲学上的差异，这帮助我们建立了宏观的思维模型。而今天，我们的目标更加具体：把你在 Unity 中常用的那些“工具”和“技能”，一个一个地对号入座到 Unreal 的工作流中。

我们将从游戏开发中最基础、也最常用的几个模块入手：**输入、物理、AI 导航**。通过对比它们的实现方式，你将发现，虽然表面上 API 的名字和工作流程不同，但其背后的核心思想却有着惊人的相似之处。

----------

## 输入系统：从字符串到可重绑定的高级映射

### Unity 的输入系统：从旧到新

在 Unity 的旧输入系统（**Input Manager**）中，我们通常通过 `Input.GetAxis("Horizontal")` 或 `Input.GetKeyDown("Jump")` 这样的**字符串**来获取用户的输入。这种方式简单直接，但存在一些明显的缺点：不支持输入设备的热插拔，难以实现运行时按键重绑定，并且维护起来比较麻烦。

为了解决这些问题，Unity 推出了全新的 **Input System**。它引入了 **Input Action** 和 **Input Map** 等概念，将输入事件抽象化。你可以创建一个 **Input Action Asset**，在其中定义各种行为（如“跳跃”、“移动”），并为这些行为指定不同的设备输入（如键盘的空格键、手柄的 A 键）。这种设计使得输入管理更加灵活，玩家可以轻松地重新绑定按键，开发者也无需在代码中硬编码字符串。

### Unreal 的输入系统：从旧到新

Unreal 的旧输入系统和 Unity 的旧系统有着异曲同工之妙。在 **Project Settings** 的 **Input** 选项中，你可以配置 **Action Mappings**（按键行为，如 Jump）和 **Axis Mappings**（轴向行为，如 MoveForward）。在代码或蓝图中，你可以通过 `BindAction()` 或 `BindAxis()` 来监听这些映射的行为，并执行相应的逻辑。

而 Unreal 也同样为了更好的用户体验和开发灵活性，在 **UE4.26** 版本中引入了 **Enhanced Input System**。这个新系统也采用了事件驱动和数据驱动的设计思想。它的核心是 **Input Action** 和 **Input Mapping Context**。

-   **Input Action** 定义了一个具体的行为，例如“攻击”、“奔跑”。
    
-   **Input Mapping Context** 则是一个**“输入映射表”**，它将 **Input Action** 映射到具体的设备输入上，比如将“攻击”映射到鼠标左键。
    

新系统最强大的地方在于，它允许你在运行时动态地添加或移除 **Input Mapping Context**，这使得**上下文切换**变得非常简单。例如，在角色进入驾驶模式时，你可以移除“行走”的上下文，并添加“驾驶”的上下文，避免不同模式下的按键冲突。

**总结：** 无论是 Unity 还是 Unreal，新一代的输入系统都抛弃了硬编码和字符串查询，转而使用更加抽象和数据驱动的**映射**方式，提供了更强大的灵活性和可重绑定能力。

----------

## 物理系统：从组件到模拟，概念的巧妙转换

### Unity 的物理实现：刚体与碰撞体

在 Unity 中，要让一个 **GameObject** 受到物理引擎的影响，最核心的就是添加 **Rigidbody**（刚体）组件。**Rigidbody** 赋予了 **GameObject** 质量、阻力、重力等物理属性，并使其能够受到力和扭矩的影响。同时，你需要为它添加 **Collider**（碰撞体）组件，来定义其物理形状，例如 `BoxCollider`、`SphereCollider` 等。

**射线检测**（Raycasting）是物理系统中另一个高频使用的功能。通过 `Physics.Raycast()` 函数，我们可以从一个点向某个方向发射一条“射线”，并检测它是否与任何 **Collider** 发生碰撞。这在射击游戏、寻路或交互检测中非常常用。

### Unreal 的物理实现：Simulating Physics 与 LineTrace

在 Unreal 中，物理系统的实现方式稍有不同。一个 **Actor** 要想参与物理模拟，通常需要为其添加一个 **PrimitiveComponent**（如 `StaticMeshComponent`、`SkeletalMeshComponent` 或 `SphereComponent` 等）。在 **PrimitiveComponent** 的属性面板中，你可以勾选 **"Simulate Physics"**，这相当于给这个组件赋予了物理模拟的能力。

Unreal 的**射线检测**功能非常强大且丰富。它通常被称为 **LineTrace**。Unreal 不仅仅提供了简单的点到点射线，还提供了`BoxTrace`、`SphereTrace` 等多种形状的**“体素检测”**。`LineTraceSingleByChannel` 和 `LineTraceMultiByChannel` 是最常用的两个 API，前者只返回第一个命中的结果，后者则返回所有命中的结果。

**碰撞分组**在两个引擎中都有对应的实现。

-   在 Unity 中，我们通过 **Layers**（层）来管理碰撞。你可以在 `Edit -> Project Settings -> Physics` 中配置不同层之间的碰撞关系矩阵，来决定哪些层会互相碰撞，哪些不会。
    
-   在 Unreal 中，这个概念被称为 **Object Channels** 和 **Trace Channels**。在 `Project Settings -> Engine -> Collision` 中，你可以创建新的通道（Channel）。**Object Channels** 主要用于对象之间的碰撞，而 **Trace Channels** 则专门用于像射线检测这样的查询。你可以为每个 **PrimitiveComponent** 设置其所属的 **Object Channel**，并配置它与哪些通道产生**响应（Response）**，比如 `Ignore`、`Overlap` 或 `Block`。
    

**总结：** Unity 通过添加 **Rigidbody** 组件来启用物理，而 Unreal 则是在 **PrimitiveComponent** 上勾选 **"Simulate Physics"**。射线检测在 Unreal 中被称为 **LineTrace**，且功能更加细分和强大。碰撞分组的概念在两个引擎中都存在，但实现方式略有不同。

----------

## AI 与导航：从 NavMesh Agent 到 Navigation System

### Unity 的寻路：NavMesh Agent

在 Unity 中，AI 的寻路通常依赖于 **Navigation System** 和 **NavMesh Agent** 组件。

-   首先，你需要在场景中烘焙（Bake）出**导航网格（NavMesh）**。这个网格定义了 AI 角色可以行走的所有区域。
    
-   然后，给你的 AI **GameObject** 添加 **NavMesh Agent** 组件。这个组件封装了寻路逻辑，你只需要通过 `agent.SetDestination(targetPosition)` 就可以让 AI 自动寻路。
    

### Unreal 的寻路：Navigation System

Unreal 的 **Navigation System** 同样强大。

-   你需要在场景中放置一个 **Nav Mesh Bounds Volume**，然后通过烘焙来生成导航网格。这个**Volume**定义了导航网格的生成范围。
    
-   接下来，你需要为你的 AI **Pawn**（或 **Character**）添加一个 **AI Controller**。**AI Controller** 才是真正执行寻路逻辑的对象。你可以通过 **AI Controller** 调用 `MoveToLocation` 或 `MoveToActor` 函数，让 AI 角色自动寻路。
    

**总结：** 两个引擎的 AI 寻路工作流非常相似：**烘焙导航网格**，然后使用一个**专门的组件/控制器**来执行寻路逻辑。

----------

## 核心总结：你的知识是可迁移的，只是换了套“语言”

本文类比了几个最常用的功能模块：

-   **输入系统：** 从字符串到映射表，都实现了可重绑定的高级功能。
    
-   **物理系统：** Unity 的 **Rigidbody** 和 Unreal 的 **Simulate Physics** 概念上一致，射线检测在 Unreal 中被称为 **LineTrace**，并且提供了更丰富的选项。碰撞分组则分别由 **Layers** 和 **Object Channels** 管理。
    
-   **AI 导航：** 都依赖于**导航网格**，通过 **NavMesh Agent** 或 **AI Controller** 来实现寻路。
    

希望通过这些具体的类比，你能够看到，你从 Unity 中积累的宝贵经验，在 Unreal 的世界里并非毫无用处。它们只是换了一套“语言”和“语法”，但核心的编程思想和工作流是相通的。




## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity, ue
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*