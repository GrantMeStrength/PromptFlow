import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import vm from 'vm'
import { spawn, ChildProcess } from 'child_process'

// ─── MCP Stdio Client ─────────────────────────────────────────────────────────

interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: object
}

interface McpConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

class McpStdioClient {
  private proc: ChildProcess
  private buffer = ''
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private nextId = 1
  private closed = false

  constructor(config: McpConfig) {
    this.proc = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout?.on('data', (chunk: Buffer) => this.handleChunk(chunk.toString()))
    this.proc.stderr?.on('data', (chunk: Buffer) => console.error('[mcp-err]', chunk.toString().trim()))
    this.proc.on('exit', () => {
      this.closed = true
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer)
        reject(new Error('MCP process exited'))
      }
      this.pending.clear()
    })
  }

  private handleChunk(data: string) {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed) as { id?: number; result?: unknown; error?: { message?: string } }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject, timer } = this.pending.get(msg.id)!
          clearTimeout(timer)
          this.pending.delete(msg.id)
          if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
          else resolve(msg.result ?? null)
        }
      } catch { /* ignore non-JSON lines */ }
    }
  }

  private request(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('MCP client is closed'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })
      this.proc.stdin?.write(msg + '\n')
    })
  }

  private notify(method: string, params?: unknown) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {} })
    this.proc.stdin?.write(msg + '\n')
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'promptflow', version: '0.1.0' },
    }, 30_000)
    this.notify('notifications/initialized')
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.request('tools/list') as { tools?: McpToolInfo[] }
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request('tools/call', { name, arguments: args }, 30_000) as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }
    const text = (result.content ?? []).map(c => c.text ?? '').join('\n')
    if (result.isError) throw new Error(`Tool error: ${text}`)
    return text
  }

  close(): void {
    if (!this.closed) {
      this.closed = true
      try { this.proc.stdin?.end() } catch { /* ignore */ }
      setTimeout(() => { try { this.proc.kill('SIGTERM') } catch { /* ignore */ } }, 500)
    }
  }
}

// ─── callLLMWithTools ─────────────────────────────────────────────────────────

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

async function callLLMWithTools(
  model: string,
  prompt: string,
  systemPrompt: string | undefined,
  mcpConfigs: McpConfig[],
): Promise<string> {
  const settings = loadSettings()
  if (!settings.apiKey) throw new Error('No API key configured — open Settings to add one.')
  const baseURL = (settings.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const resolvedModel = model || settings.defaultModel || 'gpt-4o-mini'

  // Connect to all MCP servers and gather tools
  const clients: McpStdioClient[] = []
  const openaiTools: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> = []
  const toolRouter = new Map<string, McpStdioClient>()

  for (const cfg of mcpConfigs) {
    try {
      const client = new McpStdioClient(cfg)
      await client.initialize()
      const tools = await client.listTools()
      clients.push(client)
      for (const t of tools) {
        openaiTools.push({
          type: 'function',
          function: { name: t.name, description: t.description ?? '', parameters: (t.inputSchema ?? { type: 'object', properties: {} }) as object },
        })
        toolRouter.set(t.name, client)
      }
    } catch (err) {
      console.error(`[mcp] connect failed (${cfg.command}):`, err)
    }
  }

  const messages: OpenAIMessage[] = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]

  let finalResponse = ''
  try {
    for (let i = 0; i < 10; i++) {
      const body: Record<string, unknown> = { model: resolvedModel, messages, max_tokens: 4000 }
      if (openaiTools.length > 0) body.tools = openaiTools

      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`LLM API error ${resp.status}\n${txt}`)
      }
      const data = await resp.json() as { choices: Array<{ message: OpenAIMessage; finish_reason: string }> }
      const assistantMsg = data.choices[0]?.message
      if (!assistantMsg) break

      messages.push(assistantMsg)

      if (assistantMsg.role !== 'assistant' || !('tool_calls' in assistantMsg) || !assistantMsg.tool_calls?.length) {
        finalResponse = (assistantMsg as { content?: string | null }).content ?? ''
        break
      }

      // Execute each tool call
      for (const tc of assistantMsg.tool_calls!) {
        const client = toolRouter.get(tc.function.name)
        let toolContent: string
        try {
          if (!client) throw new Error(`Unknown tool: ${tc.function.name}`)
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          toolContent = await client.callTool(tc.function.name, args)
        } catch (err) {
          toolContent = `Error: ${(err as Error).message}`
        }
        messages.push({ role: 'tool', content: toolContent, tool_call_id: tc.id })
      }
    }
  } finally {
    for (const c of clients) c.close()
  }

  return finalResponse
}



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
  if (!settings.apiKey) throw new Error('No API key configured — open Settings (⚙) to add one.')
  const baseURL = (settings.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  // Use settings default model as fallback
  const resolvedModel = model || settings.defaultModel || 'gpt-4o-mini'
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]
  console.log(`[llm] calling ${baseURL} model=${resolvedModel} prompt-length=${prompt.length}`)
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: resolvedModel, messages, max_tokens: 2000 }),
  })
  if (!response.ok) {
    const text = await response.text()
    let hint = ''
    if (response.status === 401) hint = ' (Check your API key in Settings — it may need the "Models" permission.)'
    if (response.status === 429) hint = ' (Rate limit hit — try again in a moment.)'
    throw new Error(`LLM API error ${response.status}${hint}\n${text}`)
  }
  const data = await response.json() as { choices: { message: { content: string } }[] }
  const content = data.choices[0]?.message?.content ?? ''
  console.log(`[llm] response length=${content.length}`)
  return content
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

ipcMain.handle('get-settings', () => {
  try {
    return loadSettings()
  } catch (err) {
    console.error('[settings] load error:', err)
    return { apiKey: '', baseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' }
  }
})

ipcMain.handle('save-settings', (_event, settings: LLMSettings) => {
  try {
    const p = settingsPath()
    console.log('[settings] saving to', p)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf8')
    console.log('[settings] saved ok')
    return { success: true }
  } catch (err) {
    console.error('[settings] save error:', err)
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('call-llm', async (_event, prompt: string, systemPrompt?: string) => {
  try {
    const result = await callLLM('', prompt, systemPrompt)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('call-llm-chat', async (_event, messages: { role: string; content: string }[], systemPrompt?: string) => {
  try {
    const settings = loadSettings()
    const baseURL = (settings.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const builtMessages: { role: string; content: string }[] = []
    if (systemPrompt) builtMessages.push({ role: 'system', content: systemPrompt })
    builtMessages.push(...messages)
    const resp = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: settings.defaultModel || 'gpt-4o', messages: builtMessages }),
    })
    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const data = await resp.json() as { choices: { message: { content: string } }[] }
    const result = data.choices[0]?.message?.content ?? ''
    return { success: true, result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('pick-skills-file', async () => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Select Skills File',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { success: false }
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    const filename = path.basename(filePaths[0])
    return { success: true, filename, content }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('test-mcp-connection', async (_event, config: McpConfig) => {
  const client = new McpStdioClient(config)
  try {
    await client.initialize()
    const tools = await client.listTools()
    return { success: true, tools }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    client.close()
  }
})

ipcMain.handle('run-code', async (_event, code: string, input: unknown, uiInputs?: Record<string, unknown>) => {
  try {
    const sandbox: Record<string, unknown> = {
      inputs: input,
      __uiInputs__: uiInputs ?? {},
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
      RegExp,
      Error,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      // Inject callLLM so generated LLM node code can call the real API
      callLLM: (model: string, prompt: string, systemPrompt?: string) =>
        callLLM(model, prompt, systemPrompt),
      // Inject callLLMWithTools for LLM nodes connected to MCP servers
      callLLMWithTools: (model: string, prompt: string, systemPrompt: string | undefined, mcpConfigs: McpConfig[]) =>
        callLLMWithTools(model, prompt, systemPrompt, mcpConfigs),
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

// ─── Project Library IPC ─────────────────────────────────────────────────────

function getProjectsDir(): string {
  const dir = path.join(app.getPath('documents'), 'PromptFlow')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function isPathSafe(filePath: string): boolean {
  const base = path.resolve(getProjectsDir())
  const target = path.resolve(filePath)
  const rel = path.relative(base, target)
  return !rel.startsWith('..') && !path.isAbsolute(rel) && target.endsWith('.promptflow')
}

ipcMain.handle('get-projects-dir', () => getProjectsDir())

ipcMain.handle('list-projects', async () => {
  const dir = getProjectsDir()
  let files: string[]
  try {
    files = await fs.promises.readdir(dir)
  } catch {
    return []
  }
  const results = await Promise.all(
    files
      .filter(f => f.endsWith('.promptflow'))
      .map(async (f) => {
        const filePath = path.join(dir, f)
        try {
          const raw = await fs.promises.readFile(filePath, 'utf-8')
          const p = JSON.parse(raw)
          return {
            path: filePath,
            id: p.id ?? f,
            name: p.name ?? f,
            description: p.description ?? '',
            created: p.created ?? '',
            updated: p.updated ?? '',
            nodeCount: Array.isArray(p.nodes) ? p.nodes.length : 0,
          }
        } catch {
          return null
        }
      })
  )
  return results
    .filter(Boolean)
    .sort((a, b) => (b!.updated > a!.updated ? 1 : -1))
})

ipcMain.handle('save-to-library', async (_event, project: { id: string; name: string; [key: string]: unknown }) => {
  try {
    const dir = getProjectsDir()
    const fileName = `${project.id}.promptflow`
    const filePath = path.join(dir, fileName)
    const updated = { ...project, updated: new Date().toISOString() }
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('delete-project', async (_event, filePath: string) => {
  try {
    if (!isPathSafe(filePath)) return { success: false, error: 'Invalid path' }
    await fs.promises.unlink(filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('open-project-by-path', async (_event, filePath: string) => {
  try {
    if (!isPathSafe(filePath)) return { success: false, error: 'Invalid path' }
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    const project = JSON.parse(raw)
    return { success: true, project }
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
  // Use fs.readFile directly (avoids network service) instead of net.fetch
  const MIME: Record<string, string> = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.webp': 'image/webp',
  }
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    const rendererDist = path.join(__dirname, '../renderer')
    let filePath = url.pathname.replace(/^\//, '')
    if (!filePath || filePath === 'promptflow/') filePath = 'index.html'
    filePath = filePath.replace(/^promptflow\//, '')
    const fullPath = path.join(rendererDist, filePath)
    try {
      const data = fs.readFileSync(fullPath)
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME[ext] ?? 'application/octet-stream'
      return new Response(data, { headers: { 'Content-Type': contentType } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
