"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const root = path.resolve(__dirname, "..");
let nextProc = null;
let electronProc = null;
function startNext() {
    return new Promise((resolve) => {
        nextProc = (0, child_process_1.spawn)("npx", ["next", "dev"], {
            cwd: root,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, NODE_ENV: "development" },
            shell: true,
        });
        nextProc.stdout?.on("data", (data) => {
            const text = data.toString();
            process.stdout.write(`[next] ${text}`);
            if (text.includes("Ready in") || text.includes("started server")) {
                resolve();
            }
        });
        nextProc.stderr?.on("data", (data) => {
            process.stderr.write(`[next] ${data.toString()}`);
        });
    });
}
function startElectron() {
    electronProc = (0, child_process_1.spawn)("npx", ["electron", ".", "--no-sandbox"], {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development" },
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
