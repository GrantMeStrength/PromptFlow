import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../renderer/src/types'

const api: ElectronAPI = {
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  loadProject: () => ipcRenderer.invoke('load-project'),
  runCode: (code, input) => ipcRenderer.invoke('run-code', code, input),
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.off('menu-action', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
