# UE5 为何“画质自由”：渲染路径、全局光照与 Nanite

## 摘要
# 渲染路径、全局光照与 Nanite：UE5 为何“画质自由” > 写在前面  > Unity 有多条渲染管线（URP/HDRP，对应 Forward/Deferred/Forward+ 等），而 Unreal（下文简称 UE）默认就是**延迟渲染（Deferred Shading）**。要想真正吃透 Lumen（实时全局光照）和 Nanite（虚拟几何体），先把“**渲染路径**”摸清楚...

## 正文

# 渲染路径、全局光照与 Nanite：UE5 为何“画质自由”

> 写在前面  
> Unity 有多条渲染管线（URP/HDRP，对应 Forward/Deferred/Forward+ 等），而 Unreal（下文简称 UE）默认就是**延迟渲染（Deferred Shading）**。要想真正吃透 Lumen（实时全局光照）和 Nanite（虚拟几何体），先把“**渲染路径**”摸清楚，是第一性原理。

----------

## 1. 渲染路径（Rendering Path）

### 1.1 UE 的延迟渲染到底在“延迟”什么？

**基本流程**：

1.  **Base Pass**：先把像素的材质属性写进一组全屏贴图里（**G-Buffer**），例如 BaseColor / Roughness / Metallic / 法线 / 深度等。
    
2.  **Lighting Pass**：随后按灯光逐片元算光，直接读取 G-Buffer 做光照累加。
    
3.  **后续**：屏幕空间 AO、反射等还会复用这些 G-Buffer 数据。
    

> 好处：**灯光与几何解耦**。场景里哪怕有一堆动态点光源，成本主要和“受影响的像素数”相关，而不是“网格被画了多少次”。这就是 UE 默认用延迟渲染的核心原因。

**代价与坑点**（常被忽视的部分）

-   **带宽与显存占用**：多张 G-Buffer 贴图会顶带宽。
    
-   **MSAA 不友好**：经典延迟路径和 MSAA 天生八字不合，通常配套 TAA/FXAA 等后处理抗锯齿。想要 MSAA？要考虑切 **Forward**。在 Unity/HDRP/URP 里也是同理：Deferred 下 MSAA 不可用（HDRP 的 MSAA 仅在 Forward Lit），URP 的 Deferred 也不支持 MSAA。
    
-   **半透明/体积材质**：延迟路径里半透明往往要走**前向补渲**，与反射/折射/排序的交互更复杂；这在 UE 社区讨论里很常见。
    

> 小抄：  
> **“灯光很多 + 多材质复杂 + 非 VR”** → 优先延迟；  
> **“强需求 MSAA/VR/低带宽平台”** → 留意前向方案。

### 1.2 Unity 的几条路子怎么选？

-   **URP Forward（默认）**：每个物体按受影响的灯光多次绘制。优点是简单、移动端友好；缺点是**每物体灯光上限**、Overdraw 与带宽压力。
    
-   **URP Forward+（Clustered/Forward+）**：把屏幕切成 tile/cluster，为每个区块做“**灯光列表**”，渲染时只处理命中的那批灯光，**消除了“每物体 8 灯”的上限**，上限改成“每相机可见灯光数”。灯光很多时，Forward+ 比传统 Forward 更稳。
    
-   **URP Deferred**：URP 也提供延迟路径（有自己的 G-Buffer 编码策略，法线可选量化/八面体编码），但**Deferred 下不支持 MSAA**，叠加渲染层（Rendering Layers）还会多一张 G-Buffer。
    
-   **HDRP**：高端管线，默认**混合了 tile/cluster 的 Forward/Deferred**，在大量灯光场景下扩展性更强。
    

**一句话总结**

-   **大量动态灯光 / 复杂材质**：UE 默认的 Deferred、Unity 的 HDRP（Deferred/Hybrid）更香。
    
-   **需要 MSAA（VR/硬边美术）或移动端**：前向/Forward+ 更稳；Deferred 要慎用。
    

----------

## 2. 全局光照（Global Illumination）

### 2.1 UE5 Lumen：把“烘焙的等待”换成“实时反馈”

**核心思路**（从“光线去哪儿了”讲起）

-   Lumen 构建了一份**“Lumen Scene”**：给附近可见表面生成**Surface Cache**（网格被切成若干 **Cards** 多角度捕获），命中点就能快速查询/更新间接光与反射。追踪时先做屏幕空间的命中，再用**软件/硬件光追**去补全缺失，最后通过 **Final Gather** 得到稳定的间接光。
    
-   **两种追踪模式**：**Software RT**（基于距离场/网格表述）与 **Hardware RT**（真正的硬件光追），平台和项目可选。
    
-   **自发光进光照**：发光材质可以通过 Final Gather 传播能量，但发光面太小太亮会有噪点，需要做阈值与降噪权衡。
    

**为什么它改变生产关系？**

-   以前做动态场景要么烘焙、要么堆探针/体素，迭代慢；现在**动灯光、挪墙体**即可**实时看到二次反弹**和**屏幕外反射**的变化，布局、材质、动画联动都更“所见即所得”。官方博客的技术概览也强调 UE5 “默认全动态 GI/反射”。
    

**平台与限制**

-   桌面/新世代主机是主场；**移动端在 UE 5.4+ 才提供 Android（Vulkan SM5）上的**“**实验性**”**支持**（启用桌面渲染器），iOS 暂不支持，且不建议直接用于量产。
    

> 迁移与性能要点：
> 
> -   开启 Lumen 后，**静态光照方案与它的协作关系**要重新审视（第三篇会系统聊烘焙，这里按下不表）。
>     
> -   **半透明/毛发/微小发光**等边界场景需要留意其稳定性与噪声；复杂反射可与 RT 反射混合取舍。
>     

### 2.2 Unity 的 GI 组合拳（对比视角）

-   **Light Probe / 烘焙 GI**：移动端/入门平台的主力军，折中质量与性能（详细烘焙流程放到第三篇）。
    
-   **HDRP 的 SSGI（屏幕空间 GI）**：无需烘焙即可得到一跳近似的间接光，但**只基于屏幕可见信息**，对遮挡/屏幕外物体不敏感，常配合降噪。
    
-   **Probe Volumes（APV）**：Unity 近年推出的体积探针方案，**在 HDRP 与 URP 都可用**（Unity 6/2023.2 起），在场景体积里自适应布 probe 并烘焙辐照度场，运行时插值查询，**对大场景/动态物体友好**。这不是“完全实时的多次反弹 GI”，但迭代效率和动态适应性显著提升。
    

**小结**

-   **UE5 Lumen**：更接近“开箱即用的实时 GI/反射”，大幅提升关卡/光照迭代速度。
    
-   **Unity**：HDRP 有 SSGI（实时近似），加上 **Probe Volumes** 改善了动态/大场景的用光体验；**移动端仍以烘焙/探针为主**。
    

----------

## 3. Nanite 虚拟几何体

> 一句话：**把“几百万面”当日常像素量来花**，把“LOD 素材管理”和“DrawCall 丛林”变成历史问题的一部分。

### 3.1 它做了什么“非常规”的事？

-   Nanite 用新的内部网格格式，把模型离线切成**层次化三角簇（clusters）**，**运行时按像素比例**只取“看得见”的细节；**数据按需流式**，并且**在自己的渲染通道里绕开传统 draw call**。这就是为什么巨量几何也能**GPU 端高效剔除 + 低 CPU 开销**。
    

> 和谁是天作之合？——**Virtual Shadow Maps（VSM）**：专为匹配 Nanite 的几何细节提升阴影分辨率与质量，统一了影子路径，控制项也更简单。

### 3.2 可用性与边界

-   **材质与功能**：支持 **Opaque/Masked**（半透明 Mesh Decal 等不在内），可投接 Decal；World Position Offset（顶点位移）对 Nanite 有**限制性的支持**（Beta，需要约束位移幅度）。
    
-   **植被/发丝这类“聚合几何”**：由于远处会变成“半透明云团”一类的形态，Nanite 难以像连续曲面那样激进简化；官方建议勾选 **Preserve Area** 并倾向**几何叶片**替代“遮罩卡片”。
    
-   **渲染器/平台限制**：当前文档明确：**不支持 Forward 渲染、VR 立体渲染、MSAA** 等；平台上已支持 PC/PS5/XSX 等（细节见官方“Supported Platforms”节）。不支持的情况会走 **Fallback Mesh**。
    

> 性能侧一条硬规则：**像素决定成本**。Nanite 会把三角开销近似压到与“屏幕像素”同量级，**材质复杂度/实例数**仍会成为瓶颈，需要用 UE 的可视化/统计工具盯着调。

### 3.3 和 Unity 的对照

-   Unity 目前**没有 Nanite 这种“引擎级虚拟几何”**方案。高模通常靠：
    
    1.  传统 LOD + 跨淡；
        
    2.  GPU Instancing/可编程剔除；
        
    3.  HLOD/烘焙卡片/Impostor（第三方/自研）。
        
-   这意味着**美术交付流**在 Unity 里仍要“面数管理 + LOD 素材治理”，而 UE5 可以更大胆地直接消费电影级资产（当然材质/实例数依旧要控）。官方博文对“像素比例细节 + 高对象数”的定位描述得很直接。
    

----------

## 4. 选型与落地：给制作人的“战术板”

**如果你的项目具备以下特征**：

-   **多动态灯光 / 关卡频繁改动**：
    
    -   UE：**默认 Deferred + Lumen + VSM +（尽量）Nanite**，即得即所见。
        
    -   Unity：HDRP + **SSGI + Probe Volumes**，烘焙与实时混合。
        
-   **VR / 强需求 MSAA / 移动端**：
    
    -   UE：评估 **Forward Shading**（失去 G-Buffer 取样等能力），对 Lumen/Nanite 的平台支持要逐项核对（移动端 Lumen 现为**实验**且仅 Android Vulkan SM5 路径）。
        
    -   Unity：倾向 **URP Forward+**，避开 Deferred 的 MSAA 限制。
        
-   **超高模/写实**：
    
    -   UE：**Nanite** 先上，配 **VSM** 保证阴影跟得上几何细节。
        
    -   Unity：回归工程化管理（LOD/HLOD/卡片/Impostor），把素材治理当“第一等公民”。
        

----------

## 5. 一页纸复盘（不和后续篇幅重叠的精简版）

-   **渲染路径**：UE 默认 **Deferred**；Unity 有 **URP（Forward/Forward+/Deferred）** 与 **HDRP（Hybrid Tile/Cluster Forward+Deferred）**。Deferred 强于“多灯光扩展性”，Forward 擅长“MSAA/VR/移动端”。
    
-   **GI**：
    
    -   **Lumen**：Surface Cache +（屏幕/软硬件）光追 + Final Gather → **真正的全动态 GI/反射**，显著提升迭代效率；移动端现为**实验**（Android Vulkan SM5）。
        
    -   **Unity**：HDRP **SSGI**（屏幕空间近似）+ **Probe Volumes**（体积探针，HDRP/URP 可用）+ 烘焙体系。
        
-   **几何**：
    
    -   **Nanite**：按像素比例只渲染“看得见的三角”，绕开传统 draw call；与 **VSM** 搭档。Forward/VR/MSAA 等有明确限制，植被/卡片要按官方建议处理。
        
    -   **Unity**：无同级内置方案，高模依赖 LOD/Instancing/HLOD/卡片等工程手段。
        

----------

## 6. 额外加餐：工程师视角的“落地清单”

**UE 项目**

-   选 **Deferred** 为主，若需 MSAA/VR，再评估 **Forward Shading**（注意材质取样/功能差异）。
    
-   只要平台允许，**先开 Lumen 与 VSM**，再基于 Profiling 调整 GI/反射质量与追踪模式。
    
-   模型默认**启用 Nanite**，对**聚合几何（树叶/草）**启用 **Preserve Area**；限制过大的 WPO；关注实例数与材质多样性。
    

**Unity 项目**

-   **URP**：灯光少 → Forward；灯光多/关卡密集 → **Forward+**；谨慎使用 Deferred（记住“没 MSAA”）。
    
-   **HDRP**：用内建的 **tile/cluster 架构**扩展灯光；GI 侧结合 **SSGI + Probe Volumes**，移动端优先烘焙/探针。
    

----------

> 尾声  
> UE5 用“**Deferred + Lumen + Nanite + VSM**”这套组合拳，直接把“**光**、**几何**、**阴影**”三个最贵的大项统统拉到实时迭代的舒适区。Unity 的思路更偏组合式：URP/HDRP 各取所长，用 **Forward+ / SSGI / Probe Volumes / 烘焙**去拼装答案。路径不同，目标一致——**又稳、又快、又好看**。

（下一篇：**材质系统与材质实例**——节点树如何落到 Shading Model、以及 Unreal 的 Material Instance 为什么“几乎零成本、极度好用”。）


## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 编程范式
- **标签：** ue, 渲染
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*