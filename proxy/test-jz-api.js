#!/usr/bin/env node
/**
 * 测试 JZ API：通过公网图片 URL 提交高清化任务并返回结果
 * 用法：node test-jz-api.js [图片URL]
 * 默认：https://matting-lib.oss-cn-shanghai.aliyuncs.com/hzgf/20260208/_0486f3a2d9d045e3bedbed32fc03885b.png
 */

const PROXY_URL = process.env.PROXY_URL || 'http://localhost:3030';
const DEFAULT_IMAGE_URL = 'https://matting-lib.oss-cn-shanghai.aliyuncs.com/hzgf/20260208/_0486f3a2d9d045e3bedbed32fc03885b.png';

const imageUrl = process.argv[2] || DEFAULT_IMAGE_URL;

async function test() {
  console.log('测试 JZ API (匠紫 AI 高清化)');
  console.log('代理地址:', PROXY_URL);
  console.log('图片 URL:', imageUrl);
  console.log('---');

  const res = await fetch(`${PROXY_URL}/api/hd-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('响应非 JSON:', text.slice(0, 200));
    process.exit(1);
  }

  if (!res.ok) {
    console.error('请求失败:', res.status);
    console.error('错误:', data.error || text);
    process.exit(1);
  }

  if (data.success) {
    console.log('✓ 测试成功');
    console.log('  jobId:', data.jobId);
    console.log('  resultUrl:', data.resultUrl);
    console.log('  结果图片大小:', data.resultSize, 'bytes');
  } else {
    console.error('处理失败:', data.error);
    process.exit(1);
  }
}

test().catch((e) => {
  console.error('测试异常:', e.message);
  if (e.cause) console.error('原因:', e.cause);
  process.exit(1);
});
