const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  setIgnore: (v) => ipcRenderer.send('desk:ignore', v),
  quit: () => ipcRenderer.send('desk:quit'),
});
