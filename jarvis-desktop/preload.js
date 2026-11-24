const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  getSystem: () => ipcRenderer.invoke('app:system'),
  windowAction: (action) => ipcRenderer.invoke('app:window', action),
  sendMessage: (text) => ipcRenderer.invoke('assistant:send', text),
  clearChat: () => ipcRenderer.invoke('assistant:clear'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  addNote: (text) => ipcRenderer.invoke('notes:add', text),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  addTask: (text) => ipcRenderer.invoke('tasks:add', text),
  toggleTask: (id) => ipcRenderer.invoke('tasks:toggle', id),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  launchApp: (name) => ipcRenderer.invoke('apps:launch', name),
  openSite: (name) => ipcRenderer.invoke('apps:open-url', name),
  openDownloads: () => ipcRenderer.invoke('apps:open-downloads'),
  setTheme: (theme) => ipcRenderer.invoke('system:theme', theme)
});
