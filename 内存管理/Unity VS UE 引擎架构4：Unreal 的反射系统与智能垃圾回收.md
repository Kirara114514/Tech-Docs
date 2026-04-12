# Unity VS UE 引擎架构4：Unreal 的反射系统与智能垃圾回收

## 摘要
在掌握了 Unreal 的核心对象模型、生命周期和 Gameplay Framework 后，我们现在要深入到 Unreal 引擎最核心、也最具挑战性的部分之一：**UObject 的反射系统和垃圾回收机制**。 对于习惯了 C# 和 .NET 自动内存管理的 Unity 开发者来说，Unreal 的 C++ 环境可能会让人望而却步。但别担心，Unreal 并没有让你回到原始的 C++ 时代...

## 正文

在掌握了 Unreal 的核心对象模型、生命周期和 Gameplay Framework 后，我们现在要深入到 Unreal 引擎最核心、也最具挑战性的部分之一：**UObject 的反射系统和垃圾回收机制**。

对于习惯了 C# 和 .NET 自动内存管理的 Unity 开发者来说，Unreal 的 C++ 环境可能会让人望而却步。但别担心，Unreal 并没有让你回到原始的 C++ 时代，去手动管理每一个对象。相反，它构建了一套独特的系统，既保留了 C++ 的性能优势，又提供了类似 C# 的便利，但这需要你理解它的“游戏规则”。

----------

# 深度剖析：Unreal 的反射系统与智能垃圾回收

### UObject 类反射系统：引擎的“读心术”

反射是引擎能够理解、检查和操作对象属性与行为的能力，而无需在编译时硬编码。在 Unity 中，C# 的反射由 .NET 虚拟机自动提供，所以你很少需要去关心它。但在 Unreal 的 C++ 世界里，这个系统是手动构建的，并通过一系列宏来实现。

#### `UPROPERTY()` 和 `UFUNCTION()` 宏

这两个宏是 Unreal 反射系统的核心。它们就像是引擎的“超能力”，允许它在运行时访问你的 C++ 类。

-   UPROPERTY() 宏：
    
    这个宏用于标记类的变量。一旦变量被 UPROPERTY() 标记，它就具备了以下超能力：
    
    1.  **暴露给编辑器**：变量会显示在 Unreal 编辑器的**详情面板**中，你可以直接在编辑器里修改它的值。
        
    2.  **参与蓝图**：变量可以在蓝图中被访问和修改。
        
    3.  **参与序列化**：当保存关卡或 Actor 时，变量的值会被自动保存和加载。
        
    4.  **参与垃圾回收**：这是最重要的一点。`UPROPERTY()` 会告诉垃圾回收器，这个指针是一个有效的**引用**。只要有 `UPROPERTY()` 指向一个 `UObject`，这个对象就不会被垃圾回收。
        
-   UFUNCTION() 宏：
    
    这个宏用于标记类的函数。被标记的函数可以：
    
    1.  **在蓝图中被调用**：你的 C++ 函数可以作为蓝图节点被执行。
        
    2.  **参与远程过程调用（RPC）**：在多人游戏中，它可以在客户端或服务器上被远程调用。
        
    3.  **绑定到事件系统**：你可以将它绑定到输入或碰撞事件上。
        

**举个例子**：

C++

```
// 在头文件中
UCLASS()
class AMyActor : public AActor
{
    GENERATED_BODY()

public:
    // UPROPERTY 宏，允许在编辑器中设置这个变量，并且参与垃圾回收
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "MySettings")
    class UStaticMeshComponent* MyStaticMesh;

    // UFUNCTION 宏，允许在蓝图中调用这个函数
    UFUNCTION(BlueprintCallable, Category = "MyFunctions")
    void SetMeshMaterial(UMaterialInterface* NewMaterial);
};

```

没有 `UPROPERTY()` 和 `UFUNCTION()`，你的 C++ 代码对于蓝图和编辑器来说是完全“隐形”的。

#### `UClass` 与元数据

每个继承自 `UObject` 的类，在运行时都会有一个对应的 `UClass` 对象。你可以把 `UClass` 想象成这个类的“身份证”或“说明书”，它存储了关于这个类的所有元数据，比如它有哪些 `UPROPERTY()` 变量，有哪些 `UFUNCTION()` 函数等等。

通过一个 `UObject` 指针，你可以随时获取它的 `UClass`，并进行**动态类型转换**。比如：

C++

```
void SomeFunction(UObject* SomeObject)
{
    // 检查这个对象是不是一个 StaticMeshComponent
    if (SomeObject->IsA(UStaticMeshComponent::StaticClass()))
    {
        // 如果是，安全地转换为 UStaticMeshComponent 指针
        UStaticMeshComponent* MyMesh = Cast<UStaticMeshComponent>(SomeObject);
        // 现在可以调用它的成员函数了
        MyMesh->SetStaticMesh(MyMeshAsset);
    }
}

```

`Cast<T>()` 是 Unreal 提供的一个**安全**的动态类型转换函数，它在转换失败时会返回 `nullptr`，而不是像 C++ 的 `dynamic_cast` 那样抛出异常。

----------

### Unreal 的垃圾回收机制

这是 Unreal 的另一大亮点。它不像 C# 那样依赖于一个通用的、不确定时机的垃圾回收器，而是实现了一套**基于引用图的标记-清除垃圾回收机制**。

#### 工作原理与根集

Unreal 的垃圾回收器会定期运行。它的工作流程如下：

1.  找到**根集（Root Set）**。根集是那些引擎认为“永远活着”的对象，它们是所有其他可回收对象的引用起点。
    
2.  从根集开始，垃圾回收器会遍历所有通过 **`UPROPERTY()`** 标记的指针，找到所有被引用的对象，并将它们标记为“活着”（live）。
    
3.  遍历结束后，所有没有被标记为“活着”的对象，都被认为是“垃圾”，会被引擎自动销毁。
    

**根集通常包括**：

-   所有在关卡中的 `AActor`。
    
-   所有在编辑器中打开的对象。
    
-   所有被引擎系统（如 `UWorld`、`AGameMode` 等）直接持有的对象。
    
-   所有被手动调用 `AddToRoot()` 的对象。
    

这套机制意味着：只要你的 `UObject` 指针被一个 `UPROPERTY()` 持有，或者被任何一个根集中的对象间接持有，它就不会被回收。

#### 智能指针：`TStrongObjectPtr` 和 `TWeakObjectPtr`

在 Unreal 中，除了原始指针 `T*`，你还应该使用 Unreal 特有的智能指针来更好地管理对象引用。

-   **`TStrongObjectPtr<T>`**：
    
    -   **强引用**：它会阻止对象被垃圾回收。
        
    -   **何时使用**：当你需要确保某个 `UObject` 在其生命周期内不被回收时，可以使用它来持有强引用。
        
    -   **注意**：`TStrongObjectPtr` **不会**参与垃圾回收的引用遍历，所以你不能用它来代替 `UPROPERTY()`。
        
-   **`TWeakObjectPtr<T>`**：
    
    -   **弱引用**：它**不会**阻止对象被垃圾回收。
        
    -   **何时使用**：当你需要引用一个对象，但又不希望因此阻止它被回收时。例如，一个 UI 组件可能需要引用它所控制的角色，但你不希望 UI 组件的存在导致角色无法被回收。
        
    -   **重要**：在使用 `TWeakObjectPtr` 访问对象之前，你**必须**检查它是否仍然有效，因为它所指向的对象随时可能被回收。`if (MyWeakPtr.IsValid())` 或 `if (T* MyPtr = MyWeakPtr.Get())` 是常见的检查方式。
        

----------

### 核心对比与迁移思路


|特性  | Unity (C#) |Unreal (C++)|
|--|--|--|
| **反射** | 由 .NET 虚拟机提供 |手动通过 `UPROPERTY()` 和 `UFUNCTION()` 宏实现|
| **垃圾回收** | 全局、非确定性的标记-清除 GC |基于引用图的、可手动控制的标记-清除 GC|
| **内存管理** | 自动管理，`new` 出来的对象由 GC 自动回收 |`UObject` 由引擎的 GC 管理，普通 C++ 对象需要手动 `delete`|
| **指针/引用** | 自动处理，使用 `.` 来访问成员 |使用 `->` 访问指针，需注意 `nullptr` 和悬空指针|

**迁移关键点**：

1.  **适应 C++ 指针**：C# 开发者习惯了 `.` 来访问成员，但在 Unreal C++ 中，`UObject` 指针需要用 `->`。更重要的是，你需要时刻注意指针是否有效，避免空指针解引用。
    
2.  **善用 `UPROPERTY()`**：不要吝啬使用 `UPROPERTY()`，它是连接 C++ 和引擎其他系统的桥梁。通过它来管理 `UObject` 的引用，让引擎的垃圾回收器替你分担工作。
    
3.  **普通 C++ 对象的内存管理**：对于那些不继承自 `UObject` 的普通 C++ 类（比如 `FString`、`TArray` 等），它们通常是**值类型**，或由智能指针 (`TUniquePtr`、`TSharedPtr` 等) 管理内存。但如果你手动 `new` 了一个普通 C++ 对象，你需要自己用 `delete` 来释放它。这一点和 C# 完全不同，是 C# 开发者需要格外注意的。
    

**示例：如何正确使用 `UPROPERTY()` 和 `TWeakObjectPtr`**

假设有一个 `GameMode` 需要引用场景中的 `PlayerCharacter`，但你不想在 `GameMode` 被销毁之前阻止 `PlayerCharacter` 被回收。

C++

```
// AMyGameMode.h
UCLASS()
class AMyGameMode : public AGameMode
{
    GENERATED_BODY()

public:
    // UPROPERTY 强引用，它会被垃圾回收器追踪
    UPROPERTY(BlueprintReadOnly)
    class APlayerCharacter* ActivePlayer;

    // TWeakObjectPtr 弱引用，不会阻止被引用对象被回收
    TWeakObjectPtr<class UHealthBarWidget> PlayerHealthBar;
};

// AMyGameMode.cpp
void AMyGameMode::BeginPlay()
{
    Super::BeginPlay();

    // 在 BeginPlay() 中设置强引用
    ActivePlayer = Cast<APlayerCharacter>(UGameplayStatics::GetPlayerCharacter(this, 0));

    // 创建 UI widget 并设置弱引用
    UHealthBarWidget* NewWidget = CreateWidget<UHealthBarWidget>(GetWorld(), HealthBarWidgetClass);
    if (NewWidget)
    {
        PlayerHealthBar = NewWidget; // 这是安全的，TWeakObjectPtr 不会阻止它被回收
    }
}

void AMyGameMode::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // 访问弱引用之前，必须检查它是否有效
    if (PlayerHealthBar.IsValid())
    {
        PlayerHealthBar->UpdateHealth(ActivePlayer->GetHealth());
    }
}

```

在这个例子中，`ActivePlayer` 的引用被 `UPROPERTY` 持有，所以只要 `GameMode` 活着，`ActivePlayer` 就不会被回收。而 `PlayerHealthBar` 是一个弱引用，如果这个 Widget 因为某些原因（比如被从视口移除）被回收了，`PlayerHealthBar` 指针会自动失效，而不会导致崩溃。

理解并正确使用 `UPROPERTY()`、`UFUNCTION()` 以及 Unreal 的垃圾回收系统，是你从 C# 到 Unreal C++ 成功过渡的基石。在下一篇文章中，我们将继续探讨 Unreal 与 Unity 在关卡组织和世界坐标系上的差异，这直接影响到你的场景管理和资源导入。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 架构设计
- **标签：** unity, ue, unreal, 架构
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*