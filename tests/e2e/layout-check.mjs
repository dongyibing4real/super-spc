/**
 * Playwright E2E test: verify the chart panes fill the viewport height properly.
 * Run: npx playwright test tests/e2e/layout-check.mjs
 * Requires vite dev server running on port 4173.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:4173";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    // Navigate and wait for the app to load
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {
      console.error("ERROR: Could not connect to dev server at " + BASE);
      console.error("Start it with: npm run dev");
      process.exit(1);
    });

    // Wait for the app shell to render
    await page.waitForSelector(".app-shell", { timeout: 5000 });

    // Check the app-shell fills viewport
    const shell = await page.evaluate(() => {
      const el = document.querySelector(".app-shell");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log("app-shell:", shell);
    if (!shell || shell.height < 850) {
      console.error(`FAIL: app-shell height ${shell?.height}px is less than expected 850px`);
    } else {
      console.log("PASS: app-shell fills viewport");
    }

    // Check the main-shell fills its column
    const mainShell = await page.evaluate(() => {
      const el = document.querySelector(".main-shell");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log("main-shell:", mainShell);
    if (!mainShell || mainShell.height < 850) {
      console.error(`FAIL: main-shell height ${mainShell?.height}px is less than expected 850px`);
    } else {
      console.log("PASS: main-shell fills viewport height");
    }

    // Check the legacy container div (direct child of main-shell, has the ref)
    const legacyDiv = await page.evaluate(() => {
      const main = document.querySelector(".main-shell");
      if (!main) return null;
      // The legacy div is the last child div of main-shell (after Notice)
      const divs = main.querySelectorAll(":scope > div");
      const lastDiv = divs[divs.length - 1];
      if (!lastDiv) return null;
      const r = lastDiv.getBoundingClientRect();
      const cs = getComputedStyle(lastDiv);
      return { width: r.width, height: r.height, flex: cs.flex, overflow: cs.overflow };
    });
    console.log("legacy-container:", legacyDiv);
    if (!legacyDiv || legacyDiv.height < 800) {
      console.error(`FAIL: legacy container height ${legacyDiv?.height}px is less than expected 800px`);
    } else {
      console.log("PASS: legacy container fills available space");
    }

    // Check workspace-layout if on workspace route
    const workspace = await page.evaluate(() => {
      const el = document.querySelector(".workspace-layout");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log("workspace-layout:", workspace);
    if (workspace && workspace.height < 800) {
      console.error(`FAIL: workspace-layout height ${workspace?.height}px is less than expected 800px`);
    } else if (workspace) {
      console.log("PASS: workspace-layout fills container");
    } else {
      console.log("INFO: No workspace-layout found (may not have a dataset loaded)");
    }

    // Check chart-arena if present
    const arena = await page.evaluate(() => {
      const el = document.querySelector(".chart-arena");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log("chart-arena:", arena);
    if (arena && arena.height < 600) {
      console.error(`FAIL: chart-arena height ${arena?.height}px is less than expected 600px`);
    } else if (arena) {
      console.log("PASS: chart-arena has adequate height");
    }

    // Check chart pane heights
    const panes = await page.evaluate(() => {
      const els = document.querySelectorAll(".chart-pane");
      return Array.from(els).map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.chartId, width: r.width, height: r.height };
      });
    });
    console.log("chart-panes:", panes);
    for (const p of panes) {
      if (p.height < 300) {
        console.error(`FAIL: chart-pane ${p.id} height ${p.height}px is less than expected 300px`);
      } else {
        console.log(`PASS: chart-pane ${p.id} has adequate height (${p.height}px)`);
      }
    }

    // Take a screenshot for visual comparison
    await page.screenshot({ path: "tests/e2e/layout-check.png", fullPage: false });
    console.log("\nScreenshot saved to tests/e2e/layout-check.png");

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
