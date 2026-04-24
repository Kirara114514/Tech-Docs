# Unity物理系统基础

## 摘要
Unity 物理系统基于 NVIDIA PhysX 引擎，为游戏提供刚体、碰撞、触发、物理材质等核心模拟功能。本文系统介绍 Rigidbody、Collider、Physics Material 等基础组件的使用方法，以及碰撞检测模式、Layer 碰撞矩阵和性能优化原则，帮助开发者建立完整的物理系统知识框架。

## 正文

### 背景
Unity 物理系统是游戏交互真实感的核心组件。理解其工作原理和最佳实践，能避免物理穿透、性能下降、物理不一致等常见问题。本文从基础组件到进阶技巧，系统梳理 Unity 物理系统的使用规范。

### 1. Rigidbody（刚体）组件：赋予物体物理属性

在 Unity 中，任何想要受到物理系统影响的 GameObject 都必须附加一个 **Rigidbody** 组件。Rigidbody 赋予了 GameObject 质量、速度、角速度等物理属性，并使其能够响应重力、力、碰撞等物理事件。

#### 核心属性：

- **Mass (质量)**：物体的质量，以千克（kg）为单位。质量越大，受到相同力的作用时加速度越小。
- **Drag (阻力)**：线性阻力，模拟空气阻力或液体阻力。值越大，物体运动减速越快。
- **Angular Drag (角阻力)**：角阻力，模拟物体旋转时的阻力。值越大，物体旋转减速越快。
- **Use Gravity (使用重力)**：勾选后，物体将受到 Unity 全局重力设置的影响（默认向下）。
- **Is Kinematic**：勾选后 Rigidbody 不再受物理引擎控制，需用 Transform 手动控制。运动学刚体不响应碰撞力，但会触发碰撞回调并影响其他刚体。
- **Collision Detection**：
  - **Discrete**：默认模式，每个物理步长检测一次碰撞，性能好但高速物体可能穿透
  - **Continuous**：对高速移动物体进行碰撞体扫描，防止穿透墙等静态障碍物
  - **Continuous Dynamic**：对高速物体之间也进行连续检测，性能开销最高
- **Constraints**：冻结指定轴的运动或旋转

#### 常用 API：

```csharp
// 施加力
rigidbody.AddForce(Vector3.forward * 10f, ForceMode.Force);
// ForceMode.Force - 持续力，按质量计算加速度
// ForceMode.Impulse - 冲量，直接改变速度
// ForceMode.VelocityChange - 无视质量的瞬时速度变化
// ForceMode.Acceleration - 无视质量的连续加速度

// 施加扭矩（旋转力）
rigidbody.AddTorque(Vector3.up * 5f);

// 读写速度
rigidbody.velocity = new Vector3(0, 5, 0);
float speed = rigidbody.velocity.magnitude;
```

### 2. Collider（碰撞体）组件：定义物理形状

Collider 定义了物体的物理轮廓。Unity 提供了多种碰撞体类型：

| 碰撞体类型 | 适用场景 | 性能 |
|-----------|---------|------|
| BoxCollider | 方形/矩形物体 | 极优 |
| SphereCollider | 球形物体 | 极优 |
| CapsuleCollider | 角色、柱状体 | 优秀 |
| MeshCollider | 复杂形状（静态物体） | 较差 |
| TerrainCollider | 地形 | 中等 |

**性能最佳实践**：
- 移动物体尽量使用原始碰撞体（Box/Sphere/Capsule）
- MeshCollider 的 **Convex** 勾选后性能大幅提升但形状变得不精确
- 静态物体（不移动的地形、墙壁）可使用非凸包的 MeshCollider
- 组合碰撞体：多个原始碰撞体比一个 MeshCollider 更高效

### 3. Physics Material（物理材质）

物理材质控制碰撞的摩擦和弹性：

```csharp
// 创建物理材质
PhysicMaterial mat = new PhysicMaterial();
mat.dynamicFriction = 0.4f;   // 动摩擦系数
mat.staticFriction = 0.6f;    // 静摩擦系数
mat.bounciness = 0.8f;        // 弹性（0~1）
mat.frictionCombine = PhysicMaterialCombine.Average;
mat.bounceCombine = PhysicMaterialCombine.Maximum;

// 运行时动态修改
collider.material = mat;
```

**Combine 模式**：当两个碰撞体接触时，两者的摩擦/弹性如何组合
- **Average**：取平均值（推荐默认）
- **Minimum**：取较小值（适合弹性场景）
- **Multiply**：取乘积
- **Maximum**：取较大值

### 4. 碰撞事件与触发事件

```csharp
public class CollisionExample : MonoBehaviour
{
    // 进入碰撞（接触开始）
    void OnCollisionEnter(Collision collision)
    {
        Debug.Log($"与{collision.gameObject.name}发生碰撞");
        Vector3 impactForce = collision.impulse; // 碰撞冲量
        ContactPoint contact = collision.GetContact(0);
        Debug.Log($"碰撞点: {contact.point}, 法线: {contact.normal}");
    }
    
    void OnCollisionStay(Collision collision) { }
    void OnCollisionExit(Collision collision) { }
    
    // 触发事件（Collider 勾选 IsTrigger）
    void OnTriggerEnter(Collider other) { }
    void OnTriggerStay(Collider other) { }
    void OnTriggerExit(Collider other) { }
}
```

**碰撞触发条件**：
- 两个物体都必须有 Collider
- 至少一个物体有 Rigidbody
- 触发事件要求至少一方勾选 IsTrigger

### 5. Layer Collision Matrix（层碰撞矩阵）

层碰撞矩阵是 Unity 物理最容易被忽视的性能优化手段。通过 Edit → Project Settings → Physics → Layer Collision Matrix 配置不同层之间是否产生物理交互。

**实践建议**：
- 不产生碰撞的层勾掉（如"UI"与"环境"不碰撞）
- 专为碰撞定制的层（"Player"↔"Enemy"单独控制）
- 可动态修改：`Physics.IgnoreLayerCollision("Player", "Enemy", false)`

```csharp
// 运行时临时忽略两个物体间的碰撞
Physics.IgnoreCollision(playerCollider, enemyCollider, true);

// 按层忽略碰撞
Physics.IgnoreLayerCollision(LayerMask.NameToLayer("Player"), 
                              LayerMask.NameToLayer("Pickup"), true);
```

### 6. 性能优化要点

| 优化项 | 说明 |
|-------|------|
| 减少 MeshCollider | 移动物体绝不使用非凸包 MeshCollider |
| 控制物理步长 | Fixed Timestep 默认 0.02s (50Hz)，可根据需求改为 0.03s (33Hz) |
| 用 Layer Matrix | 只让必要的层之间产生物理交互 |
| 静态碰撞体标记 | 不移动的物体标记为 Static，Unity 会合并它们的碰撞体 |
| 控制刚体数量 | 场景中活跃刚体数控制在 200 以内，超过则考虑连续物理优化 |

### 实现方案
1. **碰撞检测流程**：添加 Collider → 添加 Rigidbody → 实现 OnCollisionXXX → 测试碰撞响应
2. **调试技巧**：Scene 视图启用 Gizmos → Colliders 显示碰撞体线框，运行时用 Debug.DrawLine 可视化碰撞法线
3. **常见陷阱**：父物体+子物体刚体嵌套可能导致意外旋转；Collider 位置不由 Transform 而是由 Rigidbody 的 position 控制

### 总结
Unity 物理系统在易用性和功能性上做到了很好的平衡。掌握 Rigidbody、Collider、Physics Material 等核心组件的使用规范，理解碰撞检测模式选择和 Layer 碰撞矩阵的配置，就能在大多数游戏项目中构建可靠的物理交互。对于高性能或特殊需求的场景，后续章节将深入手写物理系统和自定义碰撞解决方案。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** 物理系统
- **标签：** 物理系统、Rigidbody、Collider、Physics Material、碰撞检测、Unity
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
