# ReactiveCommand与UI交互

## 摘要
ReactiveCommand 是 UniRx 中处理 UI 交互的核心组件，将命令模式与响应式编程结合。本文介绍 ReactiveCommand 的原理和使用方法，展示如何在 MVVM 架构中实现响应式的 UI 交互逻辑，提升代码可测试性和可维护性。

## 正文

### 背景
在前面的教程中，我们了解了 `ReactiveProperty` 如何帮助我们管理和响应数据的变化。现在，我们将步入响应式编程在 Unity UI 交互中的另一个核心角色：**ReactiveCommand**。它不仅仅是一个简单的命令模式实现，更是将命令的执行与 UI 状态、异步操作以及数据流紧密结合的强大工具。

在传统的 Unity UI 开发中，我们经常使用按钮的 `onClick.AddListener()` 来触发某个操作。当操作逻辑变得复杂时——比如需要判断前置条件（玩家是否有足够的金币施放技能）、操作是异步的（网络请求），或者需要根据操作状态更新 UI（按钮禁用、加载动画）——传统实现中这些逻辑会散布在点击回调、`Update` 和各种状态变量中，导致代码耦合、难以维护和测试。

### 1. ReactiveCommand 基础概念

`ReactiveCommand` 本质上是一个 `IObservable<T>` 和一个 `ICommand` 的结合体。它包含两个核心功能：

- **执行性（Execute）**：定义命令被触发时执行的逻辑。
- **可执行性（CanExecute）**：决定命令当前是否可以被执行，通常绑定到一个或多个 `ReactiveProperty`。

```csharp
public class LoginViewModel
{
    public ReactiveProperty<string> Username { get; } = new("");
    public ReactiveProperty<string> Password { get; } = new("");
    
    // 当用户名和密码都合法时，登录按钮才可点击
    public ReactiveCommand LoginCommand { get; }
    
    public LoginViewModel()
    {
        var canLogin = Observable.CombineLatest(
            Username,
            Password,
            (u, p) => u.Length >= 3 && p.Length >= 6
        );
        
        LoginCommand = canLogin.ToReactiveCommand();
        LoginCommand.Subscribe(_ => ExecuteLogin());
    }
    
    private void ExecuteLogin() { /* 登录逻辑 */ }
}
```

### 2. 使用 `ToReactiveCommand`

`ToReactiveCommand` 是将 `IObservable<bool>` 转换为 `ReactiveCommand` 的最常用方法：

```csharp
// 创建一个始终可执行的命令
var command = Observable.Return(true).ToReactiveCommand();
command.Subscribe(_ => Debug.Log("执行"));

// 创建带条件执行的命令
var canExecute = isOnline.CombineLatest(hasPermission, (a, b) => a && b);
var securedCommand = canExecute.ToReactiveCommand();
```

### 3. 异步命令与 ReactiveCommand

在 Unity 中，许多 UI 交互都涉及异步操作。`ReactiveCommand` 对异步操作提供了天然支持：

```csharp
public ReactiveCommand<string, string> FetchDataCommand { get; }
 
public MyViewModel()
{
    FetchDataCommand = new ReactiveCommand<string, string>(
        canExecute: Observable.Return(true)
    );
    
    FetchDataCommand.Subscribe(async url =>
    {
        await FetchFromServer(url);
        // 执行完毕后自动重置 CanExecute 状态
    });
}
```

`ReactiveCommand<T, T>` 允许在触发时传入参数，并将异步执行过程封装在命令内部。

### 4. 绑定到 UI

在 MVVM 模式下，View 层只需绑定命令，无需接触具体逻辑：

```csharp
// View.cs
public Button loginButton;
public Button logoutButton;

void Start()
{
    // 绑定命令
    loginButton.BindTo(loginViewModel.LoginCommand);
    
    // 绑定带参数的命令
    logoutButton.BindTo(logoutViewModel.LogoutCommand, "强制退出");
}
```

使用 `BindTo` 扩展方法，按钮的 `interactable` 状态会自动跟随 `CanExecute` 的变化。

### 5. 撤销与重做实现技巧

可以利用命令队列和栈实现 Undo/Redo：

```csharp
public class UndoRedoService
{
    private Stack<ICommandRecord> undoStack = new();
    private Stack<ICommandRecord> redoStack = new();
    
    public ICommand UndoCommand { get; }
    public ICommand RedoCommand { get; }
    
    public void ExecuteAndRecord(ICommandRecord record) { }
}
```

### 工程化深化：命令不只是按钮回调

#### 1. ReactiveCommand 的核心是执行状态建模
传统按钮回调只关注点击后执行什么逻辑，而 ReactiveCommand 关注命令在整个生命周期中的状态：当前是否可执行、是否正在执行、执行是否成功、失败原因是什么、是否允许并发、是否允许取消、执行结果如何反馈。这个状态模型让 UI 不再依赖零散布尔字段，而是围绕命令本身进行绑定。

例如登录按钮不只是 `OnClickLogin`。它的可执行状态取决于账号密码是否合法、网络是否可用、是否正在请求、是否处于封禁或维护状态；执行中需要禁用按钮并显示 loading；执行失败要显示错误。ReactiveCommand 把这些状态聚合在命令边界，比在 View 层手写多处判断更可维护。

#### 2. CanExecute 应表达业务约束，而不是只表达 UI 是否灰掉
`CanExecute` 应表达命令当前是否允许被执行，UI 灰显只是表现之一。若命令在不可执行时仍可被代码调用，说明约束没有真正进入命令边界。`CanExecute` 的来源通常是多个响应式属性组合。组合时要注意初始值和空状态，避免界面刚打开时按钮短暂可点。轻量校验放在实时 `CanExecute`，重校验放在执行阶段并通过错误通道反馈。

#### 3. 异步命令必须处理并发、取消和乱序返回
如果用户连续点击，或者界面关闭后请求才返回，简单回调很容易出错。ReactiveCommand 应明确并发策略：禁止重入、排队执行、取消前一次、允许并发但按版本接收结果。登录、购买通常禁止重入；搜索可以取消前一次；批量下载允许并发但限制数量。

取消要和生命周期绑定。界面关闭时，命令应取消未完成异步操作，或至少忽略其结果。ReactiveCommand 的执行返回值、错误流和完成流都应尊重生命周期。

#### 4. 错误通道应与结果通道分离
命令执行失败不应只靠异常冒泡。UI 需要知道失败类型：输入错误、网络超时、服务器拒绝、权限不足。ReactiveCommand 可以提供独立错误流，让 ViewModel 或 View 根据错误类型展示提示或重试。命令封装可以支持 `CommandResult<T>`，包含状态码、消息、数据和异常。

#### 5. 异步执行期间的交互状态应分层管理
执行期间的 UI 状态（loading、进度、取消按钮）可以放在命令层统一管理。ViewModel 可以暴露执行中的属性，View 绑定 loading 动画，不需要在每个 View 里维护 loading 状态。

#### 6. 组合命令与分步流程
分步流程（如注册向导、战斗连招）需要多个命令按序执行。可以用 `Observable.Concat` 或自定义 `StepCommand`，确保前一步完成后才进入下一步。

#### 7. 命令应支持测试性和可观测性
ViewModel 暴露的命令应接受单元测试：测试 CanExecute 逻辑、测试异步执行结果、测试并发策略和错误通道。业务命令还应记录执行次数、成功率和平均耗时。

#### 8. 命令粒度应匹配交互语义
每个按钮对应一个命令是常见做法，但同一界面内多个按钮共享逻辑时，可以把命令拆分为原子命令和组合命令。

#### 9. 命令应保留操作审计和防重复提交
涉及付费、领取奖励、云存档的命令，应生成可追踪的请求 ID，记录触发来源、执行参数、结果和失败原因。防重复提交不只依赖前端禁用按钮，服务端幂等才是最终一致性保护。

#### 10. 验收标准应覆盖完整交互边界
不可执行时 UI 是否禁用；执行中重复点击是否按策略处理；界面关闭后异步结果是否被忽略；失败是否进入错误通道；成功是否只触发一次后续流程。对关键付费命令，还需验证网络重连后的行为。

### 实现方案

1. **用 ReactiveCommand 替代 onClick.AddListener**：所有按钮交互都通过命令封装，CanExecute 自动控制按钮状态。
2. **异步命令统一使用命令边界封装**：包含并发策略、取消处理和错误通道。
3. **ViewModel 只暴露命令和属性**：View 只做绑定，不接触具体业务逻辑。
4. **分层状态管理**：执行状态（isExecuting、error）由命令层暴露，View 层绑定。
5. **建立命令审计**：关键命令记录执行日志，支持重放和排查。

### 总结
ReactiveCommand 将命令模式与响应式编程结合，从根本上解决了传统 Unity UI 交互中逻辑散布、状态管理混乱的问题。通过命令边界封装状态、异步策略和错误处理，不仅可以编写出更清晰、可测试的代码，也为复杂交互场景提供了可预测的执行模型。

## 元数据
- **创建时间：** 2026-04-20 21:04
- **最后更新：** 2026-04-24
- **作者：** 吉良吉影
- **分类：** C#与响应式编程
- **标签：** ReactiveCommand、MVVM、UI交互、UniRx、命令模式
- **来源：** 已有文稿整理与深度重写

---
*文档基于与吉良吉影的讨论，由小雅整理*
