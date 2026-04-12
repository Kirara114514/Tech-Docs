# Unity VS UE 引擎架构1：Unity 的 GameObject 组件 vs Unreal 的 Actor UObject

## 摘要
  # 深度对比：Unity 的 GameObject/组件 vs Unreal 的 Actor/UObject 在进入任何一个游戏引擎之前，我们必须首先理解它的核心设计理念。这就像是学习一门新的语言，你不能只死记硬背单词，更重要的是掌握它的语法规则和思维逻辑。 对于 Unity 和 Unreal 这两大引擎，尽管它们都能帮助我们创造出惊艳的游戏世界，但其构建游戏对象的基础哲学却截然不同。对...

## 正文




# 深度对比：Unity 的 GameObject/组件 vs Unreal 的 Actor/UObject

在进入任何一个游戏引擎之前，我们必须首先理解它的核心设计理念。这就像是学习一门新的语言，你不能只死记硬背单词，更重要的是掌握它的语法规则和思维逻辑。

对于 Unity 和 Unreal 这两大引擎，尽管它们都能帮助我们创造出惊艳的游戏世界，但其构建游戏对象的基础哲学却截然不同。对于从 Unity 迁移到 Unreal 的开发者来说，**理解并适应这种哲学上的差异，是成功转型、少走弯路的第一步**。

## Unity 的“万物皆对象”与组件化哲学

如果你是一个资深的 Unity 开发者，你可能早已对 **GameObject** 和 **Component** 这两个概念烂熟于心。

在 Unity 的世界里，所有你在场景里能看到或能与之交互的东西，都是一个 **GameObject**。但有趣的是，**GameObject 本身并不具备任何实际功能**，它更像是一个“空壳”，一个容器。它唯一的职责，就是承载着一个 **Transform** 组件，用于定义这个物体在三维空间中的位置、旋转和缩放。

那么，是谁赋予了它生命和功能呢？答案是**组件（Component）**。

-   **GameObject**：一个“盒子”，只关心位置。
    
-   **Component**：一个“零件”，承载着所有的逻辑和功能。
    

你希望一个 GameObject 能被渲染出来？给它挂一个 **MeshRenderer** 和 **MeshFilter** 组件。你希望它能发生碰撞？给它挂一个 **BoxCollider** 或 **SphereCollider** 组件。你希望它有自定义的游戏逻辑？给它挂一个继承自 **MonoBehaviour** 的自定义脚本组件。

这种设计哲学，完美诠释了软件工程中的一个核心原则：**组合优于继承**。我们不需要通过层层继承来构建一个复杂的类，而是通过将不同的组件“组装”到同一个 GameObject 上，来赋予它各种各样的能力。这种方式带来了极高的灵活性和可重用性。比如，一个敌人和一个可拾取的道具，它们可能都共享同一个碰撞体组件，但各自拥有不同的逻辑脚本。

## Unreal 的 Actor/UObject 对象系统核心概念

现在，让我们切换到 Unreal 的世界。这里的一切，都建立在两个基础之上：**UObject** 和 **AActor**。

### UObject：Unreal 的“上帝”对象

在 Unreal Engine 中，**UObject** 扮演了一个至高无上的角色。它并不是你在游戏世界中能直接看到或交互的物体，而是所有 Unreal 对象的基础。

你可以把 **UObject** 理解为 Unreal 引擎的“基类”。它本身虽然不能被直接放置在场景中，但它提供了一系列底层、核心的功能，例如：

-   **反射（Reflection）**：通过 **UPROPERTY()** 和 **UFUNCTION()** 等宏，将变量和函数暴露给编辑器、蓝图和序列化系统。这是 Unreal 蓝图和编辑器交互的基础。
    
-   **垃圾回收（Garbage Collection）**：Unreal 的垃圾回收系统基于对 UObject 的引用追踪，你不需要像 C++ 的普通对象那样手动 `delete`。
    
-   **序列化（Serialization）**：能够将对象的数据保存到文件中（比如在编辑器中保存关卡），并在运行时重新加载。
    

你可以把 **UObject** 看作是一个“骨架”，它提供了一套完整的、用于管理内存和元数据的框架。所有能与引擎底层系统（比如编辑器、蓝图、垃圾回收）交互的类，都必须直接或间接继承自 UObject。

### AActor：能在世界中“存在”的实体

如果说 UObject 是一个“骨架”，那么 **AActor** 就是一个拥有“灵魂”的实体。

**AActor** 继承自 UObject，是所有能在游戏世界中被“实例”化的对象。它和 Unity 的 GameObject 非常相似，但又有所不同。

-   **AActor** 同样拥有 **Transform**（位置、旋转、缩放）信息，但它并不像 Unity 那样将 Transform 作为单独的组件来看待。
    
-   **AActor** 是可以被放置在关卡（Level）中的，比如一个角色、一个灯光、一扇门等等。
    

如果你想要在 Unreal 中创建一个可以移动的角色，你需要创建一个继承自 **ACharacter**（它是 **APawn** 的子类，而 **APawn** 是 **AActor** 的子类）的类。然后，这个 Character 实例就可以被放置在关卡中了。

### UActorComponent：Unreal 的“零件”

这部分概念，就和 Unity 的 Component **高度相似**了。

**UActorComponent** 是一个可以被附加到 **AActor** 上的对象。它也是继承自 UObject 的，所以同样具备反射、垃圾回收等特性。

和 Unity 的组件类似，**UActorComponent** 提供了特定的功能，比如：

-   **StaticMeshComponent**：用于渲染静态网格体。
    
-   **BoxComponent**：用于碰撞检测。
    
-   **CharacterMovementComponent**：用于处理角色移动的复杂逻辑。
    

**重要区别**：和 Unity Component 必须挂载在 **GameObject** 上类似，Unreal 的 **UActorComponent** 必须附加在 **AActor** 上。它们就像是螺丝钉和螺母的关系，缺一不可。

## 核心对比与迁移思路


|特性  | Unity |Unreal Engine|核心理念|
|--|--|--|--|
|**基础单位**  | `GameObject` |`AActor`|都是游戏世界的实体|
|**功能载体**  | `Component` |`UActorComponent`|都是附加在实体上的功能模块|
|**底层基类**  | - |`UObject`|Unreal 独有，提供了引擎底层功能|
|**“空”实体**  | `Empty GameObject` |一个只包含 `USceneComponent` 作为根节点的 `AActor`|两者都用于组织结构|

在 Unity 中，我们常常会创建一个**空的 GameObject**，然后将其他 GameObject 作为其子物体，来构建一个结构化的父子层级关系。在 Unreal 中，我们通常也会创建一个不带任何网格的 **AActor**，并将一个 `USceneComponent` 作为其根组件，然后将其他的组件或子 Actor 附加到这个根组件下，以达到同样的目的。

----------

### 从 Unity 思维到 Unreal 思维的转变

如果你习惯了 Unity 的开发，那么在迁移到 Unreal 时，你需要对 **GameObject + Component** 和 **Actor + ActorComponent** 之间的关系建立一个清晰的映射。

**Unity 的 GameObject + Component** 几乎可以一对一地映射到 **Unreal 的 AActor + UActorComponent**。

例如：

-   Unity 的 `Player` `GameObject` 挂载了 `PlayerController.cs`、`CapsuleCollider` 和 `Rigidbody`。
    
-   Unreal 中，你会创建一个继承自 `ACharacter` 的 **C++ 类**（或者 **蓝图**），它默认就包含了 `CapsuleComponent` 和 `CharacterMovementComponent`。你可以在这个类中添加 `UPlayerControllerComponent`（如果有的话）或其他自定义组件来扩展其功能。
    

**核心代码示例：用 C++ 实现一个简单的 Actor**

C++

```
// MyWeapon.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MyWeapon.generated.h"

UCLASS()
class AMyWeapon : public AActor
{
    GENERATED_BODY()
    
public: 
    // Sets default values for this actor's properties
    AMyWeapon();

protected:
    // Called when the game starts or when spawned
    virtual void BeginPlay() override;

public: 
    // Called every frame
    virtual void Tick(float DeltaTime) override;

    // Use a StaticMeshComponent for the visual representation
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
    class UStaticMeshComponent* WeaponMesh;
};

```

C++

```
// MyWeapon.cpp
#include "MyWeapon.h"
#include "Components/StaticMeshComponent.h"

// Sets default values
AMyWeapon::AMyWeapon()
{
    // Set this actor to call Tick() every frame. You can turn this off to improve performance if you don't need it.
    PrimaryActorTick.bCanEverTick = true;

    // Create the StaticMeshComponent
    WeaponMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("WeaponMesh"));

    // Set it as the root component
    SetRootComponent(WeaponMesh);
}

// Called when the game starts or when spawned
void AMyWeapon::BeginPlay()
{
    Super::BeginPlay();
    
}

// Called every frame
void AMyWeapon::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

}

```

在上面的代码中，我们定义了一个名为 `AMyWeapon` 的 **Actor** 类。在它的构造函数中，我们通过 `CreateDefaultSubobject` 创建了一个 **`UStaticMeshComponent`**，并将其设置为这个 Actor 的根组件（`SetRootComponent`）。

这本质上和你在 Unity 中创建一个新的 C# 脚本，然后在 `Awake()` 或 `Start()` 方法中 `AddComponent<MeshFilter>()` 并 `AddComponent<MeshRenderer>()` 的思路是完全一致的。

----------

## 小结

到这里，你应该对 Unity 的 **GameObject/Component** 和 Unreal 的 **Actor/UObject** 体系有了初步但深刻的理解。

-   **Unity** 的设计更偏向于**纯粹的组合**，所有功能都由组件承载，GameObject 只是一个容器。
    
-   **Unreal** 的设计则是在**继承**（`AActor` 继承自 `UObject`）和**组合**（`AActor` 可以附加 `UActorComponent`）之间取得了平衡，它的对象体系更加层次分明，每一个类都有其明确的职责。
    

理解 `UObject` 提供了引擎底层能力，`AActor` 是游戏世界中的实体，而 `UActorComponent` 则是附加其上的功能模块，这是你在 Unreal 世界中构建一切的基础。

在接下来的文章中，我们将深入探讨这两个引擎的生命周期管理，看看 Unity 的 `Awake()` 和 `Start()` 是如何映射到 Unreal 的 `Constructor()` 和 `BeginPlay()` 的。

对于这两种截然不同的核心设计哲学，你觉得哪一种更符合你的编程习惯呢？或者，你对 `UObject` 的概念还有什么疑惑吗？


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** unity, ue, unreal, 架构
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*