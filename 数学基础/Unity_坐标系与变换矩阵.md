# Unity 坐标系与变换矩阵：从空间语义到工程实践

## 摘要
坐标系与变换矩阵是 Unity 3D 开发中最基础、也最容易被低估的工程知识。角色控制、武器挂点、动画骨骼、射线检测、UI 跟随、相机系统、Shader 顶点变换、编辑器工具和程序化生成，都在持续处理局部空间、世界空间、屏幕空间、视口空间、摄像机空间、裁剪空间与 Canvas 空间之间的转换。许多“角色射偏”“血条漂移”“父节点缩放后异常”“屏幕点击点偏移”“特效挂点不对”的问题，本质上不是业务逻辑错误，而是空间语义和数据类型被混用了。

本文系统解释 Unity 中常见空间的工程含义，重点区分点、方向与位移向量三类数据，说明 `TransformPoint`、`TransformDirection`、`TransformVector` 及其逆变换为什么不能混用，并从矩阵组合、父子层级、MVP 渲染管线、非均匀缩放、UI 跟随 3D 目标、屏幕点击拾取、视口可见性判断、批量矩阵转换和调试可视化等场景出发，建立一套可落地的空间转换方法论。

## 正文

### 背景
在 3D 游戏中，同一个 `Vector3` 数值可以属于完全不同的空间。`(0, 0, 5)` 可以表示世界 Z 轴正方向 5 米，也可以表示角色自身前方 5 米，也可以表示屏幕点在相机前方某个深度，还可以表示某个 UI 容器内的局部偏移。数字相同，不代表语义相同。空间语义一旦丢失，代码仍然能编译，甚至在某些姿态下看似正常，但会在父节点旋转、相机切换、缩放变化、不同分辨率或摄像机背后等场景中暴露问题。

Unity 的 Transform API 很方便，但便利性也掩盖了风险。`position`、`localPosition`、`forward`、`TransformPoint`、`InverseTransformPoint`、`WorldToScreenPoint`、`ScreenPointToRay`、`RectTransformUtility` 都能把空间转换写得很短；问题是，短代码并不自动保证语义正确。开发者必须先知道自己手里的是点、方向还是位移，是局部空间还是世界空间，是屏幕像素还是 Canvas 局部坐标，然后才能选择 API。

因此，坐标系不是抽象数学概念，而是工程契约。成熟项目需要通过变量命名、工具封装、Gizmos 可视化、代码评审和测试矩阵持续约束空间语义，而不能依赖每个开发者在脑中临时记住转换链路。

### 核心原理
#### 一、所有坐标值都必须绑定空间语义
坐标系本质上是参考标准。没有参考标准，坐标值没有意义。成熟项目中的变量名应显式表达空间语义，例如 `muzzleLocalOffset`、`muzzleWorldPosition`、`targetScreenPosition`、`uiCanvasLocalPosition`、`surfaceNormalWorld`。这不是形式主义，而是防止空间误用的工程手段。

建议团队把空间语义写进命名规范。表示位置的变量尽量带 `Local`、`World`、`Screen`、`Viewport`、`CanvasLocal` 等后缀；表示方向的变量带 `Dir` 或 `Direction`；表示位移或偏移的变量带 `Offset` 或 `Delta`。空间转换 bug 往往不会立刻崩溃，只会表现为偏一点、反一下、某些父节点下异常，这类问题最适合通过命名和封装提前预防。

#### 二、局部空间描述对象自己的参考系
局部空间是物体自身的坐标系。模型顶点、武器挂点、特效发射点、骨骼插槽、UI 子节点位置，很多原始数据天然属于局部空间。比如枪口在武器局部空间中的偏移 `(0.1, 0.2, 0.8)` 表达的是“相对于武器根节点的位置”，不是世界位置。

Unity 中 `transform.localPosition` 表示当前物体相对于父 Transform 的位置。如果没有父对象，`localPosition` 与 `position` 可能数值相同；一旦存在父子层级，两者就代表不同空间。父节点移动或旋转时，子物体的 `localPosition` 可以不变，但 `position` 会随父节点变化。角色骨骼、挂点、UI 嵌套和特效跟随都依赖这个规则。

#### 三、世界空间是跨对象关系的共同标准
世界空间是整个场景共享的全局参考系。Unity 默认 Y 轴向上、Z 轴向前、X 轴向右。`transform.position` 是世界位置，`transform.rotation` 是世界旋转结果。世界空间适合描述跨对象关系，例如玩家与敌人的距离、子弹当前位置、摄像机位置、AI 感知范围中心、物理射线起点和命中点。

但世界空间不适合表达“物体自身前方”这类关系。如果写 `transform.position += Vector3.forward * speed * Time.deltaTime`，对象会沿世界 Z 轴移动；如果想沿自身朝向移动，应使用 `transform.forward`。`transform.forward` 返回的是对象局部 Z 轴经过旋转后在世界空间中的方向向量。注意它是世界空间方向，不是局部向量。

#### 四、点、方向与位移向量是 Transform API 的分水岭
Unity 中最容易混用的 API 是 `TransformPoint`、`TransformDirection` 和 `TransformVector`。点表示空间中的位置，受平移、旋转和缩放影响；方向表示朝向，不应受平移和缩放影响；位移向量表示长度和方向，不受平移影响，但可能需要受旋转和缩放影响。

```csharp
Vector3 worldPoint = transform.TransformPoint(localPoint);
Vector3 worldDir = transform.TransformDirection(localDir);
Vector3 worldVector = transform.TransformVector(localVector);
```

枪口位置、脚底检测点、模型顶点使用 `TransformPoint`。射线方向、角色前方、法线方向通常使用 `TransformDirection`。带长度的局部位移且需要考虑缩放时，才使用 `TransformVector`。如果把方向误用 `TransformPoint`，方向会被平移污染；如果把带缩放的位移误用 `TransformDirection`，父级缩放会被忽略。

#### 五、逆变换用于以自身为参考理解世界对象
`InverseTransformPoint` 可以把世界点转换到当前物体局部空间，常用于判断目标相对自己的前后左右。

```csharp
Vector3 local = transform.InverseTransformPoint(target.position);

bool inFront = local.z > 0f;
bool onRight = local.x > 0f;
```

相比直接比较世界坐标，这种方式天然以当前物体自身朝向为参考。AI 判断玩家是否在背后、近战判断目标是否位于攻击者前方、命中点转换为局部伤害区域，都适合使用它。注意 `InverseTransformPoint` 处理的是点，会受缩放影响；若要转换世界方向到局部方向，应使用 `InverseTransformDirection`。

#### 六、屏幕空间与视口空间解决的是画面映射问题
屏幕空间以像素为单位，`Input.mousePosition` 返回的就是屏幕坐标，通常左下角为 `(0,0)`。视口空间是归一化坐标，左下角为 `(0,0)`，右上角为 `(1,1)`，不依赖分辨率，适合判断目标是否在画面内。

```csharp
Vector3 viewport = camera.WorldToViewportPoint(target.position);
bool visible = viewport.z > 0f &&
               viewport.x >= 0f && viewport.x <= 1f &&
               viewport.y >= 0f && viewport.y <= 1f;
```

`z > 0` 非常关键。目标即便 x、y 落在范围内，如果 z 小于 0，说明它在摄像机背后，不应显示屏幕 UI。很多血条、名称板和屏幕边缘箭头错误，根源就是忘了处理摄像机背后的情况。

#### 七、ScreenToWorldPoint 与 ScreenPointToRay 语义不同
`ScreenToWorldPoint` 需要屏幕坐标和深度值。这个 z 不是世界 Z 坐标，而是相对摄像机的深度。它回答的是“屏幕上的这个像素，在离相机某个深度的平面上，对应哪个世界点”。

如果要点击 3D 物体或地面，不应随便给一个深度值，而应使用：

```csharp
Ray ray = camera.ScreenPointToRay(Input.mousePosition);
```

然后用物理射线或数学平面求交得到真正世界点。点击地面移动、鼠标拾取物体、RTS 框选、编辑器拖拽都更适合从屏幕点生成射线，而不是固定深度反推世界点。

#### 八、RectTransformUtility 是 UGUI 坐标转换的标准入口
UGUI 坐标转换受 Canvas 渲染模式影响。Screen Space - Overlay、Screen Space - Camera、World Space 三种模式对相机参数要求不同。把屏幕点转换为某个 UI 容器局部点时，推荐使用：

```csharp
RectTransformUtility.ScreenPointToLocalPointInRectangle(
    parentRect,
    screenPosition,
    uiCamera,
    out Vector2 localPoint);
```

Overlay 模式通常传 `null`，Screen Space - Camera 模式传 Canvas 使用的相机，World Space 模式也需要对应相机。常见错误是 Overlay 模式传主相机，或者 Camera 模式传 null，导致 UI 偏移。建议统一封装 UI 坐标转换，不要让业务代码各写各的。

#### 九、变换矩阵是 Transform 背后的统一表达
Transform 的位置、旋转、缩放可以统一表示成 4x4 变换矩阵。矩阵可以把局部空间中的点转换到父空间或世界空间。Unity 中可以手动创建 TRS 矩阵：

```csharp
Matrix4x4 matrix = Matrix4x4.TRS(position, rotation, scale);
Vector3 worldPoint = matrix.MultiplyPoint3x4(localPoint);
```

矩阵乘法不满足交换律。先旋转再平移，与先平移再旋转，结果完全不同。父子层级之所以能让子物体跟随父物体移动和旋转，本质上是矩阵按层级顺序组合。理解矩阵顺序，对 Shader、程序化网格、骨骼动画和自定义空间变换都非常重要。

#### 十、localToWorldMatrix 与 worldToLocalMatrix 适合批量转换
每个 Transform 都有 `localToWorldMatrix` 和 `worldToLocalMatrix`。前者把当前物体局部空间转换到世界空间，后者把世界空间转换回当前物体局部空间。

```csharp
Matrix4x4 localToWorld = transform.localToWorldMatrix;
Matrix4x4 worldToLocal = transform.worldToLocalMatrix;
```

批量转换大量点时，缓存矩阵可能比反复调用 Transform API 更清晰，也更适合迁移到 Job 或 Burst。但矩阵缓存只在 Transform 未变化时有效；只要位置、旋转、缩放或父节点变化，就需要重新获取。点应使用 `MultiplyPoint3x4`，方向或位移使用 `MultiplyVector`，不要混用。

#### 十一、MVP 是从模型顶点到屏幕像素的完整链路
MVP 指 Model、View、Projection。模型矩阵将模型局部顶点转换到世界空间；视图矩阵将世界空间转换到摄像机空间；投影矩阵将摄像机空间投影到裁剪空间，并最终映射到屏幕。

```text
局部顶点 -> Model -> 世界空间 -> View -> 摄像机空间 -> Projection -> 裁剪空间 -> NDC -> 屏幕
```

`Camera.WorldToScreenPoint` 内部就包含类似的世界到视图、视图到投影、投影到屏幕过程。理解 MVP 能帮助分析 Shader 顶点变换、深度问题、透视投影、正交投影、视锥剔除和屏幕空间特效。

#### 十二、非均匀缩放是空间系统中的高风险因素
非均匀缩放是 Transform 系统中最容易埋雷的部分。父节点 scale 为 `(2,1,1)` 时，子物体方向、碰撞、法线和包围盒都可能出现不直观结果。方向不应被平移影响，法线在非均匀缩放下甚至需要逆转置矩阵处理。普通业务代码可能暂时不接触这些细节，但在程序化网格、Shader、自定义碰撞和复杂层级中必须谨慎。

工程建议是：角色根节点、物理对象、骨骼关键节点尽量避免非均匀缩放；美术比例调整优先在 DCC 工具或导入设置解决；如果必须缩放，把它限制在纯表现节点，不让逻辑和物理依赖它。

#### 十三、典型应用体现的是同一套空间规则
枪口发射时，枪口位置通常用 `muzzle.position`，方向用 `muzzle.forward`。如果只有局部偏移，则位置用 `TransformPoint`，方向用 `TransformDirection`。AI 判断玩家相对方位时，使用 `InverseTransformPoint` 把玩家世界点转换到 AI 局部空间。UI 血条跟随 3D 角色时，先 `WorldToScreenPoint`，再根据 Canvas 模式转换为 UI 局部点。相机边界判断则推荐用视口坐标，因为视口坐标不依赖分辨率。

这些应用看似不同，本质都是空间转换。只要输入空间、输出空间和数据类型三件事说清楚，问题会简单很多。

#### 十四、空间问题必须可视化调试
坐标系问题不要只看日志，要画出来。用 `Debug.DrawRay` 绘制物体三轴：

```csharp
Debug.DrawRay(transform.position, transform.right * 2f, Color.red);
Debug.DrawRay(transform.position, transform.up * 2f, Color.green);
Debug.DrawRay(transform.position, transform.forward * 2f, Color.blue);
```

用 Gizmos 绘制挂点、射线、命中点、局部偏移和 UI 跟随目标。很多空间问题画出来十秒钟能定位，不画则可能查很久。建议把常用空间可视化封装成工具，而不是临时散写。

### 设计思路
#### 一、封装统一空间转换工具
建议建立 `SpaceConvertUtil`，集中封装局部点转世界点、世界点转局部点、局部方向转世界方向、世界点转视口可见性等逻辑。

```csharp
public static class SpaceConvertUtil
{
    public static Vector3 LocalPointToWorld(Transform root, Vector3 localPoint)
    {
        return root.TransformPoint(localPoint);
    }

    public static Vector3 WorldPointToLocal(Transform root, Vector3 worldPoint)
    {
        return root.InverseTransformPoint(worldPoint);
    }

    public static Vector3 LocalDirectionToWorld(Transform root, Vector3 localDirection)
    {
        return root.TransformDirection(localDirection);
    }

    public static bool IsWorldPointVisible(Camera camera, Vector3 worldPoint, out Vector3 viewport)
    {
        viewport = camera.WorldToViewportPoint(worldPoint);
        return viewport.z > 0f &&
               viewport.x >= 0f && viewport.x <= 1f &&
               viewport.y >= 0f && viewport.y <= 1f;
    }
}
```

封装的意义不在于减少几行代码，而在于统一空间语义，减少业务层误用 API。

#### 二、实现 3D 目标到 UGUI 的稳定跟随
UI 跟随 3D 角色建议统一组件化，并在 `LateUpdate` 更新，保证目标移动和相机更新之后再定位。

```csharp
public sealed class WorldTargetFollowerUI : MonoBehaviour
{
    [SerializeField] private Camera worldCamera;
    [SerializeField] private Canvas canvas;
    [SerializeField] private RectTransform canvasRoot;
    [SerializeField] private RectTransform targetUI;

    private Transform targetWorld;
    private Vector3 worldOffset;

    public void Bind(Transform target, Vector3 offset)
    {
        targetWorld = target;
        worldOffset = offset;
    }

    private void LateUpdate()
    {
        if (targetWorld == null)
        {
            targetUI.gameObject.SetActive(false);
            return;
        }

        Vector3 screen = worldCamera.WorldToScreenPoint(targetWorld.position + worldOffset);
        if (screen.z <= 0f)
        {
            targetUI.gameObject.SetActive(false);
            return;
        }

        Camera uiCamera = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;
        if (RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRoot, screen, uiCamera, out Vector2 local))
        {
            targetUI.gameObject.SetActive(true);
            targetUI.anchoredPosition = local;
        }
    }
}
```

大量血条或名称板还应结合对象池、可见性剔除和批量更新。

#### 三、实现屏幕点击世界点
点击地面移动推荐使用射线。若地面有 Collider，使用 Physics.Raycast；若只是固定高度平面，使用 Plane.Raycast。

```csharp
public static bool TryGetGroundPoint(Camera camera, Vector2 screen, LayerMask groundMask, out Vector3 point)
{
    Ray ray = camera.ScreenPointToRay(screen);

    if (Physics.Raycast(ray, out RaycastHit hit, 500f, groundMask))
    {
        point = hit.point;
        return true;
    }

    point = default;
    return false;
}
```

如果点击可能落在 UI 上，应先通过 EventSystem 判断是否被 UI 拦截，再进入世界点击逻辑。

#### 四、使用矩阵进行批量转换
如果需要批量转换大量点，例如程序化网格、路径采样点、编辑器工具点集，可以缓存矩阵：

```csharp
Matrix4x4 localToWorld = root.localToWorldMatrix;

for (int i = 0; i < localPoints.Length; i++)
{
    worldPoints[i] = localToWorld.MultiplyPoint3x4(localPoints[i]);
}
```

方向使用 `MultiplyVector`，点使用 `MultiplyPoint3x4`。若涉及非均匀缩放和法线变换，需要更严谨的数学处理。

#### 五、建立空间转换验收清单
空间转换相关功能提交前建议检查：是否明确输入输出空间；是否区分点、方向、位移；是否考虑父节点旋转和缩放；是否处理目标在摄像机背后；是否考虑 Canvas 渲染模式；是否缓存 Camera 和 RectTransform；是否有 Gizmos 或 Debug.Draw 可视化；是否在不同分辨率下验证 UI 坐标；是否在父节点非默认 Transform 下验证；是否避免在业务层复制复杂转换。

### 进阶讨论
坐标系治理的第一类取舍，是 API 便利性与语义显性化之间的取舍。直接调用 Unity API 很快，但如果每个业务模块各自决定何时用 `TransformPoint`、何时用 `TransformDirection`，项目后期会出现大量难以统一的空间假设。统一工具层会多一层封装，却能让空间转换的语义和边界集中管理。

第二类取舍，是运行时修补与数据源规范之间的取舍。很多空间问题来自上游工具或配置没有明确空间。例如技能表只写偏移，不说明是局部偏移还是世界偏移；特效挂点只写方向，不说明参考轴；UI 跟随目标只给世界点，不说明是否需要骨骼挂点。若上游契约不清，运行时代码只能不断补丁化。正式项目应在配置和编辑器工具中显式要求空间类型。

第三类取舍，是非均匀缩放带来的制作便利与技术风险。美术或关卡制作中使用缩放很方便，但若逻辑、碰撞、法线或骨骼依赖这些节点，问题会迅速复杂化。团队应明确哪些层级允许缩放，哪些逻辑根节点禁止非均匀缩放，哪些表现节点可以自由缩放。规范越早建立，越少出现后期无法解释的空间异常。

第四类取舍，是单次转换成本与批量数据设计之间的取舍。少量点转换直接调用 Transform API 可读性最好；大量点、网格、路径或 ECS 数据转换，则应考虑缓存矩阵、批量处理和明确失效时机。优化不应破坏语义，也不应让高频转换无节制地散落在循环里。

最后，空间系统应进入调试与评审流程。重要系统应能画出世界轴、局部轴、射线、屏幕点、UI 位置和挂点偏移；代码评审应检查变量命名是否表达空间，是否混用点和方向，是否处理摄像机背后与 Canvas 模式。坐标系错误越早被看见，越容易修。

## 知识缺口
- UI Canvas 转换、渲染管线矩阵、XR/多相机、非均匀缩放下法线处理和批量矩阵转换策略会随 Unity 版本、渲染管线、项目封装和目标平台变化；正式规范应以项目锁定版本和实际相机/UI 架构为准。

### 总结
坐标系与变换矩阵贯穿 Unity 3D 开发的几乎所有空间逻辑。它们不是只在数学课里出现的概念，而是角色控制、射线检测、UI 跟随、相机系统、动画挂点、Shader 顶点变换、物理调试和工具开发的共同基础。所有坐标都必须带空间语义，点、方向和位移向量必须严格区分，矩阵是空间变换的统一底层表达。

成熟团队不会只依赖个人记忆维护空间正确性，而会通过命名规范、工具封装、可视化调试、配置契约和代码评审持续约束空间转换。只要这套基础设施稳定，后续处理射线、碰撞、几何算法、相机和 UI 时都会更可靠；反之，坐标系没有统一规范，项目越大，越容易出现肉眼难查的“偏一点”问题。

## 元数据
- **创建时间：** 2026-04-24
- **最后更新：** 2026-05-09 00:00
- **版本：** v2.0
- **分类：** 数学基础
- **标签：** 数学基础、坐标系、变换矩阵、Unity
- **来源简注：** 基于 Unity 坐标系与变换矩阵主题重新编写，聚焦空间语义、Transform API、矩阵链路、UI 坐标转换、非均匀缩放和工程规范。

---
*文档基于讨论主题重写整理*
