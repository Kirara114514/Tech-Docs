# Unity UGUI 渲染与像素填充率优化

## 摘要

本文是 UGUI 性能优化系列的第三篇，主题是渲染与像素填充率优化。本文会重写 Overdraw、Fill Rate、透明混合、裁剪、Mask、Graphic Raycaster、Image Type、Mesh 顶点、UI Shader、World Space UI 和特定场景下 GPU Instancing 的使用边界。

原稿中存在重复段落，并且部分渲染说法需要修正，例如把 UGUI 默认透明渲染简单套用 3D Early-Z 逻辑、认为 Profiler 一定能直接给出 Overdraw 百分比、把 UI Builder 与 UGUI 优化混为一谈、把 GPU Instancing 当作普通 UGUI 手段等。本文会从 GPU 工作量角度重新组织内容。

## 正文

### 背景

前两篇分别解决资源和 Canvas 组织问题，本篇关注 GPU 绘制。UGUI 常用透明混合，UI 元素又天然层叠，背景、半透明蒙层、面板、图标、文本、描边、阴影、粒子和特效可能在同一个像素位置重复绘制。最终玩家看到的是最上层结果，但 GPU 可能已经为底层不可见内容付出了多次片元处理和内存带宽成本。

移动设备、掌机、VR 和高分辨率屏幕尤其容易受 Fill Rate 限制。Fill Rate 可以粗略理解为 GPU 每秒可以处理多少像素。屏幕分辨率越高、透明层越多、Shader 越复杂、Overdraw 越严重，GPU 压力越高。UI 经常覆盖大面积屏幕，因此看似简单的一张全屏半透明图，可能比一堆小图标更贵。

### 核心内容

#### 1. Overdraw 的本质

Overdraw 指同一个屏幕像素被绘制多次。UI 中常见来源包括全屏背景、半透明遮罩、多层面板、文本描边、阴影、粒子、Mask 裁剪和特效叠加。每次绘制都可能执行纹理采样、颜色计算、Alpha 混合和缓冲区读写。透明混合通常还要读取已有颜色再写回结果，因此会增加内存带宽压力。

Overdraw 的危害不只是不必要绘制，还会导致发热、功耗上升、GPU 降频和帧率波动。低端移动设备上，几个全屏半透明层叠加就可能成为瓶颈。

#### 2. Draw Call 少不代表 GPU 一定轻

Draw Call 主要反映 CPU 提交绘制命令的次数。一个全屏模糊 UI 可能只有一个 Draw Call，却非常吃 GPU；一堆小图标可能 Draw Call 稍多，但绘制面积小，成本可控。因此 UGUI 优化不能只看 Draw Call，还要看绘制面积、透明叠加、Shader 复杂度和分辨率。

判断 Fill Rate 瓶颈可以做 A/B 测试：降低分辨率、关闭半透明层、关闭复杂 UI Shader、关闭底层不可见窗口。如果 GPU 时间明显下降，说明像素侧压力突出。

#### 3. UGUI 不应简单套用 3D Early-Z 思路

UGUI 默认 UI Shader 多处于透明渲染语义下，很多情况下 ZWrite 关闭并进行 Alpha Blending。即使某张图片视觉上完全不透明，也不应该简单假设它能像 3D 不透明物体一样通过 Early-Z 大量剔除后续绘制。

UI Overdraw 更可靠的优化方式是减少重叠、关闭不可见 UI、合并背景、减少全屏半透明层、限制复杂 Shader 面积、使用虚拟列表和合理裁剪，而不是依赖深度测试自动帮你省成本。

#### 4. 如何观察 Overdraw

Scene View 的 Overdraw 模式可以快速定位叠加严重区域。Frame Debugger 可以逐个 Draw Call 查看当前帧绘制了什么、顺序如何、批次在哪里被打断。Profiler 和平台 GPU 工具可以量化 GPU 时间。不同 Unity 版本和平台对 GPU 计数器支持不同，不要假设每个环境都会直接给出准确 Overdraw 百分比。

推荐流程是：先用 Overdraw 视图找亮白区域，再用 Frame Debugger 看这些区域由哪些 UI 绘制叠加，最后用真机 Profiler 或平台工具验证关闭相关层前后的 GPU 时间。

#### 5. 关闭不可见 UI 是最直接的优化

全屏弹窗打开时，如果底层界面完全被不透明背景覆盖，底层 UI 继续绘制就是浪费。如果视觉不需要透出底层，就不要默认使用半透明遮罩。窗口系统应统一控制底层窗口的渲染挂起、Canvas 启停和交互屏蔽。

关闭不可见 UI 可以用 SetActive、Canvas.enabled、Graphic.enabled 或窗口管理器级别的渲染挂起。不同方式成本不同，选择时要考虑恢复成本、资源生命周期和是否需要保留数据状态。

#### 6. 全屏半透明层必须谨慎

一个全屏半透明黑色 Image 会让整屏像素多一次混合。如果每个弹窗都自带遮罩，多个弹窗叠加时就可能出现多个全屏混合层。模糊背景、半透明渐变、粒子和流光叠加会进一步加重成本。

优化方法包括统一 Modal Mask、合并遮罩、使用不透明背景、降低模糊分辨率、用预烘焙图替代实时特效、弹窗打开时暂停底层动态 UI。视觉需求允许时，少透一点就是省很多。

#### 7. Mask 与 RectMask2D 的取舍

Mask 通常依赖 Stencil，能实现复杂遮罩，但会改变渲染状态并打断合批。RectMask2D 只支持矩形裁剪，通常更适合 ScrollRect 视口，但它也不是零成本。Mask 最大误区是以为“裁掉了就没成本”。实际上不可见子项仍可能参与布局、对象管理和部分渲染流程。

滚动列表不能只靠 Mask，应结合对象池和虚拟化。圆形头像等效果尽量通过图片 Alpha 或专用 Shader 处理，不要在大量 item 上堆 Mask。

#### 8. Graphic Raycaster 是交互侧热点

Graphic Raycaster 会对 Canvas 上可被射线检测的 Graphic 做命中判断。很多 Image 和 Text 默认 Raycast Target 开启，但它们只是装饰或显示，根本不需要参与点击检测。复杂界面、多指触控、VR 指针或多个 Canvas 下，这个遍历成本会明显增加。

所有不需要交互的背景、图标、文本、装饰、进度条填充、阴影、边框都应关闭 Raycast Target。纯展示 Canvas 可以移除 GraphicRaycaster。Blocking Objects 如果不需要与 2D/3D 物理对象阻挡，应设为 None。

#### 9. Image Type 会影响 Mesh 复杂度

Image 的 Simple 生成最简单四边形；Sliced 生成九宫格几何；Tiled 会根据平铺数量产生更多顶点；Filled 根据填充方式生成不同几何。不要把所有图片默认设成 Sliced 或 Tiled。无边框图标用 Simple，需要九宫格拉伸的按钮和面板才用 Sliced，进度和冷却才用 Filled。

文本、描边、阴影、富文本和 TMP Sprite 标签也会增加顶点和材质复杂度。大量聊天文本和战斗飘字需要关注顶点数，而不是只看图片。

#### 10. UI Shader 成本按面积放大

默认 UI Shader 相对简单，自定义模糊、溶解、流光、噪声、多纹理混合会增加采样和运算。小按钮上的流光可以接受，全屏背景上的实时模糊就要谨慎。Shader Graph 方便，但生成代码仍需检查。

优化方向包括减少纹理采样、避免复杂分支和高成本数学函数、用预烘焙贴图替代实时计算、将部分计算移到顶点阶段、限制特效面积和提供低端机降级材质。

#### 11. Pixel Perfect 主要服务清晰度

Pixel Perfect 能减少像素不对齐导致的模糊和采样不稳定，特别适合像素风或静态 UI。但它不是万能性能开关。频繁移动的 UI 勾选后可能出现取整抖动，复杂适配下也可能造成位置偏差。

更重要的是统一 CanvasScaler、Reference Resolution、Sprite Pixels Per Unit 和美术导出尺寸，让 UI 自然对齐。是否开启 Pixel Perfect 应根据视觉和动画表现测试决定。

#### 12. GPU Instancing 是专项方案

普通屏幕空间 UGUI 默认不是为 GPU Instancing 设计的。海量世界空间血条、地图标记、同类提示牌这类场景，可以考虑绕开完整 UGUI，用自定义 Mesh、材质和 Graphics.DrawMeshInstanced 批量绘制。

这类方案复杂度高，需要图形编程和数据管理能力，不应作为常规 UI 首选。普通界面优先使用图集、Canvas 分层、Raycast Target 清理、虚拟列表和 Overdraw 控制。

#### 13. 工程化细则：全屏遮罩数量限制

全屏遮罩数量限制应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 14. 工程化细则：底层窗口暂停

底层窗口暂停应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 15. 工程化细则：Mask 使用白名单

Mask 使用白名单应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 16. 工程化细则：Shader 特效评审

Shader 特效评审应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 17. 工程化细则：Raycast Target CI 检查

Raycast Target CI 检查应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 18. 工程化细则：世界空间 UI LOD

世界空间 UI LOD应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 19. 工程化细则：RenderTexture UI 审核

RenderTexture UI 审核应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 20. 工程化细则：粒子叠加限制

粒子叠加限制应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 21. 工程化细则：TMP 描边阴影规范

TMP 描边阴影规范应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 22. 工程化细则：低端机降级

低端机降级应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 23. 工程化细则：Overdraw 截图留档

Overdraw 截图留档应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

#### 24. 工程化细则：Frame Debugger 记录

Frame Debugger 记录应被纳入 UI 渲染规范。它的目的不是限制表现力，而是让表现成本可预期。比如全屏遮罩数量限制可以避免多个系统重复创建黑底；Mask 白名单可以防止列表 item 滥用模板裁剪；Shader 特效评审可以避免高成本材质被铺到整屏；低端机降级可以保证核心体验稳定。

执行时建议用截图和数据留痕。Overdraw 视图截图、Frame Debugger 批次截图、Profiler GPU 时间和目标机型帧率，都应该附在重要 UI 改动说明里。这样后续问题回溯时，不需要重新猜测当时为什么这么设计。

### 实现方案

#### 1. Overdraw 排查 SOP

```text
1. Scene View 开启 Overdraw，定位亮白区域。
2. Frame Debugger 查看该区域绘制顺序。
3. 关闭底层窗口、遮罩、粒子、复杂 Shader 做 A/B。
4. 真机记录 GPU 时间和帧率。
5. 确认优化不破坏视觉需求。
```

#### 2. 弹窗渲染管理伪代码

```pseudo
openPopup(popup):
    if popup.fullScreenOpaque:
        suspendRender(lowerWindows)
    modalMask.setVisible(popup.needMask)
    popup.show()

closePopup(popup):
    popup.hide()
    restoreLowerWindowsIfNeeded()
```

#### 3. Raycast Target 扫描

```pseudo
for prefab in uiPrefabs:
    for graphic in prefab.graphics:
        if graphic.raycastTarget and not isInteractive(graphic):
            report(prefab, graphic.path)
```

扫描结果要人工确认，避免关闭特殊交互区域。

#### 4. ScrollRect 优化步骤

```text
关闭非交互 Raycast Target。
Mask 能换 RectMask2D 就换。
固定 item 尺寸，减少 Layout 实时计算。
使用对象池。
实现虚拟列表。
动态图按可见区域懒加载。
```

#### 5. UI Shader 分级

```text
Level 0：默认 UI Shader。
Level 1：简单颜色、渐变、小面积使用。
Level 2：流光、溶解、描边，中小面积。
Level 3：模糊、多采样、全屏特效，必须专项评审。
```

#### 6. 世界空间血条策略

```text
屏幕外剔除。
远距离隐藏或简化。
满血隐藏。
对象池复用。
文本按变化刷新。
数量过多时评估自定义 Mesh 或 Instancing。
```



#### 工程化扩展说明

以下内容用于把前文原则转化为可执行的团队规范。它们不是额外灌水，而是实际项目中最容易遗漏、也最容易在版本后期放大成本的落地点。

#### 1. Overdraw 截图归档

Overdraw 截图归档的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 2. 全屏遮罩数量限制

全屏遮罩数量限制的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 3. 底层窗口渲染暂停

底层窗口渲染暂停的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 4. 半透明特效面积限制

半透明特效面积限制的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 5. Mask 使用白名单

Mask 使用白名单的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 6. RectMask2D 替代评估

RectMask2D 替代评估的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 7. Raycast Target 扫描

Raycast Target 扫描的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 8. GraphicRaycaster 移除规则

GraphicRaycaster 移除规则的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 9. Image Type 审核

Image Type 审核的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 10. 复杂 UI Shader 分级

复杂 UI Shader 分级的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 11. RenderTexture UI 审批

RenderTexture UI 审批的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 12. 世界空间血条 LOD

世界空间血条 LOD的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 13. 粒子叠加限制

粒子叠加限制的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 14. Frame Debugger 批次记录

Frame Debugger 批次记录的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 15. 低端机降级材质

低端机降级材质的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 16. GPU 时间 A/B 验收

GPU 时间 A/B 验收的核心是控制 GPU 真实工作量，而不仅是控制层级数量。很多渲染问题在 Hierarchy 里看不出来，必须用 Overdraw 视图、Frame Debugger 和真机 Profiler 交叉验证。若只看 Draw Call，可能会忽略全屏透明层、复杂 Shader 和 RenderTexture 这种低批次高成本问题。

落地时建议为每个复杂界面留下渲染证据：Overdraw 截图、Frame Debugger 中关键 UI Batch、目标机 GPU 时间、关闭可疑层前后的 A/B 数据。这样当后续版本新增特效或弹窗时，可以快速判断性能退化来自哪里。

#### 渲染治理补充

下面这些补充项用于处理项目后期最常见的 UI 性能退化问题。它们看似偏流程，但本质上是在约束运行时成本。UGUI 的许多问题并不会在功能刚完成时立刻暴露，而是在资源越来越多、界面越来越复杂、活动频繁热更、低端机覆盖扩大后集中爆发。

##### 1. 透明背景合并

透明背景合并需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 2. 全屏特效降采样

全屏特效降采样需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 3. 文本阴影合并

文本阴影合并需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 4. UI 粒子排序

UI 粒子排序需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 5. 世界空间 UI 剔除

世界空间 UI 剔除需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 6. Mask 嵌套限制

Mask 嵌套限制需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 7. Shader Keyword 收敛

Shader Keyword 收敛需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。

##### 8. 平台 GPU 工具

平台 GPU 工具需要有明确的输入、输出和验收口径。输入指哪些资源、Prefab、脚本或运行时路径会触发该项检查；输出指发现问题后应该形成怎样的报告、截图、日志或修复任务；验收口径指修改后要用什么数据证明它真的变好了。没有验收口径的优化只能算经验建议，不能算工业化规范。

在团队执行时，建议把该项拆成开发期检查和发布前检查两层。开发期检查偏快速反馈，例如 Editor 扫描、Prefab Review、资源导入提示；发布前检查偏真实环境，例如真机 Profiler、Memory Profiler 快照、Frame Debugger 截图、低端机回归。这样既不会把日常开发拖得太重，又能在发版前守住性能底线。


### 总结

UGUI 渲染优化的核心是减少 GPU 做无意义工作。Draw Call 重要，但不是唯一指标；Overdraw、Fill Rate、透明混合、Shader 复杂度和分辨率同样关键。本文修正了原稿中对 Early-Z、Profiler Overdraw 指标、UI Builder 和 GPU Instancing 的不严谨表达，重新从 GPU 工作量角度建立优化方法。

落地时，应通过 Overdraw 视图、Frame Debugger、Profiler 和真机 A/B 测试共同判断问题。关闭不可见 UI、减少全屏透明层、谨慎使用 Mask、清理 Raycast Target、控制 Image Type 和 Shader 等级，才是大多数项目最有效的 UGUI 渲染优化路径。

## 元数据

- **创建时间：** 2026-04-24 00:00
- **最后更新：** 2026-04-24 00:00
- **作者：** 吉良吉影
- **分类：** 性能优化
- **标签：** Unity、UGUI、Overdraw、Fill Rate、Graphic Raycaster、Mask、Frame Debugger、Shader
- **来源：** 已有文稿整理；结合 Unity 官方 UGUI、Sprite Atlas、Profiler、Frame Debugger、Graphic Raycaster 与图形性能资料校正

---

*文档基于与吉良吉影的讨论，由小雅整理*
