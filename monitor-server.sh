#!/bin/bash
# 服务器监控脚本 - 确保服务器持续运行

cd /home/node/clawd/knowledge-system

echo "👁️ 启动服务器监控..."
echo "⏰ 监控间隔: 60秒"
echo "📅 开始时间: $(date)"

while true; do
    # 检查服务器是否运行
    if ! curl -s --max-time 5 http://localhost:3000/api/status > /dev/null 2>&1; then
        echo "❌ [$(date '+%H:%M:%S')] 服务器无响应，尝试重启..."
        
        # 停止旧进程
        if [ -f logs/server.pid ]; then
            OLD_PID=$(cat logs/server.pid)
            kill -9 $OLD_PID 2>/dev/null && echo "  已停止旧进程: $OLD_PID"
            rm -f logs/server.pid
        fi
        
        # 启动新服务器
        ./start-server.sh
        
        # 记录重启
        echo "🔄 [$(date '+%H:%M:%S')] 重启完成" >> logs/monitor.log
    else
        echo "✅ [$(date '+%H:%M:%S')] 服务器运行正常"
    fi
    
    # 等待60秒
    sleep 60
done