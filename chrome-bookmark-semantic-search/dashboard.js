document.addEventListener('DOMContentLoaded', () => {
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

    const forceReinitBtn = document.getElementById('forceReinitBtn');
    if (forceReinitBtn) {
        forceReinitBtn.addEventListener('click', async () => {
            const confirmed = await cConfirm('<b>警告：这将会完全清除当前的模型缓存和所有已计算完成的书签嵌入特征，并触发重置。</b><br><br>系统将会清除本地引擎特征索引，并迫使浏览器重新使用 BGE-Small-ZH 模型重新处理你库里那 1000 多条书签。<br><br>确定要执行硬重启吗？', '⚠️ 危险操作');
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

            // --- 渲染推特专属视图（仅在未进行过聚类时渲染原始列表）---
            if (xViewEl && !xViewEl.querySelector('.folder-item')) {
                xViewEl.innerHTML = '';
                if (xCount === 0) {
                    xViewEl.innerHTML = `
                        <div style="text-align: center; padding: 60px; color: #64748b;">
                            <div style="font-size: 40px; margin-bottom: 20px;">🐦</div>
                            <div>你还没有同步过推特知识库哦。<br><br>点击右上角的蓝色按钮去同步吧！</div>
                        </div>`;
                } else {
                    xViewEl.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #64748b;">
                            <div style="font-size: 30px; margin-bottom: 15px;">📊</div>
                            <div>共有 <b>${xCount}</b> 条推特书签。<br><br>点击上方 <b>🔮 基于大模型生成虚拟分类树</b> 按钮开始智能聚类。</div>
                        </div>`;
                }
            }
        });
    }

    const categorizeTwitterBtn = document.getElementById('categorizeTwitterBtn');
    const twitterCategorizeStatus = document.getElementById('twitterCategorizeStatus');

    // --- 全局状态：当前用户文件夹分配 (folderName -> [bookmarkId]) ---
    let currentUserFolders = {};

    function persistUserFolders() {
        console.log('📤 [Dashboard] 正在保存 userFolders:', JSON.stringify(currentUserFolders));
        chrome.runtime.sendMessage({ type: 'SAVE_TWITTER_FOLDERS', folders: currentUserFolders }, (res) => {
            console.log('📤 [Dashboard] 保存结果:', res);
        });
    }

    function renderTwitterFolderSection(categoryName, bookmarks, isUserFolder, containerEl) {
        const div = document.createElement('div');
        div.className = 'folder-item';
        const bmIds = bookmarks.map(b => b.id);
        const borderColor = isUserFolder ? '#3b82f6' : '#10b981';
        const badge = isUserFolder ? '📌 用户文件夹' : '🤖 自动聚类';

        let bmsHtml = bookmarks.length > 0 ? `<div class="dt-wrapper">
            <table class="dt-table">
                <thead>
                    <tr>
                        <th style="width: 40px; text-align:center;">#</th>
                        <th style="width: 20%;">用户</th>
                        <th style="width: 35%;">推文</th>
                        <th style="width: 80px; text-align:center;">媒体</th>
                        <th style="width: 80px; text-align:center;">浏览量</th>
                        <th style="width: 80px; text-align:center;">转发数</th>
                        <th style="width: 80px; text-align:center;">点赞数</th>
                        <th style="width: 100px; text-align:center;">操作</th>
                    </tr>
                </thead>
                <tbody>` + bookmarks.map((b, i) => {
            let author = '未知作者', text = b.title;
            let meta = { retweets: '-', likes: '-', views: '-', mediaUrl: '' };

            // 尝试提取隐藏的 JSON 元数据
            const metaMatch = b.title.match(/\u200B({.*?})\u200B$/);
            if (metaMatch) {
                try {
                    meta = JSON.parse(metaMatch[1]);
                    text = text.replace(/\u200B{.*?}\u200B$/, ''); // 从展示标题中抹除
                } catch (e) { }
            }

            const match = text.match(/\[X推文\]\s*(.*?):\s*(.*)/);
            if (match) { author = match[1]; text = match[2]; }

            // Extract handle
            let handle = '';
            const handleMatch = b.url.match(/https?:\/\/(?:twitter|x)\.com\/([^\/]+)/i);
            if (handleMatch) handle = handleMatch[1];

            const avatarUrl = handle ? `https://unavatar.io/twitter/${handle}?fallback=false` : '';
            const isMedia = (text === '图片/视频推文' || text === '图片/视频推文...' || text === '图片/视频推文 ...' || text.length < 5);

            return `
                <tr>
                    <td style="color:#555; text-align:center; font-family:monospace;">${i + 1}</td>
                    <td>
                        <div class="dt-author">
                            ${avatarUrl ? `<img src="${avatarUrl}" class="dt-avatar" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
                            <div class="dt-avatar" style="${avatarUrl ? 'display:none;' : ''}">${author.charAt(0).toUpperCase()}</div>
                            <div class="dt-author-info">
                                <span class="dt-name">${escapeHtml(author)}</span>
                                ${handle ? `<span class="dt-handle">@${escapeHtml(handle)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="dt-text">${escapeHtml(text)}</div>
                        <a href="${escapeHtml(b.url)}" target="_blank" style="color:#3b82f6; font-size:12px; margin-top:8px; display:inline-block; text-decoration:none;">查看原推 ↗</a>
                    </td>
                    <td style="text-align:center;">
                        ${meta.mediaUrl ? `<img src="${meta.mediaUrl}" style="height:48px; border-radius:4px; object-fit:cover; border:1px solid #333;" />` : (isMedia ? `<div class="dt-media-box" style="margin:0 auto;">🖼️</div>` : `<span style="color:#333;">-</span>`)}
                    </td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.views}</td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.retweets}</td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.likes}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-dispatch" data-id="${b.id}" style="padding: 4px 10px; font-size: 12px; background: #3b82f6;">🪄 移动</button>
                    </td>
                </tr>`;
        }).join('') + `</tbody></table></div>` : `<div style="padding: 20px; color: #888;">暂无推文</div>`;

        div.innerHTML = `
            <div class="folder-title" style="background: white; border-bottom: 2px solid #e2e8f0; border-left: 4px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span class="folder-name-text">📁 ${escapeHtml(categoryName)}</span>
                    <span class="folder-status">${bookmarks.length} 条</span>
                    <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${isUserFolder ? '#dbeafe' : '#d1fae5'}; color:${isUserFolder ? '#1d4ed8' : '#065f46'};">${badge}</span>
                </div>
                <div style="display:flex; gap: 8px;">
                    <button class="btn btn-rename" data-oldname="${escapeHtml(categoryName)}" style="padding: 4px 8px; font-size: 12px; background: #f59e0b;">✏️ 改名</button>
                    ${!isUserFolder ? `<button class="btn btn-pin-folder" data-name="${escapeHtml(categoryName)}" data-ids='${JSON.stringify(bmIds)}' style="padding: 4px 8px; font-size: 12px; background: #6366f1;">📌 固定此分类</button>` : ''}
                    ${isUserFolder ? `<button class="btn btn-delete-folder" data-name="${escapeHtml(categoryName)}" style="padding: 4px 8px; font-size: 12px; background: #ef4444;">🗑️ 删除</button>` : ''}
                    <button class="btn btn-sync-folder" data-name="${escapeHtml(categoryName)}" data-ids='${JSON.stringify(bmIds)}' style="padding: 4px 8px; font-size: 12px; background: #10b981;">📤 归档库同步</button>
                </div>
            </div>
            <div class="folder-content" style="background: #000; padding: 20px;">
                ${bmsHtml}
            </div>`;

        // Rename
        div.querySelector('.btn-rename').addEventListener('click', async function (e) {
            console.log('🟡 [Rename] 按钮被点击');
            e.stopPropagation();
            const oldName = this.getAttribute('data-oldname');
            console.log('🟡 [Rename] oldName:', oldName);
            const newName = await cPrompt('给这批推文文件夹起个名字：', oldName);
            console.log('🟡 [Rename] cPrompt返回:', newName);
            if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
                const trimmed = newName.trim();
                div.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed);
                div.querySelectorAll('[data-name]').forEach(el => el.setAttribute('data-name', trimmed));
                this.setAttribute('data-oldname', trimmed);
                if (currentUserFolders[oldName]) {
                    currentUserFolders[trimmed] = currentUserFolders[oldName];
                    delete currentUserFolders[oldName];
                } else {
                    currentUserFolders[trimmed] = bmIds;
                }
                console.log('🟡 [Rename] 即将调用 persistUserFolders, currentUserFolders:', JSON.stringify(currentUserFolders));
                persistUserFolders();
                await cAlert('✅ 已重命名为 <b>' + escapeHtml(trimmed) + '</b>，并已固定。<br>下次重新聚类时，这些推文会保持在这个文件夹里。');
            }
        });

        // Pin / Unpin toggle
        const pinBtn = div.querySelector('.btn-pin-folder');
        if (pinBtn) {
            pinBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const folderName = this.getAttribute('data-name');
                const ids = JSON.parse(this.getAttribute('data-ids'));
                const isPinned = this.getAttribute('data-pinned') === 'true';
                if (isPinned) {
                    // 取消固定
                    delete currentUserFolders[folderName];
                    persistUserFolders();
                    this.setAttribute('data-pinned', 'false');
                    this.innerText = '📌 固定此分类';
                    this.style.background = '#6366f1';
                } else {
                    // 固定
                    currentUserFolders[folderName] = ids;
                    persistUserFolders();
                    this.setAttribute('data-pinned', 'true');
                    this.innerText = '🔓 取消固定';
                    this.style.background = '#94a3b8';
                }
            });
        }

        // Delete folder (user folders only)
        const deleteBtn = div.querySelector('.btn-delete-folder');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const folderName = this.getAttribute('data-name');
                const confirmed = await cConfirm(`确定要删除文件夹 <b>${escapeHtml(folderName)}</b> 吗？<br><br>里面的推文不会被删除，下次聚类时会重新参与自动分配。`);
                if (confirmed) {
                    delete currentUserFolders[folderName];
                    persistUserFolders();
                    div.style.transition = 'opacity 0.3s, max-height 0.3s';
                    div.style.opacity = '0';
                    div.style.maxHeight = '0';
                    div.style.overflow = 'hidden';
                    setTimeout(() => div.remove(), 300);
                }
            });
        }

        // Sync folder
        div.querySelector('.btn-sync-folder').addEventListener('click', async function (e) {
            e.stopPropagation();
            const folderName = this.getAttribute('data-name');
            const ids = JSON.parse(this.getAttribute('data-ids'));
            const confirmed = await cConfirm(`此操作将在 Chrome 中创建名为 <b>${escapeHtml(folderName)}</b> 的真实书签文件夹，放到【其他书签 > 🐦 Twitter/X 书签】下。<br><br>将移入 ${ids.length} 条记录。`);
            if (!confirmed) return;
            const btn = this;
            btn.innerText = '⏳ 归档中...';
            btn.disabled = true;
            chrome.runtime.sendMessage({ type: 'SYNC_TWITTER_FOLDER_TO_CHROME', folderName, bookmarkIds: ids }, async (res) => {
                if (res && res.success) {
                    delete currentUserFolders[folderName];
                    persistUserFolders();
                    await cAlert(`✅ 成功归档 <b>${res.moved}</b> 条推文到系统书签库！<br>请点击【🔄 刷新数据】载入最新结构。`);
                    btn.innerText = '✅ 已归档';
                } else {
                    await cAlert('❌ 同步失败: ' + (res?.error || '未知错误'));
                    btn.innerText = '📤 同步重试';
                    btn.disabled = false;
                }
            });
        });

        // Folder toggle
        div.querySelector('.folder-title').addEventListener('click', function (e) {
            if (e.target.tagName.toLowerCase() === 'button') return;
            this.nextElementSibling.classList.toggle('open');
        });

        // Single dispatch
        div.querySelectorAll('.btn-dispatch').forEach(btn => {
            btn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                this.innerText = '⏳ 匹配中...';
                this.disabled = true;
                chrome.runtime.sendMessage({ type: 'SMART_DISPATCH_SINGLE_TWITTER', bookmarkId: id }, async (res) => {
                    if (res && res.success) {
                        const p = Math.round(res.confidence * 100);
                        const confirmed = await cConfirm(`🎯 <b>语义匹配成功！</b><br><br>系统判定它最适合主库现有的：<br>📁 <b style="color:#3b82f6;">${res.suggestedFolder}</b> (${p}% 契合度)<br><br>是否同意派发？`);
                        if (confirmed) {
                            chrome.runtime.sendMessage({ type: 'MOVE_BOOKMARK', bookmarkId: id, parentId: res.suggestedFolderId }, async (mv) => {
                                if (mv && mv.success) {
                                    await cAlert('✅ 派发成功，已下沉至主库。');
                                    this.closest('.x-card').style.opacity = '0.4';
                                    this.innerText = '✅ 已派发';
                                } else {
                                    await cAlert('❌ 移动失败：' + mv?.error);
                                    this.innerText = '🪄 重试';
                                    this.disabled = false;
                                }
                            });
                        } else {
                            this.innerText = '🪄 智能移动到主书签';
                            this.disabled = false;
                        }
                    } else {
                        await cAlert('❌ 匹配落选：' + (res?.error || '未知错误'));
                        this.innerText = '🪄 智能移动到主书签';
                        this.disabled = false;
                    }
                });
            });
        });

        containerEl.appendChild(div);
    }

    if (categorizeTwitterBtn) {
        categorizeTwitterBtn.addEventListener('click', () => {
            categorizeTwitterBtn.innerText = '🧠 正在进行深度语义归类...';
            categorizeTwitterBtn.disabled = true;
            twitterCategorizeStatus.style.display = 'block';
            twitterCategorizeStatus.innerHTML = '正在用 BGE 端侧大模型提取特征并聚类。已固定的文件夹不会受影响...';

            chrome.runtime.sendMessage({ type: 'CLUSTER_TWITTER_BOOKMARKS' }, (res) => {
                categorizeTwitterBtn.innerText = '🔮 重新提取特征并聚类';
                categorizeTwitterBtn.disabled = false;

                if (!res || !res.success) {
                    twitterCategorizeStatus.innerHTML = `❌ 分析失败: ${res?.error || '未知错误'}`;
                    return;
                }

                twitterCategorizeStatus.style.display = 'none';
                xViewEl.innerHTML = '';

                // "新建文件夹"按钮
                const addFolderBtn = document.createElement('button');
                addFolderBtn.className = 'btn';
                addFolderBtn.style.cssText = 'background: #6366f1; margin-bottom: 15px;';
                addFolderBtn.innerHTML = '➕ 新建空白文件夹';
                addFolderBtn.addEventListener('click', async () => {
                    console.log('🟢 [NewFolder] 按钮被点击');
                    const folderName = await cPrompt('新文件夹名称：', '', '➕ 新建文件夹');
                    console.log('🟢 [NewFolder] cPrompt返回:', folderName);
                    if (folderName && folderName.trim()) {
                        const trimmed = folderName.trim();
                        currentUserFolders[trimmed] = currentUserFolders[trimmed] || [];
                        console.log('🟢 [NewFolder] 即将保存, currentUserFolders:', JSON.stringify(currentUserFolders));
                        persistUserFolders();
                        renderTwitterFolderSection(trimmed, [], true, xViewEl);
                        await cAlert('✅ 已创建空白文件夹 <b>' + escapeHtml(trimmed) + '</b>。<br>你可以把下方推文通过"智能移动"或手动操作派发进去。');
                    }
                });
                xViewEl.appendChild(addFolderBtn);

                const userFolders = res.userFolders || {};
                const autoClusters = res.autoClusters || {};

                // 同步最新的 userFolders 记录（ID 层）
                currentUserFolders = {};
                for (const [name, bms] of Object.entries(userFolders)) {
                    currentUserFolders[name] = bms.map(b => b.id);
                }

                // 先渲染用户固定的文件夹
                for (const [name, bms] of Object.entries(userFolders)) {
                    renderTwitterFolderSection(name, bms, true, xViewEl);
                }

                // 再渲染自动聚类结果
                for (const [name, bms] of Object.entries(autoClusters)) {
                    renderTwitterFolderSection(name, bms, false, xViewEl);
                }
            });
        });
    }

    loadData();
});

