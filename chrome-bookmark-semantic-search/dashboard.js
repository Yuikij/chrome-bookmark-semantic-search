document.addEventListener('DOMContentLoaded', () => {
    // --- 图片预览弹窗逻辑 (CSP 兼容：不使用 inline handler) ---
    const imageOverlay = document.getElementById('imagePreviewOverlay');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const imagePreviewLink = document.getElementById('imagePreviewLink');
    const imagePreviewClose = document.getElementById('imagePreviewClose');

    window.showImagePreview = function (url) {
        imagePreviewImg.src = url;
        imagePreviewLink.href = url;
        imageOverlay.style.display = 'flex';
    };

    // 关闭按钮
    imagePreviewClose.addEventListener('click', () => { imageOverlay.style.display = 'none'; });
    // 点击背景关闭
    imageOverlay.addEventListener('click', (e) => { if (e.target === imageOverlay) imageOverlay.style.display = 'none'; });
    // 悬浮效果
    imagePreviewLink.addEventListener('mouseover', () => { imagePreviewLink.style.background = 'rgba(255,255,255,0.2)'; });
    imagePreviewLink.addEventListener('mouseout', () => { imagePreviewLink.style.background = 'rgba(255,255,255,0.1)'; });

    // 事件委托：捕获所有动态生成的缩略图点击
    document.addEventListener('click', (e) => {
        const thumb = e.target.closest('.media-thumb');
        if (thumb) {
            e.preventDefault();
            e.stopPropagation();
            window.showImagePreview(thumb.src);
        }
    });

    // 头像加载失败回退 (CSP 不允许 inline onerror)
    document.addEventListener('error', (e) => {
        if (e.target.classList && e.target.classList.contains('avatar-img')) {
            e.target.style.display = 'none';
            if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
        }
    }, true); // 必须用捕获阶段，error 事件不冒泡

    // 注入 hover 效果样式（避免 inline onmouseover）
    const hoverStyle = document.createElement('style');
    hoverStyle.textContent = '.media-thumb:hover { transform: scale(1.08) !important; }';
    document.head.appendChild(hoverStyle);

    // --- 自定义弹窗逻辑 ---
    const cOverlay = document.getElementById('cDialogOverlay');
    function closeDialog() {
        cOverlay.style.display = 'none';
        document.getElementById('cDialogInput').style.display = 'none';
        document.getElementById('cDialogCancel').style.display = 'inline-block';
        document.getElementById('cDialogInput').value = '';
    }

    function cAlert(msg, title = 'ℹ️ 提示') {
        return new Promise(resolve => {
            document.getElementById('cDialogTitle').innerHTML = title;
            document.getElementById('cDialogMessage').innerHTML = msg;
            document.getElementById('cDialogCancel').style.display = 'none';
            cOverlay.style.display = 'flex';
            document.getElementById('cDialogConfirm').onclick = () => { closeDialog(); resolve(); };
        });
    }

    function cConfirm(msg, title = '⚠️ 确认操作') {
        return new Promise(resolve => {
            document.getElementById('cDialogTitle').innerHTML = title;
            document.getElementById('cDialogMessage').innerHTML = msg;
            cOverlay.style.display = 'flex';
            document.getElementById('cDialogCancel').onclick = () => { closeDialog(); resolve(false); };
            document.getElementById('cDialogConfirm').onclick = () => { closeDialog(); resolve(true); };
        });
    }

    // --- 轻量悬浮气泡确认框逻辑 (Bubble Confirm Tooltip) ---
    // 为了不打断用户操作的上下文体验而设计的最轻量弹层，带指示箭头
    let activeBubble = null;
    function cBubbleConfirm(targetEl, htmlMsg, width = 240) {
        return new Promise(resolve => {
            if (activeBubble) {
                document.body.removeChild(activeBubble);
                activeBubble = null;
            }

            const rect = targetEl.getBoundingClientRect();
            const bubble = document.createElement('div');
            // Outer container positioning
            bubble.style.cssText = `
                position: fixed;
                z-index: 10000;
                pointer-events: auto;
                left: ${rect.right - width + 10}px;
                top: ${rect.bottom + 10}px;
                opacity: 0;
                transform: translateY(5px) scale(0.95);
                transition: opacity 0.2s, transform 0.2s;
            `;

            // 小尖角箭头
            const arrow = document.createElement('div');
            arrow.style.cssText = `
                position: absolute;
                top: -5px;
                right: 20px;
                width: 10px;
                height: 10px;
                background: var(--bg-surface);
                border-top: 1px solid var(--border-color);
                border-left: 1px solid var(--border-color);
                transform: rotate(45deg);
                z-index: 10001;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                position: relative;
                background: var(--bg-surface);
                border: 1px solid var(--border-color);
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                border-radius: 8px;
                padding: 10px 14px;
                width: ${width}px;
                font-size: 13px;
                color: var(--text-main);
                z-index: 10002;
            `;

            content.innerHTML = `
                <div style="margin-bottom: 10px; line-height: 1.4;">${htmlMsg}</div>
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                    <button class="btn bubble-cancel" style="padding:2px 8px; font-size:12px; border:1px solid var(--border-color); background:transparent;">取消</button>
                    <button class="btn btn-primary bubble-confirm" style="padding:2px 8px; font-size:12px;">确定</button>
                </div>
            `;

            bubble.appendChild(arrow);
            bubble.appendChild(content);
            document.body.appendChild(bubble);

            // 边缘反弹检查
            const bRect = bubble.getBoundingClientRect();
            if (bRect.bottom > window.innerHeight) {
                bubble.style.top = (rect.top - bRect.height - 10) + 'px';
                arrow.style.top = 'auto';
                arrow.style.bottom = '-5px';
                arrow.style.borderTop = 'none';
                arrow.style.borderLeft = 'none';
                arrow.style.borderBottom = '1px solid var(--border-color)';
                arrow.style.borderRight = '1px solid var(--border-color)';
            }
            if (bRect.left < 0) {
                bubble.style.left = '10px';
                arrow.style.right = (10 + bRect.width - (rect.right - 10)) + 'px';
            }

            requestAnimationFrame(() => {
                bubble.style.opacity = '1';
                bubble.style.transform = 'translateY(0) scale(1)';
            });

            activeBubble = bubble;

            const cleanup = (result) => {
                if (activeBubble === bubble) {
                    bubble.style.opacity = '0';
                    bubble.style.transform = 'translateY(5px) scale(0.95)';
                    setTimeout(() => {
                        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
                        if (activeBubble === bubble) activeBubble = null;
                    }, 200);
                }
                document.removeEventListener('click', outsideClick);
                resolve(result);
            };

            const outsideClick = (e) => {
                if (!bubble.contains(e.target) && !targetEl.contains(e.target)) {
                    cleanup(false);
                }
            };

            bubble.querySelector('.bubble-confirm').onclick = () => cleanup(true);
            bubble.querySelector('.bubble-cancel').onclick = () => cleanup(false);

            setTimeout(() => document.addEventListener('click', outsideClick), 0);
        });
    }

    function cPrompt(msg, defaultText = '', title = '✏️ 输入信息') {
        console.log('🔵 [cPrompt] 被调用, title:', title);
        return new Promise(resolve => {
            document.getElementById('cDialogTitle').innerHTML = title;
            document.getElementById('cDialogMessage').innerHTML = msg;
            const input = document.getElementById('cDialogInput');
            input.style.display = 'block';
            input.value = defaultText;
            cOverlay.style.display = 'flex';
            input.focus();
            console.log('🔵 [cPrompt] 弹窗已显示');
            document.getElementById('cDialogCancel').onclick = () => { console.log('🔵 [cPrompt] 用户取消'); closeDialog(); resolve(null); };
            document.getElementById('cDialogConfirm').onclick = () => {
                const val = input.value; // ⚠️ 必须在 closeDialog 之前取值！
                console.log('🔵 [cPrompt] 用户确认:', val);
                closeDialog();
                resolve(val);
            };
        });
    }

    const totalBookmarksEl = document.getElementById('totalBookmarks');
    const engineStatusEl = document.getElementById('engineStatus');
    const totalFoldersEl = document.getElementById('totalFolders');
    const totalXBookmarksEl = document.getElementById('totalXBookmarks');
    const indexViewEl = document.getElementById('indexView');
    const xListPane = document.getElementById('xListPane');
    const xDetailPane = document.getElementById('xDetailPane');
    const twActionControls = document.getElementById('twActionControls');

    // --- 拖拽自动滚动逻辑 (Drag Auto Scroll) ---
    let dragScrollInterval = null;
    if (xListPane) {
        xListPane.addEventListener('dragover', (e) => {
            e.preventDefault();
            const rect = xListPane.getBoundingClientRect();
            const y = e.clientY - rect.top;

            const threshold = 60;
            const scrollSpeed = 15;

            clearInterval(dragScrollInterval);
            if (y < threshold) {
                dragScrollInterval = setInterval(() => { xListPane.scrollTop -= scrollSpeed; }, 20);
            } else if (y > rect.height - threshold) {
                dragScrollInterval = setInterval(() => { xListPane.scrollTop += scrollSpeed; }, 20);
            } else {
                dragScrollInterval = null;
            }
        });
        const stopScroll = () => { clearInterval(dragScrollInterval); dragScrollInterval = null; };
        xListPane.addEventListener('dragend', stopScroll);
        xListPane.addEventListener('drop', stopScroll);
        window.addEventListener('mouseup', stopScroll);
    }

    // Theme logic
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
        let currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', currentTheme);
        toggleBtn.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';

        toggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            theme = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
        });
    }
    const refreshBtn = document.getElementById('refreshBtn');
    const openTwitterBtn = document.getElementById('openTwitterBtn');

    // Drawer Logic
    const twDrawerOverlay = document.getElementById('twDrawerOverlay');
    const twDrawerPanel = document.getElementById('twDrawerPanel');
    const twDrawerClose = document.getElementById('twDrawerClose');

    window.closeTwDrawer = function () {
        if (twDrawerOverlay && twDrawerPanel) {
            twDrawerOverlay.classList.remove('open');
            twDrawerPanel.classList.remove('open');
        }
    }

    if (twDrawerClose) twDrawerClose.addEventListener('click', window.closeTwDrawer);
    if (twDrawerOverlay) twDrawerOverlay.addEventListener('click', window.closeTwDrawer);

    // Native Bookmark Drawer Logic
    const bmDrawerOverlay = document.getElementById('bmDrawerOverlay');
    const bmDrawerPanel = document.getElementById('bmDrawerPanel');
    const bmDrawerClose = document.getElementById('bmDrawerClose');

    window.closeBmDrawer = function () {
        if (bmDrawerOverlay && bmDrawerPanel) {
            bmDrawerOverlay.classList.remove('open');
            bmDrawerPanel.classList.remove('open');
        }
        // 销毁 iframe 释放内存
        const wrap = document.getElementById('bmIframeWrap');
        if (wrap) {
            const oldIframe = wrap.querySelector('iframe');
            if (oldIframe) oldIframe.remove();
            const loading = document.getElementById('bmIframeLoading');
            if (loading) loading.classList.remove('hidden');
        }
        window._currentBmViewerId = null;
        // 清除 declarativeNetRequest 动态规则
        try {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [99001, 99002]
            });
        } catch (e) { /* ignore */ }
    }

    if (bmDrawerClose) bmDrawerClose.addEventListener('click', window.closeBmDrawer);
    if (bmDrawerOverlay) bmDrawerOverlay.addEventListener('click', window.closeBmDrawer);

    // Tab 切换逻辑
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabTwitterControls = document.getElementById('tab-twitter-controls');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).classList.add('active');

            if (tabTwitterControls) {
                tabTwitterControls.style.display = target === 'tab-twitter' ? 'flex' : 'none';
            }

            // 如果第一次点击推特 tab 且没有任何分类，自动触发聚类
            if (target === 'tab-twitter') {
                const categorizeBtn = document.getElementById('categorizeTwitterBtn');
                const listPane = document.getElementById('xListPane');
                if (!window._hasAutoClusteredTwitter && window._globalXCount > 0 && listPane && !listPane.querySelector('.folder-item')) {
                    window._hasAutoClusteredTwitter = true;
                    if (categorizeBtn && !categorizeBtn.disabled) {
                        categorizeBtn.click();
                    }
                }
            }

            // 点击回收站 tab 时自动加载数据
            if (target === 'tab-trash') {
                loadTrashData();
            }
        });
    });

    refreshBtn.addEventListener('click', loadData);

    const forceReinitBtn = document.getElementById('forceReinitBtn');
    if (forceReinitBtn) {
        forceReinitBtn.addEventListener('click', async () => {
            const confirmed = await cConfirm('<b>提示：执行此操作将会清除当前所有的嵌入特征缓存并重新初始化。</b><br><br>下一次分类时，系统将会重新读取你的所有书签进行全量特征提取，这可能会花费较多时间。<br><br>确定要重建配置与索引吗？', '⚙️ 重建配置/索引');
            if (confirmed) {
                forceReinitBtn.innerText = '⚠️ 正在清空并重启引擎...';
                forceReinitBtn.disabled = true;
                chrome.runtime.sendMessage({ type: 'FORCE_REINIT_ENGINE' }, async (res) => {
                    if (res && res.success) {
                        await cAlert('✅ 旧缓存已全部清除！<br><br>请关闭本页面大盘控制面板，点击右上角的浏览器插件图标，召唤扩展小弹窗即可开始重塑引擎结构！', '🧹 清除成功');
                        window.close();
                    } else {
                        await cAlert('❌ 重置失败: ' + (JSON.stringify(res) || '原因未知'));
                        forceReinitBtn.innerText = '⚠️ 强制重置端侧模型';
                        forceReinitBtn.disabled = false;
                    }
                });
            }
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
            window._globalXCount = xCount;
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
                const folderContentPane = document.getElementById('folderContentPane');
                const folderContentEmpty = document.getElementById('folderContentEmpty');

                // Reset the content pane entirely whenever we redraw
                if (folderContentPane) {
                    Array.from(folderContentPane.children).forEach(child => {
                        if (child.id !== 'folderContentEmpty') child.remove();
                    });
                    if (folderContentEmpty) folderContentEmpty.style.display = 'flex';
                }

                if (foldersArray.length === 0) {
                    indexViewEl.innerHTML = '<div style="color: #999; text-align: center; padding: 40px;">暂无书签数据</div>';
                } else {
                    foldersArray.forEach(([path, bookmarks]) => {
                        const div = document.createElement('div');
                        div.className = 'folder-item';

                        let bmsHtml = bookmarks.map(b => `
                            <div class="bm-row" style="flex-direction: row; justify-content: space-between; align-items: center;">
                                <div style="flex: 1; min-width: 0; cursor: pointer;" class="bm-detail-trigger" data-id="${b.id}" data-url="${escapeHtml(b.url)}" data-title="${escapeHtml(b.title || '无标题')}" data-date="${b.dateAdded || ''}" data-folder="${escapeHtml(path)}">
                                    <div class="bm-title" style="color:var(--accent); font-weight:600;">${escapeHtml(b.title || '无标题')}</div>
                                    <div class="bm-url">${escapeHtml(b.url)}</div>
                                </div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <button class="btn btn-danger btn-trash-bm" data-id="${b.id}" style="padding: 4px 8px; font-size:12px;">🗑️ 移入回收站</button>
                                </div>
                            </div>
                        `).join('');

                        div.innerHTML = `
                            <div class="folder-title" style="border-left: 3px solid transparent; transition: 0.2s;">
                                <span style="font-weight: 500;">📁 ${escapeHtml(path)}</span>
                                <span class="folder-status">${bookmarks.length} 条</span>
                            </div>
                            <div class="folder-content" style="display: none;">
                                ${bmsHtml}
                            </div>
                        `;

                        const contentDiv = div.querySelector('.folder-content');
                        if (contentDiv) {
                            contentDiv.originalParent = div;
                            div._myContentDiv = contentDiv;
                        }

                        // 点击展开折叠到右侧面板
                        div.querySelector('.folder-title').addEventListener('click', function (e) {
                            // 移除所有的高亮
                            document.querySelectorAll('#indexView .folder-title').forEach(el => {
                                el.style.background = '';
                                el.style.borderLeftColor = 'transparent';
                            });
                            // 当前项高亮
                            this.style.background = 'var(--bg-active)';
                            this.style.borderLeftColor = 'var(--accent)';

                            // 隐藏所有右侧内容并送回原处
                            if (folderContentPane) {
                                if (folderContentEmpty) folderContentEmpty.style.display = 'none';

                                Array.from(folderContentPane.children).forEach(child => {
                                    if (child.id !== 'folderContentEmpty' && child.classList.contains('folder-content')) {
                                        child.style.display = 'none';
                                        if (child.originalParent) {
                                            child.originalParent.appendChild(child);
                                        }
                                    }
                                });

                                // 将当前分类的内容送入右侧面板
                                if (div._myContentDiv) {
                                    div._myContentDiv.style.display = 'block';
                                    folderContentPane.appendChild(div._myContentDiv);
                                }
                            }
                        });

                        indexViewEl.appendChild(div);
                    });
                }
            }

            // --- 渲染推特专属视图初始状态 ---
            if (xListPane && !xListPane.querySelector('.folder-item')) {
                const rawCountLabel = document.getElementById('rawCountLabel');
                if (xCount === 0) {
                    if (rawCountLabel) {
                        rawCountLabel.parentElement.innerHTML = `
                            <div style="font-size: 40px; margin-bottom: 20px;">🐦</div>
                            <div>你还没有同步过推特知识库哦。<br><br>插件会在后台自动抓取，请稍后再来看看吧。</div>
                        `;
                    }
                } else {
                    if (rawCountLabel) rawCountLabel.innerHTML = `共有 <b>${xCount}</b> 条推特书签。`;

                    // 如果推特 tab 已经是 active 状态（比如刷新页面时停留在此），自动触发
                    const twTab = document.getElementById('tab-twitter');
                    if (twTab && twTab.classList.contains('active')) {
                        if (!window._hasAutoClusteredTwitter) {
                            window._hasAutoClusteredTwitter = true;
                            const categorizeBtn = document.getElementById('categorizeTwitterBtn');
                            if (categorizeBtn && !categorizeBtn.disabled) {
                                categorizeBtn.click();
                            }
                        }
                    }
                }
            }
        });
    }

    const categorizeTwitterBtn = document.getElementById('categorizeTwitterBtn');
    const twitterCategorizeStatus = document.getElementById('twitterCategorizeStatus');

    // --- 全局状态：当前待保存的聚类草稿 (folderName -> [bookmarkId]) ---
    window.currentDrafts = {};

    // ── Contextual Toolbar: render action buttons for the selected folder ──
    function updateFolderToolbar(folderDiv) {
        const toolbar = document.getElementById('xFolderToolbar');
        const toolbarName = document.getElementById('xToolbarFolderName');
        const toolbarActions = document.getElementById('xToolbarActions');
        if (!toolbar || !toolbarName || !toolbarActions) return;

        const meta = folderDiv._folderMeta;
        if (!meta) return;

        toolbar.style.display = 'block';
        toolbarName.textContent = '📁 ' + meta.categoryName;
        toolbarActions.innerHTML = '';

        const { isUserFolder, bmIds } = meta;

        // ✏️ Rename button
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.cssText = 'padding:5px 10px; font-size:12px;';
        renameBtn.innerHTML = '✏️ 命名';
        renameBtn.addEventListener('click', async () => {
            const oldName = meta.categoryName;
            const newName = await cPrompt('给这批推文文件夹起个新名字：', oldName);
            if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
                const trimmed = newName.trim();
                if (isUserFolder) {
                    folderDiv.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed) + ' <span style="color:var(--warning-text);font-size:12px;">(📝 待保存)</span>';

                    window.pendingRenames = window.pendingRenames || {};
                    window.pendingRenames[meta._actualOldName || oldName] = trimmed;
                    if (!meta._actualOldName) meta._actualOldName = oldName;
                } else {
                    folderDiv.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed);
                    folderDiv.querySelectorAll('[data-name]').forEach(el => el.setAttribute('data-name', trimmed));
                    if (window.currentDrafts[oldName]) {
                        window.currentDrafts[trimmed] = window.currentDrafts[oldName];
                        delete window.currentDrafts[oldName];
                    } else {
                        window.currentDrafts[trimmed] = bmIds;
                    }
                }
                meta.categoryName = trimmed;
                folderDiv.setAttribute('data-name', trimmed);
                toolbarName.textContent = '📁 ' + trimmed;
                // Re-render toolbar to refresh button states
                updateFolderToolbar(folderDiv);
            }
        });
        toolbarActions.appendChild(renameBtn);

        // 💾 Save Rename (for saved/user folders with pending rename)
        if (isUserFolder && meta._actualOldName && meta._actualOldName !== meta.categoryName) {
            const saveRenameBtn = document.createElement('button');
            saveRenameBtn.className = 'btn btn-success';
            saveRenameBtn.style.cssText = 'padding:5px 10px; font-size:12px;';
            saveRenameBtn.innerHTML = '💾 保存名字';
            saveRenameBtn.addEventListener('click', async () => {
                const oName = meta._actualOldName;
                const nName = meta.categoryName;
                saveRenameBtn.innerText = '⏳ 保存中...';
                saveRenameBtn.disabled = true;
                chrome.runtime.sendMessage({ type: 'RENAME_TWITTER_FOLDER', oldName: oName, newName: nName }, async (res) => {
                    if (res && res.success) {
                        folderDiv.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(nName);
                        folderDiv.querySelectorAll('[data-name]').forEach(el => el.setAttribute('data-name', nName));
                        meta._actualOldName = nName;
                        if (window.pendingRenames) delete window.pendingRenames[oName];
                        await cAlert('✅ 编辑已保存');
                        updateFolderToolbar(folderDiv);
                    } else {
                        saveRenameBtn.innerText = '💾 保存失败';
                        saveRenameBtn.disabled = false;
                        cAlert('❌ 保存失败:' + res?.error);
                    }
                });
            });
            toolbarActions.appendChild(saveRenameBtn);
        }

        // 💾 Sync / Archive (for draft folders only)
        if (!isUserFolder) {
            const syncBtn = document.createElement('button');
            syncBtn.className = 'btn btn-success';
            syncBtn.style.cssText = 'padding:5px 10px; font-size:12px;';
            syncBtn.innerHTML = '💾 归档入库';
            syncBtn.addEventListener('click', async () => {
                const folderName = meta.categoryName;
                const confirmed = await cConfirm(`此操作将在 Chrome 中建真实文件夹存放 <b>${escapeHtml(folderName)}</b> 书签，你确定保存吗？`);
                if (!confirmed) return;
                syncBtn.innerText = '⏳ 保存中...';
                syncBtn.disabled = true;
                chrome.runtime.sendMessage({ type: 'SYNC_MULTIPLE_TWITTER_FOLDERS', folders: { [folderName]: bmIds } }, async (res) => {
                    if (res && res.success) {
                        delete window.currentDrafts[folderName];
                        meta.isUserFolder = true;
                        folderDiv.setAttribute('data-isuser', 'true');
                        await cAlert('✅ 成功保存！');
                        folderDiv.querySelectorAll('.folder-badge').forEach(b => {
                            b.innerText = '已保存';
                            b.style = 'background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); padding:2px 6px; border-radius:4px; font-size:10px;';
                        });
                        folderDiv.querySelector('.folder-title').style.borderLeftColor = 'var(--success-text)';
                        updateFolderToolbar(folderDiv);
                    } else {
                        await cAlert('❌ 保存失败: ' + (res?.error || '未知错误'));
                        syncBtn.innerText = '💾 重试';
                        syncBtn.disabled = false;
                    }
                });
            });
            toolbarActions.appendChild(syncBtn);
        }

        // 🗑️ Delete folder
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.cssText = 'padding:5px 10px; font-size:12px; color: var(--danger-btn);';
        deleteBtn.innerHTML = '🗑️ 删除';
        deleteBtn.addEventListener('click', async () => {
            const folderName = meta.categoryName;
            const confirmed = await cConfirm(`确定要彻底删除 ${isUserFolder ? '已保存分类' : '临时草稿'} <b>${escapeHtml(folderName)}</b> 及里面所有的推文吗？<br><br><b>警告：这会导致这些书签从 Chrome 中永久抹除！</b>`);
            if (!confirmed) return;
            deleteBtn.innerText = '⏳ 删除中...';
            deleteBtn.disabled = true;

            const msgType = isUserFolder ? 'DELETE_TWITTER_FOLDER' : 'DELETE_MULTIPLE_BOOKMARKS';
            const msgPayload = isUserFolder ? { type: msgType, folderName } : { type: msgType, bookmarkIds: bmIds };

            chrome.runtime.sendMessage(msgPayload, async (res) => {
                if (res && res.success) {
                    if (!isUserFolder) delete window.currentDrafts[folderName];
                    // Cleanup right pane if this folder was showing
                    if (folderDiv._myContentDiv && folderDiv._myContentDiv.parentElement && folderDiv._myContentDiv.parentElement.id === 'xContentPane') {
                        folderDiv._myContentDiv.remove();
                        const emptyState = document.getElementById('xContentEmpty');
                        if (emptyState) emptyState.style.display = 'flex';
                    }
                    folderDiv.style.transition = 'opacity 0.3s, max-height 0.3s';
                    folderDiv.style.opacity = '0';
                    folderDiv.style.maxHeight = '0';
                    folderDiv.style.overflow = 'hidden';
                    setTimeout(() => folderDiv.remove(), 300);
                    // Hide toolbar
                    toolbar.style.display = 'none';
                } else {
                    deleteBtn.innerText = '🗑️ 重试';
                    deleteBtn.disabled = false;
                    cAlert('❌ 删除失败:' + res?.error);
                }
            });
        });
        toolbarActions.appendChild(deleteBtn);
    }

    function renderTwitterFolderSection(categoryName, bookmarks, isUserFolder, containerEl) {
        const div = document.createElement('div');
        div.className = 'folder-item';
        div.setAttribute('data-name', categoryName);
        div.setAttribute('data-isuser', isUserFolder);

        // Drag-and-drop dropzone setup for this folder
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            div.style.borderColor = 'var(--accent)';
        });
        div.addEventListener('dragleave', (e) => {
            if (!div.contains(e.relatedTarget)) {
                div.style.borderColor = '';
            }
        });
        div.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            div.style.borderColor = '';

            try {
                const dataStr = e.dataTransfer.getData('text/plain');
                if (!dataStr) return;
                const { bmId, sourceCategory } = JSON.parse(dataStr);
                const targetCategory = div.getAttribute('data-name');
                const isTargetUserFolder = div.getAttribute('data-isuser') === 'true';

                if (!bmId || sourceCategory === targetCategory) return;

                // Optimistically move node in DOM
                const movedItem = document.querySelector(`.tw-list-item .inline-dispatch-btn[data-id="${bmId}"]`)?.closest('.tw-list-item');
                if (movedItem) {
                    const contentContainer = div._myContentDiv || div.querySelector('.folder-content');
                    const sourceFolderContent = movedItem.closest('.folder-content');

                    if (sourceFolderContent) {
                        const sourceTitle = sourceFolderContent.originalParent || sourceFolderContent.previousElementSibling;
                        const status = sourceTitle?.querySelector('.folder-status');
                        if (status) {
                            let c = parseInt(status.innerText);
                            if (!isNaN(c) && c > 0) status.innerText = (c - 1) + ' 条';
                        }
                    }
                    if (contentContainer) {
                        const firstItem = contentContainer.querySelector('.tw-list-item');
                        if (firstItem) {
                            contentContainer.insertBefore(movedItem, firstItem);
                        } else {
                            contentContainer.appendChild(movedItem);
                        }
                    }
                    movedItem.setAttribute('data-category', targetCategory);
                    const destStatus = div.querySelector('.folder-title .folder-status');
                    if (destStatus) {
                        let c = parseInt(destStatus.innerText);
                        if (!isNaN(c)) destStatus.innerText = (c + 1) + ' 条';
                    }
                }

                // If dropping into a real user folder, sync it instantly
                if (isTargetUserFolder) {
                    chrome.runtime.sendMessage({
                        type: 'SYNC_MULTIPLE_TWITTER_FOLDERS',
                        folders: { [targetCategory]: [bmId] }
                    }, (res) => {
                        if (!res || !res.success) cAlert('❌ 移动失败: ' + res?.error);
                    });
                } else {
                    // Dropping into a draft folder, update JS state
                    if (window.currentDrafts[sourceCategory]) {
                        window.currentDrafts[sourceCategory] = window.currentDrafts[sourceCategory].filter(id => id !== bmId);
                    }
                    if (!window.currentDrafts[targetCategory]) window.currentDrafts[targetCategory] = [];
                    if (!window.currentDrafts[targetCategory].includes(bmId)) {
                        window.currentDrafts[targetCategory].push(bmId);
                    }
                }
            } catch (err) { }
        });

        const bmIds = bookmarks.map(b => b.id);
        const borderColor = isUserFolder ? 'var(--success-text)' : 'var(--warning-text)';
        const badge = isUserFolder ? '已保存' : '待保存草稿';
        const badgeStyle = isUserFolder ? 'background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border);' : 'background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-bg);';

        // 绑定整个列表项的点击事件（非文件夹内容展开）
        let bmsHtml = bookmarks.length > 0 ? bookmarks.map((b, i) => {
            let author = '未知作者', text = b.title;
            let meta = { retweets: '-', likes: '-', views: '-', mediaUrl: '' };

            const metaMatch = b.title.match(/\u200B({.*?})\u200B$/);
            if (metaMatch) {
                try {
                    meta = JSON.parse(metaMatch[1]);
                    text = text.replace(/\u200B{.*?}\u200B$/, '');
                } catch (e) { }
            }

            const match = text.match(/\[X推文\]\s*(.*?):\s*(.*)/);
            if (match) {
                author = match[1];
                text = meta.fullText || match[2]; // 优先提取 metadata 中的完整内容
            } else if (meta.fullText) {
                text = meta.fullText; // 退路：如果没有作者结构但是存了完整文本
            }

            let handle = '';
            const handleMatch = b.url.match(/https?:\/\/(?:twitter|x)\.com\/([^\/]+)/i);
            if (handleMatch) handle = handleMatch[1];

            const avatarUrl = meta.authorAvatar || (handle ? `https://unavatar.io/twitter/${handle}?fallback=false` : '');

            // 为了安全传递数据给 DOM
            const bmDataStr = JSON.stringify({
                id: b.id, url: b.url, author, handle, text, meta,
                isUserFolder, folderName: categoryName
            }).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

            return `
                <div class="tw-list-item" data-bm='${bmDataStr}' title="允许拖拽以重分类 / 点击查看详情" draggable="true" data-category="${escapeHtml(categoryName)}">
                    <div class="list-col" style="color:var(--text-sec); font-family:monospace; justify-content:center;">${i + 1}</div>
                    
                    <div class="list-col" style="gap:10px;">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="list-avatar avatar-img" />` : `<div class="list-avatar">${author.charAt(0).toUpperCase()}</div>`}
                        <div style="display:flex; flex-direction:column; min-width:0;">
                            <span class="list-name">${escapeHtml(author)}</span>
                            ${handle ? `<span style="font-size:12px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${escapeHtml(handle)}</span>` : ''}
                        </div>
                    </div>

                    <div class="list-snippet" style="min-width:0; align-self:center;">${escapeHtml(text)}</div>

                    <div class="list-col" style="justify-content:center; position:relative;">
                        ${meta.mediaUrl ? `<img src="${meta.mediaUrl}" style="height:32px; width:48px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color);"/>${meta.isVideo ? '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:16px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events:none;">▶</div>' : ''}` : `<span style="color:var(--text-muted);">-</span>`}
                    </div>

                    <div class="list-col" style="color:var(--text-sec); font-family:monospace;">${meta.views !== '-' ? meta.views : '-'}</div>
                    <div class="list-col" style="color:var(--text-sec); font-family:monospace;">${meta.retweets !== '-' ? meta.retweets : '-'}</div>
                    <div class="list-col" style="color:var(--text-sec); font-family:monospace;">${meta.likes !== '-' ? meta.likes : '-'}</div>
                    
                    <div class="list-col" style="display:flex; gap:6px;">
                        <button class="btn btn-primary inline-dispatch-btn" data-id="${b.id}" style="padding: 4px 6px; font-size:11px;" title="基于大模型语义将本条推文分类入库">🪄 智能分类</button>
                        <button class="btn btn-danger inline-delete-btn" data-id="${b.id}" style="padding: 4px 6px; font-size:11px;" title="在浏览器本地记录中删除书签，不会影响推特本身">🗑️ 删除记录</button>
                    </div>
                </div>`;
        }).join('') : `<div style="padding: 20px; color: var(--text-sec); text-align:center;">暂无推文</div>`;

        div.innerHTML = `
            <div class="folder-title" style="border-left: 3px solid ${borderColor}; display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding: 12px 14px; cursor:pointer;">
                <div style="display:flex; align-items:center; width: 100%;">
                    <span class="folder-name-text" style="color:var(--text-main); font-weight:500; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(categoryName)}">📁 ${escapeHtml(categoryName)}</span>
                </div>
                <div style="display:flex; align-items:center; gap: 6px;">
                    <span class="folder-status" style="background:var(--bg-active); border:none; padding:2px 6px; border-radius:4px; font-size:11px; color:var(--text-sec);">${bookmarks.length} 条</span>
                    <span class="folder-badge" style="font-size:10px; padding:2px 6px; border-radius:4px; ${badgeStyle}">${badge}</span>
                </div>
            </div>
            <div class="folder-content">
                ${bookmarks.length > 0 ? `
                <div class="tw-list-header-row">
                    <div style="text-align:center;">#</div>
                    <div>用户</div>
                    <div>内容摘要</div>
                    <div style="text-align:center;">媒体</div>
                    <div>阅读量</div>
                    <div>转发</div>
                    <div>点赞</div>
                    <div>操作</div>
                </div>
                ` : ''}
                ${bmsHtml}
            </div>`;

        // Store folder metadata on the div for toolbar access
        div._folderMeta = {
            categoryName,
            isUserFolder,
            bmIds,
            borderColor,
            badge,
            badgeStyle
        };

        // Initialize content div tracking for Split Pane logic
        const contentDiv = div.querySelector('.folder-content');
        if (contentDiv) {
            contentDiv.originalParent = div;
            div._myContentDiv = contentDiv;
            // hide initially since they will be placed in Right Pane on click
            contentDiv.style.display = 'none';
        }

        // ── Folder click: update toolbar + right pane ──
        div.querySelector('.folder-title').addEventListener('click', function (e) {
            if (e.target.tagName.toLowerCase() === 'button') return;

            // Highlight selected folder
            document.querySelectorAll('#xListPane .folder-title').forEach(el => {
                el.style.background = '';
                const isUserF = el.parentElement.getAttribute('data-isuser') === 'true';
                el.style.borderLeftColor = isUserF ? 'var(--success-text)' : 'var(--warning-text)';
            });
            this.style.background = 'var(--bg-active)';
            this.style.borderLeftColor = 'var(--accent)';

            // ── Update toolbar ──
            window._selectedFolderDiv = div;
            updateFolderToolbar(div);

            // ── Update right pane ──
            const contentPane = document.getElementById('xContentPane');
            const emptyState = document.getElementById('xContentEmpty');
            if (emptyState) emptyState.style.display = 'none';

            // Send existing content back to their respective divs
            Array.from(contentPane.children).forEach(child => {
                if (child.id !== 'xContentEmpty' && child.classList.contains('folder-content')) {
                    child.style.display = 'none';
                    if (child.originalParent) {
                        child.originalParent.appendChild(child);
                    }
                }
            });

            // Put current content into pane
            if (contentDiv) {
                contentDiv.style.display = 'block';
                contentPane.appendChild(contentDiv);
            }
        });

        // 注入到 DOM 后，再绑定详细推文的点击事件（Twillot大视图）
        const twListItems = div.querySelectorAll('.tw-list-item');
        twListItems.forEach(item => {
            const data = JSON.parse(item.getAttribute('data-bm').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));

            item.addEventListener('dragstart', function (e) {
                if (e.target.closest('button') || e.target.closest('a')) {
                    e.preventDefault();
                    return;
                }
                const category = this.getAttribute('data-category');
                e.dataTransfer.setData('text/plain', JSON.stringify({ bmId: data.id, sourceCategory: category }));
                e.dataTransfer.effectAllowed = 'move';

                const currentContent = this.closest('.folder-content');
                document.querySelectorAll('.folder-content').forEach(content => {
                    if (content !== currentContent && content.classList.contains('open')) {
                        content.classList.remove('open');
                    }
                });

                setTimeout(() => this.style.opacity = '0.4', 0);
            });
            item.addEventListener('dragend', function (e) {
                this.style.opacity = '1';
                document.querySelectorAll('.folder-item').forEach(el => el.style.borderColor = '');
            });

            item.addEventListener('click', function (e) {
                if (e.target.closest('button')) {
                    return;
                }
                // 移除其他选中态
                document.querySelectorAll('.tw-list-item').forEach(el => el.classList.remove('selected'));
                this.classList.add('selected');
                renderDetailPane(data, this);
            });

            const dispatchBtn = item.querySelector('.inline-dispatch-btn');
            if (dispatchBtn) {
                dispatchBtn.addEventListener('click', async function (e) {
                    e.stopPropagation();
                    const origText = this.innerText;
                    this.innerText = '⏳ 匹配中..';
                    this.disabled = true;
                    chrome.runtime.sendMessage({ type: 'SMART_DISPATCH_SINGLE_TWITTER', bookmarkId: data.id }, async (res) => {
                        if (res && res.success) {
                            const p = Math.round(res.confidence * 100);
                            const confirmed = await cBubbleConfirm(dispatchBtn, `🎯 <b>语义匹配完成！</b><br><br>将移动至：<br>📁 <b style="color:var(--accent);">${res.suggestedFolder}</b> (${p}% 契合度)<br><br>确定吗？`);
                            if (confirmed) {
                                dispatchBtn.innerText = '⏳ 移动中..';
                                chrome.runtime.sendMessage({ type: 'MOVE_BOOKMARK', bookmarkId: data.id, parentId: res.suggestedFolderId }, async (mv) => {
                                    if (mv && mv.success) {
                                        item.style.opacity = '0';
                                        setTimeout(() => item.remove(), 300);
                                    } else {
                                        await cAlert('❌ 移动失败：' + mv?.error);
                                        dispatchBtn.innerText = origText;
                                        dispatchBtn.disabled = false;
                                    }
                                });
                            } else {
                                dispatchBtn.innerText = origText;
                                dispatchBtn.disabled = false;
                            }
                        } else {
                            await cAlert('❌ 匹配落选：' + (res?.error || '未知错误'));
                            dispatchBtn.innerText = origText;
                            dispatchBtn.disabled = false;
                        }
                    });
                });
            }

            const deleteBtn = item.querySelector('.inline-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async function (e) {
                    e.stopPropagation();
                    const confirmed = await cBubbleConfirm(deleteBtn, `确定要将这条记录<br>从书签库中删除吗？<br><br><span style="color:var(--text-sec); font-size:11px;">注：这仅删除本地记录，<b>不会</b>影响推特平台本身。</span>`, 220);
                    if (confirmed) {
                        this.innerText = '⏳..';
                        this.disabled = true;
                        chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId: data.id }, async (res) => {
                            if (res && res.success) {
                                item.style.opacity = '0';
                                setTimeout(() => item.remove(), 300);
                            } else {
                                await cAlert('❌ 删除失败：' + res?.error);
                                deleteBtn.innerText = '🗑️ 删除记录';
                                deleteBtn.disabled = false;
                            }
                        });
                    }
                });
            }
        });

        containerEl.appendChild(div);
    }

    // 渲染详情面板并在抽屉中打开
    function renderDetailPane(data, listItemElement) {
        const xDetailPane = document.getElementById('xDetailPane');
        if (!xDetailPane) return;

        const avatarUrl = data.meta.authorAvatar || (data.handle ? `https://unavatar.io/twitter/${data.handle}?fallback=false` : '');

        xDetailPane.innerHTML = `
            <div class="detail-container">
                <div class="detail-author-row">
                    <div class="detail-author-left">
                        ${avatarUrl ? `<img src="${avatarUrl}" class="detail-avatar avatar-img" />` : `<div class="detail-avatar" style="display:flex; align-items:center; justify-content:center; color:var(--text-sec); font-size:24px;">${data.author.charAt(0).toUpperCase()}</div>`}
                        <div class="detail-name-row">
                            <span class="detail-name">${escapeHtml(data.author)}</span>
                            ${data.handle ? `<span class="detail-handle">@${escapeHtml(data.handle)}</span>` : ''}
                        </div>
                    </div>
                    <a href="${escapeHtml(data.url)}" target="_blank" class="btn btn-primary" style="text-decoration:none;">查看原推 ↗</a>
                </div>
                
                <div class="detail-text">${escapeHtml(data.text)}</div>
                
                ${data.meta.isVideo && data.meta.videoUrl ? `
                <div class="detail-media">
                    <video controls src="${data.meta.videoUrl}" poster="${data.meta.mediaUrl}" style="max-width: 100%; max-height: 450px; border-radius: 12px; border: 1px solid var(--border-color); background: #000;"></video>
                </div>` : data.meta.mediaUrl ? `
                <div class="detail-media">
                    <img src="${data.meta.mediaUrl}" class="media-thumb" title="点击查看大图" />
                </div>` : ''}

                <div class="detail-stats">
                    <span title="浏览量">👀 ${data.meta.views || '-'}</span>
                    <span title="点赞数">❤️ ${data.meta.likes || '-'}</span>
                    <span title="转发数">🔁 ${data.meta.retweets || '-'}</span>
                    <span style="margin-left:auto; font-size:12px;" class="list-folder-badge">📁 ${escapeHtml(data.folderName)}</span>
                </div>

                <div class="detail-actions">
                    <button class="btn btn-primary btn-dispatch-detail" data-id="${data.id}">🪄 智能分类</button>
                    <button class="btn btn-danger btn-delete-bm-detail" data-id="${data.id}">🗑️ 删除记录</button>
                </div>
            </div>
        `;

        // 重新绑定图片的点击
        const mediaThumb = xDetailPane.querySelector('.media-thumb');
        if (mediaThumb) {
            // 事件委托已经在顶部处理了，这里只需要 class 是 media-thumb 就会触发
        }

        // 绑定动作
        const dispatchBtn = xDetailPane.querySelector('.btn-dispatch-detail');
        if (dispatchBtn) {
            dispatchBtn.addEventListener('click', async function () {
                const id = this.getAttribute('data-id');
                this.innerText = '⏳ 匹配中...';
                this.disabled = true;
                chrome.runtime.sendMessage({ type: 'SMART_DISPATCH_SINGLE_TWITTER', bookmarkId: id }, async (res) => {
                    if (res && res.success) {
                        const p = Math.round(res.confidence * 100);
                        const confirmed = await cBubbleConfirm(dispatchBtn, `🎯 <b>语义匹配完成！</b><br><br>将移动至：<br>📁 <b style="color:var(--accent);">${res.suggestedFolder}</b> (${p}% 契合度)<br><br>确定吗？`);
                        if (confirmed) {
                            chrome.runtime.sendMessage({ type: 'MOVE_BOOKMARK', bookmarkId: id, parentId: res.suggestedFolderId }, async (mv) => {
                                if (mv && mv.success) {
                                    await cAlert('✅ 派发成功。');
                                    listItemElement.remove();
                                    if (typeof window.closeTwDrawer === 'function') window.closeTwDrawer();
                                } else {
                                    await cAlert('❌ 移动失败：' + mv?.error);
                                    this.innerText = '🪄 重试';
                                    this.disabled = false;
                                }
                            });
                        } else {
                            this.innerText = '🪄 智能分类';
                            this.disabled = false;
                        }
                    } else {
                        await cAlert('❌ 匹配落选：' + (res?.error || '未知错误'));
                        this.innerText = '🪄 智能分类';
                        this.disabled = false;
                    }
                });
            });
        }

        const deleteBmBtn = xDetailPane.querySelector('.btn-delete-bm-detail');
        if (deleteBmBtn) {
            deleteBmBtn.addEventListener('click', async function () {
                const id = this.getAttribute('data-id');
                const confirmed = await cBubbleConfirm(deleteBmBtn, `确定要将这条记录<br>从书签库中删除吗？<br><br><span style="color:var(--text-sec); font-size:12px;">注：这仅仅是删除本地记录，<b>不会</b>影响你在推特平台本身的点赞或收藏。</span>`, 240);
                if (confirmed) {
                    this.innerText = '⏳ 删除中..';
                    this.disabled = true;
                    chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId: id }, async (res) => {
                        if (res && res.success) {
                            listItemElement.style.opacity = '0';
                            setTimeout(() => listItemElement.remove(), 300);
                            if (typeof window.closeTwDrawer === 'function') window.closeTwDrawer();
                        } else {
                            await cAlert('❌ 删除失败：' + res?.error);
                            this.innerText = '🗑️ 重试';
                            this.disabled = false;
                        }
                    });
                }
            });
        }

        // 打开 Drawer
        const twDrawerOverlay = document.getElementById('twDrawerOverlay');
        const twDrawerPanel = document.getElementById('twDrawerPanel');
        if (twDrawerOverlay && twDrawerPanel) {
            twDrawerOverlay.classList.add('open');
            twDrawerPanel.classList.add('open');
        }
    }

    if (categorizeTwitterBtn) {
        categorizeTwitterBtn.addEventListener('click', () => {
            categorizeTwitterBtn.innerText = '🧠 正在深度语义归类...';
            categorizeTwitterBtn.disabled = true;
            twitterCategorizeStatus.style.display = 'block';
            twitterCategorizeStatus.innerHTML = '正在用端侧大模型提取特征并聚类，这可能需要一点时间...';

            chrome.runtime.sendMessage({ type: 'CLUSTER_TWITTER_BOOKMARKS' }, (res) => {
                categorizeTwitterBtn.innerText = '🔮 重新提取特征并聚类';
                categorizeTwitterBtn.disabled = false;

                if (!res || !res.success) {
                    twitterCategorizeStatus.innerHTML = `❌ 分析失败: ${res?.error || '未知错误'}`;
                    twitterCategorizeStatus.className = 'status-banner status-warning';
                    return;
                }

                twitterCategorizeStatus.style.display = 'none';

                // Clear xListPane, xContentPane, and toolbar
                xListPane.innerHTML = '';
                const xContentPane = document.getElementById('xContentPane');
                if (xContentPane) {
                    Array.from(xContentPane.children).forEach(child => {
                        if (child.id !== 'xContentEmpty') child.remove();
                    });
                    const emptyState = document.getElementById('xContentEmpty');
                    if (emptyState) emptyState.style.display = 'flex';
                }
                const xFolderToolbar = document.getElementById('xFolderToolbar');
                if (xFolderToolbar) xFolderToolbar.style.display = 'none';

                // Setup control buttons
                twActionControls.style.display = 'flex';
                twActionControls.innerHTML = '';

                const addFolderBtn = document.createElement('button');
                addFolderBtn.className = 'btn btn-primary';
                addFolderBtn.innerHTML = '➕ 新建草稿分类';
                addFolderBtn.addEventListener('click', async () => {
                    const folderName = await cPrompt('新分类名称：', '', '➕ 新建草稿分类');
                    if (folderName && folderName.trim()) {
                        const trimmed = folderName.trim();
                        window.currentDrafts[trimmed] = window.currentDrafts[trimmed] || [];
                        renderTwitterFolderSection(trimmed, [], false, xListPane);
                    }
                });

                const saveAllBtn = document.createElement('button');
                saveAllBtn.className = 'btn btn-success';
                saveAllBtn.innerHTML = '💾 一键保存全部草稿';
                saveAllBtn.addEventListener('click', async () => {
                    if (Object.keys(window.currentDrafts || {}).length === 0 && Object.keys(window.pendingRenames || {}).length === 0) {
                        return cAlert('没有需要保存的草稿或修改。');
                    }
                    saveAllBtn.innerText = '⏳ 保存中...';
                    saveAllBtn.disabled = true;
                    chrome.runtime.sendMessage({ type: 'SYNC_MULTIPLE_TWITTER_FOLDERS', folders: window.currentDrafts, renames: window.pendingRenames }, async (saveRes) => {
                        if (saveRes && saveRes.success) {
                            window.currentDrafts = {};
                            window.pendingRenames = {};
                            saveAllBtn.innerText = '✅ 全部保存成功';
                            document.querySelectorAll('.btn-save-rename').forEach(b => b.style.display = 'none');
                            document.querySelectorAll('.btn-sync-folder').forEach(b => b.style.display = 'none');
                            await cAlert(`✅ 全部草稿和修改已同步到浏览器中！<br>请点击【刷新数据】加载最新结构。`);
                        } else {
                            await cAlert('❌ 批量保存失败: ' + (saveRes?.error || '未知错误'));
                            saveAllBtn.innerText = '💾 一键保存全部草稿';
                            saveAllBtn.disabled = false;
                        }
                    });
                });

                twActionControls.appendChild(addFolderBtn);
                twActionControls.appendChild(saveAllBtn);

                const userFolders = res.userFolders || {};
                const autoClusters = res.autoClusters || {};

                window.currentDrafts = {};
                for (const [name, bms] of Object.entries(autoClusters)) {
                    if (name.includes('📌 未归类推文')) continue;
                    window.currentDrafts[name] = bms.map(b => b.id);
                }

                // Render auto clusters (drafts)
                for (const [name, bms] of Object.entries(autoClusters)) {
                    renderTwitterFolderSection(name, bms, false, xListPane);
                }

                // Render existing browser folders
                if (Object.keys(userFolders).length > 0) {
                    const existingHeader = document.createElement('div');
                    existingHeader.innerHTML = '<div style="padding: 10px 20px; font-weight:600; color:var(--success-text); background:var(--success-bg); border-top:1px solid var(--border-color); border-bottom:1px solid var(--border-color);">🌐 已在浏览器中的分类库</div>';
                    xListPane.appendChild(existingHeader);

                    for (const [name, bms] of Object.entries(userFolders)) {
                        renderTwitterFolderSection(name, bms, true, xListPane);
                    }
                }
            });
        });
    }

    // --- 语义搜索逻辑 ---
    const dashSearchInput = document.getElementById('dashSearchInput');
    const dashSearchBtn = document.getElementById('dashSearchBtn');
    const tabSearchBtn = document.getElementById('tabSearchBtn');
    const searchView = document.getElementById('searchView');
    const searchStatus = document.getElementById('searchStatus');

    function performSearch() {
        const query = dashSearchInput.value.trim();
        if (!query) {
            cAlert('请输入搜索关键词。');
            return;
        }

        dashSearchBtn.innerText = '⏳ 搜索中...';
        dashSearchBtn.disabled = true;

        chrome.runtime.sendMessage({
            type: 'SEARCH_BOOKMARKS',
            query: query,
            topK: 50
        }, (res) => {
            dashSearchBtn.innerText = '🔍 语义搜索';
            dashSearchBtn.disabled = false;

            if (res && res.success) {
                // Switch to search tab
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
                tabSearchBtn.style.display = 'inline-block';
                tabSearchBtn.classList.add('active');
                document.getElementById('tab-search').classList.add('active');

                searchStatus.style.display = 'block';
                searchStatus.innerHTML = `已为您找到 <b>${res.results.length}</b> 条与 "<b>${escapeHtml(query)}</b>" 高度相关的结果：`;

                searchView.innerHTML = res.results.map((b, i) => {
                    const similarity = b.score || b.similarity || 0;
                    const p = Math.round(similarity * 100);

                    let badgeColor, badgeBg, badgeBorder;
                    if (p >= 80) {
                        badgeColor = 'var(--success-text)';
                        badgeBg = 'var(--success-bg)';
                        badgeBorder = 'var(--success-border)';
                    } else if (p >= 60) {
                        badgeColor = 'var(--warning-text)';
                        badgeBg = 'var(--warning-bg)';
                        badgeBorder = 'var(--warning-border)';
                    } else {
                        badgeColor = 'var(--text-sec)';
                        badgeBg = 'var(--bg-active)';
                        badgeBorder = 'var(--border-color)';
                    }

                    return `
                        <div class="bm-row" style="background: var(--bg-surface); border-radius: 8px; padding: 15px; border: 1px solid var(--border-color); box-shadow: 0 1px 3px var(--shadow); flex-direction: row; align-items: center; justify-content: space-between;">
                            <div style="flex: 1; min-width: 0; cursor: pointer;" class="bm-detail-trigger" data-id="${b.id}" data-url="${escapeHtml(b.url)}" data-title="${escapeHtml(b.title || '无标题')}" data-date="${b.dateAdded || ''}" data-folder="${escapeHtml(b.folderPath || '')}">
                                <div class="bm-title" style="font-size: 15px; color: var(--accent); font-weight: 600;">${escapeHtml(b.title || '无标题')}</div>
                                <div class="bm-url" style="margin-top: 6px; font-size: 13px; color: var(--text-sec);">${escapeHtml(b.url)}</div>
                            </div>
                            <div style="text-align: right; margin-left: 15px; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
                                <span style="font-size: 12px; font-weight: bold; color: ${badgeColor}; background: ${badgeBg}; padding: 4px 8px; border-radius: 4px; border: 1px solid ${badgeBorder};">契合度 ${p}%</span>
                                <button class="btn btn-danger btn-trash-bm" data-id="${b.id}" style="padding: 4px 8px; font-size:12px;">🗑️ 移入回收站</button>
                            </div>
                        </div>
                    `;
                }).join('');

                if (res.results.length === 0) {
                    searchView.innerHTML = `<div style="text-align: center; padding: 60px; color: var(--text-sec); font-size: 15px;">未找到相关结果，您的表达太个性化，还是模型太笨啦？尝试换个说法吧～</div>`;
                }

            } else {
                cAlert('搜索失败：' + (res?.error || '模型尚未就绪，请稍后'));
            }
        });
    }

    if (dashSearchBtn) {
        dashSearchBtn.addEventListener('click', performSearch);
    }

    if (dashSearchInput) {
        dashSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }

    // --- 回收站数据加载 ---
    function loadTrashData() {
        chrome.runtime.sendMessage({ type: 'GET_TRASH_DATA' }, (res) => {
            const trashListContent = document.getElementById('trashListContent');
            const trashCountSpan = document.getElementById('trashCount');
            const emptyTrashBtn = document.querySelector('#trashToolbar .btn-empty-trash');

            if (!res || !res.success) {
                if (trashListContent) trashListContent.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-sec);">加载失败</div>';
                return;
            }

            const items = res.items || [];
            if (trashCountSpan) trashCountSpan.textContent = items.length > 0 ? `(${items.length})` : '';
            if (emptyTrashBtn) emptyTrashBtn.style.display = items.length > 0 ? 'inline-flex' : 'none';

            if (items.length === 0) {
                if (trashListContent) trashListContent.innerHTML = `
                    <div style="padding: 60px; text-align: center; color: var(--text-sec);">
                        <div style="font-size: 40px; margin-bottom: 15px;">✨</div>
                        <div>回收站是空的，干干净净！</div>
                    </div>
                `;
                return;
            }

            if (trashListContent) {
                trashListContent.innerHTML = items.map((b, i) => `
                    <div class="bm-row" style="padding: 12px 20px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div style="flex: 1; min-width: 0; cursor: pointer; display: flex; align-items: center;" class="bm-detail-trigger" data-id="${b.id}" data-url="${escapeHtml(b.url)}" data-title="${escapeHtml(b.title || '无标题')}" data-date="${b.dateAdded || ''}" data-folder="🗑️ 回收站">
                            <span style="color: var(--text-muted); font-size: 12px; margin-right: 8px;">${i + 1}.</span>
                            <div style="flex: 1; min-width: 0;">
                                <div class="bm-title" style="font-size: 14px; color:var(--accent); font-weight:600;">${escapeHtml(b.title || '无标题')}</div>
                                <div class="bm-url" style="margin-top: 4px;">${escapeHtml(b.url)}</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                            <button class="btn btn-success btn-restore-bm" data-id="${b.id}" style="padding: 4px 8px; font-size:12px;">🔄 恢复</button>
                            <button class="btn btn-danger btn-hard-delete-bm" data-id="${b.id}" style="padding: 4px 8px; font-size:12px;">🗑️ 彻底删除</button>
                        </div>
                    </div>
                `).join('');
            }
        });
    }

    // 书签网页预览抽屉：iframe 嵌入 + declarativeNetRequest 剥离 X-Frame-Options
    const BM_VIEWER_RULE_IDS = [99001, 99002]; // 用于 declarativeNetRequest 的动态规则 ID

    async function enableIframeForDomain(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            // 先清掉旧规则
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: BM_VIEWER_RULE_IDS
            });

            // 添加新规则：剥离 X-Frame-Options 和 CSP frame-ancestors
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [
                    {
                        id: BM_VIEWER_RULE_IDS[0],
                        priority: 1,
                        action: {
                            type: 'modifyHeaders',
                            responseHeaders: [
                                { header: 'X-Frame-Options', operation: 'remove' },
                                { header: 'Content-Security-Policy', operation: 'remove' }
                            ]
                        },
                        condition: {
                            requestDomains: [domain],
                            resourceTypes: ['sub_frame']
                        }
                    },
                    {
                        id: BM_VIEWER_RULE_IDS[1],
                        priority: 1,
                        action: {
                            type: 'modifyHeaders',
                            responseHeaders: [
                                { header: 'X-Frame-Options', operation: 'remove' },
                                { header: 'Content-Security-Policy', operation: 'remove' }
                            ]
                        },
                        condition: {
                            initiatorDomains: [chrome.runtime.id + '.chromiumapp.org'],
                            resourceTypes: ['sub_frame']
                        }
                    }
                ]
            });
            console.log(`✅ iframe 解锁规则已为 ${domain} 生效`);
        } catch (e) {
            console.warn('⚠️ declarativeNetRequest 设置失败:', e);
        }
    }

    async function disableIframeRules() {
        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: BM_VIEWER_RULE_IDS
            });
        } catch (e) { /* ignore */ }
    }

    async function openBmViewer(id, title, url, rowEl) {
        window._currentBmViewerId = id;
        window._currentBmViewerRow = rowEl;

        // 填充 toolbar 信息
        const titleEl = document.getElementById('bmViewerTitle');
        const urlEl = document.getElementById('bmViewerUrl');
        const openTabEl = document.getElementById('bmViewerOpenTab');
        const trashEl = document.getElementById('bmViewerTrash');
        if (titleEl) titleEl.textContent = title || '无标题';
        if (urlEl) urlEl.textContent = url;
        if (openTabEl) openTabEl.href = url;
        if (trashEl) trashEl.setAttribute('data-id', id);

        // 清理旧 iframe
        const wrap = document.getElementById('bmIframeWrap');
        if (wrap) {
            const oldIframe = wrap.querySelector('iframe');
            if (oldIframe) oldIframe.remove();
        }

        // 显示 loading
        const loading = document.getElementById('bmIframeLoading');
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML = `
                <div style="font-size: 36px; margin-bottom: 12px; animation: pulse 1.5s infinite;">🌐</div>
                <div style="color: var(--text-sec); font-size: 14px;">正在加载网页...</div>
            `;
        }

        // 先通过 declarativeNetRequest 解锁目标域名的 iframe 限制
        await enableIframeForDomain(url);

        // 创建 iframe
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.style.cssText = 'width:100%; height:100%; border:none;';

        // iframe 加载成功
        iframe.addEventListener('load', () => {
            if (loading) loading.classList.add('hidden');
        });

        // 超时降级（部分网站可能用 JS 自行break out）
        let fallbackTimer = setTimeout(() => {
            if (loading && !loading.classList.contains('hidden')) {
                loading.innerHTML = `
                    <div style="font-size: 36px; margin-bottom: 12px;">🚫</div>
                    <div style="color: var(--text-sec); font-size: 14px; text-align:center; max-width: 350px;">
                        该网站通过 JavaScript 阻止了嵌入访问
                    </div>
                    <a href="${escapeHtml(url)}" target="_blank" class="btn btn-primary" style="margin-top: 18px; text-decoration:none; padding: 10px 24px;">🌐 在新标签页中打开</a>
                `;
            }
        }, 12000);

        iframe.addEventListener('load', () => clearTimeout(fallbackTimer));

        if (wrap) wrap.appendChild(iframe);

        // 打开 drawer
        if (bmDrawerOverlay && bmDrawerPanel) {
            bmDrawerOverlay.classList.add('open');
            bmDrawerPanel.classList.add('open');
        }
    }

    // toolbar 上的回收站按钮
    const bmViewerTrash = document.getElementById('bmViewerTrash');
    if (bmViewerTrash) {
        bmViewerTrash.addEventListener('click', async function () {
            const id = this.getAttribute('data-id');
            if (!id) return;
            const confirmed = await cBubbleConfirm(this, `确定要将这枚书签<br>移入回收站吗？`, 200);
            if (confirmed) {
                this.innerText = '⏳ 移动中...';
                this.disabled = true;
                chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId: id }, (res) => {
                    if (res && res.success) {
                        if (window._currentBmViewerRow) {
                            window._currentBmViewerRow.closest('.bm-row').remove();
                        }
                        window.closeBmDrawer();
                    } else {
                        cAlert('❌ 移动失败: ' + res?.error);
                    }
                    this.innerText = '🗑️ 移入回收站';
                    this.disabled = false;
                });
            }
        });
    }

    // 全局事件委派：回收站操作及书签点击
    document.body.addEventListener('click', async (e) => {
        // 点击书签容器打开 iframe 预览
        const trigger = e.target.closest('.bm-detail-trigger');
        if (trigger) {
            const id = trigger.getAttribute('data-id');
            const url = trigger.getAttribute('data-url');
            const title = trigger.getAttribute('data-title');
            openBmViewer(id, title, url, trigger);
        }
        // 移入回收站
        if (e.target.classList.contains('btn-trash-bm')) {
            const id = e.target.getAttribute('data-id');
            const confirmed = await cBubbleConfirm(e.target, `确定要将这枚书签<br>移入回收站吗？`, 200);
            if (confirmed) {
                e.target.innerText = '⏳ 移动中...';
                e.target.disabled = true;
                chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId: id }, (res) => {
                    if (res && res.success) {
                        e.target.closest('.bm-row').remove();
                    } else {
                        cAlert('❌ 移动失败: ' + res?.error);
                        e.target.innerText = '🗑️ 移入回收站';
                        e.target.disabled = false;
                    }
                });
            }
        }

        // 恢复书签
        if (e.target.classList.contains('btn-restore-bm')) {
            const id = e.target.getAttribute('data-id');
            e.target.innerText = '⏳ 恢复中...';
            e.target.disabled = true;
            chrome.runtime.sendMessage({ type: 'RESTORE_BOOKMARK', bookmarkId: id }, (res) => {
                if (res && res.success) {
                    e.target.closest('.bm-row').remove();
                } else {
                    cAlert('❌ 恢复失败: ' + res?.error);
                    e.target.innerText = '🔄 恢复';
                    e.target.disabled = false;
                }
            });
        }

        // 彻底删除
        if (e.target.classList.contains('btn-hard-delete-bm')) {
            const id = e.target.getAttribute('data-id');
            const confirmed = await cBubbleConfirm(e.target, `<b>警告：此操作不可逆！</b><br>将会从 Chrome 中永久擦除这条书签。`, 240);
            if (confirmed) {
                e.target.innerText = '⏳ 处理中...';
                e.target.disabled = true;
                chrome.runtime.sendMessage({ type: 'PERMANENT_DELETE_BOOKMARK', bookmarkId: id }, (res) => {
                    if (res && res.success) {
                        e.target.closest('.bm-row').remove();
                    } else {
                        cAlert('❌ 彻底删除失败: ' + res?.error);
                        e.target.innerText = '🗑️ 彻底删除';
                        e.target.disabled = false;
                    }
                });
            }
        }

        // 清空回收站
        if (e.target.classList.contains('btn-empty-trash')) {
            const confirmed = await cConfirm(`<b>警告：此操作将永久抹除回收站中的所有书签数据，不可恢复！</b><br><br>你确定要彻底清空吗？`, '⚠️ 清空回收站');
            if (confirmed) {
                e.target.innerText = '⏳ 爆炸级清空中...';
                e.target.disabled = true;
                chrome.runtime.sendMessage({ type: 'EMPTY_TRASH' }, async (res) => {
                    if (res && res.success) {
                        await cAlert('✅ 回收站已清理完毕，世界清静了。', '清理成功');
                        loadTrashData();
                    } else {
                        cAlert('❌ 清空失败: ' + (res?.error || '未知原因'));
                        e.target.innerText = '💥 一键清空回收站';
                        e.target.disabled = false;
                    }
                });
            }
        }
    });

    loadData();
});
