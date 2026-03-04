"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    openFileDialog: (options) => electron_1.ipcRenderer.invoke("open-file-dialog", options),
    getAppVersion: () => electron_1.ipcRenderer.invoke("get-app-version"),
    getPlatform: () => electron_1.ipcRenderer.invoke("get-platform"),
});
