import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke("open-file-dialog", options),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),
});
