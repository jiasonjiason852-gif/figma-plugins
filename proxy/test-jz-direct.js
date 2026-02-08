#!/usr/bin/env node
/**
 * 直接调用匠紫 API（不经过代理），验证 Node.js 请求是否正常
 */
require('dotenv').config();
const https = require('https');

const JZ_APP_KEY = process.env.JZ_APP_KEY;
const IMG_URL = 'https://matting-lib.oss-cn-shanghai.aliyuncs.com/hzgf/20260208/_0486f3a2d9d045e3bedbed32fc03885b.png';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('1. 提交任务...');
  const submitBody = JSON.stringify({ imgUrl: IMG_URL, ratio: 2 });
  const submitRes = await request({
    hostname: 'api.jiangziai.com',
    path: '/task/foreign/imageUpscale',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(submitBody),
      'appKey': JZ_APP_KEY,
    },
  }, submitBody);
  const submitData = JSON.parse(submitRes.body);
  const jobId = submitData.data?.jobId;
  if (!jobId) {
    console.error('提交失败:', submitRes.body);
    process.exit(1);
  }
  console.log('  jobId:', jobId);

  console.log('2. 等待 3 秒...');
  await new Promise((r) => setTimeout(r, 3000));

  console.log('3. 查询结果 (POST getApiJob)...');
  const pollBody = JSON.stringify({ jobId });
  const pollRes = await request({
    hostname: 'api.jiangziai.com',
    path: '/task/foreign/getApiJob',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(pollBody),
      'appKey': JZ_APP_KEY,
    },
  }, pollBody);
  console.log('  状态码:', pollRes.statusCode);
  console.log('  响应:', pollRes.body);

  const pollData = JSON.parse(pollRes.body);
  if (pollData.code === '0' && pollData.data?.jobStatus === 2) {
    const url = pollData.data?.result?.data?.imgUrl;
    console.log('✓ 成功! 结果 URL:', url);
  } else {
    console.error('✗ 失败:', pollData.msg || pollRes.body);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
