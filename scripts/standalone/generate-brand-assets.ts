#!/usr/bin/env node
import * as NodeFSP from "node:fs/promises";
import * as NodeURL from "node:url";
import { encodePngIco } from "../lib/icon-export.ts";

const root = new URL("../../assets/brand/standalone/", import.meta.url);
// Use the already installed rasterizer; no additional runtime dependency is shipped.
const { chromium } = await import(
  new URL(
    "../../node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs",
    import.meta.url,
  ).href
);
const master = await NodeFSP.readFile(new URL("master.svg", root), "utf8");
const mark = master
  .replace(/<svg[^>]*>/, "")
  .replace("</svg>", "")
  .trim();
const teal = "#123F3A";
const svg = (body: string, width = 1024, height = width) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
const background = `<rect width="1024" height="1024" fill="${teal}"/>`;
const icon = svg(background + mark);
const rounded = svg(
  `<rect x="100" y="100" width="824" height="824" rx="184" fill="${teal}"/><g transform="translate(100 100) scale(.8046875)">${mark}</g>`,
);
// Bounds after scaling: x=256..755, y=267..685, inside the central 66% and safe circle.
const safeMark = `<g transform="translate(102.4 102.4) scale(.8)">${mark}</g>`;
const mono = safeMark.replace(/#[A-Fa-f0-9]{6}/g, "#ffffff");
const widget = svg(mark.replace(/#[A-Fa-f0-9]{6}/g, "currentColor"));
const dmg = svg(
  `<rect width="640" height="432" fill="${teal}"/><g transform="translate(288 28) scale(.0625)">${mark}</g><text x="320" y="122" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#A8E6CF">BotDuetDot</text><path d="M290 230h60m-12-12 12 12-12 12" fill="none" stroke="#F08066" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="320" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#F8DDB0">Drag BotDuetDot into Applications.</text>`,
  640,
  432,
).replace('width="640" height="432" viewBox', 'width="1280" height="864" viewBox');
const feature = svg(
  `<rect width="1024" height="500" fill="${teal}"/><g transform="translate(30 55) scale(.38)">${mark}</g><text x="440" y="250" font-family="Arial, sans-serif" font-weight="700" font-size="62" fill="#A8E6CF">BotDuetDot</text><text x="443" y="302" font-family="Arial, sans-serif" font-size="24" fill="#F8DDB0">Coding agents, together.</text>`,
  1024,
  500,
);
await NodeFSP.mkdir(new URL("web/", root), { recursive: true });
await NodeFSP.mkdir(new URL("android/", root), { recursive: true });
await NodeFSP.mkdir(new URL("play/", root), { recursive: true });
await NodeFSP.writeFile(new URL("widget-mark.svg", root), widget);
await NodeFSP.writeFile(new URL("dmg-background.svg", root), dmg);
await NodeFSP.writeFile(new URL("play/feature-graphic.svg", root), feature);
const renditions: [string, number, number, string, boolean][] = [
  ["macos-1024.png", 1024, 1024, rounded, true],
  ["universal-1024.png", 1024, 1024, icon, true],
  ["ios-1024.png", 1024, 1024, icon, false],
  ["mark-1024.png", 1024, 1024, master, true],
  ["android/adaptive-foreground.png", 432, 432, svg(safeMark), true],
  ["android/adaptive-background.png", 432, 432, svg(background), false],
  ["android/monochrome.png", 432, 432, svg(mono), true],
  ["android/splash.png", 1152, 1152, svg(safeMark), true],
  ["android/notification.png", 96, 96, svg(mono), true],
  ["play/icon-512.png", 512, 512, icon, true],
  ["play/feature-graphic-1024x500.png", 1024, 500, feature, false],
  ...([16, 32, 180, 192, 512] as const).map((size): [string, number, number, string, boolean] => [
    `web/${size === 180 ? "apple-touch-icon" : size < 100 ? `favicon-${size}x${size}` : `icon-${size}x${size}`}.png`,
    size,
    size,
    icon,
    true,
  ]),
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, width, height, source, alpha] of renditions) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>body{margin:0}img{display:block;width:100vw;height:100vh}</style><img src="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}">`,
    );
    await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
    // Canvas preserves RGBA even for the fully opaque Play icon (32-bit PNG).
    if (alpha) {
      const data = await page.locator("img").evaluate((img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = innerWidth;
        canvas.height = innerHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png").split(",")[1]!;
      });
      await NodeFSP.writeFile(new URL(name, root), Buffer.from(data, "base64"));
    } else {
      await page.screenshot({
        path: NodeURL.fileURLToPath(new URL(name, root)),
        omitBackground: false,
      });
    }
  }
} finally {
  await browser.close();
}
await NodeFSP.writeFile(
  new URL("web/favicon.ico", root),
  encodePngIco(
    await Promise.all(
      [16, 32].map(async (size) => ({
        size,
        contents: await NodeFSP.readFile(new URL(`web/favicon-${size}x${size}.png`, root)),
      })),
    ),
  ),
);
console.log(`Generated ${renditions.length} PNGs, favicon ICO, widget and DMG SVGs.`);
