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
    btnAll.innerHTML = '🚀 自动滚屏抓取全部';
    btnAll.style = btnStyle + 'background: #10b981; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);';

    [btnCurrent, btnAll].forEach(btn => {
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
          const title = `[X推文] ${authorInfo}: ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
          bookmarks.push({ title, url: tweetUrl });
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

    // 全自动滚屏提取事件（增量 + 仿生学防封）
    btnAll.onclick = async () => {
      if (isAutoScrolling) {
        isAutoScrolling = false; // 中断标志
        btnAll.innerText = '🛑 正在停止...';
        return;
      }
      isAutoScrolling = true;
      btnAll.innerHTML = '🛑 停止抓取并打包 (已抓 0)';

      const allBookmarksMap = new Map();
      let lastSize = 0;
      let noGrowthCount = 0;
      let zeroNovelCount = 0;

      // 仿人类平滑随机滚动
      const scrollAndWait = () => new Promise(resolve => {
        const scrollDelta = window.innerHeight * (0.6 + Math.random() * 0.6); // 每次拉动屏幕 60%~120%
        window.scrollBy({ top: scrollDelta, behavior: 'smooth' });
        const waitTime = 1200 + Math.random() * 1500; // 随机停顿 1.2秒 到 2.7秒
        setTimeout(resolve, waitTime);
      });

      // 借由后台接口核对当前屏幕的数据有几条是"全新"的
      const checkNovel = (bms) => new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'CHECK_NEW_BOOKMARKS', bookmarks: bms }, (res) => {
          resolve(res?.newCount || 0);
        });
      });

      while (isAutoScrolling) {
        // 1. 提取当前屏
        const currentBms = extractScreen();
        currentBms.forEach(bm => allBookmarksMap.set(bm.url, bm));
        btnAll.innerHTML = `🛑 停止抓取并打包 (准备保存 ${allBookmarksMap.size})`;

        // 2. 检测增量：判断是否遇到了之前已经保存过的大批旧收藏
        if (currentBms.length > 0) {
          const novelCount = await checkNovel(currentBms);
          if (novelCount === 0) {
            zeroNovelCount++;
            if (zeroNovelCount >= 3) {
              console.log('增量同步触发：当前屏幕往下连续3页都已经是本地拥有的旧收藏，停止自动爬取。');
              break; // 断开，实现增量抓取极限性能
            }
          } else {
            zeroNovelCount = 0;
          }
        }

        // 3. 检测是否到底部或没有新内容
        if (allBookmarksMap.size === lastSize) {
          noGrowthCount++;
          if (noGrowthCount >= 4) { // 连续4次滚动总数没涨认为见底
            console.log('增量同步触发：推特书签已全部加到底部。');
            break;
          }
        } else {
          noGrowthCount = 0;
        }
        lastSize = allBookmarksMap.size;

        // 4. 继续滚页面
        await scrollAndWait();
      }

      // 结束循环，提交数据
      isAutoScrolling = false;
      const finalBookmarks = Array.from(allBookmarksMap.values());
      btnAll.innerText = `⏳ 正在打包 ${finalBookmarks.length} 条...`;
      saveBookmarks(finalBookmarks, btnAll, '🚀 自动滚屏抓取全部');
    };

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
