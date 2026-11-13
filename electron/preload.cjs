'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// The renderer talks to the master server over the websocket, so it only needs
// Electron for the native file dialog, the desktop app's own settings, and the
// windows only the main process can open.
contextBridge.exposeInMainWorld('electronAPI', {
  selectExecutable: async () => {
    return ipcRenderer.invoke('dialog:selectExecutable')
  },
  // Opens the MacroPad (the touch view) in its own window, or focuses the open one.
  openMacroPad: () => ipcRenderer.invoke('window:openMacroPad'),
  // Settings for the desktop app itself (tray icon, close behaviour)
  getDesktopSettings: () => ipcRenderer.invoke('settings:getDesktop'),
  updateDesktopSettings: (patch) => ipcRenderer.invoke('settings:updateDesktop', patch),
})
