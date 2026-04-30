// ─── Port / IO Types ──────────────────────────────────────────────────────────

export type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

export interface PortDef {
  name: string
  type: PortType
  description?: string
}

// ─── Node Types ───────────────────────────────────────────────────────────────

export type NodeKind = 'input' | 'function' | 'llm' | 'decision' | 'output' | 'pipe' | 'ui' | 'mcp' | 'note' | 'state'

export interface NodeData {
  label: string
  kind: NodeKind
  description: string
  /** JavaScript code that implements this node. Receives an `inputs` object, must return a value. */
  code: string
  inputs: PortDef[]
  outputs: PortDef[]
  /** The natural-language prompt used to generate/last-modify this node */
  prompt?: string
  /** LLM provider: 'default' uses API settings, 'ollama' uses local Ollama */
  llmProvider?: 'default' | 'ollama'
  llmModel?: string
  llmPromptTemplate?: string
  llmSkillsFile?: string    // display name of loaded .md file
  llmSkillsContent?: string // full markdown content used as system prompt
  /** For decision nodes: names of the output branches */
  branches?: string[]
  /** Execution result from last run */
  lastResult?: unknown
  hasError?: boolean
  /** For pipe nodes: the IDs of the nodes being connected */
  pipeSourceId?: string
  pipeTargetId?: string
  /** For UI interaction nodes */
  uiKind?: 'text' | 'file' | 'choice'
  uiLabel?: string
  uiOptions?: string[]
  uiPlaceholder?: string
  uiAccept?: string
  uiMultiple?: boolean
  /** For MCP server nodes */
  mcpTransport?: 'stdio'
  mcpCommand?: string
  mcpArgs?: string    // one arg per line
  mcpEnv?: string     // KEY=value per line
  mcpTools?: McpToolInfo[]
  /** For state variable nodes */
  stateKey?: string        // persistent variable name
  stateDefault?: string    // JSON-serialisable default value (stored as string)
  stateMode?: 'read' | 'write'
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: object
}

// ─── ReactFlow Node / Edge wrappers ──────────────────────────────────────────

import type { Node, Edge } from 'reactflow'

export type FlowNode = Node<NodeData>
export type FlowEdge = Edge

// ─── Project Format ───────────────────────────────────────────────────────────

export interface FlowProject {
  id: string
  name: string
  description: string
  version: string
  created: string
  updated: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// ─── Project Library ──────────────────────────────────────────────────────────

export interface ProjectMeta {
  path: string
  id: string
  name: string
  description: string
  created: string
  updated: string
  nodeCount: number
}

// ─── LLM Settings ─────────────────────────────────────────────────────────────

export interface LLMSettings {
  apiKey: string
  baseURL: string
  defaultModel: string
}

// ─── Chat Message ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ─── IPC API (exposed via preload) ───────────────────────────────────────────

export interface ElectronAPI {
  saveProject: (project: FlowProject) => Promise<{ success: boolean; path?: string; error?: string }>
  loadProject: () => Promise<{ success: boolean; project?: FlowProject; error?: string }>
  runCode: (code: string, input: unknown, uiInputs?: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
  callLLM: (prompt: string, systemPrompt?: string) => Promise<{ success: boolean; result?: string; error?: string }>
  callLLMChat: (messages: ChatMessage[], systemPrompt?: string) => Promise<{ success: boolean; result?: string; error?: string }>
  getSettings: () => Promise<LLMSettings>
  saveSettings: (settings: LLMSettings) => Promise<{ success: boolean }>
  onMenuAction: (callback: (action: string) => void) => () => void
  pickSkillsFile: () => Promise<{ success: boolean; filename?: string; content?: string; error?: string }>
  testMcpConnection: (config: { command: string; args: string[]; env: Record<string,string> }) => Promise<{ success: boolean; tools?: import('./index').McpToolInfo[]; error?: string }>
  // Library
  getProjectsDir: () => Promise<string>
  listProjects: () => Promise<ProjectMeta[]>
  saveToLibrary: (project: FlowProject) => Promise<{ success: boolean; path?: string; error?: string }>
  deleteProject: (filePath: string) => Promise<{ success: boolean; error?: string }>
  openProjectByPath: (filePath: string) => Promise<{ success: boolean; project?: FlowProject; error?: string }>
  // Report export
  saveReportHtml: (html: string) => Promise<{ success: boolean; path?: string; error?: string }>
  exportReportPdf: (html: string) => Promise<{ success: boolean; path?: string; error?: string }>
  // State variables
  getStateVar: (key: string) => Promise<{ success: boolean; value?: unknown; error?: string }>
  setStateVar: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
  clearStateVars: () => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
