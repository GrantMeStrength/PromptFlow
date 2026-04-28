import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import vm from 'vm'

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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' })

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

ipcMain.handle('run-code', async (_event, code: string, input: unknown) => {
  try {
    const sandbox = {
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
      result: undefined as unknown,
    }
    const script = new vm.Script(`(async () => { ${code} })().then(r => { result = r })`)
    const context = vm.createContext(sandbox)
    await script.runInContext(context)
    // Give async script time to settle
    await new Promise((r) => setTimeout(r, 100))
    return { success: true, result: sandbox.result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
