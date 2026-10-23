'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// The renderer talks to the master server over the websocket, so the only
// thing it needs from Electron is the native file dialog.
contextBridge.exposeInMainWorld('electronAPI', {
  selectExecutable: async () => {
    return ipcRenderer.invoke('dialog:selectExecutable')
  },
})
