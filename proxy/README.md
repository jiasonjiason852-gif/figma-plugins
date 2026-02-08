# JZ API 代理服务

对接匠紫 AI高清处理 API ([imageUpscale](https://s.apifox.cn/f21a80ce-2422-4644-b455-e41a578cb4ef/226883920e0))。

## 配置

```bash
cp .env.example .env
# 编辑 .env 填入 JZ_APP_KEY、PROXY_PUBLIC_URL
```

## 运行

```bash
npm install
npm start
```

## 图片公网 URL 获取方式

匠紫 API 要求图片 URL 公网可访问。代理支持多种方式：

| 方式 | 配置 | 说明 |
|------|------|------|
| **ngrok**（默认） | `PROXY_PUBLIC_URL` + 运行 `ngrok http 3030` | 免费版可能对匠紫拉图显示访问页，[付费可移除](https://ngrok.com/docs/pricing-limits/free-plan-limits) |
| 临时图床 | `USE_TEMP_HOST=true` + `USE_CATBOX=true` | 上传至 catbox.moe，免 ngrok；需服务可用 |
| Data URL | `FORCE_DATA_URL=true` | 匠紫 API 不支持，仅作排查用 |

**ngrok 说明**：免费版对「程序化请求」无限制；若匠紫拉图失败，可尝试升级 ngrok 或部署代理到公网（Vercel/Railway）。

## 匠紫 API 说明

- **提交任务**：`POST https://api.jiangziai.com/task/foreign/imageUpscale`
- **认证**：请求头 `appKey`
- **请求体**：`{ imgUrl, ratio? }`（ratio 1-4，默认 2）
- **响应**：异步任务，返回 `jobId`，需轮询获取结果

任务查询接口路径若与默认 `/foreign/taskResult?jobId=xxx` 不同，可在 `.env` 中设置 `JZ_TASK_RESULT_PATH`。

## 测试 JZ API

通过公网图片 URL 测试匠紫 API 是否正常：

```bash
# 先启动代理：npm start
# 另开终端执行：
npm run test
# 或指定图片 URL：node test-jz-api.js "https://example.com/image.png"

# 不经过代理，直接调用 JZ API：
npm run test:direct
```
