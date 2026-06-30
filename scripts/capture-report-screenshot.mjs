import { chromium } from "playwright";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const reportPath = join(__dirname, "..", "docs", "sample-report.html");
const outPath = join(__dirname, "..", "docs", "report.png");
const fileUrl = `file:///${reportPath.replace(/\\/g, "/")}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
await page.goto(fileUrl, { waitUntil: "load" });

await page.evaluate(() => {
  document.querySelector(".target").textContent = "https://fixture.example.com";
  const urls = document.querySelectorAll("details.page .url");
  if (urls[0]) urls[0].textContent = "https://fixture.example.com";
});

const pages = page.locator("details.page");
if ((await pages.count()) > 1) {
  await pages.nth(1).evaluate((el) => el.removeAttribute("open"));
}

await page.locator("details.third-party-group").evaluate((el) => el.removeAttribute("open"));

const clip = await page.evaluate(() => {
  const header = document.querySelector("header");
  const thirdParty = document.querySelector("details.third-party-group");
  const bottom = thirdParty?.getBoundingClientRect().bottom ?? document.querySelector("details.page")?.getBoundingClientRect().bottom ?? 900;
  return {
    x: 0,
    y: 0,
    width: Math.ceil(Math.max(header.getBoundingClientRect().width, 1000)),
    height: Math.ceil(bottom + 24),
  };
});

await page.screenshot({ path: outPath, clip });
await browser.close();
console.log(`Wrote ${outPath} (${clip.width}x${clip.height})`);
