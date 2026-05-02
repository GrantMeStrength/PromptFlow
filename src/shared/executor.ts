/**
 * PromptFlow – Direct Graph Interpreter
 *
 * Replaces generator.ts + vm.Script orchestration with typed TypeScript execution.
 * Each node kind has a dedicated executor function; only user-authored code
 * (function / decision / output / llm-with-code nodes) still runs in vm.Script.
 *
 * Public API:
 *   runPipeline(nodes, edges, ctx) → PipelineResult
 */

import vm from 'vm'
import type { FlowNode, FlowEdge, NodeData } from '../renderer/src/types'

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface McpConfig {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface ExecutionContext {
  uiInputs: Record<string, unknown>
  callLLM: (model: string, prompt: string, system?: string, format?: unknown) => Promise<string>
  callLLMWithTools: (model: string, prompt: string, system?: string, configs?: McpConfig[]) => Promise<string>
  fetch?: typeof globalThis.fetch
  getState?: (key: string, defaultVal?: unknown) => unknown | Promise<unknown>
  setState?: (key: string, value: unknown) => void | Promise<void>
  notifyNode?: (id: string | null) => void | Promise<void>
}

export interface TraceEntry {
  id: string
  label: string
  kind: string
  output?: unknown
  error?: string
}

export interface PipelineResult {
  __result: unknown
  __trace: TraceEntry[]
}

type NodeResult = Record<string, unknown>
type Results = Map<string, NodeResult>

// ─── Topological Sort ─────────────────────────────────────────────────────────

function topoSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const execNodes = nodes.filter(n => n.data.kind !== 'mcp')
  const execIds = new Set(execNodes.map(n => n.id))
  const execEdges = edges.filter(e => execIds.has(e.source) && execIds.has(e.target))

  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of execNodes) { inDegree.set(n.id, 0); adj.set(n.id, []) }
  for (const e of execEdges) {
    adj.get(e.source)?.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id)

  const sorted: string[] = []
  while (queue.length) {
    const cur = queue.shift()!
    sorted.push(cur)
    for (const next of adj.get(cur) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }

  const nodeById = new Map(execNodes.map(n => [n.id, n]))
  return sorted.map(id => nodeById.get(id)!).filter(Boolean)
}

// ─── Edge Info ────────────────────────────────────────────────────────────────

interface InputSource {
  srcId: string
  handle: string
  explicit: boolean
  fromDecision: boolean
  targetHandle: string
}

interface EdgeInfo {
  inputSources: Map<string, InputSource[]>
  mcpSources: Map<string, NodeData[]>
  systemPromptSources: Map<string, string>
}

function buildEdgeInfo(nodes: FlowNode[], edges: FlowEdge[], execIds: Set<string>): EdgeInfo {
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const inputSources = new Map<string, InputSource[]>()
  const mcpSources = new Map<string, NodeData[]>()
  const systemPromptSources = new Map<string, string>()

  // Count implicit edges per target to decide single vs multi-input keying
  const implicitCounts = new Map<string, number>()
  for (const e of edges) {
    const srcKind = nodeById.get(e.source)?.data.kind
    if (execIds.has(e.source) && execIds.has(e.target) && e.targetHandle == null
      && srcKind !== 'mcp' && srcKind !== 'systemprompt') {
      implicitCounts.set(e.target, (implicitCounts.get(e.target) ?? 0) + 1)
    }
  }

  for (const e of edges) {
    const srcNode = nodeById.get(e.source)
    if (!srcNode) continue
    const srcKind = srcNode.data.kind
    const tgtKind = nodeById.get(e.target)?.data.kind

    if (srcKind === 'mcp') {
      if (!mcpSources.has(e.target)) mcpSources.set(e.target, [])
      mcpSources.get(e.target)!.push(srcNode.data)
    } else if (srcKind === 'systemprompt' && (tgtKind === 'llm' || tgtKind === 'judge')) {
      systemPromptSources.set(e.target, e.source)
    } else if (execIds.has(e.source) && execIds.has(e.target)) {
      if (!inputSources.has(e.target)) inputSources.set(e.target, [])
      const isMultiImplicit = e.targetHandle == null && (implicitCounts.get(e.target) ?? 0) > 1
      inputSources.get(e.target)!.push({
        srcId: e.source,
        handle: e.sourceHandle ?? 'result',
        explicit: e.sourceHandle != null,
        fromDecision: srcKind === 'decision' && e.sourceHandle != null,
        targetHandle: e.targetHandle ?? (isMultiImplicit ? e.source : 'value'),
      })
    }
  }

  return { inputSources, mcpSources, systemPromptSources }
}

// ─── Value Utilities ──────────────────────────────────────────────────────────

/**
 * Resolve a {{var}} key to a string for LLM template substitution.
 * Mirrors the _llmResolve() helper inlined by generator.ts.
 */
function resolveLLMVar(k: string, inputs: Record<string, unknown>): string {
  const d = inputs[k]
  if (d != null && typeof d !== 'object') return String(d)
  if (Array.isArray(d)) return JSON.stringify(d)
  if (d != null && typeof d === 'object') {
    const obj = d as Record<string, unknown>
    const p = obj.response ?? obj.result ?? obj.content ?? obj.value ?? obj.text
    if (p != null && typeof p !== 'object') return String(p)
    if (Array.isArray(p)) return JSON.stringify(p)
  }
  // Search nested objects for the key
  for (const iv of Object.values(inputs)) {
    if (iv && typeof iv === 'object' && !Array.isArray(iv)) {
      const nested = (iv as Record<string, unknown>)[k]
      if (nested != null && typeof nested !== 'object') return String(nested)
      if (Array.isArray(nested)) return JSON.stringify(nested)
    }
  }
  // Fall back to primary field of any nested object
  for (const iv of Object.values(inputs)) {
    if (iv && typeof iv === 'object' && !Array.isArray(iv)) {
      const val = (iv as Record<string, unknown>).value
      if (val != null && typeof val !== 'object') return String(val)
    }
  }
  // Last resort: any string inside a nested object
  for (const iv of Object.values(inputs)) {
    if (iv && typeof iv === 'object' && !Array.isArray(iv)) {
      const s = Object.values(iv as Record<string, unknown>).find(v => typeof v === 'string')
      if (s != null) return String(s)
    }
  }
  const strs = Object.values(inputs).filter(v => typeof v === 'string')
  return strs.length > 0 ? String(strs[0]) : ''
}

/** Substitute all {{var}} placeholders in a template string. */
function resolveTemplate(template: string, inputs: Record<string, unknown>): string {
  // Collect all vars; always include 'text' as a catch-all (matches generator behaviour)
  const vars = new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))
  vars.add('text')
  let result = template
  for (const k of vars) {
    result = result.split(`{{${k}}}`).join(resolveLLMVar(k, inputs))
  }
  return result
}

// ─── Input Construction ───────────────────────────────────────────────────────

/** Build the raw inputs map for a node from upstream results. */
function buildRawInputs(sources: InputSource[], results: Results): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const src of sources) {
    const upstream = results.get(src.srcId)
    // Decision edges must use the exact handle value (null = branch not taken → skip).
    // All other edges mirror the generator's `results[id]?.["handle"] ?? results[id]` pattern:
    // if the named key is absent from upstream, fall back to the whole upstream object.
    raw[src.targetHandle] = src.fromDecision
      ? upstream?.[src.handle]
      : (upstream?.[src.handle] ?? upstream)
  }
  return raw
}

/**
 * Build the user-code-friendly inputs object for function / decision / output nodes.
 * Replicates the __rawInputs__ / __v alias construction from generator.ts exactly.
 */
function buildUserCodeInputs(rawInputs: Record<string, unknown>): Record<string, unknown> {
  const rawVal = rawInputs.value

  // Resolve primary string (__v): mirrors generator's __v computation
  let __v = ''
  if (rawVal != null && typeof rawVal !== 'object') {
    __v = String(rawVal)
  } else if (rawVal != null && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
    const obj = rawVal as Record<string, unknown>
    const c = obj.response ?? obj.result ?? obj.content ?? obj.value ?? obj.text
    if (c != null && typeof c !== 'object') __v = String(c)
    else if (Array.isArray(c)) __v = JSON.stringify(c)
  }

  // If still empty, search all rawInputs values
  if (!__v) {
    for (const rv of Object.values(rawInputs)) {
      if (typeof rv === 'string') { __v = rv; break }
      if (rv && typeof rv === 'object' && !Array.isArray(rv)) {
        const obj = rv as Record<string, unknown>
        const c = obj.response ?? obj.result ?? obj.content ?? obj.value ?? obj.text
        if (c != null && typeof c !== 'object') { __v = String(c); break }
        if (Array.isArray(c)) { __v = JSON.stringify(c); break }
      }
    }
  }

  const finalValue = typeof rawInputs.value === 'string' ? rawInputs.value : __v
  const aliases: Record<string, unknown> = {
    text: __v, content: __v, answer: __v, response: __v, result: __v,
    data: __v, input: __v, output: __v, query: __v, summary: __v, article: __v,
    tagline: __v, topic: __v, question: __v, message: __v,
  }
  // When spreading rawInputs, skip entries where an alias key would be overwritten with
  // a plain object — the __v string version is more useful for those.
  // Non-alias keys and scalar/array values always pass through.
  const filteredRaw: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawInputs)) {
    if (v !== undefined && !(k in aliases && v !== null && typeof v === 'object' && !Array.isArray(v))) {
      filteredRaw[k] = v
    }
  }
  return Object.assign(
    aliases,
    rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal) ? rawVal as Record<string, unknown> : {},
    filteredRaw,
    { value: finalValue },
  )
}

// ─── Skip Logic ───────────────────────────────────────────────────────────────

function getSkipReason(sources: InputSource[], results: Results): string | null {
  for (const src of sources) {
    if (results.get(src.srcId)?.__error) return 'Skipped: upstream node failed'
    if (src.fromDecision && results.get(src.srcId)?.[src.handle] === null)
      return 'Skipped: decision branch not taken'
  }
  return null
}

// ─── User Code Execution ──────────────────────────────────────────────────────

/**
 * Run user-authored code in an isolated vm.Script context.
 * Supports both patterns that the generator supports:
 *   • return { result: value }   – explicit return captured as __output
 *   • result = value              – assignment, returned via fallback
 */
async function runUserCode(
  code: string,
  inputs: Record<string, unknown>,
  ctx: ExecutionContext,
  extra?: Record<string, unknown>,
): Promise<unknown> {
  const sandbox: Record<string, unknown> = {
    inputs,
    result: undefined,
    fetch: ctx.fetch,
    callLLM: ctx.callLLM,
    callLLMWithTools: ctx.callLLMWithTools,
    getState: ctx.getState ?? (() => null),
    setState: ctx.setState ?? (() => {}),
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    Date, Math, JSON, Array, Object, String, Number, Boolean,
    Set, Map, Promise, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    ...extra,
  }
  const context = vm.createContext(sandbox)
  // Mirrors generator: let result; __output = await IIFE; return __output ?? result
  const wrapped = `(async () => {
  let result
  const __output = await (async () => { ${code} })()
  return __output !== undefined ? __output : result
})()`
  const script = new vm.Script(wrapped)
  return script.runInContext(context)
}

// ─── MCP Config Builder ───────────────────────────────────────────────────────

function buildMcpConfigs(mcpList: NodeData[]): McpConfig[] {
  return mcpList.map(d => ({
    command: d.mcpCommand ?? '',
    args: (d.mcpArgs ?? '').split('\n').map(s => s.trim()).filter(Boolean),
    env: Object.fromEntries(
      (d.mcpEnv ?? '').split('\n').map(s => s.trim()).filter(s => s.includes('='))
        .map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] }),
    ),
  }))
}

// ─── Node Executors ───────────────────────────────────────────────────────────

function executeUI(node: FlowNode, ctx: ExecutionContext): NodeResult {
  const stored = ctx.uiInputs[node.id]
  if (stored && typeof stored === 'object') return stored as NodeResult
  if (node.data.uiKind === 'file') {
    return node.data.uiMultiple
      ? { files: [] }
      : { filename: '', content: '', value: '', type: '', size: 0 }
  }
  if (node.data.uiKind === 'choice') return { choice: '', index: -1 }
  return { value: '' }
}

async function executeState(
  node: FlowNode,
  rawInputs: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<NodeResult> {
  const key = node.data.stateKey ?? 'unnamed'
  let defaultVal: unknown = null
  try { defaultVal = JSON.parse(node.data.stateDefault ?? 'null') } catch { defaultVal = node.data.stateDefault ?? null }

  if (node.data.stateMode === 'write') {
    const rawVal = rawInputs.value
    // Normalize scalar from any upstream shape — mirrors generator's state-write normalization
    const val = (rawVal !== undefined && typeof rawVal !== 'object')
      ? rawVal
      : (rawVal && typeof rawVal === 'object')
        ? ((rawVal as Record<string, unknown>).response
          ?? (rawVal as Record<string, unknown>).result
          ?? (rawVal as Record<string, unknown>).content
          ?? (rawVal as Record<string, unknown>).value
          ?? (rawVal as Record<string, unknown>).text
          ?? rawVal)
        : defaultVal
    await ctx.setState?.(key, val)
    return { value: val }
  } else {
    const stored = (await ctx.getState?.(key, defaultVal)) ?? defaultVal
    return { value: stored }
  }
}

function executeChunker(node: FlowNode, rawInputs: Record<string, unknown>): NodeResult {
  const rawInput = rawInputs.text ?? rawInputs.value ?? rawInputs.content ?? ''
  const chunkText = typeof rawInput === 'object' && rawInput !== null
    ? String(
      (rawInput as Record<string, unknown>).content
      ?? (rawInput as Record<string, unknown>).value
      ?? (rawInput as Record<string, unknown>).text
      ?? (Array.isArray((rawInput as Record<string, unknown>).chunks)
        ? ((rawInput as Record<string, unknown>).chunks as string[]).join('\n\n')
        : ''),
    )
    : String(rawInput)

  const size = node.data.chunkerSize ?? 500
  const overlap = node.data.chunkerOverlap ?? 50
  const strategy = node.data.chunkerStrategy ?? 'paragraph'

  let rawChunks: string[]
  if (strategy === 'paragraph') {
    rawChunks = chunkText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
  } else if (strategy === 'sentence') {
    rawChunks = chunkText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
  } else {
    rawChunks = []
    for (let i = 0; i < chunkText.length; i += size - overlap) {
      rawChunks.push(chunkText.slice(i, i + size))
    }
  }

  let chunks: string[]
  if (strategy !== 'fixed') {
    chunks = []
    let cur = ''
    for (const piece of rawChunks) {
      if (cur.length + piece.length + 2 > size && cur.length > 0) {
        chunks.push(cur.trim())
        cur = overlap > 0 ? cur.slice(-overlap) + ' ' + piece : piece
      } else {
        cur = cur ? cur + '\n\n' + piece : piece
      }
    }
    if (cur.trim()) chunks.push(cur.trim())
  } else {
    chunks = rawChunks
  }

  return { chunks, count: chunks.length, text: chunkText }
}

async function executeLLM(
  node: FlowNode,
  rawInputs: Record<string, unknown>,
  ctx: ExecutionContext,
  mcpList: NodeData[],
  systemPrompt?: string,
): Promise<NodeResult> {
  const provider = node.data.llmProvider ?? 'default'
  const rawModel = node.data.llmModel
    || (provider === 'ollama' ? 'llama3.2' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini')
  const modelPrefix = provider === 'ollama' ? 'ollama/' : provider === 'anthropic' ? 'anthropic/' : ''
  const model = `${modelPrefix}${rawModel}`
  const template = node.data.llmPromptTemplate || '{{text}}'
  const llmSystem = systemPrompt ?? node.data.llmSkillsContent ?? undefined

  let responseFormat: unknown = undefined
  if (node.data.llmStructuredSchema) {
    try {
      const schema = JSON.parse(node.data.llmStructuredSchema)
      responseFormat = { type: 'json_schema', json_schema: { name: 'output', strict: true, schema } }
    } catch { /* ignore */ }
  } else if (node.data.llmJsonMode) {
    responseFormat = { type: 'json_object' }
  }

  const mcpConfigs = buildMcpConfigs(mcpList)

  // LLM node with custom code: run it with LLM constants available in the sandbox
  if (node.data.code) {
    const inputs = buildUserCodeInputs(rawInputs)
    const raw = await runUserCode(node.data.code, inputs, ctx, {
      llmModel: model,
      llmPromptTemplate: template,
      llmSystemPrompt: llmSystem,
      llmResponseFormat: responseFormat,
      mcpConfigs,
    })
    return (typeof raw === 'object' && raw !== null) ? raw as NodeResult : { value: raw }
  }

  // Auto-generated path: substitute template variables, call LLM
  const prompt = resolveTemplate(template, rawInputs)
  const outputKey = (node.data.outputs && node.data.outputs.length > 0)
    ? node.data.outputs[0].name
    : 'response'

  const raw = mcpConfigs.length > 0
    ? await ctx.callLLMWithTools(model, prompt, llmSystem, mcpConfigs)
    : await ctx.callLLM(model, prompt, llmSystem, responseFormat)

  return { [outputKey]: raw }
}

async function executeJudge(
  node: FlowNode,
  judgeInputs: { content: unknown; criteria: unknown },
  ctx: ExecutionContext,
  systemPrompt?: string,
): Promise<NodeResult> {
  const provider = node.data.llmProvider ?? 'default'
  const rawModel = node.data.llmModel
    || (provider === 'ollama' ? 'llama3.2' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini')
  const modelPrefix = provider === 'ollama' ? 'ollama/' : provider === 'anthropic' ? 'anthropic/' : ''
  const model = `${modelPrefix}${rawModel}`

  const defaultSystem = "You are an impartial AI evaluator. Evaluate the provided content against the given criteria and respond ONLY with a JSON object containing: score (0-10 integer), verdict ('pass'|'fail'|'review'), reasoning (string)."
  const judgeSystem = systemPrompt ?? defaultSystem

  const judgeResolve = (v: unknown): string => {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const p = obj.response ?? obj.content ?? obj.value ?? obj.result ?? obj.text
      return p != null ? String(p) : JSON.stringify(v)
    }
    return String(v)
  }

  const content = judgeResolve(judgeInputs.content)
  const criteria = judgeResolve(judgeInputs.criteria)
  const prompt = criteria
    ? `Evaluate this content:\n\n${content}\n\nCriteria: ${criteria}`
    : `Evaluate this content:\n\n${content}`

  const raw = await ctx.callLLM(model, prompt, judgeSystem, { type: 'json_object' })
  let judgeResult: Record<string, unknown>
  try { judgeResult = JSON.parse(raw) as Record<string, unknown> }
  catch { judgeResult = { score: null, verdict: 'review', reasoning: raw } }

  return {
    score: judgeResult.score ?? null,
    verdict: judgeResult.verdict ?? 'review',
    reasoning: judgeResult.reasoning ?? raw,
  }
}

/**
 * Build the judge node's { content, criteria } inputs by checking source node kinds.
 * Mirrors the generator's special-cased judge orchestration.
 */
function buildJudgeInputs(
  node: FlowNode,
  edges: FlowEdge[],
  nodeById: Map<string, FlowNode>,
  results: Results,
): { content: unknown; criteria: unknown } {
  let content: unknown = ''
  let criteria: unknown = ''

  const judgeEdges = edges.filter(e => e.target === node.id)
  for (const e of judgeEdges) {
    const srcNode = nodeById.get(e.source)
    if (!srcNode) continue
    const upstream = results.get(e.source)
    const resolved = upstream?.response ?? upstream?.content ?? upstream?.value ?? upstream?.result ?? upstream
    if (srcNode.data.kind === 'ui' || srcNode.data.kind === 'input') {
      criteria = resolved
    } else {
      content = resolved
    }
  }

  return { content, criteria }
}

// ─── Sub-Workflow Execution ───────────────────────────────────────────────────

async function runSubWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  subInputs: Record<string, unknown>,
  ctx: ExecutionContext,
  ancestorIds: Set<string>,
): Promise<unknown> {
  const sorted = topoSort(nodes, edges)
  if (sorted.length === 0) return null

  const execIds = new Set(sorted.map(n => n.id))
  const { inputSources, mcpSources, systemPromptSources } = buildEdgeInfo(nodes, edges, execIds)
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const results: Results = new Map()

  for (const node of sorted) {
    if (node.data.kind === 'mcp') continue
    if (node.data.kind === 'note') { results.set(node.id, {}); continue }

    const sources = inputSources.get(node.id) ?? []
    const skipReason = getSkipReason(sources, results)
    if (skipReason) {
      results.set(node.id, { __error: true, message: skipReason })
      continue
    }

    const rawInputs = buildRawInputs(sources, results)
    const spSrcId = systemPromptSources.get(node.id)
    const systemPrompt = spSrcId
      ? (results.get(spSrcId) as Record<string, unknown>)?.system_prompt as string | undefined
      : undefined
    const mcp = mcpSources.get(node.id) ?? []

    try {
      let result: NodeResult

      if (node.data.kind === 'input') {
        result = subInputs
      } else if (node.data.kind === 'trigger') {
        result = { triggered_at: new Date().toISOString() }
      } else if (node.data.kind === 'ui') {
        result = executeUI(node, ctx)
      } else if (node.data.kind === 'systemprompt') {
        result = { system_prompt: node.data.systemPromptContent ?? '' }
      } else if (node.data.kind === 'state') {
        result = await executeState(node, rawInputs, ctx)
      } else if (node.data.kind === 'chunker') {
        result = executeChunker(node, rawInputs)
      } else if (node.data.kind === 'llm') {
        result = await executeLLM(node, rawInputs, ctx, mcp, systemPrompt)
      } else if (node.data.kind === 'judge') {
        const ji = buildJudgeInputs(node, edges, nodeById, results)
        result = await executeJudge(node, ji, ctx, systemPrompt)
      } else if (node.data.kind === 'workflow') {
        const refId = node.data.workflowRef ?? ''
        if (ancestorIds.has(refId) || !node.data.workflowData) {
          result = { error: `Circular or missing workflow: ${node.data.workflowName ?? refId}` }
        } else {
          const newAncestors = new Set([...ancestorIds, refId])
          const sub = await runSubWorkflow(
            node.data.workflowData.nodes, node.data.workflowData.edges,
            rawInputs, ctx, newAncestors,
          )
          result = (typeof sub === 'object' && sub !== null) ? sub as NodeResult : { value: sub }
        }
      } else {
        const inputs = node.data.kind === 'output'
          ? rawInputs
          : buildUserCodeInputs(rawInputs)
        const code = node.data.code || (node.data.kind === 'output' ? 'return inputs.value' : 'return inputs')
        const raw = await runUserCode(code, inputs, ctx)
        result = (typeof raw === 'object' && raw !== null) ? raw as NodeResult : { value: raw }
      }

      results.set(node.id, result)
    } catch (e) {
      results.set(node.id, { __error: true, message: e instanceof Error ? e.message : String(e) })
    }
  }

  const outputNodes = sorted.filter(n => n.data.kind === 'output')
  const returnNode = outputNodes.length > 0 ? outputNodes[outputNodes.length - 1] : sorted[sorted.length - 1]
  return returnNode ? results.get(returnNode.id) : null
}

// ─── Main Pipeline Executor ───────────────────────────────────────────────────

export async function runPipeline(
  nodes: FlowNode[],
  edges: FlowEdge[],
  ctx: ExecutionContext,
): Promise<PipelineResult> {
  const sorted = topoSort(nodes, edges)
  if (sorted.length === 0) return { __result: null, __trace: [] }

  const execIds = new Set(sorted.map(n => n.id))
  const { inputSources, mcpSources, systemPromptSources } = buildEdgeInfo(nodes, edges, execIds)
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const results: Results = new Map()
  const trace: TraceEntry[] = []

  try {
    for (const node of sorted) {
      if (node.data.kind === 'mcp') continue

      // Note nodes: store empty result but emit no trace entry (matches generator)
      if (node.data.kind === 'note') {
        results.set(node.id, {})
        continue
      }

      const sources = inputSources.get(node.id) ?? []
      const skipReason = getSkipReason(sources, results)

      if (skipReason) {
        results.set(node.id, { __error: true, message: skipReason })
        trace.push({ id: node.id, label: node.data.label, kind: node.data.kind, error: skipReason })
        continue
      }

      await ctx.notifyNode?.(node.id)

      const rawInputs = buildRawInputs(sources, results)
      const spSrcId = systemPromptSources.get(node.id)
      const systemPrompt = spSrcId
        ? (results.get(spSrcId) as Record<string, unknown>)?.system_prompt as string | undefined
        : undefined
      const mcp = mcpSources.get(node.id) ?? []

      try {
        let result: NodeResult

        if (node.data.kind === 'ui') {
          result = executeUI(node, ctx)
        } else if (node.data.kind === 'input') {
          // Run the input node's code with uiInputs, matching generator's `{ ...initialInput }` pattern.
          // Code like `return { text: inputs.text ?? '' }` safely coerces undefined fields to defaults.
          const code = node.data.code || 'return inputs'
          const raw = await runUserCode(code, ctx.uiInputs, ctx)
          result = (typeof raw === 'object' && raw !== null) ? raw as NodeResult : { value: raw }
        } else if (node.data.kind === 'trigger') {
          result = { triggered_at: new Date().toISOString() }
        } else if (node.data.kind === 'systemprompt') {
          result = { system_prompt: node.data.systemPromptContent ?? '' }
        } else if (node.data.kind === 'state') {
          result = await executeState(node, rawInputs, ctx)
        } else if (node.data.kind === 'chunker') {
          result = executeChunker(node, rawInputs)
        } else if (node.data.kind === 'llm') {
          result = await executeLLM(node, rawInputs, ctx, mcp, systemPrompt)
        } else if (node.data.kind === 'judge') {
          const ji = buildJudgeInputs(node, edges, nodeById, results)
          result = await executeJudge(node, ji, ctx, systemPrompt)
        } else if (node.data.kind === 'workflow') {
          const refId = node.data.workflowRef ?? ''
          if (!node.data.workflowData) {
            result = { error: `Missing workflow data: ${node.data.workflowName ?? refId}` }
          } else {
            const ancestorIds = new Set([refId])
            const sub = await runSubWorkflow(
              node.data.workflowData.nodes, node.data.workflowData.edges,
              rawInputs, ctx, ancestorIds,
            )
            result = (typeof sub === 'object' && sub !== null) ? sub as NodeResult : { value: sub }
          }
        } else {
          // function / decision / output
          // Output nodes receive raw upstream values — no alias normalization.
          // The default code `return inputs.value` returns the whole upstream result,
          // matching generator.ts which does NOT apply the alias block to output nodes.
          const inputs = node.data.kind === 'output'
            ? rawInputs
            : buildUserCodeInputs(rawInputs)
          const code = node.data.code || (node.data.kind === 'output' ? 'return inputs.value' : 'return inputs')
          const raw = await runUserCode(code, inputs, ctx)
          result = (typeof raw === 'object' && raw !== null) ? raw as NodeResult : { value: raw }
        }

        results.set(node.id, result)
        trace.push({ id: node.id, label: node.data.label, kind: node.data.kind, output: result })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        results.set(node.id, { __error: true, message: msg })
        trace.push({ id: node.id, label: node.data.label, kind: node.data.kind, error: msg })
      }
    }
  } finally {
    await ctx.notifyNode?.(null)
  }

  const lastNode = sorted[sorted.length - 1]
  return {
    __result: lastNode ? results.get(lastNode.id) : null,
    __trace: trace,
  }
}
