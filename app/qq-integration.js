#!/usr/bin/env node
/**
 * QQ命令集成模块
 * 处理来自QQ的消息，执行相应操作
 */

const fs = require('fs');
const path = require('path');
const IdeaCapture = require('./capture');
const WorkflowEngine = require('./workflow');
const GitSync = require('./git-sync');
const { format } = require('date-fns');

class QQIntegration {
  constructor() {
    this.capture = new IdeaCapture();
    this.workflow = new WorkflowEngine();
    this.gitSync = new GitSync();
    
    // 命令映射
    this.commands = {
      // 灵感相关
      '记录一下': this.handleCapture.bind(this),
      '记录': this.handleCapture.bind(this),
      '记一下': this.handleCapture.bind(this),
      
      // 查看相关
      '有什么灵感': this.handleListInbox.bind(this),
      '待处理灵感': this.handleListInbox.bind(this),
      '查看灵感': this.handleListInbox.bind(this),
      '灵感列表': this.handleListInbox.bind(this),
      
      // 讨论相关
      '开始讨论': this.handleStartDiscussion.bind(this),
      '讨论': this.handleStartDiscussion.bind(this),
      '添加笔记': this.handleAddNote.bind(this),
      
      // 归档相关
      '归档': this.handleArchive.bind(this),
      '整理': this.handleArchive.bind(this),
      
      // 系统相关
      '状态': this.handleStatus.bind(this),
      '统计': this.handleStats.bind(this),
      '帮助': this.handleHelp.bind(this),
      'help': this.handleHelp.bind(this)
    };
    
    // 别名映射
    this.aliases = {
      'ls': '灵感列表',
      'list': '灵感列表',
      'status': '状态',
      'stats': '统计',
      'help': '帮助'
    };
  }
  
  /**
   * 处理QQ消息
   */
  async handleMessage(message) {
    try {
      console.log(`📨 收到QQ消息: ${message.substring(0, 50)}...`);
      
      // 清理消息
      const cleanMessage = message.trim();
      
      // 检查是否是命令
      const command = this.parseCommand(cleanMessage);
      if (!command) {
        return this.handleUnknownCommand(cleanMessage);
      }
      
      // 执行命令
      const result = await this.executeCommand(command);
      return result;
      
    } catch (error) {
      console.error('❌ 处理QQ消息失败:', error);
      return this.formatErrorResponse(error);
    }
  }
  
  /**
   * 解析命令
   */
  parseCommand(message) {
    // 转换为小写进行匹配（但保留原文本用于参数）
    const lowerMessage = message.toLowerCase();
    
    // 检查别名
    for (const [alias, command] of Object.entries(this.aliases)) {
      if (lowerMessage.startsWith(alias)) {
        return {
          type: command,
          original: message,
          args: message.substring(alias.length).trim()
        };
      }
    }
    
    // 检查命令
    for (const [cmd, handler] of Object.entries(this.commands)) {
      if (lowerMessage.startsWith(cmd.toLowerCase())) {
        return {
          type: cmd,
          original: message,
          args: message.substring(cmd.length).trim()
        };
      }
    }
    
    // 检查是否是"记录一下"的变体
    if (lowerMessage.includes('记录') || lowerMessage.includes('记一下')) {
      // 提取记录内容
      const recordMatch = message.match(/记录(一下)?[：:]\s*(.+)/) || 
                         message.match(/记一下[：:]\s*(.+)/);
      if (recordMatch) {
        return {
          type: '记录一下',
          original: message,
          args: recordMatch[2].trim()
        };
      }
    }
    
    return null;
  }
  
  /**
   * 执行命令
   */
  async executeCommand(command) {
    const handler = this.commands[command.type];
    if (!handler) {
      return this.handleUnknownCommand(command.original);
    }
    
    return await handler(command.args, command.original);
  }
  
  /**
   * 处理灵感记录
   */
  async handleCapture(args, original) {
    if (!args || args.trim().length === 0) {
      return this.formatResponse('请提供要记录的内容，例如：记录一下我突然想到xxx');
    }
    
    console.log(`📝 记录灵感: ${args}`);
    
    // 提取标签（如果有）
    let text = args;
    let tags = [];
    
    const tagMatch = args.match(/#(\w+)/g);
    if (tagMatch) {
      tags = tagMatch.map(tag => tag.substring(1));
      text = args.replace(/#\w+/g, '').trim();
    }
    
    // 记录灵感
    const result = await this.capture.record(text, tags);
    
    if (result.success) {
      // 获取更新后的列表
      const ideas = this.capture.listInbox();
      
      return this.formatResponse(
        `✅ 灵感记录成功！\n\n` +
        `📝 **${text.substring(0, 50)}${text.length > 50 ? '...' : ''}**\n` +
        `📁 保存到: ${result.filename}\n` +
        `🏷️ 标签: ${tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : '无'}\n\n` +
        `📋 当前待处理灵感: **${ideas.length}个**\n` +
        `💡 网站已自动更新，可通过浏览器查看`
      );
    } else {
      return this.formatResponse(
        `❌ 记录失败: ${result.error}\n\n` +
        `请检查系统状态或稍后重试。`
      );
    }
  }
  
  /**
   * 处理列出待处理灵感
   */
  async handleListInbox(args, original) {
    console.log('📋 列出待处理灵感');
    
    const ideas = this.capture.listInbox();
    
    if (ideas.length === 0) {
      return this.formatResponse(
        `📭 当前没有待处理的灵感\n\n` +
        `💡 尝试记录一些想法：\n` +
        `"记录一下我突然想到xxx"`
      );
    }
    
    // 分组显示（最多显示10个）
    const displayCount = Math.min(ideas.length, 10);
    const ideaList = ideas.slice(0, displayCount)
      .map((idea, index) => {
        const timeAgo = this.formatTimeAgo(idea.created);
        return `${index + 1}. **${idea.title}** (${timeAgo})`;
      })
      .join('\n');
    
    const moreText = ideas.length > displayCount ? `\n...还有 ${ideas.length - displayCount} 个` : '';
    
    return this.formatResponse(
      `📋 待处理灵感 (${ideas.length}个):\n\n` +
      `${ideaList}${moreText}\n\n` +
      `💡 使用"开始讨论 <编号>"开始讨论某个灵感\n` +
      `📊 完整列表请查看网站`
    );
  }
  
  /**
   * 处理开始讨论
   */
  async handleStartDiscussion(args, original) {
    if (!args || args.trim().length === 0) {
      // 如果没有参数，列出可讨论的灵感
      const ideas = this.capture.listInbox();
      
      if (ideas.length === 0) {
        return this.formatResponse('📭 当前没有待处理的灵感可以讨论');
      }
      
      const ideaList = ideas.slice(0, 5)
        .map((idea, index) => {
          const timeAgo = this.formatTimeAgo(idea.created);
          const id = idea.filename.replace('.md', '');
          return `${index + 1}. **${idea.title}** (ID: ${id})`;
        })
        .join('\n');
      
      return this.formatResponse(
        `💬 请选择要讨论的灵感:\n\n` +
        `${ideaList}\n\n` +
        `用法: "开始讨论 <ID或编号>"\n` +
        `例如: "开始讨论 2026-03-21-180514-api"`
      );
    }
    
    console.log(`💬 开始讨论: ${args}`);
    
    // 尝试解析参数
    const [target, ...noteParts] = args.split(/\s+/);
    const note = noteParts.join(' ');
    
    // 查找灵感
    let ideaId = target;
    
    // 如果是数字，尝试按索引查找
    if (/^\d+$/.test(target)) {
      const index = parseInt(target) - 1;
      const ideas = this.capture.listInbox();
      
      if (index >= 0 && index < ideas.length) {
        ideaId = ideas[index].filename.replace('.md', '');
      } else {
        return this.formatResponse(`❌ 无效的编号，请使用1-${ideas.length}之间的数字`);
      }
    }
    
    // 开始讨论
    const result = await this.workflow.startDiscussion(ideaId, note);
    
    if (result.success) {
      return this.formatResponse(
        `💬 讨论已开始！\n\n` +
        `📝 **${result.title}**\n` +
        `🆔 ID: ${result.ideaId}\n` +
        `📁 状态: 🔄 讨论中\n\n` +
        `💡 使用"添加笔记 <ID> <内容>"添加讨论笔记\n` +
        `📚 讨论完成后使用"归档 <ID> <分类>"进行归档`
      );
    } else {
      return this.formatResponse(
        `❌ 开始讨论失败: ${result.error}\n\n` +
        `请检查灵感ID是否正确，或使用"有什么灵感"查看列表`
      );
    }
  }
  
  /**
   * 处理添加讨论笔记
   */
  async handleAddNote(args, original) {
    if (!args || args.trim().length === 0) {
      return this.formatResponse(
        `📝 添加讨论笔记\n\n` +
        `用法: "添加笔记 <ID> <笔记内容>"\n` +
        `例如: "添加笔记 2026-03-21-180514-api 这个设计需要优化性能"`
      );
    }
    
    console.log(`📝 添加讨论笔记: ${args}`);
    
    // 解析参数
    const parts = args.split(/\s+/);
    if (parts.length < 2) {
      return this.formatResponse('请提供灵感ID和笔记内容');
    }
    
    const ideaId = parts[0];
    const note = parts.slice(1).join(' ');
    
    const result = await this.workflow.addDiscussionNote(ideaId, note);
    
    if (result.success) {
      return this.formatResponse(
        `📝 笔记已添加！\n\n` +
        `📝 **${result.title}**\n` +
        `🆔 ID: ${result.ideaId}\n` +
        `📄 内容: ${note.substring(0, 100)}${note.length > 100 ? '...' : ''}\n\n` +
        `💡 继续讨论或使用"归档"完成整理`
      );
    } else {
      return this.formatResponse(
        `❌ 添加笔记失败: ${result.error}\n\n` +
        `请检查灵感ID是否正确，或该灵感是否在讨论中`
      );
    }
  }
  
  /**
   * 处理归档
   */
  async handleArchive(args, original) {
    if (!args || args.trim().length === 0) {
      // 显示归档帮助
      const categories = this.getAvailableCategories();
      
      return this.formatResponse(
        `📚 归档灵感到知识库\n\n` +
        `用法: "归档 <ID> <分类> [子分类] [说明]"` +
        `\n\n可用分类:\n${categories}` +
        `\n\n示例:\n` +
        `"归档 2026-03-21-180514-api 技术 编程 API设计"\n` +
        `"归档 rust-idea 技术 编程 Rust语言学习"`
      );
    }
    
    console.log(`📚 归档: ${args}`);
    
    // 解析参数
    const parts = args.split(/\s+/);
    if (parts.length < 2) {
      return this.formatResponse('请提供灵感ID和分类');
    }
    
    const ideaId = parts[0];
    const category = parts[1];
    const subcategory = parts[2] || '';
    const note = parts.slice(3).join(' ') || '';
    
    const result = await this.workflow.archiveIdea(ideaId, category, subcategory, note);
    
    if (result.success) {
      // 尝试自动推送（如果配置了）
      let pushInfo = '';
      try {
        const gitStatus = await this.gitSync.getStatus();
        if (gitStatus && gitStatus.ahead > 0) {
          pushInfo = `\n📡 Git有${gitStatus.ahead}个提交待推送，使用"状态"查看详情`;
        }
      } catch (error) {
        // 忽略Git错误
      }
      
      return this.formatResponse(
        `📚 归档成功！\n\n` +
        `📝 **${result.originalTitle}**\n` +
        `📁 分类: ${result.category}${result.subcategory ? '/' + result.subcategory : ''}\n` +
        `📄 文件: ${result.newFilename}\n` +
        `💾 位置: ${result.targetPath}\n\n` +
        `✅ 已添加到知识库并提交到Git${pushInfo}`
      );
    } else {
      return this.formatResponse(
        `❌ 归档失败: ${result.error}\n\n` +
        `请检查:\n` +
        `1. 灵感ID是否正确\n` +
        `2. 分类是否存在\n` +
        `3. 该灵感是否在讨论中`
      );
    }
  }
  
  /**
   * 处理系统状态
   */
  async handleStatus(args, original) {
    console.log('📊 获取系统状态');
    
    try {
      // 获取工作流概览
      const overview = await this.workflow.getOverview();
      
      // 获取Git状态
      const gitStatus = await this.gitSync.getStatus();
      
      let gitInfo = '📡 Git: 未初始化';
      if (gitStatus) {
        const { branch, ahead, behind, changes, remotes } = gitStatus;
        
        gitInfo = `📡 Git: ${branch}`;
        if (ahead > 0) gitInfo += ` ↑${ahead}`;
        if (behind > 0) gitInfo += ` ↓${behind}`;
        if (changes.unstaged > 0) gitInfo += ` 📝${changes.unstaged}`;
        
        if (remotes.length > 0) {
          gitInfo += `\n🔗 远程: ${remotes.map(r => r.name).join(', ')}`;
        }
      }
      
      return this.formatResponse(
        `📊 系统状态\n\n` +
        `🔄 工作流:\n` +
        `  收件箱: ${overview?.inbox.count || 0}个灵感\n` +
        `  讨论中: ${overview?.processing.count || 0}个\n` +
        `  已归档: ${overview?.knowledge.totalFiles || 0}个文档\n\n` +
        `${gitInfo}\n\n` +
        `🌐 网站: http://localhost:3000\n` +
        `⏰ 时间: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`
      );
    } catch (error) {
      console.error('获取状态失败:', error);
      return this.formatResponse(
        `📊 系统状态\n\n` +
        `❌ 获取状态时出错: ${error.message}\n` +
        `💡 请检查系统日志`
      );
    }
  }
  
  /**
   * 处理统计信息
   */
  async handleStats(args, original) {
    console.log('📈 获取统计信息');
    
    try {
      const overview = await this.workflow.getOverview();
      
      if (!overview) {
        return this.formatResponse('❌ 无法获取统计信息');
      }
      
      const { totals, knowledge } = overview;
      
      // 计算知识库分类分布
      let categoryStats = '';
      if (knowledge.byCategory) {
        const topCategories = Object.entries(knowledge.byCategory)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([cat, stats]) => `  ${cat}: ${stats.count}个文档`)
          .join('\n');
        
        if (topCategories) {
          categoryStats = `\n📚 知识库分类:\n${topCategories}`;
        }
      }
      
      return this.formatResponse(
        `📈 系统统计\n\n` +
        `📊 总计: ${totals.totalIdeas}个内容\n` +
        `  📝 待处理: ${totals.byStatus.inbox}个\n` +
        `  💬 讨论中: ${totals.byStatus.processing}个\n` +
        `  📚 已归档: ${totals.byStatus.archived}个\n` +
        `${categoryStats}\n\n` +
        `💾 知识库大小: ${Math.round(knowledge.totalSize / 1024)}KB\n` +
        `📅 最后更新: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`
      );
    } catch (error) {
      console.error('获取统计失败:', error);
      return this.formatResponse(
        `📈 系统统计\n\n` +
        `❌ 获取统计时出错: ${error.message}`
      );
    }
  }
  
  /**
   * 处理帮助信息
   */
  async handleHelp(args, original) {
    const helpText = `
📚 知识管理系统 - QQ命令帮助

📝 灵感记录:
  • 记录一下 <内容> [#标签] - 记录新灵感
  • 记录 <内容> - 同上
  • 记一下 <内容> - 同上

📋 查看管理:
  • 有什么灵感 - 列出待处理灵感
  • 待处理灵感 - 同上
  • 查看灵感 - 同上
  • 灵感列表 - 同上 (别名: ls, list)

💬 讨论流程:
  • 开始讨论 [ID/编号] [笔记] - 开始讨论灵感
  • 讨论 [ID/编号] - 同上
  • 添加笔记 <ID> <内容> - 添加讨论笔记

📚 整理归档:
  • 归档 <ID> <分类> [子分类] [说明] - 归档到知识库
  • 整理 <ID> <分类> - 同上

📊 系统信息:
  • 状态 - 查看系统状态 (别名: status)
  • 统计 - 查看统计信息 (别名: stats)
  • 帮助 - 显示此帮助 (别名: help)

💡 示例:
  • "记录一下我突然想到优化API设计 #技术 #编程"
  • "有什么灵感"
  • "开始讨论 1"
  • "添加笔记 2026-03-21-180514-api 需要添加缓存"
  • "归档 2026-03-21-180514-api 技术 编程 API优化方案"

🌐 网站访问: http://localhost:3000
📁 数据目录: /home/node/clawd/knowledge-system/data
    `;
    
    return this.formatResponse(helpText.trim());
  }
  
  /**
   * 处理未知命令
   */
  async handleUnknownCommand(message) {
    // 检查是否可能是想要记录灵感
    if (message.length > 5 && !message.startsWith('/')) {
      return this.formatResponse(
        `🤔 未识别的命令: "${message.substring(0, 30)}..."\n\n` +
        `💡 你是想记录灵感吗？请使用:\n` +
        `"记录一下 ${message}"\n\n` +
        `📚 使用"帮助"查看所有可用命令`
      );
    }
    
    return this.formatResponse(
      `❓ 未识别的命令\n\n` +
      `💡 可用命令:\n` +
      `• 记录一下 <内容> - 记录新灵感\n` +
      `• 有什么灵感 - 查看待处理灵感\n` +
      `• 状态 - 查看系统状态\n` +
      `• 帮助 - 显示完整帮助\n\n` +
      `📚 输入"帮助"查看所有命令`
    );
  }
  
  /**
   * 获取可用分类
   */
  getAvailableCategories() {
    try {
      const categoriesPath = path.join(__dirname, '..', 'data', 'git', 'knowledge-base', 'categories.json');
      if (!fs.existsSync(categoriesPath)) {
        return '技术、生活、项目、杂记';
      }
      
      const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
      const categories = Object.keys(categoriesData).join('、');
      
      return categories;
    } catch (error) {
      console.error('获取分类失败:', error);
      return '技术、生活、项目、杂记';
    }
  }
  
  /**
   * 格式化时间间隔
   */
  formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 30) return `${diffDays}天前`;
    
    return format(date, 'MM-dd');
  }
  
  /**
   * 格式化响应
   */
  formatResponse(text) {
    return {
      success: true,
      message: text,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 格式化错误响应
   */
  formatErrorResponse(error) {
    return {
      success: false,
      error: error.message,
      message: `❌ 处理命令时出错: ${error.message}\n\n💡 请检查系统日志或稍后重试`,
      timestamp: new Date().toISOString()
    };
  }
}

// 命令行测试接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const qqIntegration = new QQIntegration();
  
  if (args.length === 0) {
    console.log(`
📱 QQ集成模块 - 测试工具

用法: node qq-integration.js "<QQ消息>"

示例:
  node qq-integration.js "记录一下我突然想到优化网站性能"
  node qq-integration.js "有什么灵感"
  node qq-integration.js "状态"
  node qq-integration.js "帮助"
    `);
    process.exit(0);
  }
  
  const message = args.join(' ');
  console.log(`📨 测试消息: ${message}`);
  console.log('---');
  
  qqIntegration.handleMessage(message).then(result => {
    if (result.success) {
      console.log(result.message);
    } else {
      console.error(`❌ ${result.message}`);
    }
  }).catch(error => {
    console.error('❌ 测试失败:', error);
  });
}

module.exports = QQIntegration;