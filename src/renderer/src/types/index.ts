// ─── Port / IO Types ──────────────────────────────────────────────────────────

export type PortType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

export interface PortDef {
  name: string
  type: PortType
  description?: string
}

// ─── Node Types ───────────────────────────────────────────────────────────────

export type NodeKind = 'input' | 'function' | 'llm' | 'decision' | 'output'

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
  /** Mock LLM response for prototype (real API call eventually) */
  llmModel?: string
  llmPromptTemplate?: string
  /** For decision nodes: names of the output branches */
  branches?: string[]
  /** Execution result from last run */
  lastResult?: unknown
  hasError?: boolean
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

// ─── LLM Settings ─────────────────────────────────────────────────────────────

export interface LLMSettings {
  apiKey: string
  baseURL: string
  defaultModel: string
}

// ─── IPC API (exposed via preload) ───────────────────────────────────────────

export interface ElectronAPI {
  saveProject: (project: FlowProject) => Promise<{ success: boolean; path?: string; error?: string }>
  loadProject: () => Promise<{ success: boolean; project?: FlowProject; error?: string }>
  runCode: (code: string, input: unknown) => Promise<{ success: boolean; result?: unknown; error?: string }>
  getSettings: () => Promise<LLMSettings>
  saveSettings: (settings: LLMSettings) => Promise<{ success: boolean }>
  onMenuAction: (callback: (action: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
