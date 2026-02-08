/**
 * JZ API 代理服务 - 对接匠紫 AI高清处理 (imageUpscale)
 * API Key (appKey) 保存在服务端，不暴露在插件中
 * 配置：复制 .env.example 为 .env，填入 JZ_APP_KEY
 * 运行：cd proxy && npm install && npm start
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { IncomingForm } = require('formidable');

const PORT = process.env.PORT || 3030;
const JZ_APP_KEY = process.env.JZ_APP_KEY;
const PROXY_PUBLIC_URL = process.env.PROXY_PUBLIC_URL; // 代理公网地址，用于生成 JZ 可访问的图片 URL
const FORCE_DATA_URL = process.env.FORCE_DATA_URL === 'true'; // 强制 data URL，用于排查 ngrok 拉图失败
const USE_TEMP_HOST = process.env.USE_TEMP_HOST === 'true'; // 使用临时图床（0x0.st/transfer.sh/catbox），需服务可用；默认用 ngrok
const IMGBB_API_KEY = process.env.IMGBB_API_KEY; // 优先使用 ImgBB 图床，匠紫可稳定拉图（Railway 等部署时推荐）
const UPYUN_BUCKET = process.env.UPYUN_BUCKET; // 又拍云存储空间，国内 CDN 匠紫可稳定拉图
const UPYUN_OPERATOR = process.env.UPYUN_OPERATOR; // 又拍云操作员名
const UPYUN_PASSWORD = process.env.UPYUN_PASSWORD; // 又拍云操作员密码（明文，代码内会 MD5）
const UPYUN_DOMAIN = process.env.UPYUN_DOMAIN; // 又拍云加速域名，不填则用 bucket.b0.upaiyun.com
const JZ_BASE = 'https://api.jiangziai.com/task';
const JZ_TASK_PATH = process.env.JZ_TASK_RESULT_PATH || '/foreign/getApiJob';
const JZ_TASK_ALT = '/foreign/taskResult';
const tempImages = new Map();

if (!JZ_APP_KEY) {
  console.error('请在 proxy/.env 中配置 JZ_APP_KEY');
  process.exit(1);
}

/** 解析 multipart/form-data 获取 image 文件 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm();
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const file = Array.isArray(files.image) ? files.image[0] : files.image;
      if (!file?.filepath) return resolve(null);
      const fs = require('fs');
      try {
        resolve(fs.readFileSync(file.filepath));
      } finally {
        try { fs.unlinkSync(file.filepath); } catch (_) {}
      }
    });
  });
}

/** 发起 HTTP(S) 请求 */
function request(options, body) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        body: Buffer.concat(chunks),
        headers: res.headers,
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** 提交高清化任务 */
async function submitUpscale(imgDataUrl, ratio = 2) {
  const body = JSON.stringify({
    imgUrl: imgDataUrl,
    ratio: Math.min(4, Math.max(1, ratio)),
  });
  const u = new URL(JZ_BASE + '/foreign/imageUpscale');
  const res = await request({
    hostname: u.hostname,
    port: 443,
    path: u.pathname,
    method: 'POST',
    protocol: 'https:',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'appKey': JZ_APP_KEY,
    },
  }, body);

  const json = JSON.parse(res.body.toString());
  if (json.code !== '0') {
    throw new Error(json.msg || '提交任务失败');
  }
  const jobId = json.data?.jobId;
  if (!jobId) {
    console.error('提交响应:', JSON.stringify(json));
    throw new Error('未获取到 jobId');
  }
  console.log('[submit] jobId:', jobId, 'data:', JSON.stringify(json.data));
  return jobId;
}

/** 轮询任务结果 - 依次尝试 POST getApiJob、GET taskResult?jobId、GET taskResult?taskId */
async function pollTaskResult(jobId, maxAttempts = 60, intervalMs = 2000) {
  const tryQuery = async (path, method, body) => {
    const fullPath = path.startsWith('/') ? path : '/' + path;
    const url = JZ_BASE + fullPath;
    const u = new URL(url);
    const headers = { appKey: JZ_APP_KEY };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    return request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + (u.search || ''),
      method,
      protocol: 'https:',
      headers,
    }, body);
  };

  // 匠紫拉图+处理需要时间，延长初始等待
  await new Promise((r) => setTimeout(r, 15000));

  for (let i = 0; i < maxAttempts; i++) {
    const attempts = [
      () => tryQuery(JZ_TASK_PATH, 'POST', JSON.stringify({ jobId })),
      () => tryQuery(JZ_TASK_ALT + '?jobId=' + encodeURIComponent(jobId), 'GET', null),
      () => tryQuery(JZ_TASK_ALT + '?taskId=' + encodeURIComponent(jobId), 'GET', null),
    ];

    let lastErr = null;
    for (let ai = 0; ai < attempts.length; ai++) {
      const attempt = attempts[ai];
      let res;
      try {
        res = await attempt();
      } catch (e) {
        lastErr = e;
        console.log(`[poll] 方式${ai + 1} 请求异常:`, e.message);
        continue;
      }
      const bodyStr = res.body.toString();
      if (!bodyStr || bodyStr.trim() === '') {
        console.log(`[poll] 方式${ai + 1} 返回空`);
        continue;
      }
      let json;
      try {
        json = JSON.parse(bodyStr);
      } catch (e) {
        console.log(`[poll] 方式${ai + 1} 非JSON:`, bodyStr.slice(0, 100));
        continue;
      }
      if (json.code !== '0') {
        lastErr = new Error(json.msg || '查询任务失败');
        console.log(`[poll] 方式${ai + 1} code=${json.code} msg=${json.msg || ''}`);
        if (json.msg && json.msg.includes('不存在')) continue;
        throw lastErr;
      }
      const { jobStatus: status, result } = json.data || {};
      if (status === 3) throw new Error('任务失败');
      if (status === 1 || status === 2) {
        const url = result?.data?.imgUrl ?? (Array.isArray(result?.data) ? result.data[0] : result?.data) ?? result?.url ?? result?.imgUrl ?? result?.imageUrl ?? (typeof result === 'string' ? result : null) ?? result?.outputUrl;
        if (url) return url;
      }
    }

    // 「指定的任务不存在」通常因匠紫无法拉取图床 URL，多给重试机会
    if (lastErr && lastErr.message.includes('不存在') && i < 40) {
      console.log(`[poll] 第${i + 1}次 任务不存在，${intervalMs}ms 后重试`);
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (lastErr) {
      const msg = lastErr.message.includes('不存在')
        ? '指定的任务不存在：匠紫可能无法拉取当前图床 URL，请尝试配置 UPYUN_* 或 IMGBB_API_KEY'
        : lastErr.message;
      throw new Error(msg);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('任务超时');
}

const USE_CATBOX = process.env.USE_CATBOX === 'true'; // 使用 catbox.moe 替代 0x0.st

/**
 * 使用 ImgBB 上传，返回公网 URL（匠紫可稳定拉图，推荐 Railway 部署使用）
 * API: POST https://api.imgbb.com/1/upload
 * 参数: key (必填), image (必填，base64/二进制/URL),
 *       name (可选), expiration (可选，60-15552000 秒)
 * 示例响应: { data: { url, image: { url }, ... }, success: true, status: 200 }
 */
async function uploadToImgbb(imageBuffer) {
  const base64 = imageBuffer.toString('base64');
  const boundary = '----ImgBB' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="key"${CRLF}${CRLF}${IMGBB_API_KEY}${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="image"${CRLF}${CRLF}`),
    Buffer.from(base64),
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);
  const res = await request({
    hostname: 'api.imgbb.com',
    port: 443,
    path: '/1/upload',
    method: 'POST',
    protocol: 'https:',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  }, body);
  const json = JSON.parse(res.body.toString());
  const url = json.data?.url || json.data?.image?.url;
  if (!json.success || !url) {
    throw new Error('ImgBB 上传失败: ' + (json.error?.message || json.data?.error?.message || JSON.stringify(json).slice(0, 100)));
  }
  return url;
}

/**
 * 又拍云 FORM API 上传，返回公网 URL（国内 CDN，匠紫可稳定拉图）
 * 文档：https://docs.upyun.com/api/form_api/
 */
async function uploadToUpyun(imageBuffer) {
  const bucket = UPYUN_BUCKET;
  const operator = UPYUN_OPERATOR;
  const passwordMd5 = crypto.createHash('md5').update(UPYUN_PASSWORD || '', 'utf8').digest('hex');
  const uri = '/' + bucket;
  const method = 'POST';
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + 30 * 60; // 30 分钟
  const date = new Date().toUTCString();
  const saveKey = '/hd/' + crypto.randomBytes(16).toString('hex') + '.png';
  const policyObj = { bucket, 'save-key': saveKey, expiration };
  const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64');
  const signStr = [method, uri, date, policy, ''].join('&');
  const signature = crypto.createHmac('sha1', passwordMd5).update(signStr, 'utf8').digest('base64');
  const authorization = 'UPYUN ' + operator + ':' + signature;

  const boundary = '----Upyun' + crypto.randomBytes(8).toString('hex');
  const CRLF = '\r\n';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="policy"${CRLF}${CRLF}${policy}${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="authorization"${CRLF}${CRLF}${authorization}${CRLF}`),
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="image.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`),
    imageBuffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`),
  ]);

  const res = await request({
    hostname: 'v0.api.upyun.com',
    port: 443,
    path: uri,
    method: 'POST',
    protocol: 'https:',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  }, body);

  const bodyStr = res.body.toString();
  if (res.statusCode !== 200) {
    throw new Error('又拍云上传失败: ' + (bodyStr.slice(0, 200) || res.statusCode));
  }
  let path = saveKey;
  try {
    const j = JSON.parse(bodyStr);
    if (j.url) path = j.url;
  } catch (_) {
    const urlMatch = bodyStr.match(/url=([^\s&]+)/);
    if (urlMatch) path = decodeURIComponent(urlMatch[1].replace(/\+/g, ' '));
  }
  const domain = UPYUN_DOMAIN || `${bucket}.b0.upaiyun.com`;
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  return baseUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}

/** 上传图片到临时图床获取公网 URL（免 ngrok，匠紫可稳定拉图） */
async function uploadToTempHost(imageBuffer) {
  if (USE_CATBOX) {
    return uploadToCatbox(imageBuffer);
  }
  return uploadToTransferSh(imageBuffer);
}

/** 使用 transfer.sh 上传 */
async function uploadToTransferSh(imageBuffer) {
  const res = await request({
    hostname: 'transfer.sh',
    port: 443,
    path: '/image.png',
    method: 'PUT',
    protocol: 'https:',
    headers: {
      'Content-Length': imageBuffer.length,
      'Content-Type': 'image/png',
    },
  }, imageBuffer);
  const url = res.body.toString().trim();
  if (res.statusCode !== 200 || !url.startsWith('http')) {
    throw new Error('transfer.sh 上传失败: ' + (res.body.toString().slice(0, 100) || res.statusCode));
  }
  return url;
}

/** 使用 catbox.moe 上传（Node 18+ fetch + FormData） */
async function uploadToCatbox(imageBuffer) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', new Blob([imageBuffer], { type: 'image/png' }), 'image.png');
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
  });
  const url = (await res.text()).trim();
  if (!res.ok || !url.startsWith('http')) {
    throw new Error('catbox.moe 上传失败: ' + (url.slice(0, 100) || res.status));
  }
  return url;
}

/** 下载图片 */
async function fetchImage(url) {
  const u = new URL(url);
  const res = await request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method: 'GET',
    protocol: u.protocol,
  });
  if (res.statusCode !== 200) throw new Error('下载图片失败');
  return res.body;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/temp/')) {
    const id = req.url.slice(6).split('?')[0];
    const buf = tempImages.get(id);
    if (buf) {
      tempImages.delete(id);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(buf);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  // 测试端点：通过公网图片 URL 测试 JZ API (POST /api/hd-test，JSON: { imageUrl })
  if (req.method === 'POST' && req.url === '/api/hd-test') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { imageUrl } = JSON.parse(body || '{}');
        if (!imageUrl || typeof imageUrl !== 'string') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少 imageUrl 参数' }));
          return;
        }
        console.log('[test] 使用公网图片 URL 直接提交:', imageUrl);
        // 匠紫 API 文档要求：接口入参的链接须不含防盗链且支持公网访问，优先使用公网 URL
        const jobId = await submitUpscale(imageUrl, 2);
        console.log('[test] 提交成功 jobId:', jobId);
        const resultUrl = await pollTaskResult(jobId);
        console.log('[test] 处理完成，结果 URL:', resultUrl);
        const imageBytes = await fetchImage(resultUrl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          jobId,
          resultUrl,
          resultSize: imageBytes.length,
        }));
      } catch (e) {
        console.error('[test] 错误:', e);
        res.writeHead(502);
        res.end(JSON.stringify({ error: e.message || '处理失败' }));
      }
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/hd') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let imageBuffer;
  try {
    imageBuffer = await parseMultipart(req);
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '解析请求失败' }));
    return;
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '未找到图片数据' }));
    return;
  }

  try {
    let imgUrl;
    if (UPYUN_BUCKET && UPYUN_OPERATOR && UPYUN_PASSWORD) {
      console.log('[img] 上传至又拍云...');
      imgUrl = await uploadToUpyun(imageBuffer);
      console.log('[img] 又拍云公网 URL:', imgUrl);
    } else if (IMGBB_API_KEY) {
      console.log('[img] 上传至 ImgBB 图床...');
      imgUrl = await uploadToImgbb(imageBuffer);
      console.log('[img] ImgBB 公网 URL:', imgUrl);
    } else if (USE_TEMP_HOST) {
      console.log('[img] 上传至临时图床...');
      imgUrl = await uploadToTempHost(imageBuffer);
      console.log('[img] 公网 URL:', imgUrl);
    } else if (PROXY_PUBLIC_URL?.trim() && !FORCE_DATA_URL && !PROXY_PUBLIC_URL.includes('railway.app')) {
      const id = crypto.randomUUID();
      tempImages.set(id, imageBuffer);
      setTimeout(() => tempImages.delete(id), 5 * 60 * 1000);
      imgUrl = `${PROXY_PUBLIC_URL.replace(/\/$/, '')}/temp/${id}`;
      console.log('[img] 使用 ngrok 公网 URL:', imgUrl);
    } else if (PROXY_PUBLIC_URL?.includes('railway.app')) {
      throw new Error('Railway 部署须配置 UPYUN_* 或 IMGBB_API_KEY：https://api.imgbb.com/');
    } else {
      const base64 = imageBuffer.toString('base64');
      imgUrl = `data:image/png;base64,${base64}`;
      console.log('[img] 使用 data URL, 长度:', imgUrl.length);
    }

    const jobId = await submitUpscale(imgUrl, 2);
    const resultUrl = await pollTaskResult(jobId);
    const imageBytes = await fetchImage(resultUrl);

    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(imageBytes);
  } catch (e) {
    console.error(e);
    res.writeHead(502);
    res.end(JSON.stringify({ error: e.message || '处理失败' }));
  }
});

server.listen(PORT, () => {
  console.log(`代理服务运行在 http://localhost:${PORT}/api/hd`);
});
