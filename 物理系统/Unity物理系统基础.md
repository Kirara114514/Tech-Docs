# Unity物理系统基础

## 摘要
Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。 在 Unity 中，任何想要受到物理系统影响的 GameObject 都必须附加一个 **Rig

## 正文

### 背景
Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

### 核心内容
Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

----------

### 1. Rigidbody（刚体）组件：赋予物体物理属性

在 Unity 中，任何想要受到物理系统影响的 GameObject 都必须附加一个 **Rigidbody** 组件。Rigidbody 赋予了 GameObject 质量、速度、角速度等物理属性，并使其能够响应重力、力、碰撞等物理事件。

#### 核心属性：

-   **Mass (质量)**：物体的质量，以千克（kg）为单位。质量越大，受到相同力的作用时加速度越小。
    
-   **Drag (阻力)**：线性阻力，模拟空气阻力或液体阻力。值越大，物体运动减速越快。
    
-   **Angular Drag (角阻力)**：角阻力，模拟物体旋转时的阻力。值越大，物体旋转减速越快。
    
-   **Use Gravity (使用重力)**：勾选后，物体将受到 Unity 全局重力设置的影响（默认向下）。
    
-   **Is Kinematic (是否运动学)**：
    
    -   如果勾选，Rigidbody 将不再受物理引擎控制，你需要通过代码（`Transform.position` 或 `Transform.rotation`）手动控制它的位置和旋转。运动学刚体通常用于门、电梯等受脚本控制的物体。
        
    -   **重要提示：** 运动学刚体不会受到碰撞影响而移动或旋转，但它仍然可以影响其他非运动学刚体，并且会触发碰撞回调。
        
-   **Collision Detection (碰撞检测模式)**：
    
    -   **Discrete (离散)**：默认模式，在每个物理步长（FixedUpdate）只检测一次碰撞。适用于大多数情况，性能开销低，但高速移动的物体可能会“穿透”其他物体。
        
    -   **Continuous (连续)**：适用于高速移动的物体，会进行更频繁的检测以防止穿透。性能开销比 Discrete 高。
        
    -   **Continuous Dynamic (连续动态)**：适用于高速移动且**相互之间**都需要进行连续碰撞检测的 Rigidbody。性能开销最高。
        
-   **Constraints (约束)**：可以冻结刚体的特定轴向上的位置或旋转，例如，只允许物体在 X 轴上移动，或者不允许它旋转。
    

#### 常用操作：

-   **`Rigidbody.AddForce(Vector3 force, ForceMode mode = ForceMode.Force)`**：给刚体施加一个力。
    
    -   `ForceMode.Force`: 持续力，以物体的质量计算加速度。
        
    -   `ForceMode.Impulse`: 瞬间冲量，不考虑时间，直接改变物体的速度。常用于爆炸或打击效果。
        
    -   `ForceMode.VelocityChange`: 瞬间速度变化，忽略质量。
        
    -   `ForceMode.Acceleration`: 持续加速度，忽略质量。
        
-   **`Rigidbody.AddTorque(Vector3 torque, ForceMode mode = ForceMode.Force)`**：给刚体施加一个扭矩，使其旋转。
    
-   **`Rigidbody.velocity`**: 获取或设置刚体的线性速度。
    
-   **`Rigidbody.angularVelocity`**: 获取或设置刚体的角速度。
    

C#

```
using UnityEngine;

public class BallController : MonoBehaviour
{
    public float moveForce = 10f;
    public float jumpForce = 5f;
    private Rigidbody rb;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
    }

    void FixedUpdate() // 物理计算应该在 FixedUpdate 中进行
    {
        // 施加持续力，模拟移动
        if (Input.GetKey(KeyCode.W))
        {
            rb.AddForce(Vector3.forward * moveForce, ForceMode.Force);
        }
        if (Input.GetKey(KeyCode.S))
        {
            rb.AddForce(Vector3.back * moveForce, ForceMode.Force);
        }

        // 施加瞬间冲量，模拟跳跃
        if (Input.GetKeyDown(KeyCode.Space))
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.Impulse);
        }
    }
}

```

----------

### 2. Collider（碰撞体）组件：定义物体的形状

**Collider** 组件定义了 GameObject 在物理世界中的形状，用于检测与其他物体的碰撞。没有 Collider 的 Rigidbody 无法与其他物体发生物理交互（除了重力）。

#### 常见碰撞体类型：

-   **Box Collider (盒碰撞体)**：最常用的碰撞体，适用于立方体、矩形等规则形状。性能开销低。
    
-   **Sphere Collider (球碰撞体)**：适用于球体或近似球体的物体。性能开销低。
    
-   **Capsule Collider (胶囊碰撞体)**：适用于人物角色、圆柱体等。性能开销低。
    
-   **Mesh Collider (网格碰撞体)**：
    
    -   使用物体的网格数据作为碰撞形状。
        
    -   **优点：** 可以完美匹配复杂模型的形状。
        
    -   **缺点：** 性能开销高，特别是对于高多边形模型。
        
    -   **Convex (凸包)** 选项：勾选后，Mesh Collider 将创建一个**凸包**形状作为碰撞体。凸包的性能远高于非凸包，并且可以与其他 Mesh Collider 发生碰撞。非凸包 Mesh Collider 只能与 Box、Sphere、Capsule 等原始碰撞体碰撞，不能与其他非凸包 Mesh Collider 碰撞。
        
    -   通常不建议用于移动的 Rigidbody，除非设置为 Convex。
        
-   **Terrain Collider (地形碰撞体)**：专门用于 Unity 地形系统，自动与地形的形状匹配。
    

#### 核心属性：

-   **Is Trigger (是否触发器)**：
    
    -   如果勾选，这个 Collider 将不会产生物理碰撞响应（如反弹、滑动），而是仅仅检测到与其他 Collider 的**重叠**。
        
    -   触发器常用于检测区域进入/离开，例如，当玩家进入一个区域时触发剧情或打开门。
        
    -   两个触发器之间不会产生碰撞回调，除非其中一个至少带有 Rigidbody。
        
    -   一个触发器和一个非触发器 Collider 之间的交互会触发回调。
        
-   **Material (物理材质)**：关联一个 Physic Material（详见下一节）。
    

**最佳实践：** 尽量使用简单的原始碰撞体（Box、Sphere、Capsule）组合来近似复杂模型的形状，而不是直接使用 Mesh Collider，以获得更好的性能。

----------

### 3. Physic Material（物理材质）：定义交互特性

**Physic Material** 是一种资源（Asset），用于定义碰撞体之间的摩擦力和弹性（弹跳）。你可以创建不同的物理材质并将其分配给 Collider 组件。

#### 核心属性：

-   **Dynamic Friction (动态摩擦)**：当物体相对运动时产生的摩擦力。
    
-   **Static Friction (静态摩擦)**：当物体静止时抵抗初始运动的摩擦力。通常应该略高于 Dynamic Friction。
    
-   **Bounciness (弹跳)**：物体的弹性，0 表示完全不弹跳，1 表示完全弹性碰撞。
    
-   **Friction Combine (摩擦组合模式)**：
    
    -   **Average (平均)**：取两个碰撞体物理材质的摩擦力平均值。
        
    -   **Minimum (最小)**：取两个碰撞体物理材质摩擦力的最小值。
        
    -   **Maximum (最大)**：取两个碰撞体物理材质摩擦力的最大值。
        
    -   **Multiply (相乘)**：取两个碰撞体物理材质摩擦力的乘积。
        
-   **Bounce Combine (弹跳组合模式)**：同 Friction Combine，但作用于弹跳。
    

创建和使用：

在 Project 窗口右键 -> Create -> Physic Material，然后调整其属性，并将其拖拽到 Collider 组件的 "Material" 字段上。

----------

### 4. 触发器与碰撞回调：响应物理事件

当 Rigidbody 与 Collider 发生交互时，Unity 会调用特定的回调函数。理解这些回调函数是实现游戏逻辑的关键。

#### 碰撞回调 (Collision Callbacks)：

适用于两个非触发器 Collider（至少一个带 Rigidbody）之间的物理碰撞。

-   **`OnCollisionEnter(Collision collision)`**：当物体开始与其他物体碰撞时调用一次。
    
    -   `collision` 参数包含了碰撞的详细信息，如碰撞点 (`collision.contacts`)、碰撞法线 (`collision.contacts[0].normal`)、对方的 GameObject (`collision.gameObject`) 和 Rigidbody (`collision.rigidbody`) 等。
        
-   **`OnCollisionStay(Collision collision)`**：当物体持续与其他物体碰撞时，每物理帧调用一次。
    
-   **`OnCollisionExit(Collision collision)`**：当物体停止与其他物体碰撞时调用一次。
    

#### 触发器回调 (Trigger Callbacks)：

适用于至少有一个 Collider 设置为 `Is Trigger` 的情况下，检测到物体进入/离开/停留在区域内。

-   **`OnTriggerEnter(Collider other)`**：当物体开始进入触发器区域时调用一次。
    
    -   `other` 参数是进入或离开触发器区域的 Collider。
        
-   **`OnTriggerStay(Collider other)`**：当物体持续停留在触发器区域内时，每物理帧调用一次。
    
-   **`OnTriggerExit(Collider other)`**：当物体离开触发器区域时调用一次。
    

**重要规则：**

-   只有当一个 Collider 附加了 Rigidbody，或者它是一个 Kinematic Rigidbody 上的 Collider 时，它才能接收到碰撞/触发器回调。
    
-   **注意：** 如果是静态（不带 Rigidbody）的 Collider 之间发生碰撞，虽然物理系统会处理它们之间的交互，但不会调用任何回调函数。
    

C#

```
using UnityEngine;

public class CollisionDetector : MonoBehaviour
{
    // 当发生碰撞时
    void OnCollisionEnter(Collision collision)
    {
        Debug.Log("OnCollisionEnter: " + gameObject.name + " 撞到了 " + collision.gameObject.name);
        // 可以在这里获取碰撞点、法线等信息
        foreach (ContactPoint contact in collision.contacts)
        {
            Debug.Log("碰撞点: " + contact.point + ", 法线: " + contact.normal);
        }
    }

    // 当进入触发器区域时
    void OnTriggerEnter(Collider other)
    {
        Debug.Log("OnTriggerEnter: " + gameObject.name + " 进入了触发器区域 " + other.gameObject.name);
        if (other.CompareTag("Collectible")) // 假设我们有一个Tag为"Collectible"的物体
        {
            Debug.Log("拾取了物品！");
            Destroy(other.gameObject); // 销毁被拾取的物品
        }
    }
}

```

----------

### 5. 射线检测（Raycast）与形状检测：非碰撞交互

除了碰撞体之间的物理交互，Unity 也提供了用于检测特定方向或形状是否存在物体的 API，这在很多游戏逻辑中非常有用，例如射击游戏中的子弹检测、角色控制器中的地面检测等。

#### 射线检测 (Raycast)：

从一个点发射一条射线，检测是否击中物体。

-   **`Physics.Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo, float maxDistance)`**：
    
    -   `origin`: 射线的起点。
        
    -   `direction`: 射线的方向。
        
    -   `hitInfo`: 一个 `RaycastHit` 结构体，用于存储击中物体的信息（如击中点、法线、被击中的 Collider 和 GameObject 等）。
        
    -   `maxDistance`: 射线的最大检测距离。
        
-   还可以指定 `LayerMask` 来过滤检测的层级。
    

C#

```
using UnityEngine;

public class RaycastExample : MonoBehaviour
{
    public LayerMask hitLayer; // 设置一个层级，只检测这个层级的物体

    void Update()
    {
        // 从摄像机向鼠标点击位置发射射线
        if (Input.GetMouseButtonDown(0))
        {
            Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
            RaycastHit hit;

            if (Physics.Raycast(ray, out hit, 100f, hitLayer)) // 检测最远100米，只检测hitLayer层的物体
            {
                Debug.Log("射线击中了: " + hit.collider.gameObject.name + " 在位置: " + hit.point);
                // 可以在这里对被击中的物体进行操作
                hit.collider.gameObject.GetComponent<Renderer>().material.color = Color.red;
            }
            else
            {
                Debug.Log("射线未击中任何物体。");
            }
        }
    }
}

```

#### 形状检测 (Shape Cast)：

除了射线，你还可以发射一个球体、胶囊体或盒子来检测是否与场景中的 Collider 发生重叠或碰撞。这比 Raycast 更适合检测更大范围的障碍物。

-   **`Physics.SphereCast(Vector3 origin, float radius, Vector3 direction, out RaycastHit hitInfo, float maxDistance, LayerMask layerMask)`**：发射一个球体。
    
-   **`Physics.BoxCast(Vector3 center, Vector3 halfExtents, Vector3 direction, out RaycastHit hitInfo, Quaternion orientation, float maxDistance, LayerMask layerMask)`**：发射一个盒子。
    
-   **`Physics.CapsuleCast(...)`**：发射一个胶囊体。
    

这些方法与 `Raycast` 类似，只是将线替换成了对应的形状，用于更精确或范围更大的检测。

----------

-   **Rigidbody** 是物体参与物理模拟的必备组件。
    
-   **Collider** 定义了物体的碰撞形状。
    
-   **Physic Material** 决定了碰撞时的摩擦和弹跳特性。
    
-   **碰撞回调和触发器回调** 让你能够响应物理事件并执行游戏逻辑。
    
-   **射线检测和形状检测** 提供了在不发生物理交互的情况下查询物理世界的能力。
    

熟练运用这些基础功能，你就能在 Unity 中构建出丰富多样的物理交互和游戏玩法。在下一篇文章中我们将进入更深层次的探索，了解如何利用高级特性实现复杂交互，并关注性能优化，让你的物理模拟既强大又流畅！

### 总结\n本文全面介绍了Unity物理系统的基础概念与应用方法。通过系统讲解刚体、碰撞器、关节等核心组件的工作原理和使用技巧，帮助开发者掌握物理交互的基本原理。文章涵盖了物理材质、图层管理和碰撞检测等关键话题，为构建真实可信的游戏物理效果提供了基础指导。本文是深入理解Unity物理系统的起点。

- **创建时间：** 2026-04-12 23:47
- **最后更新：** 2026-04-12 23:47
- **作者：** 吉良吉影
- **分类：** 物理系统
- **标签：** 物理系统, Unity, 游戏开发, 物理引擎
- **来源：** StackEdit导出文档

---
*文档基于与吉良吉影的讨论，由小雅整理*

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

-   **Use Gravity (使用重力)**：勾选后，物体将受到 Unity 全局重力设置的影响（默认向下）。

-   如果勾选，Rigidbody 将不再受物理引擎控制，你需要通过代码（`Transform.position` 或 `Transform.rotation`）手动控制它的位置和旋转。运动学刚体通常用于门、电梯等受脚本控制的物体。

--- *文档基于与吉良吉影的讨论，由小雅整理*

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

--- *文档基于与吉良吉影的讨论，由小雅整理*

### 实现方案
Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

Unity物理系统是游戏交互和真实感的核心组件，但许多开发者仅停留在表面使用。本文作为物理系统系列的开篇，系统介绍Unity物理系统的基础概念与应用场景，帮助开发者深入理解物理模拟的工作原理和实际应用。

Unity 引擎内置了一套强大且易用的物理系统，它基于 NVIDIA 的 PhysX 物理引擎。这个系统能让你在游戏中模拟真实的物理效果，比如重力、碰撞、摩擦、弹跳等，极大地提升游戏的沉浸感和交互性。本篇教程将带你了解 Unity 物理系统的核心组件和常用 API，让你能够快速地在项目中应用物理效果。

### 总结
--- *文档基于与吉良吉影的讨论，由小雅整理*

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-20 21:05
- **作者：** 吉良吉影
- **分类：** 物理系统
- **标签：** 物理系统、Unity物理系统基础、Unity
- **来源：** 已有文稿整理

---
*文档基于与吉良吉影的讨论，由小雅整理*
