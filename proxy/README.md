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

匠紫 API 要求图片 URL 公网可访问。代理支持多种方式（按优先级）：

| 方式 | 配置 | 说明 |
|------|------|------|
| **ImgBB** | `IMGBB_API_KEY` | 优先使用，[申请](https://api.imgbb.com/) |
| **ImgLink**（默认） | `USE_IMGLINK=true` | 免 API Key，Railway 部署即用 |
| ngrok | `PROXY_PUBLIC_URL` + `ngrok http 3030` | 本地调试 |
| 临时图床 | `USE_TEMP_HOST=true` | 0x0.st/catbox 等 |
| Data URL | `FORCE_DATA_URL=true` | 匠紫不支持，仅排查用 |

**ImgBB API 示例响应**（`data.url` 为匠紫拉图所用）：
```json
{
  "data": {
    "id": "2ndCYJK",
    "title": "c1f64245afb2",
    "url_viewer": "https://ibb.co/2ndCYJK",
    "url": "https://i.ibb.co/w04Prt6/c1f64245afb2.gif",
    "display_url": "https://i.ibb.co/98W13PY/c1f64245afb2.gif",
    "width": "1",
    "height": "1",
    "size": "42",
    "time": "1552042565",
    "expiration": "0",
    "image": {
      "filename": "c1f64245afb2.gif",
      "name": "c1f64245afb2",
      "mime": "image/gif",
      "extension": "gif",
      "url": "https://i.ibb.co/w04Prt6/c1f64245afb2.gif"
    },
    "thumb": {
      "filename": "c1f64245afb2.gif",
      "name": "c1f64245afb2",
      "mime": "image/gif",
      "extension": "gif",
      "url": "https://i.ibb.co/2ndCYJK/c1f64245afb2.gif"
    },
    "medium": {
      "filename": "c1f64245afb2.gif",
      "name": "c1f64245afb2",
      "mime": "image/gif",
      "extension": "gif",
      "url": "https://i.ibb.co/98W13PY/c1f64245afb2.gif"
    },
    "delete_url": "https://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c"
  },
  "success": true,
  "status": 200
}
```

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
