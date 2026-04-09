# README

## 摘要
[文档核心内容摘要]

## 正文

# 📚 知识管理系统

一个完整的个人知识管理系统，支持灵感捕捉、讨论整理、知识归档和静态网站生成。

## ✨ 功能特性

### 🎯 核心功能
- **灵感捕捉**：通过QQ命令快速记录想法
- **工作流管理**：灵感 → 讨论 → 归档完整流程
- **Git同步**：自动同步整理后的内容到Git仓库
- **静态网站**：自动生成美观的展示网站
- **分类系统**：多级分类管理知识库

### 🔧 技术特性
- **纯文件系统**：无数据库依赖，数据安全可靠
- **响应式设计**：移动端和桌面端完美适配
- **实时更新**：文件变化自动触发页面生成
- **API驱动**：完整的RESTful API接口
- **错误恢复**：完善的错误处理和日志系统

## 🚀 快速开始

### 1. 启动系统
```bash
cd /home/node/clawd/knowledge-system
node app/main.js start
```

### 2. 通过QQ使用
```
发送QQ消息给艾米莉：
• "记录一下我突然想到xxx"
• "有什么灵感"
• "状态"
• "帮助"
```

### 3. 访问网站
```
本地访问: http://localhost:3000
外网访问: http://你的服务器IP:映射端口
```

## 📁 系统架构

### 目录结构
```
knowledge-system/
├── app/                    # 应用代码
│   ├── capture.js         # 灵感捕捉
│   ├── workflow.js        # 工作流引擎
│   ├── git-sync.js        # Git同步
│   ├── qq-integration.js  # QQ命令集成
│   ├── generate-static.js # 静态生成
│   ├── server.js          # Web服务器
│   └── main.js            # 主集成脚本
├── data/                  # 数据目录
│   ├── local/            # 本地内容（不上传Git）
│   │   ├── inbox/        # 收件箱（待处理灵感）
│   │   └── processing/   # 处理中（正在讨论）
│   └── git/              # Git同步内容
│       └── knowledge-base/ # 知识库（整理归档）
├── public/               # 静态文件
│   ├── index.html        # 首页
│   ├── css/style.css     # 样式
│   └── js/app.js         # 前端JS
├── logs/                 # 日志文件
├── .gitignore           # Git忽略配置
└── package.json         # 项目配置
```

### 数据流
```
QQ命令 → 灵感捕捉 → 本地存储 → 网站展示
      ↓
      讨论整理 → 状态更新 → 网站更新
      ↓
      归档整理 → Git提交 → 知识库更新
```

## 💬 QQ命令参考

### 📝 灵感记录
```
记录一下 <内容> [#标签]
记录 <内容>
记一下 <内容>

示例：
"记录一下我突然想到优化API设计 #技术 #编程"
"记录学习Rust语言的最佳实践"
```

### 📋 查看管理
```
有什么灵感
待处理灵感
查看灵感
灵感列表
ls
list
```

### 💬 讨论流程
```
开始讨论 [ID/编号] [笔记]
讨论 [ID/编号]
添加笔记 <ID> <内容>

示例：
"开始讨论 1"
"开始讨论 2026-03-21-180514-api 这个API设计需要优化"
"添加笔记 2026-03-21-180514-api 需要添加缓存机制"
```

### 📚 整理归档
```
归档 <ID> <分类> [子分类] [说明]
整理 <ID> <分类>

示例：
"归档 2026-03-21-180514-api 技术 编程 API优化方案"
"整理 rust-idea 技术 编程"
```

### 📊 系统信息
```
状态
status
统计
stats
帮助
help
```

## 🔧 系统配置

### Git仓库配置
```bash
# 设置远程仓库
cd /home/node/clawd/knowledge-system
node app/git-sync.js setRemote https://github.com/你的用户名/仓库名.git

# 配置Git用户
node app/git-sync.js setUserInfo "你的名字" "你的邮箱"

# 或使用SSH
node app/git-sync.js setRemote git@github.com:你的用户名/仓库名.git
```

### 端口映射配置
```
Docker容器端口: 3000
映射到宿主机端口: 8080（或其他可用端口）

# Docker运行命令添加：
-p 8080:3000

# 或docker-compose配置：
ports:
  - "8080:3000"
```

### 分类系统配置
编辑 `data/git/knowledge-base/categories.json` 自定义分类：
```json
{
  "技术": {
    "编程": ["Python", "JavaScript", "Go", "Rust"],
    "运维": ["Docker", "Linux", "网络", "安全"]
  },
  "生活": {
    "健康": ["饮食", "运动", "睡眠"],
    "理财": ["投资", "记账", "税务"]
  }
}
```

## 🛠️ 管理命令

### 启动/停止服务
```bash
# 启动所有服务
node app/main.js start

# 停止所有服务
node app/main.js stop

# 重启服务
node app/main.js restart

# 查看状态
node app/main.js status
```

### 手动操作
```bash
# 记录灵感
node app/capture.js "记录一下测试内容"

# 列出灵感
node app/capture.js list

# 生成静态页面
node app/generate-static.js

# Git操作
node app/git-sync.js status
node app/git-sync.js sync "更新说明"
node app/git-sync.js pull
node app/git-sync.js push

# 工作流操作
node app/workflow.js overview
node app/workflow.js discuss <ID> "笔记"
node app/workflow.js archive <ID> <分类> <子分类>
```

## 📊 系统状态检查

### 运行状态
```bash
# 检查Web服务器
curl http://localhost:3000/api/status

# 检查数据目录
ls -la data/local/inbox/
ls -la data/git/knowledge-base/

# 查看日志
tail -f logs/web-server.log
tail -f logs/git-sync.log
```

### 故障排除
1. **Web服务器无法访问**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep :3000
   
   # 重启服务
   node app/main.js restart
   ```

2. **Git同步失败**
   ```bash
   # 检查Git配置
   node app/git-sync.js status
   
   # 检查网络连接
   curl https://github.com
   ```

3. **QQ命令无响应**
   ```bash
   # 测试QQ集成
   node app/qq-integration.js "状态"
   
   # 检查进程
   ps aux | grep "node.*main"
   ```

## 🔒 安全注意事项

### 数据安全
- **本地内容**：`data/local/` 目录不会上传到Git
- **Git忽略**：正确配置 `.gitignore` 文件
- **日志轮转**：定期清理日志文件

### 访问控制
- **端口安全**：仅开放必要的端口
- **Git凭证**：使用Personal Access Token而非密码
- **文件权限**：确保正确的文件权限设置

### 备份策略
```bash
# 手动备份
tar -czf backup-$(date +%Y%m%d).tar.gz data/git/

# Git本身就是备份
git push origin main
```

## 📈 性能优化

### 文件监控
- 使用防抖机制避免频繁触发
- 增量更新而非全量重新生成
- 缓存已生成的页面

### 内存管理
- 单进程架构，资源占用低
- 定期清理临时文件
- 监控日志文件大小

### 网络优化
- 静态文件缓存
- 压缩传输内容
- CDN加速（可选）

## 🚀 部署指南

### Docker部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install --production
EXPOSE 3000
CMD ["node", "app/main.js", "start"]
```

### 系统服务
```systemd
[Unit]
Description=Knowledge System
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/home/node/clawd/knowledge-system
ExecStart=/usr/bin/node app/main.js start
Restart=always

[Install]
WantedBy=multi-user.target
```

## 📞 支持与反馈

### 问题报告
1. 检查日志文件：`logs/` 目录
2. 测试命令：`node app/main.js status`
3. 提供错误信息和复现步骤

### 功能建议
- 通过QQ反馈给艾米莉
- 在Git仓库提交Issue
- 直接修改代码并提交PR

### 更新日志
- **v1.0.0**：初始版本，完整功能实现
- 灵感捕捉和工作流管理
- Git自动同步
- QQ命令集成
- 静态网站生成

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🙏 致谢

感谢OpenClaw平台提供的AI助手能力，让这个系统成为可能。

---

**💡 提示**：系统已完全自动化，你只需要通过QQ与艾米莉交互即可管理所有知识内容。

## 元数据
- **创建时间：** 2026-04-10
- **最后更新：** 2026-04-10
- **作者：** 吉良吉影
- **分类：** 未分类
- **标签：** [相关标签]
- **状态：** ✅ 完成

---
*文档由小雅协助整理*
