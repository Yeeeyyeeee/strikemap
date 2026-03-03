import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../twitter-banner.html");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 500, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });

// Wait for font to load
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 1000));

await page.screenshot({
  path: path.resolve(__dirname, "../public/twitter-banner.png"),
  type: "png",
  clip: { x: 0, y: 0, width: 1500, height: 500 },
});

console.log("Banner saved to public/twitter-banner.png");
await browser.close();
