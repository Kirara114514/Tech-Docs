# Lua 与 UnLua 核心机制讲解

## 摘要

在 Unreal Engine（UE）客户端开发岗位的面试中，Lua 与 UnLua 通常不是被当作"会不会用某门脚本语言"来考，而是沿着一条完整的技术链被逐层追问：table 与元表 → 类与实例 → 闭包与模块 → Lua GC → UObject 生命周期 → 反射绑定 → UFunction 参数编组 → 委托与协程 → 热更新 → 性能与工程化。这条链的每一环都同时涉及 Lua 语言本身的语义与 UE 引擎的运行时机制，回答质量直接反映候选人是否真正用 Lua 写过 UE 游戏逻辑，而不只是背过语法。

本文按面试出现频率从高到低，将全部知识点整理为十二个梯队：前三梯队覆盖必须倒背如流的 Lua 语言基础、UnLua 工作原理、双 GC 与生命周期；中间梯队深入 UFUNCTION 参数映射、委托协程、热重载与性能；后段覆盖 Lua C API、网络输入动画、线程与多 VM、调试打包安全。文末附 18 条高频快问快答、五个"最值钱"的完整回答与一张知识树，适合作为面试前系统复习与查漏补缺的清单。全部代码示例基于 Unreal Engine 5 与 UnLua 2.2+ 的现代用法；文中对 Lua 5.1 与 5.4 的差异、int64 精度、委托安全调用等高频坑做了专门补充。

## 正文

### 背景

游戏客户端技术栈中，"Lua + 引擎"的组合由来已久。Lua 体积小、嵌入成本低、热更新灵活，长期被国内游戏团队用作业务逻辑层的主力脚本；而在 Unreal Engine 项目中，UnLua 作为桥接 Lua 虚拟机（Lua VM）与 UE 反射系统的插件，让团队可以在不手写胶水代码的情况下用 Lua 访问 UCLASS、UPROPERTY、UFUNCTION、USTRUCT、UENUM，覆写蓝图事件，甚至通过静态导出接触非反射 C++ 类型。

面试官之所以喜欢沿着"table → 元表 → 类 → GC → 生命周期 → 反射 → 参数 → 委托协程 → 热更 → 性能"这条链追问，是因为它恰好覆盖了一个 UE Lua 客户端工程师日常工作中最常踩坑、也最能体现工程判断力的十个断面。只答语法不答工程，只能证明"会写脚本"；能把每条语法规则联系到 UE 运行时、GC 边界和热更实践，才能证明"能写游戏"。

阅读本文前需要明确几个背景前提：

- **版本口径：** 默认讨论 Unreal Engine 5 与 UnLua 2.2+ 的现代用法。UnLua 2.0 曾升级到 Lua 5.4.2，后续又支持自定义 Lua 版本，所以面试时不要武断断言某个项目一定使用某个精确的 Lua 小版本，应当先看插件分支和配置。官方 README 当前标明支持 UE 4.17.x 到 UE 5.x。
- **面试定位：** 本文是面试复习清单，不是官方文档。每个问题给出"标准回答思路 + 高频陷阱 + 面试标准句"，用于帮助组织语言，而不是替代对源码和官方文档的阅读。
- **术语约定：** UE 指 Unreal Engine；UnLua 指在 UE 中嵌入 Lua 的第三方桥接插件；UCLASS/UPROPERTY/UFUNCTION/USTRUCT/UENUM 是 UE 的反射宏；UObject 是 UE 所有运行时对象的基类；GC 指垃圾回收（Garbage Collection）。

### 核心内容

#### 第一梯队：语言基础，必须倒背如流

这一梯队是整条知识链的地基。面试官默认你完全掌握，答错任何一个都会让后面的追问失去意义。

##### 1. Lua 有哪些基本类型？

Lua 5.4 有八种基本类型：

nil、boolean、number、string、function、userdata、thread、table。

关键点：

- 变量本身没有类型，值才有类型。
- 只有 false 和 nil 是假值。
- 0、""、空 table 都是真值。
- string 是不可变字节序列。
- table 是 Lua 唯一的原生复合数据结构。
- thread 指 Lua coroutine，不是操作系统线程。
- userdata 用于承载 C/C++ 世界里的数据或指针。

高频陷阱：

```lua
if 0 then
    print("会执行")
end

if "" then
    print("也会执行")
end
```

Lua 里的伪三目：

```lua
local value = condition and a or b
```

当 a == false 或 a == nil 时会错误地返回 b，因此它不是严格意义上的三目运算符。面试时如果能主动补一句"所以 `and/or` 做三目在右值可能为假时不可靠"，会显得对语义边界有意识。

##### 2. table 是什么？底层是数组还是哈希表？

标准回答：

> table 是 Lua 唯一的复合数据结构，既能表达数组，也能表达字典、对象、集合、图和类。实现层面通常具有数组部分和哈希部分，但语言层不保证具体内部布局。

```lua
local t = {
    [1] = "A",
    [2] = "B",
    Name = "Player",
}

print(t.Name)       -- 等价于 t["Name"]
print(t[1])
```

table 是引用语义：

```lua
local a = { HP = 100 }
local b = a
b.HP = 50

print(a.HP) -- 50
```

nil 的特殊意义：给 table 字段赋 nil，相当于删除键。因此 Lua table 无法直接区分"这个键不存在"和"这个键存在、值是 nil"。业务上需要第三态时，通常使用哨兵对象：

```lua
local NIL_VALUE = {}

t.Value = NIL_VALUE
```

##### 3. 为什么 #table 不可靠？

`#t` 对连续序列比较可靠：

```lua
local t = { 10, 20, 30 }
print(#t) -- 3
```

但有洞时（存在空洞键）结果不可依赖：

```lua
local t = {
    [1] = 10,
    [3] = 30,
}
```

此时 `#t` 返回 table 的某个"边界"，结果不应该被业务代码依赖。Lua 官方只保证无洞序列存在唯一边界；有洞 table 可能存在多个边界。

面试标准回答：

> #t 不等于"table 中键值对数量"。如果是字典，需要用 pairs 自己计数；如果是数组，应维护连续性或显式维护 count。

##### 4. table.sort 的稳定性与排序回调中改表的坑

table.sort 是高频工具，但有两个经典坑，面试中常以"排序有没有坑"的追问形式出现。

**稳定性：** Lua 5.4 起 table.sort 是稳定排序（相等元素保持原有相对顺序）；Lua 5.1~5.3 的 table.sort 不保证稳定。因此，如果项目老代码依赖排序稳定性，从旧版本 Lua 迁移到 5.4 通常没问题，但反过来把"5.4 稳定"当成所有 Lua 版本的默认行为则是错的。面试标准句：

> 稳定性的判断要跟着 Lua 版本走：5.4 保证稳定，5.1~5.3 不保证；依赖顺序的业务必须显式附带次要键比较。

**排序回调中改表：** comparator（比较器）在排序过程中修改被排序的 table（增删元素）属于未定义行为，轻则结果错误，重则崩溃。正确写法是"比较器只读，绝不写"：

```lua
-- 错误：比较器里修改表
table.sort(t, function(a, b)
    t[#t + 1] = a -- 排序过程中改表，未定义行为
    return a < b
end)

-- 正确：比较器只读
table.sort(t, function(a, b)
    return a.score > b.score
end)
```

另一个常见崩溃源是比较器不满足"严格弱序"——例如对相等元素返回 true。相等时应当返回 false，否则排序可能陷入无限循环或产生非法结果。工程上若要"按字段排序后取前 N"，应先把排序结果复制出来再处理，避免与后续增删逻辑纠缠。

##### 5. pairs 和 ipairs 有什么区别？

pairs 遍历所有键值，顺序未定义：

```lua
for k, v in pairs(t) do
end
```

不能依赖它的遍历顺序，也不能默认它按插入顺序或数字顺序。

ipairs 从整数键 1 开始递增，在第一个 nil 处停止：

```lua
local t = { 10, 20, nil, 40 }

for i, v in ipairs(t) do
    print(i, v)
end

-- 只打印 1、2
```

UnLua 特别注意：Lua table 通常按 1 起始设计数组，但 UnLua 暴露的 TArray 是 UE 容器包装，不要把它当 Lua table。官方示例使用 Remove(0)，后续版本也让 [] 等价于 Get/Set，实际项目中应始终按 UnLua 当前版本的 TArray 接口和 UE 索引语义使用。

##### 6. Lua 是怎么实现"类"的？

Lua 没有原生 class 关键字。所谓类通常由 table、metatable、__index、函数、约定组合而成：

```lua
local Character = {}
Character.__index = Character

function Character.New(name)
    local obj = {
        Name = name,
        HP = 100,
    }

    setmetatable(obj, Character)
    return obj
end

function Character:TakeDamage(damage)
    self.HP = self.HP - damage
end

local player = Character.New("Hero")
player:TakeDamage(20)
```

查询 player.TakeDamage 时：

1. 先在 player 自身查找。
2. 找不到，检查 metatable。
3. metatable 的 __index 是 Character。
4. 去 Character 中查找。

这套"元表 + __index 回退"的机制就是 Lua 模拟继承和方法的本质。

##### 7. __index 和 __newindex

__index：当读取不存在的字段时触发。可以是 table：

```lua
setmetatable(obj, {
    __index = ClassTable
})
```

也可以是函数：

```lua
setmetatable(obj, {
    __index = function(self, key)
        print("读取字段", key)
        return nil
    end
})
```

__newindex：通常在向一个当前不存在的键赋值时触发：

```lua
setmetatable(obj, {
    __newindex = function(self, key, value)
        print("写字段", key, value)
        rawset(self, key, value)
    end
})
```

为什么必须知道 rawget/rawset？因为元方法内部再次执行普通索引可能递归：

```lua
__newindex = function(self, key, value)
    self[key] = value -- 再触发 __newindex，可能无限递归
end
```

正确方式：

```lua
rawset(self, key, value)
```

rawget、rawset 会绕过元方法。这是写元表逻辑时最容易递归爆栈的地方，也是面试官验证"是否真写过元表"的试金石。

##### 8. : 和 . 有什么区别？

`obj:Foo(10)` 等价于 `obj.Foo(obj, 10)`。

函数定义 `function M:Foo(x) end` 等价于 `function M.Foo(self, x) end`。

Lua 官方明确把冒号语法定义为自动添加一个 self 参数。

典型错误：

```lua
function M.Foo(value)
end

self:Foo(100)
```

实际参数变成 `M.Foo(self, 100)`，所以 value 收到的是 self。

反过来：

```lua
function M:Foo(value)
end

self.Foo(100)
```

此时 self 收到 100，value 是 nil。

UnLua 常见崩点：调用 UFUNCTION 时也要分清实例函数和静态函数：

```lua
-- 实例 UFUNCTION
self:SetActorHiddenInGame(true)

-- Blueprint Function Library 静态函数
UE.UGameplayStatics.GetPlayerCharacter(self, 0)
```

##### 9. Lua 多返回值有什么规则？

```lua
local function GetValues()
    return 1, 2, 3
end

local a, b, c = GetValues()
-- 1, 2, 3
```

但多返回值只有在"表达式列表最后一个位置"时才完整展开：

```lua
local a, b, c = GetValues(), 10
-- a = 1, b = 10, c = nil

local t1 = { GetValues() }
-- {1, 2, 3}

local t2 = { GetValues(), 10 }
-- {1, 10}
```

括号会强制只取第一个返回值：

```lua
local a, b = (GetValues())
-- a = 1, b = nil
```

Lua 官方将函数调用和 ... 称为多结果表达式，并规定只有位于列表末尾时才展开所有结果。这和 UnLua 的 ReturnValue + Out 参数映射高度相关，后面会专门讲。

##### 10. 闭包和 upvalue 是什么？

闭包就是：函数加上它捕获的外部词法环境。

```lua
local function CreateCounter()
    local count = 0

    return function()
        count = count + 1
        return count
    end
end

local counter = CreateCounter()

print(counter()) -- 1
print(counter()) -- 2
```

count 是闭包的 upvalue。

捕获的是值还是变量？更准确地说，捕获的是一个可共享的变量单元，而不是简单拷贝当前值：

```lua
local value = 10

local function Get()
    return value
end

value = 20

print(Get()) -- 20
```

多个闭包可以共享同一个 upvalue。

**闭包为什么会产生"内存泄漏"？** GC 语言中的内存泄漏通常不是"忘了 free"，而是"对象已经没用了，但仍然可以从 GC Root 到达"。常见引用链：

```text
全局 table
  → 委托回调
    → closure
      → upvalue
        → 巨大配置表 / UObject代理 / UI数据
```

例如：

```lua
local hugeData = LoadHugeData()

self.Button.OnClicked:Add(self, function()
    PrintData(hugeData)
end)
```

只要委托持有闭包，hugeData 就仍然可达。在 UnLua 中还要同时考虑委托注册表、Lua registry 和 UObject 生命周期。

##### 11. UnLua 模块的标准结构

现代 UnLua 模板大致是：

```lua
---@type BP_MyActor_C
local M = UnLua.Class()

function M:Initialize(Initializer)
    self.HP = 100
    self.Targets = {}
end

function M:ReceiveBeginPlay()
end

function M:ReceiveEndPlay(EndPlayReason)
end

return M
```

官方示例也使用 `local M = UnLua.Class()`，并把方法放在模块表 M 上。

模块表和实例表的区别：通常 M 放类级别的方法和共享字段，self 放当前绑定 UObject 实例对应的 Lua 实例状态。

错误写法：

```lua
local M = UnLua.Class()

M.Targets = {} -- 所有实例共享
```

正确写法：

```lua
function M:Initialize()
    self.Targets = {} -- 每个实例独立
end
```

什么字段应该放 M？适合放：方法、常量、无状态工具函数、明确设计成类共享的数据。不适合放：角色当前血量、Widget 引用、当前 Target、每个实例自己的 timer、每个实例自己的数组。

##### 12. require 是怎么工作的？

标准 Lua 中：

1. 查询 package.loaded[moduleName]。
2. 已加载则直接返回缓存。
3. 未加载则通过 package.searchers 查找 loader。
4. 执行模块。
5. 缓存模块返回值。
6. 模块没有返回非 nil 值时，通常在 package.loaded 中记录 true。

```lua
local Config = require "Game.Config"
```

模块推荐写法：

```lua
local M = {}

function M.DoSomething()
end

return M
```

循环 require（A require B，B require A）可能得到：未完全初始化的模块、true、nil 字段、初始化顺序问题。解决思路：拆分公共依赖、延迟 require、避免模块加载阶段执行大量业务逻辑、用依赖注入代替相互 require。

##### 13. Lua 5.1 与 5.4 的版本差异（补充）

老项目迁移、LuaJIT 与标准 Lua 切换、以及面试中"你们项目用的哪个版本"的追问，都要求对版本差异有清晰认知。四个最常考的点：

**环境模型：** 5.1 用 setfenv/getfenv 设置函数环境；5.2 起改为词法作用域变量 _ENV。5.2+ 中 `_ENV` 只是第一个 upvalue，加载 chunk 时可指定环境，这也是做 Lua 沙箱的基础。老代码里大量 setfenv 的写法迁移到 5.4 需要重写。

**整数除法：** 5.3 起 number 区分整数子类型与浮点，并新增整除运算符 `//`。5.1 中 `10 / 3` 就是浮点 3.333...，没有整除概念；迁移后 `10 / 3` 在 5.4 仍为浮点（除非用 `//`），而整数运算在 5.3+ 有 64 位整数精度。依赖浮点除法的老逻辑通常不受影响，但"想要整数结果"的写法要显式用 `//` 或 math.floor。

**位运算：** 5.3 起原生支持 `& | ~ << >>` 位运算符；5.1/LuaJIT 需要 bit 库（LuaJIT 的 bit 或第三方实现）。迁移老代码时位操作要替换 API。

**<close> 属性：** 5.4 引入 to-be-closed 变量，作用域结束自动调用其 __close 元方法，类似 RAII/作用域退出清理：

```lua
local f <close> = OpenFile()
-- 离开作用域时自动 f:close()
```

适合文件句柄、锁、临时资源。面试标准句：

> 版本迁移四个重点：setfenv 换 _ENV、新增 // 与位运算符、<close> 资源管理、以及 number 的整数子类型语义。

UnLua 与版本的关系：UnLua 2.0 曾升级到 Lua 5.4.2，后续支持自定义 Lua 版本，所以项目实际用的 Lua 版本取决于插件分支与配置，不能一概而论。

#### 第二梯队：UnLua 工作原理

这一梯队考察"Lua 是怎么和 UE 打通的"。会背 Lua 语法只能过第一梯队，能讲清桥接原理才能证明做过 UE Lua 开发。

##### 14. UnLua 主要解决了什么？

UnLua 提供的核心能力包括：

- 无需为每个类型手写胶水代码，即可访问 UCLASS、UPROPERTY、UFUNCTION、USTRUCT、UENUM。
- Lua 覆写 BlueprintEvent。
- 覆写 RepNotify、AnimNotify、输入事件。
- Lua coroutine 中调用 Latent Function。
- TArray、TSet、TMap 包装访问。
- 对非反射 C++ 类型进行静态导出。
- 对 UFUNCTION 调用做参数缓冲、参数传递和返回值处理优化。

一句话总结：

> UnLua 是一层围绕 UE 反射系统、Lua VM、对象注册表、函数描述和参数编组构建的运行时桥梁。

##### 15. 静态绑定和动态绑定

静态绑定：C++ 类或蓝图实现 UnLuaInterface，通过 GetModuleName 返回 Lua 模块路径，例如 `Gameplay.Player.BP_Player_C`。路径相对于 Content/Script：`Content/Script/Gameplay/Player/BP_Player_C.lua` 对应 `Gameplay.Player.BP_Player_C`。

动态绑定：适合运行时 Spawn 的对象：

```lua
local Actor = World:SpawnActor(
    ActorClass,
    Transform,
    CollisionHandling,
    Owner,
    Instigator,
    "Gameplay.Projectile.BP_Projectile_C"
)
```

或者：

```lua
local Object = NewObject(
    ObjectClass,
    Outer,
    nil,
    "Gameplay.Objects.ProxyObject"
)
```

这两种绑定方式及模块路径规则都在官方编程指南中明确给出。面试被问到时，把"静态绑定走 UnLuaInterface/GetModuleName，动态绑定在 Spawn/NewObject 时传模块路径"讲清楚即可。

##### 16. Lua 调用 UE 函数时发生了什么？

从业务视角看 `self:SetActorLocation(Location)`，底层概念流程可以理解为：

1. Lua 查找 SetActorLocation 字段。
2. UnLua 根据 UObject 类型查询 UFunction 描述。
3. 生成或复用一个 Lua C Closure。
4. 检查并编组 Lua 参数。
5. 构造 UFunction 参数内存。
6. 调用引擎函数。
7. 读取 ReturnValue / Out 参数。
8. 转换并压回 Lua 栈。

UnLua 源码中，反射字段被解析后，普通 UFUNCTION 会被包装为 Class_CallUFunction 闭包，Latent Function 会包装为对应的 latent closure；官方也说明其 UFUNCTION 优化包含持久参数缓冲、本地函数调用、参数传递和输出值处理。

为什么首次调用可能更贵？首次访问某个类型或字段时，往往需要：查找 UClass/UFunction、建立类型描述、创建 metatable 或闭包、缓存函数描述。后续通常能复用缓存。

##### 17. UE.UClassName 为什么能直接访问？

UE 是一个全局命名空间 table。访问 `UE.AActor`、`UE.FVector`、`UE.UGameplayStatics`、`UE.ECollisionEnabled` 时，UnLua 会通过 UE 的索引逻辑懒加载和注册原生反射类型。源码逻辑会根据前缀识别：U / A / F → 类或结构，E → 枚举。

对于蓝图类型，不能单纯依赖 `UE.ABP_MyActor_C`，而应该显式加载：

```lua
local Class = UE.UClass.Load(
    "/Game/Path/BP_MyActor.BP_MyActor_C"
)
```

UnLua 的 UE_Index 源码明确区分原生类型和蓝图类型，并建议蓝图类型通过 UClass.Load 或 UObject.Load 加载。

##### 18. Lua 覆写 UE 函数时发生了什么？

假设 C++：

```cpp
UFUNCTION(BlueprintNativeEvent)
void OnAttack();
```

Lua：

```lua
function M:OnAttack()
    print("Lua OnAttack")
end
```

概念流程：

```text
UE/蓝图发起 UFunction 调用
        ↓
UnLua 找到当前 UObject 对应的 Lua 绑定实例
        ↓
按函数名查找 Lua 实现
        ↓
压入 self 与 UE 参数
        ↓
保护调用 Lua 函数
        ↓
读取 Lua 返回值
        ↓
回填 ReturnValue 与 Out 参数
```

UnLua 支持覆写：BlueprintImplementableEvent、BlueprintNativeEvent、蓝图中定义的事件和函数、AnimNotify、RepNotify、输入事件。官方文档也支持通过 self.Overridden 调用原实现。

##### 19. BlueprintNativeEvent 与 BlueprintImplementableEvent 的覆写区别（补充）

这是 UE 蓝图/C++ 协作的高频追问，Lua 覆写时同样要区分：

- **BlueprintImplementableEvent：** C++ 侧只有声明，没有默认实现；逻辑必须由蓝图（或 Lua）提供。因为不存在"默认实现"，覆写后没有"调用父类"的语义。
- **BlueprintNativeEvent：** C++ 侧提供默认实现（函数名加 `_Implementation` 后缀，如 `OnAttack_Implementation`）；蓝图或 Lua 可以覆写它，覆写后仍可调用默认实现（蓝图里 Call Parent Function，UnLua 里通过 self.Overridden 调用原实现）。

C++ 代码里看到 `void Func_Implementation()` 这类带后缀的函数，就是 BlueprintNativeEvent 的默认实现入口。Lua 侧两者都能覆写，区别在于"是否有默认实现可回退"：

```lua
-- BlueprintNativeEvent 覆写后仍想执行 C++ 默认逻辑
function M:OnAttack()
    print("Lua 前置逻辑")
    self.Overridden.OnAttack(self) -- 调用默认实现
    print("Lua 后置逻辑")
end

-- BlueprintImplementableEvent 没有默认实现，只有覆写
function M:OnSomethingHappened()
    print("只有这一份实现")
end
```

面试标准句：

> ImplementableEvent 是"必须实现"，NativeEvent 是"默认有实现、可选覆写、覆写后可回退到默认实现"。

##### 20. 如何调用被 Lua 覆写前的原函数？

```lua
function M:ReceiveBeginPlay()
    print("Lua before")

    self.Overridden.ReceiveBeginPlay(self)

    print("Lua after")
end
```

注意它不是普通冒号调用，而是显式传 self。为什么不能这样写：

```lua
function M:ReceiveBeginPlay()
    self:ReceiveBeginPlay()
end
```

这会再次进入 Lua 覆写，造成无限递归。

##### 21. Initialize、构造脚本、BeginPlay 有什么区别？

推荐理解：

Initialize 是 Lua 绑定初始化阶段，适合创建 Lua 实例字段：

```lua
function M:Initialize(Initializer)
    self.HP = 100
    self.Cache = {}
end
```

不要把它当成完整的 UE 生命周期回调。较新 UnLua 版本甚至明确禁止在 Lua Initialize 中访问当前 UObject 上的 UFunction。

UserConstructionScript 是 Actor 构造脚本语义，编辑器中也可能被多次执行。不要在里面做：不可重复的注册、网络请求、永久计数、无保护的资源创建。

ReceiveBeginPlay 是 Actor 正式进入游戏世界后的业务初始化，适合：注册委托、获取 World 中对象、开启 Timer、启动战斗逻辑。

EndPlay / Destroy：Actor 生命周期清理最好放 ReceiveEndPlay 等明确的 UE 回调中，不要幻想 Lua table 的 __gc 能精确代替 UE EndPlay。

#### 第三梯队：双 GC 和生命周期

这一梯队是 UnLua 面试的超级高频区。两套 GC 并存、Lua 引用与 UE 生命周期互相纠缠，是线上问题的高发地。

##### 22. Lua GC 是什么机制？

Lua 5.4 支持增量 GC 与分代 GC。增量模式将 mark-and-sweep 工作拆成小步，穿插在程序执行中；分代模式频繁处理年轻对象，必要时执行全量 major collection。

GC Root 通常包括：Lua 栈上的值、全局环境、registry 中的值、活着的 coroutine 栈、活着的 closure 及其 upvalue、被其他活对象引用的 table/userdata。

GC 可以回收循环引用吗？可以：

```lua
local a = {}
local b = {}

a.Other = b
b.Other = a

a = nil
b = nil
```

只要整个环从 Root 不可达，标记清扫 GC 可以回收它。这与引用计数不同；纯引用计数通常无法自动处理环。

##### 23. UE GC 和 Lua GC 是同一个东西吗？

完全不是。

Lua GC 管理：table、closure、string、coroutine、full userdata、Lua 模块和状态。

UE GC 管理：UObject、Actor、Component、UClass、UAsset 等 UObject 系对象。

于是存在两套独立问题：

- Lua 还持有 UObject 代理，但 UE 已经回收 UObject。
- UObject 还活着，绑定的 Lua table / delegate / registry ref 也仍然活着。

这就是 UnLua 面试的超级高频点。

##### 24. Lua 变量引用 UObject，能阻止 UE GC 吗？

在现代 UnLua 中，不能简单认为能。从 UnLua 2.2 开始，Lua 环境不再自动给所有被访问的 UObject 增加强引用。因此：

```lua
self.Target = SomeUObject
```

如果这只是 Lua table 字段，并不必然让 SomeUObject 留在 UE 的有效引用链里。UE 回收对象后，再从 Lua 访问可能报：

```text
attempt to read property on released object
```

官方建议的保活方式包括：

1. 放进某个有效 UObject 的 UPROPERTY。
2. AddToRoot。
3. 使用 UnLua.Ref(Object)。

##### 25. UnLua.Ref 和 UnLua.Unref

```lua
local Class = UE.UClass.Load("/Game/MyClass.MyClass_C")

self.ClassRef = UnLua.Ref(Class)
```

只要引用代理还活着，它会在 UE 侧保持目标对象引用。释放：

```lua
self.ClassRef = nil

-- 等待 Lua GC，或者主动：
UnLua.Unref(Class)
self.ClassRef = nil
```

官方说明，对同一个 UObject 重复调用 UnLua.Ref 会复用同一个引用代理。

AddToRoot 为什么要慎用？它是非常强的保活手段，忘记 RemoveFromRoot 很容易让对象长期不被回收。业务代码优先级通常是：合理的 UPROPERTY 引用链 > UnLua.Ref > AddToRoot。

##### 26. 什么时候必须做 IsValid？

这些情况下都要警惕对象已经失效：coroutine yield 后恢复、异步加载回调、网络回包、Timer、Delegate、切换地图后、Widget 移出视口后、Actor 调用 Destroy 后、缓存了临时 Component 或世界对象。

```lua
function M:DelayedOperation()
    UE.UKismetSystemLibrary.Delay(self, 2.0)

    if not self:IsValid() then
        return
    end

    if self.Target and self.Target:IsValid() then
        self.Target:DoSomething()
    end
end
```

注意：

> Lua 变量非 nil，不代表其背后的 UObject 一定有效。

##### 27. 为什么 GC 语言仍然会内存泄漏？

因为"泄漏"经常是逻辑可达性泄漏。常见来源：全局变量、单例 table、package.loaded、Lua registry 引用、未完成的 coroutine、未解绑 Delegate、未取消 Timer、闭包 upvalue、缓存表、UnLua.Ref、UE UPROPERTY 引用链、AddToRoot。对象仍然可达，GC 就认为它是活对象。

面试标准句：

> GC 只能回收不可达对象，不能判断业务上"这个对象已经没用了"。

##### 28. 弱表是什么？

通过 metatable 的 __mode 控制：

```lua
local weakValues = setmetatable({}, {
    __mode = "v"
})

local weakKeys = setmetatable({}, {
    __mode = "k"
})

local weakBoth = setmetatable({}, {
    __mode = "kv"
})
```

适合：缓存、对象到附加数据的非拥有映射、防止 Lua 缓存自身阻止 Lua 对象回收。

但弱表只解决 Lua GC 可达性，不能代替 UE 的 TWeakObjectPtr，也不能让失效 UObject 重新有效。这两个"弱"是不同体系里的概念，不能混为一谈。


#### 第四梯队：UFUNCTION 参数与数据映射

这一梯队考察 Lua 值与 UE 反射参数之间的转换。答得越具体，越能证明踩过参数编组的坑。

##### 29. UFUNCTION 的返回值和 Out 参数如何映射？

例如：

```cpp
UFUNCTION(BlueprintCallable)
bool GetInfo(int32& OutHP, FVector& OutLocation);
```

Lua 可以得到多个返回值：

```lua
local Success, HP, Location = self:GetInfo()
```

现代 UnLua 文档的基本顺序是：ReturnValue、Out 参数 1、Out 参数 2……

覆写函数时也按这个顺序返回：

```lua
function M:GetInfo(HP, Location)
    return true, 100, UE.FVector(10, 20, 30)
end
```

UnLua 历史版本及兼容配置曾调整过返回值顺序，因此老项目升级时必须检查：插件版本、类型检查配置、Legacy Return Order 配置。官方当前中文指南明确说明先返回返回值，再返回 Out 参数。

##### 30. int64/大整数在 UnLua 边界的精度丢失（补充）

这是 UE Lua 项目里非常隐蔽的高频坑。Lua 的 number 在标准实现中是 double（IEEE 754 双精度浮点），只有 52 位尾数能精确表示整数，即超过 2^53 的整数就无法精确表达。而 UE 侧存在大量 int64/uint64 数据：数据库自增 ID、服务器时间戳（如 FDateTime 的 Ticks）、分布式 ID、网络协议中的大整数等。

典型场景：服务器下发一个 uint64 的 ID（比如 9223372036854775807 附近），Lua 收到后与另一个只差 1 的 ID 比较，结果相等；或者对该值做 +1，返回的仍是原值，因为 double 精度已经不足以区分相邻整数：

```lua
local bigA = 9007199254740993   -- 2^53 + 1
local bigB = 9007199254740992   -- 2^53
print(bigA == bigB)  -- true，精度丢失，两个不同的 int64 在 Lua 中相等
```

面试标准句：

> Lua number 是 double，超过 2^53 的整数会丢精度；int64/uint64 跨 UnLua 边界时必须以字符串传递、拆高低 32 位，或使用专门的大整数/字符串绑定，不能直接当 number 运算。

工程上应对措施：关键 ID 字段在 C++ 侧以 FString 暴露；只在 Lua 中做相等比较的场景改为字符串比较；需要运算的大整数走 C++ 工具函数，避免在 Lua 侧做算术。提问"服务器 ID 会不会超 2^53"在面试中是一个很好的主动加分点。

##### 31. 为什么预创建 Out 对象更快？

直接返回：

```lua
local HitResult = self:GetHitResult()
```

通常需要为返回结构创建或包装一个新 userdata。

复用方式：

```lua
self.CachedHitResult = self.CachedHitResult or UE.FHitResult()

self:GetHitResult(self.CachedHitResult)
```

在循环或 Tick 中可减少：userdata 分配、结构体构造、Lua GC 压力、返回值转换。UnLua 官方编程指南明确指出：对于非基本类型 Out/Return 参数，预先创建对象并传入，在循环调用时更高效。

##### 32. USTRUCT 在 Lua 中是值还是引用？

不能只回答"值"或"引用"，要分来源。

Lua 主动构造，如 `local Location = UE.FVector()`，通常是 Lua 可访问的结构体包装对象。

从 UObject 属性获取，如 `local Transform = self.ActorTransform`，它可能代表属性内存的包装或视图、一份拷贝、或特定版本和属性类型决定的引用代理。

工程上最安全的思维是：

> 从 UObject、容器元素或临时函数参数取得的结构体包装，可能依赖原 Owner 或容器内存，不应无脑长期保存。

尤其危险：

```lua
self.CachedItem = self.Items:Get(0)
self.Items:Add(NewItem) -- 可能导致底层存储变化
self.CachedItem.Value = 10
```

容器扩容、元素删除、Owner 回收都可能让旧包装失效。UnLua 的历史更新中多次修复过结构体、容器和悬垂指针相关问题，也提供相关有效性检查。

实践建议：长期保存时优先拷贝必要字段、主动构造新结构、每次使用前重新获取、不跨异步过程保存容器元素引用。

##### 33. Lua table 能直接当 TArray 传给 UE 吗？

不要默认可以。UnLua 对 TArray/TSet/TMap 做了专门包装，官方强调访问时不是先把整个容器转换成 Lua table：

```lua
local Actors = UE.TArray(UE.AActor)
Actors:Add(SomeActor)
```

具体构造形式可能随项目导出配置和 UnLua 版本不同。

为什么不自动 table 转 TArray？自动转换可能产生：遍历成本、大量拷贝、元素类型检查、UObject/UStruct 包装、临时容器分配、Out 参数回写困难。所以高性能绑定更偏向暴露真实 UE 容器代理。

##### 34. TArray/TMap/TSet 高频坑

TArray：注意 UE 索引语义；删除元素会改变后续索引；扩容可能让元素视图失效；遍历时不要随意增删；高频循环里不要反复跨 Lua/C++ 调 Get。

TMap：不要依赖遍历顺序；key 必须符合 UE 类型要求；UObject key 失效问题要额外处理；结构体 value 的引用语义要小心。

TSet：不保证顺序；修改会影响迭代器；自定义结构 key 依赖 UE 哈希和相等逻辑。

##### 35. FString、FName、FText 怎么回答？

FString：普通可变字符串数据，适合业务文本和拼接。

FName：名字标识，适合属性名、Socket 名、RowName、Tag/标识符、高频比较。不要把它当用户可见本地化文本。

FText：本地化文本语义，面向 UI 和国际化。

UnLua 后续版本加入过可配置的 FText 支持，所以项目中 FText 的具体映射应检查插件设置。面试时按"FString 是数据、FName 是标识、FText 是本地化文本"三层回答最稳。

#### 第五梯队：Delegate、Timer 和回调

这一梯队考察事件驱动编程的工程素养：绑定、解绑、生命周期。

##### 36. 单播委托和多播委托

单播 Delegate 只能绑定一个：

```lua
self.Track.InterpFunc:Bind(
    self,
    self.OnTimelineUpdate
)

self.Track.InterpFunc:Unbind(
    self,
    self.OnTimelineUpdate
)

self.Track.InterpFunc:Execute(0.5)
```

多播 Multicast Delegate 可以绑定多个：

```lua
self.Button.OnClicked:Add(
    self,
    self.OnClicked
)

self.Button.OnClicked:Remove(
    self,
    self.OnClicked
)

self.Button.OnClicked:Broadcast()
```

官方说明第一个 UObject 参数用于指定绑定生命周期；该对象失效后，对应回调也会失效，但手动成对解绑仍是良好习惯。

##### 37. 委托的 IsBound / ExecuteIfBound（补充）

单播委托在未绑定时直接 Execute 可能触发断言或崩溃。安全调用模式是先检查再执行：

```lua
if self.Track.InterpFunc:IsBound() then
    self.Track.InterpFunc:Execute(0.5)
end
```

或者直接使用 ExecuteIfBound——已绑定才执行，未绑定安全跳过：

```lua
self.Track.InterpFunc:ExecuteIfBound(0.5)
```

多播委托的 Broadcast 对空绑定天然安全，不需要额外判断；但单播委托（以及需要确认"到底有没有人响应"的场景）必须养成 IsBound / ExecuteIfBound 的习惯。Timer 回调、AI 事件、UI 通知这类"外部可能已解绑"的触发点尤其要防。

面试标准句：

> 单播委托触发前用 IsBound 或 ExecuteIfBound 兜底；多播 Broadcast 本身对空绑定安全，但要注意回调内解绑导致的重入问题。

##### 38. 为什么匿名闭包不好解绑？

```lua
self.Button.OnClicked:Add(self, function()
    print("Click")
end)
```

之后很难构造出"同一个函数对象"进行 Remove：

```lua
self.Button.OnClicked:Remove(self, function()
    print("Click")
end)
```

这两个 closure 不是同一个对象。正确做法：

```lua
function M:OnClicked()
end

self.Button.OnClicked:Add(self, M.OnClicked)
self.Button.OnClicked:Remove(self, M.OnClicked)
```

或者至少保存 closure：

```lua
self.ClickCallback = function()
end

Delegate:Add(self, self.ClickCallback)
Delegate:Remove(self, self.ClickCallback)
self.ClickCallback = nil
```

##### 39. Clear() 为什么危险？

```lua
Delegate:Clear()
```

通常意味着清掉该多播委托上的所有绑定，不只是当前对象的。公共组件、全局系统、共享 UI 中优先用 `Delegate:Remove(self, M.Callback)`；只有你明确拥有该委托的全部绑定时才用 Clear。

##### 40. Timer 如何传 Lua 回调？

官方示例：

```lua
UE.UKismetSystemLibrary.K2_SetTimerDelegate(
    { self, M.SpawnEnemy },
    1.0,
    true
)
```

委托参数可以使用 `{ UObject, LuaFunction }`。官方指南也展示了这一委托传参形式。

Timer 高频泄漏链：

```text
TimerManager
 → Delegate
   → Lua Function
     → self / upvalue
       → 大量状态
```

清理时不仅要考虑 Timer，还要清：保存的 Handle、Delegate、closure 字段、coroutine、UnLua.Ref。

#### 第六梯队：Coroutine 与异步

##### 41. coroutine 是线程吗？

不是操作系统线程。Lua coroutine 是协作式执行流：resume 主动恢复，yield 主动让出，同一时刻仍然只有一个执行流实际运行，不提供 CPU 并行：

```lua
local co = coroutine.create(function()
    print("A")
    coroutine.yield()
    print("B")
end)

coroutine.resume(co) -- A
coroutine.resume(co) -- B
```

##### 42. coroutine.resume/yield 的传参细节（补充）

resume 与 yield 之间传递参数的方向容易搞反，面试官常拿这个小细节验证对 coroutine 的理解。

规则一：**首次 resume 时传入的参数，会成为 coroutine 主函数的参数**：

```lua
local co = coroutine.create(function(a, b)
    print(a, b)  -- 10, 20
end)

coroutine.resume(co, 10, 20)
```

规则二：**coroutine 内 yield(...) 传出的值，会成为 resume 的返回值**：

```lua
local co = coroutine.create(function()
    coroutine.yield("hello", 42)
end)

local ok, v1, v2 = coroutine.resume(co)
print(v1, v2)  -- hello, 42
```

规则三：**再次 resume 时传入的新参数，会成为上一次 yield 表达式的返回值**（即"从暂停点继续，并把参数送回"）：

```lua
local co = coroutine.create(function()
    local x = coroutine.yield("first")
    print("收到继续参数:", x)  -- 99
end)

coroutine.resume(co)        -- 首次启动
coroutine.resume(co, 99)    -- 恢复，99 作为 yield 的结果
```

综合起来：resume 的参数是"给协程的输入"，yield 的参数是"协程交回主流程的输出"；yield 表达式求值出的值来自"下一次 resume 的参数"。这套双向传值机制在 UnLua 里与 Latent Function 恢复、异步流程传数据高度相关，比如延时后把结果传回协程体内继续处理。

##### 43. coroutine.resume 如何处理错误？

```lua
local ok, result = coroutine.resume(co)

if not ok then
    print("Coroutine Error:", result)
end
```

resume 通常不会像普通函数那样直接把错误抛到外面，而是返回 false 和错误信息。coroutine.wrap 则隐藏第一个 bool，并在错误时传播错误。Lua 官方也区分了这两种行为。

##### 44. UnLua 的 Latent Function 是怎么接入 coroutine 的？

```lua
function M:DelayedDestroy()
    UE.UKismetSystemLibrary.Delay(self, 2.0)

    if not self:IsValid() then
        return
    end

    self:K2_DestroyActor()
end

local co = coroutine.create(M.DelayedDestroy)
local ok, err = coroutine.resume(co, self)

if not ok then
    print(err)
end
```

Delay 看起来像同步阻塞，实际上是：

```text
Lua coroutine 运行
    ↓
调用 Latent UFUNCTION
    ↓
UnLua 注册 Latent Action
    ↓
当前 coroutine 挂起
    ↓
引擎条件满足
    ↓
恢复 coroutine
```

官方明确支持在 Lua coroutine 中调用 Latent Function。

##### 45. coroutine 为什么会泄漏？

未结束的 coroutine 会保留：自己的调用栈、局部变量、参数、upvalue、self、临时 userdata：

```lua
local co = coroutine.create(function()
    local hugeData = LoadHugeData()
    coroutine.yield()
end)
```

只要 co 仍被引用，hugeData 就仍然可达。

工程上要做：coroutine 管理器、Owner 到 coroutine 的映射、EndPlay 时取消或丢弃、恢复前验证 Owner、给无限等待增加超时、错误必须记录完整 traceback。

#### 第七梯队：热重载和热修复

##### 46. 热重载不就是重新 require 吗？

不是。普通 require 有 package.loaded 缓存：

```lua
require "A"
require "A"
```

通常只执行一次模块代码。最粗暴的 reload：

```lua
package.loaded["A"] = nil
local NewA = require "A"
```

但旧引用仍然存在：

```lua
local OldA = require "A"

package.loaded["A"] = nil
local NewA = require "A"

-- OldA 仍然指向旧 table
```

所以真正热重载往往要：加载新模块、保留旧模块 table 身份、把新字段覆盖进旧 table、删除已经不存在的旧方法、处理 metatable、迁移实例数据、处理 closure 和 upvalue、重新绑定部分 Delegate/Timer。

##### 47. 为什么热更新后有些函数还是旧的？

常见原因一：缓存了函数：

```lua
local CachedAttack = Player.Attack
```

更新 `Player.Attack = NewAttack` 后，CachedAttack 仍是旧 closure。

原因二：实例字段覆盖了类方法：

```lua
function M:Initialize()
    self.Attack = function()
        print("Old Attack")
    end
end
```

后续修改 M.Attack 不会影响 self.Attack。

原因三：Delegate 持有旧函数引用。原因四：coroutine 的栈帧已经在运行旧代码。原因五：旧 closure 的 upvalue 仍然保持旧状态。原因六：模块 table 被整体替换，而外部仍持有旧 table。

##### 48. UnLua 热重载对 require 有什么影响？

UnLua 的热重载模式会加载相关热重载逻辑，并可能替换全局 require；官方更新记录明确说明，禁用热重载模式时不会加载 HotReload.lua，也不会替换全局 require。

因此遇到模块行为异常时必须先确认：是否开启 UnLua Hot Reload、当前 require 是否是标准实现、package.loaded 是否被自定义逻辑接管、模块无返回值时如何记录、reload 是否更新 upvalue、自定义 loader 是否参与。

##### 49. 如何写热更友好的 Lua？

方法放类表上：

```lua
function M:Attack()
end
```

少在实例上创建方法 closure：

```lua
function M:Initialize()
    self.Attack = function()
    end
end
```

状态放实例上：

```lua
function M:Initialize()
    self.HP = 100
end
```

少缓存其他模块函数。不推荐：

```lua
local CalcDamage = DamageLib.CalcDamage
```

热更后它可能还是旧函数。更热更友好：

```lua
DamageLib.CalcDamage(...)
```

模块加载阶段少做副作用。不推荐：

```lua
local M = {}

GlobalDelegate:Add(...)
StartTimer(...)
CreateWidget(...)

return M
```

模块 reload 一次可能重复注册一次。给状态加版本号：

```lua
M.DataVersion = 3

function M:Migrate(oldVersion)
end
```

#### 第八梯队：性能

##### 50. Lua 性能优化的第一原则是什么？

不是先优化 Lua 运算，而是：

> 减少 Lua 与 UE/C++ 边界穿越次数。

相比一次 Lua table 读取，下面的操作通常更昂贵：查 UPROPERTY、调 UFUNCTION、构造 FVector/FHitResult userdata、返回大型 USTRUCT、遍历 TArray 时逐元素跨边界、反复 LoadObject/LoadClass、每帧创建闭包/table/字符串、大量 Lua Tick。

##### 51. 如何减少跨语言调用？

错误写法：

```lua
for i = 0, Actors:Num() - 1 do
    local Actor = Actors:Get(i)
    local Location = Actor:K2_GetActorLocation()
    local Distance = UE.UKismetMathLibrary.Vector_Distance(
        Location,
        Center
    )

    if Distance < Radius then
        Actor:SetActorHiddenInGame(true)
    end
end
```

这会产生大量 Lua → C++ → Lua → C++ → Lua 的往返。

更优：把批量逻辑下沉到 C++：

```cpp
UFUNCTION(BlueprintCallable)
static void HideActorsInRadius(
    const TArray<AActor*>& Actors,
    const FVector& Center,
    float Radius
);
```

Lua 一次调用：

```lua
UE.UMyGameplayLibrary.HideActorsInRadius(
    Actors,
    Center,
    Radius
)
```

面试标准回答：

> 高频、大批量、数据密集型逻辑放 C++；规则变化快、事件驱动、界面和流程控制放 Lua。

##### 52. Tick 为什么危险？

一个 Lua Tick 不一定慢，危险的是：数百/数千对象 × 每帧 × 多次 UPROPERTY/UFUNCTION × 临时 table/USTRUCT。

优化方案：能事件驱动就不 Tick；多对象统一由 Lua Update Manager 批处理；降低更新频率；分帧处理；距离裁剪；不可见对象停更；高频数学循环放 C++；将多次 getter 合并为一次批量 getter；避免每帧创建 closure。

##### 53. 为什么 local 通常比 global 快？

全局变量本质上通常要经 _ENV table 查找：

```lua
math.max(a, b)
```

高频代码可以缓存：

```lua
local math_max = math.max

for i = 1, 100000 do
    value = math_max(value, i)
end
```

但不要为了微优化牺牲可维护性。跨 UFUNCTION 调用、分配和算法复杂度通常比一次全局查找更值得优化。

##### 54. 如何减少 Lua GC 压力？

避免每帧：

```lua
local t = {}
local callback = function() end
local position = UE.FVector()
local text = "HP:" .. hp
```

可以：table 复用、USTRUCT 复用、使用对象池、closure 提前定义在模块 table 上、高频字符串用缓冲或降低刷新频率、Out 参数使用预分配结构体、大 table 分阶段释放、及时清空全局缓存、取消无效 coroutine/Delegate/Timer。

Lua 5.4 提供增量和分代 GC，且允许通过 collectgarbage 调整模式和参数，但官方也提醒 GC 参数的最优值不跨平台、也不跨版本保证，所以必须基于目标机实测。

##### 55. 能不能每帧 collectgarbage("collect")？

一般不要。完整 GC 可能带来明显尖峰。更合理的是：保持平稳分配、使用增量 step、在过场/Loading/暂停界面做较重回收、观察 Lua 内存曲线、观察 UE GC 与 Lua GC 是否撞在同一帧、不要靠强制 GC 掩盖引用泄漏。

UnLua 历史版本也提供过 lua.gc 控制台命令、内存统计和 Insights 支持，可用于分析而不是盲调。

##### 56. 动态反射导出和静态导出怎么选？

动态反射导出：优点是不需要大量胶水，UCLASS/UFUNCTION/UPROPERTY 自动可用，开发方便，和蓝图接口一致；缺点是只能自然访问反射系统能看到的内容，调用涉及反射描述和参数编组，非 U 类型、模板、特殊引用语义可能无法直接暴露。

静态导出：UnLua 提供类似 BEGIN_EXPORT_CLASS / ADD_PROPERTY / ADD_FUNCTION / END_EXPORT_CLASS 以及 EXPORT_FUNCTION、BEGIN_EXPORT_ENUM 等宏，适合非反射 C++ 类型、高性能接口、特殊构造、模板容器或引擎内部结构、批处理 API、无法标记 UFUNCTION 的功能。官方编程指南列出了类、属性、成员函数、静态函数、全局函数和枚举的静态导出宏。


#### 第九梯队：Lua C API

这一梯队通常出现在"你们改过 UnLua 源码吗""C++ 侧怎么和 Lua 交互"的追问中，属于加分项。

##### 57. Lua C API 为什么是栈式的？

Lua 与 C/C++ 之间通过虚拟栈交换参数和返回值：Lua 参数压在栈上，C 函数读取栈，C 函数压入结果，最后 return 返回值数量。Lua 官方规定：正索引从栈底 1 开始；-1 表示栈顶；-2 表示栈顶下一个；C 函数返回值是压在栈顶的若干值。

示例：

```c
static int Add(lua_State* L)
{
    const double A = luaL_checknumber(L, 1);
    const double B = luaL_checknumber(L, 2);

    lua_pushnumber(L, A + B);
    return 1;
}
```

##### 58. 栈平衡是什么意思？

函数执行前后，栈上只留下约定的内容。常见写法：

```c
const int32 Top = lua_gettop(L);

// push / get / call...

lua_settop(L, Top);
```

常见错误：忘记 pop、pop 多了、保存负索引后继续 push 导致索引指向变化、错误路径没有恢复栈、认为 API 自动检查所有参数、C 函数返回数量与实际 push 数量不一致。Lua 官方明确要求调用者自己保证 C API 栈一致性和容量。

##### 59. 正索引和负索引的区别

假设栈为 1: A、2: B、3: C，那么 1→A、2→B、3→C、-1→C、-2→B、-3→A。继续 push 一个 D 后：1: A、2: B、3: C、4: D，正索引 2 仍是 B，但 -2 现在变成 C。需要长期保存某个负索引时：

```c
int AbsIndex = lua_absindex(L, -2);
```

##### 60. registry 是什么？

registry 是 C/C++ 可使用的特殊 Lua table，通过伪索引 LUA_REGISTRYINDEX 访问。用途：保存 Lua 函数引用、保存 UObject 到 Lua table 的映射、保存绑定系统内部数据、保存模块状态、保存 coroutine、保存 metatable。Lua 官方说明 registry 是宿主 C 代码存储 Lua 值的预定义 table；luaL_ref 会生成整数引用，只要没有 luaL_unref，对应对象一般仍会被强引用。

##### 61. luaL_ref 为什么容易泄漏？

```c
int Ref = luaL_ref(L, LUA_REGISTRYINDEX);
```

它会把栈顶对象放入 registry，并返回整数句柄。取回：

```c
lua_rawgeti(L, LUA_REGISTRYINDEX, Ref);
```

释放：

```c
luaL_unref(L, LUA_REGISTRYINDEX, Ref);
```

忘记 luaL_unref，registry → closure/table/coroutine → 永远可达。所以这是 Lua C API 里的经典引用泄漏来源。UnLua 源码也通过 registry reference 查找绑定对象和函数，并使用受保护调用执行 Lua 函数。

##### 62. full userdata 和 light userdata

full userdata：Lua 管理一块内存，可以有独立 metatable，可参与 GC，通常用于封装 C/C++ 对象或值，可以定义 __gc。

light userdata：只是一个裸 C 指针值，Lua 不拥有指针指向的内存；所有相同地址的 light userdata 相等；通常不能为单个实例设置独立 metatable；不自动保证生命周期。

Lua 官方明确区分了这两类 userdata。面试标准句：

> light userdata 是地址，不是所有权；full userdata 才是 Lua GC 管理的对象容器。

##### 63. lua_pcall 和 lua_call

lua_call 的错误会直接向外传播，需要外层已有保护环境。lua_pcall 是保护调用，返回错误码，并可配置错误处理函数：

```c
if (lua_pcall(L, NumArgs, NumReturns, ErrorFuncIndex) != LUA_OK)
{
    const char* Error = lua_tostring(L, -1);
}
```

UnLua 源码调用 Lua 函数时使用 lua_pcall，并在栈上放入错误报告函数。

为什么 C++ RAII 要小心？标准 Lua 错误处理通常使用 longjmp；如果 Lua 作为 C 编译，跨越含有 C++ 非平凡局部对象的栈帧可能绕过析构。Lua 作为 C++ 编译时可使用异常实现，具体取决于构建配置。Lua 官方文档明确说明了这一点。

#### 第十梯队：网络、输入和动画

##### 64. Lua 能直接创造一个新的 RPC 吗？

一般不能只写一个 Lua 函数就让它自动拥有 UE RPC 语义。RPC 的网络属性仍然来自 UE 反射声明：

```cpp
UFUNCTION(Server, Reliable)
void StartFire_Server();

UFUNCTION(NetMulticast, Unreliable)
void StartFire_Multicast();
```

Lua 负责覆写或实现对应函数逻辑，网络路由、Authority、Reliable/Unreliable 等仍由 UE 的 UFunction 元数据和网络系统决定。官方示例中也展示了类似 `function M:StartFire_Server_RPC() end` 的写法，具体命名约定以项目使用的 UnLua 版本和生成模板为准。

高频追问："Lua 调 Server RPC，参数会自动序列化吗？"回答：

> 只要调用的是合法声明的 UE RPC UFUNCTION，参数序列化由 UE 网络系统完成；Lua/UnLua 负责在调用边界进行 Lua 值与 UFunction 参数内存的转换。普通 Lua table 和任意 Lua closure 不会自动成为 UE 可复制网络类型。

##### 65. RepNotify 怎么覆写？

对应 UE 属性：

```cpp
UPROPERTY(ReplicatedUsing=OnRep_Health)
float Health;
```

Lua：

```lua
function M:OnRep_Health(OldHealth)
    self:RefreshHealthUI()
end
```

函数名、参数签名必须与 UE 实际生成的 UFunction 对应。UnLua 官方说明支持覆写 Replication Notify。

##### 66. AnimNotify 命名规则

```lua
function M:AnimNotify_AttackHit()
end
```

基本格式：`AnimNotify_` + NotifyName。官方文档明确给出这一命名规则。

##### 67. Enhanced Input 怎么理解？

UnLua 后续版本加入了 Enhanced Input 相关支持（更新记录显示 2.3.3 增加了 Enhanced Input 支持），但输入系统的核心仍是 UE Input Mapping、Input Action 和 Input Component。面试回答可以说：

> Lua 可以处理输入回调，但 Context 配置、触发条件、输入消费和 Possess 生命周期仍是 UE 输入系统问题；尤其切换 Pawn、Controller 和 InputComponent 时要重新检查绑定有效性。

#### 第十一梯队：线程和多 VM

##### 68. Lua 是线程安全的吗？

Lua 库可以创建多个独立 state，但对同一个 state 的并发访问不能随意进行外部无锁操作。关键区分：

- lua_State 不是"可以随便跨线程操作的对象"。
- coroutine 不是 OS 线程。
- 多个独立 Lua Env 可以有各自状态和注册表。
- UE UObject 调用默认应约束在合适的引擎线程，游戏业务通常回到 Game Thread。

Lua 官方说 Lua 库本身不依赖全局变量，所有状态保存在 Lua state 中；但这不等于同一个 state 可被任意多个线程同时无锁操作。

正确异步模式：

```text
工作线程：
    只计算纯数据
        ↓
切回 Game Thread
        ↓
访问 Lua VM / UObject
```

不要在异步线程直接：调 UObject UFUNCTION、操作同一个 Lua state、广播 Lua Delegate、恢复 Game Thread 上管理的 coroutine。UnLua 更新记录也出现过异步加载线程绑定、非主线程崩溃堆栈访问等相关修复，说明边界必须严格管理。

##### 69. 多 Lua VM 有什么用途？

可能用于：PIE 多客户端模拟、Server/Client 分离环境、编辑器工具和游戏环境分离、测试隔离、沙箱。

代价：每个 VM 有独立全局变量，模块会各自加载，registry 不共享，Lua table 和 closure 不能直接跨 VM 使用，UObject 到 Lua 实例的映射要区分 Env。UnLua 2.2 加入多虚拟机环境支持，后续还将每个 FLuaEnv 的 ClassRegistry、EnumRegistry 独立化。

#### 第十二梯队：调试、打包和安全

##### 70. Lua 报错如何保留堆栈？

Lua：

```lua
local function ErrorHandler(err)
    return debug.traceback(tostring(err), 2)
end

local ok, result = xpcall(function()
    DoSomething()
end, ErrorHandler)

if not ok then
    print(result)
end
```

UnLua C++ 侧也提供过打印 Lua CallStack 的接口，并支持崩溃时输出 Lua 堆栈的配置。日志必须包含：模块名、函数名、UObject 路径或名字、World/PIE 实例、网络角色、Lua traceback、UE 调用上下文、热更版本号。

##### 71. 编辑器能运行，打包后找不到 Lua 文件，查什么？

按顺序检查：

1. Content/Script 是否被加入打包目录。
2. 模块路径大小写。
3. 自定义 loader。
4. 插件 Content 路径。
5. Pak/IoStore 中是否包含脚本。
6. Shipping 是否剔除了调试路径。
7. 文件编码和 BOM。
8. Android/iOS 平台路径和大小写差异。
9. Entry Script 是否执行。
10. UnLuaExtensions 脚本是否加入打包。

UnLua 更新记录显示较新版本会自动将 Content/Script 加入打包设置，也支持 UnLua.PackagePath、插件 Content 路径和自定义 Lua loader。

##### 72. 自定义 loader 有什么用？

可以从以下位置加载 Lua：本地文件、Pak/IoStore、内存、加密资源、网络热更目录、插件 Content、自定义版本目录。官方教程通过绑定 FUnLuaDelegates::CustomLoadLuaFile 实现自定义 Lua 文件加载。

生产环境通常还需要：文件签名、Hash 校验、版本白名单、回滚包、原子替换、ABI/API 兼容检查、热更失败熔断。

##### 73. Lua 沙箱怎么做？

基本思路是给 chunk 独立 _ENV：

```lua
local env = {
    print = print,
    math = math,
    string = string,
}

local func = load(code, "Sandbox", "t", env)
func()
```

但真正安全的沙箱不能只"删几个全局函数"。需要限制：debug、io、os、package、load、loadfile、dofile、C module 动态加载、文件系统接口、反射到危险 UObject、无限循环、内存分配、执行时间。Lua 的 _ENV 是普通词法变量，加载 chunk 时可以指定环境。

#### 高频快问快答

以下 18 条适合快速过一遍，作为面试冲刺时的检查项。每条都要能在 20 秒内给出干净回答。

##### 74. Lua 的数组为什么通常从 1 开始？

语言并不禁止 0 或负数索引，table 的键可以是任意非 nil 合法值。但标准库、ipairs、table 构造器和社区约定通常从 1 开始。

##### 75. a.b 和 a["b"] 一样吗？

一般等价。a.b 只是字段名为合法标识符时的语法糖。

##### 76. == 比较 table 内容吗？

不是，默认比较身份：`{} == {}` 为 false。即使内容相同，也是不同 table。可通过合适的 __eq 元方法改变部分类型的相等行为。

##### 77. local 为什么重要？

避免污染全局环境、减少命名冲突、生命周期更清晰、通常访问更直接、有利于模块隔离和热更、防止误写全局变量导致对象长期存活。建议开发环境检查未声明全局写入。

##### 78. Lua 参数是值传递还是引用传递？

统一说"值传递"更准确。但是传递的值可能是 table、function、userdata 的引用值：

```lua
local function Change(t)
    t.HP = 0
    t = {} -- 只改变函数内部局部变量
end
```

##### 79. table 作为参数会复制吗？

不会自动深拷贝，传递的是 table 引用值。

##### 80. 如何深拷贝 table？

要先回答需求：是否处理循环引用？是否复制 metatable？key 也要复制吗？UObject/userdata 如何处理？closure 是否复制？是否保留共享引用关系？

简单递归 deep copy 往往不够：

```lua
local function DeepCopy(value, visited)
    if type(value) ~= "table" then
        return value
    end

    visited = visited or {}

    if visited[value] then
        return visited[value]
    end

    local result = {}
    visited[value] = result

    for k, v in pairs(value) do
        result[DeepCopy(k, visited)] =
            DeepCopy(v, visited)
    end

    return setmetatable(
        result,
        getmetatable(value)
    )
end
```

对 UObject userdata 通常应该保留代理，而不是"深拷贝 UObject"。

##### 81. Lua 可以函数重载吗？

原生不支持基于参数类型的静态重载。后定义会覆盖前定义：

```lua
function M.Foo(a)
end

function M.Foo(a, b)
end
```

可以通过参数数量、type、tag、不同函数名自行分派。UnLua 调 C++ 重载接口时则依赖导出描述和签名，静态导出可显式指定要暴露的重载。

##### 82. Lua 有 private/protected 吗？

没有语言级 class 访问控制。可以利用 closure 隐藏：

```lua
local privateValue = 10

local M = {}

function M.GetValue()
    return privateValue
end

return M
```

##### 83. 为什么不要在模块顶层保存 World 对象？

```lua
local CachedWorld = SomeWorld
```

跨关卡、PIE、多客户端、多 VM 后容易变成：旧 World、已释放 UObject、错误 PIE 实例、Server World 被 Client 使用、阻止某些状态释放。World 相关对象应尽量从当前上下文获取。

##### 84. 为什么不要长期缓存 CDO 或 UClass 而不考虑生命周期？

类和资产也属于 UObject 体系。动态加载、蓝图重编译、PIE 和热重载都可能改变有效性或引用关系。需要长期保存时建立明确 UE 引用链或使用 UnLua.Ref。

##### 85. 为什么"Lua table 非 nil"仍可能访问崩溃？

Lua table 或 userdata 代理存在，不代表背后的 UObject、USTRUCT Owner、TArray 元素、Delegate Owner、原始 C++ 指针仍然有效。代理生命周期与原生对象生命周期是两个概念。

##### 86. 为什么蓝图 Recompile 会影响 Lua？

蓝图重编译可能重建 UClass、UFunction、Property、CDO、函数映射。绑定层缓存的描述必须失效和重建。UnLua 的更新记录中也修复过蓝图 Recompile 导致 FuncMap 被清空等问题。

##### 87. 为什么不能在容器遍历中随意删除？

删除可能导致：迭代器失效、元素移动、TArray 索引变化、结构体包装失效、跳过元素。可逆序删除：

```lua
for i = Array:Num() - 1, 0, -1 do
    if ShouldRemove(Array:Get(i)) then
        Array:Remove(i)
    end
end
```

##### 88. self.Func 和 M.Func 绑定 Delegate 哪个更好？

如果方法定义在类表：

```lua
function M:OnClicked()
end
```

通常优先保存稳定的类方法引用：

```lua
Delegate:Add(self, M.OnClicked)
Delegate:Remove(self, M.OnClicked)
```

原因：函数身份清楚、不易被实例字段覆盖、更方便成对解绑、热更系统更容易识别类方法。但项目热更框架如何替换 Delegate 中旧函数引用仍需专门处理。

##### 89. 为什么大量 closure 会产生性能问题？

每次执行函数定义表达式都可能创建新的 closure：

```lua
for i = 1, 10000 do
    callbacks[i] = function()
        return i
    end
end
```

会增加 closure 数量、upvalue 数量、GC 对象数量、内存碎片和回收成本。能复用模块函数就复用。

##### 90. Lua 尾调用是什么？

严格形式：

```lua
return OtherFunction(...)
```

可以成为尾调用，当前调用帧不需要继续保留。以下通常不是严格尾调用：

```lua
return OtherFunction(...) + 1
return (OtherFunction(...))
local x = OtherFunction(...)
return x
```

Lua 官方只对特定语法形式保证尾调用。

##### 91. 热更能更新正在运行的 coroutine 吗？

一般不能完整替换已经建立的栈帧。即使模块函数 table 已更新：coroutine 当前函数体仍是旧 closure，局部变量仍是旧状态，yield 点恢复后继续执行旧代码，后续动态调用新 table 方法时才可能进入新函数。因此长生命周期 coroutine 是热更难点。

#### 面试时最值钱的五个完整回答

这五个回答覆盖了 UnLua 面试中最常被深挖的五个方向。推荐先用自己的话复述，再结合项目经历补充细节。

**问：UnLua 中 Lua 持有 UObject 会不会阻止 UObject 被 GC？**

推荐回答：

> 现代 UnLua 中不能认为 Lua 引用会自动保活 UObject。从 2.2 开始，Lua 环境不再默认给所有 UObject 增加强引用。UObject 是否存活主要取决于 UE 引用链，例如 UPROPERTY、Root 或 UnLua.Ref。Lua 代理仍然存在但原生对象已被 UE 回收时，访问会报 released object。因此异步、Timer、Delegate、coroutine 恢复后都要检查有效性。

**问：UnLua 调 UFUNCTION 的性能瓶颈在哪里？**

推荐回答：

> 主要不是 Lua 的一条语句，而是跨边界时的函数描述查找、参数类型检查、Lua 栈与 UFunction 参数内存之间的编组、结构体或容器包装、ProcessEvent 或原生调用、Out 参数回写。UnLua 对描述和参数 Buffer 做了缓存优化，但高频逐元素跨边界仍然昂贵，所以应减少调用次数、设计批量 C++ API、复用 Out USTRUCT，并避免大量 Lua Tick。

**问：热重载最大的难点是什么？**

推荐回答：

> 不是重新执行脚本，而是更新已有引用。package.loaded、旧模块 table、缓存的函数、Delegate、Timer、closure upvalue、实例字段和正在运行的 coroutine 都可能继续引用旧代码。较稳定的做法是保持模块 table 身份，增量替换方法，把状态放 self，把方法放类表，避免实例 closure，并为数据结构做版本迁移。

**问：Lua coroutine 和 UE Latent Function 怎么配合？**

推荐回答：

> coroutine 是协作式执行流而不是线程。UnLua 在 coroutine 中调用 Latent UFUNCTION 时，将当前 coroutine 挂起，并通过 UE Latent Action 在条件完成后恢复，因此可以用同步形式写异步流程。恢复时 UObject 可能已经被销毁，所以必须检查 self、Target 和 World 的有效性，同时管理取消、超时和错误堆栈。

**问：UnLua 为什么需要两套对象注册和生命周期管理？**

推荐回答：

> 因为 Lua GC 管理 table、closure、coroutine 和 userdata，而 UE GC 管理 UObject，两套系统对"存活"的判断不同。UnLua 需要维护 UObject 与 Lua 实例 table、函数、Delegate 之间的映射，还必须在 UObject 回收、Lua GC、蓝图重编译、关卡切换和 LuaEnv 销毁时同步清理，否则就会出现悬垂代理、旧函数引用或逻辑内存泄漏。

#### 知识树

把整个体系压缩成一张脑图：

```text
Lua 语言
├── 类型与真值
├── table
│   ├── 数组/哈希
│   ├── pairs/ipairs/#
│   └── 引用语义
├── metatable
│   ├── __index
│   ├── __newindex
│   ├── rawget/rawset
│   └── 模拟 OOP
├── function
│   ├── : 与 .
│   ├── 多返回值
│   ├── closure
│   └── upvalue
├── require
│   ├── package.loaded
│   ├── 循环依赖
│   └── 热重载
├── GC
│   ├── 增量/分代
│   ├── Root
│   ├── 弱表
│   └── 可达性泄漏
└── coroutine
    ├── resume/yield
    ├── 非线程
    ├── Latent
    └── 取消与生命周期

UnLua
├── LuaEnv / lua_State
├── 静态绑定 / 动态绑定
├── UE 命名空间懒加载
├── 反射导出
│   ├── UCLASS
│   ├── UPROPERTY
│   ├── UFUNCTION
│   ├── USTRUCT
│   └── UENUM
├── 静态导出
├── Lua → UE
│   ├── 函数描述
│   ├── 参数编组
│   ├── UFunction 调用
│   └── Out/Return 回填
├── UE → Lua
│   ├── BlueprintEvent
│   ├── AnimNotify
│   ├── RepNotify
│   ├── Input
│   └── Overridden
├── 双 GC
│   ├── UE 引用链
│   ├── released object
│   ├── UnLua.Ref
│   └── IsValid
├── Delegate / Timer
├── TArray/TMap/TSet
├── 热重载
├── 多 VM
├── 打包/Loader
└── 性能
    ├── 减少跨边界
    ├── 批处理 API
    ├── 复用 USTRUCT
    ├── 减少 Tick
    └── 控制分配和 GC
```

最值得优先啃源码的顺序是：

```text
UELib.cpp
→ LuaCore.cpp
→ ObjectRegistry
→ ClassRegistry
→ FunctionDesc / PropertyDesc
→ DelegateRegistry
→ LuaLib_Delegate
→ HotReload.lua
→ FLuaEnv
```


### 实现方案

知识是"知"，落地是"行"。把上面的知识点转成可执行的工程方案，建议按以下四个层次推进。

**一、代码规范层：从写法上消灭一半问题。** 热更友好与生命周期安全大部分是写法问题：方法一律放类表、状态一律放 self、不缓存其他模块函数、模块加载阶段不做副作用、Delegate/Timer 成对解绑、单播委托触发前用 IsBound/ExecuteIfBound 兜底、容器遍历不增删（确需删除时逆序）、比较器只读不改表。这些规则可以直接写成团队 Lua 代码规范与静态检查项，比事后排查成本低一个数量级。

**二、框架层：把通用能力沉淀为公共模块。** 至少应建设四类公共设施：coroutine 管理器（Owner 映射、EndPlay 取消、超时、traceback 记录）；对象引用管理（统一的 UnLua.Ref 登记与释放、长生命周期引用链审计）；热更框架（保持模块 table 身份、增量替换方法、版本号迁移）；日志与错误上报（统一 ErrorHandler、模块名/UObject 路径/热更版本号上下文）。这些设施直接对应本文第十二梯队与第六、七梯队的问题，是团队工程化水平的分水岭。

**三、性能治理层：把"跨边界次数"当作第一指标。** 定期的性能 Review 应关注：Lua Tick 数量与频率、每帧 UFUNCTION/UPROPERTY 访问次数、每帧 table/USTRUCT/closure 分配量、Lua GC 与 UE GC 是否撞帧、循环内是否逐元素跨边界。原则是"高频、大批量、数据密集放 C++，规则变化快、事件驱动、流程控制放 Lua"，批量 API 下沉 C++、Out 参数预分配复用。配合 UnLua 提供的 lua.gc 控制台命令、内存统计与 Insights 做目标机实测，而不是盲调 GC 参数。

**四、面试准备层：把清单变成自己的语言。** 建议按"现象 → 原理 → 工程对策 → 追问变体"四段式练习每个问题：先讲现象（报错/表现），再讲原理（机制层面为什么），再给工程对策（项目里怎么防），最后预演面试官可能的追问（比如"那如果……呢"）。本文所有"面试标准句"只是骨架，真正有区分度的是你能不能用自己项目的例子把骨架填满——但注意公开分享时把项目细节抽象成通用场景。

### 总结

Lua 与 UnLua 的知识体系，本质上是"一门轻量脚本语言"与"一套重型引擎运行时"之间的所有边界问题：类型与真值、table 与元表是语言地基；类与闭包是组织方式；GC 与生命周期是双系统冲突的震中；反射绑定与参数编组是桥接的物理层；委托协程是异步骨架；热更与性能是工程化验收标准；C API、网络、多 VM、打包安全则是纵深。

回答这类问题的关键在于一个思维转换：**不要只把 Lua 当作"在 UE 里写脚本"，而要把自己当成"两套运行时之间的工程师"。** 面试官想听到的，不是你会背多少 API，而是你能不能在 Lua 的轻量语义与 UE 的重型生命周期之间做出正确的工程取舍：该用弱表还是 TWeakObjectPtr、该动态导出还是静态导出、该 Tick 还是事件驱动、该把逻辑放 C++ 还是 Lua、该保活还是该释放。这些取舍没有标准答案，只有基于原理的判断。

最后回到那句话：面试题只是入口，源码和官方文档才是权威。如果某个问题在面试现场答不上来，最诚实的策略是承认边界，并展示自己知道去哪里查——这比硬编一个答案更能说明工程素养。

### 知识缺口

本文为面试导向的概览，以下知识点有意未展开，建议按需补充：

- **UnLua 源码级细节：** 各版本 ObjectRegistry/ClassRegistry 的具体实现差异、绑定实例的创建与销毁时机、FLuaEnv 生命周期管理细节。
- **Lua 语言深水区：** 元方法全表（__pairs、__len、__call 等）、string 库与模式匹配细节、LuaJIT 的 FFI 与 trace 编译、5.4 的 generational GC 调参细节。
- **UE 侧配套：** 完整反射系统原理（UClass/UProperty 布局）、RPC 与属性复制的底层通道、Enhanced Input 与旧输入系统的迁移细节。
- **工程专题：** 具体热更框架的设计对比（整包替换 vs 增量补丁）、加密与反外挂、多 VM 下的资源隔离方案、大规模 Lua 代码的性能剖析方法论。
- **版本差异细节：** UnLua 各版本（2.0/2.1/2.2/2.3+）之间的行为变化清单、Lua 5.1~5.4 的全部语法与标准库差异表。

## 元数据
- **创建时间：** 2026-08-20
- **最后更新：** 2026-08-20
- **作者：** 吉良吉影
- **分类：** 跨引擎学习
- **标签：** Lua, Unreal Engine, UnLua, 热更新, 性能优化, GC
- **来源简注：** 由吉良吉影的agent整理

---
*由吉良吉影的agent整理*
