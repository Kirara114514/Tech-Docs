#!/usr/bin/env node
/**
 * Git同步模块
 * 自动同步data/git/目录到远程仓库
 * 忽略data/local/目录
 */

const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { format } = require('date-fns');

const ROOT_DIR = path.join(__dirname, '..');
const GIT_DIR = path.join(ROOT_DIR, 'data', 'git');
const LOCAL_DIR = path.join(ROOT_DIR, 'data', 'local');
const GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore');

class GitSync {
  constructor(options = {}) {
    this.options = {
      autoCommit: true,
      autoPush: false, // 默认不自动推送，需要确认
      commitMessage: '更新知识库',
      remoteName: 'origin',
      branch: 'main',
      ...options
    };
    
    this.git = simpleGit(ROOT_DIR);
    this.isInitialized = false;
    this.lastSyncTime = null;
  }
  
  /**
   * 初始化Git仓库
   */
  async init() {
    try {
      console.log('🔧 初始化Git同步系统...');
      
      // 检查是否已经是Git仓库
      const isRepo = await this.git.checkIsRepo();
      
      if (!isRepo) {
        console.log('📦 初始化新的Git仓库...');
        await this.git.init();
        
        // 配置.gitignore
        await this.setupGitignore();
        
        // 配置Git用户信息（需要外部提供）
        // await this.git.addConfig('user.name', 'Your Name');
        // await this.git.addConfig('user.email', 'your@email.com');
        
        console.log('✅ Git仓库初始化完成');
      } else {
        console.log('✅ Git仓库已存在');
      }
      
      // 检查远程仓库配置
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        console.log('⚠️ 未配置远程仓库，请使用 setRemote() 方法设置');
      } else {
        console.log(`📡 远程仓库: ${remotes.map(r => r.name).join(', ')}`);
      }
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('❌ Git初始化失败:', error);
      return false;
    }
  }
  
  /**
   * 设置远程仓库
   */
  async setRemote(url, name = 'origin') {
    try {
      console.log(`🔗 设置远程仓库: ${name} -> ${url}`);
      
      const remotes = await this.git.getRemotes();
      const existingRemote = remotes.find(r => r.name === name);
      
      if (existingRemote) {
        await this.git.removeRemote(name);
      }
      
      await this.git.addRemote(name, url);
      console.log('✅ 远程仓库设置成功');
      return true;
    } catch (error) {
      console.error('❌ 设置远程仓库失败:', error);
      return false;
    }
  }
  
  /**
   * 配置Git用户信息
   */
  async setUserInfo(name, email) {
    try {
      await this.git.addConfig('user.name', name);
      await this.git.addConfig('user.email', email);
      console.log(`👤 Git用户配置: ${name} <${email}>`);
      return true;
    } catch (error) {
      console.error('❌ 配置Git用户失败:', error);
      return false;
    }
  }
  
  /**
   * 设置.gitignore文件
   */
  async setupGitignore() {
    try {
      const defaultGitignore = `# 忽略本地内容（不上传Git）
data/local/
logs/
*.log
*.tmp
*.bak

# 忽略Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 忽略生成的文件
public/index.html
public/daily.html
public/processing.html
public/knowledge.html

# 环境变量
.env
.env.local
.env.*.local

# 编辑器文件
.vscode/
.idea/
*.swp
*.swo
*~`;
      
      if (!fs.existsSync(GITIGNORE_PATH)) {
        fs.writeFileSync(GITIGNORE_PATH, defaultGitignore, 'utf8');
        console.log('✅ .gitignore文件已创建');
      } else {
        console.log('✅ .gitignore文件已存在');
      }
      
      return true;
    } catch (error) {
      console.error('❌ 配置.gitignore失败:', error);
      return false;
    }
  }
  
  /**
   * 检查Git状态
   */
  async getStatus() {
    try {
      const status = await this.git.status();
      const remotes = await this.git.getRemotes();
      
      const remoteInfo = remotes.map(r => ({
        name: r.name,
        url: r.refs ? r.refs.fetch || r.refs.push : 'unknown'
      }));
      
      return {
        initialized: this.isInitialized,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        changes: {
          staged: status.staged.length,
          unstaged: status.not_added.length + status.modified.length + status.deleted.length + status.created.length,
          conflicted: status.conflicted.length
        },
        remotes: remoteInfo,
        lastSync: this.lastSyncTime
      };
    } catch (error) {
      console.error('❌ 获取Git状态失败:', error);
      return null;
    }
  }
  
  /**
   * 自动提交更改
   */
  async autoCommit(message = null) {
    if (!this.options.autoCommit) {
      console.log('⏸️ 自动提交已禁用');
      return false;
    }
    
    try {
      // 检查是否有更改
      const status = await this.git.status();
      const hasChanges = status.staged.length > 0 || 
                        status.not_added.length > 0 || 
                        status.modified.length > 0 ||
                        status.deleted.length > 0 ||
                        status.created.length > 0;
      
      if (!hasChanges) {
        console.log('📭 没有需要提交的更改');
        return false;
      }
      
      // 添加所有更改（遵循.gitignore）
      await this.git.add('.');
      
      // 生成提交消息
      const commitMsg = message || this.generateCommitMessage(status);
      
      // 提交
      await this.git.commit(commitMsg);
      
      this.lastSyncTime = new Date();
      console.log(`✅ 已提交: ${commitMsg}`);
      
      return {
        success: true,
        message: commitMsg,
        changes: {
          added: status.not_added.length + status.created.length,
          modified: status.modified.length,
          deleted: status.deleted.length
        }
      };
    } catch (error) {
      console.error('❌ 自动提交失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 生成智能提交消息
   */
  generateCommitMessage(status) {
    const changes = [];
    
    if (status.not_added.length > 0 || status.created.length > 0) {
      changes.push(`新增${status.not_added.length + status.created.length}个文件`);
    }
    
    if (status.modified.length > 0) {
      changes.push(`修改${status.modified.length}个文件`);
    }
    
    if (status.deleted.length > 0) {
      changes.push(`删除${status.deleted.length}个文件`);
    }
    
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm');
    const changeSummary = changes.length > 0 ? changes.join('，') : '更新内容';
    
    return `${this.options.commitMessage}: ${changeSummary} (${timestamp})`;
  }
  
  /**
   * 推送到远程仓库
   */
  async pushToRemote(force = false) {
    try {
      console.log(`🚀 推送到远程仓库: ${this.options.remoteName}/${this.options.branch}`);
      
      const options = {};
      if (force) {
        options['--force'] = null;
      }
      
      const result = await this.git.push(this.options.remoteName, this.options.branch, options);
      
      this.lastSyncTime = new Date();
      console.log('✅ 推送成功');
      
      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('❌ 推送失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 从远程仓库拉取更新
   */
  async pullFromRemote() {
    try {
      console.log(`📥 从远程仓库拉取更新: ${this.options.remoteName}/${this.options.branch}`);
      
      const result = await this.git.pull(this.options.remoteName, this.options.branch);
      
      this.lastSyncTime = new Date();
      console.log('✅ 拉取成功');
      
      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('❌ 拉取失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 同步到远程（提交+推送）
   */
  async syncToRemote(message = null) {
    try {
      console.log('🔄 开始同步到远程仓库...');
      
      // 1. 自动提交
      const commitResult = await this.autoCommit(message);
      if (!commitResult || !commitResult.success) {
        console.log('⏸️ 没有需要同步的更改');
        return { success: false, reason: '没有需要同步的更改' };
      }
      
      // 2. 推送到远程
      const pushResult = await this.pushToRemote();
      
      return {
        success: pushResult.success,
        commit: commitResult,
        push: pushResult,
        timestamp: this.lastSyncTime
      };
    } catch (error) {
      console.error('❌ 同步失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 从远程同步（拉取）
   */
  async syncFromRemote() {
    try {
      console.log('🔄 从远程仓库同步...');
      
      const pullResult = await this.pullFromRemote();
      
      return {
        success: pullResult.success,
        pull: pullResult,
        timestamp: this.lastSyncTime
      };
    } catch (error) {
      console.error('❌ 同步失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 双向同步（拉取+提交+推送）
   */
  async fullSync(message = null) {
    try {
      console.log('🔄 开始完整同步...');
      
      // 1. 从远程拉取（解决冲突）
      const pullResult = await this.pullFromRemote();
      if (!pullResult.success) {
        console.warn('⚠️ 拉取失败，继续本地提交');
      }
      
      // 2. 提交本地更改
      const commitResult = await this.autoCommit(message);
      
      // 3. 推送到远程
      const pushResult = await this.pushToRemote();
      
      return {
        success: pushResult.success,
        pull: pullResult,
        commit: commitResult,
        push: pushResult,
        timestamp: this.lastSyncTime
      };
    } catch (error) {
      console.error('❌ 完整同步失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 监控目录变化并自动同步
   */
  startWatching() {
    console.log('👀 开始监控文件变化...');
    
    // 这里可以集成chokidar等文件监控库
    // 暂时使用简单轮询
    this.watchInterval = setInterval(async () => {
      const status = await this.getStatus();
      if (status && status.changes.unstaged > 0) {
        console.log(`📝 检测到${status.changes.unstaged}个未提交更改`);
        await this.autoCommit();
      }
    }, 60000); // 每分钟检查一次
    
    console.log('✅ 文件监控已启动（每分钟检查一次）');
  }
  
  /**
   * 停止监控
   */
  stopWatching() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      console.log('🛑 文件监控已停止');
    }
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const gitSync = new GitSync();
  
  const commands = {
    async init() {
      await gitSync.init();
    },
    
    async status() {
      const status = await gitSync.getStatus();
      console.log(JSON.stringify(status, null, 2));
    },
    
    async commit() {
      const result = await gitSync.autoCommit();
      console.log(JSON.stringify(result, null, 2));
    },
    
    async push() {
      const result = await gitSync.pushToRemote();
      console.log(JSON.stringify(result, null, 2));
    },
    
    async pull() {
      const result = await gitSync.pullFromRemote();
      console.log(JSON.stringify(result, null, 2));
    },
    
    async sync() {
      const result = await gitSync.syncToRemote();
      console.log(JSON.stringify(result, null, 2));
    },
    
    async fullsync() {
      const result = await gitSync.fullSync();
      console.log(JSON.stringify(result, null, 2));
    },
    
    async watch() {
      await gitSync.init();
      gitSync.startWatching();
      // 保持进程运行
      process.stdin.resume();
    },
    
    help() {
      console.log(`
📚 Git同步系统 - 命令行工具

用法: node git-sync.js <命令>

可用命令:
  init      - 初始化Git仓库
  status    - 查看Git状态
  commit    - 自动提交更改
  push      - 推送到远程仓库
  pull      - 从远程拉取更新
  sync      - 提交并推送（同步到远程）
  fullsync  - 拉取、提交、推送（完整同步）
  watch     - 启动文件监控和自动提交
  help      - 显示此帮助信息

示例:
  node git-sync.js init
  node git-sync.js status
  node git-sync.js sync "更新知识库内容"
      `);
    }
  };
  
  const command = args[0] || 'help';
  const extraArgs = args.slice(1);
  
  if (commands[command]) {
    commands[command](...extraArgs).catch(console.error);
  } else {
    console.error(`未知命令: ${command}`);
    commands.help();
  }
}

module.exports = GitSync;