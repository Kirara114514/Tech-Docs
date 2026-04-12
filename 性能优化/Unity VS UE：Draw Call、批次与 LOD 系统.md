# Unity VS UE：Draw Call、批次与 LOD 系统

## 摘要
 # 引言 在实时渲染中，每个对象的独立绘制调用（Draw Call）都需要 CPU 设置渲染状态并提交命令给 GPU。切换材质或渲染状态的开销往往高于实际绘制本身，因此大量绘制调用会成为性能瓶颈。减少绘制调用数、合并类似对象并复用渲染状态，是提升渲染效率的关键。LOD（Level of Detail）技术通过为物体准备不同细节级别的模型，使得远处对象使用更简化的网格，从而进一步降低远距离渲...

## 正文



# 引言

在实时渲染中，每个对象的独立绘制调用（Draw Call）都需要 CPU 设置渲染状态并提交命令给 GPU。切换材质或渲染状态的开销往往高于实际绘制本身，因此大量绘制调用会成为性能瓶颈。减少绘制调用数、合并类似对象并复用渲染状态，是提升渲染效率的关键。LOD（Level of Detail）技术通过为物体准备不同细节级别的模型，使得远处对象使用更简化的网格，从而进一步降低远距离渲染的开销。

## Draw Call 与批次优化

### Unity：静态合批、动态合批与 GPU 实例化

-   **静态合批（Static Batching）**：Unity 在构建时会把标记为静态（Static）的网格按材质合并成大网格，以减少绘制调用。合并后的网格仍会按原对象剔除，以保证渲染数量不变。启用静态合批的条件是物体必须在场景中保持不动，且使用相同的顶点属性和材质。合批后的每个网格最大支持64K顶点，如果超过会拆成多个批次。  
    然而静态合批需要额外的内存：Unity 会为每个使用相同网格的静态物体复制顶点数据并插入合并网格，导致几何体在合并网格中出现多次。在资源紧张的情况下，比如给大量树木启用静态合批会显著增加内存占用。因此要根据需求平衡内存与性能开销。
    
-   **动态合批（Dynamic Batching）**：Unity 运行时自动将多个小网格合并成一个绘制调用来减少调用次数。动态合批将顶点数据在 CPU 端变换到世界空间，然后合并相邻小网格的顶点。它适用于三角形数量较少的网格（默认不超过300个顶点属性）。例如，一个网格仅有顶点位置、法线和UV时，最多可批300顶点；如果包含切线和多个UV集，则可批顶点数更少（如180顶点）。需要注意的是，动态合批会增加 CPU 变换顶点的负担，在现代硬件上往往不如减少绘制调用来得划算。因此动态合批多用于低端平台或小物体场景，且只有在顶点数量极少且材质相同时才会触发。使用时应通过配置管理器或代码开启（在 URP 中默认支持，HDRP 默认关闭）。
    
-   **GPU 实例化（GPU Instancing）**：当场景中存在大量相同网格、相同材质的物体时，可以开启材质的实例化功能。一条绘制调用可以同时渲染多个对象，每个实例可设置不同的颜色、缩放等属性。GPU 实例化由显卡硬件支持，对大量重复对象（如树丛、草丛）非常有效。使用时需要在材质属性中勾选“Enable Instancing”，或在代码中设置 `material.enableInstancing = true;`。由于 Unity 默认每个实例化着色器在一次调用中最多支持500个实例（可通过 shader 中的 `#pragma instancing_options maxcount: 1000` 来修改），过多实例需要分批提交（可使用 `Graphics.DrawMeshInstanced` 系列 API）。GPU 实例化主要减少 CPU 的绘制调用开销，因此在移动端提升更明显；在高端平台上则需要权衡收集属性数据与绘制成本。Unity 会优先使用静态合批，其次是 GPU 实例化，最后才考虑动态合批。
    
-   **材质合并与贴图图集**：批处理要求合并对象使用相同材质，不同材质间无法合批。因此优化时建议合并材质或制作贴图图集，把多个纹理合并到一张大纹理中，并调整模型的 UV 坐标指向新图集。这样可以让原本不同材质的物体共享同一个材质，大幅提升静态/动态合批和实例化的效率。示例代码：`csharp Material atlasMat = new Material(baseMat); atlasMat.mainTexture = atlasTexture; foreach (var obj in objects) obj.GetComponent<Renderer>().material = atlasMat; StaticBatchingUtility.Combine(rootObject);` 这样在运行时使用 `StaticBatchingUtility.Combine` 或标记静态后会自动合并网格。
    

### Unreal：ISM/HISM 与合并 Actors

-   **Instanced Static Mesh (ISM)**：在 Unreal 中，可以为同一 Static Mesh 添加大量实例。ISM 组件会把相同网格和材质的多个实例合并到一个组件里，从而将多次绘制调用合并为一次。使用 ISM 时，所有实例共享材质和碰撞，且可以在 Details 面板中调整实例数量或添加删除实例。与单独放置多个 Static Mesh Actor 相比，ISM 不仅减少了 UObject 的数量，也显著节省了 GPU 内存：文档中举例，200 本书籍用普通静态网格 Actor 表现消耗 GPU 大约672字节，而用 ISM 渲染每本书只需64字节。由于 ISM 仍按实例逐个在 GPU 端进行剔除，其渲染开销较传统单体对象更低。
    
-   **Hierarchical Instanced Static Mesh (HISM)**：HISM 在 ISM 的基础上增加了层次裁剪结构，适用于大量静态实例的场景。HISM 会对实例集创建空间分区（如八叉树），加速剔除和 LOD 选择。文档指出，当场景中有成千上万几乎不动的实例时，HISM 可以更有效地进行剔除和 LOD 处理。不过 HISM 在每个实例仍使用统一的最低细节 LOD，因此不适合对细节要求较高的对象。一般建议：如果项目主要使用 Nanite 模型（Nanite 自带剔除和 LOD），使用 ISM 即可；HISM 更适合在使用传统网格时，对普通几何体做简化合并。
    
-   **Merge Actors 工具**：Unreal 编辑器提供“合并 Actors”功能，可将多个 Static Mesh Actor 合并成一个新的 Actor，减少绘制调用。操作步骤为在关卡视图或大纲中选中要合并的 Actor，然后在菜单栏 **Actor > Merge Actors**，选择合并类型后保存生成新 Actor。有多种合并模式：
    
    -   _Merge_：将所选静态网格按材质合并到一个网格中，每个材质对应一个网格区段，绘制次数等于材质数。可选将所有材质烘焙为一个，得到单一绘制调用，但会丢失原 UV。
        
    -   _Simplify（代理网格）_：使用所有选中网格的最低细节 LOD，简化并合并为一个代理网格，只保留一个材质，最终一个网格和一次绘制调用。
        
    -   _Batch_：针对相同网格的组件创建 ISM 组件，相当于批量自动转换为实例化渲染，保留 UV 和遮挡关系。
        
    -   _Approximate_：UE5 新增，可处理复杂源网格（如 Nanite），流程类似简化模式但支持更高精度。  
        Merge Actors 特别适合在关卡中将许多重复或相似的小物体合并，减少 Draw Call。典型用法是创建一组草丛/岩石后，通过此工具生成一个合并后的代理物体。
        
-   **Nanite（可选）**：Unreal 5 引入了 Nanite 虚拟化几何体技术，对高多边形模型进行硬件级剔除和 LOD，几乎不再受 Draw Call 或顶点数限制。使用 Nanite 的网格可以直接放置或实例化渲染，省去了手动合批的需求。后续文章可详细介绍，这里只提示 Nanite 是另一种优化路径。
    

## LOD 系统

### Unreal：自动 LOD 生成与 HLOD

-   **自动 LOD 生成（Static Mesh LOD）**：Unreal 提供内置的 LOD 工具。导入静态网格时，可以启用“Import LODs”选项，将在 DCC 软件中制作好的多个 LOD 一并导入。导入后，在 Static Mesh 编辑器的 _LOD Settings_ 面板可查看和设置 LOD。Unreal 也支持在编辑器内自动生成 LOD：可使用预设的 LOD Group（在 _BaseEngine.ini_ 中配置 LODSettings）对网格进行四次简化；或者在导入后直接使用 _LOD Autogeneration_ 功能快速创建简单的 LOD。自动生成工具采用二次网格简化算法，按目标三角数依次合并边来保留外观细节。对于复杂模型，手动导入高质量的 LOD 网格仍然能获得最好效果。
    
-   **层次化 LOD（HLOD）**：对于大型开放世界，Unreal 的 HLOD 系统可以进一步优化。当远距离上场景中许多小物体已经不可交互但仍可见时，HLOD 会将它们合并为一个代理网格来减少绘制调用。使用 World Partition 时，可通过创建多个 HLOD Layer（层）来管理不同类型的合批方式：比如 **Instancing** 模式会将网格替换为其实例化集合（适用于树木、植被等）；**Merged Mesh** 模式直接将多个静态网格合并为一个代理静态网格；**Simplified Mesh** 模式则合并并简化网格。HLOD Layer 支持配置网格合并、材质烘焙、简化程度等参数。启用后，当摄像机远离时，相关 HLOD 层的网格会自动加载并替换原有对象，实现远处物体以更低成本渲染。
    

### Unity：LOD Group 组件

-   **LOD Group 使用**：在 Unity 中，可为具有多个细节模型的物体添加 `LODGroup` 组件来管理 LOD。开发者需要准备不同精度的网格模型（或使用 Billboard）作为不同 LOD 级别的渲染源。在编辑器中为父对象添加 `LODGroup`，然后按层级将各级别的 `Mesh Renderer` 分别拖入不同的 LOD 框框中。每个框上显示的百分比表示屏幕空间高度比阈值，当物体远离摄像机、在画面中所占高度低于该百分比时就切换到下一 LOD。比如将 LOD1 阈值设为50%，则当物体高度低于屏幕一半时切到下一级。组件允许自定义过渡模式（淡入淡出或硬切换）和跨材质混合。需要注意：Unity 的 LOD 系统是完全手动的，需要美术配合提供低多边形模型和材质。相比之下，Unreal 的自动 LOD 和 HLOD 更依赖算法处理，而 Unity 则依赖开发者精细调节。可通过脚本方式构造 `LODGroup`，例如：
    
    `LOD[] lods = new LOD[2];
    lods[0] = new LOD(0.5f, new Renderer[]{ highDetailRenderer });
    lods[1] = new LOD(0.2f, new Renderer[]{ lowDetailRenderer });
    lods[0].fadeTransitionWidth = 0.1f;
    LODGroup group = parentObject.AddComponent<LODGroup>(); group.SetLODs(lods); group.RecalculateBounds();` 
    
-   **手动制作 LOD**：Unity 不提供内置的网格简化工具，因此需要在外部建模软件中生成不同精度模型，或使用 Asset Store 插件。通常会为一个模型做若干版本，从完全详尽到极度简化，然后在 LODGroup 中指定。也可以为最后一级使用 Billboard（遮挡圆盘）技术。由于 Unity 的 LOD 切换逻辑简单，开发者可以通过 Editor 工具在场景中实时预览和调整切换距离，但同时需要付出更多人力成本来准备 LOD 资源。
    

## 核心对比与迁移思路

-   **批次优化对比**：Unity 主要通过 **静态合批、动态合批、GPU 实例化** 来减少 Draw Call；而 Unreal 则通过 **Instanced Static Mesh (ISM) / Hierarchical ISM** 和 **Merge Actors** 工具实现类似功能。简而言之，Unity 的静态/动态合批对应 Unreal 的 ISM/HISM。迁移时，可将 Unity 中大量相同网格标记为静态合批或实例化的对象，在 Unreal 中对应使用 ISM/HISM 组件来替代单独放置的 Mesh Actor；对于可合并的对象，使用 Merge Actors 工具进行批量合并或生成实例化组件。在材质上，应与 Unity 同样尽量统一材质或使用图集，以满足批处理要求。
    
-   **LOD 系统对比**：Unity 的 `LODGroup` 相当于 Unreal 的 LOD 概念，但 Unreal 自动化程度更高。Unity 静态网格需要手动提供各个 LOD 模型，并在 `LODGroup` 中设置切换阈值；Unreal 则可以导入预制的 LOD 网格，也支持编辑器内自动生成（或分组预设）。在远距离场景合并上，Unity 缺乏内置的 HLOD 功能，而 Unreal 可以通过 HLOD Layer 将多个小物体在运行时合并为代理渲染。迁移建议是：Unity 中为目标对象准备的 LOD 资源在 Unreal 中可以当作手动导入的 LOD 模型，进一步可使用 Unreal 的自动 LOD 生成工具批量处理；而原本在 Unity 场景中分散的小物体群（如草地）在 Unreal 中可以配置 HLOD 层来自动生成合并代理，以减少 Draw Call。
    

## 总结

Unity 和 Unreal 在 Draw Call 优化与 LOD 系统上各有侧重。Unity 的优势在于精细可控：开发者可以手动开启静态/动态合批、使用 GPU 实例化，以及通过修改材质和贴图来减少状态切换开销。Unity 的 `LODGroup` 简单易用，但需要大量手工资源准备。Unreal 则更适合大场景自动化优化：除了支持 ISM/HISM 和 Merge Actors 来批量化减少绘制调用，还提供强大的 LOD 自动化工具和 HLOD 层级系统来处理远景合并。表面看来，Unreal 更偏向「交给引擎自动完成优化」，而 Unity 更依赖程序员和美术手动精调。具体选择要结合项目规模和团队资源：小项目或多手动微调时，Unity 的方法灵活且易于理解；对于超大规模开放世界，Unreal 的自动化管线（包括 Nanite、World Partition + HLOD 等）可以显著节省重复劳动并提高性能。
|优化方向|Unity 实现|Unreal 实现|迁移建议|
|-|-|-|-|
|**Draw Call / 批处理**|静态合批 (Static Batching)、动态合批 (Dynamic Batching)、GPU 实例化 (Instancing)|Instanced Static Mesh (ISM)、Hierarchical Instanced Static Mesh (HISM)、Merge Actors 工具  |将 Unity 中相同网格标记为 Static 或使用 GPU Instancing 迁移为 Unreal 的 ISM/HISM；将材质合并或贴图图集映射保持一致以满足批处理条件；使用 Merge Actors 批量合并重复网格，或生成 ISM 组件。|
|**LOD 系统**|`LODGroup` 组件（手动设置多个网格和切换距离）|自动生成 LOD（编辑器内简化或导入多级 LOD）；HLOD 层级合并远处物体|将 Unity 的 LOD 模型作为 Unreal 的手动导入 LOD；项目中可使用 Unreal 的 LOD 自动化工具批量生成细节级别；场景中分散的小物体可利用 HLOD 生成代理网格来优化。|







  




## 元数据
- **创建时间：** 2026-04-11 22:07:30
- **最后更新：** 2026-04-11 22:07:30
- **作者：** 吉良吉影
- **分类：** 性能优化
- **标签：** unity, ue
- **来源：** 技术文档库

---
*文档基于与吉良吉影的讨论，由小雅整理*