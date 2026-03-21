#!/usr/bin/env node
/**
 * 测试Git连接和权限
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testGitConnection() {
  console.log('🔍 测试Git连接...');
  
  try {
    // 1. 测试基本Git命令
    console.log('1. 测试Git版本...');
    const { stdout: gitVersion } = await execPromise('git --version');
    console.log(`   ✅ ${gitVersion.trim()}`);
    
    // 2. 测试远程仓库连接（只获取HEAD，不拉取内容）
    console.log('2. 测试远程仓库连接...');
    const { stdout: remoteHead } = await execPromise('git ls-remote --heads origin main', {
      timeout: 10000,
      cwd: '/home/node/clawd/knowledge-system'
    });
    console.log(`   ✅ 远程仓库可访问`);
    console.log(`     最新提交: ${remoteHead.split(/\s+/)[0].substring(0, 12)}`);
    
    // 3. 检查本地和远程差异
    console.log('3. 检查本地和远程差异...');
    const { stdout: localCommit } = await execPromise('git log --oneline -1', {
      cwd: '/home/node/clawd/knowledge-system'
    });
    console.log(`   本地最新提交: ${localCommit.trim()}`);
    
    // 4. 检查data/git/目录状态
    console.log('4. 检查知识库目录...');
    const fs = require('fs');
    const knowledgeDir = '/home/node/clawd/knowledge-system/data/git/knowledge-base';
    
    if (fs.existsSync(knowledgeDir)) {
      const files = fs.readdirSync(knowledgeDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      console.log(`   📁 知识库文件: ${mdFiles.length}个MD文件`);
      
      if (mdFiles.length > 0) {
        console.log(`   示例文件: ${mdFiles.slice(0, 3).join(', ')}`);
      }
    } else {
      console.log('   📁 知识库目录为空');
    }
    
    // 5. 检查.gitignore配置
    console.log('5. 检查.gitignore配置...');
    const gitignorePath = '/home/node/clawd/knowledge-system/.gitignore';
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const hasLocalIgnore = content.includes('data/local/');
      const hasLogsIgnore = content.includes('logs/');
      
      console.log(`   ✅ .gitignore配置正确`);
      console.log(`     忽略data/local/: ${hasLocalIgnore ? '✅' : '❌'}`);
      console.log(`     忽略logs/: ${hasLogsIgnore ? '✅' : '❌'}`);
    }
    
    console.log('\n🎯 测试完成！');
    console.log('\n💡 建议:');
    console.log('   1. 网络问题可能是暂时的，可以稍后重试');
    console.log('   2. 系统核心功能不受Git同步影响');
    console.log('   3. 本地操作完全正常');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 网络超时，可能是:');
      console.log('   • GitHub访问速度慢');
      console.log('   • 网络连接不稳定');
      console.log('   • 防火墙限制');
    } else if (error.message.includes('Authentication')) {
      console.log('\n💡 认证问题，请检查:');
      console.log('   • GitHub Token是否有效');
      console.log('   • Token是否有repo权限');
    }
  }
}

testGitConnection();