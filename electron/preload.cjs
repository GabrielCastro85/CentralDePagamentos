const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('centralApi', {
  invoke(action, payload) {
    return ipcRenderer.invoke('central:invoke', action, payload);
  },
  // Recebe eventos push do auto-updater (checking, available, downloading, downloaded, error)
  onUpdaterEvent(callback) {
    const listener = (_, event) => callback(event);
    ipcRenderer.on('updater:event', listener);
    return () => ipcRenderer.removeListener('updater:event', listener);
  },
});
