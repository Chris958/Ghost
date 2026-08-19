const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghost', {
  getConfig: () => ipcRenderer.invoke('ghost:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('ghost:save-config', config),
  testToken: (options) => ipcRenderer.invoke('ghost:test-token', options),
  searchStocks: (query) => ipcRenderer.invoke('ghost:search-stocks', query),
  hide: () => ipcRenderer.invoke('ghost:hide'),
  closeSettings: () => ipcRenderer.invoke('ghost:close-settings'),
  refresh: () => ipcRenderer.invoke('ghost:refresh'),
  resize: (size) => ipcRenderer.invoke('ghost:resize', size),
  onConfig: (callback) => ipcRenderer.on('ghost:config', (_event, value) => callback(value)),
  onQuotes: (callback) => ipcRenderer.on('ghost:quotes', (_event, value) => callback(value)),
  onSettingsOpen: (callback) => ipcRenderer.on('ghost:settings-open', callback)
});
