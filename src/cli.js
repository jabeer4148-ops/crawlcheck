#!/usr/bin/env node
import { crawl } from "./crawler.js";
import { writeReport } from "./report.js";
import { writeFileSync } from "node:fs";

const HELP = `
crawlcheck — crawl a site and catch JS errors, broken links, failed requests, and a11y violations.

Usage:
  npx crawlcheck <url> [options]

Options:
  --max <n>               Max pages to crawl (default: 25)
  --depth <n>             Max link depth from the start URL (default: 2)
  --out <file>            HTML report path (default: crawlcheck-report.html)
  --json <file>           Also write raw results as JSON
  --no-a11y               Skip accessibility checks (faster)
  --strict                Treat a11y violations as failures (exit code 1)
  --include-third-party   Count third-party JS/request issues toward totals and exit code
  --timeout <ms>          Per-page navigation timeout (default: 15000)
  -h, --help              Show this help

Examples:
  npx crawlcheck https://example.com
  npx crawlcheck https://example.com --max 50 --depth 3
`;

function parseArgs(argv) {
  const args = {
    url: null,
    max: 25,
    depth: 2,
    out: "crawlcheck-report.html",
    json: null,
    a11y: true,
    strict: false,
    includeThirdParty: false,
    timeout: 15000,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-h" || a === "--help") { console.log(HELP); process.exit(0); }
    else if (a === "--max") args.max = parseInt(rest[++i], 10);
    else if (a === "--depth") args.depth = parseInt(rest[++i], 10);
    else if (a === "--out") args.out = rest[++i];
    else if (a === "--json") args.json = rest[++i];
    else if (a === "--no-a11y") args.a11y = false;
    else if (a === "--strict") args.strict = true;
    else if (a === "--include-third-party") args.includeThirdParty = true;
    else if (a === "--timeout") args.timeout = parseInt(rest[++i], 10);
    else if (!a.startsWith("-") && !args.url) args.url = a;
  }
  return args;
}

function computeTotals(results) {
  const totals = {
    firstParty: { consoleErrors: 0, pageErrors: 0, failedRequests: 0, brokenLinks: 0 },
    thirdParty: { consoleErrors: 0, failedRequests: 0 },
    a11yViolations: 0,
  };

  for (const p of results) {
    totals.firstParty.pageErrors += p.pageErrors.length;
    totals.firstParty.brokenLinks += p.brokenLinks.length;
    totals.a11yViolations += p.a11yViolations.length;

    for (const e of p.consoleErrors) {
      if (e.origin === "third-party") totals.thirdParty.consoleErrors++;
      else totals.firstParty.consoleErrors++;
    }
    for (const r of p.failedRequests) {
      if (r.origin === "third-party") totals.thirdParty.failedRequests++;
      else totals.firstParty.failedRequests++;
    }
  }

  return totals;
}

function countExitIssues(totals, args) {
  const fp = totals.firstParty;
  let n = fp.consoleErrors + fp.pageErrors + fp.failedRequests + fp.brokenLinks;
  if (args.includeThirdParty) {
    n += totals.thirdParty.consoleErrors + totals.thirdParty.failedRequests;
  }
  if (args.strict) n += totals.a11yViolations;
  return n;
}

const args = parseArgs(process.argv);

if (!args.url) {
  console.error("Error: missing <url>.\n" + HELP);
  process.exit(1);
}
try {
  if (!/^https?:\/\//i.test(args.url)) args.url = "https://" + args.url;
  new URL(args.url);
} catch {
  console.error(`Error: invalid URL "${args.url}"`);
  process.exit(1);
}

console.log(`\n🔍 crawlcheck — scanning ${args.url}\n`);

const results = await crawl(args);
const totals = computeTotals(results);
const exitIssues = countExitIssues(totals, args);

writeReport(results, totals, args, args.out);
if (args.json) writeFileSync(args.json, JSON.stringify({ results, totals }, null, 2));

const fp = totals.firstParty;
const tp = totals.thirdParty;
const tpTotal = tp.consoleErrors + tp.failedRequests;
const a11yLabel = args.strict ? "A11y violations" : "A11y violations (advisory)";

console.log(`\n📊 Summary`);
console.log(`   Pages crawled:        ${results.length}`);
console.log(`   JS console errors:    ${fp.consoleErrors}${tp.consoleErrors ? ` (+${tp.consoleErrors} third-party)` : ""}`);
console.log(`   Uncaught exceptions:  ${fp.pageErrors}`);
console.log(`   Failed requests:      ${fp.failedRequests}${tp.failedRequests ? ` (+${tp.failedRequests} third-party)` : ""}`);
console.log(`   Broken links:         ${fp.brokenLinks}`);
console.log(`   ${a11yLabel}:      ${totals.a11yViolations}`);
if (tpTotal > 0 && !args.includeThirdParty) {
  console.log(`   Third-party issues:   ${tpTotal} (excluded from exit code; use --include-third-party)`);
}
console.log(`\n📄 Report: ${args.out}`);
if (args.json) console.log(`📄 JSON:   ${args.json}`);
console.log("");

process.exit(exitIssues > 0 ? 1 : 0);
