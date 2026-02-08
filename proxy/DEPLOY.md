# 代理公网部署指南

将代理部署到公网后，匠紫 API 可直接从代理 URL 拉取图片，无需 ngrok。

## 方式一：Railway（推荐，简单）

### 1. 准备

- 注册 [Railway](https://railway.app)，使用 GitHub 登录
- 将 `figma-plugins` 项目推送到 GitHub（若未有）

### 2. 部署

1. 打开 [Railway Dashboard](https://railway.app/dashboard) → **New Project**
2. 选择 **Deploy from GitHub repo** → 选中你的仓库
3. 配置部署：
   - **Root Directory**：填 `figma-plugins/proxy`
   - **Build Command**：`npm install`（可留空，Railway 自动识别）
   - **Start Command**：`npm start`
4. 点击 **Settings** → **Networking** → **Generate Domain**，生成公网域名（如 `xxx.railway.app`）
5. 在 **Variables** 中添加环境变量：
   - `JZ_APP_KEY`：匠紫 appKey
   - `PROXY_PUBLIC_URL`：`https://你的域名.railway.app`（与上一步生成的域名一致）

### 3. 修改插件

在 `code.ts` 中把代理地址改为 Railway 域名：

```ts
const JZ_PROXY_URL = "https://你的域名.railway.app/api/hd";
```

重新编译：`npm run build`

---

## 方式二：Render

### 1. 准备

- 注册 [Render](https://render.com)，使用 GitHub 登录

### 2. 部署

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. 连接 GitHub 仓库
3. 配置：
   - **Name**：`image-hd-proxy`
   - **Root Directory**：`figma-plugins/proxy`
   - **Runtime**：Node
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
4. 在 **Environment** 添加变量：
   - `JZ_APP_KEY`：匠紫 appKey
   - `PROXY_PUBLIC_URL`：先留空，部署后再填

5. 点击 **Create Web Service** 部署
6. 部署完成后，在 **Settings** → **Environment** 中填入：
   - `PROXY_PUBLIC_URL`：`https://你的服务名.onrender.com`

### 3. 修改插件

```ts
const JZ_PROXY_URL = "https://你的服务名.onrender.com/api/hd";
```

---

## 方式三：Fly.io

### 1. 安装并登录

```bash
# 安装 flyctl
curl -L https://fly.io/install.sh | sh

# 登录
flyctl auth login
```

### 2. 创建应用

在 `figma-plugins/proxy` 目录下：

```bash
cd figma-plugins/proxy
flyctl launch
```

按提示选择地区、是否创建 Postgres 等（均选 No），生成 `fly.toml`。

### 3. 配置 fly.toml

确保类似如下：

```toml
[env]
  PORT = "3000"

[http_service]
  internal_port = 3030
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
```

若 `PORT` 在代码里用 `process.env.PORT`，则 `internal_port` 需与 `PORT` 一致（如都设为 3030）。

### 4. 设置密钥

```bash
flyctl secrets set JZ_APP_KEY=你的匠紫appKey
flyctl secrets set PROXY_PUBLIC_URL=https://你的应用名.fly.dev
```

### 5. 部署

```bash
flyctl deploy
```

### 6. 修改插件

```ts
const JZ_PROXY_URL = "https://你的应用名.fly.dev/api/hd";
```

---

## 注意事项

1. **PROXY_PUBLIC_URL**：必须与部署后的实际访问地址一致，否则匠紫无法拉取临时图片。
2. **CORS**：代理已设置 `Access-Control-Allow-Origin: *`，Figma 插件可跨域请求。
3. **超时**：匠紫处理约 20–30 秒，部署平台请求超时需 ≥ 60 秒；Render 免费版约 30 秒，如遇超时可考虑付费或换 Railway。
4. **安全性**：生产环境可增加 API Key 校验、限流等，避免代理被滥用。
