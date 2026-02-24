document.addEventListener('DOMContentLoaded', () => {
    const totalBookmarksEl = document.getElementById('totalBookmarks');
    const engineStatusEl = document.getElementById('engineStatus');
    const totalFoldersEl = document.getElementById('totalFolders');
    const totalXBookmarksEl = document.getElementById('totalXBookmarks');
    const indexViewEl = document.getElementById('indexView');
    const xViewEl = document.getElementById('xView');
    const refreshBtn = document.getElementById('refreshBtn');
    const openTwitterBtn = document.getElementById('openTwitterBtn');

    // Tab 切换逻辑
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    refreshBtn.addEventListener('click', loadData);

    if (openTwitterBtn) {
        openTwitterBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://x.com/i/bookmarks' });
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function loadData() {
        chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' }, (res) => {
            if (!res || !res.success) {
                engineStatusEl.innerText = '未初始化 / 错误';
                engineStatusEl.style.color = '#f44336';
                return;
            }

            totalBookmarksEl.innerText = res.total || 0;
            const xCount = (res.xBookmarks || []).length;
            if (totalXBookmarksEl) totalXBookmarksEl.innerText = xCount;

            if (res.isInitialized) {
                engineStatusEl.innerText = '✅ 模型已就绪';
                engineStatusEl.style.color = '#10b981';
            } else {
                engineStatusEl.innerText = '🔄 初始化中...';
                engineStatusEl.style.color = '#f59e0b';
            }

            // --- 渲染分类文件夹 ---
            const foldersArray = Object.entries(res.folders || {}).sort((a, b) => b[1].length - a[1].length);
            if (totalFoldersEl) totalFoldersEl.innerText = foldersArray.length;

            if (indexViewEl) {
                indexViewEl.innerHTML = '';
                if (foldersArray.length === 0) {
                    indexViewEl.innerHTML = '<div style="color: #999; text-align: center; padding: 40px;">暂无书签数据</div>';
                } else {
                    foldersArray.forEach(([path, bookmarks]) => {
                        const div = document.createElement('div');
                        div.className = 'folder-item';

                        let bmsHtml = bookmarks.map(b => `
                            <div class="bm-row">
                                <a href="${escapeHtml(b.url)}" target="_blank" class="bm-title">${escapeHtml(b.title || '无标题')}</a>
                                <div class="bm-url">${escapeHtml(b.url)}</div>
                            </div>
                        `).join('');

                        div.innerHTML = `
                            <div class="folder-title">
                                <span>📁 ${escapeHtml(path)}</span>
                                <span class="folder-status">${bookmarks.length} 条</span>
                            </div>
                            <div class="folder-content">
                                ${bmsHtml}
                            </div>
                        `;

                        // 点击展开折叠
                        div.querySelector('.folder-title').addEventListener('click', function () {
                            const content = this.nextElementSibling;
                            content.classList.toggle('open');
                        });

                        indexViewEl.appendChild(div);
                    });
                }
            }

            // --- 渲染推特专属视图 ---
            if (xViewEl) {
                xViewEl.innerHTML = '';
                if (xCount === 0) {
                    xViewEl.innerHTML = `
                        <div style="text-align: center; padding: 60px; color: #64748b;">
                            <div style="font-size: 40px; margin-bottom: 20px;">🐦</div>
                            <div>你还没有同步过推特知识库哦。<br><br>点击右上角的蓝色按钮去同步吧！</div>
                        </div>`;
                } else {
                    res.xBookmarks.forEach(bm => {
                        // 解析出推特作者和正文 [X推文] author: text
                        let author = "未知作者";
                        let text = bm.title;
                        const match = bm.title.match(/\[X推文\]\s*(.*?):\s*(.*)/);
                        if (match) {
                            author = match[1];
                            text = match[2];
                        }

                        const card = document.createElement('div');
                        card.className = 'x-card';
                        card.id = `x-card-${bm.id}`;
                        card.innerHTML = `
                            <div class="x-author">@${escapeHtml(author)}</div>
                            <div class="x-text">${escapeHtml(text)}</div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                               <a href="${escapeHtml(bm.url)}" target="_blank" class="x-link">${escapeHtml(bm.url)}</a>
                               <div class="action-area" style="display:none; gap:10px;">
                                   <select class="suggest-select" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc; max-width: 150px;"></select>
                                   <button class="btn move-btn" style="padding: 4px 10px; font-size: 12px; background: #10b981;">确认移动</button>
                               </div>
                            </div>
                        `;
                        xViewEl.appendChild(card);
                    });
                }
            }
        });
    }

    const categorizeTwitterBtn = document.getElementById('categorizeTwitterBtn');
    const twitterCategorizeStatus = document.getElementById('twitterCategorizeStatus');

    if (categorizeTwitterBtn) {
        categorizeTwitterBtn.addEventListener('click', () => {
            categorizeTwitterBtn.innerText = '🧠 正在进行深度语义重构...';
            categorizeTwitterBtn.disabled = true;
            twitterCategorizeStatus.style.display = 'block';
            twitterCategorizeStatus.innerHTML = '正在加载大模型运算量，请稍候...';

            chrome.runtime.sendMessage({ type: 'AUTO_CATEGORIZE' }, (res) => {
                categorizeTwitterBtn.innerText = '✨ 智能分发推特书签';
                categorizeTwitterBtn.disabled = false;

                if (!res || !res.success) {
                    twitterCategorizeStatus.innerHTML = `❌ 分析失败: ${res?.error || res?.msg || '未知错误'}`;
                    return;
                }

                // 只筛选出推特书签的建议
                const twitterSuggestions = res.suggestions.filter(s => s.bookmark.folderPath && s.bookmark.folderPath.includes('Twitter/X'));

                if (twitterSuggestions.length === 0) {
                    twitterCategorizeStatus.innerHTML = `✅ 模型已扫描完毕，当前你的推特书签要么数量太少构不成转移，要么没有能在本地找到合适的语义文件夹。`;
                    return;
                }

                twitterCategorizeStatus.innerHTML = `✅ 分析完成！找到了 <strong>${twitterSuggestions.length}</strong> 个有可能归属于不同本地文件夹的推特书签。请在下方卡片中确认移动。`;

                twitterSuggestions.forEach(s => {
                    const card = document.getElementById(`x-card-${s.bookmark.id}`);
                    if (card) {
                        card.style.borderLeft = '4px solid #8b5cf6';
                        card.style.background = '#f5f3ff';
                        const actionArea = card.querySelector('.action-area');
                        actionArea.style.display = 'flex';

                        const select = card.querySelector('.suggest-select');
                        select.innerHTML = `<option value="${s.suggestedFolderId}">📂 ${escapeHtml(s.suggestedFolder)} (置信度:${Math.round(s.confidence * 100)}%)</option>`;

                        const btn = card.querySelector('.move-btn');
                        btn.onclick = () => {
                            btn.innerText = '移动中...';
                            chrome.runtime.sendMessage({
                                type: 'MOVE_BOOKMARK',
                                bookmarkId: s.bookmark.id,
                                parentId: s.suggestedFolderId
                            }, (moveRes) => {
                                if (moveRes && moveRes.success) {
                                    card.style.opacity = '0.5';
                                    btn.innerText = '已移出！';
                                    btn.disabled = true;
                                    select.disabled = true;
                                } else {
                                    btn.innerText = '❌ 失败';
                                }
                            });
                        };
                    }
                });
            });
        });
    }

    loadData();
});
