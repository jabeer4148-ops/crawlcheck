import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer, runCrawlcheck } from "./helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

const { server, url } = await startFixtureServer();
const resultsPath = join(root, "results.json");

try {
  const code = await runCrawlcheck(url, ["--max", "2", "--json", resultsPath, "--strict"]);
  const { totals } = JSON.parse(await readFile(resultsPath, "utf8"));
  const fp = totals.firstParty;
  const tp = totals.thirdParty;

  const checks = [
    ["first-party console errors", fp.consoleErrors >= 1],
    ["uncaught exceptions", fp.pageErrors >= 1],
    ["first-party failed requests", fp.failedRequests >= 1],
    ["broken links", fp.brokenLinks >= 1],
    ["a11y violations", totals.a11yViolations >= 1],
    ["third-party issues", tp.consoleErrors + tp.failedRequests >= 1],
    ["non-zero exit with --strict", code === 1],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("\n❌ Assertion failures:");
    for (const [name] of failed) console.error(`   - ${name}`);
    console.error("\nTotals:", JSON.stringify(totals, null, 2));
    process.exit(1);
  }

  console.log("\n✅ All fixture assertions passed.");
} finally {
  server.close();
}
