#!/usr/bin/env node
/**
 * 静态页面生成脚本
 * 生成HTML页面，展示所有内容
 */

const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_INBOX = path.join(DATA_DIR, 'local', 'inbox');
const LOCAL_PROCESSING = path.join(DATA_DIR, 'local', 'processing');
const GIT_KNOWLEDGE = path.join(DATA_DIR, 'git', 'knowledge-base');

class StaticGenerator {
  constructor() {
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    const dirs = [PUBLIC_DIR];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * 生成所有静态页面
   */
  async generateAll() {
    console.log('🚀 开始生成静态页面...');
    
    try {
      // 1. 生成首页
      await this.generateIndex();
      
      // 2. 生成日常灵感页面
      await this.generateDailyPage();
      
      // 3. 生成知识库页面
      await this.generateKnowledgePage();
      
      // 4. 复制静态资源
      await this.copyAssets();
      
      console.log('✅ 静态页面生成完成！');
      return true;
    } catch (error) {
      console.error('❌ 生成失败:', error);
      return false;
    }
  }
  
  /**
   * 生成首页
   */
  async generateIndex() {
    const ideas = this.listFiles(LOCAL_INBOX);
    const processing = this.listFiles(LOCAL_PROCESSING);
    const knowledge = this.scanKnowledgeBase();
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的知识管理系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6; 
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        h1 { 
            font-size: 2.5rem; 
            margin-bottom: 10px;
            font-weight: 300;
        }
        .subtitle {
            font-size: 1.1rem;
            opacity: 0.9;
            margin-bottom: 30px;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            padding: 40px;
        }
        .section {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            transition: transform 0.3s ease;
        }
        .section:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .section-title {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid;
            font-size: 1.3rem;
            font-weight: 600;
        }
        .section-title .icon {
            font-size: 1.5rem;
            margin-right: 10px;
        }
        .inbox .section-title { border-color: #ff6b6b; color: #ff6b6b; }
        .processing .section-title { border-color: #ffd93d; color: #ffa726; }
        .knowledge .section-title { border-color: #4cd964; color: #4cd964; }
        .item {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            border-left: 4px solid;
            transition: all 0.3s ease;
        }
        .item:hover {
            background: #f8f9ff;
            transform: translateX(5px);
        }
        .inbox .item { border-left-color: #ff6b6b; }
        .processing .item { border-left-color: #ffa726; }
        .knowledge .item { border-left-color: #4cd964; }
        .item-title {
            font-weight: 600;
            margin-bottom: 5px;
            color: #2c3e50;
        }
        .item-meta {
            font-size: 0.85rem;
            color: #7f8c8d;
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
        }
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-left: 8px;
        }
        .badge-local { background: #ffeaa7; color: #d35400; }
        .badge-discuss { background: #fab1a0; color: #c0392b; }
        .badge-synced { background: #55efc4; color: #00b894; }
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #95a5a6;
            font-style: italic;
        }
        footer {
            text-align: center;
            padding: 30px;
            color: #7f8c8d;
            border-top: 1px solid #ecf0f1;
            font-size: 0.9rem;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .stat {
            text-align: center;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: 700;
            color: #667eea;
            display: block;
        }
        .stat-label {
            font-size: 0.9rem;
            color: #7f8c8d;
        }
        @media (max-width: 768px) {
            .dashboard {
                grid-template-columns: 1fr;
                padding: 20px;
            }
            header {
                padding: 30px 20px;
            }
            h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📚 我的知识管理系统</h1>
            <p class="subtitle">灵感捕捉 · 思考整理 · 知识沉淀</p>
            <div class="stats">
                <div class="stat">
                    <span class="stat-number">${ideas.length}</span>
                    <span class="stat-label">待处理灵感</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${processing.length}</span>
                    <span class="stat-label">讨论中</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${knowledge.count}</span>
                    <span class="stat-label">已归档知识</span>
                </div>
            </div>
        </header>
        
        <div class="dashboard">
            <div class="section inbox">
                <div class="section-title">
                    <span class="icon">📝</span>
                    <span>日常灵感</span>
                </div>
                ${this.renderIdeasList(ideas, 'local')}
            </div>
            
            <div class="section processing">
                <div class="section-title">
                    <span class="icon">🔄</span>
                    <span>处理中</span>
                </div>
                ${this.renderIdeasList(processing, 'discuss')}
            </div>
            
            <div class="section knowledge">
                <div class="section-title">
                    <span class="icon">📚</span>
                    <span>知识库</span>
                </div>
                ${this.renderKnowledgeList(knowledge.categories)}
            </div>
        </div>
        
        <footer>
            <p>最后更新: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
            <p>系统状态: <span style="color: #4cd964;">● 运行正常</span></p>
            <p>💡 提示: 通过QQ向艾米莉发送"记录一下我突然想到xxx"来添加新灵感</p>
        </footer>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), html, 'utf8');
    console.log('✅ 首页生成完成');
  }
  
  /**
   * 生成日常灵感页面
   */
  async generateDailyPage() {
    const ideas = this.listFiles(LOCAL_INBOX);
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>日常灵感 - 知识管理系统</title>
    <style>
        /* 样式与首页类似，简化版 */
        body { font-family: sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        h1 { color: #333; border-bottom: 2px solid #ff6b6b; padding-bottom: 10px; }
        .idea { border-left: 4px solid #ff6b6b; padding: 15px; margin: 15px 0; background: #fff5f5; }
        .back { display: inline-block; margin-bottom: 20px; color: #667eea; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <a href="index.html" class="back">← 返回首页</a>
        <h1>📝 日常灵感 (${ideas.length}个)</h1>
        ${ideas.length === 0 ? 
          '<p class="empty">暂无灵感，快去记录一些想法吧！</p>' : 
          ideas.map(idea => `
            <div class="idea">
                <h3>${idea.title}</h3>
                <p>创建时间: ${format(idea.created, 'yyyy-MM-dd HH:mm')}</p>
                <span class="badge badge-local">本地</span>
            </div>
          `).join('')
        }
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(PUBLIC_DIR, 'daily.html'), html, 'utf8');
  }
  
  /**
   * 生成知识库页面
   */
  async generateKnowledgePage() {
    const knowledge = this.scanKnowledgeBase();
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>知识库 - 知识管理系统</title>
    <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        h1 { color: #333; border-bottom: 2px solid #4cd964; padding-bottom: 10px; }
        .category { margin: 20px 0; padding: 15px; background: #f8fff8; border-radius: 8px; }
        .subcategory { margin-left: 20px; margin-top: 10px; }
        .file { padding: 8px; border-left: 3px solid #4cd964; margin: 5px 0; background: #f0fff4; }
        .back { display: inline-block; margin-bottom: 20px; color: #667eea; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <a href="index.html" class="back">← 返回首页</a>
        <h1>📚 知识库 (${knowledge.count}个文档)</h1>
        ${this.renderKnowledgeDetails(knowledge.categories)}
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(PUBLIC_DIR, 'knowledge.html'), html, 'utf8');
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
          
          return {
            filename: file,
            title,
            created: stats.birthtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.created - a.created);
    } catch (error) {
      console.error(`读取目录失败 ${dirPath}:`, error);
      return [];
    }
  }
  
  /**
   * 扫描知识库
   */
  scanKnowledgeBase() {
    const categories = {};
    let totalCount = 0;
    
    if (!fs.existsSync(GIT_KNOWLEDGE)) {
      return { categories: {}, count: 0 };
    }
    
    try {
      const scanDir = (dir, depth = 0) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        const result = {
          files: [],
          subcategories: {}
        };
        
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          
          if (item.isDirectory() && item.name !== '.git') {
            result.subcategories[item.name] = scanDir(itemPath, depth + 1);
          } else if (item.isFile() && item.name.endsWith('.md')) {
            const stats = fs.statSync(itemPath);
            const content = fs.readFileSync(itemPath, 'utf8');
            const title = this.extractTitle(content) || item.name.replace('.md', '');
            
            result.files.push({
              name: item.name,
              title,
              path: path.relative(GIT_KNOWLEDGE, itemPath),
              size: stats.size,
              modified: stats.mtime
            });
            totalCount++;
          }
        }
        
        return result;
      };
      
      const items = fs.readdirSync(GIT_KNOWLEDGE, { withFileTypes: true });
      
      for (const item of items) {
        if (item.isDirectory() && item.name !== '.git') {
          categories[item.name] = scanDir(path.join(GIT_KNOWLEDGE, item.name));
        }
      }
      
      return {
        categories,
        count: totalCount
      };
    } catch (error) {
      console.error('扫描知识库失败:', error);
      return { categories: {}, count: 0 };
    }
  }
  
  /**
   * 提取Markdown标题
   */
  extractTitle(content) {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }
  
  /**
   * 渲染灵感列表
   */
  renderIdeasList(ideas, type) {
    if (ideas.length === 0) {
      return '<div class="empty-state">暂无内容</div>';
    }
    
    return ideas.map(idea => `
      <div class="item">
        <div class="item-title">${idea.title}</div>
        <div class="item-meta">
          <span>${format(idea.created, 'MM-dd HH:mm')}</span>
          <span>
            ${type === 'local' ? '<span class="badge badge-local">本地</span>' : ''}
            ${type === 'discuss' ? '<span class="badge badge-discuss">讨论中</span>' : ''}
            ${type === 'synced' ? '<span class="badge badge-synced">已同步</span>' : ''}
          </span>
        </div>
      </div>
    `).join('');
  }
  
  /**
   * 渲染知识库列表
   */
  renderKnowledgeList(categories) {
    if (Object.keys(categories).length === 0) {
      return '<div class="empty-state">知识库为空</div>';
    }
    
    let html = '';
    for (const [category, data] of Object.entries(categories)) {
      const fileCount = this.countFiles(data);
      html += `
        <div class="item">
          <div class="item-title">${category}</div>
          <div class="item-meta">
            <span>${fileCount}个文档</span>
            <span class="badge badge-synced">已同步</span>
          </div>
        </div>
      `;
    }
    return html;
  }
  
  /**
   * 渲染知识库详情
   */
  renderKnowledgeDetails(categories) {
    if (Object.keys(categories).length === 0) {
      return '<p class="empty">知识库为空，请先整理归档一些灵感。</p>';
    }
    
    let html = '';
    for (const [category, data] of Object.entries(categories)) {
      html += `
        <div class="category">
          <h2>${category}</h2>
          ${this.renderCategoryDetails(data, 1)}
        </div>
      `;
    }
    return html;
  }
  
  /**
   * 渲染分类详情
   */
  renderCategoryDetails(data, depth) {
    let html = '';
    
    // 渲染文件
    if (data.files && data.files.length > 0) {
      html += data.files.map(file => `
        <div class="file">
          <strong>${file.title}</strong>
          <div style="font-size: 0.9em; color: #666;">
            ${format(file.modified, 'yyyy-MM-dd')} · ${Math.ceil(file.size / 1024)}KB
          </div>
        </div>
      `).join('');
    }
    
    // 渲染子分类
    if (data.subcategories && Object.keys(data.subcategories).length > 0) {
      for (const [subcat, subdata] of Object.entries(data.subcategories)) {
        html += `
          <div class="subcategory">
            <h3 style="margin-top: 15px; color: #555;">${subcat}</h3>
            ${this.renderCategoryDetails(subdata, depth + 1)}
          </div>
        `;
      }
    }
    
    return html;
  }
  
  /**
   * 计算文件总数
   */
  countFiles(data) {
    let count = 0;
    
    if (data.files) {
      count += data.files.length;
    }
    
    if (data.subcategories) {
      for (const subdata of Object.values(data.subcategories)) {
        count += this.countFiles(subdata);
      }
    }
    
    return count;
  }
  
  /**
   * 复制静态资源
   */
  async copyAssets() {
    // 这里可以复制CSS、JS等静态资源
    // 暂时留空，后续完善
    console.log('📁 静态资源准备就绪');
    return true;
  }
}

// 命令行接口
if (require.main === module) {
  const generator = new StaticGenerator();
  generator.generateAll().then(success => {
    if (success) {
      console.log('🎉 所有静态页面生成完成！');
      console.log(`📄 首页: file://${path.join(PUBLIC_DIR, 'index.html')}`);
    } else {
      console.error('❌ 生成失败');
      process.exit(1);
    }
  });
}

module.exports = StaticGenerator;