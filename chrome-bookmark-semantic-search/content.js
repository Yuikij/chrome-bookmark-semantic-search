// Content Script for Chrome Bookmark Semantic Search Extension
// 这个脚本可以用于未来扩展功能，比如从页面内容中提取更多语义信息

console.log('智能书签搜索插件内容脚本已加载');

// ====== Twitter / X 书签同步功能 ======
// ====== Twitter / X 书签同步功能 ======
if (window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) {
  console.log('🐦 智能书签: 探测到推特/X环境 (静默模式, UI转移至插件面板)');

  const extractScreen = () => {
    const articles = document.querySelectorAll('article');
    const bookmarks = [];
    articles.forEach(article => {
      try {
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const authorEl = article.querySelector('[data-testid="User-Name"]');
        const timeEl = article.querySelector('a > time');
        if (!textEl && !authorEl) return;
        const text = textEl ? textEl.innerText.replace(/\n/g, ' ') : '图片/视频推文';
        const authorInfo = authorEl ? authorEl.innerText.replace(/\n/g, ' ').split('@')[0].trim() : '未知';

        let tweetUrl = window.location.href;
        if (timeEl && timeEl.parentElement && timeEl.parentElement.tagName === 'A') {
          tweetUrl = timeEl.parentElement.href;
        }

        // --- 新增：提取媒体和数据指标 ---
        let mediaUrl = '';
        const imgEl = article.querySelector('[data-testid="tweetPhoto"] img, [data-testid="videoComponent"] video');
        if (imgEl) {
          mediaUrl = imgEl.tagName === 'IMG' ? imgEl.src : (imgEl.poster || '');
        }

        // 提取转推、点赞、浏览量
        let retweets = '-', likes = '-', views = '-';
        const groupNode = article.querySelector('[role="group"]');
        if (groupNode) {
          const buttons = groupNode.querySelectorAll('[role="button"], a');
          const getStatText = (btn) => {
            if (!btn) return '-';
            const textNode = btn.querySelector('.r-bcqeeo');
            if (textNode) return textNode.innerText.trim();
            const genericTextNode = btn.querySelector('[data-testid="app-text-transition-container"]');
            if (genericTextNode) return genericTextNode.innerText.trim();
            return '-';
          };

          const retweetBtn = groupNode.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
          const likeBtn = groupNode.querySelector('[data-testid="like"], [data-testid="unlike"]');
          const viewBtn = groupNode.querySelector('[aria-label*="View"], [aria-label*="查看"], [aria-label*="浏览量"], a[href*="/analytics"]');

          retweets = getStatText(retweetBtn) || '-';
          likes = getStatText(likeBtn) || '-';
          views = getStatText(viewBtn) || '-';
        }

        const metadataObj = { mediaUrl, retweets, likes, views };
        const title = `[X推文] ${authorInfo}: ${text.substring(0, 120)}${text.length > 120 ? '...' : ''}`;
        const hiddenData = ' \u200B' + JSON.stringify(metadataObj) + '\u200B';

        bookmarks.push({ title: title + hiddenData, url: tweetUrl });
      } catch (e) {
        console.error('提取失败', e);
      }
    });
    return bookmarks;
  };

  let isAutoScrolling = false;

  const checkNovel = (bms) => new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'CHECK_NEW_BOOKMARKS', bookmarks: bms }, (res) => {
      resolve(res?.newCount || 0);
    });
  });

  const scrollAndWait = () => new Promise(resolve => {
    const scrollDelta = window.innerHeight * (0.6 + Math.random() * 0.6);
    window.scrollBy({ top: scrollDelta, behavior: 'smooth' });
    const waitTime = 1200 + Math.random() * 1500;
    setTimeout(resolve, waitTime);
  });

  function saveBookmarks(bookmarks) {
    if (bookmarks.length === 0) return Promise.resolve(0);
    const uniqueBookmarks = Array.from(new Map(bookmarks.map(item => [item.url, item])).values());
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'SAVE_TWITTER_BOOKMARKS',
        bookmarks: uniqueBookmarks
      }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          console.error('❌ 保存失败', chrome.runtime.lastError);
          resolve(0);
        } else {
          console.log(`✅ 成功导入 ${res.added} 条新书签`);
          resolve(res.added);
        }
      });
    });
  }

  const autoScrollAndExtract = async (isDeepMode) => {
    if (isAutoScrolling) {
      isAutoScrolling = false;
      return;
    }
    isAutoScrolling = true;

    const allBookmarksMap = new Map();
    let lastSize = 0;
    let noGrowthCount = 0;
    let zeroNovelCount = 0;

    chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', status: 'started' });

    while (isAutoScrolling) {
      const currentBms = extractScreen();
      currentBms.forEach(bm => allBookmarksMap.set(bm.url, bm));
      chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', status: 'running', count: allBookmarksMap.size });

      if (!isDeepMode && currentBms.length > 0) {
        const novelCount = await checkNovel(currentBms);
        if (novelCount === 0) {
          zeroNovelCount++;
          if (zeroNovelCount >= 3) {
            console.log('增量同步触发：连续3页都是旧收藏，停止自动爬取。');
            break;
          }
        } else {
          zeroNovelCount = 0;
        }
      }

      if (allBookmarksMap.size === lastSize) {
        noGrowthCount++;
        if (noGrowthCount >= (isDeepMode ? 5 : 4)) {
          console.log('触发停止条件：页面已无新内容或已到底部。');
          break;
        }
      } else {
        noGrowthCount = 0;
      }
      lastSize = allBookmarksMap.size;

      await scrollAndWait();
    }

    isAutoScrolling = false;
    const finalBookmarks = Array.from(allBookmarksMap.values());
    const added = await saveBookmarks(finalBookmarks);
    chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', status: 'completed', count: allBookmarksMap.size, added: added });
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHECK_SYNC_STATUS') {
      sendResponse({ isSyncing: isAutoScrolling });
      return true;
    }
    if (request.type === 'START_SYNC_CURRENT') {
      if (isAutoScrolling) {
        sendResponse({ success: false, error: '正在滚动抓取中...' });
      } else {
        const bms = extractScreen();
        saveBookmarks(bms).then(added => {
          sendResponse({ success: true, count: bms.length, added });
        });
      }
      return true;
    }
    if (request.type === 'START_SYNC_INCREMENTAL') {
      autoScrollAndExtract(false);
      sendResponse({ success: true });
      return false;
    }
    if (request.type === 'START_SYNC_DEEP') {
      autoScrollAndExtract(true);
      sendResponse({ success: true });
      return false;
    }
    if (request.type === 'STOP_SYNC') {
      isAutoScrolling = false;
      sendResponse({ success: true });
      return false;
    }
  });
}

// ====== 原有的页面内容分析扩展功能 ======
class PageContentAnalyzer {
  constructor() {
    this.isAnalyzing = false;
  }

  // 提取页面主要内容用于书签语义增强
  extractPageContent() {
    const content = {
      title: document.title,
      description: this.getMetaDescription(),
      keywords: this.getMetaKeywords(),
      headings: this.getHeadings(),
      mainContent: this.getMainContent()
    };

    return content;
  }

  getMetaDescription() {
    const meta = document.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : '';
  }

  getMetaKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    return meta ? meta.getAttribute('content') : '';
  }

  getHeadings() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach(heading => {
      const text = heading.textContent.trim();
      if (text.length > 0) {
        headings.push(text);
      }
    });

    return headings.slice(0, 10); // 限制数量
  }

  getMainContent() {
    // 尝试提取主要内容区域
    const selectors = [
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return this.cleanText(element.textContent);
      }
    }

    // 如果没有找到主要内容区域，提取body中的文本
    const bodyText = this.cleanText(document.body.textContent);
    return bodyText.substring(0, 1000); // 限制长度
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // 合并空白字符
      .replace(/[\n\r\t]/g, ' ') // 替换换行符和制表符
      .trim();
  }
}

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYZE_PAGE_CONTENT') {
    const analyzer = new PageContentAnalyzer();
    const content = analyzer.extractPageContent();
    sendResponse({ success: true, content });
  }
});

// 可选：在页面加载完成后自动分析内容（如果需要）
if (document.readyState === 'complete') {
  // 页面已完全加载
} else {
  window.addEventListener('load', () => {
    // 页面加载完成后的处理
  });
}
