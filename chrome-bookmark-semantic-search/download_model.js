const https = require('https');
const fs = require('fs');
const path = require('path');

const baseUrl = 'https://hf-mirror.com/Xenova/bge-small-zh-v1.5/resolve/main/';
const files = [
    'config.json',
    'tokenizer_config.json',
    'tokenizer.json',
    'vocab.txt',
    'special_tokens_map.json',
    'onnx/model_quantized.onnx'
];

const basePath = path.join(__dirname, 'models', 'Xenova', 'bge-small-zh-v1.5');

function download(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return download(response.headers.location, dest).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

(async () => {
    console.log("开始下载内置模型，请稍候... (大约 25MB)");
    for (const file of files) {
        const dest = path.join(basePath, file);
        if (!fs.existsSync(path.dirname(dest))) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
        }
        if (fs.existsSync(dest)) {
            console.log(`跳过 ${file} (已存在)`);
            continue;
        }
        console.log(`正在下载 ${file} ...`);
        try {
            await download(baseUrl + file, dest);
            console.log(`✅ 完成: ${file}`);
        } catch (e) {
            console.error(`❌ 下载失败 ${file}:`, e);
        }
    }
    console.log("全部模型权重及配置下载完成！");
})();
