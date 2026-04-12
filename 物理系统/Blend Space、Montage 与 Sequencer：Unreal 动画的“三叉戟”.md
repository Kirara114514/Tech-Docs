# Blend Space、Montage 与 Sequencer：Unreal 动画的“三叉戟”

## 摘要
# Blend Space、Montage 与 Sequencer：Unreal 动画的“三叉戟” > 承接上一篇（AnimBP 与状态机），这次我们把 **Blend Space / Animation Montage / Sequencer** 三件“重器”摆开讲清。它们分别解决“**连续过渡** / **可打断的时序动作** / **电影级编排**”。如果你来自 Unity：把它们大致...

## 正文

# Blend Space、Montage 与 Sequencer：Unreal 动画的“三叉戟”

> 承接上一篇（AnimBP 与状态机），这次我们把 **Blend Space / Animation Montage / Sequencer** 三件“重器”摆开讲清。它们分别解决“**连续过渡** / **可打断的时序动作** / **电影级编排**”。如果你来自 Unity：把它们大致映射为 **Blend Tree / Animator+Playables / Timeline** 会更快上手。

----------

## 总览：各司其职，别混着用

-   **Blend Space**（姿势连贯插值）：  
    典型用于 **速度/方向** 驱动的移动、**瞄准偏移**（Aim Offset）、**载具踏频** 等“**连续变量**→**连续姿势**”的问题。  
    Unity 对应：**Blend Tree（1D/2D）**。
    
-   **Animation Montage**（可打断、可分段、可插槽）：  
    攻击、受击、翻滚、交互、拾取、开门……这类 **“从任何状态都可能发生，又可能被中断”** 的时序动作。  
    Unity 对应：**Animator.CrossFade + Layers/AvatarMask**，或 **Playables** 自己接。
    
-   **Sequencer**（过场与镜头）：  
    关卡级时间轴，驱动摄像机、角色、特效、灯光，并能触发事件。  
    Unity 对应：**Timeline + PlayableDirector + Cinemachine**。
    

一句话心法：

> **移动/瞄准** 用 **Blend Space**，**战斗/交互** 用 **Montage**，**剧情镜头** 用 **Sequencer**。状态机负责“常态”，Montage 负责“插段”，Sequencer 负责“整活”。

----------

## 一、Blend Space：把“数值变化”变成“姿势连续”

### 1.1 核心概念

-   **1D / 2D Blend Space**：用一个或两个维度（如 `Speed`，或 `Speed` + `Direction`）在多个样本动画间插值，输出一帧 **Pose**。
    
-   **Aim Offset** 是 Blend Space 的特化资产（多用于上下/左右瞄准）。
    

### 1.2 上手流程（以 2D：Speed × Direction 的“八向移动”为例）

1.  **新建 2D Blend Space**（选定 Skeleton）。
    
2.  **设置轴**：
    
    -   X：`Direction`（-180 ~ 180，按左右转向）
        
    -   Y：`Speed`（0 ~ MaxSpeed，比如 600）
        
3.  **放样本**：
    
    -   `Speed=0, Direction 任意` → Idle
        
    -   `Speed>0, Direction=0` → Forward
        
    -   `Speed>0, Direction=±90` → StrafeLeft/Right
        
    -   `Speed>0, Direction=180/-180` → Backward
        
    -   有需要可放对角（前左/前右/后左/后右）补样。
        
4.  **AnimBP/Event Graph** 里每帧计算变量：
    
    -   `Speed = |Velocity|`
        
    -   `Direction = CalculateDirection(Velocity, ActorRotation)`
        
5.  **AnimGraph** 用该 Blend Space 节点，喂 `Speed/Direction`，接到 **Locomotion** 状态。
    
6.  **脚滑处理**：配置 **Sync Group / Marker**（步态标记），并对 Idle↔Move 混合时间做微调。
    

> 方向型 2D 混合在 Unity 是 **Blend Tree（2D Freeform Directional/Cartesian）**，填法几乎一致：`Speed` + `Direction`，样本点的布局与 UE 一一对应。

### 1.3 常见用法清单

-   **行走/跑步**：1D（Speed）或 2D（Speed+Direction）。
    
-   **瞄准偏移**：Aim Offset（Pitch/Yaw），保持上半身与准星对齐。
    
-   **载具/机器**：踏频、转速、转向盘角度。
    

### 1.4 细节与坑

-   **插值类型**：线性足够稳定。对“姿势差距大”的样本，建议加中间样本减少“塌陷”。
    
-   **样本规范**：同样本要 **同帧率/同长度/同循环段标记**，否则混合相位跳。
    
-   **变量稳定性**：`Direction` 抖动时，做一点 **低通滤波** 或死区（例如 |Speed| < 5 视为 0）。
    
-   **成本优化**：对重复使用的分支用 **Cache Pose**；Blend Space 本身可启用采样优化（默认已合理）。
    

### 1.5 Unity 迁移要点（Blend Tree → Blend Space）

-   **轴含义一致**：Unity 的 2D Directional 就是 Speed/Direction，直接搬。
    
-   **Normalized Time** 在 UE 用 **Sync Group + Marker** 替代。
    
-   **参数更新**：`Animator.SetFloat` 对应 UE 在 **Event Graph** 里算变量。
    

----------

## 二、Animation Montage：可分段、可打断、可叠加

### 2.1 为什么用 Montage，而不是状态机？

-   **全局打断**：从任何 Locomotion 态都能进攻击/受击；
    
-   **分段编排**：连击（A1→A2→A3）、起收势、受击硬直、交互动作；
    
-   **上半身覆盖**：不破坏下半身移动；
    
-   **事件点**：在准确帧触发 **Notifies**（出招判定、音效、抖屏）。
    

> Unity 若仅靠 Animator 状态机，会变成“线多如织”的过渡地狱。通常要用 **层 + AvatarMask + CrossFade**；更进阶是 **Playables** 自己接。UE 里 Montage 把这类诉求收口成一套资产与 API。

### 2.2 关键部件

-   **Slot（插槽）**：Montage 播在哪个“图层”。常见一个 `UpperBody` Slot 用来覆盖上半身。
    
-   **Sections（片段）**：A1/A2/A3 等连击段。
    
-   **Notifies / Notify States**：事件点/事件区间（伤害判定、FX、脚步声）。
    
-   **Branching Points**：严格对齐帧的分支（命中确认、切段）；
    
-   **Root Motion**：可选择 **仅从 Montage 读 Root Motion**（角色位移由动画驱动）。
    

> 角色类（Character）里常见设置是 **Root Motion from Montages Only**：日常移动用 CharacterMovement，特定动作（翻滚、处决）用 Montage 的 Root Motion。

### 2.3 AnimGraph 接入

-   在 AnimGraph 放 **Slot（e.g. “UpperBody”）** 节点，把它叠加到 Locomotion（`Layered blend per bone`）上。
    
-   之后凡是往该 Slot 播的 Montage，都会覆盖到对应骨骼层级。
    

### 2.4 播放控制（Blueprint / C++）

-   **Blueprint 常用节点**：`Montage Play`、`Montage Stop`、`Montage Jump to Section`、`Set Next Section`、`Montage Is Playing`。
    
-   **C++（示意）**：
    

```cpp
UAnimInstance* Anim = Mesh->GetAnimInstance();
if (Anim && AttackMontage)
{
    float Len = Anim->Montage_Play(AttackMontage, /*PlayRate*/1.0f);
    // 也可设置起始Section、混入/混出时长、蒙太奇优先级等
}

```

-   **回调**：绑定“开始混出/播放结束”的委托（蓝图或 C++）来做收尾/连段判定。
    

### 2.5 典型范式：三段连击（轻-轻-重）

1.  **Montage 结构**：Sections：`L1` → `L2` → `H3`；在关键帧放 `AnimNotify: WindowOpen/WindowClose`。
    
2.  **输入缓冲**：在 WindowOpen ~ Close 之间若检测到“攻击键”，就 `SetNextSection(L2)` 或跳到 `H3`。
    
3.  **覆盖范围**：AnimGraph 用 `Layered blend per bone` 只覆盖上半身；下半身继续跑。
    
4.  **命中判定**：在 `Notify` 上做伤害（Trace/盒体检测），或用 **Branching Point** 在帧对齐点处理。
    
5.  **打断策略**：被击中→`Montage_Stop`，切到“受击”Montage；或设置优先级更高的槽组。
    

### 2.6 细节与坑

-   **Slot/层次管理**：把“战斗/交互/武器切换”分 Slot，避免互相挤断。
    
-   **混入/混出**：太短会“折手”，太长会“拖泥带水”。手感需要 AB。
    
-   **Root Motion 一致性**：素材要统一朝向与标记；否则位移漂移。
    
-   **蒙太奇优先级**：高优先级可打断低优先级，避免“轻攻击卡住重攻击”。
    
-   **网络复现**：Montage 播放/跳段得 **在服务器** 控；Notify 触发的伤害也走服务端。
    

### 2.7 Unity 迁移要点（Animator/Playables → Montage）

-   **上半身覆盖**：Unity 用 **AvatarMask + Layer**；UE 用 **Slot + Layered blend per bone**。
    
-   **事件**：Unity 的 **Animation Events** 对应 UE 的 **Notify**（时间轴上点）。
    
-   **连段**：Unity 多用 `CrossFade` + 参数窗；UE 直接 `SetNextSection`。
    
-   **Playables** 里的可编排、可插拔思路，与 **Montage + Slot** 相当契合（UE 更“图形化” + 内置）。
    

----------

## 三、Sequencer：把“镜头与剧情”拉到一条时间轴上

### 3.1 它解决什么？

-   **过场**（Cinematic）：开场、处决、剧情桥段、任务完成演出；
    
-   **镜头**：多机位剪切、景深、运镜曲线；
    
-   **事件**：在时间轴上精准触发蓝图/C++ 事件、音效、UI、关卡逻辑。
    

### 3.2 基本构成

-   **Level Sequence 资产**：一条时间轴。
    
-   **绑定**：把场景里的 Actor 绑定到轨道（**Possessables**），或由序列 **Spawn**（**Spawnables**）。
    
-   **Track 类型**：
    
    -   Animation Track（驱动物体骨骼）
        
    -   Camera Cuts + CineCamera 轨（机位与切换）
        
    -   Transform/Visibility/Material/Light/Audio 轨
        
    -   **Event Track**（调用蓝图事件/C++ 函数）
        
    -   **Sub-Sequence**（嵌套，复用）
        
    -   **Control Rig Track**（直接在 Sequencer 里玩反解/程序化）
        

### 3.3 运行时播放

-   关卡里放 **Level Sequence Actor**，蓝图用 `Play/Pause/Stop` 控制；
    
-   或用 `Create Level Sequence Player` 在逻辑里按需生成与播放；
    
-   **Binding Overrides**：运行时动态替换绑定对象（同一套过场对不同角色生效）。
    

### 3.4 典型范式：剧情过场开门 + 还权给玩家

1.  **准备机位**：两个 CineCameraActor，Sequencer 里 Camera Cuts 切换。
    
2.  **角色与门**：给角色上 Animation Track（走到门前），门上 Transform Track（旋转开门）。
    
3.  **事件点**：在时间轴某帧放 Event→蓝图接口：`Door->Unlock()`、`UI->ShowSubtitle()`。
    
4.  **收尾**：末尾 Event→蓝图：`EnablePlayerInput(true)`，解控；可加淡出/Fade。
    

### 3.5 细节与坑

-   **帧率与补偿**：Sequencer 有自己的 fps；确保和项目/录制一致。
    
-   **过场期间的“物理/AI”**：必要时冻结或接管（Possess/UnPossess）。
    
-   **网络**：过场逻辑通常在服务器主导，客户端只做表现（摄像机/音频本地化）。
    
-   **可跳过**：设计成可安全中断，清理残留（关 UI、还输入、重置绑定）。
    

### 3.6 Unity 迁移要点（Timeline → Sequencer）

-   **PlayableDirector** ↔ **Level Sequence Actor**；
    
-   **Signal/Markers** ↔ **Event Track/Triggers**；
    
-   **Cinemachine** ↔ **CineCamera + Camera Cuts**；
    
-   控制理念几乎等价，UE 的 Control Rig 集成度更高。
    

----------

## 四、怎么选？一张“场景判定表”
| 需求 | 首选 |	备注|
|--|--|--|
| 持续移动/瞄准等“连续变量→姿势” | **Blend Space** |1D/2D，必要时配 Sync Group/Marker	|
| 攻击、受击、翻滚、交互 | **Montage** |Slot 分层、Section 连段、Notify 事件	|
| 电影级过场、镜头运镜 | **Sequencer** |Camera Cuts、Event Track、Sub-Sequence	|
| 上半身打枪，下半身跑步 |**Montage + Slot + Layered blend per bone**  |覆盖范围可控	|
| 任务脚本化桥段 |**Sequencer + Event**  |过场里触发蓝图/关卡逻辑	|
| Any State 风格的“随时可播”动作 | **Montage** |	不建议用巨大状态机硬连线|

----------

## 五、迁移对照表（Unity → Unreal）
| Unity | Unreal |迁移提示 |
|--|--|--|
| Blend Tree (1D/2D) | Blend Space / Aim Offset |轴语义与样本布局保持一致|
| Animator Layers + AvatarMask | Slot + Layered blend per bone |上下半身分区更灵活|
| Animation Events | Anim Notifies / Notify States |同样在时间线上落点|
| CrossFade / AnyState 跳转 | Montage Play / Section / Priority |可精确控制混入/混出与打断|
| Timeline + PlayableDirector | Sequencer + Level Sequence Actor |事件、镜头、子序列一应俱全|
| Playables 自定义混合 | AnimGraph 自由拼 + Montage |逻辑基本都能覆盖|

----------

## 六、实战配方（可直接套）

### 配方 A：八方向移动（2D Blend Space）

-   变量：`Speed`、`Direction`。
    
-   样本：Idle/Fwd/Bwd/Left/Right（可加四个对角）。
    
-   状态机：`Idle ↔ Move`，进入 Move 就用 Blend Space。
    
-   优化：`Direction` 加 5~10°死区，`Speed` 小于阈值归零；步态用 Sync Group。
    

### 配方 B：三段连击（Montage + Slot）

-   Slot：`UpperBody`；AnimGraph 上层 `Layered blend per bone` 覆盖脊椎以上。
    
-   Montage：Sections `L1`→`L2`→`H3`；在 Window 段落放 `Notify`。
    
-   逻辑：窗口内收到输入→`SetNextSection`；结束回 Idle。
    
-   网络：服务器驱动播放与伤害；客户端仅表现。
    

### 配方 C：任务过场（Sequencer + Event）

-   Level Sequence：Camera Cuts、角色 Animation Track、门旋转 Track。
    
-   Event Track：`Door->Unlock()`、`UI->ShowSubtitle()`、`EnablePlayerInput(false/true)`。
    
-   运行时：蓝图 `Play`，结束后清理绑定；提供“跳过”按钮走 Stop 分支。
    

----------

## 七、工程级建议（别踩二遍坑）

**Blend Space**

-   样本统一：循环点、帧率、朝向；
    
-   变量防抖：方向/速度做平滑；
    
-   复用缓存：`Cache Pose`，尤其是上半身叠加前的底姿势。
    

**Montage**

-   用 **优先级/槽组** 管住“谁能打断谁”；
    
-   事件逻辑尽量放 **Notify/Branching Point**，别在 Tick 里瞎算时机；
    
-   Root Motion 策略提前定：**只给 Montage** 还是“全开”；
    
-   多人游戏：**服务端判定** + 客户端动画；注意延迟下的窗口判定。
    

**Sequencer**

-   可跳过、可重播、可恢复输入；
    
-   子序列化：把复用片段做成 Sub-Sequence；
    
-   绑定覆盖清晰：运行时替换角色要成对恢复；
    
-   机位资产化：CineCamera 的焦距/景深做成可控参数。
    

----------

## 结语：三件武器，三种节奏

-   **Blend Space** 让移动与瞄准“顺着变量流淌”。
    
-   **Montage** 把战斗与交互“卷成一卷戏”。
    
-   **Sequencer** 则负责“让关卡会讲故事”。
    

把它们叠在 **Animation Blueprint** 的世界里：

> 状态机打底（常态） → Blend Space 出细腻 → Montage 管插段 → Sequencer 接镜头。  
> 路线清了，工程自然不乱。下一步，你可以把当前项目里“最让人头秃的那段状态机”挑出来，用 Montage 重写一遍；再把“开场剧情”的脚本硬编码换成一个干净的 Level Sequence。等你回头，你会惊讶：**复杂度没少，心智负担却轻了很多**。


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 物理系统
- **标签：** ue, unreal, 动画
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*