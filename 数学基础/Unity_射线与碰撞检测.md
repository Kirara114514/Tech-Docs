# Unity 射线与碰撞检测：从物理查询到交互系统

## 摘要
射线与碰撞检测是 Unity 3D 交互逻辑的入口能力。鼠标点击拾取、射击命中、AI 视野、地面检测、角色控制、范围技能、交互提示、机关触发、相机遮挡和物理反馈，都离不开 Raycast、Cast、Overlap、Collider、Rigidbody、Trigger、Collision 和 LayerMask 的组合。很多物理问题并不是引擎异常，而是查询空间、层级过滤、Trigger 策略、Rigidbody 组合、物理同步、回调条件或性能路径没有被明确设计。

本文从工程实践角度系统说明 Unity 中的射线检测与碰撞检测：射线适合线性探测，Cast 适合带体积扫掠，Overlap 适合静态范围查询；Collider 定义物理形状，Rigidbody 决定是否进入物理模拟，Trigger 与 Collision 分别服务逻辑区域与实体碰撞；LayerMask 和 Layer Collision Matrix 是项目级物理规则；NonAlloc 查询、缓冲区上限、可视化调试和语义化封装，是工业项目中保持低 GC、可调试、可维护的关键。

## 正文

### 背景
坐标系解决“点和方向属于哪个空间”的问题，几何算法解决“空间关系如何计算”的问题，而射线与碰撞检测解决的是“这些空间关系如何与物理世界中的对象发生交互”。开发者不需要手写所有求交算法，但必须理解 Unity 物理 API 的语义、生命周期和边界条件。一个看似简单的 Raycast，如果起点在碰撞体内部、方向处于局部空间、LayerMask 漏配、Trigger 策略不一致或物理状态尚未同步，就可能出现“明明看见了却打不到”的问题。

射线与碰撞检测的风险在于它同时承载逻辑正确性和性能成本。一次鼠标点击拾取可以直接 Raycast；数百个 AI 每帧视线检测就必须分帧、降频和先粗后细；一个范围技能可以 Overlap 后再筛选；一个角色移动前检测通道则需要 CapsuleCast 或控制器逻辑。若所有模块都直接手写 Physics 查询，项目后期会很难统一 Layer、Trigger、NonAlloc、可视化和性能统计。

因此，射线与碰撞检测不应只是 API 使用技巧，而应成为项目物理查询体系的一部分。

### 核心原理
#### 一、射线检测从一点沿方向做线性查询
射线检测回答的问题是：从某个起点沿某个方向，在指定距离内是否碰到 Collider。典型写法如下：

```csharp
Ray ray = new Ray(origin, direction);

if (Physics.Raycast(ray, out RaycastHit hit, maxDistance, layerMask))
{
    Vector3 hitPoint = hit.point;
    Vector3 hitNormal = hit.normal;
}
```

Raycast 适合鼠标点击拾取、射击命中、AI 视线遮挡、地面检测、交互物检测和相机遮挡检测。普通射线无限细，不适合表达有体积对象的通过性。如果要判断胶囊角色能否穿过某个通道，应使用 CapsuleCast、角色控制器或自定义体积检测，而不是用一条射线替代体积。

#### 二、Ray 的 Origin 与 Direction 都是世界空间语义
`Ray` 由世界空间起点和世界空间方向组成。方向最好保持归一化，虽然 Unity 许多 API 能处理非单位方向，但统一规范能减少理解成本。常见错误是把局部方向当成世界方向：

```csharp
Ray ray = new Ray(transform.position, Vector3.forward);
```

如果物体未旋转，这段代码看似正常；一旦物体旋转，射线仍然沿世界 Z 轴，而不是物体自身前方。正确写法是：

```csharp
Ray ray = new Ray(transform.position, transform.forward);
```

或显式转换：

```csharp
Vector3 worldDir = transform.TransformDirection(Vector3.forward);
Ray ray = new Ray(transform.position, worldDir);
```

射线问题首先要确认空间语义，其次才是 Layer 和 Collider。

#### 三、RaycastHit 提供的是命中上下文
`RaycastHit` 不只是命中对象引用，它还包含 `point`、`normal`、`distance`、`collider`、`rigidbody`、`transform`、`textureCoord` 等上下文。`point` 是世界命中点，`normal` 是世界表面法线，`distance` 是射线起点到命中点的距离。

命中信息可驱动贴花、粒子、弹道反射、伤害、脚步特效、墙面滑动和物体贴合。例如：

```csharp
if (Physics.Raycast(ray, out RaycastHit hit, 100f, hitMask))
{
    Quaternion rotation = Quaternion.LookRotation(hit.normal);
    SpawnImpactVfx(hit.point, rotation);
}
```

法线尤其重要。弹球、激光反射、角色沿墙滑动、表面特效和接触方向判断都依赖它。不要只取 `hit.transform` 后丢弃命中上下文。

#### 四、LayerMask 是物理查询的第一层过滤
LayerMask 是性能和正确性的基础。没有 LayerMask 的射线可能命中地面、角色自身、触发器、装饰物、隐藏碰撞体或临时调试对象。推荐通过 Inspector 配置：

```csharp
[SerializeField] private LayerMask groundMask;

if (Physics.Raycast(ray, out RaycastHit hit, 100f, groundMask))
{
    // 只处理地面
}
```

不要在高频逻辑中反复通过字符串创建 LayerMask。项目应建立稳定物理层规划，例如 Environment、Player、Enemy、PlayerAttack、EnemyAttack、Sensor、Interactable、HitBox、HurtBox。Layer 规划应有文档和负责人，否则后期会变成难以审计的开关矩阵。

#### 五、QueryTriggerInteraction 必须显式决定
物理查询是否命中 Trigger 由 `QueryTriggerInteraction` 决定，也会受到全局 Physics 设置影响。为了避免系统之间行为不一致，核心查询应显式传入策略：

```csharp
Physics.Raycast(ray, out hit, distance, mask, QueryTriggerInteraction.Ignore);
```

地面检测通常忽略 Trigger；交互检测可能需要命中 Trigger；技能范围可能根据 HitBox/HurtBox 设计选择 Collide。不要让默认值暗中决定逻辑，否则后期排查会很困难。

#### 六、RaycastAll 与 RaycastNonAlloc 分别解决多命中与低分配
`Physics.RaycastAll` 会返回射线路径上的多个命中结果，适合穿透弹、扫描分析和编辑器工具。但工程中不应默认依赖命中结果已经按距离排序，应显式排序：

```csharp
RaycastHit[] hits = Physics.RaycastAll(ray, maxDistance, mask);
Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
```

高频查询不应使用会分配数组的 API，应使用 NonAlloc 版本：

```csharp
private readonly RaycastHit[] hitBuffer = new RaycastHit[16];
int count = Physics.RaycastNonAlloc(ray, hitBuffer, maxDistance, mask);
```

NonAlloc 的核心边界是缓冲区容量。若返回数量等于数组长度，说明结果可能被截断，应记录警告、扩大容量或设计上限。低 GC 不等于可以忽略溢出。

#### 七、Raycast 的边界条件要进入排查清单
Raycast 常见漏检原因包括：起点在 Collider 内部、方向错误、maxDistance 过短、LayerMask 漏配、Trigger 策略不一致、Collider 禁用、目标不在当前 PhysicsScene、物体 Transform 刚移动但物理状态尚未同步、射线打到自己。排查时应按顺序确认这些因素，而不是直接怀疑引擎。

如果起点可能在碰撞体内部，应考虑调整起点、使用 Cast、Overlap 或额外处理。若对象由 Transform 直接移动并立即查询，必要时要理解 Physics 同步时机。物理系统有自己的模拟节奏，不能把渲染层 Transform 更新和物理查询时机混为一谈。

#### 八、Collider 是物理世界中的形状代理
Collider 定义物体在物理世界中的形状。渲染网格可以复杂，但物理碰撞体应尽量简单。BoxCollider 适合墙、箱子、平台；SphereCollider 适合球体和范围触发；CapsuleCollider 适合角色和生物单位；MeshCollider 最精确，但性能成本和限制也更高。

MeshCollider 适合静态复杂地形、大型建筑等。动态物体上应谨慎使用 MeshCollider，尤其是非 Convex MeshCollider。需要移动并参与物理交互的复杂对象，通常更适合由多个简单 Collider 组合，而不是直接使用复杂网格。碰撞体设计是性能设计，不只是形状还原。

#### 九、Rigidbody 决定对象是否进入物理模拟
Collider 只是形状，Rigidbody 表示对象进入物理模拟。没有 Rigidbody 的 Collider 通常作为静态碰撞体；带 Rigidbody 的对象会参与动态物理。Rigidbody 的关键配置包括 `isKinematic`、`useGravity`、`collisionDetectionMode`、`interpolation` 和 constraints。

移动 Rigidbody 时，不推荐直接改 Transform。动态刚体应使用力、速度、`MovePosition` 或 `MoveRotation`：

```csharp
rb.MovePosition(rb.position + velocity * Time.fixedDeltaTime);
```

直接修改 Transform 可能绕开物理系统，造成穿透、抖动、回调异常或碰撞求解不稳定。若对象由逻辑控制但仍需要触发器或碰撞，Kinematic Rigidbody 的语义也应明确。

#### 十、Trigger 与 Collision 服务不同职责
`isTrigger` 决定 Collider 是否作为触发器。非 Trigger Collider 产生物理阻挡，触发 `OnCollisionEnter/Stay/Exit`；Trigger Collider 不产生阻挡，触发 `OnTriggerEnter/Stay/Exit`。一般来说，触发回调需要至少一方存在 Rigidbody，并且层碰撞矩阵允许交互。

拾取范围、机关区域、技能检测区适合 Trigger；墙壁、地面、物理箱子适合 Collision。不要用 Trigger 模拟实体阻挡，也不要用 Collision 做纯逻辑区域。职责混乱会导致参数越来越奇怪，最终谁都不敢改。

#### 十一、Layer Collision Matrix 是项目级物理规则表
Layer Collision Matrix 控制哪些层之间会产生物理碰撞或触发检测。它是项目级规则，不应随意更改。常见配置包括玩家不与自己的子弹碰撞，敌人不与敌人子弹碰撞，HitBox 与 HurtBox 触发，Sensor 只与 Character 层触发等。

建议为物理层建立文档，说明每一层的语义、允许碰撞对象和查询用途。没有文档的 Layer 项目，后期通常会变成“能用就别动”的隐性风险。物理层不是单个系统的私有配置，而是全项目共享协议。

#### 十二、Cast 查询用于带形状的扫掠检测
普通 Raycast 是无限细线，Cast 查询是带体积移动检测，例如 SphereCast、BoxCast、CapsuleCast。它们回答的问题是：如果一个球、盒或胶囊沿某方向移动，会不会碰到东西。

SphereCast 适合相机避障、粗略投射物路径、前方障碍检测；CapsuleCast 适合角色控制器移动前检测；BoxCast 适合盒形物体移动检测或体积明确的技能判定。Cast 查询比 Raycast 更贵，但比“移动后穿透再修正”更稳定。体积相关问题不要强行用多条 Raycast 拼凑，除非有明确性能和精度理由。

#### 十三、Overlap 查询适合当前范围内有哪些对象
Overlap 查询不发射、不扫掠，而是在某个形状区域内查询当前有哪些 Collider。常用 API 包括 OverlapSphere、OverlapBox、OverlapCapsule 以及对应 NonAlloc 版本。它适合 AoE 范围伤害、AI 感知、自动拾取、检查出生点是否被占用等。

```csharp
int count = Physics.OverlapSphereNonAlloc(
    transform.position,
    radius,
    colliderBuffer,
    enemyMask,
    QueryTriggerInteraction.Collide);
```

Overlap 只告诉你区域内有谁，不告诉你从哪里进入，也不提供命中法线。需要方向、遮挡和视线时，应结合角度筛选和 Raycast 二次验证。

#### 十四、物理查询性能优化要先粗后细
物理查询优化首先从 LayerMask 开始，减少候选对象。其次，高频查询使用 NonAlloc 避免数组分配。第三，控制查询频率，AI 感知不一定每帧执行。第四，先粗后细，例如先 Overlap 找候选，再用距离和角度过滤，最后用 Raycast 做遮挡验证。第五，避免命中后高频 GetComponent，可通过组件缓存、接口注册或映射表减少重复查找。

优化不能只看单次 API 耗时，还要看调用频率、目标设备、GC Alloc、物理世界复杂度和帧峰值。几十次查询可以优先可读性，数千次查询必须有数据和调度策略。

#### 十五、可视化调试是物理查询开发的刚需
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

范围检测可用 Gizmos 绘制球、盒、胶囊和视野扇形。调试绘制应有开关，避免在发布环境中无控制运行。

#### 十六、Update 与 FixedUpdate 要按语义选择
物理模拟按固定时间步执行。与 Rigidbody 相关的力、速度、MovePosition、MoveRotation 通常放在 FixedUpdate。输入采集可以放在 Update，再缓存到 FixedUpdate 中应用。

纯查询逻辑放哪里取决于语义：鼠标点击拾取适合 Update；角色地面检测通常在移动流程或 FixedUpdate 中；AI 感知可以自定义 Tick；技能释放瞬间检测可在事件触发时执行。不要机械地把所有 Physics API 都放 FixedUpdate，也不要把参与物理闭环的刚体移动随意放在 Update。

### 设计思路
#### 一、封装点击拾取系统
鼠标或触摸拾取推荐封装为服务：

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

#### 六、建立物理查询服务
工业化项目不应让每个模块随意手写 Physics 查询。建议建立 `PhysicsQueryService`，封装 `TryRaycastGround`、`FindEnemiesInRadius`、`HasLineOfSight`、`TryPickInteractable` 等语义接口。业务层只表达需求，不关心 LayerMask、Trigger 策略、NonAlloc 缓冲区和排序细节。

这样后期修改物理层规划、增加调试绘制、替换查询策略、做性能统计，都可以集中处理，而不是全项目搜索 `Physics.Raycast`。

#### 七、建立代码评审清单
提交物理查询相关代码时检查：是否使用明确 LayerMask；高频查询是否使用 NonAlloc；是否处理 QueryTriggerInteraction；是否考虑命中自己；是否考虑射线起点在 Collider 内部；RaycastAll 结果是否显式排序；缓冲区满时是否有处理；是否有 Gizmos 或 Debug.Draw 辅助；Rigidbody 移动是否放在合适生命周期；Trigger/Collision 条件是否满足；是否在目标设备做过性能验证。

### 进阶讨论
射线与碰撞检测的第一类取舍，是精度与成本之间的取舍。Raycast 便宜但没有体积，SphereCast 和 CapsuleCast 更符合真实对象体积但更贵；MeshCollider 精确但成本高，组合简单 Collider 更可控；Overlap 能快速找范围候选，但不能提供遮挡和接触法线。成熟方案通常不是选择最精确的查询，而是先用便宜查询缩小候选，再对少量对象做精确判断。

第二类取舍，是物理回调与主动查询之间的取舍。Trigger/Collision 回调适合持续区域和实体接触，主动查询适合瞬时技能、点击、AI 感知和相机遮挡。回调能减少主动轮询，但生命周期和 Rigidbody 条件更复杂；主动查询语义清晰，但高频使用会带来性能压力。项目应根据交互性质选择，而不是所有需求都用一种方式。

第三类取舍，是全局物理层规则与局部需求之间的取舍。Layer Collision Matrix 是全项目共享协议，不能为了某个临时需求随意修改。局部差异应通过 LayerMask、QueryTriggerInteraction、专用 Collider 或语义服务处理。全局矩阵一旦混乱，任何系统都可能被其他系统的改动影响。

第四类取舍，是 NonAlloc 的低 GC 与缓冲区管理复杂度之间的取舍。NonAlloc 能减少数组分配，但需要设计容量上限、溢出策略和调试警告。若只是低频点击查询，普通 API 更清晰；若是每帧大量 AI 和技能检测，NonAlloc 和复用缓冲区就非常重要。不要为了“零分配”引入未处理的截断 bug。

最后，物理查询应被可视化和统计。核心查询应能画出射线、扫掠体、Overlap 范围、命中点和法线；开发版可统计查询次数、命中数、缓冲区溢出、LayerMask 分布和 GC Alloc。没有可视化的物理系统，很容易退化为“看起来应该打到了”的猜测。

## 知识缺口
- 具体 Trigger 回调条件、物理同步策略、PhysicsScene 使用、NonAlloc 缓冲区容量、DOTS Physics 或 Havok Physics 差异，会随 Unity 版本、物理后端、项目封装和目标平台变化；正式规范应以项目锁定版本和实际物理层规划为准。

### 总结
射线与碰撞检测是 Unity 交互逻辑中最常用、也最容易被误用的能力。Raycast 适合线性探测，Cast 适合带体积扫掠，Overlap 适合范围查询；Collider 定义物理形状，Rigidbody 决定物理模拟身份，Trigger 与 Collision 分别服务逻辑区域和实体碰撞。只有把这些概念组合起来理解，才能写出稳定可靠的交互系统。

工程实践中，最重要的是建立一套物理查询规范：明确 LayerMask，显式处理 Trigger 策略，高频场景使用 NonAlloc，先粗后细降低查询成本，用 Gizmos 和 Debug.Draw 可视化，用 Layer Collision Matrix 管理项目级规则，用语义化服务封装检测逻辑。这样射线和碰撞检测才不会变成散落在业务代码里的玄学判断，而会成为项目可维护的基础设施。

## 元数据
- **创建时间：** 2026-04-24
- **最后更新：** 2026-05-09 00:00
- **版本：** v2.0
- **分类：** 数学基础
- **标签：** 数学基础、物理系统
- **来源简注：** 基于 Unity 射线与碰撞检测主题重新编写，聚焦 Raycast、Cast、Overlap、Collider、Rigidbody、Trigger、LayerMask、NonAlloc、调试和物理查询规范。

---
*文档基于讨论主题重写整理*
