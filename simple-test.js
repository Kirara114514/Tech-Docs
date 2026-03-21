#!/usr/bin/env node
/**
 * 简单HTTP服务器测试
 * 用于诊断端口映射问题
 */

const http = require('http');

const PORT = 3001; // 使用不同端口测试
const server = http.createServer((req, res) => {
  console.log(`请求: ${req.method} ${req.url}`);
  
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>简单测试服务器</title></head>
    <body>
      <h1>✅ 简单测试服务器运行正常！</h1>
      <p><strong>时间:</strong> ${new Date().toISOString()}</p>
      <p><strong>端口:</strong> ${PORT}</p>
      <p><strong>绑定:</strong> 0.0.0.0 (所有网络接口)</p>
      <p><strong>测试链接:</strong></p>
      <ul>
        <li><a href="/">本页面</a></li>
        <li><a href="/api">API测试</a></li>
        <li><a href="/status">状态</a></li>
      </ul>
      <hr>
      <p>如果这个页面可以访问，但知识管理系统无法访问，说明是应用问题。</p>
      <p>如果这个页面也无法访问，说明是Docker/网络/防火墙问题。</p>
    </body>
    </html>
  `);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🎯 简单测试服务器已启动！
📡 绑定: 0.0.0.0:${PORT}
🌐 测试地址:
  - 容器内: http://localhost:${PORT}
  - 宿主机: http://宿主机IP:映射端口
  - 公网: http://你的公网IP:映射端口

💡 请测试访问，然后告诉我结果。
  `);
});

// 保持运行
process.on('SIGINT', () => {
  console.log('\n🛑 服务器停止');
  process.exit(0);
});