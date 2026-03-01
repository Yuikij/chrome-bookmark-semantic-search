// Chrome Extension Background Script - Service Worker
// 使用 Offscreen Document 运行语义搜索引擎

// 导入 Twitter GraphQL API 抓取模块
importScripts('twitter_api.js');

console.log('🚀 Background Service Worker 启动（Offscreen Document 模式）');

// Twitter GraphQL API 抓取器实例（替代原有的 DOM 滚动抓取）
const twitterFetcher = new TwitterBookmarkFetcher();

// --- 统一文案配置 (UI & 文件夹名称常量) ---
const UI_TEXTS = {
  TWITTER_ROOT: '🐦 Twitter/X 书签',
  TRASH_FOLDER: '🗑️ 回收站',
  BOOKMARK_BAR: '书签栏',
  OTHER_BOOKMARKS: '其他书签',
  MOBILE_BOOKMARKS: 'Mobile bookmarks',
  TWITTER_PREFIX: '[X推文]',
  ATTRACTED_PREFIX: '🤖 汇入: ',
  TOPIC_PREFIX: '🔸 议题：',
  MISC_DISCUSSION: '🔸 深度讨论集 (杂项)',
  SERIES_SUFFIX: ' (系列)',
  DUPLICATE_SUFFIX: '+',
  UNCLASSIFIED_MISC: '📌 零星议题 / 杂谈',
  MEDIA_COLLECTION: '🖼️ 影像 / 链接转发集'
};

// --- 回收站辅助函数 (hoisted，供所有 handler 调用) ---
async function getTrashFolder() {
  let foldersTree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
  let root = foldersTree[0];
  let trashFolder = null;
  const traverseAndFind = (nodes) => {
    for (let node of nodes) {
      if (node.title === UI_TEXTS.TRASH_FOLDER && !node.url && !trashFolder) {
        trashFolder = node;
      }
      if (node.children) traverseAndFind(node.children);
    }
  };
  traverseAndFind(root.children);

  if (!trashFolder) {
    let otherBookmarks = root.children.find(c => c.id === '2' || c.title === '其他书签' || c.title === 'Other bookmarks') || root.children[root.children.length - 1];
    trashFolder = await new Promise(resolve => {
      chrome.bookmarks.create({ parentId: otherBookmarks.id, title: UI_TEXTS.TRASH_FOLDER }, resolve);
    });
  }
  return trashFolder;
}

async function moveToTrash(bookmarkId, trashFolderCache = null, metaCache = null) {
  const bm = await new Promise(resolve => chrome.bookmarks.get(bookmarkId, res => resolve(res ? res[0] : null)));
  if (!bm) return metaCache;

  const trash = trashFolderCache || await getTrashFolder();
  if (bm.parentId === trash.id) return metaCache; // 已经在回收站内

  // 记录原始路径
  const meta = metaCache || (await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve))).TRASH_META || {};
  meta[bookmarkId] = bm.parentId;

  // 如果没有传入缓存，说明是单条操作，立即写入
  if (!metaCache) {
    await new Promise(resolve => chrome.storage.local.set({ TRASH_META: meta }, resolve));
  }

  await new Promise((resolve, reject) => {
    chrome.bookmarks.move(bookmarkId, { parentId: trash.id }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });

  return meta;
}

// Offscreen Document 管理
class OffscreenManager {
  constructor() {
    this.creating = null;
    this.isCreated = false;
  }

  async setupOffscreenDocument() {
    // 避免重复创建
    if (this.creating) {
      await this.creating;
      return;
    }

    if (this.isCreated) {
      return;
    }

    // 检查是否已经存在全局的 Offscreen Document (应对 Service Worker 重启导致的状态丢失)
    try {
      if (await chrome.offscreen.hasDocument()) {
        this.isCreated = true;
        return;
      }
    } catch (e) {
      // 兼容某些不支持 hasDocument 的较老版本 API
    }

    this.creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run ML models (ONNX Runtime + Transformers.js) for semantic bookmark search'
    });

    try {
      await this.creating;
      this.creating = null;
      this.isCreated = true;
      console.log('✅ Offscreen Document 已创建');
    } catch (error) {
      console.error('❌ 创建 Offscreen Document 失败:', error);
      this.creating = null;
      throw error;
    }
  }

  async sendMessage(message) {
    await this.setupOffscreenDocument();

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

const offscreenManager = new OffscreenManager();

// 语义搜索引擎（代理到 Offscreen Document）
class SemanticSearchEngine {
  constructor() {
    this.isInitialized = false;
    this.embeddings = new Map(); // bookmarkId → embedding array
    this.bookmarkData = new Map(); // bookmarkId → bookmark info
    this.initProgress = { current: 0, total: 0, status: 'ready' };
    this.dbPromise = null;
    this.initializationPromise = null;
  }

  // 确保引擎已初始化，若未初始化则自动触发并等待
  async ensureInitialized() {
    if (this.isInitialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
  }

  async initialize() {
    try {
      console.log('🚀 开始初始化语义搜索引擎...');
      this.initProgress.status = 'loading_model';

      // 初始化 Offscreen Document 中的模型
      const response = await offscreenManager.sendMessage({
        type: 'OFFSCREEN_INITIALIZE'
      });

      if (!response.success) {
        throw new Error(response.error || '初始化失败');
      }

      console.log('✅ Offscreen Document 模型加载完成');

      // 获取所有书签
      this.initProgress.status = 'loading_bookmarks';
      const bookmarks = await this.getAllBookmarks();
      this.initProgress.total = bookmarks.length;
      console.log(`📚 找到 ${bookmarks.length} 个书签`);

      // 计算书签签名
      const signature = await this.computeBookmarksSignature(bookmarks);
      console.log(`🔑 书签签名: ${signature}`);

      // 尝试从缓存加载
      const loadResult = await this.loadEmbeddings(signature, bookmarks);

      if (loadResult.loaded) {
        this.isInitialized = true;
        this.initProgress.status = 'completed';
        this.initProgress.current = this.initProgress.total;
        console.log('✅ 已从缓存加载语义索引');
        return true;
      }

      // 检查增量更新
      if (loadResult.canIncremental) {
        console.log(`🔄 增量更新: 新增 ${loadResult.added.length}, 删除 ${loadResult.removed.length}`);
        await this.incrementalUpdate(loadResult.added, loadResult.removed, bookmarks);
        await this.saveEmbeddings(signature);

        this.isInitialized = true;
        this.initProgress.status = 'completed';
        this.initProgress.current = this.initProgress.total;
        console.log('✅ 增量更新完成');
        return true;
      }

      // 完全重建索引
      console.log('🔨 构建全新的语义索引...');
      this.initProgress.status = 'building_index';

      await this.buildEmbeddings(bookmarks);
      await this.saveEmbeddings(signature);

      this.isInitialized = true;
      this.initProgress.status = 'completed';
      this.initProgress.current = this.initProgress.total;
      console.log('✅ 语义索引构建完成');

      return true;
    } catch (error) {
      console.error('❌ 初始化失败:', error);
      this.initProgress.status = 'error';
      throw error;
    }
  }

  // --- 优化1：URL 清洗策略与构建富文本 ---
  cleanUrlForSemantic(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      let clean = parsed.hostname + ' ' + parsed.pathname;
      clean = clean.replace(/www\.|com|org|net|html|php/g, ' ')
        .replace(/[-_./?=&+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return clean;
    } catch (e) {
      return url.replace(/[-_./?=&+]/g, ' ');
    }
  }

  buildSemanticText(bm) {
    let title = bm.title || '';
    // 去除书签标题中隐藏的 JSON 元数据（以零宽字符 \u200B 包裹的部分），防污染向量
    title = title.replace(/\u200B.*?\u200B/g, '').trim();

    let cleanUrl = this.cleanUrlForSemantic(bm.url);
    // 对于 Twitter 短信内容，URL 中的大量数字 ID 和用户名实际上对语义干扰很大，尽量弱化或不放进去
    if (bm.url && (bm.url.includes('x.com/') || bm.url.includes('twitter.com/'))) {
      cleanUrl = ''; // 不使用 Twitter URL 参与语义编码
    }

    // 为后期的"自动分类"打下基础：利用当前的文件夹路径作为强语义特征
    const folder = bm.folderPath && !bm.folderPath.includes('Twitter/X 书签') ? `[📁 ${bm.folderPath}]` : '';
    // 将来如果有网页正文抓取功能，可追加到此处
    return `${title} ${cleanUrl} ${folder}`.trim();
  }

  // --- 优化2：Hybrid Search (混合检索) ---
  computeKeywordScore(query, title, urlText) {
    if (!query) return 0;
    const qLower = query.toLowerCase();
    const tLower = (title || '').toLowerCase();
    const uLower = (urlText || '').toLowerCase();

    // 如果标题完全包含，给予极高分
    if (tLower.includes(qLower)) return 1.0;

    // 分词匹配
    const tokens = qLower.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return 0;

    let matchCount = 0;
    for (const token of tokens) {
      if (tLower.includes(token) || uLower.includes(token)) {
        matchCount++;
      }
    }
    return matchCount / tokens.length;
  }

  async buildEmbeddings(bookmarks) {
    this.embeddings.clear();
    this.bookmarkData.clear();

    // 准备富文本内容
    const texts = bookmarks.map(bm => this.buildSemanticText(bm));

    console.log(`📊 开始编码 ${texts.length} 个书签...`);

    // 批量编码（委托给 Offscreen Document）
    const response = await offscreenManager.sendMessage({
      type: 'OFFSCREEN_EMBED_BATCH',
      texts: texts
    });

    if (!response.success) {
      throw new Error(response.error || '批量编码失败');
    }

    const embeddings = response.embeddings;

    // 存储结果
    bookmarks.forEach((bm, i) => {
      this.embeddings.set(bm.id, embeddings[i]);
      this.bookmarkData.set(bm.id, {
        id: bm.id,
        title: bm.title,
        url: bm.url,
        folderPath: bm.folderPath,
        parentId: bm.parentId,
        dateAdded: bm.dateAdded
      });
      this.initProgress.current = i + 1;
    });

    console.log(`✅ 成功编码 ${embeddings.length} 个书签`);
  }

  async searchBookmarks(query, topK = 20) {
    if (!this.isInitialized) {
      await this.ensureInitialized();
    }

    console.log('🔍 ===== 开始语义搜索 =====');
    console.log('📝 查询文本:', query);
    console.log('📚 书签总数:', this.embeddings.size);

    // 编码查询文本（委托给 Offscreen Document）
    console.log('🧠 正在使用 Sentence-BERT 编码查询文本...');
    const startTime = Date.now();

    const response = await offscreenManager.sendMessage({
      type: 'OFFSCREEN_EMBED_TEXT',
      text: query
    });

    if (!response.success) {
      throw new Error(response.error || '查询编码失败');
    }

    const queryEmbedding = response.embedding;
    const encodeTime = Date.now() - startTime;

    console.log('✅ 查询编码完成，耗时:', encodeTime + 'ms');
    console.log('📊 查询向量维度:', queryEmbedding.length);
    console.log('🔢 查询向量（前10维）:', queryEmbedding.slice(0, 10).map(v => v.toFixed(4)));

    // 计算相似度
    console.log('🧮 计算余弦相似度...');
    const calcStart = Date.now();
    const results = [];

    for (const [bookmarkId, embedding] of this.embeddings.entries()) {
      const vectorScore = this.cosineSimilarity(queryEmbedding, embedding);
      const bookmark = this.bookmarkData.get(bookmarkId);

      // 关键词匹配得分 (利用清洗后的URL)
      const cleanUrl = this.cleanUrlForSemantic(bookmark.url);
      const keywordScore = this.computeKeywordScore(query, bookmark.title, cleanUrl);

      // 混合搜索 (Hybrid Search)
      // 综合评分：结合语义和精确匹配 (Vector Score 70% + Keyword Score 30%)
      const finalScore = (vectorScore * 0.7) + (keywordScore * 0.3);

      results.push({
        ...bookmark,
        score: finalScore,
        vectorScore,
        keywordScore
      });
    }

    const calcTime = Date.now() - calcStart;
    console.log('✅ 相似度计算完成，耗时:', calcTime + 'ms');

    // 排序并返回 top-K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    console.log('🎯 ===== 搜索结果 (Top ' + Math.min(topK, results.length) + ') =====');
    topResults.slice(0, 5).forEach((r, i) => {
      console.log(`${i + 1}. [${(r.score * 100).toFixed(2)}%] ${r.title}`);
      console.log(`   URL: ${r.url}`);
    });
    console.log('⏱️  总耗时:', (Date.now() - startTime) + 'ms');
    console.log('🔍 ===== 搜索完成 =====\n');

    return topResults;
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ... 其他辅助方法（getAllBookmarks, computeBookmarksSignature, 等）
  async getAllBookmarks() {
    // 提取书签层级路径（作为未来"自动分类"的先决条件）
    const getAllBookmarksRecursive = (nodes, currentPath = '', parentId = null) => {
      let bookmarks = [];
      for (const node of nodes) {
        // 关键屏蔽：回收站文件夹及其内部的所有内容，彻底阻断其参与检索、聚类、特征提取
        if (node.title === UI_TEXTS.TRASH_FOLDER && !node.url) {
          continue;
        }

        if (node.url) {
          bookmarks.push({ ...node, folderPath: currentPath, parentId: node.parentId });
        }
        if (node.children) {
          const nextPath = currentPath ? `${currentPath} > ${node.title}` : (node.title || '');
          bookmarks = bookmarks.concat(getAllBookmarksRecursive(node.children, nextPath));
        }
      }
      return bookmarks;
    };

    const tree = await chrome.bookmarks.getTree();
    return getAllBookmarksRecursive(tree, '');
  }

  async computeBookmarksSignature(bookmarks) {
    // 使用书签的 id, title, url, folderPath 计算签名 (分类路径改变也会触发更新)
    const dataStr = bookmarks
      .map(bm => `${bm.id}|${bm.title}|${bm.url}|${bm.folderPath || ''}`)
      .sort()
      .join('\n');

    const encoder = new TextEncoder();
    const data = encoder.encode(dataStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async incrementalUpdate(addedBookmarks, removedIds, allBookmarks) {
    // 删除已移除的书签
    for (const id of removedIds) {
      this.embeddings.delete(id);
      this.bookmarkData.delete(id);
    }

    // 为新增书签生成嵌入
    if (addedBookmarks.length > 0) {
      const texts = addedBookmarks.map(bm => this.buildSemanticText(bm));

      const response = await offscreenManager.sendMessage({
        type: 'OFFSCREEN_EMBED_BATCH',
        texts: texts
      });

      if (!response.success) {
        throw new Error(response.error || '增量编码失败');
      }

      const embeddings = response.embeddings;

      addedBookmarks.forEach((bm, i) => {
        this.embeddings.set(bm.id, embeddings[i]);
        this.bookmarkData.set(bm.id, {
          id: bm.id,
          title: bm.title,
          url: bm.url,
          folderPath: bm.folderPath,
          dateAdded: bm.dateAdded
        });
      });
    }
  }

  // IndexedDB 操作
  openDatabase() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('SemanticSearchDB', 2);

      request.onerror = () => {
        console.error('❌ IndexedDB 打开失败:', request.error);
        this.dbPromise = null; // 清除缓存，下次可以重试
        reject(request.error);
      };

      request.onsuccess = () => {
        const db = request.result;
        console.log('✅ IndexedDB 已连接, 版本:', db.version, ', stores:', Array.from(db.objectStoreNames));

        // 监听版本变化事件（当其他标签页升级数据库时）
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
          console.warn('⚠️ IndexedDB 版本已变更，连接已关闭');
        };

        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 IndexedDB 升级中: v' + event.oldVersion + ' → v' + event.newVersion);
        const db = event.target.result;
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings');
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
        if (!db.objectStoreNames.contains('twitterFolders')) {
          db.createObjectStore('twitterFolders');
          console.log('✅ 已创建 twitterFolders store');
        }
      };

      request.onblocked = () => {
        console.warn('⚠️ IndexedDB 升级被阻塞（可能有其他连接未关闭）');
        // 清除旧缓存强制重试
        this.dbPromise = null;
      };
    });

    return this.dbPromise;
  }

  async loadEmbeddings(currentSignature, currentBookmarks) {
    try {
      const db = await this.openDatabase();

      // 读取保存的签名
      const savedSignature = await this.idbReq(
        db.transaction(['metadata'], 'readonly')
          .objectStore('metadata')
          .get('signature')
      );

      // 读取嵌入数据
      const savedData = await this.idbReq(
        db.transaction(['embeddings'], 'readonly')
          .objectStore('embeddings')
          .get('all')
      );

      if (!savedSignature || !savedData) {
        return { loaded: false, canIncremental: false };
      }

      // 签名完全匹配 - 直接加载
      if (savedSignature === currentSignature) {
        this.embeddings = new Map(savedData.embeddings);
        this.bookmarkData = new Map(savedData.bookmarkData);
        return { loaded: true };
      }

      // 签名不匹配 - 检查是否可以增量更新
      const savedIds = new Set(savedData.bookmarkData.map(([id]) => id));
      const currentIds = new Set(currentBookmarks.map(bm => bm.id));

      const removedIds = [...savedIds].filter(id => !currentIds.has(id));
      const addedIds = [...currentIds].filter(id => !savedIds.has(id));

      // 如果变化不大（< 20%），使用增量更新
      const changeRatio = (removedIds.length + addedIds.length) / currentBookmarks.length;
      if (changeRatio < 0.2) {
        this.embeddings = new Map(savedData.embeddings);
        this.bookmarkData = new Map(savedData.bookmarkData);

        const addedBookmarks = currentBookmarks.filter(bm => addedIds.includes(bm.id));

        return {
          loaded: false,
          canIncremental: true,
          added: addedBookmarks,
          removed: removedIds
        };
      }

      return { loaded: false, canIncremental: false };
    } catch (error) {
      console.error('❌ 从缓存加载失败:', error);
      return { loaded: false, canIncremental: false };
    }
  }

  // --- 优化4：基于特征聚类的自动分类 ---
  computeRobustFolderCentroids() {
    console.log('🧠 开始计算各分类语义质心...');
    const folderGroups = new Map(); // parentId -> [embeddings]
    const folderPaths = new Map(); // parentId -> path

    for (const [bookmarkId, embedding] of this.embeddings.entries()) {
      const bm = this.bookmarkData.get(bookmarkId);
      if (!bm.folderPath || !bm.folderPath.includes(' > ')) {
        // 排除过于顶层或特殊的文件夹（不把它们当做独立的语义分类）
        if ([UI_TEXTS.BOOKMARK_BAR, UI_TEXTS.OTHER_BOOKMARKS, UI_TEXTS.MOBILE_BOOKMARKS, ''].includes(bm.folderPath || '') || (bm.folderPath && bm.folderPath.includes('Twitter/X'))) {
          continue;
        }
      }

      if (!folderGroups.has(bm.parentId)) {
        folderGroups.set(bm.parentId, []);
        folderPaths.set(bm.parentId, bm.folderPath);
      }
      folderGroups.get(bm.parentId).push(embedding);
    }

    const centroids = new Map(); // parentId -> { path, vector }

    for (const [parentId, embeddings] of folderGroups.entries()) {
      if (embeddings.length < 2) {
        // 样本太少不排异
        centroids.set(parentId, { path: folderPaths.get(parentId), vector: embeddings[0] });
        continue;
      }

      let meanVector = new Array(embeddings[0].length).fill(0);
      for (const emb of embeddings) {
        for (let i = 0; i < emb.length; i++) {
          meanVector[i] += emb[i];
        }
      }
      meanVector = meanVector.map(val => val / embeddings.length);

      const similarities = embeddings.map(emb => this.cosineSimilarity(meanVector, emb));
      const meanSim = similarities.reduce((a, b) => a + b) / similarities.length;

      // 排除相似度<均值-0.1的离群书签
      const robustEmbeddings = embeddings.filter((emb, idx) => similarities[idx] >= meanSim - 0.1);

      if (robustEmbeddings.length > 0) {
        let robustMeanVector = new Array(robustEmbeddings[0].length).fill(0);
        for (const emb of robustEmbeddings) {
          for (let i = 0; i < emb.length; i++) {
            robustMeanVector[i] += emb[i];
          }
        }
        robustMeanVector = robustMeanVector.map(val => val / robustEmbeddings.length);

        let norm = Math.sqrt(robustMeanVector.reduce((sum, v) => sum + v * v, 0));
        robustMeanVector = robustMeanVector.map(v => v / norm);

        centroids.set(parentId, { path: folderPaths.get(parentId), vector: robustMeanVector });
      }
    }
    console.log(`✅ 成功建立 ${centroids.size} 个有效分类质心`);
    return centroids;
  }

  async suggestCategoriesForUncategorized() {
    if (!this.isInitialized) await this.ensureInitialized();

    const centroids = this.computeRobustFolderCentroids();
    if (centroids.size === 0) return { success: false, msg: '没有足够的有效分类来提供建议' };

    const suggestions = [];

    for (const [bookmarkId, embedding] of this.embeddings.entries()) {
      const bm = this.bookmarkData.get(bookmarkId);
      // 针对书签栏第一层、无分类（将Twitter隔离出来，不再参与Chrome全局的移动分类推荐）
      if (!bm.folderPath || bm.folderPath === UI_TEXTS.BOOKMARK_BAR || bm.folderPath === UI_TEXTS.OTHER_BOOKMARKS || bm.folderPath === '') {
        let bestMatch = null;
        let highestScore = -1;

        for (const [parentId, centroidObj] of centroids.entries()) {
          const score = this.cosineSimilarity(embedding, centroidObj.vector);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = { id: parentId, path: centroidObj.path };
          }
        }

        // 阈值控制，>0.55代表有较强信心
        if (bestMatch && highestScore > 0.55) {
          suggestions.push({
            bookmark: bm,
            suggestedFolder: bestMatch.path,
            suggestedFolderId: bestMatch.id,
            confidence: highestScore
          });
        }
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return { success: true, suggestions };
  }

  // --- 高精度聚类推特书签 (依赖 Chrome 真实书签结构) ---
  async clusterTwitterBookmarks() {
    await this.ensureInitialized();

    const all = await this.getAllBookmarks();
    const xBookmarks = all.filter(bm => bm.title && bm.title.includes(UI_TEXTS.TWITTER_PREFIX));

    if (xBookmarks.length === 0) return { userFolders: {}, autoClusters: {} };

    // 探测当前推特书签目录结构 (直接从书签树里读！)
    const userFolders = {}; // { folderName: [bookmarkId, ...] }
    const unclassifiedIds = new Set();
    const pinnedIds = new Set();

    for (const bm of xBookmarks) {
      if (!bm.folderPath) {
        unclassifiedIds.add(bm.id);
        continue;
      }

      const parts = bm.folderPath.split(' > ');
      const txIndex = parts.indexOf(UI_TEXTS.TWITTER_ROOT);

      if (txIndex === -1 && parts.length > 0) {
        // 放到了主库的别的普通文件夹里
        const parentName = parts[parts.length - 1];
        if (!userFolders[parentName]) userFolders[parentName] = [];
        userFolders[parentName].push(bm.id);
        pinnedIds.add(bm.id);
      } else if (txIndex === parts.length - 1) {
        // 直接在 🐦 Twitter/X 书签 根目录下
        unclassifiedIds.add(bm.id);
      } else {
        // 在 🐦 Twitter/X 书签 下的子文件夹中
        const folderName = parts[txIndex + 1];
        if (!userFolders[folderName]) userFolders[folderName] = [];
        userFolders[folderName].push(bm.id);
        pinnedIds.add(bm.id);
      }
    }

    const mediaBookmarks = [];
    const validData = [];

    // --- 辅助函数：从推文标题中解析元数据 ---
    const parseBookmarkMeta = (bm) => {
      let rawTitle = bm.title || '';
      let metadata = {};
      const metaMatch = rawTitle.match(/\u200B(.*?)\u200B/);
      if (metaMatch) {
        try { metadata = JSON.parse(metaMatch[1]); } catch (e) { /* ignore */ }
      }
      let text = rawTitle.replace(/\u200B.*?\u200B/g, '').trim();
      let author = '';
      const titleMatch = text.match(/\[X推文\]\s*(.*?):\s*(.*)/);
      if (titleMatch) {
        author = titleMatch[1].trim();
        text = titleMatch[2].trim();
      }
      return { author, text, metadata };
    };

    // 1. 过滤和分离纯多媒体推文，并排除已经在某个分类里的
    for (const bm of xBookmarks) {
      if (pinnedIds.has(bm.id)) continue;

      const parsed = parseBookmarkMeta(bm);

      if (parsed.text === '图片/视频推文' || parsed.text.startsWith('图片/视频推文') || parsed.text.length < 5) {
        mediaBookmarks.push(bm);
        continue;
      }

      const emb = this.embeddings.get(bm.id);
      if (emb) {
        validData.push({ bm, text: parsed.text, author: parsed.author, metadata: parsed.metadata, vector: emb });
      } else {
        mediaBookmarks.push(bm);
      }
    }

    const autoClusters = {}; // 承载智能生成的草稿

    // 1.5 用户文件夹语义吸引
    const NAME_ATTRACT_THRESHOLD = 0.68;
    const CENTROID_ATTRACT_THRESHOLD = 0.75;
    const folderNames = Object.keys(userFolders);
    if (folderNames.length > 0 && validData.length > 0) {
      console.log('🧲 [FolderAttract] 开始处理', folderNames.length, '个用户文件夹...');

      const folderVectors = [];
      const emptyFolderNames = [];
      const emptyFolderIndices = [];

      for (let fi = 0; fi < folderNames.length; fi++) {
        const name = folderNames[fi];
        const ids = userFolders[name];
        if (ids && ids.length > 0) {
          const vectors = ids.map(id => this.embeddings.get(id)).filter(Boolean);
          if (vectors.length > 0) {
            const dim = vectors[0].length;
            const centroid = new Array(dim).fill(0);
            for (const v of vectors) {
              for (let d = 0; d < dim; d++) centroid[d] += v[d];
            }
            for (let d = 0; d < dim; d++) centroid[d] /= vectors.length;
            folderVectors.push({ name, vector: centroid, mode: '质心', threshold: CENTROID_ATTRACT_THRESHOLD });
          }
        } else {
          emptyFolderNames.push(name);
          emptyFolderIndices.push(fi);
        }
      }

      if (emptyFolderNames.length > 0) {
        const folderEmbResponse = await offscreenManager.sendMessage({
          type: 'OFFSCREEN_EMBED_BATCH',
          texts: emptyFolderNames
        });
        if (folderEmbResponse.success && folderEmbResponse.embeddings) {
          for (let j = 0; j < emptyFolderNames.length; j++) {
            folderVectors.push({
              name: emptyFolderNames[j],
              vector: folderEmbResponse.embeddings[j],
              mode: '名称',
              threshold: NAME_ATTRACT_THRESHOLD
            });
          }
        }
      }

      let attractCount = 0;
      for (let i = validData.length - 1; i >= 0; i--) {
        const item = validData[i];
        let bestFolder = null;
        let bestSim = -1;
        for (const fv of folderVectors) {
          const sim = this.cosineSimilarity(item.vector, fv.vector);
          if (sim > bestSim) { bestSim = sim; bestFolder = fv; }
        }
        if (bestFolder && bestSim >= bestFolder.threshold) {
          const targetName = `${UI_TEXTS.ATTRACTED_PREFIX}${bestFolder.name}`;
          if (!autoClusters[targetName]) autoClusters[targetName] = [];
          autoClusters[targetName].push(item.bm);
          validData.splice(i, 1);
          attractCount++;
        }
      }
      console.log(`🧲 [FolderAttract] 本轮共吸引 ${attractCount} 条推文`);
    }

    // --- 2. 元数据增强的两阶段聚类 ---

    // 计算增强相似度：向量相似度 + 作者亲和度加成
    const enhancedSimilarity = (item1, item2) => {
      let baseSim = this.cosineSimilarity(item1.vector, item2.vector);
      // 同作者推文获得相似度加成（内容相关性更可能高）
      if (item1.author && item2.author && item1.author === item2.author) {
        baseSim = Math.min(1.0, baseSim + 0.08);
      }
      return baseSim;
    };

    // Average Linkage 聚类（单次）
    const runClustering = (data, threshold) => {
      const clusters = [];
      for (const item of data) {
        let bestScore = -1;
        let bestIdx = -1;
        for (let i = 0; i < clusters.length; i++) {
          let totalScore = 0;
          for (const existItem of clusters[i]) {
            totalScore += enhancedSimilarity(item, existItem);
          }
          const avgScore = totalScore / clusters[i].length;
          if (avgScore > bestScore) {
            bestScore = avgScore;
            bestIdx = i;
          }
        }
        if (bestScore >= threshold) {
          clusters[bestIdx].push(item);
        } else {
          clusters.push([item]);
        }
      }
      return clusters;
    };

    // 第一阶段：较紧的阈值，形成高质量核心簇
    const TIGHT_THRESHOLD = 0.72;
    const pass1Clusters = runClustering(validData, TIGHT_THRESHOLD);

    // 分离：多项簇（已成型）与单项簇（待二次聚类）
    const formedClusters = [];
    const singletons = [];
    for (const cluster of pass1Clusters) {
      if (cluster.length >= 2) {
        formedClusters.push(cluster);
      } else {
        singletons.push(cluster[0]);
      }
    }

    // 第二阶段：对单项用更松的阈值再聚类
    const LOOSE_THRESHOLD = 0.58;
    let finalSingletons = [];
    if (singletons.length > 1) {
      const pass2Clusters = runClustering(singletons, LOOSE_THRESHOLD);
      for (const cluster of pass2Clusters) {
        if (cluster.length >= 2) {
          formedClusters.push(cluster);
        } else {
          finalSingletons.push(cluster[0]);
        }
      }
    } else {
      finalSingletons = singletons;
    }

    // 第三阶段：尝试将剩余单项就近合并到已有簇
    const MERGE_THRESHOLD = 0.52;
    const stillAlone = [];
    for (const item of finalSingletons) {
      let bestClusterIdx = -1;
      let bestSim = -1;
      for (let i = 0; i < formedClusters.length; i++) {
        // 只比较质心，加速
        const dim = item.vector.length;
        const centroid = new Array(dim).fill(0);
        for (const ci of formedClusters[i]) {
          for (let d = 0; d < dim; d++) centroid[d] += ci.vector[d];
        }
        for (let d = 0; d < dim; d++) centroid[d] /= formedClusters[i].length;
        const sim = enhancedSimilarity(item, { vector: centroid, author: '' });
        if (sim > bestSim) { bestSim = sim; bestClusterIdx = i; }
      }
      if (bestClusterIdx >= 0 && bestSim >= MERGE_THRESHOLD) {
        formedClusters[bestClusterIdx].push(item);
      } else {
        stillAlone.push(item);
      }
    }

    console.log(`📊 [Clustering] 阶段汇总: ${formedClusters.length} 个簇, ${stillAlone.length} 条未归类`);

    // --- 3. 基于 TF-IDF 的自动关键词提取与智能命名 ---
    // 不再使用硬编码的停用词表，而是通过词在簇间的分布自动判断区分度

    // 分词函数：使用 Chrome 原生 Intl.Segmenter API 进行语言学分词
    // 中文会被正确切分为词语（如 "机器学习算法" → "机器学习" + "算法"）
    const zhSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });

    const tokenize = (text) => {
      const segments = zhSegmenter.segment(text);
      const tokens = [];
      for (const { segment, isWordLike } of segments) {
        if (!isWordLike) continue; // 跳过标点、空格等非词汇
        const t = segment.toLowerCase();
        // 结构化过滤：跳过单字、纯数字、URL 碎片
        const isCJK = /[\u4e00-\u9fa5]/.test(t);
        if (isCJK && t.length < 2) continue;   // 中文单字无意义
        if (!isCJK && t.length < 3) continue;   // 英文/数字太短也跳过
        if (/^\d+$/.test(t)) continue;           // 纯数字
        tokens.push(t);
      }
      return tokens;
    };

    // 构建全局 IDF（逆簇频率）：统计每个词出现在多少个簇中
    const allClustersForIdf = [...formedClusters];
    // 把待命名的全部簇当作"文档集"
    const totalDocs = allClustersForIdf.length;
    const docFrequency = {}; // word → 出现在多少个簇中

    allClustersForIdf.forEach(cluster => {
      const clusterWords = new Set();
      cluster.forEach(item => {
        tokenize(item.text).forEach(t => clusterWords.add(t));
      });
      for (const w of clusterWords) {
        docFrequency[w] = (docFrequency[w] || 0) + 1;
      }
    });

    // IDF 计算：log(总簇数 / 出现该词的簇数)
    // 出现在所有簇中的词 → IDF ≈ 0 → 自动被抑制（等同于停用词）
    const idf = (word) => {
      const df = docFrequency[word] || 0;
      if (df === 0) return 0;
      return Math.log((totalDocs + 1) / (df + 1)) + 1; // 平滑处理
    };

    const extractName = (items) => {
      if (items.length === 1) {
        const it = items[0];
        const preview = it.text.substring(0, 15).replace(/\.+$/, '');
        return it.author ? `${it.author}: ${preview}…` : `${preview}…`;
      }

      // (a) 统计作者分布
      const authorCounts = {};
      items.forEach(it => {
        if (it.author) authorCounts[it.author] = (authorCounts[it.author] || 0) + 1;
      });
      const sortedAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]);
      const topAuthor = sortedAuthors.length > 0 ? sortedAuthors[0] : null;
      const authorDominance = topAuthor ? topAuthor[1] / items.length : 0;

      // (b) 找到最接近质心的代表性推文
      const dim = items[0].vector.length;
      let centroid = new Array(dim).fill(0);
      for (const item of items) {
        for (let j = 0; j < dim; j++) centroid[j] += item.vector[j];
      }
      for (let j = 0; j < dim; j++) centroid[j] /= items.length;

      let bestItem = items[0];
      let maxSim = -Infinity;
      for (const item of items) {
        const sim = this.cosineSimilarity(item.vector, centroid);
        if (sim > maxSim) { maxSim = sim; bestItem = item; }
      }

      // (c) TF-IDF 自动关键词提取
      // TF: 词在当前簇中出现的频次
      const wordFreq = {};
      items.forEach(item => {
        tokenize(item.text).forEach(t => {
          wordFreq[t] = (wordFreq[t] || 0) + 1;
        });
      });

      // 计算 TF-IDF 得分，取得分最高的关键词
      const tfidfScores = Object.entries(wordFreq).map(([word, tf]) => ({
        word,
        score: tf * idf(word)
      }));
      tfidfScores.sort((a, b) => b.score - a.score);

      // 从代表性推文中取 token，按 TF-IDF 得分排序
      const bestTokens = tokenize(bestItem.text);
      const uniqueBest = [...new Set(bestTokens)];
      uniqueBest.sort((a, b) => {
        const sa = tfidfScores.find(s => s.word === a)?.score || 0;
        const sb = tfidfScores.find(s => s.word === b)?.score || 0;
        return sb - sa;
      });

      // 取前 3 个高区分度的关键词
      // 如果代表性推文的 token 不够好，从全簇 TF-IDF 排名补充
      let topWords = uniqueBest.slice(0, 3);
      if (topWords.length < 3) {
        const existing = new Set(topWords);
        for (const entry of tfidfScores) {
          if (!existing.has(entry.word)) {
            topWords.push(entry.word);
            existing.add(entry.word);
            if (topWords.length >= 3) break;
          }
        }
      }
      const topicStr = topWords.join(' · ');

      // (d) 基于元数据组合命名
      if (authorDominance >= 0.6 && topAuthor) {
        // 作者主导型簇
        return topicStr ? `${topAuthor[0]}: ${topicStr}` : `${topAuthor[0]} 的内容`;
      }
      if (topicStr) {
        // 话题主导型簇
        return topicStr;
      }
      // 兜底：用代表性推文的摘要
      const preview = bestItem.text.substring(0, 20).replace(/\.+$/, '');
      return `${preview}…`;
    };

    // 4. 组装自动聚类结果
    formedClusters.sort((a, b) => b.length - a.length);

    for (const cluster of formedClusters) {
      const name = extractName(cluster);
      let outputName = name;
      let suffix = 2;
      while (autoClusters[outputName]) { outputName = `${name} (${suffix++})`; }
      autoClusters[outputName] = cluster.map(i => i.bm);
    }

    // 剩余未归类的：按作者归堆，而不是全部扔进一个大杂烩
    if (stillAlone.length > 0) {
      const byAuthor = {};
      const noAuthor = [];
      for (const item of stillAlone) {
        if (item.author) {
          if (!byAuthor[item.author]) byAuthor[item.author] = [];
          byAuthor[item.author].push(item);
        } else {
          noAuthor.push(item);
        }
      }
      // 同作者 >= 2 条的单独建簇
      for (const [author, items] of Object.entries(byAuthor)) {
        if (items.length >= 2) {
          const folderName = `${author} 的其他收藏`;
          autoClusters[folderName] = items.map(i => i.bm);
        } else {
          noAuthor.push(...items);
        }
      }
      // 真正的零散项
      if (noAuthor.length > 0) {
        autoClusters[UI_TEXTS.UNCLASSIFIED_MISC] = noAuthor.map(i => i.bm);
      }
    }
    if (mediaBookmarks.length > 0) {
      autoClusters[UI_TEXTS.MEDIA_COLLECTION] = mediaBookmarks;
    }

    // 5. 构建用户文件夹的完整信息（把 ID 还原为 bm 对象）
    const bmById = {};
    for (const bm of xBookmarks) bmById[bm.id] = bm;

    const userFoldersResolved = {};
    for (const [name, ids] of Object.entries(userFolders)) {
      const resolved = ids.map(id => bmById[id]).filter(Boolean);
      userFoldersResolved[name] = resolved; // 保留空文件夹
    }

    return { userFolders: userFoldersResolved, autoClusters };
  }

  async saveEmbeddings(signature) {
    try {
      const db = await this.openDatabase();

      // 保存签名
      await this.idbReq(
        db.transaction(['metadata'], 'readwrite')
          .objectStore('metadata')
          .put(signature, 'signature')
      );

      // 保存嵌入数据
      const data = {
        embeddings: Array.from(this.embeddings.entries()),
        bookmarkData: Array.from(this.bookmarkData.entries())
      };

      await this.idbReq(
        db.transaction(['embeddings'], 'readwrite')
          .objectStore('embeddings')
          .put(data, 'all')
      );

      console.log('💾 语义索引已保存到 IndexedDB');
    } catch (error) {
      console.error('❌ 保存到 IndexedDB 失败:', error);
    }
  }

  idbReq(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// 创建引擎实例
const searchEngine = new SemanticSearchEngine();

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 兼容两种消息格式：type 和 action
  const messageType = request.type || request.action;

  // 忽略来自 Offscreen Document 的内部消息（进度通知等）
  if (messageType === 'MODEL_PROGRESS' || messageType === 'EMBED_PROGRESS') {
    console.log(`📊 进度更新: ${messageType}`, request);
    return false; // 不需要响应
  }

  // 忽略发给 Offscreen Document 的专属消息，避免后台脚本拦截并错误地返回未知的消息类型
  if (messageType && messageType.startsWith('OFFSCREEN_')) {
    return false;
  }

  console.log('📨 收到请求:', messageType);

  // 获取初始化状态
  if (messageType === 'GET_INIT_STATUS' || messageType === 'isInitialized') {
    sendResponse({
      success: true,
      isInitialized: searchEngine.isInitialized,
      progress: searchEngine.initProgress
    });
    return false;
  }

  // 初始化引擎 (彻底的异步启动防通道断开)
  if (messageType === 'INITIALIZE_ENGINE' || messageType === 'initialize') {
    // 只有在没有正在初始化且未初始化完成时再触发
    if (!searchEngine.isInitialized && searchEngine.initProgress.status !== 'loading_model' && searchEngine.initProgress.status !== 'building_index') {
      searchEngine.initialize().catch(error => {
        console.error('引擎初始化失败:', error);
      });
    }
    sendResponse({ success: true, isAsync: true });
    return false; // 立即返回响应，断开当前长连接，让前端走轮询机制获取进度
  }

  // 搜索
  if (messageType === 'SEARCH_BOOKMARKS' || messageType === 'SEARCH' || messageType === 'search') {
    searchEngine.searchBookmarks(request.query, request.topK || 20)
      .then(results => {
        sendResponse({ success: true, results });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // 强制硬重置清空
  if (messageType === 'FORCE_REINIT_ENGINE') {
    (async () => {
      try {
        // 1. 关闭正在运行的重载锁
        searchEngine.isInitialized = false;
        searchEngine.initializationPromise = null;

        // 2. 清空缓存与内存
        searchEngine.embeddings.clear();
        searchEngine.bookmarkData.clear();
        searchEngine.dbPromise = null; // 让下次 openDatabase 重新连接升级后的新版本

        // 3. 抹除 IndexedDB 数据库
        await new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase('SemanticSearchDB');
          req.onsuccess = resolve;
          req.onerror = () => reject(req.error);
          req.onblocked = resolve;
        });

        // 4. 发送成功回调
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 智能分类
  if (messageType === 'AUTO_CATEGORIZE') {
    searchEngine.suggestCategoriesForUncategorized()
      .then(res => sendResponse(res))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 对Twitter专属页面零样本归类聚合
  if (messageType === 'CLUSTER_TWITTER_BOOKMARKS') {
    searchEngine.clusterTwitterBookmarks()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 批量同步Twitter虚拟草稿文件夹到真实Chrome书签
  if (messageType === 'SYNC_MULTIPLE_TWITTER_FOLDERS') {
    (async () => {
      try {
        const foldersMap = request.folders || {};
        let totalMoved = 0;

        let foldersTree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        let root = foldersTree[0];
        let twitterFolder = null;
        const traverseAndFind = (nodes) => {
          for (let node of nodes) {
            if (node.title === UI_TEXTS.TWITTER_ROOT && !node.url && !twitterFolder) {
              twitterFolder = node;
            }
            if (node.children) traverseAndFind(node.children);
          }
        };
        traverseAndFind(root.children);

        if (!twitterFolder) {
          throw new Error('未找到主库的 Twitter 根目录，请先随便保存一条推特触发创建。');
        }

        // 处理待同步的文件夹重命名的草稿
        const renamesMap = request.renames || {};
        for (const [oldName, newName] of Object.entries(renamesMap)) {
          let targetFolder = twitterFolder.children ? twitterFolder.children.find(c => c.title === oldName && !c.url) : null;
          if (targetFolder) {
            await new Promise(resolve => chrome.bookmarks.update(targetFolder.id, { title: newName }, resolve));
            targetFolder.title = newName; // 更新内存引用
          }
        }

        for (const [folderName, bookmarkIds] of Object.entries(foldersMap)) {
          if (!bookmarkIds || bookmarkIds.length === 0) continue;

          let targetFolder = twitterFolder.children ? twitterFolder.children.find(c => c.title === folderName && !c.url) : null;
          if (!targetFolder) {
            targetFolder = await new Promise(resolve => chrome.bookmarks.create({
              parentId: twitterFolder.id,
              title: folderName
            }, resolve));
            if (!twitterFolder.children) twitterFolder.children = [];
            twitterFolder.children.push(targetFolder);
          }

          for (let id of bookmarkIds) {
            const bm = await new Promise(resolve => chrome.bookmarks.get(id, (res) => resolve(res ? res[0] : null)));
            if (bm) {
              await new Promise(resolve => chrome.bookmarks.move(id, { parentId: targetFolder.id }, resolve));
              totalMoved++;
            }
          }
        }
        sendResponse({ success: true, moved: totalMoved });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 移动书签
  if (messageType === 'MOVE_BOOKMARK') {
    chrome.bookmarks.move(request.bookmarkId, { parentId: request.parentId }, (res) => {
      sendResponse({ success: !chrome.runtime.lastError, error: chrome.runtime.lastError?.message });
    });
    return true;
  }

  // 批量移入回收站（优化：缓存 trashFolder 和 meta，减少重复 IO）
  if (messageType === 'DELETE_MULTIPLE_BOOKMARKS') {
    (async () => {
      try {
        const trash = await getTrashFolder();
        let meta = (await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve))).TRASH_META || {};
        for (let id of request.bookmarkIds) {
          meta = await moveToTrash(id, trash, meta);
        }
        await new Promise(resolve => chrome.storage.local.set({ TRASH_META: meta }, resolve));
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 重命名真实的Twitter本地文件夹
  if (messageType === 'RENAME_TWITTER_FOLDER') {
    (async () => {
      try {
        const { oldName, newName } = request;
        let foldersTree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        let root = foldersTree[0];
        let twitterFolder = null;
        const traverseAndFind = (nodes) => {
          for (let node of nodes) {
            if (node.title === UI_TEXTS.TWITTER_ROOT && !node.url && !twitterFolder) {
              twitterFolder = node;
            }
            if (node.children) traverseAndFind(node.children);
          }
        };
        traverseAndFind(root.children);

        if (twitterFolder && twitterFolder.children) {
          const target = twitterFolder.children.find(c => c.title === oldName && !c.url);
          if (target) {
            await new Promise((resolve, reject) => {
              chrome.bookmarks.update(target.id, { title: newName }, () => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve();
              });
            });
          } else {
            throw new Error('未找到原文件夹');
          }
        } else {
          throw new Error('未找到Twitter根目录');
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // (getTrashFolder 和 moveToTrash 已提升到文件顶部 UI_TEXTS 下方)

  // 移入回收站
  if (messageType === 'DELETE_BOOKMARK') {
    (async () => {
      try {
        await moveToTrash(request.bookmarkId);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 恢复书签
  if (messageType === 'RESTORE_BOOKMARK') {
    (async () => {
      try {
        const { TRASH_META = {} } = await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve));
        const originalParentId = TRASH_META[request.bookmarkId];

        let targetParentId = originalParentId;

        // 检查原文件夹是否还存在
        if (originalParentId) {
          const parentExists = await new Promise(resolve => chrome.bookmarks.get(originalParentId, res => resolve(!!res)));
          if (!parentExists) targetParentId = null;
        }

        if (!targetParentId) {
          let foldersTree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
          let root = foldersTree[0];
          let otherBookmarks = root.children.find(c => c.id === '2' || c.title === '其他书签' || c.title === 'Other bookmarks') || root.children[root.children.length - 1];
          targetParentId = otherBookmarks.id;
        }

        await new Promise((resolve, reject) => {
          chrome.bookmarks.move(request.bookmarkId, { parentId: targetParentId }, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });

        // 清除元数据
        delete TRASH_META[request.bookmarkId];
        await new Promise(resolve => chrome.storage.local.set({ TRASH_META }, resolve));

        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 彻底删除单个书签（同步清理 TRASH_META）
  if (messageType === 'PERMANENT_DELETE_BOOKMARK') {
    (async () => {
      try {
        await new Promise((resolve, reject) => {
          chrome.bookmarks.remove(request.bookmarkId, () => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve();
          });
        });
        // 清理幽灵元数据
        const { TRASH_META = {} } = await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve));
        delete TRASH_META[request.bookmarkId];
        await new Promise(resolve => chrome.storage.local.set({ TRASH_META }, resolve));
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 清空回收站
  if (messageType === 'EMPTY_TRASH') {
    (async () => {
      try {
        const trash = await getTrashFolder();
        if (trash.children || (await new Promise(resolve => chrome.bookmarks.getChildren(trash.id, resolve))).length > 0) {
          // 直接 removeTree 删除再重建，最快
          await new Promise(resolve => chrome.bookmarks.removeTree(trash.id, resolve));
          // 顺便清空所有的 TRASH_META
          await new Promise(resolve => chrome.storage.local.remove('TRASH_META', resolve));
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 删除真实的Twitter本地文件夹（改为移入回收站）
  if (messageType === 'DELETE_TWITTER_FOLDER') {
    (async () => {
      try {
        const { folderName } = request;
        let foldersTree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        let root = foldersTree[0];
        let twitterFolder = null;
        const traverseAndFind = (nodes) => {
          for (let node of nodes) {
            if (node.title === UI_TEXTS.TWITTER_ROOT && !node.url && !twitterFolder) {
              twitterFolder = node;
            }
            if (node.children) traverseAndFind(node.children);
          }
        };
        traverseAndFind(root.children);

        if (twitterFolder && twitterFolder.children) {
          const target = twitterFolder.children.find(c => c.title === folderName && !c.url);
          if (target) {
            // 将文件夹内所有书签逐条移入回收站
            const trash = await getTrashFolder();
            let meta = (await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve))).TRASH_META || {};
            const children = await new Promise(resolve => chrome.bookmarks.getChildren(target.id, resolve));
            for (const child of children) {
              if (child.url) {
                meta = await moveToTrash(child.id, trash, meta);
              }
            }
            await new Promise(resolve => chrome.storage.local.set({ TRASH_META: meta }, resolve));
            // 删除空壳文件夹
            await new Promise((resolve, reject) => {
              chrome.bookmarks.removeTree(target.id, () => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve();
              });
            });
          }
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 针对单条Twitter书签智能向主库全量分发
  if (messageType === 'SMART_DISPATCH_SINGLE_TWITTER') {
    (async () => {
      try {
        const { bookmarkId } = request;
        const embedding = searchEngine.embeddings.get(bookmarkId);
        if (!embedding) throw new Error('该推文暂无向量索引（请刷新面板并重新执行引擎重组）');

        const centroids = searchEngine.computeRobustFolderCentroids();
        if (centroids.size === 0) throw new Error('您的主库没有有效的聚类文件夹以供分发');

        let bestMatch = null;
        let highestScore = -1;
        for (const [parentId, centroidObj] of centroids.entries()) {
          // 排除发往属于推特的根目录，只能向主库其它地方发
          if (centroidObj.path.includes('Twitter/X')) continue;
          const score = searchEngine.cosineSimilarity(embedding, centroidObj.vector);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = { id: parentId, path: centroidObj.path };
          }
        }

        if (bestMatch && highestScore > 0.55) {
          sendResponse({ success: true, suggestedFolder: bestMatch.path, suggestedFolderId: bestMatch.id, confidence: highestScore });
        } else {
          sendResponse({ success: false, error: '未能在那千军万马的 Chrome 文件夹中找到收留它的一席之地 (相似度均过低)。' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 增量同步检查：返回提供的书签中有多少是全新未保存过的
  if (messageType === 'CHECK_NEW_BOOKMARKS') {
    (async () => {
      try {
        let folders = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        const allUrls = new Set();
        const traverse = (nodes) => {
          for (let node of nodes) {
            if (node.url) allUrls.add(node.url);
            if (node.children) traverse(node.children);
          }
        };
        traverse(folders);

        let newCount = 0;
        for (let item of request.bookmarks) {
          if (!allUrls.has(item.url)) {
            newCount++;
          }
        }
        sendResponse({ success: true, newCount });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 导入推特书签
  if (messageType === 'SAVE_TWITTER_BOOKMARKS') {
    (async () => {
      try {
        let folders = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        let root = folders[0];

        // 我们需要全局去重，这样即使推特书签被移动(智能分类)到了别的文件夹，也不会被重复收集
        const allUrls = new Set();
        let twitterFolder = null;

        const traverseAndFind = (nodes) => {
          for (let node of nodes) {
            if (node.url) allUrls.add(node.url);
            if (node.title === '🐦 Twitter/X 书签' && !node.url && !twitterFolder) {
              twitterFolder = node;
            }
            if (node.children) {
              traverseAndFind(node.children);
            }
          }
        };
        traverseAndFind(root.children);

        // 尝试寻找 "其他书签" 或者是 root 的最后一个 children
        let otherBookmarks = root.children.find(c => c.id === '2' || c.title === '其他书签' || c.title === 'Other bookmarks') || root.children[root.children.length - 1];

        if (!twitterFolder) {
          twitterFolder = await new Promise(resolve => {
            chrome.bookmarks.create({
              parentId: otherBookmarks.id,
              title: '🐦 Twitter/X 书签'
            }, resolve);
          });
        }

        let addedCount = 0;
        for (let item of request.bookmarks) {
          if (!allUrls.has(item.url)) {
            await new Promise(resolve => {
              chrome.bookmarks.create({
                parentId: twitterFolder.id,
                title: item.title,
                url: item.url
              }, resolve);
            });
            allUrls.add(item.url); // 防止同批次内的重复提交
            addedCount++;
          }
        }

        sendResponse({ success: true, added: addedCount });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ====== GraphQL API 驱动的推特书签同步 ======

  // 辅助函数：将抓取的推文保存到 Chrome 书签
  async function saveBookmarksToChrome(tweets) {
    if (tweets.length === 0) return 0;

    let folders = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    let root = folders[0];

    // 全局去重
    const allUrls = new Set();
    let twitterFolder = null;

    const traverseAndFind = (nodes) => {
      for (let node of nodes) {
        if (node.url) allUrls.add(node.url);
        if (node.title === '🐦 Twitter/X 书签' && !node.url && !twitterFolder) {
          twitterFolder = node;
        }
        if (node.children) {
          traverseAndFind(node.children);
        }
      }
    };
    traverseAndFind(root.children);

    let otherBookmarks = root.children.find(c => c.id === '2' || c.title === '其他书签' || c.title === 'Other bookmarks') || root.children[root.children.length - 1];

    if (!twitterFolder) {
      twitterFolder = await new Promise(resolve => {
        chrome.bookmarks.create({
          parentId: otherBookmarks.id,
          title: '🐦 Twitter/X 书签'
        }, resolve);
      });
    }

    let addedCount = 0;
    for (let item of tweets) {
      if (!allUrls.has(item.url)) {
        await new Promise(resolve => {
          chrome.bookmarks.create({
            parentId: twitterFolder.id,
            title: item.title,
            url: item.url
          }, resolve);
        });
        allUrls.add(item.url);
        addedCount++;
      }
    }

    return addedCount;
  }

  // API 全量同步（Deep 模式）
  if (messageType === 'API_SYNC_DEEP') {
    (async () => {
      try {
        console.log('🚀 [API Sync] 开始全量同步...');

        const result = await twitterFetcher.fetchAllBookmarks(
          // onProgress
          (count, page, status, added) => {
            chrome.runtime.sendMessage({
              type: 'SYNC_PROGRESS',
              status: status === 'rate_limited' ? 'rate_limited' : 'running',
              count: count,
              added: added || 0,
              page: page,
              mode: 'deep'
            }).catch(() => { });
          },
          // onSaveBatch: 每几页保存一批到 Chrome 书签
          (batch) => saveBookmarksToChrome(batch)
        );

        console.log(`✅ [API Sync] 全量同步完成: 共获取 ${result.total} 条，新增 ${result.added} 条`);

        chrome.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          status: 'completed',
          count: result.total,
          added: result.added,
          mode: 'deep'
        }).catch(() => { });

        sendResponse({ success: true, total: result.total, added: result.added });
      } catch (err) {
        console.error('❌ [API Sync] 全量同步失败:', err);

        chrome.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          status: 'error',
          error: err.message,
          mode: 'deep'
        }).catch(() => { });

        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // API 增量同步
  if (messageType === 'API_SYNC_INCREMENTAL') {
    (async () => {
      try {
        console.log('🚀 [API Sync] 开始增量同步...');

        // 获取所有已有的书签 URL
        let folders = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
        const existingUrls = new Set();
        const collectUrls = (nodes) => {
          for (let node of nodes) {
            if (node.url) existingUrls.add(node.url);
            if (node.children) collectUrls(node.children);
          }
        };
        collectUrls(folders);

        const result = await twitterFetcher.fetchIncrementalBookmarks(
          existingUrls,
          // onProgress
          (count, page, status, added) => {
            chrome.runtime.sendMessage({
              type: 'SYNC_PROGRESS',
              status: status === 'rate_limited' ? 'rate_limited' : 'running',
              count: count,
              added: added || 0,
              page: page,
              mode: 'incremental'
            }).catch(() => { });
          },
          // onSaveBatch
          (batch) => saveBookmarksToChrome(batch)
        );

        console.log(`✅ [API Sync] 增量同步完成: 发现 ${result.total} 条新推文，新增 ${result.added} 条`);

        chrome.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          status: 'completed',
          count: result.total,
          added: result.added,
          mode: 'incremental'
        }).catch(() => { });

        sendResponse({ success: true, total: result.total, added: result.added });
      } catch (err) {
        console.error('❌ [API Sync] 增量同步失败:', err);

        chrome.runtime.sendMessage({
          type: 'SYNC_PROGRESS',
          status: 'error',
          error: err.message,
          mode: 'incremental'
        }).catch(() => { });

        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 停止同步
  if (messageType === 'API_SYNC_STOP') {
    twitterFetcher.stop();
    sendResponse({ success: true });
    return false;
  }

  // 查询同步状态（供 popup 重开后恢复 UI）
  if (messageType === 'API_SYNC_STATUS') {
    sendResponse({
      success: true,
      isFetching: twitterFetcher.isFetching,
      syncMode: twitterFetcher.syncMode || null,
      currentPage: twitterFetcher.currentPage || 0,
      totalFetched: twitterFetcher.totalFetched || 0,
      totalAdded: twitterFetcher.totalAdded || 0
    });
    return false;
  }

  // 获取仪表盘数据（不含回收站）
  if (messageType === 'GET_DASHBOARD_DATA') {
    (async () => {
      try {
        const all = await searchEngine.getAllBookmarks();

        const folderGroups = {};
        const xBookmarks = [];
        let totalCount = 0;

        for (const bm of all) {
          totalCount++;
          if (bm.title && bm.title.includes('[X推文]')) {
            xBookmarks.push(bm);
          }

          let path = bm.folderPath || '无分类';
          if (!folderGroups[path]) {
            folderGroups[path] = [];
          }
          folderGroups[path].push(bm);
        }

        sendResponse({
          success: true,
          total: totalCount,
          folders: folderGroups,
          xBookmarks: xBookmarks,
          isInitialized: searchEngine.isInitialized,
          progress: searchEngine.initProgress
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 获取回收站数据（独立 API，给 tab-trash 使用）
  if (messageType === 'GET_TRASH_DATA') {
    (async () => {
      try {
        const trash = await getTrashFolder();
        const children = await new Promise(resolve => chrome.bookmarks.getChildren(trash.id, resolve));
        const { TRASH_META = {} } = await new Promise(resolve => chrome.storage.local.get('TRASH_META', resolve));

        const trashItems = children.filter(c => c.url).map(c => ({
          ...c,
          originalParentId: TRASH_META[c.id] || null
        }));

        sendResponse({ success: true, items: trashItems, count: trashItems.length });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  // 获取进度
  if (messageType === 'GET_INIT_PROGRESS' || messageType === 'getProgress') {
    sendResponse({
      success: true,
      progress: searchEngine.initProgress
    });
    return false;
  }

  // 未知消息类型
  console.warn('⚠️  未知的消息类型:', messageType);
  sendResponse({
    success: false,
    error: '未知的消息类型: ' + messageType
  });
  return false;
});

// --- 优化3：实时的书签监听机制 ---
// 解决增加书签后需要重载的痛点，也为后期的分类系统打下坚实的数据基础，加入防抖支持高并发导入（如推特流）
let bookmarkSyncTimer = null;
let pendingAdds = new Map();
let pendingRemoves = new Set();

const triggerBookmarkSync = () => {
  if (bookmarkSyncTimer) clearTimeout(bookmarkSyncTimer);
  bookmarkSyncTimer = setTimeout(async () => {
    if (searchEngine.isInitialized && (pendingAdds.size > 0 || pendingRemoves.size > 0)) {
      console.log(`📦 开始批量同步更新书签: 新增 ${pendingAdds.size} 个, 删除 ${pendingRemoves.size} 个`);
      try {
        const all = await searchEngine.getAllBookmarks();

        const addedList = [];
        for (const [id, bm] of pendingAdds.entries()) {
          const fresh = all.find(b => b.id === id) || { ...bm, folderPath: bm.parentId ? '未知分类' : '根目录' };
          addedList.push(fresh);
        }

        const removedList = Array.from(pendingRemoves);

        await searchEngine.incrementalUpdate(addedList, removedList, all);
        const signature = await searchEngine.computeBookmarksSignature(all);
        await searchEngine.saveEmbeddings(signature);

        console.log('✅ 批量书签增量更新成功，并缓存至 IndexedDB');
      } catch (e) {
        console.error('❌ 批量处理书签更新失败:', e);
      } finally {
        pendingAdds.clear();
        pendingRemoves.clear();
      }
    }
  }, 1000); // 1秒防抖，用于合并多条并发更新
};

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (searchEngine.isInitialized) {
    pendingAdds.set(id, bookmark);
    triggerBookmarkSync();
  }
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  if (searchEngine.isInitialized) {
    pendingAdds.delete(id);
    pendingRemoves.add(id);
    triggerBookmarkSync();
  }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (searchEngine.isInitialized) {
    // 如果是移入/移出回收站的操作，不触发无意义的增量更新
    try {
      const trash = await getTrashFolder();
      if (moveInfo.parentId === trash.id || moveInfo.oldParentId === trash.id) {
        return; // 跳过回收站相关的 move 事件
      }
    } catch (e) { /* ignore */ }
    triggerBookmarkSync();
  }
});

console.log('✅ Background Service Worker 就绪（Offscreen Document 模式）');

