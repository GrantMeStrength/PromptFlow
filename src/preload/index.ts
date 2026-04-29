import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, LLMSettings, ChatMessage } from '../renderer/src/types'

const api: ElectronAPI = {
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  loadProject: () => ipcRenderer.invoke('load-project'),
  runCode: (code, input, uiInputs) => ipcRenderer.invoke('run-code', code, input, uiInputs),
  callLLM: (prompt, systemPrompt) => ipcRenderer.invoke('call-llm', prompt, systemPrompt),
  callLLMChat: (messages: ChatMessage[], systemPrompt?: string) => ipcRenderer.invoke('call-llm-chat', messages, systemPrompt),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: LLMSettings) => ipcRenderer.invoke('save-settings', settings),
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.off('menu-action', handler)
  },
  pickSkillsFile: () => ipcRenderer.invoke('pick-skills-file'),
  testMcpConnection: (config) => ipcRenderer.invoke('test-mcp-connection', config),
  // Library
  getProjectsDir: () => ipcRenderer.invoke('get-projects-dir'),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  saveToLibrary: (project) => ipcRenderer.invoke('save-to-library', project),
  deleteProject: (filePath) => ipcRenderer.invoke('delete-project', filePath),
  openProjectByPath: (filePath) => ipcRenderer.invoke('open-project-by-path', filePath),
  // Report export
  saveReportHtml: (html: string) => ipcRenderer.invoke('save-report-html', html),
  exportReportPdf: (html: string) => ipcRenderer.invoke('export-report-pdf', html),
}

contextBridge.exposeInMainWorld('electronAPI', api)
