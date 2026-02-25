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

    // --- 全局状态：当前待保存的聚类草稿 (folderName -> [bookmarkId]) ---
    window.currentDrafts = {};

    function renderTwitterFolderSection(categoryName, bookmarks, isUserFolder, containerEl) {
        const div = document.createElement('div');
        div.className = 'folder-item';
        const bmIds = bookmarks.map(b => b.id);
        const borderColor = isUserFolder ? '#10b981' : '#f59e0b';
        const badge = isUserFolder ? '已保存' : '待保存草稿';

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
                        ${meta.mediaUrl ? `<img src="${meta.mediaUrl}" style="height:48px; border-radius:4px; object-fit:cover; border:1px solid #e2e8f0;" />` : (isMedia ? `<div class="dt-media-box" style="margin:0 auto;">🖼️</div>` : `<span style="color:#94a3b8;">-</span>`)}
                    </td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.views}</td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.retweets}</td>
                    <td class="dt-stats" style="text-align:center; color:#94a3b8;">${meta.likes}</td>
                    <td style="text-align:center;">
                        <button class="btn btn-dispatch" data-id="${b.id}" style="padding: 4px 10px; font-size: 12px; background: #3b82f6;">🪄 移动</button>
                        <button class="btn btn-delete-bm" data-id="${b.id}" style="padding: 4px 10px; font-size: 12px; background: #ef4444; margin-top: 4px;">🗑️ 删除</button>
                    </td>
                </tr>`;
        }).join('') + `</tbody></table></div>` : `<div style="padding: 20px; color: #888;">暂无推文</div>`;

        div.innerHTML = `
            <div class="folder-title" style="background: white; border-bottom: 2px solid #e2e8f0; border-left: 4px solid ${borderColor}; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span class="folder-name-text" style="${isUserFolder ? 'font-weight:bold; color:#065f46;' : 'font-weight:bold; color:#b45309;'}">📁 ${escapeHtml(categoryName)}</span>
                    <span class="folder-status">${bookmarks.length} 条</span>
                    <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${isUserFolder ? '#d1fae5' : '#fef3c7'}; color:${isUserFolder ? '#065f46' : '#b45309'};">${badge}</span>
                </div>
                <div style="display:flex; gap: 8px;">
                    <button class="btn btn-rename" data-oldname="${escapeHtml(categoryName)}" data-isuser="${isUserFolder}" style="padding: 4px 8px; font-size: 12px; background: #3b82f6;">✏️ ${isUserFolder ? '改名' : '改草稿名'}</button>
                    ${isUserFolder ? `<button class="btn btn-save-rename" data-oldname="${escapeHtml(categoryName)}" data-actual-old="${escapeHtml(categoryName)}" style="display:none; padding: 4px 8px; font-size: 12px; background: #10b981;">💾 保存编辑</button>` : ''}
                    ${!isUserFolder ? `<button class="btn btn-sync-folder" data-name="${escapeHtml(categoryName)}" data-ids='${JSON.stringify(bmIds)}' style="padding: 4px 8px; font-size: 12px; background: #10b981;">💾 保存到浏览器</button>` : ''}
                    <button class="btn btn-delete-folder" data-name="${escapeHtml(categoryName)}" data-isuser="${isUserFolder}" style="padding: 4px 8px; font-size: 12px; background: #ef4444;">🗑️ 删除</button>
                </div>
            </div>
            <div class="folder-content" style="background: #f8fafc; padding: 20px;">
                ${bmsHtml}
            </div>`;

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
                        div.querySelector('.folder-name-text').innerHTML = '📁 ' + escapeHtml(trimmed) + ' <span style="color:#f59e0b;font-size:12px;">(📝 待保存新名称)</span>';

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
                        this.innerText = '💾 保存编辑';
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
                        btn.innerText = '✅ 已归档';
                        btn.style.background = '#10b981';
                        await cAlert(`✅ 成功保存！点击【刷新数据】可阅览。`);
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

        // Delete individual bookmark
        div.querySelectorAll('.btn-delete-bm').forEach(btn => {
            btn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                const confirmed = await cConfirm(`确定要永久删除这条推文书签吗？<br><br>这将在浏览器中真实地将其抹除！`);
                if (confirmed) {
                    this.innerText = '⏳ 此条删除中..';
                    this.disabled = true;
                    chrome.runtime.sendMessage({ type: 'DELETE_BOOKMARK', bookmarkId: id }, async (res) => {
                        if (res && res.success) {
                            const tr = this.closest('tr');
                            tr.style.opacity = '0';
                            setTimeout(() => tr.remove(), 300);
                        } else {
                            await cAlert('❌ 删除失败：' + mv?.error);
                            this.innerText = '🗑️ 重试';
                            this.disabled = false;
                        }
                    });
                }
            });
        });

        // Delete folder
        const deleteBtn = div.querySelector('.btn-delete-folder');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                const folderName = this.getAttribute('data-name');
                const isUserF = this.getAttribute('data-isuser') === 'true';

                const confirmed = await cConfirm(`确定要彻底删除 ${isUserF ? '已保存分类' : '临时草稿'} <b>${escapeHtml(folderName)}</b> 及里面所有的推文吗？<br><br><b>警告：这会导致这些书签从 Chrome 浏览器里被永久抹除！下次聚类也不会再出现。</b>`);
                if (confirmed) {
                    if (isUserF) {
                        this.innerText = '⏳ 删除中...';
                        this.disabled = true;
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
                        this.innerText = '⏳ 删除中...';
                        this.disabled = true;
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

                // 统一控制栏
                const controlBar = document.createElement('div');
                controlBar.style.cssText = 'display: flex; gap: 10px; margin-bottom: 20px;';

                const addFolderBtn = document.createElement('button');
                addFolderBtn.className = 'btn';
                addFolderBtn.style.cssText = 'background: #6366f1;';
                addFolderBtn.innerHTML = '➕ 新建空白文件夹';
                addFolderBtn.addEventListener('click', async () => {
                    const folderName = await cPrompt('新文件夹名称：', '', '➕ 新建草稿文件夹');
                    if (folderName && folderName.trim()) {
                        const trimmed = folderName.trim();
                        window.currentDrafts[trimmed] = window.currentDrafts[trimmed] || [];
                        renderTwitterFolderSection(trimmed, [], false, xViewEl);
                    }
                });

                const saveAllBtn = document.createElement('button');
                saveAllBtn.className = 'btn';
                saveAllBtn.style.cssText = 'background: #ef4444;';
                saveAllBtn.innerHTML = '💾 一键保存';
                saveAllBtn.addEventListener('click', async () => {
                    if (Object.keys(window.currentDrafts || {}).length === 0 && Object.keys(window.pendingRenames || {}).length === 0) {
                        return cAlert('没有需要保存的草稿或修改。');
                    }
                    saveAllBtn.innerText = '⏳ 保存中...';
                    saveAllBtn.disabled = true;
                    chrome.runtime.sendMessage({ type: 'SYNC_MULTIPLE_TWITTER_FOLDERS', folders: window.currentDrafts, renames: window.pendingRenames }, async (res) => {
                        if (res && res.success) {
                            window.currentDrafts = {};
                            window.pendingRenames = {};
                            saveAllBtn.innerText = '✅ 全部保存成功';
                            saveAllBtn.style.background = '#10b981';
                            document.querySelectorAll('.btn-save-rename').forEach(b => b.style.display = 'none');
                            await cAlert(`✅ 全部草稿和修改已同步到浏览器中！<br>请点击【刷新数据】加载最新结构。`);
                        } else {
                            await cAlert('❌ 批量保存失败: ' + (res?.error || '未知错误'));
                            saveAllBtn.innerText = '💾 一键保存';
                            saveAllBtn.disabled = false;
                        }
                    });
                });

                controlBar.appendChild(addFolderBtn);
                controlBar.appendChild(saveAllBtn);
                xViewEl.appendChild(controlBar);

                const userFolders = res.userFolders || {};
                const autoClusters = res.autoClusters || {};

                // 赋予 currentDrafts (保存由 AI 聚类出来或者吸引出来的 draft IDs)
                window.currentDrafts = {};
                for (const [name, bms] of Object.entries(autoClusters)) {
                    if (name.includes('📌 未归类推文')) continue; // 未归类的不主动存成 drafts 防止全部平铺放入一个名叫未归类的文件夹
                    window.currentDrafts[name] = bms.map(b => b.id);
                }

                // 渲染自动聚类结果 (草稿)
                for (const [name, bms] of Object.entries(autoClusters)) {
                    renderTwitterFolderSection(name, bms, false, xViewEl);
                }

                // 渲染原生浏览器里已存在的文件夹
                if (Object.keys(userFolders).length > 0) {
                    const existingHeader = document.createElement('div');
                    existingHeader.innerHTML = '<hr style="margin:20px 0;"><h3 style="margin-bottom:15px; color:#065f46;">🌐 浏览器已存在的分类：</h3>';
                    xViewEl.appendChild(existingHeader);

                    for (const [name, bms] of Object.entries(userFolders)) {
                        renderTwitterFolderSection(name, bms, true, xViewEl);
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
