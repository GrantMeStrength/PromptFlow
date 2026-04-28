import { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import vm from 'vm'
import { pathToFileURL } from 'url'

// ─── Settings ────────────────────────────────────────────────────────────────

interface LLMSettings {
  apiKey: string
  baseURL: string
  defaultModel: string
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'promptflow-settings.json')
}

function loadSettings(): LLMSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return { apiKey: '', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', ...JSON.parse(raw) }
  } catch {
    return { apiKey: '', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' }
  }
}

function saveSettings(settings: LLMSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

async function callLLM(model: string, prompt: string, systemPrompt?: string): Promise<string> {
  const settings = loadSettings()
  if (!settings.apiKey) throw new Error('No API key configured — open Settings (⌘,) to add one.')
  const baseURL = settings.baseURL || 'https://api.openai.com/v1'
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 2000 }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }
  const data = await response.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
}

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'PromptFlow IDE',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL('app://promptflow/index.html')
  }

  setupMenu()
}

function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu-action', 'new'),
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-action', 'open'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-action', 'save'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('save-project', async (_event, project: object) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save PromptFlow Project',
      defaultPath: `${(project as { name: string }).name ?? 'project'}.promptflow`,
      filters: [{ name: 'PromptFlow Project', extensions: ['promptflow'] }],
    })
    if (canceled || !filePath) return { success: false }
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8')
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('load-project', async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Open PromptFlow Project',
      filters: [{ name: 'PromptFlow Project', extensions: ['promptflow', 'json'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { success: false }
    const raw = fs.readFileSync(filePaths[0], 'utf-8')
    const project = JSON.parse(raw)
    return { success: true, project }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('get-settings', () => loadSettings())

ipcMain.handle('save-settings', (_event, settings: LLMSettings) => {
  saveSettings(settings)
  return { success: true }
})

ipcMain.handle('run-code', async (_event, code: string, input: unknown) => {
  try {
    const sandbox: Record<string, unknown> = {
      inputs: input,
      console,
      Date,
      Math,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Set,
      Map,
      Promise,
      // Inject callLLM so generated LLM node code can call the real API
      callLLM: (model: string, prompt: string, systemPrompt?: string) =>
        callLLM(model, prompt, systemPrompt),
      result: undefined,
    }
    const context = vm.createContext(sandbox)
    const script = new vm.Script(`(async () => { ${code} })()`)
    const promise = script.runInContext(context) as Promise<unknown>
    sandbox.result = await promise
    return { success: true, result: sandbox.result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Register custom protocol to serve production build without file:// CORS issues
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
])

app.whenReady().then(() => {
  // Serve dist/renderer via app:// scheme in production
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    const rendererDist = path.join(__dirname, '../renderer')
    // Strip leading slash from pathname, default to index.html
    let filePath = url.pathname.replace(/^\//, '')
    if (!filePath || filePath === 'promptflow/') filePath = 'index.html'
    // Strip the "promptflow/" prefix used as hostname placeholder
    filePath = filePath.replace(/^promptflow\//, '')
    const fullPath = path.join(rendererDist, filePath)
    return net.fetch(pathToFileURL(fullPath).toString())
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
