import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from 'reactflow'
import type { Connection, NodeChange, EdgeChange } from 'reactflow'
import type { FlowNode, FlowEdge, FlowProject, NodeData, NodeKind } from '../types'
import { generateCode } from '../codegen/generator'

interface FlowState {
  project: FlowProject
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  isRunning: boolean
  runOutput: string
  runOutputIsHtml: boolean
  showOutput: boolean
  runTrace: Array<{ id: string; label: string; kind: string; output: unknown }> | null
  /** True when there are unsaved changes */
  isDirty: boolean
  /** Filesystem path of the currently open file (library save path) */
  projectPath: string | null
  /** ID of a newly-created pipe node waiting for LLM auto-generation */
  pendingPipeNodeId: string | null
  /** True when pipeline has UI nodes and is waiting for user input */
  pendingUiRun: boolean
  /** UI nodes info in the current pending run (in topo order) */
  uiNodesInfo: Array<{ nodeId: string; data: NodeData }>

  // Node / Edge mutations
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  selectNode: (id: string | null) => void
  addNode: (kind: NodeKind, position?: { x: number; y: number }, extraData?: Partial<NodeData>) => FlowNode
  updateNodeData: (id: string, data: Partial<NodeData>) => void
  deleteNode: (id: string) => void
  clearPendingPipe: () => void

  // Project I/O
  newProject: () => void
  loadProject: (project: FlowProject, savedPath?: string) => void
  getProject: () => FlowProject
  markSaved: (path: string) => void

  // Wizard
  applyWizardGraph: (nodes: FlowNode[], edges: FlowEdge[]) => void

  // Execution
  runPipeline: () => Promise<void>
  submitUiInputs: (values: Record<string, unknown>) => Promise<void>
  cancelUiRun: () => void
  clearOutput: () => void
  toggleOutput: () => void

  // Code gen
  getGeneratedCode: () => string
  // Internal — do not call directly
  _executePipeline: (uiInputs: Record<string, unknown>) => Promise<void>
}

const defaultNodeData = (kind: NodeKind): NodeData => {
  const bases: Record<NodeKind, Partial<NodeData>> = {
    input: {
      label: 'Input',
      description: 'Accepts initial input and passes it downstream.',
      inputs: [],
      outputs: [{ name: 'value', type: 'any', description: 'The input value' }],
      code: `// Input node – returns the pipeline's initial input as-is\nreturn inputs.value`,
    },
    function: {
      label: 'Function',
      description: 'A pure transform function.',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `// Transform the input\nreturn { result: inputs.value }`,
    },
    llm: {
      label: 'LLM Call',
      description: 'Calls a language model with a prompt template.',
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }],
      llmModel: 'gpt-4o',
      llmPromptTemplate: 'Summarize the following text:\\n\\n{{text}}',
      code: `// Calls the configured LLM (callLLM / callLLMWithTools injected by runtime)\nconst text = String(inputs.text ?? inputs.content ?? inputs.value ?? '')\nconst prompt = llmPromptTemplate ? llmPromptTemplate.replace('{{text}}', text) : text\nconst _sys = typeof llmSystemPrompt !== 'undefined' ? llmSystemPrompt : undefined\nconst _mcp = typeof mcpConfigs !== 'undefined' ? mcpConfigs : []\nconst response = _mcp.length > 0\n  ? await callLLMWithTools(llmModel || 'gpt-4o-mini', prompt, _sys, _mcp)\n  : await callLLM(llmModel || 'gpt-4o-mini', prompt, _sys)\nreturn { response }`,
    },
    decision: {
      label: 'Decision',
      description: 'Branches execution based on a condition.',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [
        { name: 'true', type: 'any' },
        { name: 'false', type: 'any' },
      ],
      branches: ['true', 'false'],
      code: `// Return true branch value or false branch value\nconst condition = inputs.value != null && inputs.value !== '' && inputs.value !== false\nreturn condition ? { true: inputs.value, false: null } : { true: null, false: inputs.value }`,
    },
    output: {
      label: 'Output',
      description: 'Collects and displays the final result.',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [],
      code: `// Output node – returns the final value\nreturn inputs.value`,
    },
    pipe: {
      label: 'Mapping',
      description: 'Maps data from one node to another.',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'value', type: 'any' }],
      code: `// Pass-through by default; edit to transform the data\nreturn inputs.value`,
    },
    ui: {
      label: 'Text Input',
      description: 'Asks the user to enter text before the pipeline runs.',
      inputs: [],
      outputs: [{ name: 'value', type: 'string' }],
      uiKind: 'text',
      uiLabel: 'Enter your text:',
      uiPlaceholder: 'Type here…',
      code: `// Value is collected from the user before the pipeline runs`,
    },
    mcp: {
      label: 'MCP Server',
      description: 'Connects a tool provider (MCP server) to an LLM node.',
      inputs: [],
      outputs: [{ name: 'tools', type: 'any', description: 'Tool definitions' }],
      mcpTransport: 'stdio',
      mcpCommand: '',
      mcpArgs: '',
      mcpEnv: '',
      code: `// MCP Server node – provides tools to connected LLM nodes`,
    },
    state: {
      label: 'State Variable',
      description: 'Reads or writes a named value that persists between pipeline runs.',
      inputs: [{ name: 'value', type: 'any', description: 'Value to store (write mode only)' }],
      outputs: [{ name: 'value', type: 'any', description: 'Stored value' }],
      stateKey: 'myVariable',
      stateDefault: 'null',
      stateMode: 'read' as const,
      code: '',
    },
    note: {
      label: 'Note',
      description: '',
      inputs: [],
      outputs: [],
      code: '',
    },
    workflow: {
      label: 'Sub-workflow',
      description: 'A reusable workflow embedded as a single node.',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: '',
    },
    trigger: {
      label: 'Trigger',
      description: 'Runs the workflow automatically on a cron schedule.',
      inputs: [],
      outputs: [{ name: 'triggered_at', type: 'string', description: 'ISO timestamp of trigger' }],
      code: '',
      cronExpr: '0 9 * * *',
      triggerEnabled: false,
    },
    systemprompt: {
      label: 'System Prompt',
      description: 'Provides a system prompt to a connected LLM or Judge node.',
      inputs: [],
      outputs: [{ name: 'system_prompt', type: 'string', description: 'The system prompt text' }],
      code: '',
      systemPromptContent: 'You are a helpful assistant.',
    },
    judge: {
      label: 'LLM Judge',
      description: 'Evaluates content using an LLM. Outputs score, verdict, and reasoning.',
      inputs: [
        { name: 'content', type: 'any', description: 'Content to evaluate' },
        { name: 'criteria', type: 'string', description: 'Evaluation criteria (optional)' },
      ],
      outputs: [
        { name: 'score', type: 'number', description: 'Score 0–10' },
        { name: 'verdict', type: 'string', description: 'pass / fail / review' },
        { name: 'reasoning', type: 'string', description: 'Explanation' },
      ],
      code: '',
      llmProvider: 'default',
      llmModel: '',
    },
    chunker: {
      label: 'Document Chunker',
      description: 'Splits a large text document into smaller overlapping chunks for downstream processing.',
      inputs: [{ name: 'text', type: 'string', description: 'The text to split into chunks' }],
      outputs: [
        { name: 'chunks', type: 'array', description: 'Array of text chunks' },
        { name: 'count', type: 'number', description: 'Number of chunks produced' },
        { name: 'text', type: 'string', description: 'Original text (pass-through)' },
      ],
      code: '',
      chunkerSize: 500,
      chunkerOverlap: 50,
      chunkerStrategy: 'paragraph' as const,
    },
  }
  return {
    kind,
    prompt: undefined,
    lastResult: undefined,
    hasError: false,
    ...bases[kind],
  } as NodeData
}

let nodeCounter = 100

const blankProject: FlowProject = {
  id: crypto.randomUUID(),
  name: 'Untitled Project',
  description: '',
  version: '1',
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  nodes: [],
  edges: [],
}

export const useFlowStore = create<FlowState>((set, get) => ({
  project: blankProject,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isRunning: false,
  runOutput: '',
  runOutputIsHtml: false,
  showOutput: false,
  runTrace: null,
  isDirty: false,
  projectPath: null,
  pendingPipeNodeId: null,
  pendingUiRun: false,
  uiNodesInfo: [],

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as FlowNode[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) as FlowEdge[] })),

  onConnect: (connection) => {
    const { nodes } = get()
    const sourceNode = nodes.find((n) => n.id === connection.source)
    const targetNode = nodes.find((n) => n.id === connection.target)

    if (!sourceNode || !targetNode) return

    // Place pipe node at the midpoint between source and target
    const midX = (sourceNode.position.x + targetNode.position.x) / 2 + 80
    const midY = (sourceNode.position.y + targetNode.position.y) / 2 + 20

    const pipeId = `pipe-${++nodeCounter}`
    const pipeData: NodeData = {
      ...defaultNodeData('pipe'),
      label: 'Mapping',
      pipeSourceId: sourceNode.id,
      pipeTargetId: targetNode.id,
    }
    const pipeNode: FlowNode = { id: pipeId, type: 'pipe', position: { x: midX, y: midY }, data: pipeData }

    const edgeStyle = { type: 'gradient', animated: true, style: { strokeWidth: 1.5, strokeDasharray: '4 3' } }
    const edgeIn: FlowEdge = {
      id: `e-${connection.source}-${pipeId}`,
      source: connection.source,
      sourceHandle: connection.sourceHandle ?? undefined,
      target: pipeId,
      targetHandle: 'value',
      ...edgeStyle,
    }
    const edgeOut: FlowEdge = {
      id: `e-${pipeId}-${connection.target}`,
      source: pipeId,
      sourceHandle: 'value',
      target: connection.target,
      targetHandle: connection.targetHandle ?? undefined,
      ...edgeStyle,
    }

    set((s) => ({
      nodes: [...s.nodes, pipeNode],
      edges: [...s.edges, edgeIn, edgeOut],
      selectedNodeId: pipeId,
      pendingPipeNodeId: pipeId,
      isDirty: true,
    }))
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addNode: (kind, position = { x: 400, y: 200 }, extraData?) => {
    const id = `node-${++nodeCounter}`
    const data: NodeData = { ...defaultNodeData(kind), ...extraData }
    const node: FlowNode = { id, type: kind, position, data }
    set((s) => ({ nodes: [...s.nodes, node], isDirty: true }))
    return node
  },

  updateNodeData: (id, partial) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...partial } } : n
      ),
      isDirty: true,
    })),

  deleteNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      isDirty: true,
    })),

  clearPendingPipe: () => set({ pendingPipeNodeId: null }),

  newProject: () => {
    const project: FlowProject = {
      id: crypto.randomUUID(),
      name: 'Untitled Project',
      description: '',
      version: '1',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      nodes: [],
      edges: [],
    }
    set({ project, nodes: [], edges: [], selectedNodeId: null, runOutput: '', isDirty: false, projectPath: null })
  },

  loadProject: (project, savedPath?) =>
    set({ project, nodes: project.nodes, edges: project.edges, selectedNodeId: null, runOutput: '', isDirty: false, projectPath: savedPath ?? null }),

  getProject: () => {
    const { project, nodes, edges } = get()
    return { ...project, nodes, edges, updated: new Date().toISOString() }
  },

  markSaved: (filePath) => set({ isDirty: false, projectPath: filePath }),

  applyWizardGraph: (newNodes, newEdges) => {
    // Merge LLM-generated node data with defaults so all node components render correctly
    const enrichedNodes: FlowNode[] = newNodes.map((n) => ({
      ...n,
      data: { ...defaultNodeData(n.data.kind as NodeKind), ...n.data },
    }))
    set((s) => {
      const updated = new Date().toISOString()
      return {
        nodes: enrichedNodes,
        edges: newEdges,
        selectedNodeId: null,
        isDirty: true,
        project: { ...s.project, updated },
      }
    })
  },

  runPipeline: async () => {
    const { nodes, edges } = get()

    // Check for UI interaction nodes — collect inputs first
    const uiNodes = nodes.filter((n) => n.data.kind === 'ui')
    if (uiNodes.length > 0) {
      // Sort by x position (left-to-right = pipeline order)
      const sorted = [...uiNodes].sort((a, b) => a.position.x - b.position.x)
      set({
        pendingUiRun: true,
        uiNodesInfo: sorted.map((n) => ({ nodeId: n.id, data: n.data })),
        showOutput: true,
        runOutput: '',
      })
      return
    }

    await get()._executePipeline({})
  },

  submitUiInputs: async (values) => {
    set({ pendingUiRun: false, uiNodesInfo: [] })
    await get()._executePipeline(values)
  },

  cancelUiRun: () => set({ pendingUiRun: false, uiNodesInfo: [] }),

  _executePipeline: async (uiInputs: Record<string, unknown>) => {
    const { nodes, edges, updateNodeData } = get()

    const connectedIds = new Set(edges.flatMap((e) => [e.source, e.target]))
    const isolated = nodes.filter((n) => n.data.kind !== 'note' && !connectedIds.has(n.id))
    const warningPrefix = isolated.length > 0
      ? `⚠ ${isolated.length} unconnected node${isolated.length !== 1 ? 's' : ''} will be skipped: ${isolated.map((n) => n.data.label).join(', ')}\n\n`
      : ''

    set({ isRunning: true, runOutput: warningPrefix + '▶ Running pipeline...\n', showOutput: true })

    try {
      const code = generateCode(nodes, edges)
      const api = window.electronAPI
      let result: unknown

      if (api) {
        const res = await api.runCode(code, {}, uiInputs)
        if (!res.success) throw new Error(res.error)
        result = res.result
      } else {
        // Browser fallback: run in eval (dev only) with in-memory state store
        const browserState: Record<string, unknown> = {}
        const getState = async (key: string, def: unknown = null) => browserState[key] ?? def
        const setState = async (key: string, val: unknown) => { browserState[key] = val }
        // eslint-disable-next-line no-new-func
        const fn = new Function('inputs', '__uiInputs__', 'getState', 'setState', code)
        result = fn({}, uiInputs, getState, setState)
        if (result instanceof Promise) result = await result
      }

      // Extract execution trace if the generator embedded it
      type TraceEntry = { id: string; label: string; kind: string; output: unknown }
      let trace: TraceEntry[] | null = null
      if (result !== null && typeof result === 'object' && '__trace' in (result as object)) {
        const r = result as { __result: unknown; __trace: TraceEntry[] }
        trace = r.__trace
        result = r.__result
      }

      // Check for rich HTML output
      const isHtml = result !== null && typeof result === 'object' && '__html' in (result as object)
      nodes.forEach((n) => updateNodeData(n.id, { hasError: false }))
      if (isHtml) {
        set({
          isRunning: false,
          runOutputIsHtml: true,
          runOutput: (result as { __html: string }).__html,
          runTrace: trace,
        })
      } else {
        // Unwrap single-value objects so plain text results don't appear as JSON.
        // e.g. { result: "hello" } → "hello", { response: "hello" } → "hello"
        let display: string
        if (typeof result === 'string') {
          display = result
        } else if (result !== null && typeof result === 'object') {
          const vals = Object.values(result as Record<string, unknown>).filter(v => v !== null && v !== undefined)
          if (vals.length === 1 && typeof vals[0] === 'string') {
            display = vals[0]
          } else {
            display = JSON.stringify(result, null, 2)
          }
        } else {
          display = String(result ?? '')
        }
        set((s) => ({
          isRunning: false,
          runOutputIsHtml: false,
          runOutput: s.runOutput + `✅ Done\n\n${display}`,
          runTrace: trace,
        }))
      }
    } catch (err) {
      set((s) => ({
        isRunning: false,
        runOutput: s.runOutput + `\n❌ Error: ${(err as Error).message}`,
      }))
    }
  },

  clearOutput: () => set({ runOutput: '', runOutputIsHtml: false, runTrace: null }),
  toggleOutput: () => set((s) => ({ showOutput: !s.showOutput })),

  getGeneratedCode: () => {
    const { nodes, edges } = get()
    return generateCode(nodes, edges)
  },
}))
