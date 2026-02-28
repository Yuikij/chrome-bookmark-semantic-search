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
                }
            }
        });
    }

    const categorizeTwitterBtn = document.getElementById('categorizeTwitterBtn');
    const twitterCategorizeStatus = document.getElementById('twitterCategorizeStatus');

    // --- 全局状态：当前待保存的聚类草稿 (folderName -> [bookmarkId]) ---
    window.currentDrafts = {};

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
                    const contentContainer = div.querySelector('.folder-content');
                    const sourceFolderContent = movedItem.closest('.folder-content');

                    if (sourceFolderContent) {
                        const status = sourceFolderContent.previousElementSibling?.querySelector('.folder-status');
                        if (status) {
                            let c = parseInt(status.innerText);
                            if (!isNaN(c) && c > 0) status.innerText = (c - 1) + ' 条';
                        }
                    }
                    if (contentContainer) {
                        contentContainer.insertBefore(movedItem, contentContainer.firstChild);
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

                    <div class="list-col" style="justify-content:center;">
                        ${meta.mediaUrl ? `<img src="${meta.mediaUrl}" style="height:32px; width:48px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color);"/>` : `<span style="color:var(--text-muted);">-</span>`}
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
            <div class="folder-title" style="border-left: 3px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap: 8px;">
                    <span class="folder-name-text" style="color:var(--text-main);">📁 ${escapeHtml(categoryName)}</span>
                    <span class="folder-status">${bookmarks.length}</span>
                    <span style="font-size:10px; padding:2px 6px; border-radius:4px; ${badgeStyle}">${badge}</span>
                </div>
                <div style="display:flex; gap: 6px;">
                    <button class="btn btn-rename" data-oldname="${escapeHtml(categoryName)}" data-isuser="${isUserFolder}" style="padding: 4px 8px; font-size: 11px;">✏️ 命名</button>
                    ${isUserFolder ? `<button class="btn btn-save-rename btn-success" data-oldname="${escapeHtml(categoryName)}" data-actual-old="${escapeHtml(categoryName)}" style="display:none; padding: 4px 8px; font-size: 11px;">💾 保存名字</button>` : ''}
                    ${!isUserFolder ? `<button class="btn btn-sync-folder btn-success" data-name="${escapeHtml(categoryName)}" data-ids='${JSON.stringify(bmIds)}' style="padding: 4px 8px; font-size: 11px;">💾 归档入库</button>` : ''}
                    <button class="btn btn-delete-folder" data-name="${escapeHtml(categoryName)}" data-isuser="${isUserFolder}" style="padding: 4px 8px; font-size: 11px; color: var(--danger-btn);">🗑️ 删除</button>
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

        // 绑定各种文件夹自身的事件
        // Rename (Draft or Saved)
        const renameBtn = div.querySelector('.btn-rename');
        if (renameBtn) {
            renameBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const oldName = this.getAttribute('data-oldname');
                const isUserF = this.getAttribute('data-isuser') === 'true';
                const newName = await cPrompt(`给这批推文文件夹起个新名字：`, oldName);
                if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
                    const trimmed = newName.trim();
                    if (isUserF) {
                        div.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed) + ' <span style="color:var(--warning-text);font-size:12px;">(📝 待保存)</span>';

                        const saveRenameBtn = div.querySelector('.btn-save-rename');
                        if (saveRenameBtn) {
                            const actualOld = saveRenameBtn.getAttribute('data-actual-old') || oldName;
                            saveRenameBtn.setAttribute('data-newname', trimmed);
                            saveRenameBtn.style.display = 'inline-block';

                            window.pendingRenames = window.pendingRenames || {};
                            window.pendingRenames[actualOld] = trimmed;
                        }

                        this.setAttribute('data-oldname', trimmed);
                    } else {
                        div.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed);
                        div.querySelectorAll('[data-name]').forEach(el => el.setAttribute('data-name', trimmed));
                        this.setAttribute('data-oldname', trimmed);
                        if (window.currentDrafts[oldName]) {
                            window.currentDrafts[trimmed] = window.currentDrafts[oldName];
                            delete window.currentDrafts[oldName];
                        } else {
                            window.currentDrafts[trimmed] = bmIds;
                        }
                    }
                }
            });
        }

        // Save rename (Saved folders)
        const saveRenameBtn = div.querySelector('.btn-save-rename');
        if (saveRenameBtn) {
            saveRenameBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const oName = this.getAttribute('data-actual-old');
                const nName = this.getAttribute('data-newname');
                this.innerText = '⏳ 保存中...';
                this.disabled = true;
                chrome.runtime.sendMessage({ type: 'RENAME_TWITTER_FOLDER', oldName: oName, newName: nName }, async (res) => {
                    if (res && res.success) {
                        this.style.display = 'none';
                        this.innerText = '💾 保存名字';
                        this.disabled = false;
                        div.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(nName);

                        this.setAttribute('data-actual-old', nName);
                        if (renameBtn) renameBtn.setAttribute('data-oldname', nName);
                        div.querySelectorAll('[data-name]').forEach(el => el.setAttribute('data-name', nName));

                        if (window.pendingRenames) delete window.pendingRenames[oName];
                        await cAlert('✅ 编辑已保存');
                    } else {
                        this.innerText = '💾 保存失败';
                        this.disabled = false;
                        cAlert('❌ 保存失败:' + res?.error);
                    }
                });
            });
        }

        // Sync folder
        const syncBtn = div.querySelector('.btn-sync-folder');
        if (syncBtn) {
            syncBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const folderName = this.getAttribute('data-name');
                const ids = JSON.parse(this.getAttribute('data-ids'));
                const confirmed = await cConfirm(`此操作将在 Chrome 中建真实文件夹存放 <b>${escapeHtml(folderName)}</b> 书签，你确定保存吗？`);
                if (!confirmed) return;
                const btn = this;
                btn.innerText = '⏳ 保存中...';
                btn.disabled = true;
                chrome.runtime.sendMessage({ type: 'SYNC_MULTIPLE_TWITTER_FOLDERS', folders: { [folderName]: ids } }, async (res) => {
                    if (res && res.success) {
                        delete window.currentDrafts[folderName];
                        btn.style.display = 'none';
                        await cAlert(`✅ 成功保存！`);
                        div.querySelector('.folder-name-text').parentElement.querySelector('span:last-child').innerText = '已保存';
                        div.querySelector('.folder-name-text').parentElement.querySelector('span:last-child').style = 'background:var(--success-bg); color:var(--success-text); border:1px solid var(--success-border); padding:2px 6px; border-radius:4px; font-size:10px;';
                        div.querySelector('.folder-title').style.borderLeftColor = 'var(--success-text)';
                    } else {
                        await cAlert('❌ 保存失败: ' + (res?.error || '未知错误'));
                        btn.innerText = '💾 保存失败，重试';
                        btn.disabled = false;
                    }
                });
            });
        }

        // Folder toggle
        div.querySelector('.folder-title').addEventListener('click', function (e) {
            if (e.target.tagName.toLowerCase() === 'button') return;
            this.nextElementSibling.classList.toggle('open');
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

        // Delete folder
        const deleteBtn = div.querySelector('.btn-delete-folder');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const folderName = this.getAttribute('data-name');
                const isUserF = this.getAttribute('data-isuser') === 'true';

                const confirmed = await cConfirm(`确定要彻底删除 ${isUserF ? '已保存分类' : '临时草稿'} <b>${escapeHtml(folderName)}</b> 及里面所有的推文吗？<br><br><b>警告：这会导致这些书签从 Chrome 中永久抹除！</b>`);
                if (confirmed) {
                    this.innerText = '⏳ 删除中...';
                    this.disabled = true;
                    if (isUserF) {
                        chrome.runtime.sendMessage({ type: 'DELETE_TWITTER_FOLDER', folderName }, async (res) => {
                            if (res && res.success) {
                                div.style.transition = 'opacity 0.3s, max-height 0.3s';
                                div.style.opacity = '0';
                                div.style.maxHeight = '0';
                                div.style.overflow = 'hidden';
                                setTimeout(() => div.remove(), 300);
                            } else {
                                this.innerText = '🗑️ 重试';
                                this.disabled = false;
                                cAlert('❌ 删除失败:' + res?.error);
                            }
                        });
                    } else {
                        chrome.runtime.sendMessage({ type: 'DELETE_MULTIPLE_BOOKMARKS', bookmarkIds: bmIds }, async (res) => {
                            if (res && res.success) {
                                delete window.currentDrafts[folderName];
                                div.style.transition = 'opacity 0.3s, max-height 0.3s';
                                div.style.opacity = '0';
                                div.style.maxHeight = '0';
                                div.style.overflow = 'hidden';
                                setTimeout(() => div.remove(), 300);
                            } else {
                                this.innerText = '🗑️ 重试';
                                this.disabled = false;
                                cAlert('❌ 删除失败:' + res?.error);
                            }
                        });
                    }
                }
            });
        }

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
                
                ${data.meta.mediaUrl ? `
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

                // Clear xListPane
                xListPane.innerHTML = '';

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
                    return `
                        <div class="bm-row" style="background: white; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); flex-direction: row; align-items: center; justify-content: space-between;">
                            <div style="flex: 1; min-width: 0;">
                                <a href="${escapeHtml(b.url)}" target="_blank" class="bm-title" style="font-size: 15px; color: #1e40af; text-decoration: none; font-weight: 600;">${escapeHtml(b.title || '无标题')}</a>
                                <div class="bm-url" style="margin-top: 6px; font-size: 13px; color: #64748b;">${escapeHtml(b.url)}</div>
                            </div>
                            <div style="text-align: right; margin-left: 15px;">
                                <span style="font-size: 12px; font-weight: bold; color: ${p >= 80 ? '#047857' : (p >= 60 ? '#b45309' : '#475569')}; background: ${p >= 80 ? '#d1fae5' : (p >= 60 ? '#fef3c7' : '#f1f5f9')}; padding: 4px 8px; border-radius: 4px; border: 1px solid ${p >= 80 ? '#34d399' : (p >= 60 ? '#fcd34d' : '#cbd5e1')};">契合度 ${p}%</span>
                            </div>
                        </div>
                    `;
                }).join('');

                if (res.results.length === 0) {
                    searchView.innerHTML = `<div style="text-align: center; padding: 60px; color: #64748b; font-size: 15px;">未找到相关结果，您的表达太个性化，还是模型太笨啦？尝试换个说法吧～</div>`;
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

    loadData();
});
