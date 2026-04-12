# Unity转UE一：从 Unity 的“拼装”哲学到 Unreal 的“实体”世界

## 摘要
 ## 引言：从 Unity 的“拼装”哲学到 Unreal 的“实体”世界 如果你是一名 Unity 开发者，你对 **GameObject** 和 **Component** 这两个概念一定再熟悉不过了。Unity 的世界观可以被比喻为“乐高积木”：**GameObject** 就像是一个空心的底座，而 **Component** 则是各种功能模块，比如 **Mesh Renderer*...

## 正文


## 引言：从 Unity 的“拼装”哲学到 Unreal 的“实体”世界

如果你是一名 Unity 开发者，你对 **GameObject** 和 **Component** 这两个概念一定再熟悉不过了。Unity 的世界观可以被比喻为“乐高积木”：**GameObject** 就像是一个空心的底座，而 **Component** 则是各种功能模块，比如 **Mesh Renderer**、**Collider**、**Rigidbody** 等。你需要把这些功能模块一个个地“拼装”到 **GameObject** 这个底座上，才能构成一个完整的实体。这种“组合优于继承”的设计哲学，让 Unity 的开发变得极其灵活，你可以非常轻松地通过组合不同的组件来创造出无穷无尽的对象。

那么，Unreal 的世界又是什么样的呢？它抛弃了这种完全“空壳”的设计，而是采取了一种更“实体化”的思路。在 Unreal 中，最基础的物体是 **Actor**。一个 **Actor** 就像是一个天生自带“血肉”的实体，它本身就拥有最基本的功能，比如**变换（Transform）**，可以被直接放置在关卡中，甚至可以直接通过继承来扩展功能。而 **ActorComponent**，则更像是给这个“实体”打上的“补丁”或者“插件”，用来扩展它的功能，实现更强大的复用。

下面，我们就从这几个核心概念入手，为你逐一解析。

----------

## 游戏对象与组件：GameObject/Component vs Actor/ActorComponent

### Unity 的 GameObject/Component 体系

在 Unity 中，**GameObject** 的本质就是一个纯粹的**容器**。它自己没有渲染功能，没有物理属性，甚至连名字都可以是空的。它的唯一作用就是用来承载各种各样的 **Component**。

**Component** 才是真正提供功能的实体。**Transform Component** 决定了对象的位置、旋转和缩放；**Mesh Filter** 和 **Mesh Renderer** 负责模型的显示；**Collider** 负责碰撞检测；**Rigidbody** 则负责物理模拟。这种设计的好处在于，你可以非常灵活地把任何需要的组件“拼装”到任何 **GameObject** 上，实现了高度的解耦和复用。

### Unreal 的 Actor/ActorComponent 体系

**Actor** 是 Unreal 体系中一个非常重要的概念。你可以把它理解为一个**“可被放置在关卡中的实体”**。与 Unity 的 **GameObject** 不同，一个纯粹的 **Actor** 并不只是一个容器。它本身就自带一些基础属性，最核心的就是 **Transform**，这意味着一个 **Actor** 一旦被创建，就拥有了位置、旋转和缩放的能力。

**ActorComponent** 则是用来附加到 **Actor** 上的功能模块，它的作用与 Unity 的 **Component** 有些类似，但又有所不同。Unreal 中有许多强大的内置 **ActorComponent**，比如 **CharacterMovementComponent**，它封装了角色移动、跳跃、下落等一系列复杂逻辑；再比如 **SkeletalMeshComponent**，它负责骨骼模型的渲染。你可以通过给 **Actor** 附加这些 **ActorComponent**，快速构建出复杂的游戏对象。

**总结：** Unity 的 **GameObject** 更像是一个纯粹的“空壳容器”，需要从零开始拼装功能。而 Unreal 的 **Actor** 更像是一个功能相对完整的“实体”，**ActorComponent** 则是用来扩展其能力的“插件”。

----------

## 脚本与预制体：从 MonoBehaviour 到 C++/蓝图

### Unity 的 MonoBehaviour 与 Prefab

在 Unity 中，游戏逻辑主要由 **MonoBehaviour** 脚本来驱动。你创建一个 C# 脚本，继承自 **MonoBehaviour**，然后在其中编写 **Update()**、**Start()** 等生命周期函数，最后将这个脚本作为 **Component** 附加到 **GameObject** 上。

**Prefab**（预制体）则是 Unity 中另一个核心概念，它是一个可复用的 **GameObject** 模板。你可以将一个配置好的 **GameObject**（包含其所有子对象和组件）保存成一个 **Prefab**，然后可以在任意场景中多次实例化它，非常方便地进行复用和管理。

### Unreal 的 C++/蓝图与 Blueprint Class

Unreal 的游戏逻辑实现则采用了**“双轨制”**：**C++** 和**蓝图（Blueprint）**。

-   **C++ 类**：Unreal 的底层核心功能，包括物理、渲染、AI 等，都是由 C++ 编写的。如果你需要实现高性能、复杂的底层系统，或者需要暴露给蓝图使用的核心逻辑，通常会选择 C++。C++ 在 Unreal 中主要通过继承的方式来扩展功能，比如你可以创建一个继承自 **AActor** 的 C++ 类，来定义一个全新的游戏对象类型。
    
-   **蓝图**：蓝图是一种基于节点的**可视化脚本**系统，它可以让你在不需要写代码的情况下，通过连接节点来构建游戏逻辑。蓝图不仅可以调用 C++ 类暴露出来的函数，还可以创建新的 **Blueprint Class** 来扩展 C++ 的功能。这种双轨制的设计使得大型项目的开发分工非常清晰：C++ 程序员负责底层架构，而游戏设计师和关卡设计师则可以用蓝图快速迭代和实现游戏玩法。
    

**Blueprint Class** 可以被看作是 Unreal 中最核心的“预制体”概念，但它的功能远比 Unity 的 **Prefab** 强大。一个 **Blueprint Class** 不仅可以像 **Prefab** 一样作为一个可被放置在关卡中的模板，它本身就是一种**“可继承”**的**“类”**。这意味着你可以从一个现有的 **Blueprint Class** 继承，并在此基础上添加或修改逻辑，这极大地增强了复用和扩展能力。

----------

## 数据资产与场景/关卡：从 ScriptableObject 到 Data Asset

### Unity 的 ScriptableObject 与 Scene

-   **ScriptableObject**：这是 Unity 中一个非常实用的概念。你可以把它理解为一个**不依附于任何场景的纯数据容器**。比如，你可以用一个 **ScriptableObject** 来存储一个敌人的血量、攻击力、掉落物列表等数据。它的好处在于，你可以把数据和逻辑完全分离，方便策划人员进行数据配置，同时也能在多个 **GameObject** 之间共享数据。
    
-   **Scene**：Unity 的 **Scene** 就是一个包含所有 **GameObject**、光照、摄像机等游戏对象的**文件**。你在一个场景中编辑的所有内容都会被保存在这个文件中。
    

### Unreal 的 Data Asset 与 Level

-   **Data Asset**：**Data Asset** 在 Unreal 中的作用和 Unity 的 **ScriptableObject** 异曲同工。它也是一种**纯粹的数据容器**，可以用来存储游戏中的各种配置数据，比如技能属性、武器参数、NPC 对话内容等。与蓝图一样，它可以很方便地被设计师配置，同时也能在 C++ 和蓝图中被轻松访问。
    
-   **Level**：Unreal 的 **Level** 概念等同于 Unity 的 **Scene**。它是一个包含所有 **Actor** 和关卡相关设置的文件。但 Unreal 的 **World** 概念比 Unity 的 **Scene** 更为强大，一个 **World** 中可以同时加载多个 **Level**，这带来了巨大的便利。你可以利用**子关卡（Sub-Level）**来实现场景的流式加载（Streaming），只在需要的时候加载或卸载特定的区域，从而减少内存占用。更重要的是，它极大地改善了**多人协作**的效率，不同的设计师可以同时在不同的子关卡上工作，而不会互相干扰。
    

----------

## 核心总结：建立你的 Unreal 思维模型

我们来做个简单的“翻译”：

-   **Unity GameObject** ➔ **Unreal Actor**：**Actor** 是一个更具“实体性”的对象，它自带一些基础功能，比如 **Transform**。
    
-   **Unity Component** ➔ **Unreal ActorComponent**：**ActorComponent** 同样是功能模块，但它更像是给 **Actor** 打的“补丁”或“插件”。
    
-   **Unity MonoBehaviour** ➔ **Unreal 蓝图/C++ 类**：Unreal 的双轨制提供了更灵活的开发方式。
    
-   **Unity Prefab** ➔ **Unreal Blueprint Class**：**Blueprint Class** 既是“预制体”，又是“类”，功能更强大，可继承。
    
-   **Unity ScriptableObject** ➔ **Unreal Data Asset**：两者都是纯数据容器，用于将数据与逻辑分离。
    
-   **Unity Scene** ➔ **Unreal Level**：Unreal 的 **Level** 还可以作为子关卡被加载，方便流式加载和多人协作。
    

希望通过这些核心概念的类比，能够帮助你建立起 Unreal 的“世界观”。理解了这些基础，你就能更好地理解 Unreal 的设计哲学，并更快地掌握这个强大的引擎。




## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** unity, ue, unreal
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*