import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "path";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";

const isDev = process.env.NODE_ENV === "development";

// Set DATABASE_URL to user's app data dir
const dbPath = path.join(app.getPath("userData"), "qorpera.db");
process.env.DATABASE_URL = `file:${dbPath}`;

// Copy template DB if user's DB is empty or missing
function ensureDatabase() {
  const needsInit = !fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0;
  if (needsInit) {
    const resourceBase = process.resourcesPath || app.getAppPath();
    const templateDb = path.join(resourceBase, "prisma", "qorpera.db");
    if (fs.existsSync(templateDb) && fs.statSync(templateDb).size > 0) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.copyFileSync(templateDb, dbPath);
      console.log("[db] Initialized database from template");
    }
  }
}

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
const PORT = isDev ? parseInt(process.env.DEV_PORT || "3000", 10) : 3456;

function createWindow() {
  mainWindow = new BrowserWindow({
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

  // if (isDev) {
  //   mainWindow.webContents.openDevTools({ mode: "detach" });
  // }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Start the Next.js standalone server in production
function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // In production, the standalone server is in extraResources/standalone/
    const resourceBase = process.resourcesPath || app.getAppPath();
    const serverPath = path.join(resourceBase, "standalone", "server.js");

    if (!fs.existsSync(serverPath)) {
      // Fallback: try inside app dir (dev-like layout)
      const fallback = path.join(app.getAppPath(), ".next", "standalone", "server.js");
      if (!fs.existsSync(fallback)) {
        reject(new Error(`Next.js server not found at ${serverPath} or ${fallback}`));
        return;
      }
    }

    const actualPath = fs.existsSync(serverPath)
      ? serverPath
      : path.join(app.getAppPath(), ".next", "standalone", "server.js");

    const standaloneDir = path.dirname(actualPath);
    const depsDir = path.join(standaloneDir, "deps");

    nextServer = spawn(process.execPath, [actualPath], {
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

    nextServer.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      console.log("[next]", msg);
      if (msg.includes("Ready") || msg.includes("started")) {
        resolve();
      }
    });

    nextServer.stderr?.on("data", (data: Buffer) => {
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
ipcMain.handle("open-file-dialog", async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: options?.filters || [
      { name: "Data Files", extensions: ["csv", "json"] },
      { name: "CSV", extensions: ["csv"] },
      { name: "JSON", extensions: ["json"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-platform", () => process.platform);

app.whenReady().then(async () => {
  if (!isDev) {
    ensureDatabase();
    try {
      await startNextServer();
    } catch (err) {
      console.error("Failed to start Next.js server:", err);
    }
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
