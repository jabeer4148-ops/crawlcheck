import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer, runCrawlcheck } from "./helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const out = join(__dirname, "..", "docs", "sample-report.html");

const { server, url } = await startFixtureServer();
try {
  await mkdir(join(__dirname, "..", "docs"), { recursive: true });
  await runCrawlcheck(url, ["--max", "2", "--out", out]);
  console.log(`Wrote ${out}`);
} finally {
  server.close();
}
