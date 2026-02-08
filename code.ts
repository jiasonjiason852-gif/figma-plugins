/**
 * Image HD Plus - Figma 插件
 * API Key 通过代理服务保护，仅配置在 proxy 的 .env 中，插件源码不包含 Key
 * 代理地址：本地调试用 localhost，生产部署后改为实际地址
 * 付费：30 天试用，$9.9/年，发布时在 Figma Community 设置价格
 */
const JZ_PROXY_URL = "https://figma-plugins-production.up.railway.app/api/hd";

const TRIAL_DAYS = 30;
const SECONDS_PER_DAY = 60 * 60 * 24;

type PluginMessage =
  | { type: "init"; hasImage: boolean }
  | { type: "hd-trigger" }
  | { type: "hd-send"; imageBytes: ArrayBuffer; nodeId: string; proxyUrl: string }
  | { type: "hd-response"; imageBytes: ArrayBuffer; nodeId: string }
  | { type: "hd-error"; message: string };

function hasImageFill(node: SceneNode): node is SceneNode & { fills: Paint[] } {
  return "fills" in node && Array.isArray(node.fills);
}

function getImagePaint(node: SceneNode & { fills: Paint[] }): Paint | null {
  for (const fill of node.fills) {
    if (fill.type === "IMAGE") return fill;
  }
  return null;
}

function getFirstImageNode(
  selection: readonly SceneNode[]
): (SceneNode & { fills: Paint[] }) | null {
  for (const node of selection) {
    if (hasImageFill(node)) {
      const paint = getImagePaint(node);
      if (paint) return node as SceneNode & { fills: Paint[] };
    }
  }
  return null;
}

const DEV_TRIAL_EXPIRED_KEY = "devForceTrialExpired";

/** 支付校验：30 天试用，到期需付费 $9.9/年。返回 true 表示可使用 */
async function checkPayment(closeOnFail: boolean): Promise<boolean> {
  const payments = figma.payments;
  if (!payments) return true;
  const status = payments.status.type;
  if (status === "NOT_SUPPORTED") {
    figma.notify("无法获取支付状态，请稍后重试", { error: true });
    if (closeOnFail) figma.closePlugin();
    return false;
  }
  if (status === "PAID") return true;
  const devForceExpired = await figma.clientStorage.getAsync(DEV_TRIAL_EXPIRED_KEY);
  if (devForceExpired) {
    await payments.initiateCheckoutAsync({ interstitial: "TRIAL_ENDED" });
    if (payments.status.type === "PAID") return true;
    figma.notify("订阅已到期，请续费以继续使用（$9.9/年）", { error: true });
    if (closeOnFail) figma.closePlugin();
    return false;
  }
  const secondsSinceFirstRun = payments.getUserFirstRanSecondsAgo();
  const daysSinceFirstRun = secondsSinceFirstRun / SECONDS_PER_DAY;
  if (daysSinceFirstRun < TRIAL_DAYS) return true;
  await payments.initiateCheckoutAsync({ interstitial: "TRIAL_ENDED" });
  if (payments.status.type === "PAID") return true;
  figma.notify("订阅已到期，请续费以继续使用（$9.9/年）", { error: true });
  if (closeOnFail) figma.closePlugin();
  return false;
}

// 初始化：检查是否有选中的图像
function init() {
  const selection = figma.currentPage.selection;
  const imageNode = getFirstImageNode(selection);
  figma.ui.postMessage({
    type: "init",
    hasImage: !!imageNode,
  } as PluginMessage);
}

/** 开发调试：设置支付状态（仅开发模式有效） */
async function runDevCommand(cmd: string) {
  if (cmd === "dev-set-paid" && figma.payments) {
    figma.payments.setPaymentStatusInDevelopment({ type: "PAID" });
    figma.notify("已模拟：已付费");
  } else if (cmd === "dev-set-unpaid" && figma.payments) {
    figma.payments.setPaymentStatusInDevelopment({ type: "UNPAID" });
    figma.notify("已模拟：未付费");
  } else if (cmd === "dev-simulate-expired") {
    await figma.clientStorage.setAsync(DEV_TRIAL_EXPIRED_KEY, true);
    figma.notify("已模拟：试用已到期（下次打开主功能时触发）");
  } else if (cmd === "dev-clear-expired") {
    await figma.clientStorage.setAsync(DEV_TRIAL_EXPIRED_KEY, false);
    figma.notify("已清除：试用到期模拟");
  }
  figma.closePlugin();
}

/** 入口：先校验支付，通过后再显示 UI */
async function runMain() {
  const canUse = await checkPayment(true);
  if (!canUse) return;
  figma.showUI(__html__, {
    width: 340,
    height: 350,
    themeColors: true,
  });
  init();
}

/** 入口：根据 menu 命令分发 */
async function main() {
  const cmd = figma.command;
  if (cmd && cmd.startsWith("dev-")) {
    await runDevCommand(cmd);
    return;
  }
  await runMain();
}

main();

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "hd-trigger") {
    const canUse = await checkPayment(false);
    if (!canUse) return;
    const selection = figma.currentPage.selection;
    const imageNode = getFirstImageNode(selection);
    if (!imageNode) {
      figma.notify("请先选择包含图像的图层", { error: true });
      return;
    }
    try {
      figma.notify("正在处理...");
      const bytes = await imageNode.exportAsync({ format: "PNG" });
      figma.ui.postMessage({
        type: "hd-send",
        imageBytes: bytes.buffer,
        nodeId: imageNode.id,
        proxyUrl: JZ_PROXY_URL,
      } as PluginMessage);
    } catch (e) {
      figma.notify("失败：导出图像失败", { error: true });
      figma.ui.postMessage({
        type: "hd-error",
        message: String(e),
      } as PluginMessage);
    }
    return;
  }

  if (msg.type === "hd-response") {
    try {
      const node = figma.getNodeById(msg.nodeId) as (SceneNode & { fills: Paint[] }) | null;
      if (!node || !hasImageFill(node)) {
        figma.notify("失败：无法找到原图层", { error: true });
        return;
      }
      const newImage = figma.createImage(new Uint8Array(msg.imageBytes));
      const paint = getImagePaint(node);
      if (!paint || paint.type !== "IMAGE") return;
      const newFills = node.fills.map((f) =>
        f.type === "IMAGE"
          ? { ...f, imageHash: newImage.hash, scaleMode: "FIT" as const }
          : f
      );
      node.fills = newFills;
      figma.notify("高清化完成");
    } catch (e) {
      figma.notify("失败：替换图像失败", { error: true });
    }
    return;
  }

  if (msg.type === "hd-error") {
    figma.notify("失败：" + (msg.message || "处理失败"), { error: true });
    return;
  }
};
