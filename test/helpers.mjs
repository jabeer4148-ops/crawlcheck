import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

export function startFixtureServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const filePath = join(FIXTURE_DIR, pathname === "/" ? "index.html" : pathname.slice(1));
      try {
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

export function runCrawlcheck(url, extraArgs = []) {
  const cli = join(__dirname, "..", "src", "cli.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, url, ...extraArgs], {
      cwd: join(__dirname, ".."),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}
