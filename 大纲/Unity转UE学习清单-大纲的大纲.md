# Unity 转 Unreal Engine 学习清单

## 引擎架构与Gameplay框架

-   Unity **GameObject/组件** 架构 vs Unreal **Actor/UObject** 对象系统
    
-   **Actor 生命周期**（BeginPlay/Tick/EndPlay）与组件关系 vs Unity MonoBehaviour生命周期（Awake/Start/Update/OnDestroy 等）
    
-   **Gameplay Framework** 核心类：**GameMode**（游戏模式），**GameState/PlayerState**（游戏状态），**Pawn/Character**（可控角色），**Controller**（控制器，含 PlayerController/AIController），**HUD** 等
    
-   **UObject 类反射系统**（UClass/反射信息）及 **垃圾回收** 机制 (Unreal 对 UObject 自动 GC，C++ 普通对象需手动管理)
    
-   **关卡 (Level)** 与 **世界 (World)** 体系（关卡相当于 Unity 的场景；支持 **Persistent Level** 加载子关卡流式加载/World Composition，Unity 则通过 Additive Scene 实现）
    
-   **坐标系与单位**：Unity 默认单位为米、Y 轴朝上，Unreal 默认单位为厘米、Z 轴朝上
    
-   **全局单例**管理：Unity 通常用单例模式 (GameManager 等)，Unreal 提供 **GameInstance** 单例和各类 **Subsystem** (如 GameInstanceSubsystem) 来管理跨关卡的全局对象
    
-   **引擎模块化**：Unreal 引擎源码开放，采用模块化架构（可定制引擎模块、编辑器模块等）；Unity 引擎封闭，游戏逻辑主要在脚本层
    

## 用户界面（UI 系统）

-   **UMG**（Unreal Motion Graphics）所见即所得 UI 编辑器，使用 **Widget Blueprint** 创建界面控件
    
-   **Slate** 底层 UI 框架（C++编写的即时模式 UI 库，UMG 基于 Slate 封装）
    
-   常用 **UI 控件与布局容器**：如 Canvas Panel、Border、Horizontal/Vertical Box 等（对应 Unity 的 Canvas、Layout Group 等）
    
-   **UI 事件响应**：Widget 的点击/变化事件（通过绑定事件或 Override 函数）vs Unity 的 UGUI 事件系统（EventSystem、EventTrigger 等）
    
-   **UI 坐标系与适配**：Unreal 的 DPI 缩放规则（根据屏幕分辨率自动缩放控件）vs Unity Canvas Scaler (依据参考分辨率缩放)
    
-   **UI 性能优化**：减少过深的Widget层级和过度绑定，合理使用Invalidate/Layout，Unity 优化UI则注意批次合并、避免频繁重绘等
    

## 动画系统

-   **动画蓝图 (Animation Blueprint)**：可视化动画脚本，包含 **AnimGraph** 动画状态机和 blend 等节点；Unity 对应 **Animator Controller** 状态机
    
-   **动画状态机**：Unreal 动画蓝图支持状态机（State Machine）管理动画切换，Unity Mecanim Animator 也通过状态机控制动画流转
    
-   **Blend Space**：二维混合空间，用于角色不同状态动画过渡（Unity Animator 中 **Blend Tree** 实现相似功能）
    
-   **动画 Montage**：动画片段蒙太奇，用于在游戏中动态播放组合动画（Unity 可通过 Animation.Play 或 Timeline 实现类似效果）
    
-   **Control Rig**：控制器里格，角色骨骼动画的程序化控制（Unity 无直接等效，需使用 Animation Rigging 包）
    
-   **骨骼网格体**：Unreal 的 SkeletalMesh 与 Skeleton 资源，支持蒙皮骨骼；Unity 使用 SkinnedMeshRenderer 和 Avatar 定义骨骼
    
-   **动画重定向**：Unreal 支持不同骨骼之间动画重定向 (Retargeting)，Unity 通过 Avatar 定义骨骼映射也可实现
    
-   **Sequencer**：关卡序列器，用于过场动画和镜头（Unity 的 Timeline 时间轴）
    

## 资源管理与资产管线

-   **内容浏览器 (Content Browser)**：Unreal 统一的资源管理窗口 vs Unity 的 Project 视图（Assets 文件夹）
    
-   **资产导入与类型**：Unreal 支持导入 FBX、PNG 等生成相应 UAsset；Unity 导入文件至 Assets 目录自动生成 .meta 和资源对象
    
-   **资源引用**：**硬引用**（直接引用资产，打包时始终包含） vs **软引用**（SoftObjectPtr/软对象路径，按需加载）；Unity 用 **Addressables** 实现类似按需加载（通过地址或标签）
    
-   **Asset Bundle vs Pak**：Unity 通过 AssetBundle/Addressables 打包可下载资源，Unreal 通过 **UnrealPak (.pak 包)** 对内容按 Chunk 分组打包
    
-   **Addressables vs Primary Asset**：Unity Addressables 提供异步加载、可寻址资源管理；Unreal 的 **Primary Asset ID**（主要资产标签）配合 **AssetManager** 实现动态加载管理
    
-   **资源加载**：Unreal 使用 `LoadObject/StreamableManager` 异步加载软引用资产；Unity 使用 `Resources.Load`（同步）或 Addressables异步加载
    
-   **资源组织**：Unreal 按模块Plugin或分类文件夹组织内容（需在 .uproject 中注册的内容目录）；Unity 所有资源在 Assets 下，可用文件夹区分或用 Editor分类标签
    
-   **资源优化**：避免在 Unreal 中使用过多大材质球或大贴图未压缩，利用 MipMap/流式纹理；Unity 侧注意压缩纹理格式、Sprite 图集等减小内存
    

## 蓝图 vs C++ 脚本

-   **UFUNCTION/UPROPERTY 宏**：Unreal 用宏将 C++ 类的属性、函数暴露给 **蓝图** 编辑器及反射系统
    
-   **蓝图可视化脚本**：使用节点连接实现游戏逻辑（适合快速迭代）；Unity 则主要用 C# 脚本编码（也有可视化脚本 Bolt 但应用较少）
    
-   **蓝图通信**：Unreal 蓝图间通信可用 **Event Dispatcher（事件委托）**、蓝图接口、直接引用调用等；Unity 脚本间通信通过 C# 事件/委托、SendMessage 或直接引用调用
    
-   **蓝图与原生结合**：Unreal 项目常用 C++ 提供底层功能 + 蓝图实现高层逻辑（蓝图可继承自 C++类）；Unity 则可能通过预制体组合和 C# 脚本实现全部逻辑
    
-   **性能差异**：蓝图运行稍慢但开发便捷，C++ 性能高；大项目中关键系统使用 C++，非性能敏感部分用蓝图实现，Unity 则主要关心 C# 脚本的 GC 和 Update 开销
    
-   **调试**：Unreal 蓝图支持断点调试、性能分析器（Blueprint Profiler），C++ 可通过调试器逐步执行；Unity C# 脚本可附加调试，VS 或 Rider 调试 Mono
    

## 输入系统

-   **输入映射设置**：Unreal 在 Project Settings 中配置 **Action Mappings** 和 **Axis Mappings**（名字绑定按键/轴） vs Unity 使用 Input Manager 或新输入系统定义动作
    
-   **Enhanced Input**：Unreal 提供增强输入插件，实现更高级的输入映射和运行时重映射；Unity 新输入系统（Input System Package）提供类似的动作映射和可重绑定功能
    
-   **输入绑定**：Unreal 使用 `InputComponent->BindAction/BindAxis` 将按键/轴映射到函数或事件（或蓝图 Input 事件节点）；Unity 旧系统通过 `Input.GetButton/GetAxis` 查询，新系统通过 `PlayerInput` 事件回调
    
-   **多种输入设备**：Unreal 和 Unity 都支持键鼠、手柄、触摸等输入，但 Unreal 中可能需要针对手柄设置 Input Mapping，Unity 新输入系统通过 Control Scheme 区分设备
    
-   **UI 输入模式**：Unreal 可以设置 **Input Mode** (Game Only / UI Only / Game and UI) 来控制游戏与UI的输入焦点；Unity 则通过 EventSystem 控制 UI 输入，不同模式需手动管理 Cursor 锁定等
    
-   **移动端输入**：Unreal 提供 Touch事件、重力感应组件等处理移动设备输入；Unity 通过 `Input.touches`、加速度计等接口处理移动端触摸/传感器
    

## 性能优化与分析

-   **Profiling 工具**：Unreal 内置 **Profiling** 分析 (如 Unreal Insights, `stat unit`, `stat fps`, GPU Profiler 等)；Unity 提供 Profile 窗口查看 CPU/GPU 用时、内存占用
    
-   **内存管理**：Unity 有自动 GC，需要注意 GC Alloc 减少垃圾产生；Unreal C++ 需手动管理内存，UObject 虽有 GC 但也需防止创建过多短命对象，留意内存碎片
    
-   **Draw Call 与批次**：Unity 借助 Static Batching、Dynamic Batching、GPU Instancing 减少 Draw Call；Unreal 使用 **Instanced Static Mesh/HISM** 实现大批量实例绘制，利用合并Actor工具降低 Draw Call
    
-   **LOD 系统**：两引擎都支持 LOD；Unreal 可用 **自动 LOD 生成** 和 **HLOD**（层级LOD）来降低远景开销；Unity 使用 LODGroup 并可通过AssetBundle加载不同质量资源
    
-   **Tick/Update 优化**：避免过多 Actor 每帧 Tick（Unreal 可关闭不需要的 Actor Tick或使用 Timer），Unity 避免大量脚本同时 Update（可合并逻辑或降低频率）
    
-   **并行与异步**：Unreal Gameplay Tasks、异步加载、渲染线程/游戏线程分离；Unity 利用 Job System/ECS 实现多线程，或使用异步 API （如异步加载场景）
    
-   **性能剖析**：Unreal `stat` 命令细分各子系统耗时（如 `stat Game`, `stat Draw` 等），还可用 **Unreal Insights** 录制帧分析；Unity Profiler 可以深度剖析调用栈、渲染流程，Frame Debugger 查看逐帧渲染状态
    
-   **移动端优化**：Unreal 可通过 **Device Profiles** 针对低端设备降低画质（分辨率缩放、特效关闭），使用 Vulkan/ES3 模式优化；Unity 通过 Quality Settings 设定不同档位，压缩纹理、精简Shader变体以提升移动性能
    

## 渲染管线与图形技术

-   **渲染路径**：Unreal 默认采用 **延迟渲染 (Deferred)** 获取丰富光照效果；Unity 可选择前向或延迟渲染管线（URP/HDRP 等）
    
-   **全局光照**：Unreal 引入 **Lumen** 实时全局光照与反射系统（UE5），无需预烘焙即可实现动态GI；Unity HDRP 支持实时光照探针与SSGI，但移动端通常仅能使用烘焙光照
    
-   **Nanite 虚拟几何体**：Unreal 的虚拟化微多边形技术，可渲染海量多边形模型；Unity 暂无完全类似功能，大场景需手工LOD或使用DOTS样条LOD等方案
    
-   **材质系统**：Unreal 使用节点式 **材质编辑器** 定义材质逻辑（Shader），区分**着色模型**(Lit/Unlit等)和材质实例；Unity 可通过 **Shader Graph** 或手写 HLSL 实现着色器，材质属性直接在材质球上调节
    
-   **材质实例**：Unreal **Material Instance** 用于基于父材质快速生成参数化材质变体，性能开销低；Unity 若需材质变体通常通过 MaterialPropertyBlock 或创建新材质副本
    
-   **后处理**：Unreal 使用 **Post Process Volume** 进行全局/区域后期处理（Bloom、色调映射等）；Unity 使用 PostProcessing Stack (Volume + Profile) 实现类似的全局和区域后效
    
-   **光照烘焙**：Unreal (UE4) 用 **Lightmass** 烘焙静态光照和光照贴图；Unity 用 Enlighten (<=2019) 或 Progressive CPU/GPU 烘焙光照贴图，预计算全局光照
    
-   **灯光类型**：Unreal 区分 Static/Stationary/Movable 灯光（三种性能级别），Unity 区分 Baked/Mixed/Realtime 光照模式；需要理解不同灯光类型对性能和阴影的影响
    
-   **天空环境**：Unreal **Sky Atmosphere + SkyLight** 模拟逼真的大气散射天空光照；Unity 使用天空盒和 Reflection Probe 来提供环境光
    
-   **平台着色差异**：移动平台Unreal支持Mobile Shader简化版，Unity URP 针对移动优化，需关注不同图形API（Vulkan/Metal/OpenGL）的着色器兼容性
    

## C# 到 C++ 语言迁移要点

-   **语法结构**：C++ 采用头文件(.h)+源文件(.cpp)分离声明和实现，并使用宏和模板等；C# 单文件即可包含类完整定义，支持泛型但无宏预处理
    
-   **类型系统**：C# 区分值类型(struct)和引用类型(class)，托管内存；C++ 有值对象（栈上分配）和指针/引用（指向堆上或栈上），需要手动管理对象生命周期
    
-   **内存管理**：C# 有垃圾回收 GC 自动回收不使用的对象；C++ 无自动GC（Unreal 对UObject有限GC），需手工 `new/delete`，可借助 **RAII**习惯和智能指针（如 `std::unique_ptr` / UE `TUniquePtr`）防止内存泄漏
    
-   **指针与安全**：C# 屏蔽指针运算（除非在不安全代码块），一般不出现野指针；C++ 可直接操作指针内存，需注意悬空指针、缓冲区溢出等安全问题
    
-   **异常处理**：C# 广泛使用 try-catch 管理异常；Unreal C++ 默认禁用异常（使用 `check`/`ensure`宏和返回 error code 处理错误），需要了解二者差异
    
-   **模板 vs 泛型**：C++ 模板在编译期实例化，支持类型推演和元编程；C# 泛型在运行时具备类型擦除，不支持复杂类型计算
    
-   **继承与接口**：C# 单继承+接口，实现多态；C++ 支持多重继承（Unreal 尽量使用组合代替多继承），通过纯虚类实现接口概念
    
-   **编译模型**：C# 脚本编辑后由引擎即时编译/域重载（Unity编辑器下快速迭代）；C++ 代码修改后需重新编译链接模块或DLL（Unreal 提供 Live Coding 热编译辅助迭代）
    
-   **编译期检查**：C++ 是静态类型语言，编译期类型检查严格，出现错误无法通过编译；C# 也静态类型但运行时有反射可动态操作，错误多在运行时报出
    
-   **标准库**：熟悉 C++ STL（如 `<vector>, <map>`）和 Unreal 平台封装 (`TArray, TMap` 等) vs .NET Base Class Library (List<T>, Dictionary 等集合类)
    
-   **模块组织**：Unreal 采用模块和插件组织代码，每个模块有 Build.cs定义和独立命名空间；Unity 脚本默认编译为 Assembly-CSharp，亦可用 Assembly Definition 文件分隔 DLL，各插件通过 Package 管理
    
-   **语言特性**：C++11/14 现代特性（`auto` 类型推导、Lambda 表达式、`constexpr`、智能指针）需要掌握；C# 提供 LINQ 查询、异步 `async/await` 调用等（Unreal C++ 无直接等效，需要自行管理异步任务）
    

## Unity vs UE 常用功能类比

-   **GameObject & Component vs Actor & ActorComponent**（Unity 每个GameObject挂组件扩展，Unreal Actor自带transform可直接拓展功能，也可附加 ActorComponent 实现复用）
    
-   **MonoBehaviour 脚本 vs C++类/蓝图类**（Unity 脚本驱动一切，Unreal 可通过C++类提供底层并让美术用蓝图实现细节）
    
-   **Prefab (预制体) vs Blueprint 类**（Unity 预制体用于复用关卡对象布局，Unreal 蓝图类既可作为可放置的预制对象，又能封装逻辑成为可继承类）
    
-   **ScriptableObject vs Data Asset**（Unity ScriptableObject用作不附属场景的纯数据对象，Unreal **Data Asset** (继承自 UDataAsset/UPrimaryDataAsset) 实现类似用途）
    
-   **Scene 场景 vs Level 关卡**（Unity 场景包含所有游戏对象，Unreal 关卡(Level)同理，一个世界(World)可加载多个子关卡实现场景合并）
    
-   **Awake/Start (初始化) vs Constructor/BeginPlay**（Unreal 对象构造函数用于初始化默认值，BeginPlay在关卡开始时触发，相当于Unity的Start）
    
-   **Update/FixedUpdate vs Tick**（Unity Update每帧调用、FixedUpdate定期物理帧调用；Unreal Actor默认每帧 Tick，可设置 TickInterval或使用 Tick Group 来模拟类似 FixedUpdate 的效果）
    
-   **Destroy(obj) vs DestroyActor()**（销毁对象：Unity 用 `Object.Destroy`，Unreal 调用 `Actor->Destroy()` 接口销毁Actor）
    
-   **Coroutine (协程) vs Timer/延迟调用**（Unity 启动协程 `StartCoroutine` 实现延迟或序列逻辑；Unreal 可用 `FTimerManager` 设置定时器或在蓝图中使用 Delay 节点实现类似流程）
    
-   **Tags/Layers vs Collision Channels**（Unity 用 Tag 标记对象、Layer 分组碰撞；Unreal Actor自带 Tags 列表用于标识，碰撞分组通过 **Object Channel/Trace Channel** 配置碰撞响应）
    
-   **Physics.Raycast vs LineTrace**（Unity 用 Physics.Raycast/Overlap 检测物理碰撞；Unreal 提供 `UKismetSystemLibrary::LineTraceSingle` 等射线检测，以及 Sweep 多种形状检测）
    
-   **Rigidbody vs Simulating Physics**（Unity 刚体 Rigidbody 控制物理模拟；Unreal 在角色的 PrimitiveComponent 上启用 Simulate Physics 并附加刚体属性，同样交由物理引擎驱动）
    
-   **NavMesh Agent vs Navigation System**（Unity NavMeshAgent 控制 AI 移动；Unreal Navigation System 在 Navigation Mesh 基础上，通过 AIController 带有 MoveTo等接口实现寻路移动）
    
-   **Animator Controller vs Animation Blueprint**（动画状态机：Unity 使用 Animator Controller 编辑器定义动画状态与过渡，Unreal 用 Animation Blueprint 的 AnimGraph 和 State Machine 实现）
    
-   **Timeline (时间轴) vs Sequencer**（Unity Timeline 制作过场动画和事件轨道，Unreal Sequencer 提供功能更强的关卡序列编辑）
    
-   **Particle System (Shuriken) vs Niagara**（Unity 内置 Shuriken 粒子系统，Unreal 新版 Niagara 粒子系统功能更强；两者均支持粒子发射器、模块化特效编辑）
    
-   **UI Canvas & UGUI vs UMG & Widget**（Unity UI 使用 Canvas 渲染 UI 元素，Unreal 使用 UMG Widget 构建界面，两者概念类似）
    
-   **Input.GetAxis/Input System vs Input 绑定**（Unity 通过 Input.GetAxis 或新输入系统发送动作事件；Unreal 通过配置输入映射并在代码/蓝图中绑定响应函数）
    
-   **Events/Delegates vs MulticastDelegate**（C# 用事件/委托实现松耦合通知，Unreal C++ 提供 **Delegate/MulticastDelegate**，蓝图用 EventDispatcher 实现类似观察者模式）
    
-   **AssetBundle/Addressable vs Pak/AssetManager**（Unity AssetBundle/Addressables 管理可下载资产，Unreal Pak 分包和 AssetManager.PrimaryAssetLabels 实现按需加载与热更）
    
-   **Inspector 面板 vs Details 面板**（Unity Inspector 显示选中对象组件属性，Unreal Details 面板展示选中 Actor 或资源的属性，可通过 UPROPERTY 编辑固定项或自定义 DetailCustomization）
    

## 构建发布与热更新

-   **UnrealPak 内容打包**：Unreal 将最终资产打包为一个或多个 .pak 文件，可根据 Chunk 划分不同pak以支持热更；Unity 使用 **AssetBundle** 或 Addressables 分包资源用于更新
    
-   **增量补丁**：Unreal 支持 **差分包** 发布更新（Pak Patch/DLC），仅分发改动的pak块；Unity Addressables 可通过Remote Catalog + CDN增量更新资源
    
-   **蓝图热更新**：Unreal 蓝图逻辑编译后存于 .uasset，可在客户端通过更新资源实现逻辑替换（避免重新提交可执行文件）；Unity 脚本逻辑一般无法在运行时热更（常借助 Lua/热更插件解决）
    
-   **C++代码更新**：Unreal 原生C++逻辑编译进可执行，更新需重新发行新版本（无法纯资源热更）；Unity IL2CPP 编译后同样代码无法热修复，需发新客户端版本
    
-   **版本控制**：Unreal 项目包含大量二进制资产（.umap关卡, .uasset资源），常用 **Perforce** 等支持文件锁定的版本管理，或 Git LFS 存储大文件；Unity 资产多为文本格式(YAML)，使用 Git 合并冲突相对容易
    
-   **协作流程**：Unreal 团队协作推荐锁定关卡等二进制资源防止冲突编辑；Unity 可多人同时编辑不同场景或Prefab，合并由引擎解析 YAML 完成，但大场景避免多人并行修改
    
-   **多平台打包**：Unreal 使用 **Cook** 烹饪资源（针对目标平台处理格式）再打包，每个平台输出独立pak和可执行；Unity 针对各平台编译脚本并重新打包资源（AssetBundle 可跨平台但需注意格式差异）
    
-   **配置与优化**：Unreal 可通过 Target Rules 和 Packaging Settings 控制打包选项（如是否包含调试符号、压缩方式）；Unity 通过 Player Settings 和 BuildOptions 配置压缩、裁剪代码等
    
-   **发布构建模式**：Unreal 区分 **Development/Shipping** 构建，Shipping 移除调试接口性能更优；Unity 则有 Development Build 开关决定是否包含 Profiler 等调试信息
    
-   **持续集成**：大项目通常搭建 CI 自动化构建：Unreal 使用命令行 **Unreal Automation Tool (UAT)** 脚本化打包流程，Unity 使用 **BatchMode** 命令行或 CI 服务执行自动打包
    
-   **补丁和安装**：Unreal 支持 **Launcher** 渠道增量更新，或者自研补丁程序比较Pak更新；Unity 较少官方方案，需要自行实现补丁程序或使用第三方框架
    

## 网络与多人游戏

-   **网络框架**：Unreal 内置**复制 (Replication)** 框架，Actor 可选择性 Replicate 来在服务端和客户端自动同步属性和行为；Unity 无内置高层网络框架，通常使用第三方（如 Photon、Mirror）或 Unity Netcode 库实现
    
-   **属性同步**：Unreal 用 **Replicated UProperty** 标记需要自动同步的变量，支持 RepNotify 回调；Unity 第三方框架（Mirror 等）提供类似同步变量机制，或需手动通过 RPC 同步状态
    
-   **RPC 远程过程调用**：Unreal C++/蓝图可标记函数为 Server 或 Client，实现服务器<->客户端的 RPC 调用；Unity Netcode/Mirror 提供 [Command] 和 [ClientRpc] 方法实现调用，Photon 等通过 RaiseEvent 实现
    
-   **移动预测与校正**：Unreal **CharacterMovementComponent** 内建客户端预测和服务器校正，降低延迟影响；Unity 实现平滑需要手工插值预测（如 Lerping 位置）或用网络库内建功能
    
-   **网络拓扑**：Unreal 支持 Listen Server（主机兼任服务器）和 Dedicated Server（独立服务器进程）；Unity Photon 等一般是云服务器架构，Mirror 可做主机模式，需理解不同拓扑下时延和同步差异
    
-   **Gameplay Ability System**：Unreal 提供 **GAS** 框架简化网络同步下的技能冷却、属性修改等复杂玩法开发（属性变化自动同步，多角色协同）；Unity 则需要自行实现类似的技能系统并处理网络同步
    
-   **在线子系统 (Online Subsystem)**：Unreal OSS 抽象了平台的会话、成就、存档接口；Unity 对应需要使用 PlayFab、Steamworks 或各平台 SDK 实现联机服务对接
    
-   **低层通信**：Unreal 有 FSocket 等接口可实现自定义 Socket 通信，以及 HTTP/JSON 模块用于 RESTful 接口调用；Unity 使用 `System.Net.Sockets` 或 UnityWebRequest 进行网络通信和HTTP请求
    
-   **同步与安全**：了解 Unreal 网络频率、带宽优化（如属性更新频率、条件复制）和反作弊机制；Unity 联机需关注数据压缩、差量发送，以及客户端验证等，同样面临作弊风险
    

## 物理与碰撞系统

-   **物理引擎**：Unreal 内置 **Chaos Physics**（UE5）作为物理引擎（UE4 用 PhysX）；Unity 3D 默认为 **PhysX**，部分新版本可选 Havok 插件
    
-   **碰撞通道**：Unreal 用 **Collision Channel** 定义碰撞类别和响应，配置 Collision Profile 决定不同物体的碰撞交互；Unity 用 **Layer** 决定碰撞矩阵，在 Project Settings 定义哪些 Layer 互相碰撞
    
-   **刚体组件**：Unreal 刚体由 **UPrimitiveComponent** (如 StaticMeshComponent) 上启用 Simulate Physics 驱动，Mass等属性在 Physical Material 中配置；Unity 刚体由 **Rigidbody** 组件控制，质量、摩擦由 PhysicMaterial 决定
    
-   **角色碰撞**：Unreal **Character** 默认使用 **CapsuleComponent** 作为碰撞体并整合 CharacterMovement 实现物理移动；Unity **CharacterController** 提供类似胶囊碰撞和移动封装（非完全物理刚体）
    
-   **物理约束**：Unreal 提供 **Physics Constraint** 组件（关节）模拟铰链、弹簧等约束；Unity 提供 **Joint** 组件（FixedJoint, HingeJoint, SpringJoint 等）实现刚体约束
    
-   **布料与软体**：Unreal **Chaos Cloth** 系统模拟布料，**Chaos Soft Body**（未来版本支持软体）；Unity 有基础 **Cloth** 组件模拟旗帜等布料，但软体需借助第三方库
    
-   **破碎与破坏**：Unreal **Chaos Destruction** 支持几何集合碎裂和实时破坏；Unity 无内置碎裂，需要导入预碎模型或运行时算法（如 Voronoi 破碎插件）
    
-   **载具物理**：Unreal **Chaos Vehicles** 提供车辆轮胎模型和悬挂仿真；Unity 通过 **WheelCollider** 实现车辆基础物理，复杂车辆需额外模拟悬挂
    
-   **物理材质**：Unreal **Physical Material** 赋予碰撞材质属性（摩擦、反弹等）；Unity **Physic Material** 提供类似功能赋予碰撞材质
    
-   **调试工具**：Unreal 提供 `pxvis collision` 控制台命令或 Chaos Visual Debugger 来可视化碰撞体和物理行为；Unity 可在 Scene 视图启用物理调试或使用 Debug.DrawLine 绘制射线辅助调试
    

## 人工智能（AI）

-   **导航网格**：两引擎都提供寻路网格生成与寻路功能：Unreal 通过 NavMeshBoundsVolume 烘焙 **NavMesh**，AIController 可调用 MoveTo导航；Unity NavMesh 系统烘焙场景网格，NavMeshAgent 组件驱动角色路径行走
    
-   **行为树**：Unreal 内置 **Behavior Tree** 行为树编辑器定义 AI 决策逻辑，搭配 **Blackboard** 保存状态；Unity 无官方行为树，需用 **Unity ML-Agents** 或第三方行为树框架，或用自制状态机实现 AI 逻辑
    
-   **感知系统**：Unreal **AISense** 系统 (如 Sight, Hearing) 通过 **AI Perception Component** 感知周围Pawn；Unity 无内置感知组件，需要脚本用 Physics.OverlapSphere等实现视野/听觉检查
    
-   **EQS**：Unreal **Environment Query System** 可让 AI 进行环境询问（如寻找掩体点）；Unity 无对应工具，如需实现需自行编程计算最佳地点
    
-   **AI 控制**：Unreal AI由 **AIController** 控制 Pawn，使用行为树或 C++ 编写决策；Unity AI 通常在角色脚本中实现，没有独立 AI控制器概念
    
-   **大量AI优化**：Unreal 提供 **Mass Entity** (MassAI) 框架，在海量AI场景下用数据驱动方式批量更新AI；Unity 可用 ECS/DOTS 实现大量AI优化更新
    
-   **机器学习**：Unreal 有 **Learning Agents** 插件，用强化学习训练AI；Unity 提供 ML-Agents 工具包，可训练神经网络代理决策，不过两者都不算常规游戏AI开发需求
    
-   **调试**：Unreal 提供 AI 调试 (按 **‘** 键) 可视化 AI 感知、路径、行为树当前节点等信息；Unity 调试AI需借助自行绘制Gizmos或调试日志查看内部状态
    

## 音频系统

-   **音频组件**：Unreal 用 **Audio Component** 在场景中播放声音（可3D定位）；Unity 用 **Audio Source** 组件播放声音
    
-   **Cue 和混合**：Unreal 声音通过 **Sound Cue** 资产组合多个声音节点（混音、延迟、随机等）；Unity 通过多个 Audio Source 和 **Audio Mixer** 混音器进行混合控制
    
-   **MetaSounds**：Unreal 引入 **MetaSounds** 可视化音频脚本（类似材质编辑方式制作复杂音频效果）；Unity 无对应内置功能，如需复杂音频合成需借助 MIDI/自定义 DSP
    
-   **音频调制**：Unreal **Audio Modulation** 插件可动态控制音频参数（音量、音调）；Unity 可通过 Audio Mixer Snapshots 或脚本实时调整 Audio Source 参数实现类似效果
    
-   **衰减和空间化**：两引擎都支持 3D 音频衰减；Unreal 用 **Attenuation Settings** 配置声音随距离音量衰减曲线、立体声扩散等；Unity Audio Source 提供 MinDistance/MaxDistance 控制衰减起止，支持空间音效插件
    
-   **声音分类**：Unreal 用 **Sound Class** 分组管理音频（可整体控制音量、是否静音等），**Sound Mix** 可暂时混合改变某些Sound Class参数；Unity 用 Audio Mixer 的 Group 将声音分类，Mixer Snapshot 可切换整体效果
    
-   **实时效果**：Unreal 支持在 **Submix** 上应用实时音频效果（混响、EQ等）；Unity 在 Audio Mixer的Group上添加 Audio Effect Filter 实现实时DSP效果
    
-   **多平台格式**：Unreal 可针对平台选择压缩格式（如移动端使用ADPCM降低CPU，或Ogg/Opus等）；Unity 默认将音频压缩为Vorbis/ADPCM等格式，可针对平台设置
    
-   **语音与聊天**：Unreal Online Subsystem 支持语音聊天接口；Unity 需要第三方语音SDK（如 Photon Voice）实现实时语音
    
-   **音频调试**：Unreal 提供 Audio Debug 模式查看当前播放声音、声音类占用；Unity 可通过 Audio Mixer 面板实时观察各组音量及Profiler音频视图调试
    

## 特效与粒子系统

-   **粒子编辑器**：Unreal 早期使用 **Cascade** 粒子编辑器，UE4.25+ 推出 **Niagara** 作为新一代特效系统；Unity 内置 **Shuriken 粒子系统** 以及 **VFX Graph**（为HDRP提供节点式GPU粒子）
    
-   **Niagara vs VFX Graph**：两者都是节点式基于GPU的高级特效编辑工具，支持自定义粒子属性、行为和复杂效果；Niagara 集成于UE任何项目，Unity VFX Graph需HDRP或URP支持
    
-   **发射器与模块**：Unity Shuriken通过粒子发射器和内置模块（Shape, Collision等）配置；Unreal Niagara通过添加 **Emitter** 和 **Module**（脚本化粒子更新）实现，更灵活强大
    
-   **GPU 粒子**：Unreal Niagara 默认运行在GPU上可高效模拟大量粒子，Unity VFX Graph 同样利用GPU Compute，实现百万粒子效果
    
-   **粒子事件**：Unreal Niagara 支持粒子碰撞、寿命等事件驱动与蓝图交互；Unity 粒子可通过 Collision 回调或触发器触发脚本事件，但不如 Niagara 事件系统丰富
    
-   **后处理特效**：Unreal 后处理Volume可实现全屏特效（景深、泛光等），Unity 后处理栈同样实现 LUT 色彩、景深等全局效果
    
-   **延迟贴花 (Decal)**：Unreal 支持 Deferred Decal 组件投射贴花效果到场景表面；Unity 提供 Decal Shader Graph (在HDRP) 或 Projector 组件实现简单贴花投射
    
-   **摄像机震动**：Unreal 有 Camera Shake 类和 Matinee Camera Anim 实现镜头抖动效果；Unity 通常通过 Cinemachine Noise 模板或脚本控制 Camera.transform 实现抖动
    
-   **材质特效**：Unreal 材质系统可制作溶解、渐变等效果并通过蓝图控制参数实时变化；Unity 可通过 Shader 属性动画或材质球更换实现类似效果
    
-   **性能考虑**：无论引擎，粒子特效都需注意 Overdraw（过度叠加耗GPU）、控制粒子数量、使用LOD/ Cull Distance，善用 GPU 粒子减轻CPU负担
    

## 开发流程与引擎扩展

-   **编辑器扩展**：Unreal 支持**Blutility**蓝图编辑实用工具和 **Editor Utility Widget** 定制面板，以及 C++ **Editor Module** 编写自定义编辑器功能；Unity 通过编辑器脚本 (EditorWindow, PropertyDrawer 等) 扩展编辑器功能
    
-   **细节面板定制**：Unreal 可用 **DetailCustomization**/**PropertyTypeCustomization** 来自定义 Details 面板UI和交互；Unity 可通过创建自定义 Inspector (Editor脚本) 修改 Inspector 面板显示
    
-   **引擎插件**：Unreal 项目可编写 **插件 (Plugin)** 封装独立模块，插件可插拔共享；Unity 利用 **UPM 包** 或 .dll 插件分发功能模块，源代码插件也可作为工程的一部分
    
-   **构建工具**：Unreal **UnrealBuildTool (UBT)** 管理编译，各模块通过 .Build.cs 定义依赖和宏；Unity 无显式构建脚本，编译由引擎自动完成，但可用 asmdef 控制编译边界、用自定义 BuildPipeline 脚本定制打包
    
-   **源码定制**：Unreal 引擎源码开放，可在必要时修改引擎代码或提交引擎补丁；Unity 除非获得源码版权，否则无法修改引擎内部，实现特殊需求多用绕过或插件形式
    
-   **调试手段**：Unreal 调试 C++ 需使用 VS等调试器附加进程，蓝图可直接在编辑器内打断点；Unity C# 可使用 VS/JetBrains Rider 附加 Unity Editor 调试，亦可用 Debug.Log 打印日志
    
-   **日志系统**：Unreal 使用 `UE_LOG` 宏分门别类记录日志，Output Log 查看输出；Unity 使用 `Debug.Log/Warning/Error` 输出日志到 Console 窗口
    
-   **配置管理**：Unreal 配置通过 .ini 文件分层管理（Engine.ini, Game.ini 等可不同平台覆盖）；Unity 项目设置保存在 ProjectSettings 资产中，不同平台配置通过 PlayerSettings 切换
    
-   **持续集成与测试**：Unreal 可编写 Automation Tests 脚本进行自动化测试，使用命令行运行批处理；Unity 可使用 Unity Test Framework 编写 EditMode/PlayMode 测试，用 CI 执行 BatchMode 下的测试
    
-   **跨团队合作**：Unreal 美术和关卡设计可主要使用蓝图和Editor工具，无需修改C++代码；Unity 场景搭建和预制调参由美术完成，程序提供脚本与Editor Tools配合，美术可通过定制Inspector调整参数
