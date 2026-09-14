// Stealth playwright test against ss.ge Cloudflare
import { chromium } from "playwright";

const STEALTH = () => {
  // navigator.webdriver
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  // chrome runtime stub
  (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}), app: { isInstalled: false } };
  // permissions
  const orig = window.Notification && Notification.permission;
  Object.defineProperty(window, "Notification", { value: window.Notification, writable: false });
  // plugins + languages
  Object.defineProperty(navigator, "plugins", {
    get: () => [1, 2, 3, 4, 5].map(() => ({ name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" })),
  });
  Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  // WebGL vendor
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (p: number) {
    if (p === 37445) return "Intel Inc.";
    if (p === 37446) return "Intel Iris OpenGL Engine";
    return getParameter.call(this, p);
  };
  // hardwareConcurrency + deviceMemory
  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
  Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--flag-switches-begin", "--flag-switches-end",
    ],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Tbilisi",
  });
  await ctx.addInitScript(STEALTH as any);
  const page = await ctx.newPage();
  try {
    await page.goto("https://home.ss.ge/en/udzravi-qoneba/apartments-for-sale", { waitUntil: "domcontentloaded", timeout: 45000 });
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);
      const title = await page.title();
      console.log(`t+${(i + 1) * 3}s title: ${title}`);
      if (!/just a moment/i.test(title)) break;
    }
    const html = await page.content();
    console.log("html length:", html.length);
    console.log("has listing markers:", /ss-Listing|listing-item|item-image|apartment/i.test(html));
    // dump embedded state candidates
    for (const m of html.match(/window\.__[A-Z_]+__|ng-state|__NEXT_DATA__/g) || []) console.log("marker:", m);
    await page.screenshot({ path: "/tmp/ss_stealth.png" });
    const cookies = await ctx.cookies();
    console.log("cookies:", cookies.map(c => c.name).join(","));
  } catch (e) {
    console.error("ERR:", (e as Error).message);
  }
  await browser.close();
}
main();
