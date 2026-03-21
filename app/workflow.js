#!/usr/bin/env node
/**
 * 工作流引擎
 * 管理灵感从捕获到归档的完整生命周期
 */

const fs = require('fs');
const path = require('path');
const { format, parseISO, differenceInHours } = require('date-fns');
const IdeaCapture = require('./capture');
const GitSync = require('./git-sync');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INBOX_DIR = path.join(DATA_DIR, 'local', 'inbox');
const PROCESSING_DIR = path.join(DATA_DIR, 'local', 'processing');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'git', 'knowledge-base');

class WorkflowEngine {
  constructor() {
    this.capture = new IdeaCapture();
    this.gitSync = new GitSync({
      autoCommit: true,
      autoPush: false // 需要确认后才推送
    });
    
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    const dirs = [INBOX_DIR, PROCESSING_DIR, KNOWLEDGE_DIR];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * 获取工作流状态概览
   */
  async getOverview() {
    try {
      const inboxFiles = this.listFiles(INBOX_DIR);
      const processingFiles = this.listFiles(PROCESSING_DIR);
      const knowledgeStats = this.scanKnowledgeStats();
      
      return {
        inbox: {
          count: inboxFiles.length,
          files: inboxFiles.slice(0, 10) // 只显示前10个
        },
        processing: {
          count: processingFiles.length,
          files: processingFiles.slice(0, 10)
        },
        knowledge: knowledgeStats,
        totals: {
          totalIdeas: inboxFiles.length + processingFiles.length + knowledgeStats.totalFiles,
          byStatus: {
            inbox: inboxFiles.length,
            processing: processingFiles.length,
            archived: knowledgeStats.totalFiles
          }
        }
      };
    } catch (error) {
      console.error('❌ 获取工作流概览失败:', error);
      return null;
    }
  }
  
  /**
   * 列出目录中的文件
   */
  listFiles(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    
    try {
      return fs.readdirSync(dirPath)
        .filter(file => file.endsWith('.md'))
        .map(file => {
          const filepath = path.join(dirPath, file);
          const stats = fs.statSync(filepath);
          const content = fs.readFileSync(filepath, 'utf8');
          const title = this.extractTitle(content) || file.replace('.md', '');
          const metadata = this.extractMetadata(content);
          
          return {
            id: file.replace('.md', ''),
            filename: file,
            title,
            path: filepath,
            created: stats.birthtime,
            modified: stats.mtime,
            size: stats.size,
            metadata
          };
        })
        .sort((a, b) => b.created - a.created); // 最新的在前
    } catch (error) {
      console.error(`读取目录失败 ${dirPath}:`, error);
      return [];
    }
  }
  
  /**
   * 扫描知识库统计
   */
  scanKnowledgeStats() {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byCategory: {},
      recentFiles: []
    };
    
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      return stats;
    }
    
    try {
      const scanDir = (dir, category = '') => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          
          if (item.isDirectory() && item.name !== '.git') {
            const newCategory = category ? `${category}/${item.name}` : item.name;
            scanDir(itemPath, newCategory);
          } else if (item.isFile() && item.name.endsWith('.md')) {
            const itemStats = fs.statSync(itemPath);
            const content = fs.readFileSync(itemPath, 'utf8');
            const title = this.extractTitle(content) || item.name.replace('.md', '');
            
            stats.totalFiles++;
            stats.totalSize += itemStats.size;
            
            // 按分类统计
            if (!stats.byCategory[category]) {
              stats.byCategory[category] = { count: 0, size: 0 };
            }
            stats.byCategory[category].count++;
            stats.byCategory[category].size += itemStats.size;
            
            // 最近文件
            stats.recentFiles.push({
              filename: item.name,
              title,
              category,
              path: path.relative(KNOWLEDGE_DIR, itemPath),
              modified: itemStats.mtime,
              size: itemStats.size
            });
          }
        }
      };
      
      scanDir(KNOWLEDGE_DIR);
      
      // 按修改时间排序最近文件
      stats.recentFiles.sort((a, b) => b.modified - a.modified);
      stats.recentFiles = stats.recentFiles.slice(0, 10); // 只保留最近10个
      
      return stats;
    } catch (error) {
      console.error('扫描知识库失败:', error);
      return stats;
    }
  }
  
  /**
   * 从Markdown提取标题
   */
  extractTitle(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }
  
  /**
   * 从Markdown提取元数据
   */
  extractMetadata(content) {
    const metadata = {
      status: 'inbox',
      tags: [],
      lastDiscussed: null,
      priority: 'normal'
    };
    
    // 提取状态
    const statusMatch = content.match(/\*\*状态\*\*:\s*([^\n]+)/);
    if (statusMatch) {
      metadata.status = statusMatch[1].trim();
    }
    
    // 提取标签
    const tagsMatch = content.match(/\*\*标签\*\*:\s*([^\n]+)/);
    if (tagsMatch) {
      metadata.tags = tagsMatch[1].trim()
        .split(/\s+/)
        .filter(tag => tag.startsWith('#') && tag.length > 1)
        .map(tag => tag.substring(1));
    }
    
    // 提取记录时间
    const timeMatch = content.match(/\*\*记录时间\*\*:\s*([^\n]+)/);
    if (timeMatch) {
      metadata.recordedAt = timeMatch[1].trim();
    }
    
    return metadata;
  }
  
  /**
   * 开始讨论一个灵感
   */
  async startDiscussion(ideaId, notes = '') {
    try {
      // 查找灵感文件
      const ideaFile = this.findIdeaFile(ideaId);
      if (!ideaFile) {
        throw new Error(`未找到灵感: ${ideaId}`);
      }
      
      // 读取内容
      const content = fs.readFileSync(ideaFile.path, 'utf8');
      
      // 更新状态为"讨论中"
      const updatedContent = content.replace(
        /\*\*状态\*\*:\s*[^\n]+/,
        `**状态**: 🔄 讨论中`
      );
      
      // 添加讨论记录
      const discussionNote = notes ? `\n\n## 讨论记录\n\n**${format(new Date(), 'yyyy-MM-dd HH:mm')}**\n${notes}\n` : '';
      const finalContent = updatedContent + discussionNote;
      
      // 移动到处理中目录
      const newFilename = `discussing-${ideaFile.filename}`;
      const newPath = path.join(PROCESSING_DIR, newFilename);
      
      fs.writeFileSync(newPath, finalContent, 'utf8');
      
      // 从收件箱删除原文件
      fs.unlinkSync(ideaFile.path);
      
      console.log(`✅ 已开始讨论: ${ideaFile.title}`);
      
      return {
        success: true,
        ideaId,
        newFilename,
        title: ideaFile.title,
        message: `灵感"${ideaFile.title}"已移动到讨论中`
      };
    } catch (error) {
      console.error('❌ 开始讨论失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 添加讨论笔记
   */
  async addDiscussionNote(ideaId, note) {
    try {
      const ideaFile = this.findIdeaFile(ideaId, PROCESSING_DIR);
      if (!ideaFile) {
        throw new Error(`未找到讨论中的灵感: ${ideaId}`);
      }
      
      const content = fs.readFileSync(ideaFile.path, 'utf8');
      
      // 查找或创建讨论记录部分
      let updatedContent;
      if (content.includes('## 讨论记录')) {
        // 在现有讨论记录后添加
        const noteEntry = `\n**${format(new Date(), 'yyyy-MM-dd HH:mm')}**\n${note}\n`;
        updatedContent = content.replace('## 讨论记录', `## 讨论记录\n${noteEntry}`);
      } else {
        // 创建新的讨论记录部分
        const discussionSection = `\n\n## 讨论记录\n\n**${format(new Date(), 'yyyy-MM-dd HH:mm')}**\n${note}\n`;
        updatedContent = content + discussionSection;
      }
      
      fs.writeFileSync(ideaFile.path, updatedContent, 'utf8');
      
      console.log(`📝 已添加讨论笔记: ${ideaFile.title}`);
      
      return {
        success: true,
        ideaId,
        title: ideaFile.title,
        message: '讨论笔记已添加'
      };
    } catch (error) {
      console.error('❌ 添加讨论笔记失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 归档灵感到知识库
   */
  async archiveIdea(ideaId, category, subcategory = '', notes = '') {
    try {
      const ideaFile = this.findIdeaFile(ideaId, PROCESSING_DIR);
      if (!ideaFile) {
        throw new Error(`未找到讨论完成的灵感: ${ideaId}`);
      }
      
      // 读取内容
      let content = fs.readFileSync(ideaFile.path, 'utf8');
      
      // 更新状态为"已归档"
      content = content.replace(
        /\*\*状态\*\*:\s*[^\n]+/,
        `**状态**: ✅ 已归档`
      );
      
      // 添加归档信息
      const archiveInfo = `\n\n## 归档信息\n\n**归档时间**: ${format(new Date(), 'yyyy-MM-dd HH:mm')}\n**分类**: ${category}${subcategory ? ` / ${subcategory}` : ''}\n**归档说明**: ${notes || '无'}\n`;
      content += archiveInfo;
      
      // 确定目标路径
      let targetDir = KNOWLEDGE_DIR;
      if (category) {
        targetDir = path.join(targetDir, category);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        
        if (subcategory) {
          targetDir = path.join(targetDir, subcategory);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
        }
      }
      
      // 生成新文件名（避免冲突）
      const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
      const slug = this.createSlug(ideaFile.title);
      const newFilename = `${timestamp}-${slug}.md`;
      const targetPath = path.join(targetDir, newFilename);
      
      // 写入归档文件
      fs.writeFileSync(targetPath, content, 'utf8');
      
      // 从处理中删除原文件
      fs.unlinkSync(ideaFile.path);
      
      console.log(`📚 已归档: ${ideaFile.title} -> ${category}${subcategory ? '/' + subcategory : ''}`);
      
      // 触发Git提交
      await this.gitSync.autoCommit(`归档: ${ideaFile.title}到${category}`);
      
      return {
        success: true,
        ideaId,
        originalTitle: ideaFile.title,
        newFilename,
        category,
        subcategory,
        targetPath,
        message: `灵感"${ideaFile.title}"已归档到${category}${subcategory ? '/' + subcategory : ''}`
      };
    } catch (error) {
      console.error('❌ 归档失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 丢弃灵感（不归档）
   */
  async discardIdea(ideaId, reason = '') {
    try {
      const ideaFile = this.findIdeaFile(ideaId);
      if (!ideaFile) {
        throw new Error(`未找到灵感: ${ideaId}`);
      }
      
      // 记录丢弃原因（可选保存到日志）
      if (reason) {
        const discardLog = path.join(DATA_DIR, 'discarded.log');
        const logEntry = `[${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}] ${ideaId} - ${ideaFile.title}\n原因: ${reason}\n\n`;
        fs.appendFileSync(discardLog, logEntry, 'utf8');
      }
      
      // 删除文件
      fs.unlinkSync(ideaFile.path);
      
      console.log(`🗑️ 已丢弃: ${ideaFile.title}`);
      
      return {
        success: true,
        ideaId,
        title: ideaFile.title,
        message: `灵感"${ideaFile.title}"已丢弃`
      };
    } catch (error) {
      console.error('❌ 丢弃失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 查找灵感文件
   */
  findIdeaFile(ideaId, searchDir = null) {
    const dirs = searchDir ? [searchDir] : [INBOX_DIR, PROCESSING_DIR];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      
      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.md'))
        .map(file => {
          const filepath = path.join(dir, file);
          const stats = fs.statSync(filepath);
          const content = fs.readFileSync(filepath, 'utf8');
          const title = this.extractTitle(content) || file.replace('.md', '');
          
          return {
            id: file.replace('.md', ''),
            filename: file,
            title,
            path: filepath,
            created: stats.birthtime
          };
        });
      
      const found = files.find(file => file.id === ideaId || file.filename.includes(ideaId));
      if (found) return found;
    }
    
    return null;
  }
  
  /**
   * 创建URL友好的slug
   */
  createSlug(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50)
      .replace(/-+$/, '');
  }
  
  /**
   * 获取需要回顾的灵感
   */
  async getIdeasForReview() {
    try {
      const inboxFiles = this.listFiles(INBOX_DIR);
      const processingFiles = this.listFiles(PROCESSING_DIR);
      
      // 超过24小时未处理的灵感
      const oldInbox = inboxFiles.filter(file => {
        const hoursOld = differenceInHours(new Date(), file.created);
        return hoursOld > 24;
      });
      
      // 超过48小时未更新的讨论
      const staleProcessing = processingFiles.filter(file => {
        const hoursOld = differenceInHours(new Date(), file.modified);
        return hoursOld > 48;
      });
      
      return {
        oldInbox: {
          count: oldInbox.length,
          ideas: oldInbox.slice(0, 5) // 最多显示5个
        },
        staleProcessing: {
          count: staleProcessing.length,
          ideas: staleProcessing.slice(0, 5)
        },
        totalForReview: oldInbox.length + staleProcessing.length
      };
    } catch (error) {
      console.error('❌ 获取回顾列表失败:', error);
      return null;
    }
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const workflow = new WorkflowEngine();
  
  const commands = {
    async overview() {
      const overview = await workflow.getOverview();
      console.log(JSON.stringify(overview, null, 2));
    },
    
    async review() {
      const reviewList = await workflow.getIdeasForReview();
      console.log(JSON.stringify(reviewList, null, 2));
    },
    
    async discuss() {
      const [ideaId, ...noteParts] = args.slice(1);
      const note = noteParts.join(' ');
      
      if (!ideaId) {
        console.error('请提供灵感ID');
        return;
      }
      
      const result = await workflow.startDiscussion(ideaId, note);
      console.log(JSON.stringify(result, null, 2));
    },
    
    async addnote() {
      const [ideaId, ...noteParts] = args.slice(1);
      const note = noteParts.join(' ');
      
      if (!ideaId || !note) {
        console.error('请提供灵感ID和笔记内容');
        return;
      }
      
      const result = await workflow.addDiscussionNote(ideaId, note);
      console.log(JSON.stringify(result, null, 2));
    },
    
    async archive() {
      const [ideaId, category, subcategory, ...noteParts] = args.slice(1);
      const note = noteParts.join(' ');
      
      if (!ideaId || !category) {
        console.error('请提供灵感ID和分类');
        return;
      }
      
      const result = await workflow.archiveIdea(ideaId, category, subcategory, note);
      console.log(JSON.stringify(result, null, 2));
    },
    
    async discard() {
      const [ideaId, ...reasonParts] = args.slice(1);
      const reason = reasonParts.join(' ');
      
      if (!ideaId) {
        console.error('请提供灵感ID');
        return;
      }
      
      const result = await workflow.discardIdea(ideaId, reason);
      console.log(JSON.stringify(result, null, 2));
    },
    
    async find() {
      const ideaId = args[1];
      if (!ideaId) {
        console.error('请提供灵感ID或关键词');
        return;
      }
      
      const ideaFile = workflow.findIdeaFile(ideaId);
      if (ideaFile) {
        console.log(JSON.stringify(ideaFile, null, 2));
      } else {
        console.log(`未找到灵感: ${ideaId}`);
      }
    },
    
    help() {
      console.log(`
📚 工作流引擎 - 命令行工具

用法: node workflow.js <命令> [参数]

可用命令:
  overview          - 查看工作流概览
  review            - 获取需要回顾的灵感
  discuss <id> [笔记] - 开始讨论灵感
  addnote <id> <笔记> - 添加讨论笔记
  archive <id> <分类> [子分类] [说明] - 归档灵感到知识库
  discard <id> [原因] - 丢弃灵感
  find <id/关键词>    - 查找灵感文件
  help              - 显示此帮助信息

示例:
  node workflow.js overview
  node workflow.js review
  node workflow.js discuss 2026-03-21-180514-api "这个API设计需要优化"
  node workflow.js archive 2026-03-21-180514-api 技术 编程 "API设计最佳实践"
  node workflow.js find rust
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

module.exports = WorkflowEngine;