# Unity 几何计算与常用算法：从公式理解到玩法落地

## 摘要
几何计算是游戏玩法、物理辅助、AI 感知、技能判定、相机控制、编辑器工具和程序化内容的基础。Unity 提供了 Transform、Physics、Plane、Bounds、Vector3 等大量封装，但项目中仍会不断出现内置组件无法直接覆盖的问题：扇形技能如何判断目标，点到路径最近距离如何求，角色在斜坡上如何移动，物体碰到墙如何反射，点击如何落到自定义平面，曲线路径如何稳定采样，包围体如何做粗筛，浮点误差如何避免边界抖动。若这些算法散落在业务代码中，往往会出现边界处理不一致、公式难以复查、性能路径不可控和调试困难。

本文围绕 Unity 项目中最常用的几何算法展开，重点解释向量投影、平面投影、反射、点到线段距离、点到平面距离、射线与平面相交、点在三角形内判断、AABB、球体相交、扇形范围检测、插值、贝塞尔曲线、Catmull-Rom 样条、浮点误差和性能策略。文章不追求公式堆砌，而强调公式背后的工程语义、退化情况、输入空间、性能边界和可视化验证，目标是把几何算法沉淀为团队可复用、可测试、可维护的基础工具层。

## 正文

### 背景
当项目只依赖 Unity 内置组件时，很多空间问题看似可以通过 Collider、Rigidbody、NavMesh、Animation 和 Transform 解决。但真实玩法很快会超出这些组件的默认边界。例如，技能判定需要自定义扇形、矩形、线段和多段曲线路径；AI 需要在目标进入视野前做低成本筛选；相机需要沿曲线平滑移动并避免穿墙；编辑器工具需要在平面上拖拽、吸附和测距；角色移动需要在斜坡与墙面之间分解速度；程序化生成需要判断点、线、面、盒和球之间的关系。

这些问题本质上都是几何问题。它们不一定复杂，但非常依赖边界条件。点到线段距离必须处理线段退化；点在三角形内判断必须考虑三角形退化、点是否在同一平面和浮点误差；贝塞尔曲线按参数 t 匀速推进并不等于沿弧长匀速；平方距离适合比较，但不能直接参与线性衰减；投影必须确认基向量和法线有效；射线与平面相交必须处理平行情况。若这些细节被忽略，代码在普通输入下可能看似正确，却会在极端位置、低帧率、复杂父子层级或大规模实体中暴露问题。

因此，几何算法不应作为业务代码中的临时公式片段存在，而应成为工具库、测试用例、调试可视化和评审规则的一部分。底层数学越基础，越需要工程化。

### 核心原理
#### 一、几何算法的价值在于把空间问题转化为稳定语义
几何算法不是为了炫公式，而是为了让空间问题具备统一表达。`DistancePointToSegment` 表达点到路径的最近距离，`ProjectPointOnPlane` 表达平面约束，`IsInCone` 表达视野或技能范围，`ClosestPointOnBounds` 表达粗筛后的空间接近关系。业务代码调用这些语义化函数，比直接拼公式更清晰，也更容易统一边界处理。

工具库的价值还在于可测试。底层几何函数一旦稳定，玩法、AI、相机和编辑器都能共享同一套行为。若每个模块临时实现一个“差不多”的版本，项目很快会出现同类问题在不同系统中表现不一致的情况。比如某个扇形判断把目标重合视为命中，另一个返回 false；某个点到线段函数处理退化线段，另一个直接除以零。这些差异会显著增加调试成本。

#### 二、向量投影用于提取某方向上的分量
向量投影回答的是：向量 A 在方向 B 上有多少分量。如果 B 是单位向量，投影向量为 `dot(A, B) * B`；如果 B 不是单位向量，则为 `dot(A, B) / dot(B, B) * B`。Unity 的 `Vector3.Project(vector, onNormal)` 可以完成该计算，但调用方仍要理解输入语义。

投影常用于速度分解、斜坡移动、沿墙滑动和前后关系判断。例如角色撞墙时，可以将速度分解为朝向墙的分量和沿墙滑动的分量：

```csharp
Vector3 intoWall = Vector3.Project(velocity, wallNormal);
Vector3 slideVelocity = velocity - intoWall;
```

这里的关键不是公式，而是 `wallNormal` 必须是有效表面法线，且 velocity 与 wallNormal 必须处于同一空间。如果法线来自局部空间而速度在世界空间，公式本身再正确也会给出错误结果。

#### 三、平面投影用于把方向限制到某个平面
`Vector3.ProjectOnPlane(vector, planeNormal)` 可以把向量投影到由法线定义的平面，等价于 `vector - Vector3.Project(vector, planeNormal)`。它非常适合处理斜坡移动、地面方向、2.5D 平面限制、相机水平移动和技能范围忽略高度差。

```csharp
Vector3 moveOnGround = Vector3.ProjectOnPlane(inputDirection, groundNormal);
if (moveOnGround.sqrMagnitude > 1e-8f)
    moveOnGround.Normalize();
```

平面投影必须处理退化输入。若 planeNormal 接近零，平面本身没有定义；若投影后方向接近零，说明原方向几乎与法线同向，此时继续归一化会放大噪声。成熟工具函数应提供安全归一化和 fallback。

#### 四、反射公式适合镜面响应，但真实碰撞还需要能量与摩擦
反射公式为 `R = V - 2 * dot(V, N) * N`，其中 V 是入射方向或速度，N 是单位法线。Unity 提供 `Vector3.Reflect`：

```csharp
Vector3 reflected = Vector3.Reflect(velocity, hitNormal);
velocity = reflected * bounceFactor;
```

该公式适用于弹球、激光反射、子弹跳弹和简单碰撞速度修正。但真实游戏中常要加入能量损失、摩擦、最小速度阈值和材质系数。若只做纯镜面反射，物体可能在墙面之间不自然地反复弹跳。更成熟的处理是将速度分解为法向分量和切向分量，分别处理反弹与摩擦衰减。

#### 五、距离比较优先使用平方距离，但不能滥用
点到点距离可用 `Vector3.Distance(a, b)`，但它包含开方。如果只是比较是否在范围内，应使用平方距离：

```csharp
float sqrDistance = (a - b).sqrMagnitude;
if (sqrDistance <= radius * radius)
{
    // 在范围内
}
```

平方距离适合比较，不适合直接替代真实距离参与线性衰减、速度计算、插值和 UI 显示。若将平方距离用于伤害衰减，曲线会被扭曲；若将它用于速度比例，运动感会异常。优化必须保持语义一致，不能为了省开方破坏结果。

#### 六、点到线段距离是路径和线形技能的核心算法
给定点 P 和线段 AB，最近点计算为：`AB = B - A`，`AP = P - A`，`t = dot(AP, AB) / dot(AB, AB)`，将 t 限制到 `[0,1]`，最近点为 `A + AB * t`。必须处理 A 与 B 重合的退化情况。

```csharp
public static Vector3 ClosestPointOnSegment(Vector3 p, Vector3 a, Vector3 b)
{
    Vector3 ab = b - a;
    float abSqr = ab.sqrMagnitude;

    if (abSqr < 1e-8f)
        return a;

    float t = Vector3.Dot(p - a, ab) / abSqr;
    t = Mathf.Clamp01(t);
    return a + ab * t;
}
```

该算法适合直线技能命中、AI 到巡逻路径偏离距离、鼠标选择路径段、绳索、轨道编辑器和路径吸附。若只需要比较距离，可返回平方距离以避免开方。

#### 七、点到平面距离需要明确有符号语义
平面可由一点和单位法线定义。点 P 到平面的有符号距离为 `dot(P - planePoint, normal)`。正负号表示点在平面的哪一侧，绝对值才是几何距离。

```csharp
public static float SignedDistancePointToPlane(Vector3 p, Vector3 planePoint, Vector3 planeNormal)
{
    Vector3 n = planeNormal.normalized;
    return Vector3.Dot(p - planePoint, n);
}
```

点投影到平面可写为：

```csharp
public static Vector3 ProjectPointOnPlane(Vector3 p, Vector3 planePoint, Vector3 planeNormal)
{
    Vector3 n = planeNormal.normalized;
    float d = Vector3.Dot(p - planePoint, n);
    return p - n * d;
}
```

使用时要确认 planeNormal 有效，并根据项目尺度选择 epsilon。平面算法常用于地面约束、水面上下判断、战斗区域限制、自定义裁剪和编辑器拖拽。

#### 八、射线与平面相交适合轻量点击和编辑器操作
射线与平面求交常用于无 Collider 的固定地面点击、棋盘放置、编辑器平面拖拽和 UI 到世界平面的映射。Unity 的 `Plane.Raycast` 已经封装了常用逻辑：

```csharp
Plane plane = new Plane(Vector3.up, Vector3.zero);
Ray ray = camera.ScreenPointToRay(Input.mousePosition);

if (plane.Raycast(ray, out float enter))
{
    Vector3 point = ray.GetPoint(enter);
}
```

如果场景地面有复杂起伏，应使用 Physics.Raycast、NavMesh 采样或地形高度采样；如果只是固定高度平面，数学平面求交更轻量，也更容易控制层级和遮罩。

#### 九、点在三角形内判断推荐使用重心坐标并处理退化
点在三角形内可用同向法、面积法或重心坐标法。重心坐标法还能用于 UV、法线、颜色和权重插值，因此更适合扩展。实现时必须处理三角形退化，并确认点是否已经在三角形所在平面附近。

```csharp
public static bool IsPointInTriangle(Vector3 p, Vector3 a, Vector3 b, Vector3 c, float epsilon = 1e-5f)
{
    Vector3 v0 = b - a;
    Vector3 v1 = c - a;
    Vector3 v2 = p - a;

    float d00 = Vector3.Dot(v0, v0);
    float d01 = Vector3.Dot(v0, v1);
    float d11 = Vector3.Dot(v1, v1);
    float d20 = Vector3.Dot(v2, v0);
    float d21 = Vector3.Dot(v2, v1);

    float denom = d00 * d11 - d01 * d01;
    if (Mathf.Abs(denom) < epsilon)
        return false;

    float v = (d11 * d20 - d01 * d21) / denom;
    float w = (d00 * d21 - d01 * d20) / denom;
    float u = 1f - v - w;

    return u >= -epsilon && v >= -epsilon && w >= -epsilon;
}
```

若点不在同一平面，应先投影或改用射线三角形求交。三角形边界上的 epsilon 策略应统一，否则命中会在边界处抖动。

#### 十、AABB 与球体是粗筛基础
AABB 是轴对齐包围盒，Unity 的 `Bounds` 就是典型表示。它计算便宜、易于合并和扩展，适合空间分区、粗略剔除和预检测：

```csharp
if (boundsA.Intersects(boundsB))
{
    // 粗略相交
}
```

AABB 的缺点是对旋转物体包围不紧，细长或倾斜对象误判较多。工程中常用“先 AABB 粗判，再精确检测”的策略。

球体相交条件是中心距离小于等于半径和：

```csharp
public static bool IntersectsSphere(Vector3 a, float ra, Vector3 b, float rb)
{
    float r = ra + rb;
    return (a - b).sqrMagnitude <= r * r;
}
```

球体适合 AI 感知、AoE 粗判、音效影响范围、简单投射物和轻量碰撞近似。它不够精确，但非常稳定和便宜。

#### 十一、扇形范围判断由距离和点积组成
扇形判断通常先做半径过滤，再用点积判断夹角：

```csharp
public static bool IsInCone(Vector3 origin, Vector3 forwardUnit, Vector3 target, float radius, float cosHalfAngle)
{
    Vector3 toTarget = target - origin;
    float sqrDistance = toTarget.sqrMagnitude;

    if (sqrDistance > radius * radius)
        return false;

    if (sqrDistance < 1e-8f)
        return true;

    return Vector3.Dot(forwardUnit, toTarget.normalized) >= cosHalfAngle;
}
```

`forwardUnit` 和 `cosHalfAngle` 应尽量外部预处理。大量目标检测时，应按“距离粗筛、角度筛选、遮挡 Raycast”的顺序降低成本。若直接对所有目标做角度、距离和物理查询，性能会迅速放大。

#### 十二、Lerp、MoveTowards 与曲线采样要区分运动语义
`Vector3.Lerp(start, end, t)` 表示线性插值，t 通常在 `[0,1]`。常见写法：

```csharp
transform.position = Vector3.Lerp(transform.position, target, Time.deltaTime * speed);
```

它不是固定速度移动，而是指数趋近。适合平滑跟随，不适合要求固定速度到达的场景。固定速度应使用 `Vector3.MoveTowards`；旋转同理，指数趋近用 `Quaternion.Slerp`，固定角速度用 `Quaternion.RotateTowards`。

三次贝塞尔曲线公式为 `(1-t)^3P0 + 3(1-t)^2tP1 + 3(1-t)t^2P2 + t^3P3`：

```csharp
public static Vector3 CubicBezier(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
{
    t = Mathf.Clamp01(t);
    float u = 1f - t;

    return u * u * u * p0
         + 3f * u * u * t * p1
         + 3f * u * t * t * p2
         + t * t * t * p3;
}
```

按 t 匀速不等于按弧长匀速。如果需要真实匀速，应预采样长度表或使用弧长近似。

#### 十三、Catmull-Rom 样条适合经过控制点的路径
贝塞尔曲线不一定经过中间控制点，Catmull-Rom 通常经过路径点，适合相机轨迹、AI 巡逻路径和编辑器路径工具。

```csharp
public static Vector3 CatmullRom(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float t)
{
    float t2 = t * t;
    float t3 = t2 * t;

    return 0.5f * (
        2f * p1 +
        (-p0 + p2) * t +
        (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2 +
        (-p0 + 3f * p1 - 3f * p2 + p3) * t3
    );
}
```

每段通常从 p1 走到 p2，p0 和 p3 提供切线影响。路径系统还要处理端点外推、闭合路径、弧长采样和曲率过大导致的速度感异常。

#### 十四、浮点误差与 epsilon 是几何算法的工程底座
浮点数不是精确实数，几何计算不能随意使用 `==`。常见误差场景包括点是否在平面上、两向量是否平行、点是否在三角形边界、投影参数是否接近端点、路径是否到达终点、法线归一化前长度是否接近零。

```csharp
public const float Epsilon = 1e-5f;

public static bool IsNearZero(float value)
{
    return Mathf.Abs(value) < Epsilon;
}
```

epsilon 大小要结合项目单位和业务语义。角色移动、UI 坐标、物理碰撞和编辑器吸附不能共用一个没有解释的魔法数字。建议按场景命名阈值。

#### 十五、几何性能优化应先看调用规模
几何算法优化顺序建议是：减少调用次数，先粗后细，使用平方距离避免开方，缓存静态数据，批量处理数据，必要时再考虑 Job、Burst 或 SIMD，最后才做公式级微优化。不要为了省一个开方把低频业务代码写到没人敢维护；也不要在每帧数万次调用的热点中继续使用方便但昂贵的 API。

性能判断必须基于真实规模测试。几十次调用以可读性为先，数万次调用则需要数据布局和批处理思维。工具函数应先正确、可测试，再根据 Profiler 数据优化。

### 设计思路
#### 一、建立 GeometryUtil 工具库
建议集中管理常用几何算法：

```csharp
public static class GeometryUtil
{
    public const float Epsilon = 1e-5f;

    public static bool IsZero(float value)
    {
        return Mathf.Abs(value) < Epsilon;
    }

    public static bool IsZero(Vector3 value)
    {
        return value.sqrMagnitude < Epsilon * Epsilon;
    }
}
```

统一工具库可以减少重复实现，也便于单元测试和可视化调试。

#### 二、封装常用距离与范围函数
点到线段平方距离、半径判断和扇形判断应提供语义化接口。业务层不应反复手写公式，而应调用 `SqrDistancePointToSegment`、`IsInRadius`、`IsInCone` 等函数。接口名称应说明是否返回平方距离、输入是否要求单位向量、阈值单位是什么。

#### 三、建立曲线采样与可视化工具
曲线、投影、法线、包围盒和检测范围都应能在 Scene 视图中绘制。几何问题优先画出来，而不是只看数字。开发版工具可绘制扇形边界、最近点、投影点、反射方向、曲线采样点和 AABB 范围。可视化能显著降低调试成本。

#### 四、为基础算法建立单元测试
测试应覆盖点到线段的中间、端点外侧和退化线段；点到平面的正侧、负侧和平面上；三角形内部、边界、顶点、外部和退化；球体相离、相切和相交；扇形正前方、边界角、背后和距离外；曲线 t=0 与 t=1 的端点一致性。基础函数一旦进入工具库，就应像业务核心一样保护。

#### 五、对热点算法建立性能基准
几何算法应按真实规模测试：100、1000、10000 个对象分别验证。记录 CPU 耗时、GC Alloc、调用次数、开方次数、物理查询次数、是否可分帧和是否可批量化。若几何逻辑进入 AI、战斗、路径或大规模编辑器工具，应考虑 Job/Burst 或分区结构，而不是只在单个函数内部抠公式。

#### 六、把适用范围写进注释和文档
每个工具函数都应说明适用范围和限制。例如平方距离只用于比较，不用于线性衰减；点在三角形内判断默认点在同一平面；曲线按 t 采样不保证弧长匀速；投影要求基向量有效；扇形判断不包含遮挡，需要另做 Raycast。约束写清楚，比公式本身更能减少误用。

### 进阶讨论
几何算法工程化的第一类取舍，是可读性与性能之间的取舍。低频逻辑中，清晰使用 Unity API 往往更安全；高频批量逻辑中，平方距离、点积阈值、结果缓存和批处理才有意义。成熟团队不会把所有代码都写成手工优化公式，也不会让热点路径一直依赖低效便利 API，而是按调用规模分层治理。

第二类取舍，是通用工具与业务特化之间的取舍。工具库应提供稳定基础函数，但不应试图把所有玩法语义都塞进一个万能函数。例如扇形技能、AI 视野和 UI 指示器都可能用到 cone 判断，但遮挡、阵营、地形高度、目标状态和调试表现不同。工具函数负责几何事实，业务层负责玩法规则。

第三类取舍，是数学正确与工程稳定之间的取舍。某些公式在数学上很漂亮，但在浮点环境、退化输入和离散帧率下并不稳定。比如近零向量归一化、退化三角形、平行射线、极短线段和边界点判断，都需要工程 fallback。游戏开发中的几何算法不是纯数学证明，而是在不完美输入中持续给出可解释结果。

第四类取舍，是组件 API 与自定义算法之间的取舍。Physics.Raycast、Collider、NavMesh 和 Bounds 提供了强大封装，但自定义几何算法能更轻量、更可控、更适合编辑器工具和预筛。正式项目通常会组合使用：用几何算法先做低成本粗筛，再把少量候选交给物理查询或更精确检测。

最后，几何算法还应进入团队评审。提交涉及范围判定、路径、相机、碰撞修正或空间工具的代码时，应说明输入空间、退化处理、epsilon 策略、性能规模和可视化验证方式。底层数学一旦出错，会向上污染大量系统，因此它值得比普通业务逻辑更严格的审查。

## 知识缺口
- 具体 epsilon、性能阈值、Job/Burst 是否必要、曲线采样精度和几何工具的坐标空间约定，需要根据项目单位、目标平台、数据规模、Unity 版本和团队封装进一步确定；本文给出的是工程原则与常用实现框架。

### 总结
几何计算是 3D 游戏开发中连接数学与玩法的关键层。投影、反射、距离、相交、插值、曲线和包围体这些概念看似基础，但组合起来可以支撑角色移动、技能判定、AI 感知、相机路径、编辑器工具、程序化生成和自定义碰撞等大量系统。真正重要的不是记住公式，而是让公式在项目中具备清晰语义、稳定边界和可验证行为。

成熟的几何算法实践，应沉淀为统一工具库、统一误差策略、统一可视化调试、统一测试用例和明确性能基准。数学代码越底层，越要讲工程规范。正确性、边界条件、性能和可维护性缺一不可。公式会背只是第一步，能在项目里稳定落地，才是真正的工程能力。

## 元数据
- **创建时间：** 2026-04-24
- **最后更新：** 2026-05-09 00:00
- **版本：** v2.0
- **分类：** 数学基础
- **标签：** 数学基础, 几何算法, 投影, 反射, 距离计算, 贝塞尔曲线, AABB, Unity
- **来源简注：** 基于 Unity 几何计算与常用算法主题重新编写，聚焦常用几何工具、退化情况、epsilon、可视化调试、性能基准和工程落地。

---
*文档基于讨论主题重写整理*
