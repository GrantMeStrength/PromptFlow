import { create } from 'zustand'
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow'
import type { Connection, NodeChange, EdgeChange } from 'reactflow'
import type { FlowNode, FlowEdge, FlowProject, NodeData, NodeKind } from '../types'
import { demoProject } from '../demo/documentAnalysis'
import { generateCode } from '../codegen/generator'

interface FlowState {
  project: FlowProject
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  isRunning: boolean
  runOutput: string
  showOutput: boolean

  // Node / Edge mutations
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  selectNode: (id: string | null) => void
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => FlowNode
  updateNodeData: (id: string, data: Partial<NodeData>) => void
  deleteNode: (id: string) => void

  // Project I/O
  newProject: () => void
  loadProject: (project: FlowProject) => void
  getProject: () => FlowProject

  // Execution
  runPipeline: () => Promise<void>
  clearOutput: () => void
  toggleOutput: () => void

  // Code gen
  getGeneratedCode: () => string
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
      code: `// Calls the configured LLM (callLLM is injected by the runtime)\nconst text = String(inputs.text ?? inputs.content ?? inputs.value ?? '')\nconst prompt = llmPromptTemplate ? llmPromptTemplate.replace('{{text}}', text) : text\nconst response = await callLLM(llmModel || 'gpt-4o-mini', prompt)\nreturn { response }`,
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

export const useFlowStore = create<FlowState>((set, get) => ({
  project: demoProject,
  nodes: demoProject.nodes,
  edges: demoProject.edges,
  selectedNodeId: null,
  isRunning: false,
  runOutput: '',
  showOutput: false,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as FlowNode[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) as FlowEdge[] })),

  onConnect: (connection) =>
    set((s) => ({ edges: addEdge({ ...connection, animated: true }, s.edges) as FlowEdge[] })),

  selectNode: (id) => set({ selectedNodeId: id }),

  addNode: (kind, position = { x: 400, y: 200 }) => {
    const id = `node-${++nodeCounter}`
    const data = defaultNodeData(kind)
    const node: FlowNode = { id, type: kind, position, data }
    set((s) => ({ nodes: [...s.nodes, node] }))
    return node
  },

  updateNodeData: (id, partial) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...partial } } : n
      ),
    })),

  deleteNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    })),

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
    set({ project, nodes: [], edges: [], selectedNodeId: null, runOutput: '' })
  },

  loadProject: (project) =>
    set({ project, nodes: project.nodes, edges: project.edges, selectedNodeId: null, runOutput: '' }),

  getProject: () => {
    const { project, nodes, edges } = get()
    return { ...project, nodes, edges, updated: new Date().toISOString() }
  },

  runPipeline: async () => {
    const { nodes, edges, updateNodeData } = get()
    set({ isRunning: true, runOutput: '▶ Running pipeline...\n', showOutput: true })

    try {
      const code = generateCode(nodes, edges)
      const api = window.electronAPI
      let result: unknown

      if (api) {
        const res = await api.runCode(code, { text: 'Sample document text for analysis.' })
        if (!res.success) throw new Error(res.error)
        result = res.result
      } else {
        // Browser fallback: run in eval (dev only)
        // eslint-disable-next-line no-new-func
        const fn = new Function('inputs', code)
        result = fn({ text: 'Sample document text for analysis.' })
        if (result instanceof Promise) result = await result
      }

      // Mark all nodes as success
      nodes.forEach((n) => updateNodeData(n.id, { hasError: false }))
      set((s) => ({
        isRunning: false,
        runOutput: s.runOutput + `✅ Pipeline completed\n\n${JSON.stringify(result, null, 2)}`,
      }))
    } catch (err) {
      set((s) => ({
        isRunning: false,
        runOutput: s.runOutput + `\n❌ Error: ${(err as Error).message}`,
      }))
    }
  },

  clearOutput: () => set({ runOutput: '' }),
  toggleOutput: () => set((s) => ({ showOutput: !s.showOutput })),

  getGeneratedCode: () => {
    const { nodes, edges } = get()
    return generateCode(nodes, edges)
  },
}))
