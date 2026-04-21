# KiraFramework：架构讲解、工业化扩展与Luban配置管线迭代方案

## 摘要
KiraFramework 的核心价值，不在于它已经覆盖了多少 Unity 基础能力，而在于它已经跑通了一条非常明确的工程主线：**用配置表达事实、用生成器产出接口、用类型系统约束调用、把错误前移到工具链阶段。** 当前项目已经拥有静态调用链生成、UI 自动生成与绑定、MVVM 元数据扫描、Excel 到模型与 JSON 的导出等能力。这些能力看似分散，实则共同服务于同一个目标：将字符串约定、手工绑定和重复样板代码，收束为一条配置驱动、生成驱动、编译期可校验的工业化开发链路。

本文只讨论技术实现与设计方法，不讨论框架的非技术背景。文档首先系统讲解当前代码已经完成的结构与设计思想，然后把下一阶段的迭代方向扩展到更专业的工程视角，重点纳入四条新的演进思路：其一，静态调用链末尾值的类型从固定写法演进为配置驱动的“值类型系统”；其二，导表工作流拆分为“增量 API 生成”和“全量配置导出”两套链路；其三，ViewModel 生成器从实时反射扫描演进为生成缓存；其四，整体架构尽可能脱离 Unity，向跨引擎、可迁移的工具链形态收束。文中同时给出从 `ScriptableObject` 迁移到 `Luban + Xlsx` 的设计目标、架构边界、伪代码和阶段性实施方案。

## 正文

### 背景
从当前项目代码可以看出，KiraFramework 已经形成了一条清晰的工程闭环：

```text
配置定义 -> 编辑器扫描/校验 -> 自动生成代码与数据 -> Unity 编译 -> 运行时消费
```

这个闭环所解决的问题并不是某一个具体功能点，而是一类在游戏项目中长期存在、且在规模扩大后会迅速放大的工程问题：

1. 事件键、资源路径、UI 页面标识、枚举定义这类天然容易被写成字符串的内容，如何变成强类型接口。
2. View 脚本字段声明、ViewModel 属性封装、Inspector 拖拽绑定、配置模型类定义这类高度模式化的样板代码，如何交给生成器而不是人工维护。
3. 配置与代码之间如何建立稳定、可追踪、可校验、可扩展的生产链路，而不是停留在“改了表再手动同步几份代码”的阶段。
4. 一套看似只能在 Unity 编辑器里使用的工具链，如何向更通用、更工业化、甚至可跨引擎迁移的配置编译体系演进。

如果从类名层面观察，项目像是“事件系统 + UI 系统 + MVVM + 配置导表工具”的组合；但如果从架构层面观察，它真正统一的主题是：

> 把开发约束前移到配置层和生成层，用工具链替代人工约定，让运行时代码尽量只消费被编译好的接口和数据。

这是理解 KiraFramework 的关键起点。后文所有设计讨论都建立在这个前提之上。

### 核心内容

### 一、当前框架的技术结构

#### 1.1 当前模块总览

| 模块 | 当前实现 | 技术职责 |
| --- | --- | --- |
| 静态映射生成 | `MappingConfigSO` + `StaticCodeGenerator` | 根据路径配置生成 `KiraEventKey`、`KiraAssetsPath` 等链式静态 API |
| 事件系统 | `IKiraEventKey` + `EventManager` + `KiraObject` | 用泛型和 `Type` 作为事件键，替代字符串事件名 |
| UI 运行时 | `UIBase` + `UIManager` + `UILayer` | 负责页面生命周期、Canvas 分层、页面缓存 |
| UI 代码生成 | `PrefabContextMenu` + `PrefabScriptGenerator` + `DeferredBinder` | 从 Prefab 自动扫描组件，生成 View 脚本并自动回填序列化字段 |
| MVVM 元数据 | `MVVMAttributes` + `MVVMDataCache` + `ModelFieldBindingDrawer` | 扫描打了特性标记的 Model 和字段，为 ViewModel 生成提供元数据 |
| ViewModel 生成 | `ViewModelGenerator` + `ViewModelConfigSO` | 按配置生成 ViewModel 属性包装代码 |
| 配置表工作流 | `ExcelConfigTool` + `GeneratedJsonScripts` + `Resources/ConfigJson` | 创建 Excel 模板，生成配置模型，编译后导出 JSON |
| 枚举生成 | `EnumDefinitionAsset` + `EnumDefinitionAssetEditor` | 用编辑器资产生成 C# 枚举脚本 |

#### 1.2 当前分层方式

从职责看，KiraFramework 已经自然形成了三层结构：

```text
Editor Layer
    负责定义、扫描、校验、生成、刷新资源数据库

Generated Layer
    负责把配置投影成代码、枚举、静态接口、ViewModel、JSON

Runtime Layer
    负责消费生成结果，提供统一运行时入口
```

这个分层说明一个非常重要的事实：KiraFramework 的设计重点不在“运行时做了多少复杂事”，而在“运行时能否少做事”。如果一个问题能在编辑器阶段解决，就尽量不要把它拖到运行时。例如：

1. 如果资源路径可以在编辑器生成成静态常量，就不应该在业务里手写字符串。
2. 如果事件结构可以通过配置编译成类型树，就不应该在业务层靠文档记忆事件名。
3. 如果 Prefab 字段可以扫描生成并自动回填，就不应该反复人工声明与拖拽。
4. 如果表头能生成模型类并在导出前做校验，就不应该把字段缺失留到运行时报错。

这种“前移约束”的方向，正是工业化开发和普通工具脚本之间的本质区别。

#### 1.3 当前工作流的真实样貌

从代码而不是宣传口径出发，当前框架的真实工作流更接近下面这样：

```text
1. 使用 ScriptableObject、Prefab、Excel 作为作者态输入
2. 由 Editor 工具扫描这些输入，并构建临时的结构化信息
3. 将结构化信息生成成 C# 代码、枚举脚本、JSON 数据
4. 通过 Unity 编译把生成结果纳入工程
5. 在运行时通过 KiraObject / UIManager / 配置模型等入口消费这些产物
```

因此，KiraFramework 最接近的定位并不是“运行时框架”，而是“围绕游戏元数据的工程编译器”。它编译的不是通用程序，而是：

- 事件定义
- 资源定位定义
- UI 结构定义
- MVVM 暴露定义
- 表结构与配置数据定义

这个视角非常重要，因为它决定了后续迭代时应该把精力放在哪里。真正值得持续打磨的不是某个零散的工具，而是整条“作者态输入 -> 中间语义 -> 生成产物 -> 运行时消费”的编译式链路。

### 二、当前实现的核心机制解读

#### 2.1 静态调用链生成的本质

`StaticCodeGenerator` 读取 `MappingConfigSO` 中的层级路径与最终值，然后递归生成形如 `KiraEventKey`、`KiraAssetsPath` 的静态结构。这套机制表面上是在“拼接代码”，本质上是在把一份配置结构编译成一棵类型树。

当前规则大致如下：

1. 若某个节点的 `FinalValue` 为空，则该节点被视为事件节点，生成实现 `IKiraEventKey` 的类型。
2. 若某个节点的 `FinalValue` 非空，则该节点被视为值节点，生成 `const string`。
3. 若某个节点既是容器又携带值，则生成带 `Value` 常量的容器类。

这套机制的价值不只是“好看”或“IDE 友好”，而是：

1. 让配置中的命名空间、路径层级和运行时调用接口保持一致。
2. 让引用错误从“运行时找不到字符串”前移为“编译期不存在该类型/成员”。
3. 让重构行为可以通过编译器、IDE 和生成器共同托底，而不是靠人工搜全项目。

因此，这条链路应被视为 KiraFramework 最核心的架构资产之一。

#### 2.2 类型安全事件系统的价值不止于事件系统本身

`EventManager` 采用 `Type` 作为事件键，`IKiraEventKey` 作为泛型约束，业务层通过：

```csharp
RegisterEvent<KiraEventKey.GamePlay.GameStart>(...)
FireEvent<KiraEventKey.Player.OnHpChanged, float>(...)
```

来进行事件通信。与字符串事件总线相比，它的收益有三层：

1. **类型安全**：调用者不可能拼错事件名而不自知。
2. **配置统一**：事件结构可以由生成器统一产出，不依赖人工同步。
3. **工程约束**：是否允许某个事件存在，不再由“大家约定”决定，而是由配置和生成器决定。

更进一步看，事件系统只是这一设计的一个投影。KiraFramework 真正想验证的东西是：**是否可以把一类原本靠字符串约定的业务标识，都提升成强类型接口。** 事件键只是最直观的例子。

#### 2.3 UI 自动生成链解决的是一致性问题

`PrefabScriptGenerator` 当前做的事情包括：

1. 扫描 Prefab 节点和组件。
2. 自动构造字段名与 `using`。
3. 遇到嵌套的 `KiraObject` 时，把它视为子视图边界，而不是继续摊平扫描。
4. 编译后通过 `DeferredBinder` 自动回填字段引用。

这一套方案解决的并不是“少写几个 `[SerializeField]`”这么表面的事情，而是三个更深层的工程问题：

1. Prefab 结构调整后，脚本字段容易漏改。
2. 团队成员命名习惯不统一，字段风格和节点结构逐渐失配。
3. 大型 UI 页面手工拖拽字段时，极易出现错绑、漏绑、重命名后失效等问题。

换句话说，这套工具链的真正价值是：**让 UI 结构的变化自动反映到代码接口上。**

#### 2.4 MVVM 目前验证的是“元数据驱动生成”这条路

当前 MVVM 部分依赖 Model 上的标记来暴露字段。你提到的“宏定义”，在 C# 里更准确的名字是**特性（Attribute）**。当前链路可以概括为：

1. Model 类打上 `MVVMModelAttribute`。
2. 需要暴露给 ViewModel 的字段或属性打上 `MVVMFieldAttribute`。
3. `MVVMDataCache` 在编辑器域扫描程序集，收集所有被标记的 Model 和字段。
4. `ModelFieldBindingDrawer` 在 Inspector 中提供下拉菜单，避免人工输入类型名与字段名。
5. `ViewModelGenerator` 按绑定关系生成 ViewModel 属性包装。

这说明当前 MVVM 系统最先解决的不是完整的绑定框架，而是“哪些字段可见、这些字段如何被可靠地暴露出来”这个元数据层问题。这种切入方式是合理的，因为它优先工具化了最容易重复、最容易出错的部分。

#### 2.5 ExcelConfigTool 体现了配置管线的雏形

`ExcelConfigTool` 已经不是单纯“导出个 JSON”的小工具，而是初步体现了配置管线思路：

```text
Excel 表头定义
-> 生成模型类
-> 刷新并触发编译
-> 编译完成后导出 JSON
-> 运行时从 Resources 使用
```

虽然这条链路目前仍然明显依赖 Unity 编辑器，但它已经具备了几个关键意识：

1. 表结构不是只给表格看的，也应该投影为代码结构。
2. 配置导出是流程，不是一次性的手工动作。
3. 编译完成后继续导出数据，意味着工具链已经具备阶段性任务拆分意识。

这正是后续迁移到 `Luban + Xlsx` 时最值得继承的部分。

### 三、这个框架真正重要的设计思想

#### 3.1 配置是事实源，代码是投影层

KiraFramework 最值得明确固化的原则是：

> 配置不是给运行时直接查表的，它首先应该被编译成开发者日常调用的接口层。

这句话的含义很深：

1. 作者态的输入与开发态的接口不是一回事。
2. 配置修改不只是影响数据，还应该影响可调用 API 的边界。
3. 业务层最理想的状态，不是“记住很多字段和路径”，而是“只使用生成接口允许的内容”。

这实际上对应了更成熟的工程化分工：

```text
Schema / Authoring Data -> Intermediate Representation -> Generated Code -> Runtime Data
```

当前项目还没有把这个分工显式写成框架设计，但代码已经朝这个方向发展了。

#### 3.2 强类型接口的意义在于强约束，而不仅是体验优化

很多人会把“IDE 自动补全”理解为一种开发体验优化，但在真正的工业化工具链里，它的深层价值在于：

1. 收束合法调用空间。
2. 降低团队成员记忆成本。
3. 把错误从文档约定层提升为编译器可验证层。

所以 KiraFramework 的静态调用链，并不只是“让代码更顺手”，而是一种**强约束 API 设计**。这和很多轻量工具脚本有本质区别。

#### 3.3 编辑器工具链本质上是一台领域编译器

不管是 `ScriptableObject`、Prefab 还是 Excel，本质都只是输入载体。真正的核心不是这些载体，而是生成器如何把它们翻译成：

- 类型树
- 枚举代码
- View 代码
- ViewModel 代码
- 配置模型代码
- 运行时数据文件

从这个角度看，KiraFramework 最应该演进的方向不是“继续加一些方便的小工具”，而是：

1. 统一输入语义。
2. 统一校验过程。
3. 统一中间表示。
4. 统一生成过程。
5. 统一运行时消费接口。

也就是说，未来应从“多工具并列”进化为“一条被统一调度的领域编译流水线”。

#### 3.4 更工业化的方向不在于更复杂，而在于边界更清晰

工程系统一旦上规模，真正决定可维护性的不是“功能多少”，而是边界是否明确。对于 KiraFramework 来说，建议未来把边界重画为五层：

| 层级 | 目标 | 典型职责 |
| --- | --- | --- |
| Authoring Layer | 负责作者态输入 | Xlsx、YAML、Prefab、少量编辑器资产 |
| Schema Layer | 负责结构约束 | 字段类型、主键、引用、枚举、节点类型、合法路径规则 |
| Generation Layer | 负责编译产物 | 静态 API、枚举、ViewModel、运行时配置、校验报告 |
| Runtime Service Layer | 负责统一消费 | 配置访问、资源定位、UI 生命周期、事件分发 |
| Engine Adapter Layer | 负责引擎绑定 | Unity / UE 资源系统、页面系统、编辑器接入 |

一旦按这个模型重构，后续很多看似复杂的问题都会变简单。因为“哪些东西是可迁移的，哪些是引擎适配的，哪些应该全量校验，哪些适合增量生成”，都会在边界层面先得到答案。

### 四、下一阶段演进目标：把你的思路纳入主线设计

你新增的四条思路，其实并不是零散的改造项，而是共同指向一个更成熟的目标形态：

1. **静态调用链值类型配置化**：说明调用链不再只是“事件类或字符串常量”的二元结构，而是要演进为可扩展的“元数据类型系统”。
2. **导表双工作流**：说明生成链不该只区分“导表/不导表”，而应该区分“需要即时反馈的开发态产物”和“需要强一致性的构建态产物”。
3. **ViewModel 元数据缓存化**：说明元数据获取应从“实时反射式发现”升级为“预编译式注册”。
4. **尽可能脱离 Unity，向 UE 迁移**：说明框架重心必须进一步从引擎 API 迁移到配置管线、生成器与运行时抽象。

这四条思路如果单独做，容易变成零散优化；但如果放到同一条主线上，它们共同指向的是下面这个更清晰的目标：

```text
KiraFramework 未来应收束为：
一个由配置驱动、由元数据定义、由多阶段生成器编译、由运行时抽象服务消费、
并通过少量引擎适配层落地到 Unity / UE 的工程平台。
```

这个目标既解释了为什么要做 Luban 化、缓存化、增量化，也解释了为什么要做引擎解耦。

### 实现方案

### 一、静态调用链的下一阶段：从“字符串尾值”演进为“配置驱动的值类型系统”

#### 1.1 为什么要从固定叶子值改成类型系统

当前静态调用链的叶子节点实际上只有两种意义：

1. 空值，表示事件节点。
2. 非空字符串，表示常量值。

这对于原型阶段是合理的，但如果进入更真实的游戏项目，很快就会不够。因为“末尾值”在实际开发中并不只有资源路径和事件键两种语义。以下这些都是真实且高频的需求：

| 类型类别 | 典型用途 | 为什么适合放进静态调用链 |
| --- | --- | --- |
| `EventKey` | 事件标识 | 强类型注册/触发，编译期校验 |
| `ResPath` | `Resources` 或逻辑资源路径 | 避免硬编码路径 |
| `AddressKey` | Addressables / YooAsset 键 | 资源系统可替换 |
| `UIPageKey` | UI 页面逻辑标识 | 页面打开、层级管理、路由 |
| `SceneKey` | 场景逻辑标识 | 场景切换和场景白名单 |
| `ConfigTableKey` | 配置表逻辑标识 | 配置加载与版本管理 |
| `EnumLikeTag` | 玩法标签、状态标签、模块标签 | 减少字符串 Tag 的散落 |
| `AudioCueKey` | 音效/语音逻辑标识 | 音频系统统一路由 |
| `TimelineKey` | 演出/剧情逻辑标识 | 演出系统调用 |
| `LocalizationKey` | 多语言词条键 | 文本系统统一入口 |
| `ShaderParamKey` | 材质与渲染参数逻辑键 | 统一渲染命名规范 |

这意味着未来静态调用链不应该再只有“类”和“字符串常量”两个输出策略，而应该由配置显式决定叶子节点的语义类型。

#### 1.2 推荐的设计思路：表级别声明领域，列级别声明值类型

你提出的思路是：未来改成 `Luban + Xlsx` 之后，表格头就定义好“这个表里的条目都是什么类型”。这个方向非常好，而且非常符合工业化需求。推荐进一步收敛为两级控制：

1. **表级元信息**：声明这个表属于哪个领域，例如 `EventKeyTable`、`ResPathTable`、`UIPageTable`。
2. **列级元信息**：声明叶子值使用何种输出策略，例如 `LeafType=TypeOnly`、`LeafType=ConstString`、`LeafType=StructuredValue`。

表级别的好处是清晰、稳定、适合批量处理。列级别的好处是保留扩展性，使未来某些特殊领域可以有更细粒度的生成策略。

可以把表头元信息抽象成：

```text
TableName: UIPaths
Domain: ResPath
LeafType: ConstString
ValueType: string
OutputNamespace: Game.Statics
GeneratorStrategy: StaticPath
```

或者：

```text
TableName: GameplayEvents
Domain: EventKey
LeafType: TypeOnly
PayloadTypeColumn: PayloadType
OutputNamespace: Game.Statics
GeneratorStrategy: TypedEvent
```

#### 1.3 推荐把“叶子值类型”抽象成生成策略，而不是直接绑死到具体语言类型

如果从工程上设计，最稳妥的方式不是把 `ValueType` 仅理解为 `string/int/bool` 这样的 C# 类型，而是先把它抽象成**生成策略**。这是因为很多叶子值在业务上虽然最终也能被表示成字符串，但它们的代码生成规则和验证规则完全不同。

推荐至少区分以下几类生成策略：

| 生成策略 | 代码形态 | 典型场景 |
| --- | --- | --- |
| `TypeOnly` | 生成空类型或标识类型 | 事件键、状态键、逻辑标签 |
| `ConstScalar` | 生成 `const string/int/...` | 资源路径、配置键、文本键 |
| `StructuredConst` | 生成带多个字段的静态结构 | 资源定位信息、页面定义、场景元数据 |
| `TypedPayload` | 生成标识类型并附带 payload 元数据 | 带参数事件 |
| `RuntimeDescriptor` | 生成静态描述符对象 | UI 页面定义、配置表描述、音频定义 |

例如 `UIPageKey` 这个需求，在简单框架里常常只是一个页面名字符串，但在更成熟的工程里，页面定义往往同时需要：

- 逻辑页面名
- 页面层级
- Prefab 路径
- 是否常驻
- 是否唯一实例
- 打开策略

这类内容如果仍然挤压成单个字符串，就会限制后续扩展；但如果一开始把它作为 `StructuredConst` 或 `RuntimeDescriptor` 来设计，生成器就有空间输出更专业的接口形态。

#### 1.4 推荐的静态调用链中间表示

为了支持这些扩展，未来静态调用链的中间表示最好不再只是“路径数组 + 最终字符串”，而应显式包含节点语义：

```pseudo
StaticNode
    Name
    Children
    Domain
    LeafKind
    ScalarType
    ScalarValue
    PayloadType
    DescriptorFields
    ValidationRules
```

构建树的流程可以写成：

```pseudo
function BuildStaticTree(rows, tableMeta):
    root = CreateStaticNode("Root")

    for row in rows:
        current = root
        for segment in row.PathSegments:
            current = current.GetOrCreateChild(segment)

        current.Domain = tableMeta.Domain
        current.LeafKind = ResolveLeafKind(tableMeta, row)

        if current.LeafKind == TypeOnly:
            current.PayloadType = row.PayloadType

        if current.LeafKind == ConstScalar:
            current.ScalarType = tableMeta.ValueType
            current.ScalarValue = row.Value

        if current.LeafKind == RuntimeDescriptor:
            current.DescriptorFields = ExtractDescriptorFields(row)

    return root
```

这样一来，生成器面对的是稳定的语义模型，而不是“不同表格长得不一样”的原始输入。

#### 1.5 这套值类型系统的工业化意义

把静态调用链叶子节点做成类型系统，而不是简单字符串，有几个很大的长期收益：

1. **统一命名体系**：事件、资源、页面、配置表、场景可以共享一套层级化命名规则。
2. **统一验证入口**：可以针对不同 `Domain` 做不同校验，如路径存在性、页面层级合法性、场景白名单合法性。
3. **统一生成框架**：新增一个领域时不必重造一套工具，只需新增一个 `Domain + Strategy`。
4. **统一迁移能力**：静态接口层独立于 Unity 资源系统，未来切 Addressables、YooAsset、UE Asset Registry 时更容易适配。

这实际上是把“静态调用链”从一个功能点升级为一个可以持续扩展的平台能力。

### 二、导表工作流的迭代：增量 API 生成与全量配置导出的双轨方案

#### 2.1 你的问题非常关键：为什么不能一律全量导表

你提出的问题是非常典型的工程问题。全量导表的优点很明显：

1. 逻辑简单。
2. 结果一致。
3. 容易保证完整性。

但在真实开发中，全量导表也有明显问题：

1. 每次新增一个事件键、资源路径、枚举项都要跑完整流程，反馈太慢。
2. 开发者会因为“只是想马上拿到一个新的 API”而被迫等待整套导表完成。
3. 如果表规模增大、校验增多，全量流水线会越来越重，不适合作为高频本地操作。

所以，把导表工作流拆成两套，不是“多此一举”，而是非常合理的工程思路。

#### 2.2 推荐结论：开发态双轨，构建态全量收口

我建议把你的想法写得更明确一些：

> 在开发态，区分“接口级产物”和“数据级产物”；前者允许增量、追求即时反馈，后者坚持全量、追求一致性与安全性。  
> 在构建态和 CI 中，最终以全量校验与全量构建作为权威结果。

这个结论比“是否更好”更准确，因为它没有把双轨方案绝对化，而是给了它适用边界。

#### 2.3 哪些内容适合增量生成，哪些内容更适合全量导出

推荐按下面这条边界划分：

| 类别 | 适合增量 | 适合全量 | 原因 |
| --- | --- | --- | --- |
| 事件键、资源路径、枚举、UI 页面键 | 是 | 也可 | 主要影响接口层，局部变更后希望立刻可调用 |
| ViewModel 元数据注册、UI 描述符 | 是 | 也可 | 依赖结构定义，变化后希望快速更新开发接口 |
| 普通配置数据表 | 不建议作为唯一方式 | 是 | 经常涉及跨表引用、主键一致性、完整性校验 |
| 版本发布前最终产物 | 不应只做增量 | 必须 | 需要确定性、完整性、可追溯性 |

一句话概括：

```text
结构型产物适合增量
数据型产物应以全量为准
```

#### 2.4 双轨方案的优点

这套设计有明显优点：

1. **即时性更好**：开发者在 Xlsx 中新增事件键或页面定义后，可以迅速拿到新的强类型 API。
2. **人机交互更合理**：本地高频动作追求快反馈，低频权威动作追求高可靠，两类诉求被分开处理。
3. **工具链职责更清晰**：API 生成关注接口层变化，数据导出关注最终运行时数据的一致性。
4. **未来更利于跨引擎**：接口层生成本身几乎是纯文本编译，不依赖 Unity，天然适合做成 CLI 或独立工具。

#### 2.5 双轨方案的缺点与风险

这套设计也不是没有代价。需要在文档里明确说透：

1. **复杂度上升**：流水线从一条变两条，状态管理和依赖图维护成本都会增加。
2. **中间状态更多**：可能出现“API 已更新，但数据尚未全量导出”的开发态中间状态。
3. **错误表象更复杂**：本地看上去能编译通过，但某些跨表完整性问题要到全量校验阶段才会暴露。
4. **团队心智成本增加**：需要明确告诉开发者什么时候跑快速增量、什么时候跑权威全量。

这也是为什么双轨方案不能只写成“为了快所以做增量导表”，而必须强调它的使用边界和落地规范。

#### 2.6 这套方案是否真的更好

我的判断是：**对 KiraFramework 来说，这套方案是值得采用的，但前提是边界必须清楚。**

更准确地说：

1. 如果项目规模较小、表格极少，那么双轨方案的工程收益不一定大于复杂度成本。
2. 但如果你的目标本来就是更工业化、更专业化、更接近真正的大型工具链，那么开发态增量、构建态全量是很典型也很成熟的设计。
3. 对 KiraFramework 尤其成立，因为它的核心卖点之一就是“快速把配置变化反馈成可调用接口”。这与增量 API 生成天然契合。

所以可以在文档中给出一个更稳健的结论：

> 双轨方案不是为了追求“局部更快”而牺牲安全性，而是通过“增量生成接口、全量构建数据”的职责分离，在即时反馈与最终一致性之间取得平衡。

#### 2.7 推荐的双轨流水线

推荐将未来的导表工作流明确拆成两条：

```text
Pipeline A: Fast API Generation
    面向开发态
    输入：结构类表（事件、资源、枚举、UI、ViewModel 定义）
    输出：静态 API、枚举、描述符、注册缓存

Pipeline B: Authoritative Data Build
    面向构建态/提交前/CI
    输入：所有配置表
    输出：运行时数据、最终校验报告、版本化产物
```

它们的关系不是替代，而是互补：

```text
开发过程中频繁跑 Pipeline A
提交前和构建时强制跑 Pipeline B
```

#### 2.8 推荐的增量实现思路

增量 API 生成不应基于“猜哪个文件变了”这种脆弱方式，而应基于**输入签名和依赖图**。

可以抽象为：

```pseudo
InputSignature
    FilePath
    LastWriteTime
    ContentHash
    SchemaHash

GenerationDependencyGraph
    Table -> GeneratedArtifacts
    Table -> DependentTables
    Artifact -> GeneratorStrategy
```

增量流程伪代码如下：

```pseudo
function RunFastApiGeneration(changedFiles):
    changedTables = ResolveChangedTables(changedFiles)
    affectedArtifacts = DependencyGraph.FindAffectedArtifacts(changedTables)

    for artifact in affectedArtifacts:
        manifestFragment = BuildManifestFragment(artifact.RequiredTables)
        ValidateFragment(manifestFragment)
        GenerateArtifact(artifact, manifestFragment)

    WriteIncrementalReport(changedTables, affectedArtifacts)
```

这里最关键的是 `BuildManifestFragment`。如果没有统一的中间表示，增量就会退化为“每个生成器自己推断受影响范围”，那会非常难维护。

#### 2.9 推荐的全量实现思路

全量导出要承担的是“权威性”而不是“速度优先”。所以全量链路应当做更多校验，例如：

1. 主键重复检测。
2. 跨表引用检测。
3. 枚举引用合法性检测。
4. 资源定义与实际资产一致性检测。
5. 配置版本与导出清单一致性检测。

全量流程伪代码如下：

```pseudo
function RunAuthoritativeDataBuild():
    allTables = DiscoverAllTables()
    manifest = BuildFullManifest(allTables)

    report = ValidateFullManifest(manifest)
    if report.HasError:
        FailBuild(report)

    ExportRuntimeData(manifest)
    ExportVersionManifest(manifest)
    WriteBuildReport(report)
```

#### 2.10 最推荐的落地方式

如果让我给这套双轨方案下一个工程建议，我会写成下面这样：

1. 本地编辑 Xlsx 后，允许快速执行“增量 API 生成”。
2. 本地运行游戏前，若只涉及结构型表，可以直接依赖增量结果。
3. 提交代码前，必须执行一次全量导出与全量校验。
4. CI 与正式构建只认全量构建结果，不认本地增量结果。

这套规则既保留即时性，也保留权威性，是比较稳健的平衡点。

### 三、ViewModel 生成器的演进：从实时反射扫描到生成缓存

#### 3.1 当前方案的优点和问题

当前 `MVVMDataCache` 的实现，是在编辑器域中通过反射扫描打了特性标记的 Model 与字段。这个方案的优点是：

1. 实现直接。
2. 不需要额外生成步骤。
3. 对原型阶段非常友好。

但当规模增大后，它会逐渐暴露问题：

1. 每次域重载、脚本重编译后都需要再次扫描。
2. Inspector 打开和编辑时依赖反射结果，性能和稳定性容易受程序集规模影响。
3. 元数据的权威来源仍然是“运行时/编辑器实时发现”，而不是“编译期显式产物”。
4. 这种模式对未来跨引擎迁移不友好，因为 UE 侧不会天然复用 Unity 风格的编辑器反射流程。

所以，把它从实时反射查询改为生成缓存，是非常值得做的一步。

#### 3.2 推荐目标：把反射从高频操作变成低频生成步骤

推荐的目标不是“完全不用反射”，而是：

> 允许在生成阶段扫描一次，但不要在编辑器使用阶段反复依赖实时反射。

也就是说，未来更合理的模型是：

```text
源码中的 Attribute
-> 生成阶段扫描
-> 输出显式元数据缓存
-> Inspector / Generator 读取缓存
```

这样 Attribute 仍然保留为作者态声明方式，但消费这些声明的方式从“随用随反射”变成“先编译成注册表再使用”。

#### 3.3 推荐的缓存形态

这份缓存可以有两种常见形态：

1. **生成 C# 注册表**
2. **生成 JSON / 二进制元数据文件**

对 KiraFramework 当前阶段，我更推荐先生成 C# 注册表，因为：

1. 直接参与编译，类型名更稳定。
2. 不必额外考虑缓存文件的读取格式和解析器。
3. 与现有“生成代码”思路保持一致。

可以把它设计成类似：

```pseudo
GeneratedMVVMRegistry
    Models:
        TestHPModel:
            Fields:
                CurrentHP -> int
                MaxHP -> int
```

其伪代码流程如下：

```pseudo
function BuildMvvmRegistry():
    modelTypes = ScanAssembliesForAttribute(MVVMModelAttribute)
    registry = CreateEmptyRegistry()

    for modelType in modelTypes:
        fields = ScanMembersForAttribute(modelType, MVVMFieldAttribute)
        registry.Add(modelType, fields)

    GenerateRegistryCode(registry)
```

生成后的消费流程则是：

```pseudo
function GetFieldsForModel(modelName):
    return GeneratedMVVMRegistry.Models[modelName].Fields
```

#### 3.4 这一步带来的收益

把实时反射改成生成缓存，收益非常明确：

1. **稳定性更高**：Inspector 与 ViewModelGenerator 不再依赖每次域重载后的即时扫描结果。
2. **性能更稳定**：扫描成本从高频交互阶段前移到低频生成阶段。
3. **错误更前置**：某个 Model 或字段不符合生成规则时，可以在生成阶段直接报错。
4. **更利于跨引擎**：元数据注册表本身是纯结构化产物，不依赖 Unity 编辑器实时反射机制。

#### 3.5 需要诚实写出的代价

这一步也有代价，文档中需要写明：

1. 缓存可能过期。
2. 工具链需要知道何时重新生成缓存。
3. 若生成失败，Inspector 看到的是旧注册表还是空注册表，需要明确定义。

推荐的解决策略是：

1. 把注册表生成纳入统一流水线，而不是做成一个孤立工具。
2. 在生成报告中显示“哪些 Model 元数据发生变化”。
3. 当注册表过期或缺失时，Inspector 给出明确提示，而不是静默降级。

#### 3.6 对 MVVM 体系的更进一步建议

如果已经开始把元数据编译成注册表，那么下一步就不该只停留在“字段列表缓存”，而应顺势考虑把下面这些内容也建模进去：

| 元数据 | 用途 |
| --- | --- |
| 字段暴露名 | ViewModel 属性名生成 |
| 字段类型 | 属性类型、校验规则 |
| 是否只读 | 控制绑定方式 |
| 默认值策略 | 初始化逻辑 |
| 命令定义 | 未来命令生成 |
| 校验器描述 | 未来表单或配置检查 |

也就是说，这次缓存化不只是一次性能优化，而是一次把 MVVM 元数据正式收编进整体生成管线的机会。

### 四、尽可能脱离 Unity 依赖：面向 UE 迁移的架构重划

#### 4.1 需要先说清楚一件事：完全零改动迁移并不现实

你希望这个框架将来只需少量改动，甚至理想情况下不改动就能迁移到 UE。这个目标的方向非常对，但如果从技术上严格表述，需要稍微收一下：

> 对于配置定义、静态接口、元数据结构、生成策略和运行时抽象，的确应该争取做到零改动或近零改动迁移。  
> 但对于引擎对象生命周期、UI 系统、资源系统、编辑器接入、序列化管线，完全零改动迁移并不现实。

原因很直接。当前项目里仍然有大量 Unity 特征：

- `MonoBehaviour`
- `ScriptableObject`
- `Resources.Load`
- `AssetDatabase`
- `EditorWindow`
- Prefab 扫描与回填
- Canvas/UI 层级体系

这些不可能原封不动搬进 UE。

所以更合理、也更专业的目标是：

> 作者态配置、Schema、静态调用链命名体系、配置导出逻辑、元数据注册规则、生成框架整体结构尽量零改动；  
> 引擎侧只替换适配层和少量宿主集成代码。

这才是可实现的跨引擎目标。

#### 4.2 当前 Unity 依赖主要集中在哪些地方

为了迁移，首先要把依赖拆明白：

| 依赖点 | 当前形态 | 是否可抽离 |
| --- | --- | --- |
| 配置定义载体 | `ScriptableObject` | 可替换为 `Xlsx + Schema` |
| 运行时宿主对象 | `MonoBehaviour` / `KiraObject` | 需抽象运行时接口 |
| 资源加载 | `Resources.Load` | 可替换为 `IAssetProvider` |
| UI 层级与页面管理 | `Canvas` / `UIManager` | 需抽象为 `IUIRuntime` |
| 编辑器工具入口 | Unity Editor 菜单、Inspector | 应迁移到 CLI + 引擎适配工具 |
| Prefab 扫描与绑定 | Unity Prefab API | 需要重写为引擎适配层 |

从表里可以看出，最容易跨引擎复用的其实不是当前的宿主层，而是：

1. 配置结构与 Schema
2. 静态调用链命名体系
3. 生成器的中间表示
4. 配置导出与校验逻辑
5. 元数据注册表

这恰恰说明未来要尽快把框架重心从 Unity Editor 资产迁移到更通用的作者态输入和生成阶段。

#### 4.3 推荐的跨引擎分层

建议未来把框架拆成四个大的包或模块：

```text
Kira.Core
    纯元数据模型、生成中间表示、运行时抽象接口

Kira.Toolchain
    配置读取、Schema 校验、代码生成、数据导出、报告生成

Kira.UnityAdapter
    Unity 特有的资源系统、UI 运行时、编辑器接入

Kira.UnrealAdapter
    UE 特有的资产系统、UI/UMG 运行时、工具接入
```

这里最重要的不是拆包本身，而是职责的重新分配：

1. `Kira.Core` 不应知道 `MonoBehaviour`、`ScriptableObject`、`Canvas` 这类引擎概念。
2. `Kira.Toolchain` 不应要求在 Unity 编辑器中才能运行。
3. 适配层只负责把通用的描述符和接口翻译到具体引擎。

#### 4.4 推荐的运行时抽象接口

例如，运行时至少可以抽出这些接口：

```pseudo
interface IAssetProvider:
    function Load(pathOrKey, assetType)
    function Exists(pathOrKey)

interface IConfigProvider:
    function GetTable(tableKey)
    function GetVersion(tableKey)

interface IUIRuntime:
    function Show(pageDescriptor, data)
    function Hide(pageDescriptor)
    function Close(pageDescriptor)

interface IEventRuntime:
    function Register(eventType, callback)
    function Fire(eventType, payload)
```

当前 Unity 的 `UIManager`、`Resources.Load`、`EventManager` 都可以视为这些接口的早期特化实现。未来不应直接把这些类搬去 UE，而应让它们退化为 Unity 适配实现。

#### 4.5 推荐的跨引擎调用方式

以 UI 页面为例，未来理想的调用方式不是：

```csharp
Resources.Load(...)
UIManager.Show<SomeUnityPage>()
```

而是：

```pseudo
page = UiCatalog.Main.HUD.Inventory
uiRuntime.Show(page, openData)
```

其中：

- `UiCatalog.Main.HUD.Inventory` 是生成出来的静态描述符。
- `uiRuntime` 是引擎适配层提供的接口实现。

这时如果迁移到 UE，业务层调用保持不变，只需要把 `uiRuntime` 的具体实现换成 UE 版。

#### 4.6 对 UE 迁移可行性的更现实分析

如果把目标写得更专业一些，建议这样表述：

| 迁移对象 | 目标 |
| --- | --- |
| 配置表与 Schema | 争取零改动迁移 |
| 静态调用链结构与命名体系 | 争取零改动迁移 |
| 中间表示与生成策略 | 争取零改动迁移 |
| 运行时抽象接口 | 少量改动迁移 |
| Unity 具体页面类 / Prefab 扫描逻辑 | 必须重写适配 |
| 编辑器入口与宿主集成 | 必须按引擎重做 |

这样写既保留了你的目标，也不会在技术上显得不切实际。

### 五、从 ScriptableObject 到 Luban + Xlsx：把你的思路和更完整的工业化方案合并

#### 5.1 迁移的核心原因

从当前项目往下演进，选择 `Luban + Xlsx` 的原因不是“换一种配置方式”，而是：

1. `ScriptableObject` 作为作者态输入太依赖 Unity 编辑器。
2. 配置结构、生成规则和运行时消费格式还没有完全解耦。
3. 更复杂的配置域和跨表关系，需要更正式的 Schema 与导出体系。
4. 如果未来考虑跨引擎、独立工具链、CI 校验，配置编译必须脱离 Unity 宿主。

而 `Luban + Xlsx` 天然适合承载：

- 表结构定义
- 多语言代码生成
- 多格式数据导出
- 构建前校验
- 引擎无关的作者态输入

#### 5.2 推荐的总体迁移原则

这里非常关键的一点是：**不要让 Luban 直接替代所有 Kira 生成器。**

更专业的定位应该是：

```text
Luban 负责配置结构与数据的标准化编译
Kira 负责静态接口、元数据注册、UI/VM 描述符等框架特有接口的生成
```

换句话说：

- Luban 解决的是“数据如何稳定被编译出来”。
- Kira 解决的是“这些数据如何进一步变成框架级接口和工程级约束”。

这两者不是互斥，而是上下游关系。

#### 5.3 推荐的作者态分类

未来推荐把作者态输入按领域拆清楚，而不是混成一个配置大杂烩：

| 领域 | 推荐输入 | 用途 |
| --- | --- | --- |
| 事件定义 | `Events.xlsx` | 定义事件路径、领域、Payload 类型、标签 |
| 静态资源定位 | `Assets.xlsx` | 定义逻辑路径、资源键、资源类型、加载策略 |
| UI 页面定义 | `UIPages.xlsx` | 定义页面层级、逻辑名、页面类型、打开策略 |
| ViewModel 元数据 | `ViewModels.xlsx` | 定义 ViewModel 与 Model、字段暴露关系、别名 |
| 枚举定义 | `Enums.xlsx` | 定义枚举名、成员、顺序、显示名 |
| 普通业务配置 | 若干业务表 | 数值、道具、关卡、任务、商店等 |

这一步的价值不是“整齐”，而是未来不同领域可以走不同验证规则和不同生成策略。

#### 5.4 推荐的中间表示

所有生成器未来都不应直接读 Excel 或 `ScriptableObject`，而应统一依赖一个中间表示，例如：

```pseudo
KiraManifest
    StaticDefs
    EventDefs
    AssetDefs
    UiPageDefs
    ViewModelDefs
    EnumDefs
    ConfigTableDefs
    Reports
```

构建流程如下：

```pseudo
function BuildKiraArtifacts():
    authoringSources = LoadAuthoringSources()
    manifest = BuildKiraManifest(authoringSources)

    report = ValidateManifest(manifest)
    if report.HasError:
        FailBuild(report)

    GenerateStaticApis(manifest.StaticDefs)
    GenerateUiDescriptors(manifest.UiPageDefs)
    GenerateViewModelRegistry(manifest.ViewModelDefs)
    GenerateEnums(manifest.EnumDefs)
    ExportRuntimeConfigs(manifest.ConfigTableDefs)

    WriteGenerationReport(report)
```

这条伪代码其实已经把你提出的所有迭代方向容纳进来了：

1. 静态调用链值类型配置化，体现在 `StaticDefs` 的结构语义中。
2. 双轨导表，体现在不同生成阶段可拆分执行。
3. ViewModel 缓存化，体现在 `GenerateViewModelRegistry`。
4. 去 Unity 化，体现在 `authoringSources` 与 `Generate/Export` 均不必依赖 Unity 编辑器。

#### 5.5 推荐的双阶段生成流程

迁移到 `Luban + Xlsx` 之后，最值得建立的是下面这个双阶段生成框架：

```text
Stage A: Schema and Data Compilation
    由 Luban 负责
    输入：Xlsx + Schema
    输出：标准配置产物、结构元数据

Stage B: Framework Interface Compilation
    由 Kira Generator 负责
    输入：Luban 产物 + KiraManifest
    输出：静态 API、UI 描述符、MVVM 注册表、引擎适配描述符
```

这样未来即便不是 Unity，也依然可以复用 Stage A 和大部分 Stage B。

### 六、推荐的阶段性迭代计划

#### 阶段一：先抽离中间表示，不急着换输入源

目标：

1. 让现有 `ScriptableObject`、Prefab、Excel 输入都先能映射为 `KiraManifest`。
2. 保留现有生成结果和用户使用方式。
3. 把校验和报告纳入统一管线。

这一阶段的价值在于“先统一语义，再替换载体”。如果这一步不做，后续从 `ScriptableObject` 切到 Xlsx 时会非常痛苦，因为每个生成器都在直接耦合原始输入。

#### 阶段二：落地静态调用链值类型系统

目标：

1. 把 `EventKey`、`ResPath`、`UIPageKey` 等领域显式建模。
2. 建立 `Domain + GeneratorStrategy` 机制。
3. 让静态调用链从“字符串尾值”升级为“领域化接口层”。

这一步完成后，KiraFramework 的标志性能力会明显增强，因为它会从一个“生成静态类的工具”升级成一个“生成领域接口的框架”。

#### 阶段三：引入增量 API 生成

目标：

1. 先把事件、枚举、资源路径、UI 页面定义这些结构型输入支持增量生成。
2. 仍保留全量构建作为权威出口。
3. 生成清晰的增量报告，避免开发者误以为所有问题都已被覆盖。

这一阶段是用户体验提升最明显的一步，因为开发者会直接感受到“加一个新事件键，几乎马上就能在代码里用”。

#### 阶段四：ViewModel 元数据缓存化

目标：

1. 让 Attribute 扫描转成生成步骤。
2. 输出稳定注册表。
3. 让 Inspector 与 Generator 都依赖注册表而非实时反射。

这一步不仅优化性能，也是在把 MVVM 正式纳入统一生成体系。

#### 阶段五：迁移到 Luban + Xlsx

目标：

1. 先迁移事件、资源、枚举与普通业务配置表。
2. 再迁移 UI 页面描述和 ViewModel 描述。
3. 最终清理旧的 `ScriptableObject` 作者态入口。

不建议一口气全迁。分领域迁移会更稳健，也更容易逐步建立新流水线的可信度。

#### 阶段六：拆分 Core 与引擎 Adapter

目标：

1. 明确哪些逻辑属于 `Kira.Core`。
2. 让 Unity 变成一个适配层，而不是框架本体。
3. 为未来 UE 适配提前铺好结构。

一旦这一步完成，KiraFramework 就不再只是一个 Unity 编辑器工具集，而是更接近一个独立的工程平台。

### 七、风险控制与验证策略

#### 7.1 必须建立的验证体系

随着工具链变复杂，最需要补强的不是更多功能，而是验证体系。未来建议至少建立以下校验：

1. 静态调用链路径冲突检测。
2. 非法标识符检测。
3. 同名节点跨领域冲突检测。
4. UI 页面层级和页面定义完整性检测。
5. ViewModel 绑定目标缺失检测。
6. 配置表主键、外键、枚举引用、资源引用合法性检测。
7. 增量生成结果与全量结果的一致性抽样验证。

没有这些校验，导表工作流越复杂，最终越容易陷入“本地看似没问题，后面构建炸掉”的状态。

#### 7.2 必须明确的权威性规则

未来建议明确写入工具链规范：

1. 增量 API 生成结果仅对开发态即时反馈负责。
2. 全量构建结果对提交、构建、发布负责。
3. 当两者冲突时，以全量构建结果为准。
4. 生成报告必须能说明当前是“增量结果”还是“权威全量结果”。

这类规则越早定，后续团队协作成本越低。

#### 7.3 推荐的工程产物

为了让工具链更可观测，未来建议每次生成后至少产出：

| 产物 | 作用 |
| --- | --- |
| `GenerationReport.md/json` | 记录本次生成了哪些文件、是否增量、是否有告警 |
| `ValidationReport.md/json` | 记录校验结果 |
| `VersionManifest` | 记录输入签名、导出版本、生成时间 |
| `ArtifactIndex` | 记录每个输入表对应哪些生成产物 |

这会让整个系统更接近真正的工程工具链，而不是“执行完后只有一堆文件变了”。

### 总结
KiraFramework 当前最值得保留的，不是某几个已经写出来的类，而是它已经证明了一条非常正确的方向：**把配置和元数据视为事实源，把代码和运行时数据视为编译产物，把工具链视为开发流程中的主角而不是附属脚本。**

在这个基础上，你提出的四条演进思路其实非常一致，并且都指向更专业的工程形态：

1. 静态调用链值类型配置化，让调用链从“字符串映射”升级为“领域化接口系统”。
2. 增量 API 生成与全量配置导出并行，让开发即时性和构建安全性各归其位。
3. ViewModel 从实时反射扫描走向生成缓存，让元数据真正成为编译期产物。
4. 把框架重心从 Unity 宿主层移到配置管线、生成器与运行时抽象，让未来迁移 UE 成为可规划的工程目标，而不是口号。

从更高一层看，KiraFramework 的下一阶段不应只理解为“把 ScriptableObject 换成 Luban + Xlsx”，而应理解为一次更完整的体系升级：

```text
从 Unity 编辑器内的多工具集合
升级为一条由 Schema 驱动、由生成器编译、由报告与校验托底、
并可通过适配层落地到不同引擎的工程化配置平台
```

如果未来按“先统一中间表示，再做值类型系统，再做增量/全量双轨，再做 ViewModel 缓存化，最后完成 Luban 化与引擎解耦”的顺序推进，那么这个项目不仅能把当前思路讲清楚，还能逐步成长为一套真正有专业深度、有迁移能力、有工业化潜力的框架设计实践。

## 元数据
- **创建时间：** 2026-04-22
- **最后更新：** 2026-04-22
- **作者：** 吉良吉影
- **分类：** KiraFramework讲解和迭代日志
- **标签：** KiraFramework、代码生成、Unity工具链、Luban、Xlsx、架构设计、工程化、跨引擎迁移
- **来源：** 基于 `D:\MyGit\KiraFramework-Analysis` 项目脚本、原说明文档及新增迭代思路重写整理

---
*本文档以当前项目代码为基础，聚焦技术结构、设计思路、工业化扩展方向与后续迭代方案。*
