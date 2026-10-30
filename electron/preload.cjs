'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// The renderer talks to the master server over the websocket, so it only
// needs Electron for the native file dialog and the desktop app's own settings.
contextBridge.exposeInMainWorld('electronAPI', {
  selectExecutable: async () => {
    return ipcRenderer.invoke('dialog:selectExecutable')
  },
  // Settings for the desktop app itself (tray icon, close behaviour)
  getDesktopSettings: () => ipcRenderer.invoke('settings:getDesktop'),
  updateDesktopSettings: (patch) => ipcRenderer.invoke('settings:updateDesktop', patch),
})
