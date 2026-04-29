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
    if (node.data.kind === 'ui') {
      // UI nodes read their value from the __uiInputs__ global injected by the runtime
      switch (node.data.uiKind) {
        case 'file':
          if (node.data.uiMultiple) {
            lines.push(`  return __uiInputs__['${node.id}'] ?? { files: [] }`)
          } else {
            lines.push(`  return __uiInputs__['${node.id}'] ?? { filename: '', content: '', type: '', size: 0 }`)
          }
          break
        case 'choice':
          lines.push(`  return __uiInputs__['${node.id}'] ?? { choice: '', index: -1 }`)
          break
        default: // 'text'
          lines.push(`  return __uiInputs__['${node.id}'] ?? { value: '' }`)
      }
    } else {
      // For LLM nodes inject model + prompt template as local constants
      if (node.data.kind === 'llm') {
        const model = (node.data.llmModel || 'gpt-4o-mini').replace(/`/g, '\\`')
        const tmpl = (node.data.llmPromptTemplate || '{{text}}').replace(/`/g, '\\`')
        lines.push(`  const llmModel = \`${model}\``)
        lines.push(`  const llmPromptTemplate = \`${tmpl}\``)
        if (node.data.llmSkillsContent) {
          const skills = node.data.llmSkillsContent.replace(/`/g, '\\`')
          lines.push(`  const llmSystemPrompt = \`${skills}\``)
        }
      }
      // Indent the node's code
      const nodeCode = node.data.code || 'return inputs'
      for (const codeLine of nodeCode.split('\n')) {
        lines.push(`  ${codeLine}`)
      }
      // If code uses `result =` pattern without an explicit `return`, return result automatically
      const hasExplicitReturn = /^\s*return\s/m.test(nodeCode)
      if (!hasExplicitReturn) {
        lines.push(`  return result`)
      }
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

    if (node.data.kind === 'ui') {
      // UI nodes get their value from __uiInputs__ — no edge wiring needed
      lines.push(`  results["${node.id}"] = await ${fnName}({})`)
    } else {
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
