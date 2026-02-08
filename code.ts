/**
 * Image HD Plus - Figma 插件
 * API Key 通过代理服务保护，仅配置在 proxy 的 .env 中
 */
const JZ_PROXY_URL = "https://figma-plugins-production.up.railway.app/api/hd";
const MAX_DIMENSION = 2048;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type PluginMessage =
  | { type: "hd-trigger" }
  | { type: "hd-send"; imageBytes: ArrayBuffer; nodeId: string; proxyUrl: string }
  | { type: "hd-response"; imageBytes: ArrayBuffer; nodeId: string }
  | { type: "hd-error"; message: string };

type ImageNode = SceneNode & { fills: Paint[] };

function hasImageFill(n: SceneNode): n is ImageNode {
  return "fills" in n && Array.isArray((n as any).fills) && (n as any).fills.some((f: Paint) => f.type === "IMAGE");
}

function getImageNodes(selection: readonly SceneNode[]): ImageNode[] {
  return selection.filter((n): n is ImageNode => hasImageFill(n));
}

function getSize(n: SceneNode): { w: number; h: number } {
  const x = n as any;
  return { w: x.width ?? x.bounds?.width ?? 0, h: x.height ?? x.bounds?.height ?? 0 };
}

figma.showUI(__html__, { width: 320, height: 240, themeColors: true });

figma.ui.onmessage = async (msg: PluginMessage) => {
  const notify = (m: string, err = false) => figma.notify(m, err ? { error: true } : { timeout: 3000 });

  if (msg.type === "hd-trigger") {
    const nodes = getImageNodes(figma.currentPage.selection);
    if (!nodes.length) return notify("请先选择包含图像的图层");
    if (nodes.length > 1) return notify("请只选择一张图片，单次不支持多图");
    const node = nodes[0];
    const { w, h } = getSize(node);
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) return notify(`图片长宽不能超过 2048px（当前 ${Math.round(w)}×${Math.round(h)}）`);
    try {
      notify("正在处理...");
      const bytes = await node.exportAsync({ format: "PNG" });
      if (bytes.byteLength > MAX_SIZE_BYTES) return notify(`图片大小不能超过 10MB（当前 ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB）`);
      figma.ui.postMessage({ type: "hd-send", imageBytes: bytes.buffer, nodeId: node.id, proxyUrl: JZ_PROXY_URL } as PluginMessage);
    } catch (e) {
      notify("失败：导出图像失败", true);
      figma.ui.postMessage({ type: "hd-error", message: String(e) } as PluginMessage);
    }
    return;
  }

  if (msg.type === "hd-response") {
    try {
      const node = (await figma.getNodeByIdAsync(msg.nodeId)) as ImageNode | null;
      if (!node?.fills || node.removed || !hasImageFill(node)) return notify("失败：无法找到原图层", true);
      const buf = msg.imageBytes;
      if (!buf?.byteLength) return notify("失败：未收到图片数据", true);
      const uint8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array((buf as ArrayBufferView).buffer);
      const img = figma.createImage(uint8);
      node.fills = node.fills.map((f) => (f.type === "IMAGE" ? { ...f, imageHash: img.hash, scaleMode: "FIT" as const } : f));
      notify("高清化完成");
    } catch (e) {
      notify("失败：替换图像失败 - " + (e instanceof Error ? e.message : String(e)), true);
    }
    return;
  }

  if (msg.type === "hd-error") notify("失败：" + (msg.message || "处理失败"), true);
};
