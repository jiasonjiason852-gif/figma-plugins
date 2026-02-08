#!/bin/bash
# 直接调用匠紫 API 调试（需在 proxy 目录执行，读取 .env 中的 JZ_APP_KEY）
set -e
source .env 2>/dev/null || true
APP_KEY="${JZ_APP_KEY:-}"
IMG_URL="https://matting-lib.oss-cn-shanghai.aliyuncs.com/hzgf/20260208/_0486f3a2d9d045e3bedbed32fc03885b.png"

if [ -z "$APP_KEY" ]; then
  echo "请设置 JZ_APP_KEY"
  exit 1
fi

echo "=== 1. 提交任务 ==="
RES=$(curl -s -X POST "https://api.jiangziai.com/task/foreign/imageUpscale" \
  -H "appKey: $APP_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"imgUrl\":\"$IMG_URL\",\"ratio\":2}")
echo "$RES" | jq . 2>/dev/null || echo "$RES"
JOB_ID=$(echo "$RES" | jq -r '.data.jobId // empty')
if [ -z "$JOB_ID" ]; then
  echo "未获取到 jobId"
  exit 1
fi
echo "jobId: $JOB_ID"

echo ""
echo "=== 2. 等待 3 秒后查询 ==="
sleep 3

echo ""
echo "=== 3. 查询任务结果 (POST getApiJob) ==="
curl -s -X POST "https://api.jiangziai.com/task/foreign/getApiJob" \
  -H "appKey: $APP_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"jobId\":\"$JOB_ID\"}" | jq . 2>/dev/null || cat
