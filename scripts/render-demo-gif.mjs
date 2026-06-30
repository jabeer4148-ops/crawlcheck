import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const framesDir = join(root, "docs", ".demo-frames");
const outGif = join(root, "docs", "demo.gif");
const command = "node src/cli.js https://the-internet.herokuapp.com --max 1 --depth 0 --no-a11y";

const bodyLines = [
  "",
  "🔍 crawlcheck — scanning https://the-internet.herokuapp.com",
  "",
  "   [1] https://the-internet.herokuapp.com  ok  (js:0 req:0 links:1 a11y:0)",
  "",
  "📊 Summary",
  "   Pages crawled:        1",
  "   JS console errors:    0 (+1 third-party)",
  "   Uncaught exceptions:  0",
  "   Failed requests:      0 (+1 third-party)",
  "   Broken links:         1",
  "   A11y violations (advisory):      0",
  "   Third-party issues:   2 (excluded from exit code; use --include-third-party)",
  "",
  "📄 Report: crawlcheck-report.html",
  "",
];

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(prompt, visibleBodyLines, highlightThirdParty) {
  const body = visibleBodyLines
    .map((line) => {
      const cls =
        highlightThirdParty && (line.includes("(+1 third-party)") || line.startsWith("   Third-party issues:"))
          ? "highlight"
          : "";
      return `<div class="line ${cls}">${escapeHtml(line) || "&nbsp;"}</div>`;
    })
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #1a1b26; }
  .term { width: 960px; min-height: 520px; padding: 28px 32px; font-family: Consolas, "Cascadia Mono", "Courier New", monospace; font-size: 15px; line-height: 1.55; color: #c0caf5; }
  .prompt { color: #7aa2f7; margin-bottom: 10px; white-space: pre-wrap; word-break: break-all; }
  .line { white-space: pre-wrap; word-break: break-all; }
  .highlight { color: #bb9af7; background: #292e42; border-radius: 4px; padding: 0 4px; margin: 0 -4px; }
  .cursor { display: inline-block; width: 9px; height: 1.1em; background: #7aa2f7; vertical-align: text-bottom; margin-left: 2px; }
</style></head>
<body><div class="term">
  <div class="prompt">PS C:\\my_repo\\crawlcheck&gt; ${escapeHtml(prompt)}<span class="cursor"></span></div>
  ${body}
</div></body></html>`;
}

function buildTimeline() {
  const frames = [];

  for (let i = 4; i < command.length; i += 4) {
    frames.push({ prompt: command.slice(0, i), lines: [], repeat: 1 });
  }
  frames.push({ prompt: command, lines: [], repeat: 5 });

  const prefixes = [
    [],
    bodyLines.slice(0, 2),
    bodyLines.slice(0, 4),
    bodyLines.slice(0, 6),
    bodyLines.slice(0, 8),
    bodyLines.slice(0, 10),
    bodyLines.slice(0, 12),
    bodyLines.slice(0, 14),
    bodyLines,
  ];
  for (const lines of prefixes) {
    frames.push({ prompt: command, lines, repeat: lines.length <= 4 ? 4 : 3, highlight: false });
  }

  frames.push({ prompt: command, lines: bodyLines, repeat: 55, highlight: true });
  return frames;
}

async function renderFrames() {
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 520 } });
  const timeline = buildTimeline();
  let index = 0;

  for (const step of timeline) {
    for (let r = 0; r < step.repeat; r++) {
      await page.setContent(renderHtml(step.prompt, step.lines, step.highlight), { waitUntil: "load" });
      const file = join(framesDir, `frame_${String(index).padStart(4, "0")}.png`);
      await page.screenshot({ path: file, fullPage: false });
      index++;
    }
  }

  await browser.close();
  return index;
}

function runFfmpeg(frameCount) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-framerate", "10",
      "-i", join(framesDir, "frame_%04d.png"),
      "-frames:v", String(frameCount),
      "-vf", "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
      "-loop", "0",
      outGif,
    ];
    const proc = spawn("ffmpeg", args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const frameCount = await renderFrames();
await runFfmpeg(frameCount);
await rm(framesDir, { recursive: true, force: true });
console.log(`Wrote ${outGif} (${frameCount} frames, ~${(frameCount / 10).toFixed(1)}s)`);
