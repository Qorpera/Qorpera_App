import { spawn, type ChildProcess } from "child_process";
import * as path from "path";

const root = path.resolve(__dirname, "..");
let nextProc: ChildProcess | null = null;
let electronProc: ChildProcess | null = null;

let resolvedPort = 3000;

function startNext(): Promise<void> {
  return new Promise((resolve) => {
    nextProc = spawn("npx", ["next", "dev"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
      shell: true,
    });

    nextProc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(`[next] ${text}`);
      // Capture the actual port Next.js chose
      const portMatch = text.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (portMatch) {
        resolvedPort = parseInt(portMatch[1], 10);
      }
      if (text.includes("Ready in") || text.includes("started server")) {
        resolve();
      }
    });

    nextProc.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[next] ${data.toString()}`);
    });
  });
}

function startElectron() {
  electronProc = spawn("npx", ["electron", ".", "--no-sandbox"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development", DEV_PORT: String(resolvedPort) },
    shell: true,
  });

  electronProc.on("close", () => {
    nextProc?.kill();
    process.exit(0);
  });
}

async function main() {
  console.log("Starting Next.js dev server...");
  await startNext();
  console.log("Next.js ready. Starting Electron...");
  startElectron();
}

main().catch(console.error);
