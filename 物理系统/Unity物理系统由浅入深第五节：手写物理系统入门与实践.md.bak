
**请注意：** 手写一个完整、功能强大的物理引擎是一个极其复杂的任务，远超本教程的范围。我们这里的目标是构建一个**极简的、概念验证性质的**物理系统，通过它来帮助我们理解核心原理。

接下来，我们将手写一个简单的 **2D 物理系统**。选择 2D 是因为它能最大程度地简化数学和计算，同时不失核心物理原理。我们的物理系统将能模拟：

-   **刚体 (Rigid Body)**：具有质量、位置、速度的圆形物体。
    
-   **重力 (Gravity)**：让物体下落。
    
-   **边界碰撞 (Boundary Collision)**：物体与世界的边界（地面、墙壁）发生碰撞。
    
-   **圆形与圆形碰撞 (Circle-Circle Collision)**：两个圆形物体之间的碰撞检测与响应。
    

----------

### 1. 物理系统架构设计

一个最简的物理系统需要包含以下核心组件：

-   **物理世界 (Physics World)**：管理所有物理对象，处理时间步进。
    
-   **刚体 (RigidBody)**：存储物体的物理属性。
    
-   **碰撞体 (Collider)**：定义物体的几何形状（这里我们只用圆形）。
    
-   **碰撞信息 (Contact)**：存储碰撞点、法线、深度等。
    
-   **碰撞检测器 (Collision Detector)**：找出发生碰撞的对。
    
-   **求解器 (Solver)**：处理碰撞响应，防止穿透。
    

#### 核心代码结构设想 (伪代码)：



```
// PhysicsWorld.cs
public class PhysicsWorld
{
    List<RigidBody> bodies;
    Vector2 gravity;
    float fixedTimestep;

    public void AddBody(RigidBody body);
    public void Step(); // 每个 FixedUpdate 调用
}

// RigidBody.cs
public class RigidBody
{
    float mass;
    Vector2 position;
    Vector2 velocity;
    float restitution; // 弹性系数 (bounciness)
    CircleCollider collider; // 简化为只用圆形碰撞体
    // ... 其他属性和方法
}

// CircleCollider.cs
public class CircleCollider
{
    float radius;
    // ...
}

// Contact.cs
public class Contact
{
    RigidBody bodyA;
    RigidBody bodyB;
    Vector2 normal;     // 碰撞法线 (从A指向B)
    float penetration;  // 穿透深度
    Vector2 contactPoint; // 碰撞点
}

// CollisionDetector.cs
public class CollisionDetector
{
    public List<Contact> DetectCollisions(List<RigidBody> bodies, Rect worldBounds);
}

// Solver.cs
public class Solver
{
    public void ResolveCollisions(List<Contact> contacts, float dt);
}

```

----------

### 2. 实现核心组件

我们将在 Unity 中创建这些 C# 类，但它们将独立于 Unity 的内置物理系统运行，完全由我们自己管理。

#### 2.1. `Vector2` 和 `Rect` 辅助类 (Unity自带)

我们使用 Unity 自带的 `Vector2` 和 `Rect` 来简化数学运算，但所有物理逻辑都自己实现。

#### 2.2. `RigidBody2D` 类



```
using UnityEngine; // 仅用于 Vector2, Debug.DrawLine等

public class RigidBody2D // 为了避免与Unity Rigidbody冲突，加2D
{
    public Vector2 Position;
    public Vector2 Velocity;
    public float Mass;
    public float Restitution; // 弹性系数 (0-1, 0:不弹跳, 1:完全弹性)
    public CircleCollider2D Collider; // 关联的碰撞体

    // 缓存一些常用值
    public float InverseMass => Mass == 0 ? 0 : 1f / Mass; // 质量的倒数，用于计算冲量

    public RigidBody2D(Vector2 position, float radius, float mass, float restitution)
    {
        Position = position;
        Velocity = Vector2.zero;
        Mass = mass;
        Restitution = restitution;
        Collider = new CircleCollider2D(this, radius); // 关联自身
    }

    // 更新位置和速度（这里只进行力的累积和积分，碰撞在Solver中处理）
    public void ApplyForce(Vector2 force, float deltaTime)
    {
        // F = ma => a = F/m
        // v = v0 + at
        // x = x0 + vt
        Velocity += (force * InverseMass) * deltaTime;
        Position += Velocity * deltaTime; // 欧拉积分 (简化版)
    }

    // 直接施加冲量（通常用于碰撞响应）
    public void ApplyImpulse(Vector2 impulse)
    {
        Velocity += impulse * InverseMass;
    }
}

```

#### 2.3. `CircleCollider2D` 类



```
using UnityEngine;

public class CircleCollider2D
{
    public RigidBody2D ParentBody; // 关联的刚体
    public float Radius;

    public Vector2 WorldPosition => ParentBody.Position; // 碰撞体的世界坐标就是刚体的位置

    public CircleCollider2D(RigidBody2D parentBody, float radius)
    {
        ParentBody = parentBody;
        Radius = radius;
    }
}

```

#### 2.4. `Contact2D` 类



```
using UnityEngine;

public class Contact2D
{
    public RigidBody2D BodyA;
    public RigidBody2D BodyB;
    public Vector2 Normal;      // 从 BodyA 指向 BodyB 的碰撞法线
    public float Penetration;   // 穿透深度
    public Vector2 ContactPoint; // 碰撞发生的世界坐标点 (简化为中心点)

    public Contact2D(RigidBody2D bodyA, RigidBody2D bodyB, Vector2 normal, float penetration, Vector2 contactPoint)
    {
        BodyA = bodyA;
        BodyB = bodyB;
        Normal = normal;
        Penetration = penetration;
        ContactPoint = contactPoint;
    }
}

```

----------

### 3. 实现碰撞检测（Narrow-Phase）

我们将实现圆形与圆形，以及圆形与世界边界的碰撞检测。

#### 3.1. `CollisionDetector2D` 类



```
using System.Collections.Generic;
using UnityEngine;

public class CollisionDetector2D
{
    // 世界边界
    public Rect WorldBounds;

    public CollisionDetector2D(Rect worldBounds)
    {
        WorldBounds = worldBounds;
    }

    public List<Contact2D> DetectCollisions(List<RigidBody2D> bodies)
    {
        List<Contact2D> contacts = new List<Contact2D>();

        // 1. 圆形与圆形碰撞
        for (int i = 0; i < bodies.Count; i++)
        {
            for (int j = i + 1; j < bodies.Count; j++)
            {
                RigidBody2D bodyA = bodies[i];
                RigidBody2D bodyB = bodies[j];

                // 确保两个刚体都存在碰撞体
                if (bodyA.Collider == null || bodyB.Collider == null) continue;

                // 计算两圆心距离
                float distance = Vector2.Distance(bodyA.Position, bodyB.Position);
                float radiiSum = bodyA.Collider.Radius + bodyB.Collider.Radius;

                // 如果距离小于半径之和，则发生碰撞
                if (distance < radiiSum)
                {
                    // 计算穿透深度
                    float penetration = radiiSum - distance;
                    // 计算碰撞法线 (从A指向B)
                    Vector2 normal = (bodyB.Position - bodyA.Position).normalized;
                    // 计算碰撞点 (简化为两圆心连线中点)
                    Vector2 contactPoint = bodyA.Position + normal * (bodyA.Collider.Radius - penetration / 2f);

                    contacts.Add(new Contact2D(bodyA, bodyB, normal, penetration, contactPoint));
                }
            }
        }

        // 2. 圆形与边界碰撞 (简单处理，只考虑底部和左右)
        foreach (var body in bodies)
        {
            if (body.Collider == null) continue;

            float r = body.Collider.Radius;
            Vector2 p = body.Position;

            // 底部边界
            if (p.y - r < WorldBounds.yMin)
            {
                contacts.Add(new Contact2D(body, null, Vector2.up, WorldBounds.yMin - (p.y - r), new Vector2(p.x, WorldBounds.yMin)));
            }
            // 顶部边界 (可选，如果需要)
            // if (p.y + r > WorldBounds.yMax) { ... }
            // 左边界
            if (p.x - r < WorldBounds.xMin)
            {
                contacts.Add(new Contact2D(body, null, Vector2.right, WorldBounds.xMin - (p.x - r), new Vector2(WorldBounds.xMin, p.y)));
            }
            // 右边界
            if (p.x + r > WorldBounds.xMax)
            {
                contacts.Add(new Contact2D(body, null, Vector2.left, (p.x + r) - WorldBounds.xMax, new Vector2(WorldBounds.xMax, p.y)));
            }
        }

        return contacts;
    }
}

```

----------

### 4. 实现求解器（Solver）

我们将使用简化版的**顺序脉冲法 (Sequential Impulse)** 来解决碰撞。

#### 4.1. `Solver2D` 类



```
using System.Collections.Generic;
using UnityEngine;

public class Solver2D
{
    public int Iterations = 8; // 求解器迭代次数，影响稳定性和精度

    public void ResolveCollisions(List<Contact2D> contacts, float deltaTime)
    {
        // 1. 分离穿透 (Position Correction)
        // 避免多重穿透，将物体稍微推开。通常在碰撞响应之前进行。
        // 这部分在实际物理引擎中可能更复杂，这里简化处理。
        foreach (var contact in contacts)
        {
            if (contact.Penetration > 0)
            {
                // 计算需要移动的量
                // 对于边界碰撞，只移动一个物体
                if (contact.BodyB == null) // 与边界碰撞
                {
                    contact.BodyA.Position += contact.Normal * contact.Penetration;
                }
                else // 两个刚体碰撞
                {
                    // 按质量比例推开
                    float totalInvMass = contact.BodyA.InverseMass + contact.BodyB.InverseMass;
                    if (totalInvMass == 0) continue; // 两个都是无限质量 (mass = 0)

                    float moveA = contact.Penetration * (contact.BodyA.InverseMass / totalInvMass);
                    float moveB = contact.Penetration * (contact.BodyB.InverseMass / totalInvMass);

                    contact.BodyA.Position -= contact.Normal * moveA;
                    contact.BodyB.Position += contact.Normal * moveB;
                }
            }
        }

        // 2. 速度冲量求解 (Impulse Resolution)
        // 迭代多次，以更好地解决多体碰撞问题
        for (int iter = 0; iter < Iterations; iter++)
        {
            foreach (var contact in contacts)
            {
                RigidBody2D bodyA = contact.BodyA;
                RigidBody2D bodyB = contact.BodyB;
                Vector2 normal = contact.Normal;

                // 如果其中一个或两个物体质量无限，则不施加冲量（或只对有限质量的施加）
                if (bodyA.Mass == 0 && (bodyB == null || bodyB.Mass == 0)) continue;

                // 计算相对速度 (法线方向)
                Vector2 relativeVelocity = (bodyB != null ? bodyB.Velocity : Vector2.zero) - bodyA.Velocity;
                float normalVelocity = Vector2.Dot(relativeVelocity, normal);

                // 如果物体已经分离或正在分离，则不需要施加冲量
                if (normalVelocity > 0) continue;

                // 计算弹性冲量
                // j = -(1 + e) * v_rel_n / (1/mA + 1/mB)
                float restitution = (bodyA.Restitution + (bodyB != null ? bodyB.Restitution : bodyA.Restitution)) / 2f; // 平均弹性
                float impulseMagnitude = -(1 + restitution) * normalVelocity;

                float totalInverseMass = bodyA.InverseMass + (bodyB != null ? bodyB.InverseMass : 0); // 边界碰撞视为无限质量

                if (totalInverseMass == 0) continue;
                impulseMagnitude /= totalInverseMass;

                Vector2 impulse = impulseMagnitude * normal;

                // 施加冲量
                bodyA.ApplyImpulse(-impulse); // 作用力
                if (bodyB != null)
                {
                    bodyB.ApplyImpulse(impulse); // 反作用力
                }
            }
        }
    }
}

```

----------

### 5. `PhysicsWorld2D` 类与场景集成

现在，将所有组件组合起来。



```
using System.Collections.Generic;
using UnityEngine;

public class PhysicsWorld2D : MonoBehaviour
{
    public Vector2 Gravity = new Vector2(0, -9.81f);
    public float FixedTimestep = 0.02f; // 固定物理更新时间步
    public Rect WorldBounds = new Rect(-5, -5, 10, 10); // 世界边界

    private List<RigidBody2D> _bodies = new List<RigidBody2D>();
    private CollisionDetector2D _detector;
    private Solver2D _solver;

    private float _accumulator = 0f; // 用于累积时间，确保固定时间步

    void Awake()
    {
        _detector = new CollisionDetector2D(WorldBounds);
        _solver = new Solver2D();
    }

    void Start()
    {
        // 示例：添加一些刚体
        AddRigidBody(new RigidBody2D(new Vector2(0, 4), 0.5f, 1f, 0.8f)); // 球A
        AddRigidBody(new RigidBody2D(new Vector2(0.6f, 5), 0.5f, 1f, 0.8f)); // 球B
        AddRigidBody(new RigidBody2D(new Vector2(-1, 3), 0.5f, 2f, 0.5f)); // 球C (重一些，弹性小些)
    }

    public void AddRigidBody(RigidBody2D body)
    {
        _bodies.Add(body);
    }

    void Update()
    {
        // 可视化世界边界
        Debug.DrawLine(new Vector2(WorldBounds.xMin, WorldBounds.yMin), new Vector2(WorldBounds.xMax, WorldBounds.yMin), Color.green);
        Debug.DrawLine(new Vector2(WorldBounds.xMin, WorldBounds.yMax), new Vector2(WorldBounds.xMax, WorldBounds.yMax), Color.green);
        Debug.DrawLine(new Vector2(WorldBounds.xMin, WorldBounds.yMin), new Vector2(WorldBounds.xMin, WorldBounds.yMax), Color.green);
        Debug.DrawLine(new Vector2(WorldBounds.xMax, WorldBounds.yMin), new Vector2(WorldBounds.xMax, WorldBounds.yMax), Color.green);

        // 可视化刚体位置
        foreach (var body in _bodies)
        {
            if (body.Collider != null)
            {
                // 使用 Gizmos.DrawWireSphere 更合适，但这里用 Debug.DrawLine 模拟
                // 绘制一个近似的圆
                int segments = 16;
                float angleStep = 360f / segments;
                for (int i = 0; i < segments; i++)
                {
                    float angle1 = Mathf.Deg2Rad * i * angleStep;
                    float angle2 = Mathf.Deg2Rad * (i + 1) * angleStep;
                    Vector2 p1 = body.Position + new Vector2(Mathf.Cos(angle1), Mathf.Sin(angle1)) * body.Collider.Radius;
                    Vector2 p2 = body.Position + new Vector2(Mathf.Cos(angle2), Mathf.Sin(angle2)) * body.Collider.Radius;
                    Debug.DrawLine(p1, p2, Color.yellow);
                }
            }
        }
    }

    void FixedUpdate() // Unity 的物理循环
    {
        _accumulator += Time.fixedDeltaTime;

        while (_accumulator >= FixedTimestep)
        {
            // 核心物理模拟循环
            Step(FixedTimestep);
            _accumulator -= FixedTimestep;
        }
    }

    void Step(float dt)
    {
        // 1. 施加重力
        foreach (var body in _bodies)
        {
            body.ApplyForce(Gravity * body.Mass, dt); // F=mg
        }

        // 2. 更新位置 (积分器，这里是 ApplyForce 内部的欧拉积分)
        // 已经在 ApplyForce 中处理，这里不需要额外步骤

        // 3. 碰撞检测
        List<Contact2D> contacts = _detector.DetectCollisions(_bodies);

        // 4. 碰撞响应 (求解器)
        _solver.ResolveCollisions(contacts, dt);
    }
}

```

----------

### 6. 使用方法

1.  在 Unity 项目中创建一个新的 C# 脚本，命名为 `PhysicsWorld2D`。将上面 `PhysicsWorld2D` 类的代码复制进去。
    
2.  创建 `RigidBody2D.cs`, `CircleCollider2D.cs`, `Contact2D.cs`, `CollisionDetector2D.cs`, `Solver2D.cs` 这些 C# 脚本，并分别复制对应的代码。
    
3.  在场景中创建一个空的 GameObject，命名为 **PhysicsManager**。
    
4.  将 `PhysicsWorld2D` 脚本附加到 `PhysicsManager` GameObject 上。
    
5.  运行场景，你会看到一些黄色的圆形（`Debug.DrawLine` 绘制），它们会像真实物理一样下落、相互碰撞、与地面和墙壁碰撞并反弹。
    

----------

### 7. 实践中的思考与挑战

通过这个简单的手写物理系统，你应该能体会到以下几点：

-   **Fixed Timestep 的重要性：** `FixedUpdate` 确保物理模拟在固定时间步进行，这是保证稳定性和可重复性的关键。
    
-   **积分器的作用：** 即使是简单的欧拉积分，也能让物体动起来。但其缺点（如能量不守恒、穿透）也会在复杂的场景中显现。
    
-   **碰撞检测的必要性：** 如果没有碰撞检测，物体会相互穿透。
    
-   **求解器的复杂性：** 即使是两球碰撞，也需要仔细计算冲量。多体碰撞的求解（LCP）是物理引擎最难的部分。我们这里只实现了简单的冲量应用，没有处理摩擦力。
    
-   **性能与精度：** 求解器的迭代次数越多，模拟越精确，但也越耗性能。这是一个永恒的权衡。
    
-   **浮点数精度：** 即使是 2D 模拟，长时间运行也可能出现微小抖动或误差累积。
    

#### 进阶挑战（可以尝试）：

-   **加入摩擦力：** 碰撞后，在切线方向施加一个与法向冲量相关的冲量来模拟摩擦。
    
-   **Box Collider 与 Circle-Box 碰撞：** 实现矩形碰撞体，并处理圆形与矩形的碰撞。
    
-   **宽相碰撞检测：** 当物体数量增多时，加入 AABB Tree 或 SAP 来优化 `DetectCollisions` 方法。
    
-   **关节模拟：** 尝试连接两个 Rigidbody，并限制它们的相对运动。
    
-   **3D 扩展：** 将 `Vector2` 替换为 `Vector3`，`CircleCollider` 替换为 `SphereCollider`，将 2D 几何检测扩展到 3D。这将大幅增加复杂性，但原理是相通的。
    

----------

### 总结

至此，我们已经从零开始构建了一个最基础的 2D 物理模拟器。尽管它非常简化，但其中包含了现代物理引擎的核心流程：**刚体管理、时间步进、施加力、碰撞检测、以及基于冲量的碰撞响应**。这个实践环节将极大地加深我们对前几篇理论知识的理解。但物理模拟的世界依然广阔且充满挑战。下一篇文章我们将一瞥一些高级主题和前沿探索，它们是更复杂、更专业物理模拟的领域，也许能为我们未来的学习和研究指明方向。
