import { contextBridge, ipcRenderer } from 'electron';
import { desktopRuntimeChannel } from './runtime-config';

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
});

contextBridge.exposeInMainWorld('teamai', {
  getRuntimeConfig: () => ipcRenderer.invoke(desktopRuntimeChannel),
});
