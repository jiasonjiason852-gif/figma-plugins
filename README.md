# Figma 插件开发环境

本地 Figma 插件开发配置，支持开发调试与发布到 Figma 应用市场。

## 前置要求

- [Figma 桌面应用](https://www.figma.com/downloads/)
- [Node.js](https://nodejs.org/) (含 npm)
- [VS Code](https://code.visualstudio.com/)（推荐）

## 快速开始

### 1. 安装依赖

```bash
cd figma-plugins
npm install
```

### 2. 编译插件

```bash
npm run build
```

开发时建议使用监听模式，修改代码后自动重新编译：

```bash
npm run watch
```

### 3. 在 Figma 中导入插件

1. 打开 Figma 桌面应用，新建或打开一个设计文件
2. 右键画布 → **Plugins** → **Development** → **Import plugin from manifest...**
3. 选择本项目的 `manifest.json`（`figma-plugins/manifest.json`）
4. 导入成功后，在 **Plugins** → **Development** 中看到「Image HD Plus」

### 4. 运行插件

1. 在 Figma 中选中一个包含图像的图层（如矩形填充图片、图片等）
2. **Plugins** → **Development** → **Image HD Plus**
3. 点击「HD / 高清化」进行图像增强

### 5. 支付功能本地调试

在 **Plugins** → **Development** → **Image HD Plus** 下有 **Debug (支付调试)** 子菜单：

| 菜单项 | 说明 |
|--------|------|
| 模拟已付费 | 调用 `setPaymentStatusInDevelopment({ type: "PAID" })`，下次打开主功能时视为已付费 |
| 模拟未付费 | 调用 `setPaymentStatusInDevelopment({ type: "UNPAID" })`，本地 `getUserFirstRanSecondsAgo()` 恒为 0，会处于试用期 |
| 模拟试用已到期 | 写入 clientStorage 标记，下次打开主功能时视为试用已到期，会弹出支付流程 |
| 清除试用到期模拟 | 清除上述标记 |

调试流程示例：选「模拟未付费」→「模拟试用已到期」→ 再点主菜单「Image HD Plus」→ 会弹出支付校验。

### 6. 热重载（可选）

在 Figma 中启用 **Settings** → **Plugins** → **Hot reload**，修改代码并重新编译后插件会自动更新。

## Image HD Plus 插件说明

- **HD / 高清化**：将选中图像发送至代理，代理调用匠紫 AI高清处理 API (imageUpscale)，返回结果替换原图。处理约需 20–30 秒，请耐心等待
- **API Key 保护**：appKey 仅配置在 `proxy/.env`，插件源码不包含 Key
- **代理配置**（对接匠紫 API）：
  1. `cd proxy && cp .env.example .env`
  2. 编辑 `.env` 填入 `JZ_APP_KEY`（匠紫 appKey）
  3. **PROXY_PUBLIC_URL**：匠紫要求图片 URL 公网可访问。本地调试用 `ngrok http 3030` 暴露后填入
  4. `npm install && npm start` 启动代理
  5. 生产：将代理部署到 Vercel/Railway 等，在 `code.ts` 中修改 `JZ_PROXY_URL` 为实际地址

## 项目结构

```
figma-plugins/
├── manifest.json    # 插件配置（名称、ID、入口等）
├── code.ts          # 主逻辑（沙盒环境，可访问 figma API）
├── code.js          # 编译产物（由 code.ts 生成）
├── ui.html          # 插件 UI 界面（含 JZ API 地址配置）
├── package.json
├── tsconfig.json
└── README.md
```

## 发布到 Figma 应用市场

### 发布前准备

1. **获取正式插件 ID**
   - 在 Figma 中：**Plugins** → **Development** → **New plugin...**
   - 选择「Figma design」+「Custom UI」，保存到任意位置
   - 打开生成项目的 `manifest.json`，复制其中的 `id` 到本项目的 `manifest.json`

2. **准备素材**
   - 插件图标：16×16、24×24、32×32、128×128（PNG）
   - 截图：展示插件功能的清晰截图
   - 描述：简洁说明功能与使用方式

3. **付费设置**（发布时在 Figma Community 配置）
   - 30 天免费试用
   - 订阅价格：$9.9/年（发布时在 Figma 后台设置）
   - 到期后需续费才能继续使用

4. **检查清单**
   - 核心功能完整且稳定
   - 已做基础错误处理
   - UI 清晰易用
   - `manifest.json` 中 `networkAccess` 如需要联网，需正确配置 `allowedDomains`

### 发布步骤

1. 登录 [Figma 社区](https://www.figma.com/community)
2. 点击右上角头像 → **Profile** → **Plugins**
3. 点击 **Publish new plugin**
4. 上传插件文件夹（需包含 `manifest.json`、`code.js`、`ui.html` 等）
5. 填写名称、描述、图标、截图、支持联系方式
6. 提交审核

详细说明见：
- [Figma 官方发布指南](https://help.figma.com/hc/en-us/articles/360042293394-Publish-plugins-to-the-Figma-Community)
- [插件审核标准](https://help.figma.com/hc/en-us/articles/360039958914)

### 发布后更新

插件审核通过后，后续更新可直接发布，无需再次审核。更新时上传新版本即可。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript |
| `npm run watch` | 监听模式编译 |
| `npm run lint` | 代码检查 |
| `npm run lint:fix` | 自动修复部分问题 |

## 开发多个插件

如需开发多个插件，可复制整个 `figma-plugins` 文件夹并重命名，或在本目录下新建子目录，每个子目录各自包含 `manifest.json`、`code.ts`、`ui.html` 等完整结构。

## 参考资源

- [Figma Plugin API 文档](https://developers.figma.com/docs/plugins/)
- [Plugin API 参考](https://developers.figma.com/docs/plugins/api/api-reference/)
- [官方示例](https://github.com/figma/plugin-samples)
- [Discord 社区](https://discord.gg/xzQhe2Vcvx)
