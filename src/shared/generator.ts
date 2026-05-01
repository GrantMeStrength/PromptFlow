import type { FlowNode, FlowEdge, NodeData } from '../renderer/src/types'

// ─── Topological Sort ─────────────────────────────────────────────────────────

function topoSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  // MCP nodes are config providers, not pipeline steps — exclude them
  const execNodes = nodes.filter(n => n.data.kind !== 'mcp')
  const execIds = new Set(execNodes.map(n => n.id))
  // Only count edges between exec nodes
  const execEdges = edges.filter(e => execIds.has(e.source) && execIds.has(e.target))

  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of execNodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of execEdges) {
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

  const nodeById = new Map(execNodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeById.get(id)!).filter(Boolean)
}

// ─── Edge Maps ────────────────────────────────────────────────────────────────

function buildEdgeMaps(nodes: FlowNode[], edges: FlowEdge[], execIds: Set<string>) {
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const inputSources = new Map<string, Map<string, { srcId: string; handle: string; explicit: boolean }>>()
  const mcpSources = new Map<string, NodeData[]>()
  const systemPromptSources = new Map<string, string>() // targetNodeId → sourceNodeId

  for (const e of edges) {
    const srcNode = nodeById.get(e.source)
    if (!srcNode) continue

    if (srcNode.data.kind === 'mcp') {
      if (!mcpSources.has(e.target)) mcpSources.set(e.target, [])
      mcpSources.get(e.target)!.push(srcNode.data)
    } else if (srcNode.data.kind === 'systemprompt' && (nodeById.get(e.target)?.data.kind === 'llm' || nodeById.get(e.target)?.data.kind === 'judge')) {
      // Wire system prompt node → llm/judge node
      systemPromptSources.set(e.target, e.source)
    } else if (execIds.has(e.source) && execIds.has(e.target)) {
      if (!inputSources.has(e.target)) inputSources.set(e.target, new Map())
      inputSources.get(e.target)!.set(
        e.targetHandle ?? 'value',
        {
          srcId: e.source,
          handle: e.sourceHandle ?? 'result',
          // explicit = edge had a real sourceHandle (not defaulted), meaning the source
          // node returns an object and we should use ONLY that key (e.g. Decision branches).
          explicit: e.sourceHandle != null,
        }
      )
    }
  }

  return { inputSources, mcpSources, systemPromptSources }
}

// ─── Node Body Emitter (shared by main pipeline and sub-workflows) ─────────────

function emitNodeBodyLines(
  node: FlowNode,
  mcpSources: Map<string, NodeData[]>,
  systemPromptSources: Map<string, string>,
  lines: string[],
  ind: string
): void {
  if (node.data.kind === 'ui') {
    switch (node.data.uiKind) {
      case 'file':
        if (node.data.uiMultiple) {
          lines.push(`${ind}return __uiInputs__['${node.id}'] ?? { files: [] }`)
        } else {
          lines.push(`${ind}return __uiInputs__['${node.id}'] ?? { filename: '', content: '', value: '', type: '', size: 0 }`)
        }
        break
      case 'choice':
        lines.push(`${ind}return __uiInputs__['${node.id}'] ?? { choice: '', index: -1 }`)
        break
      default:
        lines.push(`${ind}return __uiInputs__['${node.id}'] ?? { value: '' }`)
    }
    return
  }

  if (node.data.kind === 'state') {
    const key = (node.data.stateKey ?? 'unnamed').replace(/`/g, '\\`')
    let defaultVal: unknown = null
    try { defaultVal = JSON.parse(node.data.stateDefault ?? 'null') } catch { defaultVal = node.data.stateDefault ?? null }
    const defaultExpr = JSON.stringify(defaultVal)
    if (node.data.stateMode === 'write') {
      lines.push(`${ind}const _val = inputs.value !== undefined ? inputs.value : ${defaultExpr}`)
      lines.push(`${ind}await setState(\`${key}\`, _val)`)
      lines.push(`${ind}return { value: _val }`)
    } else {
      lines.push(`${ind}const _stored = await getState(\`${key}\`, ${defaultExpr})`)
      lines.push(`${ind}return { value: _stored }`)
    }
    return
  }

  if (node.data.kind === 'systemprompt') {
    const content = node.data.systemPromptContent ?? ''
    lines.push(`${ind}return { system_prompt: ${JSON.stringify(content)} }`)
    return
  }

  if (node.data.kind === 'chunker') {
    const size = node.data.chunkerSize ?? 500
    const overlap = node.data.chunkerOverlap ?? 50
    const strategy = node.data.chunkerStrategy ?? 'paragraph'
    lines.push(`${ind}const _rawInput = inputs.text ?? inputs.value ?? inputs.content ?? ''`)
    lines.push(`${ind}const _chunkText = typeof _rawInput === 'object' && _rawInput !== null`)
    lines.push(`${ind}  ? String(_rawInput.content ?? _rawInput.value ?? _rawInput.text ?? (Array.isArray(_rawInput.chunks) ? _rawInput.chunks.join('\\n\\n') : ''))`)
    lines.push(`${ind}  : String(_rawInput)`)
    lines.push(`${ind}const _chunkSize = ${size}`)
    lines.push(`${ind}const _chunkOverlap = ${overlap}`)
    if (strategy === 'paragraph') {
      lines.push(`${ind}const _rawChunks = _chunkText.split(/\\n\\s*\\n/).map(s => s.trim()).filter(Boolean)`)
    } else if (strategy === 'sentence') {
      lines.push(`${ind}const _rawChunks = _chunkText.split(/(?<=[.!?])\\s+/).map(s => s.trim()).filter(Boolean)`)
    } else {
      // fixed character split with overlap
      lines.push(`${ind}const _rawChunks = []`)
      lines.push(`${ind}for (let _i = 0; _i < _chunkText.length; _i += _chunkSize - _chunkOverlap) {`)
      lines.push(`${ind}  _rawChunks.push(_chunkText.slice(_i, _i + _chunkSize))`)
      lines.push(`${ind}}`)
    }
    // merge short paragraph/sentence chunks up to size
    if (strategy !== 'fixed') {
      lines.push(`${ind}const _chunks = []`)
      lines.push(`${ind}let _cur = ''`)
      lines.push(`${ind}for (const _piece of _rawChunks) {`)
      lines.push(`${ind}  if (_cur.length + _piece.length + 2 > _chunkSize && _cur.length > 0) {`)
      lines.push(`${ind}    _chunks.push(_cur.trim())`)
      lines.push(`${ind}    _cur = _chunkOverlap > 0 ? _cur.slice(-_chunkOverlap) + ' ' + _piece : _piece`)
      lines.push(`${ind}  } else {`)
      lines.push(`${ind}    _cur = _cur ? _cur + '\\n\\n' + _piece : _piece`)
      lines.push(`${ind}  }`)
      lines.push(`${ind}}`)
      lines.push(`${ind}if (_cur.trim()) _chunks.push(_cur.trim())`)
    } else {
      lines.push(`${ind}const _chunks = _rawChunks`)
    }
    lines.push(`${ind}return { chunks: _chunks, count: _chunks.length, text: _chunkText }`)
    return
  }

  if (node.data.kind === 'judge') {
    const provider = node.data.llmProvider ?? 'default'
    const rawModel = node.data.llmModel || (provider === 'ollama' ? 'llama3.2' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini')
    const modelPrefix = provider === 'ollama' ? 'ollama/' : provider === 'anthropic' ? 'anthropic/' : ''
    const modelStr = `${modelPrefix}${rawModel}`
    const spSrcId = systemPromptSources.get(node.id)

    lines.push(`${ind}const judgeModel = ${JSON.stringify(modelStr)}`)
    if (spSrcId) {
      // System prompt is injected via inputs.__systemPrompt__ from the orchestrator
      lines.push(`${ind}const judgeSystemPrompt = inputs.__systemPrompt__ ?? "You are an impartial AI evaluator. Evaluate the provided content against the given criteria and respond ONLY with a JSON object containing: score (0-10 integer), verdict ('pass'|'fail'|'review'), reasoning (string)."`)
    } else {
      lines.push(`${ind}const judgeSystemPrompt = "You are an impartial AI evaluator. Evaluate the provided content against the given criteria and respond ONLY with a JSON object containing: score (0-10 integer), verdict ('pass'|'fail'|'review'), reasoning (string)."`)
    }
    lines.push(`${ind}const judgeContent = inputs.content ?? inputs.value ?? ''`)
    lines.push(`${ind}const judgeCriteria = inputs.criteria ?? ''`)
    lines.push(`${ind}const judgePrompt = judgeCriteria ? \`Evaluate this content:\\n\\n\${judgeContent}\\n\\nCriteria: \${judgeCriteria}\` : \`Evaluate this content:\\n\\n\${judgeContent}\``)
    lines.push(`${ind}const judgeRaw = await callLLM(judgeModel, judgePrompt, judgeSystemPrompt, { type: 'json_object' })`)
    lines.push(`${ind}let judgeResult`)
    lines.push(`${ind}try { judgeResult = JSON.parse(judgeRaw) } catch { judgeResult = { score: null, verdict: 'review', reasoning: judgeRaw } }`)
    lines.push(`${ind}return { score: judgeResult.score ?? null, verdict: judgeResult.verdict ?? 'review', reasoning: judgeResult.reasoning ?? judgeRaw }`)
    return
  }

  if (node.data.kind === 'llm') {
    const provider = node.data.llmProvider ?? 'default'
    const rawModel = node.data.llmModel || (provider === 'ollama' ? 'llama3.2' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini')
    const modelPrefix = provider === 'ollama' ? 'ollama/' : provider === 'anthropic' ? 'anthropic/' : ''
    const modelStr = `${modelPrefix}${rawModel}`
    const tmpl = node.data.llmPromptTemplate || '{{text}}'
    lines.push(`${ind}const llmModel = ${JSON.stringify(modelStr)}`)
    lines.push(`${ind}const llmPromptTemplate = ${JSON.stringify(tmpl)}`)

    const spSrcId = systemPromptSources.get(node.id)
    if (spSrcId) {
      // System prompt is injected via inputs.__systemPrompt__ from the orchestrator
      lines.push(`${ind}const llmSystemPrompt = inputs.__systemPrompt__ ?? ${JSON.stringify(node.data.llmSkillsContent ?? '')}`)
    } else if (node.data.llmSkillsContent) {
      lines.push(`${ind}const llmSystemPrompt = ${JSON.stringify(node.data.llmSkillsContent)}`)
    }

    // Structured output / JSON mode
    let responseFormatExpr = 'undefined'
    if (node.data.llmStructuredSchema) {
      let schema: unknown
      try { schema = JSON.parse(node.data.llmStructuredSchema) } catch { schema = null }
      if (schema) {
        responseFormatExpr = JSON.stringify({ type: 'json_schema', json_schema: { name: 'output', strict: true, schema } })
      }
    } else if (node.data.llmJsonMode) {
      responseFormatExpr = JSON.stringify({ type: 'json_object' })
    }
    if (responseFormatExpr !== 'undefined') {
      lines.push(`${ind}const llmResponseFormat = ${responseFormatExpr}`)
    }

    const mcpList = mcpSources.get(node.id) ?? []
    if (mcpList.length > 0) {
      const configs = mcpList.map(d => ({
        command: d.mcpCommand ?? '',
        args: (d.mcpArgs ?? '').split('\n').map(s => s.trim()).filter(Boolean),
        env: Object.fromEntries(
          (d.mcpEnv ?? '').split('\n')
            .map(s => s.trim())
            .filter(s => s.includes('='))
            .map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] })
        ),
      }))
      lines.push(`${ind}const mcpConfigs = ${JSON.stringify(configs)}`)
    }

    // When no custom code is provided, auto-generate a standard LLM call that:
    // • substitutes all {{var}} placeholders from inputs
    // • calls callLLM (or callLLMWithTools if MCP nodes are wired)
    // • returns under the first declared output name, or 'response'
    if (!node.data.code) {
      const templateVars = [...tmpl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
      const outputKey = (node.data.outputs && node.data.outputs.length > 0)
        ? node.data.outputs[0].name
        : 'response'
      lines.push(`${ind}let _llmPrompt = llmPromptTemplate`)
      for (const v of templateVars) {
        lines.push(`${ind}_llmPrompt = _llmPrompt.replace('{{${v}}}', String(inputs.${v} ?? ''))`)
      }
      // Catch-all for {{text}} / {{value}} / {{content}} if not already handled
      if (!templateVars.includes('text')) {
        lines.push(`${ind}_llmPrompt = _llmPrompt.replace('{{text}}', String(inputs.text ?? inputs.value ?? inputs.content ?? ''))`)
      }
      lines.push(`${ind}const _llmSys = typeof llmSystemPrompt !== 'undefined' ? llmSystemPrompt : undefined`)
      lines.push(`${ind}const _llmMcp = typeof mcpConfigs !== 'undefined' ? mcpConfigs : []`)
      lines.push(`${ind}const _llmFmt = typeof llmResponseFormat !== 'undefined' ? llmResponseFormat : undefined`)
      lines.push(`${ind}const _llmResp = _llmMcp.length > 0`)
      lines.push(`${ind}  ? await callLLMWithTools(llmModel, _llmPrompt, _llmSys, _llmMcp)`)
      lines.push(`${ind}  : await callLLM(llmModel, _llmPrompt, _llmSys, _llmFmt)`)
      lines.push(`${ind}return { ${JSON.stringify(outputKey)}: _llmResp }`)
      return
    }
  }

  // Wrap user code in an inner async IIFE so BOTH coding patterns work:
  //   • return { result: value }  — explicit return, captured as __output
  //   • result = value            — assignment, returned via fallback
  const nodeCode = node.data.code || 'return inputs'
  lines.push(`${ind}let result`)
  lines.push(`${ind}const __output = await (async () => {`)
  for (const codeLine of nodeCode.split('\n')) {
    lines.push(`${ind}  ${codeLine}`)
  }
  lines.push(`${ind}})()`)
  lines.push(`${ind}return __output !== undefined ? __output : result`)
}

// ─── Sub-workflow IIFE Body Generator ─────────────────────────────────────────

/**
 * Generates lines for the body of a sub-workflow IIFE.
 * Called inside: return await (async (__subInputs__) => { <<here>> })(inputs)
 * ancestorIds guards against circular sub-workflow references.
 */
function generateSubWorkflowIIFE(
  nodes: FlowNode[],
  edges: FlowEdge[],
  ancestorIds: Set<string>,
  ind: string = '    '
): string[] {
  const sorted = topoSort(nodes, edges)
  if (sorted.length === 0) return [`${ind}return null`]

  const execIds = new Set(sorted.map(n => n.id))
  const { inputSources, mcpSources, systemPromptSources } = buildEdgeMaps(nodes, edges, execIds)
  const lines: string[] = []

  lines.push(`${ind}const _r = {}`)
  lines.push(``)

  for (const node of sorted) {
    if (node.data.kind === 'mcp') continue
    const fnId = `_sf_${node.id.replace(/-/g, '_')}`
    lines.push(`${ind}// ${node.data.label} (${node.data.kind})`)

    if (node.data.kind === 'input') {
      lines.push(`${ind}_r["${node.id}"] = __subInputs__`)
    } else if (node.data.kind === 'trigger') {
      lines.push(`${ind}_r["${node.id}"] = { triggered_at: inputs.triggered_at ?? new Date().toISOString() }`)
    } else if (node.data.kind === 'workflow') {
      const refId = node.data.workflowRef ?? ''
      if (ancestorIds.has(refId) || !node.data.workflowData) {
        lines.push(`${ind}_r["${node.id}"] = { error: 'Circular or missing workflow: ${node.data.workflowName ?? refId}' }`)
      } else {
        const newAncestors = new Set([...ancestorIds, refId])
        const deeperInd = ind + '  '
        const nestedLines = generateSubWorkflowIIFE(node.data.workflowData.nodes, node.data.workflowData.edges, newAncestors, deeperInd)
        lines.push(`${ind}async function ${fnId}(inputs) {`)
        lines.push(`${deeperInd}return await (async (__subInputs__) => {`)
        lines.push(...nestedLines)
        lines.push(`${deeperInd}})(inputs)`)
        lines.push(`${ind}}`)
        const sources = inputSources.get(node.id)
        const inputParts: string[] = []
        if (sources) {
          for (const [targetHandle, { srcId, handle }] of sources) {
            const ref = `_r["${srcId}"]`
            inputParts.push(`"${targetHandle}": ${ref}?.["${handle}"] ?? ${ref}`)
          }
        }
        lines.push(`${ind}_r["${node.id}"] = await ${fnId}({ ${inputParts.join(', ')} })`)
      }
    } else {
      lines.push(`${ind}async function ${fnId}(inputs) {`)
      emitNodeBodyLines(node, mcpSources, systemPromptSources, lines, ind + '  ')
      lines.push(`${ind}}`)
      const sources = inputSources.get(node.id)
      const inputParts: string[] = []
      if (node.data.kind !== 'ui' && sources) {
        for (const [targetHandle, { srcId, handle }] of sources) {
          const ref = `_r["${srcId}"]`
          inputParts.push(`"${targetHandle}": ${ref}?.["${handle}"] ?? ${ref}`)
        }
      }
      // Inject system prompt from connected systemprompt node
      const spSrcId = systemPromptSources.get(node.id)
      if (spSrcId) {
        inputParts.push(`"__systemPrompt__": _r[${JSON.stringify(spSrcId)}]?.system_prompt`)
      }
      if (node.data.kind === 'ui') {
        lines.push(`${ind}_r["${node.id}"] = await ${fnId}({})`)
      } else {
        lines.push(`${ind}_r["${node.id}"] = await ${fnId}({ ${inputParts.join(', ')} })`)
      }
    }

    lines.push(``)
  }

  // Return from last output node, or last exec node
  const outputNodes = sorted.filter(n => n.data.kind === 'output')
  const returnNode = outputNodes.length > 0 ? outputNodes[outputNodes.length - 1] : sorted[sorted.length - 1]
  if (returnNode) {
    lines.push(`${ind}return _r["${returnNode.id}"]`)
  }

  return lines
}

// ─── Code Generation ─────────────────────────────────────────────────────────

/**
 * Generates a self-contained async JavaScript pipeline from the node graph.
 * The entry point is `runPipeline(initialInput)`.
 *
 * Each node becomes a named async function. Edges wire outputs to inputs.
 * Decision nodes produce multiple output branches by key.
 * Workflow nodes embed their sub-pipeline as an IIFE closure.
 */
export function generateCode(nodes: FlowNode[], edges: FlowEdge[]): string {
  if (nodes.length === 0) return '// Empty graph – no code generated'

  const sorted = topoSort(nodes, edges)

  // Build node-by-id map (includes mcp nodes for config lookup)
  const execIds = new Set(sorted.map(n => n.id))
  const { inputSources, mcpSources, systemPromptSources } = buildEdgeMaps(nodes, edges, execIds)

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

    if (node.data.kind === 'workflow') {
      if (!node.data.workflowData) {
        lines.push(`  return inputs`)
      } else {
        const ancestorIds = new Set<string>([node.data.workflowRef ?? ''])
        lines.push(`  // Sub-workflow: "${node.data.workflowName ?? 'Unknown'}"`)
        lines.push(`  return await (async (__subInputs__) => {`)
        const subLines = generateSubWorkflowIIFE(
          node.data.workflowData.nodes,
          node.data.workflowData.edges,
          ancestorIds,
          '    '
        )
        lines.push(...subLines)
        lines.push(`  })(inputs)`)
      }
    } else {
      emitNodeBodyLines(node, mcpSources, systemPromptSources, lines, '  ')
    }

    lines.push(`}`)
    lines.push(``)
  }

  // Emit the orchestrator
  lines.push(`// ── Pipeline Orchestrator ──`)
  lines.push(`async function runPipeline(initialInput) {`)
  lines.push(`  const results = {}`)
  lines.push(`  const __trace__ = []`)
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
          // Always include a fallback to the full result for both explicit and implicit edges.
          // If the source node returns an object without the expected handle key, the downstream
          // node receives the whole object rather than undefined.
          inputParts.push(`"${targetHandle}": ${srcFn}?.["${handle}"] ?? ${srcFn}`)
        }
      }
      // If this node has a connected system prompt node, inject it as __systemPrompt__
      const spSrcId = systemPromptSources.get(node.id)
      if (spSrcId) {
        inputParts.push(`"__systemPrompt__": results[${JSON.stringify(spSrcId)}]?.system_prompt`)
      }
      const inputsExpr = `{ ${inputParts.join(', ')} }`
      lines.push(`  results["${node.id}"] = await ${fnName}(${inputsExpr})`)
    }
    if (node.data.kind !== 'note') {
      lines.push(`  __trace__.push({ id: ${JSON.stringify(node.id)}, label: ${JSON.stringify(node.data.label)}, kind: ${JSON.stringify(node.data.kind)}, output: results["${node.id}"] })`)
    }
  }

  // Return last node's output alongside the trace
  const lastNode = sorted[sorted.length - 1]
  lines.push(``)
  lines.push(`  return { __result: results["${lastNode.id}"], __trace: __trace__ }`)
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
