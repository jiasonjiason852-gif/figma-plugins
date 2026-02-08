#!/usr/bin/env node
/**
 * 模拟插件完整流程：multipart 上传图片到 /api/hd，与插件请求格式一致
 */
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3030';
const TEST_IMAGE_URL = 'https://matting-lib.oss-cn-shanghai.aliyuncs.com/hzgf/20260208/_0486f3a2d9d045e3bedbed32fc03885b.png';

async function test() {
  console.log('模拟插件流程：multipart POST -> /api/hd');
  console.log('代理:', PROXY_URL);
  console.log('---');

  const res = await fetch(TEST_IMAGE_URL);
  const imageBuffer = await res.arrayBuffer();
  const blob = new Blob([imageBuffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('image', blob);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const hdRes = await fetch(`${PROXY_URL}/api/hd`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = hdRes.headers.get('content-type') || '';
    if (!hdRes.ok) {
      const errBody = await hdRes.text();
      let errMsg = 'API 请求失败: ' + hdRes.status;
      try {
        const j = JSON.parse(errBody);
        if (j.error) errMsg = j.error;
      } catch (_) {}
      console.error('✗ 失败:', errMsg);
      process.exit(1);
    }
    if (!contentType.includes('image/')) {
      const errBody = await hdRes.text();
      console.error('✗ 未返回图片:', errBody?.slice(0, 100));
      process.exit(1);
    }
    const resultBytes = await hdRes.arrayBuffer();
    console.log('✓ 成功');
    console.log('  返回图片大小:', resultBytes.byteLength, 'bytes');
    console.log('  Content-Type:', contentType);
  } catch (e) {
    clearTimeout(timeout);
    const msg = e.name === 'AbortError' ? '请求超时' : e.message;
    console.error('✗', msg);
    process.exit(1);
  }
}

test();
