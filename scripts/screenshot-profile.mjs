import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../profile-logo.html");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });

await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 1000));

await page.screenshot({
  path: path.resolve(__dirname, "../public/profile-logo.png"),
  type: "png",
  clip: { x: 0, y: 0, width: 1024, height: 1024 },
});

console.log("Profile logo saved to public/profile-logo.png (1024x1024, 2x retina = 2048x2048)");
await browser.close();
