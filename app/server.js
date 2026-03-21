#!/usr/bin/env node
/**
 * 知识管理系统 - Express服务器
 * 提供Web界面和API
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const IdeaCapture = require('./capture');
const StaticGenerator = require('./generate-static');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');

// 中间件
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use(express.urlencoded({ extended: true }));

// 确保目录存在
function ensureDirectories() {
  const dirs = [
    path.join(DATA_DIR, 'local', 'inbox'),
    path.join(DATA_DIR, 'local', 'processing'),
    path.join(DATA_DIR, 'git', 'knowledge-base'),
    PUBLIC_DIR
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// API路由

/**
 * 获取系统状态
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      '/api/status',
      '/api/inbox',
      '/api/capture',
      '/api/knowledge',
      '/api/generate'
    ]
  });
});

/**
 * 获取待处理灵感列表
 */
app.get('/api/inbox', (req, res) => {
  try {
    const capture = new IdeaCapture();
    const ideas = capture.listInbox();
    res.json({
      success: true,
      count: ideas.length,
      ideas: ideas.map(idea => ({
        id: idea.filename.replace('.md', ''),
        title: idea.title,
        created: idea.created,
        size: idea.size
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 记录新灵感
 */
app.post('/api/capture', async (req, res) => {
  try {
    const { text, tags = [] } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '灵感内容不能为空'
      });
    }
    
    const capture = new IdeaCapture();
    const result = await capture.record(text, tags);
    
    if (result.success) {
      res.json({
        success: true,
        message: '灵感记录成功',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取知识库内容
 */
app.get('/api/knowledge', (req, res) => {
  try {
    const generator = new StaticGenerator();
    const knowledge = generator.scanKnowledgeBase();
    
    res.json({
      success: true,
      count: knowledge.count,
      categories: knowledge.categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 触发重新生成静态页面
 */
app.post('/api/generate', async (req, res) => {
  try {
    const generator = new StaticGenerator();
    const success = await generator.generateAll();
    
    if (success) {
      res.json({
        success: true,
        message: '静态页面重新生成成功',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: '生成失败'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 文件上传接口（用于直接上传MD文件）
 */
app.post('/api/upload', async (req, res) => {
  try {
    // 这里实现文件上传逻辑
    // 暂时返回占位符
    res.json({
      success: true,
      message: '文件上传接口准备中',
      note: '后续版本将实现文件上传功能'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取文件内容
 */
app.get('/api/file/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    
    let filePath;
    if (type === 'inbox') {
      filePath = path.join(DATA_DIR, 'local', 'inbox', filename);
    } else if (type === 'processing') {
      filePath = path.join(DATA_DIR, 'local', 'processing', filename);
    } else if (type === 'knowledge') {
      filePath = path.join(DATA_DIR, 'git', 'knowledge-base', filename);
    } else {
      return res.status(400).json({
        success: false,
        error: '无效的文件类型'
      });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    res.json({
      success: true,
      filename,
      content,
      stats: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 首页路由
 */
app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // 如果静态页面不存在，生成一个简单的首页
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>知识管理系统</title>
        <style>
          body { font-family: sans-serif; padding: 40px; text-align: center; }
          h1 { color: #333; }
          .status { background: #f0f0f0; padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 600px; }
          .endpoint { text-align: left; background: white; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>📚 知识管理系统</h1>
        <p>系统正在运行，静态页面生成中...</p>
        <div class="status">
          <h3>API端点</h3>
          <div class="endpoint"><strong>GET</strong> /api/status - 系统状态</div>
          <div class="endpoint"><strong>GET</strong> /api/inbox - 待处理灵感</div>
          <div class="endpoint"><strong>POST</strong> /api/capture - 记录新灵感</div>
          <div class="endpoint"><strong>GET</strong> /api/knowledge - 知识库内容</div>
          <div class="endpoint"><strong>POST</strong> /api/generate - 重新生成页面</div>
        </div>
        <p>运行命令生成完整页面: <code>node app/generate-static.js</code></p>
      </body>
      </html>
    `);
  }
});

/**
 * 404处理
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: req.path
  });
});

/**
 * 错误处理
 */
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: err.message
  });
});

/**
 * 启动服务器
 */
function startServer() {
  ensureDirectories();
  
  // 首次启动时生成静态页面
  const generator = new StaticGenerator();
  generator.generateAll().then(success => {
    if (success) {
      console.log('✅ 静态页面生成完成');
    } else {
      console.warn('⚠️ 静态页面生成失败，但服务器继续运行');
    }
  });
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 知识管理系统服务器已启动!
📊 本地访问: http://localhost:${PORT}
📊 网络访问: http://0.0.0.0:${PORT} (绑定所有接口)
📁 数据目录: ${DATA_DIR}
📄 静态文件: ${PUBLIC_DIR}

📋 可用命令:
  • 记录灵感: node app/capture.js "记录一下我突然想到xxx"
  • 列出灵感: node app/capture.js list
  • 生成页面: node app/generate-static.js
  • 启动服务: node app/server.js

💡 通过QQ向艾米莉发送"记录一下我突然想到xxx"来添加新灵感
    `);
  });
}

// 如果是直接运行此文件，启动服务器
if (require.main === module) {
  startServer();
}

module.exports = app;