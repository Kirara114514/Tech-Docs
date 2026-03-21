#!/usr/bin/env node
/**
 * 灵感捕捉脚本
 * 用法：node capture.js "记录一下我突然想到xxx"
 * 或通过QQ命令调用
 */

const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_INBOX = path.join(DATA_DIR, 'local', 'inbox');

// 确保目录存在
if (!fs.existsSync(LOCAL_INBOX)) {
  fs.mkdirSync(LOCAL_INBOX, { recursive: true });
}

class IdeaCapture {
  /**
   * 记录新灵感
   * @param {string} text - 灵感内容
   * @param {string[]} tags - 标签数组
   * @returns {Object} 记录结果
   */
  async record(text, tags = []) {
    try {
      // 生成文件名：时间戳-主题.md
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
      const slug = this.createSlug(text);
      const filename = `${timestamp}-${slug}.md`;
      const filepath = path.join(LOCAL_INBOX, filename);
      
      // 创建文件内容
      const content = this.createMarkdownContent(text, tags);
      
      // 写入文件
      fs.writeFileSync(filepath, content, 'utf8');
      
      console.log(`✅ 灵感已记录: ${filename}`);
      
      // 触发静态页面生成
      await this.triggerStaticGeneration();
      
      return {
        success: true,
        filename,
        filepath,
        message: `灵感已记录到: ${filename}`
      };
    } catch (error) {
      console.error('❌ 记录失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 创建URL友好的slug
   */
  createSlug(text) {
    // 取前20个字符，移除特殊字符
    let slug = text.substring(0, 20)
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+$/, '');
    
    if (slug.length === 0) {
      slug = 'idea';
    }
    
    return slug;
  }
  
  /**
   * 创建Markdown内容
   */
  createMarkdownContent(text, tags) {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const tagsStr = tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : '';
    
    return `# ${text}

**记录时间**: ${timestamp}
**状态**: 🟡 待处理
**标签**: ${tagsStr}

---

## 内容

${text}

## 相关想法


## 行动计划


---
*此文件为灵感捕捉系统的自动生成内容*`;
  }
  
  /**
   * 列出所有待处理灵感
   */
  listInbox() {
    try {
      if (!fs.existsSync(LOCAL_INBOX)) {
        return [];
      }
      
      const files = fs.readdirSync(LOCAL_INBOX)
        .filter(file => file.endsWith('.md'))
        .map(file => {
          const filepath = path.join(LOCAL_INBOX, file);
          const stats = fs.statSync(filepath);
          const content = fs.readFileSync(filepath, 'utf8');
          const title = this.extractTitle(content);
          
          return {
            filename: file,
            filepath,
            title: title || file.replace('.md', ''),
            created: stats.birthtime,
            modified: stats.mtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.created - a.created); // 按创建时间倒序
      
      return files;
    } catch (error) {
      console.error('❌ 列出灵感失败:', error);
      return [];
    }
  }
  
  /**
   * 从Markdown内容提取标题
   */
  extractTitle(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }
  
  /**
   * 触发静态页面生成
   */
  async triggerStaticGeneration() {
    try {
      // 这里会调用生成静态页面的脚本
      // 暂时先简单记录日志
      console.log('📄 触发静态页面更新...');
      
      // 实际实现时会调用 generate-static.js
      // const { generateStaticPages } = require('./generate-static');
      // await generateStaticPages();
      
      return true;
    } catch (error) {
      console.error('❌ 触发生成失败:', error);
      return false;
    }
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: node capture.js "记录一下我突然想到xxx"');
    console.log('或: node capture.js list');
    process.exit(1);
  }
  
  const capture = new IdeaCapture();
  
  if (args[0] === 'list') {
    const ideas = capture.listInbox();
    console.log(`\n📋 待处理灵感 (${ideas.length}个):`);
    ideas.forEach((idea, index) => {
      console.log(`${index + 1}. ${idea.title} (${format(idea.created, 'MM-dd HH:mm')})`);
    });
  } else {
    const text = args.join(' ');
    capture.record(text).then(result => {
      if (result.success) {
        console.log(`\n${result.message}`);
      } else {
        console.error(`\n❌ 失败: ${result.error}`);
      }
    });
  }
}

module.exports = IdeaCapture;