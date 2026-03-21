#!/bin/bash
# 知识管理系统 - 稳定启动脚本

cd /home/node/clawd/knowledge-system

echo "🚀 启动知识管理系统服务器..."
echo "📅 时间: $(date)"
echo "📁 目录: $(pwd)"

# 检查是否已在运行
if curl -s http://localhost:3000/api/status > /dev/null 2>&1; then
    echo "✅ 服务器已在运行"
    exit 0
fi

# 生成日志文件
LOG_FILE="logs/server-$(date +%Y%m%d-%H%M%S).log"
echo "📄 日志文件: $LOG_FILE"

# 启动服务器（使用nohup保持运行）
nohup node app/server.js > "$LOG_FILE" 2>&1 &

# 获取进程ID
SERVER_PID=$!
echo "🆔 服务器PID: $SERVER_PID"

# 等待服务器启动
echo "⏳ 等待服务器启动..."
for i in {1..10}; do
    if curl -s http://localhost:3000/api/status > /dev/null 2>&1; then
        echo "✅ 服务器启动成功！"
        echo "🌐 访问地址: http://localhost:3000"
        echo "📊 API状态: http://localhost:3000/api/status"
        
        # 保存PID到文件
        echo $SERVER_PID > logs/server.pid
        echo "💾 PID已保存到: logs/server.pid"
        
        # 显示启动日志
        echo "📋 启动日志:"
        tail -10 "$LOG_FILE"
        exit 0
    fi
    sleep 1
    echo -n "."
done

echo "❌ 服务器启动超时"
echo "📄 查看日志: tail -f $LOG_FILE"
exit 1