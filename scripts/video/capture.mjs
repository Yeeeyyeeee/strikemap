#!/usr/bin/env node
// capture.mjs — Puppeteer: screenshots/records dashboard pages

import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, "frames");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Ensure frames directory exists
mkdirSync(FRAMES_DIR, { recursive: true });

// ── Viewport for vertical video (1080x1920) ──────────────────
const VIEWPORT = { width: 1080, height: 1920, deviceScaleFactor: 1 };

// ── Page configurations ──────────────────────────────────────
const PAGES = {
  map: {
    url: "/",
    filename: "map_overview.png",
    waitFor: ".mapboxgl-map",
    delay: 3000, // Wait for map tiles to load
  },
  dashboard: {
    url: "/",
    filename: "dashboard_full.png",
    waitFor: "body",
    delay: 2000,
  },
  heatmap: {
    url: "/",
    filename: "heatmap.png",
    waitFor: ".mapboxgl-map",
    delay: 3000,
    // Will click heatmap toggle if available
    actions: async (page) => {
      try {
        await page.evaluate(() => {
          const btn = document.querySelector('[data-view="heatmap"]');
          if (btn) btn.click();
        });
        await new Promise((r) => setTimeout(r, 1500));
      } catch {}
    },
  },
};

async function loadPuppeteer() {
  try {
    return await import("puppeteer");
  } catch {
    console.error("Puppeteer not installed. Run: bash scripts/video/setup.sh");
    process.exit(1);
  }
}

async function capturePage(browser, pageConfig, name) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const url = `${BASE_URL}${pageConfig.url}`;
  console.log(`  Capturing ${name}: ${url}`);

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for specific element if configured
    if (pageConfig.waitFor) {
      try {
        await page.waitForSelector(pageConfig.waitFor, { timeout: 10000 });
      } catch {
        console.log(`    Warning: ${pageConfig.waitFor} not found, continuing`);
      }
    }

    // Run custom actions
    if (pageConfig.actions) {
      await pageConfig.actions(page);
    }

    // Additional delay for animations/loading
    if (pageConfig.delay) {
      await new Promise((r) => setTimeout(r, pageConfig.delay));
    }

    // Hide cookie banners, modals, etc.
    await page.evaluate(() => {
      const selectors = [
        "[class*='cookie']",
        "[class*='banner']",
        "[class*='modal']",
        "[class*='popup']",
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          el.style.display = "none";
        });
      });
    });

    const outputPath = join(FRAMES_DIR, pageConfig.filename);
    await page.screenshot({ path: outputPath, type: "png" });
    console.log(`    Saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`    Error capturing ${name}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function captureLeader(browser, leaderSlug) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const url = `${BASE_URL}`;
  console.log(`  Capturing leader: ${leaderSlug}`);

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Try to navigate to leaders section or find leader card
    await page.evaluate((slug) => {
      // Look for leadership board link/tab
      const tabs = document.querySelectorAll("a, button");
      for (const tab of tabs) {
        if (
          tab.textContent?.toLowerCase().includes("leader") ||
          tab.textContent?.toLowerCase().includes("board")
        ) {
          tab.click();
          break;
        }
      }
    }, leaderSlug);

    await new Promise((r) => setTimeout(r, 2000));

    const outputPath = join(FRAMES_DIR, `leader_${leaderSlug}.png`);
    await page.screenshot({ path: outputPath, type: "png" });
    console.log(`    Saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`    Error capturing leader: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "all";

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: VIEWPORT,
  });

  console.log("Starting dashboard capture...");
  console.log(`  Base URL: ${BASE_URL}`);

  try {
    switch (command) {
      case "map":
        await capturePage(browser, PAGES.map, "map");
        break;

      case "dashboard":
        await capturePage(browser, PAGES.dashboard, "dashboard");
        break;

      case "heatmap":
        await capturePage(browser, PAGES.heatmap, "heatmap");
        break;

      case "leader": {
        const slug = args[1] || "all";
        await captureLeader(browser, slug);
        break;
      }

      case "all":
      default:
        for (const [name, config] of Object.entries(PAGES)) {
          await capturePage(browser, config, name);
        }
        break;
    }
  } finally {
    await browser.close();
  }

  console.log("Capture complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
