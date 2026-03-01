// Twitter/X GraphQL API 书签抓取模块
// 替代原有的 DOM 滚动抓取方案，使用 Cursor 分页的纯 API 请求

/**
 * TwitterBookmarkFetcher
 * 
 * 核心原理：逆向调用 Twitter 前端的内部 GraphQL API，
 * 使用 Cursor 游标进行分页请求，无需渲染或滚动网页。
 * 
 * 在 Chrome 插件环境下，请求自带用户真实 Cookie、TLS 指纹等，
 * 对 Twitter 服务器而言等同于正常前端请求。
 */
class TwitterBookmarkFetcher {
    constructor() {
        // Twitter 公共 Bearer Token（所有用户共用，相对稳定）
        this.BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

        // GraphQL query_id（Twitter 前端部署时可能会变，需要定期更新）
        this.BOOKMARKS_QUERY_ID = 'VFdMm9iVZxlU6hD86gfW_A';

        // GraphQL features 参数（功能开关，保持与前端一致）
        this.FEATURES = {
            rweb_video_screen_enabled: false,
            profile_label_improvements_pcf_label_in_post_enabled: true,
            responsive_web_profile_redirect_enabled: false,
            rweb_tipjar_consumption_enabled: false,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            premium_content_api_read_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            responsive_web_grok_analyze_button_fetch_trends_enabled: false,
            responsive_web_grok_analyze_post_followups_enabled: true,
            responsive_web_jetfuel_frame: true,
            responsive_web_grok_share_attachment_enabled: true,
            responsive_web_grok_annotations_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            content_disclosure_indicator_enabled: false,
            content_disclosure_ai_generated_indicator_enabled: false,
            responsive_web_grok_show_grok_translated_post: false,
            responsive_web_grok_analysis_button_from_backend: true,
            post_ctas_fetch_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_grok_image_annotation_enabled: true,
            responsive_web_grok_imagine_annotation_enabled: true,
            responsive_web_grok_community_note_auto_translation_is_enabled: false,
            responsive_web_enhance_cards_enabled: false
        };

        // 抓取状态
        this.isFetching = false;
        this.abortController = null;

        // 进度回调
        this.onProgress = null;
    }

    /**
     * 从浏览器 Cookie 中获取 ct0 (CSRF Token)
     */
    async getCsrfToken() {
        return new Promise((resolve, reject) => {
            chrome.cookies.get({ url: 'https://x.com', name: 'ct0' }, (cookie) => {
                if (chrome.runtime.lastError) {
                    reject(new Error('获取 ct0 Cookie 失败: ' + chrome.runtime.lastError.message));
                    return;
                }
                if (cookie && cookie.value) {
                    resolve(cookie.value);
                } else {
                    reject(new Error('未找到 ct0 Cookie，请确保已登录 Twitter/X'));
                }
            });
        });
    }

    /**
     * 从浏览器 Cookie 中获取 auth_token
     */
    async getAuthToken() {
        return new Promise((resolve, reject) => {
            chrome.cookies.get({ url: 'https://x.com', name: 'auth_token' }, (cookie) => {
                if (chrome.runtime.lastError) {
                    reject(new Error('获取 auth_token Cookie 失败: ' + chrome.runtime.lastError.message));
                    return;
                }
                if (cookie && cookie.value) {
                    resolve(cookie.value);
                } else {
                    reject(new Error('未找到 auth_token Cookie，请确保已登录 Twitter/X'));
                }
            });
        });
    }

    /**
     * 构造 GraphQL API 请求
     * @param {string|null} cursor - 分页游标，首页传 null
     * @param {number} count - 每页数量
     * @returns {string} 完整的请求 URL
     */
    buildRequestUrl(cursor, count = 20) {
        const variables = { count, includePromotedContent: true };
        if (cursor) {
            variables.cursor = cursor;
        }

        const params = new URLSearchParams({
            variables: JSON.stringify(variables),
            features: JSON.stringify(this.FEATURES)
        });

        return `https://x.com/i/api/graphql/${this.BOOKMARKS_QUERY_ID}/Bookmarks?${params.toString()}`;
    }

    /**
     * 发送单次 GraphQL API 请求
     */
    async fetchPage(cursor, csrfToken) {
        const url = this.buildRequestUrl(cursor);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${this.BEARER_TOKEN}`,
                'content-type': 'application/json',
                'x-csrf-token': csrfToken,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-client-language': 'zh-cn'
            },
            credentials: 'include' // 自动带上浏览器的 Cookie
        });

        if (response.status === 429) {
            throw new RateLimitError('Twitter API 频率限制 (429)，请稍后重试');
        }

        if (response.status === 401 || response.status === 403) {
            throw new AuthError(`鉴权失败 (${response.status})，请确保已登录 Twitter/X`);
        }

        if (!response.ok) {
            throw new Error(`API 请求失败: HTTP ${response.status}`);
        }

        return await response.json();
    }

    /**
     * 从 GraphQL JSON 响应中解析出推文数据和下一页游标
     * @param {Object} json - API 响应 JSON
     * @returns {{ tweets: Array, nextCursor: string|null }}
     */
    parseResponse(json) {
        const tweets = [];
        let nextCursor = null;

        try {
            // 导航到 timeline entries
            const instructions = json?.data?.bookmark_timeline_v2?.timeline?.instructions || [];

            for (const instruction of instructions) {
                if (instruction.type !== 'TimelineAddEntries') continue;

                const entries = instruction.entries || [];

                for (const entry of entries) {
                    const entryId = entry.entryId || '';

                    // 推文条目
                    if (entryId.startsWith('tweet-')) {
                        const tweet = this.parseTweetEntry(entry);
                        if (tweet) {
                            tweets.push(tweet);
                        }
                    }

                    // 底部游标（用于翻页）
                    if (entryId.startsWith('cursor-bottom')) {
                        nextCursor = entry.content?.value || null;
                    }
                }
            }
        } catch (e) {
            console.error('❌ 解析 GraphQL 响应失败:', e);
        }

        return { tweets, nextCursor };
    }

    /**
     * 解析单条推文条目
     */
    parseTweetEntry(entry) {
        try {
            const tweetResult = entry.content?.itemContent?.tweet_results?.result;
            if (!tweetResult) return null;

            // 处理嵌套的 tweet 结构
            // Twitter GraphQL 可能返回不同的 __typename:
            //   - "Tweet" → result 就是 tweet
            //   - "TweetWithVisibilityResults" → result.tweet 才是 tweet
            const tweet = tweetResult.tweet || tweetResult;
            const legacy = tweet.legacy;
            if (!legacy) return null;

            // 用户信息 — 尝试多种 JSON 路径
            // GraphQL 新版将 name 和 screen_name 放在 core 里，旧版在 legacy 里，头像也从 legacy 移到了 avatar 对象
            const userResult =
                tweet.core?.user_results?.result ||
                tweetResult.core?.user_results?.result ||
                tweet.user_results?.result ||
                null;

            let authorName = '';
            let authorScreenName = '';
            let authorAvatar = '';

            if (userResult) {
                const uCore = userResult.core || {};
                const uLegacy = userResult.legacy || {};

                authorName = uCore.name || uLegacy.name || '';
                authorScreenName = uCore.screen_name || uLegacy.screen_name || '';
                authorAvatar = userResult.avatar?.image_url || uLegacy.profile_image_url_https || uLegacy.profile_image_url || '';
            }

            // 如果仍然没有拿到作者名，尝试从 legacy.user_id_str 提取
            const finalAuthorName = authorName || (legacy.user_id_str ? `user_${legacy.user_id_str}` : '未知');
            const finalScreenName = authorScreenName || '';

            if (!authorName) {
                console.warn('⚠️ 推文作者信息缺失, __typename:', tweetResult.__typename,
                    ', keys:', Object.keys(tweet).join(','),
                    ', core?:', !!tweet.core);
            }

            // 推文文本（优先 note_tweet 长文本）
            let fullText = '';
            const noteTweet = tweet.note_tweet?.note_tweet_results?.result;
            if (noteTweet && noteTweet.text) {
                fullText = noteTweet.text;
            } else {
                fullText = legacy.full_text || '';
            }

            // 清理 t.co 短链接的显示文本
            fullText = fullText.replace(/https:\/\/t\.co\/\w+/g, '').trim();

            // 推文 URL
            const tweetId = legacy.id_str || tweet.rest_id;
            const tweetUrl = finalScreenName
                ? `https://x.com/${finalScreenName}/status/${tweetId}`
                : `https://x.com/i/web/status/${tweetId}`;

            // 媒体信息
            let mediaUrl = '';
            let videoUrl = '';
            let isVideo = false;
            const mediaEntities = legacy.extended_entities?.media || legacy.entities?.media || [];
            if (mediaEntities.length > 0) {
                const firstMedia = mediaEntities[0];
                mediaUrl = firstMedia.media_url_https || firstMedia.media_url || '';

                if (firstMedia.type === 'video' || firstMedia.type === 'animated_gif') {
                    isVideo = true;
                    if (firstMedia.video_info && firstMedia.video_info.variants) {
                        const variants = firstMedia.video_info.variants.filter(v => v.content_type === 'video/mp4');
                        if (variants.length > 0) {
                            variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                            videoUrl = variants[0].url;
                        } else {
                            if (firstMedia.video_info.variants.length > 0) {
                                videoUrl = firstMedia.video_info.variants[0].url;
                            }
                        }
                    }
                }
            }

            // 互动数据
            const retweets = this.formatCount(legacy.retweet_count);
            const likes = this.formatCount(legacy.favorite_count);
            const views = this.formatCount(tweet.views?.count);
            const replies = this.formatCount(legacy.reply_count);
            const bookmarkCount = this.formatCount(legacy.bookmark_count);

            // 时间
            const createdAt = legacy.created_at || '';

            // 构造与原 content.js 兼容的格式
            const displayText = fullText || '图片/视频推文';
            const truncatedText = displayText.substring(0, 120) + (displayText.length > 120 ? '...' : '');

            const title = `[X推文] ${finalAuthorName}: ${truncatedText}`;
            const metadataObj = { mediaUrl, videoUrl, isVideo, retweets, likes, views, replies, bookmarkCount, createdAt, authorAvatar, fullText };
            const hiddenData = ' \u200B' + JSON.stringify(metadataObj) + '\u200B';

            return {
                title: title + hiddenData,
                url: tweetUrl
            };
        } catch (e) {
            console.error('❌ 解析推文条目失败:', e);
            return null;
        }
    }

    /**
     * 格式化计数值
     */
    formatCount(count) {
        if (count === undefined || count === null) return '-';
        const num = parseInt(count, 10);
        if (isNaN(num)) return '-';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    /**
     * 随机延迟（模拟人类翻页节奏）
     * @param {number} minMs - 最小延迟毫秒
     * @param {number} maxMs - 最大延迟毫秒
     */
    async randomDelay(minMs = 1500, maxMs = 3500) {
        const delay = minMs + Math.random() * (maxMs - minMs);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * 全量抓取所有书签（Deep 模式）
     * @param {Function} onProgress - 进度回调 (fetchedCount, pageNumber, status)
     * @param {Function} onSaveBatch - 每批保存回调 (tweetsToSave) → Promise<number>
     * @returns {Promise<{total: number, added: number}>}
     */
    async fetchAllBookmarks(onProgress, onSaveBatch) {
        if (this.isFetching) {
            throw new Error('已有抓取任务进行中');
        }

        this.isFetching = true;
        this.syncMode = 'deep';
        this.currentPage = 0;
        this.totalFetched = 0;
        this.totalAdded = 0;
        this.abortController = new AbortController();

        try {
            const csrfToken = await this.getCsrfToken();
            console.log('🔑 已获取 CSRF Token');

            const seenUrls = new Set(); // 本次抓取已见过的 URL
            let cursor = null;
            let noNewCount = 0;     // 连续没有新(去重后)推文的页数
            let retryCount = 0;
            const MAX_NO_NEW = 3;   // 连续 3 页无新内容则停止
            const MAX_RETRIES = 3;
            let pendingBatch = [];  // 待保存的批次
            const SAVE_EVERY = 3;   // 每 3 页保存一次

            while (this.isFetching) {
                this.currentPage++;
                console.log(`📄 正在获取第 ${this.currentPage} 页...${cursor ? ' (cursor: ' + cursor.substring(0, 20) + '...)' : ' (首页)'}`);

                try {
                    const json = await this.fetchPage(cursor, csrfToken);
                    const { tweets, nextCursor } = this.parseResponse(json);

                    // 去重统计本页实际新增
                    let newInPage = 0;
                    for (const tweet of tweets) {
                        if (!seenUrls.has(tweet.url)) {
                            seenUrls.add(tweet.url);
                            pendingBatch.push(tweet);
                            newInPage++;
                        }
                    }
                    this.totalFetched = seenUrls.size;

                    console.log(`✅ 第 ${this.currentPage} 页: API 返回 ${tweets.length} 条, 新增 ${newInPage} 条 (累计 ${this.totalFetched})`);

                    // 每 SAVE_EVERY 页保存一批到 Chrome 书签
                    if (onSaveBatch && pendingBatch.length > 0 && this.currentPage % SAVE_EVERY === 0) {
                        const batchAdded = await onSaveBatch(pendingBatch);
                        this.totalAdded += batchAdded;
                        console.log(`💾 批量保存: ${pendingBatch.length} 条中 ${batchAdded} 条新增`);
                        pendingBatch = [];
                    }

                    // 报告进度
                    if (onProgress) {
                        onProgress(this.totalFetched, this.currentPage, undefined, this.totalAdded);
                    }

                    // 没有下一页了
                    if (!nextCursor) {
                        console.log('🏁 已到达最后一页（无下一页游标）');
                        break;
                    }

                    // 终止条件：本页没有新的去重后推文
                    if (newInPage === 0) {
                        noNewCount++;
                        console.log(`⚠️ 第 ${this.currentPage} 页无新内容 (连续 ${noNewCount}/${MAX_NO_NEW})`);
                        if (noNewCount >= MAX_NO_NEW) {
                            console.log('🏁 连续多页无新数据，停止抓取');
                            break;
                        }
                    } else {
                        noNewCount = 0;
                    }

                    // 额外检查：如果 API 本身就返回 0 条推文（cursor 还在但没有内容）
                    if (tweets.length === 0) {
                        retryCount++;
                        if (retryCount >= MAX_RETRIES) {
                            console.log('🏁 API 连续返回空数据，停止');
                            break;
                        }
                    } else {
                        retryCount = 0;
                    }

                    cursor = nextCursor;

                    // 随机延迟，避免触发频率限制
                    await this.randomDelay(1500, 3500);

                } catch (error) {
                    if (error instanceof RateLimitError) {
                        console.warn('⏳ 遭遇频率限制，等待 60 秒后重试...');
                        if (onProgress) {
                            onProgress(this.totalFetched, this.currentPage, 'rate_limited', this.totalAdded);
                        }
                        await this.randomDelay(60000, 75000);
                        retryCount++;
                        if (retryCount >= MAX_RETRIES) {
                            throw new Error('多次遭遇频率限制，请稍后再试');
                        }
                        continue;
                    }
                    throw error;
                }
            }

            // 保存剩余未提交的批次
            if (onSaveBatch && pendingBatch.length > 0) {
                const batchAdded = await onSaveBatch(pendingBatch);
                this.totalAdded += batchAdded;
                console.log(`💾 最终批次保存: ${pendingBatch.length} 条中 ${batchAdded} 条新增`);
            }

            console.log(`🎉 抓取完成！共获取 ${this.totalFetched} 条，新增 ${this.totalAdded} 条`);
            return { total: this.totalFetched, added: this.totalAdded };

        } finally {
            this.isFetching = false;
            this.syncMode = null;
            this.abortController = null;
        }
    }

    /**
     * 增量抓取（遇到已存在的书签后停止）
     * @param {Set<string>} existingUrls - 已有书签的 URL 集合
     * @param {Function} onProgress - 进度回调
     * @param {Function} onSaveBatch - 每批保存回调 (tweetsToSave) → Promise<number>
     * @returns {Promise<{total: number, added: number}>}
     */
    async fetchIncrementalBookmarks(existingUrls, onProgress, onSaveBatch) {
        if (this.isFetching) {
            throw new Error('已有抓取任务进行中');
        }

        this.isFetching = true;
        this.syncMode = 'incremental';
        this.currentPage = 0;
        this.totalFetched = 0;
        this.totalAdded = 0;
        this.abortController = new AbortController();

        try {
            const csrfToken = await this.getCsrfToken();
            console.log('🔑 已获取 CSRF Token (增量模式)');

            const seenUrls = new Set();
            let cursor = null;
            let consecutiveOldPages = 0;
            const MAX_OLD_PAGES = 3;
            let pendingBatch = [];
            const SAVE_EVERY = 3;

            while (this.isFetching) {
                this.currentPage++;
                console.log(`📄 [增量] 正在获取第 ${this.currentPage} 页...`);

                try {
                    const json = await this.fetchPage(cursor, csrfToken);
                    const { tweets, nextCursor } = this.parseResponse(json);

                    let newInPage = 0;
                    for (const tweet of tweets) {
                        if (!existingUrls.has(tweet.url) && !seenUrls.has(tweet.url)) {
                            seenUrls.add(tweet.url);
                            pendingBatch.push(tweet);
                            newInPage++;
                        }
                    }
                    this.totalFetched = seenUrls.size;

                    console.log(`✅ [增量] 第 ${this.currentPage} 页: ${tweets.length} 条推文, 其中 ${newInPage} 条是新的 (累计 ${this.totalFetched})`);

                    // 每 SAVE_EVERY 页保存一批
                    if (onSaveBatch && pendingBatch.length > 0 && this.currentPage % SAVE_EVERY === 0) {
                        const batchAdded = await onSaveBatch(pendingBatch);
                        this.totalAdded += batchAdded;
                        // 将已保存的 URL 加入 existingUrls 避免后续重复
                        pendingBatch.forEach(t => existingUrls.add(t.url));
                        pendingBatch = [];
                    }

                    if (onProgress) {
                        onProgress(this.totalFetched, this.currentPage, undefined, this.totalAdded);
                    }

                    // 检查是否全是旧的
                    if (newInPage === 0 && tweets.length > 0) {
                        consecutiveOldPages++;
                        if (consecutiveOldPages >= MAX_OLD_PAGES) {
                            console.log('🏁 [增量] 连续 3 页无新书签，增量同步完成');
                            break;
                        }
                    } else {
                        consecutiveOldPages = 0;
                    }

                    if (!nextCursor) {
                        console.log('🏁 [增量] 已到达最后一页');
                        break;
                    }

                    cursor = nextCursor;
                    await this.randomDelay(1500, 3500);

                } catch (error) {
                    if (error instanceof RateLimitError) {
                        console.warn('⏳ [增量] 遭遇频率限制，等待 60 秒...');
                        if (onProgress) {
                            onProgress(this.totalFetched, this.currentPage, 'rate_limited', this.totalAdded);
                        }
                        await this.randomDelay(60000, 75000);
                        continue;
                    }
                    throw error;
                }
            }

            // 保存剩余批次
            if (onSaveBatch && pendingBatch.length > 0) {
                const batchAdded = await onSaveBatch(pendingBatch);
                this.totalAdded += batchAdded;
            }

            console.log(`🎉 [增量] 完成！共发现 ${this.totalFetched} 条新书签，新增 ${this.totalAdded} 条`);
            return { total: this.totalFetched, added: this.totalAdded };

        } finally {
            this.isFetching = false;
            this.syncMode = null;
            this.abortController = null;
        }
    }

    /**
     * 停止抓取
     */
    stop() {
        this.isFetching = false;
        if (this.abortController) {
            this.abortController.abort();
        }
        console.log('🛑 抓取已停止');
    }
}

// 自定义错误类型
class RateLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RateLimitError';
    }
}

class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

// 导出供 background_offscreen.js 使用
// 在 Service Worker 环境中，通过 importScripts 引入
if (typeof self !== 'undefined') {
    self.TwitterBookmarkFetcher = TwitterBookmarkFetcher;
    self.RateLimitError = RateLimitError;
    self.AuthError = AuthError;
}
