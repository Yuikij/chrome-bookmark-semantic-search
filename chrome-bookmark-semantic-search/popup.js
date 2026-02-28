// Popup Script for Chrome Bookmark Semantic Search Extension

class BookmarkSearchUI {
  constructor() {
    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.status = document.getElementById('status');
    this.results = document.getElementById('results');
    this.initStatus = document.getElementById('initStatus');
    this.progressFill = document.getElementById('progressFill');
    this.initStatus = document.getElementById('initStatus');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.autoCategorizeBtn = document.getElementById('autoCategorizeBtn');

    this.isSearching = false;
    this.isInitialized = false;

    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.checkInitializationStatus();
  }

  setupEventListeners() {
    // 搜索按钮点击
    this.searchButton.addEventListener('click', () => this.performSearch());

    // 自动分类按钮点击
    if (this.autoCategorizeBtn) {
      this.autoCategorizeBtn.addEventListener('click', () => this.performAutoCategorize());
    }

    // 打开控制面板
    const openDashboardBtn = document.getElementById('openDashboardBtn');
    if (openDashboardBtn) {
      openDashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      });
    }

    // 输入框回车搜索
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !this.isSearching) {
        this.performSearch();
      }
    });

    // 输入框实时搜索（防抖）
    let searchTimeout;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length >= 2) {
        searchTimeout = setTimeout(() => {
          this.performSearch();
        }, 500); // 500ms防抖
      } else {
        this.clearResults();
      }
    });

    // === Twitter/X API 书签同步按钮 ===
    // 不再需要用户在书签页面，直接通过 GraphQL API 抓取
    const twActions = document.getElementById('twitterActionsSection');
    if (twActions) {
      twActions.style.display = 'block'; // 始终显示（不再限制仅在书签页可用）

      // 同步进度监听
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SYNC_PROGRESS') {
          this.updateSyncUI(msg);
        }
      });

      // 打开时查询后台同步状态，恢复 UI
      chrome.runtime.sendMessage({ type: 'API_SYNC_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        if (res.isFetching) {
          // 同步正在进行中，恢复按钮和状态显示
          const modeLabel = res.syncMode === 'deep' ? '全量' : '增量';
          this.setSyncingUI(modeLabel);
          this.updateSyncUI({
            status: 'running',
            count: res.totalFetched,
            added: res.totalAdded,
            page: res.currentPage,
            mode: res.syncMode
          });
        }
      });

      // 增量同步按钮
      const twBtnIncrem = document.getElementById('twBtnIncrem');
      if (twBtnIncrem) {
        twBtnIncrem.addEventListener('click', () => {
          this.setSyncingUI('增量');
          chrome.runtime.sendMessage({ type: 'API_SYNC_INCREMENTAL' }, (res) => {
            if (chrome.runtime.lastError) {
              twBtnIncrem.innerText = '❌ 连接失败';
              twBtnIncrem.disabled = false;
              this.resetSyncButtons();
            }
          });
        });
      }

      // 全量同步按钮
      const twBtnDeep = document.getElementById('twBtnDeep');
      if (twBtnDeep) {
        twBtnDeep.addEventListener('click', () => {
          this.setSyncingUI('全量');
          chrome.runtime.sendMessage({ type: 'API_SYNC_DEEP' }, (res) => {
            if (chrome.runtime.lastError) {
              twBtnDeep.innerText = '❌ 连接失败';
              twBtnDeep.disabled = false;
              this.resetSyncButtons();
            }
          });
        });
      }

      // 停止同步按钮
      const twBtnStop = document.getElementById('twBtnStop');
      if (twBtnStop) {
        twBtnStop.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'API_SYNC_STOP' });
          this.resetSyncButtons();
          const statusEl = document.getElementById('twSyncStatus');
          if (statusEl) {
            statusEl.innerText = '🛑 已手动停止';
            setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
          }
        });
      }

      // 保留旧的当前屏幕提取（仍需要内容脚本，仅在书签页可用）
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const twBtnCurrent = document.getElementById('twBtnCurrent');
        if (tabs[0] && (tabs[0].url.includes('x.com/i/bookmarks') || tabs[0].url.includes('twitter.com/i/bookmarks'))) {
          if (twBtnCurrent) {
            twBtnCurrent.style.display = 'inline-block';
            twBtnCurrent.addEventListener('click', () => {
              twBtnCurrent.innerText = '⏳ 提取中...';
              chrome.tabs.sendMessage(tabs[0].id, { type: 'START_SYNC_CURRENT' }, (res) => {
                if (res && res.success) {
                  twBtnCurrent.innerText = `✅ 保存了 ${res.added} 条`;
                } else {
                  twBtnCurrent.innerText = '❌ 提取失败';
                }
                setTimeout(() => twBtnCurrent.innerText = '📥 提取当前屏幕', 3000);
              });
            });
          }
        } else {
          // 不在书签页面时隐藏当前屏幕提取按钮
          if (twBtnCurrent) twBtnCurrent.style.display = 'none';
        }
      });
    }

    // 使用轮询机制获取进度，不再监听广播消息
  }

  resetSyncButtons() {
    const twBtnIncrem = document.getElementById('twBtnIncrem');
    const twBtnDeep = document.getElementById('twBtnDeep');
    const twBtnStop = document.getElementById('twBtnStop');
    const progressBar = document.getElementById('twSyncProgressBar');

    if (twBtnIncrem) {
      twBtnIncrem.innerText = '🚀 增量同步 (API)';
      twBtnIncrem.disabled = false;
    }
    if (twBtnDeep) {
      twBtnDeep.innerText = '🌋 全量同步 (API)';
      twBtnDeep.disabled = false;
    }
    if (twBtnStop) {
      twBtnStop.style.display = 'none';
    }
    if (progressBar) {
      progressBar.style.display = 'none';
    }
  }

  // 设置 UI 为"同步中"状态
  setSyncingUI(modeLabel) {
    const twBtnIncrem = document.getElementById('twBtnIncrem');
    const twBtnDeep = document.getElementById('twBtnDeep');
    const twBtnStop = document.getElementById('twBtnStop');
    const statusEl = document.getElementById('twSyncStatus');
    const progressBar = document.getElementById('twSyncProgressBar');

    if (twBtnIncrem) { twBtnIncrem.innerText = '⏳ 同步中...'; twBtnIncrem.disabled = true; }
    if (twBtnDeep) { twBtnDeep.innerText = '⏳ 同步中...'; twBtnDeep.disabled = true; }
    if (twBtnStop) twBtnStop.style.display = 'block';
    if (statusEl) { statusEl.innerText = `⏳ 正在连接 Twitter API (${modeLabel})...`; statusEl.style.display = 'block'; }
    if (progressBar) { progressBar.style.display = 'block'; }
  }

  // 更新同步进度 UI
  updateSyncUI(msg) {
    const statusEl = document.getElementById('twSyncStatus');
    const progressFill = document.getElementById('twSyncProgressFill');
    const progressBar = document.getElementById('twSyncProgressBar');
    if (!statusEl) return;

    if (msg.status === 'running') {
      const addedStr = (msg.added && msg.added > 0) ? `，已入库 ${msg.added} 条` : '';
      statusEl.innerText = `⏳ 已获取 ${msg.count} 条 · 第 ${msg.page} 页${addedStr}`;
      statusEl.style.display = 'block';
      if (progressBar) progressBar.style.display = 'block';
      // 进度条动画（无法知道总量，用循环动画代替）
      if (progressFill) {
        const pct = Math.min(95, (msg.page || 0) * 5); // 每页 5%，最多 95%
        progressFill.style.width = pct + '%';
      }
    } else if (msg.status === 'rate_limited') {
      statusEl.innerText = `⚠️ API 频率限制中，等待重试... (已获取 ${msg.count} 条)`;
    } else if (msg.status === 'completed') {
      statusEl.innerText = `✅ 完成！共 ${msg.count} 条，新增 ${msg.added} 条`;
      if (progressFill) progressFill.style.width = '100%';
      setTimeout(() => {
        statusEl.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
      }, 5000);
      this.resetSyncButtons();
    } else if (msg.status === 'error') {
      statusEl.innerText = `❌ ${msg.error}`;
      setTimeout(() => {
        statusEl.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
      }, 5000);
      this.resetSyncButtons();
    }
  }

  async checkInitializationStatus() {
    try {
      const response = await this.sendMessage({ type: 'GET_INIT_STATUS' });

      if (response.success) {
        if (response.isInitialized) {
          this.isInitialized = true;
          this.updateStatus('就绪 - 输入关键词开始搜索');
          this.searchInput.focus();
        } else if (response.progress && response.progress.status !== 'ready') {
          // 正在初始化中
          this.showInitProgress();
          this.displayOngoingProgress(response.progress);
          this.startProgressPolling();
        } else {
          await this.initializeEngine();
        }
      }
    } catch (error) {
      console.error('检查初始化状态失败:', error);
      this.updateStatus('初始化检查失败，请刷新插件');
    }
  }

  async initializeEngine() {
    this.showInitProgress();
    this.updateStatus('正在初始化语义搜索引擎...');

    try {
      const response = await this.sendMessage({ type: 'INITIALIZE_ENGINE' });

      if (response.success) {
        if (response.isAsync) {
          // 接管进入轮询模式
          this.startProgressPolling();
        } else {
          this.isInitialized = true;
          this.hideInitProgress();
          this.updateStatus('就绪 - 输入关键词开始搜索');
          this.searchInput.focus();
        }
      } else {
        throw new Error(response.error || '初始化失败');
      }
    } catch (error) {
      console.error('初始化失败:', error);
      this.hideInitProgress();
      this.updateStatus('初始化失败: ' + error.message);
    }
  }

  showInitProgress() {
    this.initStatus.style.display = 'block';
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';
  }

  hideInitProgress() {
    this.initStatus.style.display = 'none';
  }

  updateInitProgress(progress) {
    this.progressFill.style.width = progress + '%';
    this.progressText.textContent = Math.round(progress) + '%';
  }

  displayOngoingProgress(progressInfo) {
    const percentage = progressInfo.total > 0 ?
      (progressInfo.current / progressInfo.total) * 100 : 0;

    this.updateInitProgress(percentage);

    let statusText = '';
    switch (progressInfo.status) {
      case 'initializing':
        statusText = '正在初始化...';
        break;
      case 'fetching_content':
        statusText = `正在获取网页内容 (${progressInfo.current}/${progressInfo.total})`;
        break;
      case 'building_vectors':
        statusText = '正在构建向量...';
        break;
      case 'completed':
        statusText = '初始化完成！';
        break;
      case 'error':
        statusText = '初始化失败';
        break;
      default:
        statusText = '准备中...';
    }

    this.updateStatus(statusText);
  }

  startProgressPolling() {
    this.progressPollingInterval = setInterval(async () => {
      try {
        const response = await this.sendMessage({ type: 'GET_INIT_PROGRESS' });

        if (response.success) {
          const progress = response.progress;
          this.displayOngoingProgress(progress);

          if (progress.status === 'completed') {
            this.isInitialized = true;
            this.hideInitProgress();
            this.updateStatus('就绪 - 输入关键词开始搜索');
            this.searchInput.focus();
            this.stopProgressPolling();
          } else if (progress.status === 'error') {
            this.hideInitProgress();
            this.updateStatus('初始化失败，请重试');
            this.stopProgressPolling();
          }
        }
      } catch (error) {
        console.error('轮询进度失败:', error);
        this.stopProgressPolling();
      }
    }, 1000); // 每秒更新一次
  }

  stopProgressPolling() {
    if (this.progressPollingInterval) {
      clearInterval(this.progressPollingInterval);
      this.progressPollingInterval = null;
    }
  }

  async performSearch() {
    const query = this.searchInput.value.trim();

    if (!query) {
      this.clearResults();
      return;
    }

    if (!this.isInitialized) {
      this.updateStatus('正在初始化，请稍候...');
      return;
    }

    if (this.isSearching) {
      return;
    }

    this.isSearching = true;
    this.updateStatus('搜索中...');
    this.showLoading();

    try {
      const response = await this.sendMessage({
        type: 'SEARCH_BOOKMARKS',
        query: query,
        topK: 20
      });

      if (response.success) {
        this.displayResults(response.results, query);
        this.updateStatus(`找到 ${response.results.length} 个相关书签`);
      } else {
        throw new Error(response.error || '搜索失败');
      }
    } catch (error) {
      console.error('搜索失败:', error);
      this.updateStatus('搜索失败: ' + error.message);
      this.showError('搜索失败，请重试');
    } finally {
      this.isSearching = false;
    }
  }

  displayResults(bookmarks, query) {
    this.results.innerHTML = '';

    if (bookmarks.length === 0) {
      this.showNoResults(query);
      return;
    }

    bookmarks.forEach(bookmark => {
      const bookmarkElement = this.createBookmarkElement(bookmark);
      this.results.appendChild(bookmarkElement);
    });
  }

  createBookmarkElement(bookmark) {
    const div = document.createElement('div');
    div.className = 'bookmark-item';

    // 格式化相似度分数（兼容 score 和 similarity 字段）
    const similarity = bookmark.score || bookmark.similarity || 0;
    const similarityPercent = Math.round(similarity * 100);

    div.innerHTML = `
      <div class="bookmark-title">${this.escapeHtml(bookmark.title || '无标题')}</div>
      <div class="bookmark-url">${this.escapeHtml(bookmark.url)}</div>
      <div class="bookmark-similarity">相关度: ${similarityPercent}%</div>
    `;

    // 点击打开书签
    div.addEventListener('click', () => {
      chrome.tabs.create({ url: bookmark.url });
      window.close(); // 关闭popup
    });

    return div;
  }

  async performAutoCategorize() {
    if (!this.isInitialized) {
      this.updateStatus('正在初始化，请稍候...');
      return;
    }

    if (this.isSearching) return;
    this.isSearching = true;

    this.updateStatus('大脑飞速运转中，正在计算质心与意图...');
    this.showLoading();

    try {
      const response = await this.sendMessage({ type: 'AUTO_CATEGORIZE' });

      if (response.success) {
        if (!response.suggestions || response.suggestions.length === 0) {
          this.showNoResults('目前没有找到适合被自动整理的书签');
          this.updateStatus('无需整理');
        } else {
          this.displayAutoCategorizeResults(response.suggestions);
          this.updateStatus(`发现 ${response.suggestions.length} 个可以智能整理的书签`);
        }
      } else {
        throw new Error(response.msg || response.error || '分类失败');
      }
    } catch (error) {
      console.error('自动分类失败:', error);
      this.updateStatus('分类失败: ' + error.message);
      this.showError('分类失败，请重试或者检查权限');
    } finally {
      this.isSearching = false;
    }
  }

  displayAutoCategorizeResults(suggestions) {
    this.results.innerHTML = '';

    // Add banner
    const banner = document.createElement('div');
    banner.style = "margin-bottom: 15px; font-size: 13px; color: var(--secondary-text); text-align: center; background: var(--card-bg); border: 1px solid var(--border-color); padding: 8px; border-radius: 8px;";
    banner.innerText = "自动找到以下书签的最佳归属，点击「移动」确认：";
    this.results.appendChild(banner);

    suggestions.forEach(suggestion => {
      const div = document.createElement('div');
      div.className = 'bookmark-item';
      div.style.cursor = 'default';

      const similarityPercent = Math.round(suggestion.confidence * 100);

      div.innerHTML = `
        <div class="bookmark-title">${this.escapeHtml(suggestion.bookmark.title || '无标题')}</div>
        <div class="bookmark-url" style="margin-bottom: 8px;">${this.escapeHtml(suggestion.bookmark.url)}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 4px;">
          <div style="font-size: 12px; color: var(--accent-color); max-width: 80%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">
            建议移动至 📁 ${this.escapeHtml(suggestion.suggestedFolder)} (${similarityPercent}%)
          </div>
          <button class="move-btn" style="background: var(--accent-color); border: none; color: white; border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s;">移动</button>
        </div>
      `;

      const moveBtn = div.querySelector('.move-btn');
      moveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        moveBtn.innerText = '移动中...';
        moveBtn.disabled = true;
        moveBtn.style.opacity = '0.5';

        try {
          // Send move message 
          const res = await this.sendMessage({
            type: 'MOVE_BOOKMARK',
            bookmarkId: suggestion.bookmark.id,
            parentId: suggestion.suggestedFolderId
          });

          if (res.success) {
            moveBtn.innerText = '已移动 ✓';
            moveBtn.style.background = 'transparent';
            moveBtn.style.border = '1px solid var(--accent-color)';
            moveBtn.style.color = 'var(--accent-color)';
            moveBtn.style.opacity = '1';

            setTimeout(() => {
              div.style.opacity = '0';
              setTimeout(() => { div.style.display = 'none'; }, 300);
            }, 1000);
          } else {
            throw new Error(res.error || 'API 失败');
          }
        } catch (err) {
          moveBtn.innerText = '失败 ×';
          moveBtn.style.background = '#ff3b30'; // Apple red
          moveBtn.style.opacity = '1';
          console.error('移动失败', err);
        }
      });

      this.results.appendChild(div);
    });
  }

  showLoading() {
    this.results.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div style="margin-top: 10px;">正在搜索...</div>
      </div>
    `;
  }

  showNoResults(query) {
    this.results.innerHTML = `
      <div class="no-results">
        <div>📚</div>
        <div style="margin-top: 10px;">
          没有找到与 "${this.escapeHtml(query)}" 相关的书签
        </div>
        <div style="margin-top: 5px; font-size: 12px; opacity: 0.7;">
          试试使用不同的关键词
        </div>
      </div>
    `;
  }

  showError(message) {
    this.results.innerHTML = `
      <div class="no-results">
        <div>❌</div>
        <div style="margin-top: 10px;">
          ${this.escapeHtml(message)}
        </div>
      </div>
    `;
  }

  clearResults() {
    this.results.innerHTML = '';
    this.updateStatus('输入关键词开始搜索');
  }

  updateStatus(message) {
    this.status.textContent = message;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// 清理函数，在页面卸载时停止轮询
window.addEventListener('beforeunload', () => {
  if (window.bookmarkSearchUI) {
    window.bookmarkSearchUI.stopProgressPolling();
  }
});

// 在DOM加载完成后初始化UI
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.bookmarkSearchUI = new BookmarkSearchUI();
  });
} else {
  window.bookmarkSearchUI = new BookmarkSearchUI();
}
