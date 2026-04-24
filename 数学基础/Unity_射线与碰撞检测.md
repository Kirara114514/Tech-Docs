# Unity 射线与碰撞检测：从物理查询到交互系统

## 摘要

本文系统重写 Unity 中射线检测与碰撞检测的基础和工程实践，围绕 `Ray`、`Physics.Raycast`、`RaycastHit`、LayerMask、Collider、Rigidbody、Trigger、Collision、Cast 查询、Overlap 查询、NonAlloc 查询、可视化调试和性能优化展开。文章不再停留于 API 罗列，而是从游戏交互需求出发，解释为什么射线检测适合线性探测，为什么 Overlap 适合范围查询，为什么 Collider 与 Rigidbody 的组合决定碰撞回调是否触发，以及如何在工业项目中建立可维护、可调试、低 GC 的物理查询体系。

射线与碰撞检测是 3D 游戏交互的入口能力。鼠标点击拾取、射击命中、AI 视野、地面检测、角色控制器、范围技能、交互提示、机关触发和物理反馈都离不开它。本文会清理原文重复内容，修正若干容易误导的表述，例如 `RaycastAll` 命中结果顺序不应被默认依赖，频繁物理查询应优先考虑 NonAlloc 版本，Trigger 与 Collision 的触发条件必须结合 Rigidbody 判断，MeshCollider 的使用也不能只说“精确”而忽略性能代价。

## 正文

### 背景

前面的坐标系知识解决了“点和方向如何在不同空间之间转换”的问题，而射线和碰撞检测解决的是“空间中的对象是否接触，以及接触发生在哪里”的问题。它们共同组成 3D 交互逻辑的基础。

Unity 的物理检测由底层物理系统承载。开发者不需要从零实现射线与三角形、球体、盒体的求交算法，但必须理解 API 的语义、生命周期和性能边界。很多物理问题并不是引擎错误，而是查询起点在碰撞体内部、LayerMask 设置错误、Trigger 查询策略不一致、刚体和碰撞体组合不满足回调条件，或者在 Update 中不断分配数组导致 GC 抖动。

原文覆盖了 Raycast、Collider、Rigidbody、Trigger、Overlap、NonAlloc 和 Gizmos 等内容，但存在大量重复，并且部分结论需要更严谨地表述。本篇将其重构为更适合工业项目的知识体系：先区分查询类型，再讲组件组合，再讲回调条件，最后讲性能、调试和团队规范。

### 核心内容


#### 一、射线检测的定位：从一点向一个方向发起线性查询

射线检测回答的问题是：“从这个起点沿这个方向，在指定距离内会不会碰到某个 Collider？”Unity 中最典型的写法是：

```csharp
Ray ray = new Ray(origin, direction);

if (Physics.Raycast(ray, out RaycastHit hit, maxDistance, layerMask))
{
    Vector3 hitPoint = hit.point;
    Vector3 hitNormal = hit.normal;
}
```

射线适合鼠标点击拾取、射击命中、AI 视线遮挡、地面检测、交互物检测、相机遮挡检测等点对线式问题。普通射线无限细，不适合表达“角色这个有体积的胶囊能否通过通道”，这类问题通常应使用 SphereCast、CapsuleCast 或角色控制器逻辑。

#### 二、Ray 的两个字段：Origin 与 Direction

`Ray` 由世界空间起点和世界空间方向组成。方向最好保持归一化，虽然 Unity 很多物理 API 能处理非单位方向，但统一规范能减少理解成本。

常见错误是把局部方向当成世界方向：

```csharp
Ray ray = new Ray(transform.position, Vector3.forward);
```

如果物体没有旋转，这段代码看似正常；一旦物体旋转，射线仍然沿世界 Z 轴，而不是物体自身前方。正确写法是：

```csharp
Ray ray = new Ray(transform.position, transform.forward);
```

或显式转换：

```csharp
Vector3 worldDir = transform.TransformDirection(Vector3.forward);
Ray ray = new Ray(transform.position, worldDir);
```

#### 三、RaycastHit：命中信息不只是对象引用

`RaycastHit` 提供命中上下文，包括 `point`、`normal`、`distance`、`collider`、`rigidbody`、`transform` 等。`point` 是世界空间命中点，`normal` 是命中表面的世界空间法线，`distance` 是从射线起点到命中点的距离。

这些信息可以驱动贴花、粒子、弹道反射、伤害、脚步特效和角色贴地。比如：

```csharp
if (Physics.Raycast(ray, out RaycastHit hit, 100f, hitMask))
{
    Quaternion rotation = Quaternion.LookRotation(hit.normal);
    SpawnImpactVfx(hit.point, rotation);
}
```

法线尤其重要。弹球、激光反射、角色沿墙滑动、物体贴合表面都依赖法线方向。

#### 四、LayerMask：物理查询的第一层过滤

LayerMask 是物理查询性能和逻辑正确性的核心。没有 LayerMask 的射线可能命中地面、角色自身、触发器、装饰物、隐藏碰撞体等不该检测的对象。

推荐通过 Inspector 配置：

```csharp
[SerializeField] private LayerMask groundMask;

if (Physics.Raycast(ray, out RaycastHit hit, 100f, groundMask))
{
    // 只处理地面
}
```

不要在高频逻辑中反复使用字符串创建 LayerMask。LayerMask 本质是 32 位位掩码，位运算很快，但字符串查找和配置错误会带来维护问题。项目中应建立稳定的物理层规划，例如 Environment、Player、Enemy、PlayerAttack、EnemyAttack、Sensor、Interactable 等。

#### 五、QueryTriggerInteraction：是否命中 Trigger 要明确

物理查询是否命中 Trigger 由 `QueryTriggerInteraction` 决定，也会受到全局 Physics 设置影响。为了避免项目中不同系统行为不一致，建议高频核心查询显式传入策略：

```csharp
Physics.Raycast(ray, out hit, distance, mask, QueryTriggerInteraction.Ignore);
```

例如地面检测通常忽略 Trigger；交互检测可能需要命中 Trigger；技能范围可能根据 HitBox/HurtBox 设计选择 Collide。不要让默认值在不同系统里暗中决定逻辑，否则后期排查会很难。

#### 六、RaycastAll 与 RaycastNonAlloc

`Physics.RaycastAll` 会返回射线路径上的多个命中结果，适合穿透弹、扫描分析、编辑器工具等场景。但工程中不要默认依赖结果已经按距离排序。为了稳定逻辑，应显式排序：

```csharp
RaycastHit[] hits = Physics.RaycastAll(ray, maxDistance, mask);
Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
```

如果该查询频繁执行，不应使用 RaycastAll，因为它会分配数组。应使用 NonAlloc 版本：

```csharp
private readonly RaycastHit[] hitBuffer = new RaycastHit[16];

int count = Physics.RaycastNonAlloc(ray, hitBuffer, maxDistance, mask);
```

NonAlloc 的核心问题是缓冲区容量。若返回数量等于数组长度，说明可能被截断，应记录警告、扩大容量或设计上限。

#### 七、普通射线的边界条件

射线检测有一些常见边界：射线起点在 Collider 内部时可能检测不到该 Collider；maxDistance 过短会漏检；LayerMask 不包含目标层会漏检；Trigger 查询策略不一致会导致命中差异；物体刚被 Transform 移动后，物理状态可能尚未同步。

排查 Raycast 没命中时，先检查 Collider 是否存在并启用，再检查 LayerMask、方向、距离、起点位置、Trigger 策略和物理同步。不要上来就怀疑 Unity 抽风，小雅偷偷说一句：大多数时候真是咱自己的配置锅。

#### 八、Collider：物理世界中的形状代理

Collider 定义物体在物理世界中的形状。渲染网格可以非常复杂，但物理碰撞体应尽量简单。BoxCollider 适合墙、箱子、平台；SphereCollider 适合球体和范围触发；CapsuleCollider 适合角色和生物单位；MeshCollider 最精确，但性能成本最高。

MeshCollider 适合静态复杂地形、大型建筑等。动态物体上应谨慎使用 MeshCollider，尤其是非 Convex MeshCollider。需要移动并参与物理交互的复杂对象，通常更适合由多个简单 Collider 组合，而不是直接使用复杂网格。

#### 九、Rigidbody：决定对象是否进入物理模拟

Collider 只是形状，Rigidbody 表示对象进入物理模拟。没有 Rigidbody 的 Collider 通常作为静态碰撞体；带 Rigidbody 的对象会参与动态物理。Rigidbody 的关键配置包括 `isKinematic`、`useGravity`、`collisionDetectionMode`、`interpolation` 和 constraints。

移动 Rigidbody 时，不推荐直接改 Transform。动态刚体应使用力、速度、`MovePosition` 或 `MoveRotation`：

```csharp
rb.MovePosition(rb.position + velocity * Time.fixedDeltaTime);
```

直接修改 Transform 可能绕开物理系统，造成穿透、抖动、回调异常或碰撞求解不稳定。

#### 十、Trigger 与 Collision：逻辑区域和实体碰撞不能混

`isTrigger` 决定 Collider 是否作为触发器。非 Trigger Collider 产生物理阻挡，触发 `OnCollisionEnter/Stay/Exit`；Trigger Collider 不产生阻挡，触发 `OnTriggerEnter/Stay/Exit`。

一般来说，触发回调需要至少一方存在 Rigidbody，并且层碰撞矩阵允许交互。拾取范围、机关区域、技能检测区适合 Trigger；墙壁、地面、物理箱子适合 Collision。不要用 Trigger 模拟实体阻挡，也不要用 Collision 做纯逻辑区域。职责混乱会导致参数越来越奇怪，最后谁都不敢改。

#### 十一、Layer Collision Matrix：项目级物理规则表

Layer Collision Matrix 控制哪些层之间会产生物理碰撞或触发检测。它是项目级规则，不应随意更改。常见配置包括玩家不与自己的子弹碰撞，敌人不与敌人子弹碰撞，HitBox 与 HurtBox 触发，Sensor 只与 Character 层触发等。

建议为物理层建立文档。比如 Default 仅做临时层，Environment 表示静态阻挡，Player 表示玩家实体，Enemy 表示敌人实体，PlayerAttack 表示玩家攻击判定，Sensor 表示感知区域。没有文档的 Layer 项目，后期通常会变成“祖传开关矩阵”。

#### 十二、Cast 查询：带形状的扫掠检测

普通 Raycast 是无限细线，Cast 查询是带体积的移动检测，例如 SphereCast、BoxCast、CapsuleCast。它们回答的问题是：“如果一个球、盒或胶囊沿某个方向移动，会不会碰到东西？”

SphereCast 适合相机避障、粗略投射物路径、前方障碍检测。CapsuleCast 适合角色控制器移动前检测。BoxCast 适合盒形物体移动检测或体积明确的技能判定。Cast 查询比 Raycast 更贵，但比“移动后穿透再修正”更稳定。

#### 十三、Overlap 查询：范围内有哪些 Collider

Overlap 查询不发射、不扫掠，而是在某个形状区域内查询当前有哪些 Collider。常用 API 包括 OverlapSphere、OverlapBox、OverlapCapsule 以及对应 NonAlloc 版本。它适合 AoE 范围伤害、AI 感知、自动拾取、检查出生点是否被占用等。

```csharp
int count = Physics.OverlapSphereNonAlloc(
    transform.position,
    radius,
    colliderBuffer,
    enemyMask);
```

Overlap 只告诉你区域内有谁，不告诉你从哪里进入，也不提供命中法线。需要方向、遮挡和视线时，应结合 Raycast 二次验证。

#### 十四、物理查询性能优化

物理查询优化首先从 LayerMask 开始，减少候选对象。其次，高频查询使用 NonAlloc 避免数组分配。第三，控制查询频率，AI 感知不一定每帧执行。第四，先粗后细，比如先 Overlap 找候选，再用角度和距离过滤，最后用 Raycast 做遮挡验证。第五，避免命中后高频 GetComponent，可以通过组件缓存、接口注册或映射表减少重复查找。

优化不能只看单次 API 耗时，还要看调用频率、目标设备、GC Alloc、物理世界复杂度和是否发生帧峰值。

#### 十五、可视化调试：物理开发的刚需

射线和范围检测不画出来，就是盲修。运行时可以使用：

```csharp
Debug.DrawRay(origin, direction * distance, Color.red);
```

命中时绘制命中段和法线：

```csharp
if (Physics.Raycast(ray, out RaycastHit hit, distance, mask))
{
    Debug.DrawLine(origin, hit.point, Color.green);
    Debug.DrawRay(hit.point, hit.normal, Color.yellow);
}
```

范围检测用 Gizmos：

```csharp
private void OnDrawGizmosSelected()
{
    Gizmos.color = Color.yellow;
    Gizmos.DrawWireSphere(transform.position, detectionRadius);
}
```

调试绘制应可开关，不能在发布环境里无控制运行。

#### 十六、Update 与 FixedUpdate 的选择

物理模拟按固定时间步执行。与 Rigidbody 相关的力、速度、MovePosition、MoveRotation 通常放在 FixedUpdate。输入采集可以放在 Update，再缓存到 FixedUpdate 中应用。

纯查询逻辑放哪里取决于语义：鼠标点击拾取适合 Update；角色地面检测通常在移动流程或 FixedUpdate 中；AI 感知可以自定义 Tick；技能释放瞬间检测可在事件触发时执行。不要机械地把所有 Physics API 都放 FixedUpdate，要看它是否参与物理模拟闭环。

#### 十七、语义化封装：不要让业务到处手写 Physics

工业化项目不应该让每个模块随意写物理查询。建议建立 `PhysicsQueryService`，封装 `TryRaycastGround`、`FindEnemiesInRadius`、`HasLineOfSight`、`TryPickInteractable` 等语义接口。业务层只表达需求，不关心 LayerMask、Trigger 策略、NonAlloc 缓冲区和排序细节。

这样后期修改物理层规划、增加调试绘制、替换查询策略、做性能统计，都可以集中处理，而不是全项目搜索 `Physics.Raycast`。


### 实现方案


#### 一、封装点击拾取系统

鼠标/触摸拾取推荐封装为服务：

```csharp
public sealed class WorldPicker
{
    private readonly Camera camera;
    private readonly LayerMask pickMask;
    private readonly float maxDistance;

    public WorldPicker(Camera camera, LayerMask pickMask, float maxDistance)
    {
        this.camera = camera;
        this.pickMask = pickMask;
        this.maxDistance = maxDistance;
    }

    public bool TryPick(Vector2 screenPosition, out RaycastHit hit)
    {
        Ray ray = camera.ScreenPointToRay(screenPosition);
        return Physics.Raycast(ray, out hit, maxDistance, pickMask, QueryTriggerInteraction.Ignore);
    }
}
```

业务层调用时，应先判断是否点击 UI，避免 UI 输入穿透到世界对象。

#### 二、封装地面检测

角色地面检测可以使用 Raycast、SphereCast 或 CapsuleCast。普通射线适合简单场景，但角色脚底有体积时 SphereCast 更稳：

```csharp
public bool CheckGround(Vector3 origin, float radius, float distance, LayerMask groundMask, out RaycastHit hit)
{
    return Physics.SphereCast(
        origin,
        radius,
        Vector3.down,
        out hit,
        distance,
        groundMask,
        QueryTriggerInteraction.Ignore);
}
```

落地后可使用 `Vector3.ProjectOnPlane(inputMove, hit.normal)` 将移动方向投影到地面平面。

#### 三、实现 AoE 范围技能

AoE 技能通常先 Overlap，再做阵营、距离、角度、遮挡过滤。

```csharp
private readonly Collider[] overlapBuffer = new Collider[64];

public int CollectTargets(Vector3 center, float radius, LayerMask targetMask, List<IDamageable> results)
{
    results.Clear();

    int count = Physics.OverlapSphereNonAlloc(
        center,
        radius,
        overlapBuffer,
        targetMask,
        QueryTriggerInteraction.Collide);

    for (int i = 0; i < count; i++)
    {
        if (overlapBuffer[i].TryGetComponent(out IDamageable damageable))
            results.Add(damageable);
    }

    return results.Count;
}
```

如果技能需要遮挡判断，再对候选目标做 Raycast，不要对全场对象直接射线检测。

#### 四、实现 AI 视野检测

AI 视野推荐组合距离平方、点积角度和射线遮挡：

```csharp
public bool CanSeeTarget(Transform eye, Transform target)
{
    Vector3 toTarget = target.position - eye.position;
    float sqrDistance = toTarget.sqrMagnitude;

    if (sqrDistance > viewDistance * viewDistance)
        return false;

    Vector3 dir = toTarget.normalized;
    float dot = Vector3.Dot(eye.forward, dir);

    if (dot < minViewDot)
        return false;

    if (Physics.Raycast(eye.position, dir, out RaycastHit hit, viewDistance, sightMask))
        return hit.transform == target || hit.transform.IsChildOf(target);

    return false;
}
```

大量 AI 时要分帧、降频、空间分区，不要每帧所有 AI 检测所有目标。

#### 五、实现相机遮挡处理

第三人称相机可以从角色头部向期望相机位置做 SphereCast：

```csharp
Vector3 from = target.position + Vector3.up * shoulderHeight;
Vector3 desired = CalculateDesiredCameraPosition();

Vector3 dir = desired - from;
float distance = dir.magnitude;

if (Physics.SphereCast(from, cameraRadius, dir.normalized, out RaycastHit hit, distance, obstacleMask))
{
    cameraTransform.position = hit.point - dir.normalized * cameraPadding;
}
else
{
    cameraTransform.position = desired;
}
```

SphereCast 比 Raycast 更适合相机避障，因为相机有近裁剪面和体积感，普通射线可能贴墙穿帮。

#### 六、物理查询代码评审清单

提交物理查询相关代码时检查：是否使用明确 LayerMask；高频查询是否使用 NonAlloc；是否处理 QueryTriggerInteraction；是否考虑命中自己；是否考虑射线起点在 Collider 内部；RaycastAll 结果是否显式排序；缓冲区满时是否有处理；是否有 Gizmos 或 Debug.Draw 辅助；Rigidbody 移动是否放在合适生命周期；Trigger/Collision 条件是否满足；是否在目标设备做过性能验证。


### 总结

射线与碰撞检测是 Unity 交互逻辑中最常用、也最容易被误用的能力。普通 Raycast 适合线性探测，Cast 适合带体积的扫掠检测，Overlap 适合静态范围查询。Collider 定义物理形状，Rigidbody 决定对象是否进入物理模拟，Trigger 与 Collision 分别服务于逻辑区域和实体碰撞。只有把这些概念组合起来理解，才能写出稳定可靠的交互系统。

工程实践中，最重要的是建立一套物理查询规范：明确 LayerMask，减少无关检测；高频场景使用 NonAlloc，避免 GC；用 Gizmos 和 Debug.Draw 可视化查询；用 Layer Collision Matrix 管理项目级物理规则；用语义化服务封装检测逻辑。这样射线和碰撞检测才不会变成散落在业务代码里的玄学判断，而会成为项目可维护的基础设施。

## 元数据

- **创建时间：** 2026-04-24
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 数学基础
- **标签：** 数学基础、射线检测、碰撞检测、Physics、Collider、Rigidbody、LayerMask、NonAlloc
- **来源：** 已有文稿整理；结合 Unity 官方 Physics、Raycast 与 FixedUpdate 文档校正

---

*文档基于与吉良吉影的讨论，由小雅整理*

#### 工程化补充 1：射线与碰撞检测 的边界验证

【通用原则】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证01】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

【通用建议】所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 2：射线与碰撞检测 的边界验证

【测试策略】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证02】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 3：射线与碰撞检测 的边界验证

【质量保障】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证03】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 4：射线与碰撞检测 的边界验证

【验证流程】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证04】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 5：射线与碰撞检测 的边界验证

【检查清单】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证05】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 6：射线与碰撞检测 的边界验证

在正式项目中，射线与碰撞检测不应只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证06】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 7：射线与碰撞检测 的边界验证

【注意事项】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证07】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 8：射线与碰撞检测 的边界验证

【工程建议】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证08】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 9：射线与碰撞检测 的边界验证

【质量守则】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证09】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 10：射线与碰撞检测 的边界验证

【实践指南】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证10】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 11：射线与碰撞检测 的边界验证

在正式项目中，射线与碰撞检测不应只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证11】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。


#### 工程化补充 12：射线与碰撞检测 的边界验证

【验收标准】 在正式项目中，射线与碰撞检测 不能只依赖一次手动测试。建议至少覆盖默认参数、极端参数、空数据、无效引用、父子层级变化、运行时切场景、不同帧率、不同分辨率以及目标平台真机表现。很多数学和物理问题在编辑器里看起来正常，是因为数据规模小、帧率稳定、对象层级简单；一旦进入真实战斗、复杂 UI、多人同屏或者低端设备，隐藏问题就会暴露出来。

【验证12】应同时观察正确性和性能。正确性关注结果是否符合玩法预期，性能关注主线程耗时、GC Alloc、物理查询次数、内存增长和帧峰值。若该模块属于基础设施，还应提供可视化调试开关，让使用者能够直接看到空间方向、检测范围、命中点、法线、包围盒、曲线采样点或数据分区。没有可视化的底层系统，排查成本会随着项目规模指数级上升。

最后，所有优化都应写明适用范围。比如平方距离适合比较距离大小，却不能直接替代真实距离参与线性衰减；降低检测频率适合 AI 感知，却不适合即时格挡；使用缓存可以减少计算，但必须处理数据失效。把这些约束写进注释和文档，比单纯写一段看似聪明的代码更重要。
