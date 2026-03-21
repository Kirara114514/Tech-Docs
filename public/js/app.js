/**
 * 知识管理系统 - 前端应用
 */

class KnowledgeApp {
  constructor() {
    this.apiBase = '/api';
    this.init();
  }
  
  init() {
    console.log('📚 知识管理系统前端初始化...');
    
    // 绑定事件
    this.bindEvents();
    
    // 加载初始数据
    this.loadDashboardData();
    
    // 检查API连接
    this.checkApiStatus();
  }
  
  bindEvents() {
    // 捕获灵感按钮
    const captureBtn = document.getElementById('capture-btn');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => this.showCaptureModal());
    }
    
    // 刷新按钮
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadDashboardData());
    }
    
    // 生成页面按钮
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.regeneratePages());
    }
  }
  
  async checkApiStatus() {
    try {
      const response = await fetch(`${this.apiBase}/status`);
      const data = await response.json();
      
      if (data.status === 'running') {
        console.log('✅ API连接正常');
        this.updateStatusIndicator('online');
      } else {
        this.updateStatusIndicator('offline');
      }
    } catch (error) {
      console.error('❌ API连接失败:', error);
      this.updateStatusIndicator('offline');
    }
  }
  
  updateStatusIndicator(status) {
    const indicator = document.getElementById('status-indicator');
    if (!indicator) return;
    
    if (status === 'online') {
      indicator.innerHTML = '<span style="color: #4cd964;">● 在线</span>';
    } else {
      indicator.innerHTML = '<span style="color: #ff6b6b;">● 离线</span>';
    }
  }
  
  async loadDashboardData() {
    try {
      // 显示加载状态
      this.showLoading();
      
      // 并行加载所有数据
      const [inboxData, knowledgeData] = await Promise.all([
        this.fetchInbox(),
        this.fetchKnowledge()
      ]);
      
      // 更新UI
      this.updateInboxList(inboxData);
      this.updateKnowledgeList(knowledgeData);
      
      // 更新统计
      this.updateStats(inboxData.count, knowledgeData.count);
      
    } catch (error) {
      console.error('加载数据失败:', error);
      this.showError('加载数据失败，请刷新页面重试');
    } finally {
      this.hideLoading();
    }
  }
  
  async fetchInbox() {
    const response = await fetch(`${this.apiBase}/inbox`);
    if (!response.ok) throw new Error('获取灵感列表失败');
    return await response.json();
  }
  
  async fetchKnowledge() {
    const response = await fetch(`${this.apiBase}/knowledge`);
    if (!response.ok) throw new Error('获取知识库失败');
    return await response.json();
  }
  
  updateInboxList(data) {
    const container = document.getElementById('inbox-list');
    if (!container) return;
    
    if (!data.success || data.count === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i>📝</i>
          <p>暂无待处理灵感</p>
          <p class="text-muted">快去记录一些想法吧！</p>
        </div>
      `;
      return;
    }
    
    const items = data.ideas.map(idea => `
      <div class="list-item inbox">
        <div class="item-title">${this.escapeHtml(idea.title)}</div>
        <div class="item-meta">
          <span>${this.formatDate(idea.created)}</span>
          <span class="badge badge-local">本地</span>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = items;
  }
  
  updateKnowledgeList(data) {
    const container = document.getElementById('knowledge-list');
    if (!container) return;
    
    if (!data.success || data.count === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i>📚</i>
          <p>知识库为空</p>
          <p class="text-muted">整理归档一些灵感来充实知识库吧！</p>
        </div>
      `;
      return;
    }
    
    let items = '';
    for (const [category, categoryData] of Object.entries(data.categories)) {
      const fileCount = this.countFiles(categoryData);
      items += `
        <div class="list-item knowledge">
          <div class="item-title">${this.escapeHtml(category)}</div>
          <div class="item-meta">
            <span>${fileCount}个文档</span>
            <span class="badge badge-synced">已同步</span>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = items;
  }
  
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
  
  updateStats(inboxCount, knowledgeCount) {
    const inboxStat = document.getElementById('inbox-count');
    const knowledgeStat = document.getElementById('knowledge-count');
    
    if (inboxStat) inboxStat.textContent = inboxCount;
    if (knowledgeStat) knowledgeStat.textContent = knowledgeCount;
  }
  
  showCaptureModal() {
    const modalHtml = `
      <div class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>📝 记录新灵感</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <textarea id="idea-text" placeholder="写下你的灵感、想法或问题..." rows="4"></textarea>
            <div class="form-group">
              <label>标签（可选，用空格分隔）:</label>
              <input type="text" id="idea-tags" placeholder="例如：技术 编程 问题">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn" id="cancel-capture">取消</button>
            <button class="btn btn-success" id="submit-capture">记录</button>
          </div>
        </div>
      </div>
    `;
    
    // 添加模态框到页面
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // 绑定事件
    const overlay = modalContainer.querySelector('.modal-overlay');
    const closeBtn = modalContainer.querySelector('.modal-close');
    const cancelBtn = modalContainer.querySelector('#cancel-capture');
    const submitBtn = modalContainer.querySelector('#submit-capture');
    
    const closeModal = () => {
      document.body.removeChild(modalContainer);
    };
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    submitBtn.addEventListener('click', async () => {
      const text = document.getElementById('idea-text').value.trim();
      const tags = document.getElementById('idea-tags').value.trim().split(/\s+/).filter(t => t);
      
      if (!text) {
        alert('请输入灵感内容');
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loading"></span> 记录中...';
      
      try {
        const success = await this.captureIdea(text, tags);
        if (success) {
          closeModal();
          this.loadDashboardData(); // 刷新数据
          this.showSuccess('灵感记录成功！');
        }
      } catch (error) {
        this.showError('记录失败: ' + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '记录';
      }
    });
    
    // 自动聚焦到文本框
    setTimeout(() => {
      document.getElementById('idea-text').focus();
    }, 100);
  }
  
  async captureIdea(text, tags = []) {
    const response = await fetch(`${this.apiBase}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, tags })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '记录失败');
    }
    
    const data = await response.json();
    return data.success;
  }
  
  async regeneratePages() {
    const btn = document.getElementById('generate-btn');
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> 生成中...';
    
    try {
      const response = await fetch(`${this.apiBase}/generate`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('生成失败');
      
      const data = await response.json();
      
      if (data.success) {
        this.showSuccess('页面重新生成成功！');
        // 稍后刷新页面
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      this.showError('生成失败: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
  
  showLoading() {
    // 可以添加加载指示器
    console.log('加载中...');
  }
  
  hideLoading() {
    // 隐藏加载指示器
    console.log('加载完成');
  }
  
  showSuccess(message) {
    this.showNotification(message, 'success');
  }
  
  showError(message) {
    this.showNotification(message, 'error');
  }
  
  showNotification(message, type = 'info') {
    // 简单的通知实现
    alert(`[${type.toUpperCase()}] ${message}`);
  }
  
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new KnowledgeApp();
});

// 工具函数：防抖
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 工具函数：节流
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}