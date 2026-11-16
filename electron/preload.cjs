const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kalaiDigital', {
  platform: process.platform,
  isElectron: true,
  updatePlatform: 'windows',
  openExternal: (url) => ipcRenderer.invoke('kalai:open-external', url),
  installUpdate: (payload) => ipcRenderer.invoke('kalai:update-install', payload)
});
