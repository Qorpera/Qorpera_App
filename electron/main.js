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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const isDev = process.env.NODE_ENV === "development";
// Set DATABASE_URL to user's app data dir
const dbPath = path.join(electron_1.app.getPath("userData"), "qorpera.db");
process.env.DATABASE_URL = `file:${dbPath}`;
// Copy template DB if user's DB is empty or missing
function ensureDatabase() {
    const needsInit = !fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0;
    if (needsInit) {
        const resourceBase = process.resourcesPath || electron_1.app.getAppPath();
        const templateDb = path.join(resourceBase, "prisma", "qorpera.db");
        if (fs.existsSync(templateDb) && fs.statSync(templateDb).size > 0) {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true });
            fs.copyFileSync(templateDb, dbPath);
            console.log("[db] Initialized database from template");
        }
    }
}
let mainWindow = null;
let nextServer = null;
const PORT = isDev ? 3000 : 3456;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: "Qorpera",
        backgroundColor: "#0e1418",
        titleBarStyle: "hiddenInset",
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadURL(`http://localhost:${PORT}`);
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
    });
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// Start the Next.js standalone server in production
function startNextServer() {
    return new Promise((resolve, reject) => {
        // In production, the standalone server is in extraResources/standalone/
        const resourceBase = process.resourcesPath || electron_1.app.getAppPath();
        const serverPath = path.join(resourceBase, "standalone", "server.js");
        if (!fs.existsSync(serverPath)) {
            // Fallback: try inside app dir (dev-like layout)
            const fallback = path.join(electron_1.app.getAppPath(), ".next", "standalone", "server.js");
            if (!fs.existsSync(fallback)) {
                reject(new Error(`Next.js server not found at ${serverPath} or ${fallback}`));
                return;
            }
        }
        const actualPath = fs.existsSync(serverPath)
            ? serverPath
            : path.join(electron_1.app.getAppPath(), ".next", "standalone", "server.js");
        const standaloneDir = path.dirname(actualPath);
        const depsDir = path.join(standaloneDir, "deps");
        nextServer = (0, child_process_1.spawn)(process.execPath, [actualPath], {
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: "1",
                NODE_PATH: depsDir,
                PORT: String(PORT),
                HOSTNAME: "localhost",
                DATABASE_URL: `file:${dbPath}`,
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        nextServer.stdout?.on("data", (data) => {
            const msg = data.toString();
            console.log("[next]", msg);
            if (msg.includes("Ready") || msg.includes("started")) {
                resolve();
            }
        });
        nextServer.stderr?.on("data", (data) => {
            console.error("[next:err]", data.toString());
        });
        nextServer.on("error", (err) => {
            reject(err);
        });
        // Timeout: resolve anyway after 5s
        setTimeout(() => resolve(), 5000);
    });
}
// IPC: Native file picker
electron_1.ipcMain.handle("open-file-dialog", async (_event, options) => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: options?.filters || [
            { name: "Data Files", extensions: ["csv", "json"] },
            { name: "CSV", extensions: ["csv"] },
            { name: "JSON", extensions: ["json"] },
        ],
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
electron_1.ipcMain.handle("get-app-version", () => electron_1.app.getVersion());
electron_1.ipcMain.handle("get-platform", () => process.platform);
electron_1.app.whenReady().then(async () => {
    if (!isDev) {
        ensureDatabase();
        try {
            await startNextServer();
        }
        catch (err) {
            console.error("Failed to start Next.js server:", err);
        }
    }
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
electron_1.app.on("before-quit", () => {
    if (nextServer) {
        nextServer.kill();
        nextServer = null;
    }
});
