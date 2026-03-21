#!/usr/bin/env node
/**
 * 知识管理系统 - 主集成脚本
 * 启动所有服务并集成QQ命令
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

class KnowledgeSystem {
  constructor() {
    this.processes = {
      webServer: null,
      fileWatcher: null,
      gitSync: null
    };
    
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }
  
  /**
   * 启动Web服务器
   */
  startWebServer() {
    return new Promise((resolve, reject) => {
      console.log('🚀 启动Web服务器...');
      
      const logFile = path.join(LOGS_DIR, 'web-server.log');
      const out = fs.openSync(logFile, 'a');
      const err = fs.openSync(logFile, 'a');
      
      this.processes.webServer = spawn('node', ['app/server.js'], {
        stdio: ['ignore', out, err],
        detached: true,
        cwd: ROOT_DIR
      });
      
      this.processes.webServer.unref();
      
      // 等待服务器启动
      setTimeout(() => {
        console.log('✅ Web服务器已启动 (端口: 3000)');
        console.log(`📄 日志文件: ${logFile}`);
        resolve(true);
      }, 3000);
    });
  }
  
  /**
   * 启动Git同步监控
   */
  startGitSync() {
    return new Promise((resolve, reject) => {
      console.log('🔄 启动Git同步监控...');
      
      const logFile = path.join(LOGS_DIR, 'git-sync.log');
      const out = fs.openSync(logFile, 'a');
      const err = fs.openSync(logFile, 'a');
      
      this.processes.gitSync = spawn('node', ['app/git-sync.js', 'watch'], {
        stdio: ['ignore', out, err],
        detached: true,
        cwd: ROOT_DIR
      });
      
      this.processes.gitSync.unref();
      
      setTimeout(() => {
        console.log('✅ Git同步监控已启动');
        console.log(`📄 日志文件: ${logFile}`);
        resolve(true);
      }, 2000);
    });
  }
  
  /**
   * 处理QQ命令
   */
  async handleQQCommand(command) {
    try {
      const QQIntegration = require('./qq-integration');
      const qq = new QQIntegration();
      
      const result = await qq.handleMessage(command);
      return result;
    } catch (error) {
      console.error('处理QQ命令失败:', error);
      return {
        success: false,
        message: `❌ 处理命令时出错: ${error.message}`
      };
    }
  }
  
  /**
   * 获取系统状态
   */
  async getSystemStatus() {
    try {
      const status = {
        webServer: false,
        gitSync: false,
        timestamp: new Date().toISOString()
      };
      
      // 检查Web服务器
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('http://localhost:3000/api/status', { timeout: 3000 });
        status.webServer = response.ok;
      } catch (error) {
        status.webServer = false;
        status.webServerError = error.message;
      }
      
      // 检查Git同步（通过进程是否存在）
      status.gitSync = this.processes.gitSync !== null;
      
      // 检查数据目录
      const dataDirs = [
        'data/local/inbox',
        'data/local/processing', 
        'data/git/knowledge-base'
      ];
      
      status.dataDirs = {};
      for (const dir of dataDirs) {
        const dirPath = path.join(ROOT_DIR, dir);
        status.dataDirs[dir] = {
          exists: fs.existsSync(dirPath),
          fileCount: fs.existsSync(dirPath) ? 
            fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).length : 0
        };
      }
      
      return status;
    } catch (error) {
      console.error('获取系统状态失败:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * 停止所有服务
   */
  stopAll() {
    console.log('🛑 停止所有服务...');
    
    Object.values(this.processes).forEach(proc => {
      if (proc) {
        try {
          process.kill(-proc.pid); // 杀死整个进程组
        } catch (error) {
          // 进程可能已经结束
        }
      }
    });
    
    this.processes = {
      webServer: null,
      fileWatcher: null,
      gitSync: null
    };
    
    console.log('✅ 所有服务已停止');
  }
  
  /**
   * 重启所有服务
   */
  async restartAll() {
    console.log('🔄 重启所有服务...');
    
    this.stopAll();
    await this.startAll();
    
    console.log('✅ 所有服务已重启');
  }
  
  /**
   * 启动所有服务
   */
  async startAll() {
    console.log('🚀 启动知识管理系统...');
    console.log(`📁 工作目录: ${ROOT_DIR}`);
    
    try {
      await this.startWebServer();
      await this.startGitSync();
      
      console.log('\n🎉 知识管理系统启动完成！');
      console.log('\n📋 可用服务:');
      console.log('  🌐 Web服务器: http://localhost:3000');
      console.log('  📡 Git同步: 自动监控中');
      console.log('  💬 QQ集成: 已就绪');
      
      console.log('\n📁 数据目录:');
      console.log(`  📝 灵感收件箱: ${path.join(ROOT_DIR, 'data/local/inbox')}`);
      console.log(`  💬 讨论中: ${path.join(ROOT_DIR, 'data/local/processing')}`);
      console.log(`  📚 知识库: ${path.join(ROOT_DIR, 'data/git/knowledge-base')}`);
      
      console.log('\n📄 日志文件:');
      console.log(`  📋 系统日志: ${path.join(LOGS_DIR, 'knowledge-system.log')}`);
      console.log(`  🌐 Web服务器: ${path.join(LOGS_DIR, 'web-server.log')}`);
      console.log(`  🔄 Git同步: ${path.join(LOGS_DIR, 'git-sync.log')}`);
      
      console.log('\n💡 通过QQ发送命令:');
      console.log('  • "记录一下 <内容>" - 记录新灵感');
      console.log('  • "有什么灵感" - 查看待处理灵感');
      console.log('  • "状态" - 查看系统状态');
      console.log('  • "帮助" - 查看完整命令列表');
      
      return true;
    } catch (error) {
      console.error('❌ 启动失败:', error);
      this.stopAll();
      return false;
    }
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const system = new KnowledgeSystem();
  
  const commands = {
    async start() {
      await system.startAll();
      
      // 保持进程运行
      console.log('\n⏳ 系统运行中，按 Ctrl+C 停止...');
      process.on('SIGINT', () => {
        system.stopAll();
        process.exit(0);
      });
      
      // 定期检查状态
      setInterval(async () => {
        const status = await system.getSystemStatus();
        if (!status.webServer) {
          console.warn('⚠️ Web服务器异常，尝试重启...');
          await system.restartAll();
        }
      }, 60000); // 每分钟检查一次
    },
    
    async stop() {
      system.stopAll();
      process.exit(0);
    },
    
    async restart() {
      await system.restartAll();
      
      process.on('SIGINT', () => {
        system.stopAll();
        process.exit(0);
      });
    },
    
    async status() {
      const status = await system.getSystemStatus();
      console.log(JSON.stringify(status, null, 2));
    },
    
    async qq() {
      const message = args.slice(1).join(' ');
      if (!message) {
        console.error('请提供QQ消息内容');
        return;
      }
      
      const result = await system.handleQQCommand(message);
      console.log(result.message);
    },
    
    help() {
      console.log(`
📚 知识管理系统 - 主控制脚本

用法: node main.js <命令> [参数]

可用命令:
  start     - 启动所有服务
  stop      - 停止所有服务
  restart   - 重启所有服务
  status    - 查看系统状态
  qq <消息> - 模拟QQ命令
  help      - 显示此帮助信息

示例:
  node main.js start
  node main.js status
  node main.js qq "记录一下测试灵感"
  node main.js qq "有什么灵感"

💡 建议使用: node main.js start
      `);
    }
  };
  
  const command = args[0] || 'help';
  
  if (commands[command]) {
    commands[command]().catch(console.error);
  } else {
    console.error(`未知命令: ${command}`);
    commands.help();
  }
}

module.exports = KnowledgeSystem;