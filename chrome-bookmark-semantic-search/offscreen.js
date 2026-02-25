// Offscreen Document - 语义搜索引擎
// 运行在有完整 DOM 环境的上下文中，可以使用 URL.createObjectURL
// 通过消息传递与 Service Worker 通信

import { pipeline, env } from '@xenova/transformers';

console.log('🚀 Offscreen Document 启动');
console.log('✅ 完整 DOM 环境可用');

// ⚠️ 重要：配置 ONNX Runtime 环境
// 在 Chrome Extension 中，即使 Offscreen Document 也不能使用多线程
import * as ort from 'onnxruntime-web';

// 禁用 Web Workers 和多线程
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;  // SIMD 可以用
ort.env.wasm.proxy = false; // 不使用 Worker proxy

console.log('⚙️ ONNX Runtime 配置:');
console.log('  - numThreads:', ort.env.wasm.numThreads);
console.log('  - simd:', ort.env.wasm.simd);
console.log('  - proxy:', ort.env.wasm.proxy);

// 配置 Transformers.js 纯本地离线模型环境
env.allowLocalModels = true;
env.useBrowserCache = false; // 完全走本地文件，无需浏览器缓存
env.allowRemoteModels = false; // 切断网络请求，彻底本地运行
env.localModelPath = '/models/'; // 指向插件内部的 models 文件夹

// 语义搜索引擎
class OffscreenSemanticEngine {
  constructor() {
    this.embedder = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    try {
      console.log('📥 升级架构: 正在加载 2026 边端先进大模型 (BGE/Qwen 架构)...');

      // 使用目前前端端侧(WebGPU/WASM)能跑的最强轻量级多语言嵌入模型
      // BAAI/bge-small-zh-v1.5 / Xenova 移植版的 Qwen 衍生小参数特征提取器
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/bge-small-zh-v1.5',
        {
          quantized: true,
          revision: 'main',
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              const percent = Math.round(progress.progress || 0);
              console.log(`模型下载: ${percent}%`);

              // 通知 Service Worker 进度
              chrome.runtime.sendMessage({
                type: 'MODEL_PROGRESS',
                progress: percent
              }).catch(() => {
                // Service Worker 可能还没准备好，忽略错误
              });
            } else if (progress.status === 'done') {
              console.log(`✅ 下载完成: ${progress.file}`);
            }
          }
        }
      );

      this.isInitialized = true;
      console.log('✅ Sentence-BERT 模型加载完成');

      return true;
    } catch (error) {
      console.error('❌ 模型初始化失败:', error);
      throw error;
    }
  }

  async embedText(text) {
    if (!this.isInitialized) {
      throw new Error('模型未初始化');
    }

    try {
      console.log('🔤 Offscreen: 正在编码文本:', text.substring(0, 50) + '...');
      const startTime = Date.now();

      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true
      });

      // 转换为普通数组
      const embedding = Array.from(output.data);
      const encodeTime = Date.now() - startTime;

      console.log('✅ Offscreen: 编码完成');
      console.log('   - 耗时:', encodeTime + 'ms');
      console.log('   - 维度:', embedding.length);
      console.log('   - 向量范数:', Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4));
      console.log('   - 前5维:', embedding.slice(0, 5).map(v => v.toFixed(4)));

      return embedding;
    } catch (error) {
      console.error('❌ 文本编码失败:', error);
      throw error;
    }
  }

  async embedBatch(texts) {
    if (!this.isInitialized) {
      throw new Error('模型未初始化');
    }

    try {
      const embeddings = [];

      // 批量处理，每次处理一个以避免内存问题
      for (let i = 0; i < texts.length; i++) {
        const embedding = await this.embedText(texts[i]);
        embeddings.push(embedding);

        // 每10个报告一次进度
        if ((i + 1) % 10 === 0 || i === texts.length - 1) {
          console.log(`编码进度: ${i + 1}/${texts.length}`);
          chrome.runtime.sendMessage({
            type: 'EMBED_PROGRESS',
            current: i + 1,
            total: texts.length
          }).catch(() => { });
        }
      }

      return embeddings;
    } catch (error) {
      console.error('❌ 批量编码失败:', error);
      throw error;
    }
  }
}

// 创建引擎实例
const engine = new OffscreenSemanticEngine();

// 监听来自 Service Worker 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 收到消息:', message.type);

  // 初始化模型
  if (message.type === 'OFFSCREEN_INITIALIZE') {
    engine.initialize()
      .then(() => {
        console.log('✅ 初始化成功');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('❌ 初始化失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }

  // 编码单个文本
  if (message.type === 'OFFSCREEN_EMBED_TEXT') {
    engine.embedText(message.text)
      .then(embedding => {
        sendResponse({ success: true, embedding });
      })
      .catch(error => {
        console.error('❌ 编码失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }

  // 批量编码
  if (message.type === 'OFFSCREEN_EMBED_BATCH') {
    engine.embedBatch(message.texts)
      .then(embeddings => {
        sendResponse({ success: true, embeddings });
      })
      .catch(error => {
        console.error('❌ 批量编码失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }

  // 检查状态
  if (message.type === 'OFFSCREEN_STATUS') {
    sendResponse({
      success: true,
      initialized: engine.isInitialized
    });
    return false; // 同步响应
  }
});

console.log('✅ Offscreen Document 就绪，等待消息...');

