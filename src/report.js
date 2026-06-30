import { writeFileSync } from "node:fs";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const impactColor = { critical: "#b91c1c", serious: "#c2410c", moderate: "#a16207", minor: "#3f6212" };

function buildIssueLists(p) {
  const firstParty = [];
  const thirdParty = [];

  p.pageErrors.forEach((e) => {
    firstParty.push(`<li class="err">Uncaught exception: <code>${esc(e)}</code></li>`);
  });
  p.consoleErrors.forEach((e) => {
    const li = `<li class="err">Console error: <code>${esc(e.text)}</code></li>`;
    if (e.origin === "third-party") thirdParty.push(li);
    else firstParty.push(li);
  });
  p.failedRequests.forEach((r) => {
    const li = `<li class="req">Failed request (${esc(r.reason)}): <code>${esc(r.url)}</code></li>`;
    if (r.origin === "third-party") thirdParty.push(li);
    else firstParty.push(li);
  });
  p.brokenLinks.forEach((l) => {
    firstParty.push(`<li class="link">Broken link (HTTP ${esc(l.status)}): <code>${esc(l.url)}</code></li>`);
  });
  p.a11yViolations.forEach((v) => {
    firstParty.push(
      `<li class="a11y"><span class="badge" style="background:${impactColor[v.impact] || "#555"}">${esc(v.impact || "n/a")}</span> ${esc(v.help)} (${v.nodes} node${v.nodes === 1 ? "" : "s"}) — <a href="${esc(v.helpUrl)}" target="_blank">learn more</a></li>`
    );
  });
  if (p.navError) firstParty.unshift(`<li class="err">Navigation error: <code>${esc(p.navError)}</code></li>`);

  return { firstParty, thirdParty };
}

export function writeReport(results, totals, args, outPath) {
  const fp = totals.firstParty;
  const tp = totals.thirdParty;
  const fpIssueCount = fp.consoleErrors + fp.pageErrors + fp.failedRequests + fp.brokenLinks;
  const tpIssueCount = tp.consoleErrors + tp.failedRequests;
  const reportIssueCount = fpIssueCount + (args.includeThirdParty ? tpIssueCount : 0);
  const a11yCountsTowardStatus = args.strict;
  const statusIssues = reportIssueCount + (a11yCountsTowardStatus ? totals.a11yViolations : 0);
  const status = statusIssues === 0 ? "PASS" : "ISSUES FOUND";
  const statusColor = statusIssues === 0 ? "#15803d" : "#b91c1c";

  const pageSections = results
    .map((p) => {
      const { firstParty, thirdParty } = buildIssueLists(p);
      const tpCount = thirdParty.length;
      const a11yCount = p.a11yViolations.length;
      const fpCount = firstParty.length - a11yCount;
      const pageClean = fpCount === 0 && tpCount === 0 && a11yCount === 0;
      const displayCount = fpCount + (args.includeThirdParty ? tpCount : 0) + (a11yCountsTowardStatus ? a11yCount : 0);

      let body = "";
      if (pageClean) {
        body = '<p class="ok">No issues found on this page.</p>';
      } else {
        if (fpCount > 0 || a11yCount > 0) {
          body += `<div class="issue-group"><h4 class="group-title">Your issues</h4><ul>${firstParty.join("")}</ul></div>`;
        } else {
          body += `<p class="ok">No first-party issues on this page.</p>`;
        }
        if (tpCount > 0) {
          body += `
          <details class="third-party-group">
            <summary>Third-party / external (${tpCount})</summary>
            <ul>${thirdParty.join("")}</ul>
          </details>`;
        }
      }

      return `
      <details ${pageClean ? "" : "open"} class="page ${pageClean ? "clean" : ""}">
        <summary>
          <span class="dot" style="background:${pageClean ? "#15803d" : "#b91c1c"}"></span>
          <span class="url">${esc(p.url)}</span>
          <span class="count">${pageClean ? "clean" : displayCount + " issue" + (displayCount === 1 ? "" : "s")}</span>
        </summary>
        ${body}
      </details>`;
    })
    .join("");

  const a11yCardLabel = args.strict ? "A11y violations" : "A11y (advisory)";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>crawlcheck report — ${esc(args.url)}</title>
<style>
  :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; background: #f8fafc; color: #1e293b; }
  header { background: #0f172a; color: #fff; padding: 28px 32px; }
  header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -0.01em; }
  header .target { color: #94a3b8; font-size: 14px; word-break: break-all; }
  .status { display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; color: #fff; background: ${statusColor}; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 24px 0; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
  .card .n { font-size: 26px; font-weight: 700; }
  .card .l { font-size: 12px; color: #64748b; margin-top: 4px; }
  .card.advisory .n { color: #a16207; }
  .card.note { grid-column: 1 / -1; text-align: left; padding: 12px 16px; font-size: 13px; color: #64748b; }
  details.page { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; padding: 4px 14px; }
  details.page.clean { opacity: 0.7; }
  summary { cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 10px 0; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .url { font-size: 14px; word-break: break-all; flex: 1; }
  .count { font-size: 12px; color: #64748b; flex: none; }
  .issue-group { margin: 4px 0 12px; }
  .group-title { margin: 0 0 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  details.third-party-group { margin: 8px 0 12px; padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; }
  details.third-party-group summary { padding: 4px 0; font-size: 13px; color: #64748b; font-weight: 600; }
  ul { margin: 4px 0 12px; padding-left: 22px; }
  li { margin: 6px 0; font-size: 13px; line-height: 1.5; }
  li.err { color: #b91c1c; } li.req { color: #c2410c; } li.link { color: #7c3aed; } li.a11y { color: #1e293b; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 12px; word-break: break-all; }
  .badge { color: #fff; font-size: 11px; padding: 1px 7px; border-radius: 999px; margin-right: 4px; }
  .ok { color: #15803d; font-size: 13px; margin: 4px 0 12px; }
  footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 24px; }
  a { color: #2563eb; }
</style></head>
<body>
  <header>
    <h1>🔍 crawlcheck report</h1>
    <div class="target">${esc(args.url)}</div>
    <div class="status">${status}</div>
  </header>
  <div class="wrap">
    <div class="cards">
      <div class="card"><div class="n">${results.length}</div><div class="l">Pages crawled</div></div>
      <div class="card"><div class="n">${fp.consoleErrors + fp.pageErrors}</div><div class="l">JS errors (yours)</div></div>
      <div class="card"><div class="n">${fp.failedRequests}</div><div class="l">Failed requests (yours)</div></div>
      <div class="card"><div class="n">${fp.brokenLinks}</div><div class="l">Broken links</div></div>
      <div class="card advisory"><div class="n">${totals.a11yViolations}</div><div class="l">${a11yCardLabel}</div></div>
      ${tpIssueCount > 0 ? `<div class="card note">Third-party issues excluded from counts above: ${tpIssueCount} (expand per-page sections to view)</div>` : ""}
    </div>
    ${pageSections}
  </div>
  <footer>Generated by crawlcheck · ${new Date().toISOString()}</footer>
</body></html>`;

  writeFileSync(outPath, html);
}
