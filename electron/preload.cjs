'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Expose a safe, limited API to the renderer process via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // Example: send a message to the main process
  send: (channel, data) => {
    const allowedChannels = ['app:ready']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  // Example: receive a message from the main process
  on: (channel, callback) => {
    const allowedChannels = ['app:update']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
})
