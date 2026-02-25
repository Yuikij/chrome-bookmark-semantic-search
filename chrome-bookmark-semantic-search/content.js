// Content Script for Chrome Bookmark Semantic Search Extension
// 这个脚本可以用于未来扩展功能，比如从页面内容中提取更多语义信息

console.log('智能书签搜索插件内容脚本已加载');

// ====== Twitter / X 书签同步功能 ======
if (window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) {
  console.log('🐦 智能书签: 探测到推特/X环境');

  function createTwitterSyncUI() {
    if (document.getElementById('ai-bookmark-sync-container')) return;

    const container = document.createElement('div');
    container.id = 'ai-bookmark-sync-container';
    container.style = 'position: fixed; bottom: 30px; right: 30px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end;';

    const btnCurrent = document.createElement('button');
    btnCurrent.innerHTML = '📥 提取当前屏幕';
    const btnStyle = 'background: #1d9bf0; color: white; border: none; padding: 10px 20px; border-radius: 30px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(29, 155, 240, 0.4); font-size: 14px; transition: 0.2s; white-space: nowrap;';
    btnCurrent.style = btnStyle;

    const btnAll = document.createElement('button');
    btnAll.innerHTML = '🚀 增量滚屏抓取 (追平即停)';
    btnAll.style = btnStyle + 'background: #10b981; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);';

    const btnDeepAll = document.createElement('button');
    btnDeepAll.innerHTML = '🌋 深度全量滚屏 (强制扫到底)';
    btnDeepAll.style = btnStyle + 'background: #8b5cf6; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);';

    [btnCurrent, btnAll, btnDeepAll].forEach(btn => {
      btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
      btn.onmouseout = () => btn.style.transform = 'scale(1)';
    });

    // 核心提取逻辑
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
          // 提取图片或视频封面
          let mediaUrl = '';
          const imgEl = article.querySelector('[data-testid="tweetPhoto"] img, [data-testid="videoComponent"] video');
          if (imgEl) {
            mediaUrl = imgEl.tagName === 'IMG' ? imgEl.src : (imgEl.poster || '');
          }

          // 提取转推、点赞、浏览量
          let retweets = '-', likes = '-', views = '-';

          const getStatByLabel = (keyword) => {
            const btn = article.querySelector(`[aria-label*="${keyword}"]`);
            if (btn) {
              const match = btn.getAttribute('aria-label').match(/^[^\d]*([\d,]+)/);
              if (match) {
                let num = parseInt(match[1].replace(/,/g, ''), 10);
                if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
                return num.toString();
              }
            }
            return '-';
          };

          // 适配不同语言的 aria-label
          retweets = getStatByLabel('Repost') || getStatByLabel('转推') || '-';
          likes = getStatByLabel('Like') || getStatByLabel('喜欢') || getStatByLabel('赞') || '-';
          views = getStatByLabel('View') || getStatByLabel('查看') || getStatByLabel('浏览量') || '-';

          const metadataObj = { mediaUrl, retweets, likes, views };
          // -----------------------------

          const title = `[X推文] ${authorInfo}: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
          // 我们将 metadata 作为一个特殊字段传回，虽然 Chrome 原生 bookmark 只存 title/url，
          // 但我们在这边通过一个巧妙的方式暂存：我们可以在 title 里偷偷带上一段不可见的 JSON 字符串，
          // 因为原版 Chrome Bookmarks 并不支持自定义字段。
          // 这里使用隐藏的尾部标记，之后在面板解析出来。
          const hiddenData = ' \u200B' + JSON.stringify(metadataObj) + '\u200B';

          bookmarks.push({ title: title + hiddenData, url: tweetUrl });
        } catch (e) {
          console.error('提取失败', e);
        }
      });
      return bookmarks;
    };

    let isAutoScrolling = false;

    // 单次提取事件
    btnCurrent.onclick = () => {
      if (isAutoScrolling) return;
      btnCurrent.innerText = '🔄 提取中...';
      const bms = extractScreen();
      saveBookmarks(bms, btnCurrent, '📥 提取当前屏幕');
    };

    // 通用的全自动滚屏提取逻辑
    const autoScrollAndExtract = async (btnElement, isDeepMode) => {
      if (isAutoScrolling) {
        isAutoScrolling = false; // 中断标志
        btnElement.innerText = '🛑 正在停止...';
        return;
      }
      isAutoScrolling = true;
      btnElement.innerHTML = '🛑 停止抓取并打包 (已抓 0)';

      // 禁用另一个按钮
      const otherBtn = isDeepMode ? btnAll : btnDeepAll;
      const originalOtherText = otherBtn.innerText;
      otherBtn.disabled = true;
      otherBtn.style.opacity = '0.5';

      const allBookmarksMap = new Map();
      let lastSize = 0;
      let noGrowthCount = 0;
      let zeroNovelCount = 0;

      const scrollAndWait = () => new Promise(resolve => {
        const scrollDelta = window.innerHeight * (0.6 + Math.random() * 0.6);
        window.scrollBy({ top: scrollDelta, behavior: 'smooth' });
        const waitTime = 1200 + Math.random() * 1500;
        setTimeout(resolve, waitTime);
      });

      const checkNovel = (bms) => new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'CHECK_NEW_BOOKMARKS', bookmarks: bms }, (res) => {
          resolve(res?.newCount || 0);
        });
      });

      while (isAutoScrolling) {
        const currentBms = extractScreen();
        currentBms.forEach(bm => allBookmarksMap.set(bm.url, bm));
        btnElement.innerHTML = `🛑 停止抓取并打包 (准备保存 ${allBookmarksMap.size})`;

        // 如果不是深度模式，才执行增量中断逻辑
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

        // 检测由于推特限制懒加载卡住的情况或者真到底部了 (深度爬取主要靠这个停止)
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
      otherBtn.disabled = false;
      otherBtn.style.opacity = '1';
      otherBtn.innerText = originalOtherText;

      const finalBookmarks = Array.from(allBookmarksMap.values());
      btnElement.innerText = `⏳ 正在打包 ${finalBookmarks.length} 条...`;
      saveBookmarks(finalBookmarks, btnElement, isDeepMode ? '🌋 深度全量滚屏 (强制扫到底)' : '🚀 增量滚屏抓取 (追平即停)');
    };

    btnAll.onclick = () => autoScrollAndExtract(btnAll, false);
    btnDeepAll.onclick = () => autoScrollAndExtract(btnDeepAll, true);

    function saveBookmarks(bookmarks, btnElement, originalText) {
      if (bookmarks.length === 0) {
        btnElement.innerText = '❌ 未找到推文';
        setTimeout(() => { btnElement.innerText = originalText; }, 2000);
        return;
      }

      const uniqueBookmarks = Array.from(new Map(bookmarks.map(item => [item.url, item])).values());

      btnElement.innerText = `⏳ 正在保存 ${uniqueBookmarks.length} 条...`;

      chrome.runtime.sendMessage({
        type: 'SAVE_TWITTER_BOOKMARKS',
        bookmarks: uniqueBookmarks
      }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          btnElement.innerText = '❌ 保存失败';
        } else {
          btnElement.innerText = `✅ 成功导入 ${res.added} 条新书签`;
        }
        setTimeout(() => { btnElement.innerText = originalText; }, 3000);
      });
    }

    container.appendChild(btnCurrent);
    container.appendChild(btnAll);
    container.appendChild(btnDeepAll);
    document.body.appendChild(container);
  }

  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      checkUrl();
    }
  }).observe(document, { subtree: true, childList: true });

  function checkUrl() {
    if (window.location.pathname.includes('/i/bookmarks')) {
      createTwitterSyncUI();
    } else {
      const el = document.getElementById('ai-bookmark-sync-container');
      if (el) el.remove();
    }
  }

  checkUrl();
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
