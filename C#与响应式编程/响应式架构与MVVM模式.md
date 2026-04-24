# 响应式架构与MVVM模式

## 摘要
响应式架构与MVVM模式结合，为Unity开发提供了清晰的分层结构和数据驱动设计。本文介绍如何在Unity中实现响应式MVVM架构，分离业务逻辑与UI表现，提升代码的可测试性和可维护性。内容涵盖基础 MVVM 的三层职责划分、数据绑定实践，以及工程化边界设计的十条原则。

## 正文

### 背景
在传统的 Unity 开发中，我们经常会遇到"巨型 MonoBehaviour"的问题——一个脚本包揽了数据管理、UI 逻辑、网络请求、动画控制等所有职责。这导致代码耦合严重、难以测试、团队协作效率低下。

MVVM（Model-View-ViewModel）模式的引入，将应用程序拆分为更小的、职责单一的组件，从而提高代码质量和开发效率。结合响应式编程（如 UniRx），我们可以实现声明式的数据绑定，让 ViewModel 数据变化自动驱动 View 更新。

### 1. 为什么选择 MVVM？

MVVM 是一种用于构建用户界面的架构模式，它将应用程序划分为三个核心部分：

- **Model（模型）：** 负责应用程序的**数据和业务逻辑**。它独立于 UI，可以包含数据获取、存储、验证、业务规则等。Model 不关心 View 和 ViewModel 的存在，它只关注数据本身。
- **View（视图）：** 负责显示 UI 界面。它通常由 Unity 的 UI 组件（Canvas, Button, Text 等）构成。View 仅负责**展示数据和接收用户输入**，它不包含业务逻辑，只知道如何把数据绑定到 UI 上以及如何把 UI 事件传递出去。
- **ViewModel（视图模型）：** 连接 View 和 Model 的桥梁。它负责将 Model 的数据转换为 View 可以展示的格式，并将 View 的用户输入转换为 Model 可以处理的命令。ViewModel 不直接操作 View，而是通过**数据绑定**来驱动 View 的更新。

**MVVM 的核心优势：**

1. **关注点分离：** 将数据逻辑、展示逻辑和 UI 表现彻底分离。
2. **可测试性：** ViewModel 是纯 C# 类，不依赖 MonoBehaviour，可以脱离 Unity 环境做单元测试。
3. **可维护性：** 变更只影响受影响的部分：改布局只动 View，改业务只动 Model，改展示只动 ViewModel。
4. **团队协作：** 美术、UI 设计师、开发者可以并行工作。

### 2. Unity 中的响应式 MVVM 实现

#### 2.1 ViewModel 基本结构

基于 UniRx 的 ViewModel 包含以下核心元素：

```csharp
using UniRx;
using System;

public class LoginViewModel
{
    // 输入属性
    public ReactiveProperty<string> Username = new ReactiveProperty<string>("");
    public ReactiveProperty<string> Password = new ReactiveProperty<string>("");

    // 状态属性
    public ReactiveProperty<bool> IsLoggingIn = new ReactiveProperty<bool>(false);
    public ReactiveProperty<string> ErrorMessage = new ReactiveProperty<string>("");

    // 派生属性 - 至少输入了内容才能点击登录
    public IReadOnlyReactiveProperty<bool> CanLogin;

    // 命令
    public ReactiveCommand LoginCommand { get; private set; }

    private IAuthService _authService;

    public LoginViewModel(IAuthService authService)
    {
        _authService = authService;

        // 派生属性：用户名和密码都不为空时可登录
        CanLogin = Observable.CombineLatest(
            Username.Select(u => !string.IsNullOrEmpty(u)),
            Password.Select(p => !string.IsNullOrEmpty(p)),
            (hasUser, hasPwd) => hasUser && hasPwd && !IsLoggingIn.Value
        ).ToReactiveProperty();

        // 命令绑定可执行状态
        LoginCommand = new ReactiveCommand(CanLogin);
        LoginCommand.Subscribe(_ => OnLogin());
    }

    private async void OnLogin()
    {
        IsLoggingIn.Value = true;
        ErrorMessage.Value = "";

        try
        {
            var result = await _authService.LoginAsync(Username.Value, Password.Value);
            if (!result.Success)
                ErrorMessage.Value = result.Error;
        }
        catch (Exception e)
        {
            ErrorMessage.Value = $"网络错误: {e.Message}";
        }
        finally
        {
            IsLoggingIn.Value = false;
        }
    }
}
```

#### 2.2 View 绑定

```csharp
using UnityEngine;
using UnityEngine.UI;
using UniRx;

public class LoginView : MonoBehaviour
{
    public InputField usernameInput;
    public InputField passwordInput;
    public Button loginButton;
    public Text errorText;
    public GameObject loadingIndicator;

    private LoginViewModel _viewModel;

    public void Bind(LoginViewModel viewModel)
    {
        _viewModel = viewModel;

        // View -> ViewModel（双向绑定的输入方向）
        usernameInput.OnValueChangedAsObservable()
            .Subscribe(val => viewModel.Username.Value = val)
            .AddTo(this);
        passwordInput.OnValueChangedAsObservable()
            .Subscribe(val => viewModel.Password.Value = val)
            .AddTo(this);

        // ViewModel -> View（状态驱动 UI 更新）
        viewModel.ErrorMessage
            .Subscribe(msg => errorText.text = msg)
            .AddTo(this);

        viewModel.IsLoggingIn
            .Subscribe(loading => loadingIndicator.SetActive(loading))
            .AddTo(this);

        // 绑定按钮到命令
        loginButton.OnClickAsObservable()
            .BindTo(viewModel.LoginCommand)
            .AddTo(this);
    }
}
```

这种模式让 View 变成了 ViewModel 的投影。UI 控件的状态完全由 ViewModel 的数据驱动，而不是通过查找组件或 GetComponent 手动更新。

### 3. 依赖注入与服务层

MVVM 的可测试性关键：ViewModel 不自己实例化服务，而是通过**依赖注入**获取。

```csharp
// 服务接口
public interface IAuthService
{
    IObservable<LoginResult> LoginAsync(string username, string password);
}

// 使用方式
public class LoginViewModel
{
    private readonly IAuthService _authService;
    private readonly INavigationService _navigationService;

    public LoginViewModel(IAuthService auth, INavigationService nav)
    {
        _authService = auth;
        _navigationService = nav;
    }
}
```

测试时可以这样注入模拟服务：

```csharp
[Test]
public void TestLoginFailureShowsError()
{
    var mockAuth = new MockAuthService(returnSuccess: false);
    var mockNav = new MockNavigationService();
    var vm = new LoginViewModel(mockAuth, mockNav);

    vm.Username.Value = "test";
    vm.Password.Value = "123";
    vm.LoginCommand.Execute();

    Assert.IsFalse(string.IsNullOrEmpty(vm.ErrorMessage.Value));
}
```

### 4. 组件化与层级通信

复杂界面中，View 和 ViewModel 不一定是 1:1 关系。一个主面板可以拆成多个子 ViewModel：

```csharp
public class MainPanelViewModel
{
    public PlayerViewModel Player { get; private set; }
    public InventoryViewModel Inventory { get; private set; }
    public QuestViewModel Quests { get; private set; }

    public MainPanelViewModel(IPlayerService player, IInventoryService inv)
    {
        Player = new PlayerViewModel(player);
        Inventory = new InventoryViewModel(inv);
        Quests = new QuestViewModel();
    }
}
```

子 ViewModel 之间的通信通过父 ViewModel 协调，或通过消息总线（MessageBroker）实现。不应让子 ViewModel 直接操作兄弟模块的状态。

### 5. 工程化深化：Unity MVVM 的边界设计

#### 5.1 ViewModel 不是 MonoBehaviour 的搬家
很多团队初次实践 MVVM 时，会把原本写在 MonoBehaviour 里的字段和方法搬到 ViewModel，但依然让 ViewModel 直接操作 GameObject、Transform、Animator 或 AudioSource。这样只是换了文件名，并没有获得可测试性和解耦收益。ViewModel 应主要表达界面状态、用户命令和业务交互结果；具体控件、动画和 Unity 对象仍由 View 负责。

边界清楚后，ViewModel 可以脱离 Unity 场景做单元测试，View 也可以替换皮肤或布局。

#### 5.2 Model 层应保持领域语义
Model 不是简单的数据结构集合，它代表业务事实和规则。账号状态、角色属性、背包数据、任务进度都可以是 Model，但 Model 不应知道某个 Text、Button 或红点节点如何刷新。若 Model 直接暴露可写 ReactiveProperty 给 UI，UI 就可能绕过服务层修改业务状态。

推荐 Model 提供领域方法或只读状态，ViewModel 负责把它转换成界面可绑定形式。这种转换层让界面状态成为可维护的投影，而不是让 View 直接理解所有业务细节。

#### 5.3 命令是 ViewModel 的行为边界
ViewModel 不应只暴露一堆属性，还应通过命令表达用户可以做什么。登录、购买、领取、刷新都可以是命令。命令内部可以调用服务、更新状态、处理错误和控制并发。这样 View 只需要绑定按钮到命令，而不需要知道业务流程。

命令还可以统一处理可执行状态。比如购买按钮是否可点，取决于余额、库存、网络状态和是否正在请求；这些判断集中在 ViewModel 命令中，比散落在多个按钮脚本里更安全。

#### 5.4 双向绑定要谨慎使用
输入框和滑条常需要双向绑定，但双向绑定也容易形成循环。用户输入更新 ViewModel，ViewModel 格式化后又更新输入框，输入框再次触发事件。如果没有去重、来源标记或静默设置方法，就会产生重复通知。

对于复杂表单，建议区分草稿状态和已提交状态。输入框绑定草稿属性，点击提交命令后校验并写入业务 Model。这样既能支持取消编辑，也能避免无效中间态污染业务层。

#### 5.5 导航和弹窗不应散落在 ViewModel 各处
ViewModel 经常需要触发页面跳转、弹窗确认、Toast 提示等表现行为。如果直接引用具体 UI 管理器，ViewModel 会重新依赖 Unity。可以通过导航服务接口、对话框服务接口或一次性 UI 事件流表达这些需求。测试时注入假的服务，运行时由 View 实现。

例如登录成功后，ViewModel 调用 `INavigationService.GoToHome()`，而不是直接加载场景。需要确认删除时，ViewModel 发起 `IDialogService.Confirm`，根据结果继续执行命令。

#### 5.6 MVVM 的性能问题主要来自绑定粒度
如果每个小字段都单独订阅，界面复杂后订阅数量会很大；如果整块数据用一个属性更新，又会导致过度刷新。绑定粒度需要按 UI 结构设计。稳定文本和按钮状态可以单独属性；大型列表应使用差量集合和虚拟化；复杂面板可以按区域拆分子 ViewModel。

ViewModel 不应频繁创建临时字符串和对象。倒计时文本可以节流到秒级刷新；数据变化可以在稳定后刷新；列表筛选可以使用防抖。MVVM 强调可观察状态，但不要求所有状态毫无节制地实时广播。

#### 5.7 可测试性要覆盖状态和命令序列
MVVM 的收益要通过测试兑现。ViewModel 测试可以不启动 Unity 场景，直接设置输入属性、执行命令、断言状态变化。登录失败时错误提示是否更新、登录中按钮是否禁用、取消请求后是否不跳转、表单无效时命令是否不可执行，这些都适合单元测试。

测试时应避免依赖真实网络、真实资源和真实时间。服务通过接口注入，异步流程使用可控任务，这样 ViewModel 才真正与表现层分离。

#### 5.8 团队协作中要统一绑定规范
MVVM 项目如果没有规范，很容易出现多种写法并存。团队应统一命名、生命周期、绑定方式、命令封装、错误处理和释放策略。规范不必复杂，但必须一致。

可以建立模板：每个界面包含 View、ViewModel、可选 Model Adapter；View 只处理 Unity 组件和表现；ViewModel 暴露只读状态和命令；订阅绑定到 View 生命周期；列表项有独立 ItemViewModel；命令错误通过统一通道返回。

#### 5.9 复杂界面应拆分为子 ViewModel
大型界面如果只有一个 ViewModel，很快会积累几十个属性和命令，最终变成新的复杂脚本。背包界面可以拆成筛选栏、列表、详情、操作区；角色界面可以拆成属性、装备、技能、预览；商城界面可以拆成分页、商品卡、购买确认和货币栏。

拆分的关键是数据流方向清晰。子 ViewModel 可以向父级报告选择变化或命令结果，但不应随意修改兄弟模块状态。跨区域联动由父级协调，或通过明确的服务完成。

#### 5.10 MVVM 落地应允许渐进迁移
已有项目不适合一次性把所有界面改成 MVVM。可以先从高复杂度、高复用、高维护成本的界面开始：登录、背包、商城、任务、设置。新界面按 MVVM 模板写，旧界面逐步把业务状态抽到 ViewModel。渐进迁移能降低风险，也能让团队在真实问题中调整规范。

迁移时不要追求形式统一而牺牲稳定性。简单一次性弹窗可以保持轻量脚本；复杂数据界面使用完整 MVVM。架构模式服务项目，不是反过来让项目服从模式。

### 实现方案

1. **建造 ViewModel 骨架**：每个界面层建立对应的 ViewModel，包含输入属性（ReactiveProperty）、输出属性（IReadOnlyReactiveProperty）、派生属性和命令（ReactiveCommand）。

2. **注入而非实例化**：ViewModel 所需的服务通过构造函数注入（IAuthService、INavigationService 等），保持纯 C# 可测试性。

3. **View 只做绑定**：View 脚本不包含业务逻辑，只负责将 ViewModel 属性绑定到 UI 控件，将 UI 事件绑定到 ViewModel 命令。

4. **子 ViewModel 拆分**：复杂面板按区域拆分为多个子 ViewModel，由父 ViewModel 协调数据流。

5. **命令封装业务流**：所有用户操作通过命令封装，内部统一处理并发、错误和状态更新。

6. **双向绑定去重**：输入框双向绑定使用 `SetTextWithoutNotify` 或惰性更新策略，避免循环通知。

7. **服务接口化**：导航、弹窗、网络请求等统一通过服务接口暴露，测试时注入 Mock 实现。

8. **绑定粒度优化**：按 UI 结构设计订阅粒度，高频字段节流/防抖，大型列表使用响应式集合+虚拟化。

9. **渐进迁移策略**：新界面按 MVVM 模板实现，旧界面从最复杂处开始逐步提取 ViewModel。

10. **统一规范与模板**：团队建立 MVVM 书写模板、命名规范和生命周期的管理约定，确保一致性。

### 总结

响应式 MVVM 模式为 Unity 开发提供了清晰的架构分层，让数据驱动 UI 变得声明式、可测试、可维护。通过 UniRx 的 ReactiveProperty 和 ReactiveCommand，ViewModel 可以精确表达界面状态和用户操作，View 只需绑定即可自动响应变化。

工程化落地时，ViewModel 的边界设计、服务接口化、绑定粒度控制和渐进迁移策略，是 MVVM 从理论走向实践的关键。掌握了这些原则，你就能构建出无论界面多复杂都保持可维护和可测试的 Unity 应用。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** MVVM、UniRx、响应式编程、架构、数据绑定
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
