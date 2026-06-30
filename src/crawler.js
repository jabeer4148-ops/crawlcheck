import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

function classifyOrigin(resourceUrl, pageUrl) {
  if (!resourceUrl) return "first-party";
  return sameOrigin(resourceUrl, pageUrl) ? "first-party" : "third-party";
}

function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch { return null; }
}

export async function crawl(args) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const startOrigin = new URL(args.url).origin;

  const queue = [{ url: normalize(args.url), depth: 0 }];
  const seen = new Set([normalize(args.url)]);
  const results = [];

  while (queue.length && results.length < args.max) {
    const { url, depth } = queue.shift();
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const failedRequestUrls = new Set();

    const recordFailedRequest = (requestUrl, reason) => {
      const key = requestUrl.slice(0, 300);
      if (failedRequestUrls.has(key)) return;
      failedRequestUrls.add(key);
      failedRequests.push({
        url: key,
        reason,
        origin: classifyOrigin(requestUrl, url),
      });
    };

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const loc = msg.location();
      const sourceUrl = loc?.url || null;
      consoleErrors.push({
        text: msg.text().slice(0, 500),
        origin: classifyOrigin(sourceUrl, url),
      });
    });
    page.on("pageerror", (err) => pageErrors.push((err.message || String(err)).slice(0, 500)));
    page.on("requestfailed", (req) => {
      recordFailedRequest(req.url(), req.failure()?.errorText || "unknown");
    });
    page.on("response", (res) => {
      const req = res.request();
      if (req.failure()) return;
      if (res.status() >= 400) recordFailedRequest(res.url(), `HTTP ${res.status()}`);
    });

    let status = null;
    let navError = null;
    let links = [];
    let a11yViolations = [];

    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: args.timeout });
      status = resp ? resp.status() : null;
      links = await page.$$eval("a[href]", (els) => els.map((e) => e.href));
    } catch (e) {
      navError = (e.message || String(e)).slice(0, 300);
    }

    if (args.a11y) {
      try {
        await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        const axe = await new AxeBuilder({ page }).analyze();
        a11yViolations = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          helpUrl: v.helpUrl,
        }));
      } catch (e) {
        console.warn(`   ⚠️  a11y skipped on ${url}: ${(e.message || String(e)).slice(0, 120)}`);
      }
    }

    const brokenLinks = [];
    const toCheck = [...new Set(links.map(normalize).filter(Boolean))].slice(0, 60);
    for (const link of toCheck) {
      try {
        let r = await context.request.head(link, { timeout: 8000, failOnStatusCode: false });
        if (r.status() === 405 || r.status() === 501) {
          r = await context.request.get(link, { timeout: 8000, failOnStatusCode: false });
        }
        if (r.status() >= 400 && r.status() !== 401 && r.status() !== 403) {
          brokenLinks.push({ url: link.slice(0, 300), status: r.status() });
        }
      } catch {
        // unreachable or blocked; skip rather than false-positive
      }
      if (sameOrigin(link, startOrigin) && depth < args.depth && !seen.has(link)) {
        seen.add(link);
        queue.push({ url: link, depth: depth + 1 });
      }
    }

    const fpJs = pageErrors.length + consoleErrors.filter((e) => e.origin === "first-party").length;
    const fpReq = failedRequests.filter((r) => r.origin === "first-party").length;

    results.push({ url, status, navError, consoleErrors, pageErrors, failedRequests, brokenLinks, a11yViolations });
    console.log(
      `   [${results.length}] ${url}  ${navError ? "⚠️ nav error" : "ok"}` +
        `  (js:${fpJs} req:${fpReq} links:${brokenLinks.length} a11y:${a11yViolations.length})`
    );

    await page.close();
  }

  await browser.close();
  return results;
}
