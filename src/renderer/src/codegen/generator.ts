import type { FlowNode, FlowEdge } from '../types'

// ─── Topological Sort ─────────────────────────────────────────────────────────

function topoSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length) {
    const cur = queue.shift()!
    sorted.push(cur)
    for (const next of adj.get(cur) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeById.get(id)!).filter(Boolean)
}

// ─── Code Generation ─────────────────────────────────────────────────────────

/**
 * Generates a self-contained async JavaScript pipeline from the node graph.
 * The entry point is `runPipeline(initialInput)`.
 *
 * Each node becomes a named async function. Edges wire outputs to inputs.
 * Decision nodes produce multiple output branches by key.
 */
export function generateCode(nodes: FlowNode[], edges: FlowEdge[]): string {
  if (nodes.length === 0) return '// Empty graph – no code generated'

  const sorted = topoSort(nodes, edges)

  // Map: targetNodeId → { targetHandle → { sourceNodeId, sourceHandle } }
  const inputSources = new Map<string, Map<string, { srcId: string; handle: string }>>()
  for (const e of edges) {
    if (!inputSources.has(e.target)) inputSources.set(e.target, new Map())
    inputSources
      .get(e.target)!
      .set(e.targetHandle ?? 'value', { srcId: e.source, handle: e.sourceHandle ?? 'result' })
  }

  const lines: string[] = []
  lines.push(`// ═══════════════════════════════════════════════════`)
  lines.push(`// PromptFlow – Generated Pipeline`)
  lines.push(`// Nodes: ${sorted.map((n) => n.data.label).join(' → ')}`)
  lines.push(`// ═══════════════════════════════════════════════════`)
  lines.push(``)

  // Emit one async function per node
  for (const node of sorted) {
    const fnName = nodeToFnName(node.id, node.data.label)
    lines.push(`// ── Node: ${node.data.label} (${node.data.kind}) ──`)
    lines.push(`async function ${fnName}(inputs) {`)
    // For LLM nodes inject model + prompt template as local constants
    if (node.data.kind === 'llm') {
      const model = (node.data.llmModel || 'gpt-4o-mini').replace(/`/g, '\\`')
      const tmpl = (node.data.llmPromptTemplate || '{{text}}').replace(/`/g, '\\`')
      lines.push(`  const llmModel = \`${model}\``)
      lines.push(`  const llmPromptTemplate = \`${tmpl}\``)
    }
    // Indent the node's code
    const nodeCode = node.data.code || 'return inputs'
    for (const codeLine of nodeCode.split('\n')) {
      lines.push(`  ${codeLine}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  // Emit the orchestrator
  lines.push(`// ── Pipeline Orchestrator ──`)
  lines.push(`async function runPipeline(initialInput) {`)
  lines.push(`  const results = {}`)
  lines.push(``)

  for (const node of sorted) {
    const fnName = nodeToFnName(node.id, node.data.label)
    const sources = inputSources.get(node.id)

    // Build the inputs object for this node
    const inputParts: string[] = []
    if (node.data.kind === 'input') {
      inputParts.push(`...initialInput`)
    } else if (sources) {
      for (const [targetHandle, { srcId, handle }] of sources) {
        const srcFn = `results["${srcId}"]`
        inputParts.push(`"${targetHandle}": ${srcFn}?.["${handle}"] ?? ${srcFn}`)
      }
    }

    const inputsExpr = `{ ${inputParts.join(', ')} }`
    lines.push(`  results["${node.id}"] = await ${fnName}(${inputsExpr})`)
  }

  // Return last node's output
  const lastNode = sorted[sorted.length - 1]
  lines.push(``)
  lines.push(`  return results["${lastNode.id}"]`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// Entry point`)
  lines.push(`return runPipeline(inputs)`)

  return lines.join('\n')
}

function nodeToFnName(id: string, label: string): string {
  const clean = label.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '')
  return `${clean}_${id.replace(/-/g, '_')}`
}
