import React, { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { X, Trash2, ChevronDown, ChevronUp, Zap, RotateCcw, Loader2, ArrowRightLeft, Sparkles, BookMarked, FolderOpen, Plug, CheckCircle, AlertCircle } from 'lucide-react'
import { useFlowStore } from '../../store/flowStore'
import type { NodeKind, PortDef } from '../../types'

const REGEN_SYSTEM_PROMPT = `You are updating a single node in PromptFlow, a node-graph IDE.
The user has described what they want the node to do. Update the node accordingly.

Respond with ONLY a valid JSON object — no markdown, no explanation:
{
  "description": "string (one sentence describing what the node does)",
  "code": "string (complete, self-contained JS — see rules below)"
}

CODE RULES (critical — violations will cause runtime errors):
- Code runs inside an async function body in a Node.js VM sandbox.
- Available globals: Math, JSON, Array, Object, String, Number, Boolean, Set, Map, Date, Promise, RegExp, parseInt, parseFloat, isNaN, isFinite, console, callLLM.
- NO other globals, libraries, or helper functions exist. Do NOT call functions you have not defined in the code itself.
- Do NOT use: fetch, require, import, Buffer, process, setTimeout, or any DOM APIs.
- Do NOT call invented helpers like generateBarChart(), renderTable(), etc. Write the full implementation inline.
- Inputs come from the "inputs" object (e.g. inputs.text, inputs.value).
- Set the output by returning a value (e.g. return { result: 42 }) or assigning result = { ... }.
- Use explicit for-loops instead of spread in function calls (avoid Math.max(...arr); use a loop).
- For visualisations, return { __html: '<svg>...</svg>' } and the output panel will render it.
- LLM nodes use: const response = await callLLM('gpt-4o-mini', prompt); return { response }
- Code must be complete and runnable as-is — no placeholders, no TODO comments.`

const kindColors: Record<NodeKind, string> = {
  input: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  function: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  llm: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  decision: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  output: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  pipe: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  ui: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
}

function PortList({ ports, label }: { ports: PortDef[]; label: string }) {
  if (ports.length === 0) return null
  return (
    <div className="mb-3">
      <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">{label}</div>
      <div className="flex flex-col gap-1">
        {ports.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-indigo-300 bg-indigo-900/40 px-1.5 py-0.5 rounded">
              {p.name}
            </span>
            <span className="text-slate-500">{p.type}</span>
            {p.description && (
              <span className="text-slate-500 truncate">{p.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function NodeInspector() {
  const { nodes, edges, selectedNodeId, selectNode, updateNodeData, deleteNode, pendingPipeNodeId, clearPendingPipe } = useFlowStore()
  const [codeExpanded, setCodeExpanded] = useState(true)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState('')
  const [mcpTesting, setMcpTesting] = useState(false)
  const [mcpTestResult, setMcpTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const autoTriggered = useRef<string | null>(null)

  const node = nodes.find((n) => n.id === selectedNodeId)

  // Sync prompt field when selected node changes
  useEffect(() => {
    setRefinePrompt(node?.data.prompt ?? '')
    setRefineError('')
  }, [selectedNodeId])

  // Build the inputs context string (shared between normal regen and pipe auto-trigger)
  const buildInputsContext = useCallback((nodeId: string) => {
    const incomingEdges = edges.filter(e => e.target === nodeId)
    if (incomingEdges.length === 0) return 'No edges connected — inputs will be empty.'
    const parts = incomingEdges.map(e => {
      const src = nodes.find(n => n.id === e.source)
      if (!src) return null
      const targetHandle = e.targetHandle ?? 'value'
      const sourceHandle = e.sourceHandle ?? 'result'
      const codeLines = (src.data.code ?? '').split('\n')
      const snippet = codeLines.slice(-Math.min(8, codeLines.length)).join('\n').trim()
      return `inputs.${targetHandle} ← "${src.data.label}" (${src.data.kind}) output "${sourceHandle}"\n  Source returns:\n  ${snippet.replace(/\n/g, '\n  ')}`
    }).filter(Boolean)
    return parts.join('\n\n')
  }, [edges, nodes])

  const handleRegenerate = useCallback(async (overridePrompt?: string) => {
    if (!node) return
    const prompt = (overridePrompt ?? refinePrompt).trim()
    if (!prompt) return
    setRefining(true)
    setRefineError('')
    try {
      const inputsContext = buildInputsContext(node.id)

      // For pipe nodes, also include target node context so LLM knows what to produce
      let targetContext = ''
      if (node.data.kind === 'pipe' && node.data.pipeTargetId) {
        const targetNode = nodes.find(n => n.id === node.data.pipeTargetId)
        if (targetNode) {
          const tCodeLines = (targetNode.data.code ?? '').split('\n')
          const tSnippet = tCodeLines.slice(0, Math.min(6, tCodeLines.length)).join('\n').trim()
          targetContext = `\n\nTARGET NODE ("${targetNode.data.label}", ${targetNode.data.kind}) expects:\n  ${tSnippet.replace(/\n/g, '\n  ')}`
        }
      }

      const context = [
        `Current node: "${node.data.label}" (${node.data.kind})`,
        `Current description: "${node.data.description ?? ''}"`,
        ``,
        `INPUTS THIS NODE WILL RECEIVE AT RUNTIME:`,
        inputsContext,
        targetContext,
        ``,
        `Write code that uses EXACTLY these inputs.X keys — do NOT invent other input names.`,
      ].join('\n')

      const userMsg = `${context}\n\nUser request: ${prompt}`
      const res = await window.electronAPI?.callLLM(userMsg, REGEN_SYSTEM_PROMPT)
      if (!res?.success || !res.result) throw new Error(res?.error ?? 'LLM call failed')
      const parsed = JSON.parse(res.result)
      updateNodeData(node.id, {
        prompt,
        ...(parsed.description ? { description: parsed.description } : {}),
        ...(parsed.code ? { code: parsed.code } : {}),
      })
    } catch (err) {
      setRefineError((err as Error).message)
    }
    setRefining(false)
  }, [node, refinePrompt, buildInputsContext, nodes, updateNodeData])

  // Auto-trigger LLM for newly created pipe nodes
  useEffect(() => {
    if (!node || node.data.kind !== 'pipe') return
    if (pendingPipeNodeId !== node.id) return
    if (autoTriggered.current === node.id) return
    autoTriggered.current = node.id

    const sourceNode = nodes.find(n => n.id === node.data.pipeSourceId)
    const targetNode = nodes.find(n => n.id === node.data.pipeTargetId)
    if (!sourceNode || !targetNode) { clearPendingPipe(); return }

    const autoPrompt = `Map the output of "${sourceNode.data.label}" to what "${targetNode.data.label}" needs. Look at the source return value and restructure the data so the target can use it. Pass through unchanged if already compatible.`
    setRefinePrompt(autoPrompt)
    clearPendingPipe()
    handleRegenerate(autoPrompt)
  }, [pendingPipeNodeId, node, nodes, handleRegenerate, clearPendingPipe])

  if (!node) {
    return (
      <aside className="w-72 bg-[#13131f] border-l border-[#2a2a3f] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-4xl mb-3 opacity-30">⬡</div>
        <p className="text-slate-500 text-sm">Click a node to inspect it</p>
        <p className="text-slate-600 text-xs mt-1">
          Drag from the palette to add nodes
        </p>
      </aside>
    )
  }

  const { data } = node
  const kindColor = kindColors[data.kind] ?? kindColors.function

  // For pipe nodes: resolve source/target labels for the context banner
  const pipeSourceNode = data.kind === 'pipe' ? nodes.find(n => n.id === data.pipeSourceId) : null
  const pipeTargetNode = data.kind === 'pipe' ? nodes.find(n => n.id === data.pipeTargetId) : null

  return (
    <aside className="w-80 bg-[#13131f] border-l border-[#2a2a3f] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3f]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${kindColor} uppercase tracking-widest shrink-0 flex items-center gap-1`}>
            {data.kind === 'pipe' && <ArrowRightLeft size={9} />}
            {data.kind}
          </span>
          <input
            className="bg-transparent text-white text-sm font-semibold outline-none border-b border-transparent focus:border-indigo-500 min-w-0 truncate"
            value={data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </div>
        <button
          onClick={() => selectNode(null)}
          className="text-slate-500 hover:text-white shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Pipe connection context banner */}
      {data.kind === 'pipe' && pipeSourceNode && pipeTargetNode && (
        <div className="px-4 py-2.5 bg-cyan-950/50 border-b border-cyan-800/30 flex items-center gap-2 text-xs">
          <span className="text-slate-400 truncate max-w-[80px]">{pipeSourceNode.data.label}</span>
          <ArrowRightLeft size={12} className="text-cyan-400 shrink-0" />
          <span className="text-slate-400 truncate max-w-[80px]">{pipeTargetNode.data.label}</span>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Auto-generating banner */}
        {refining && data.kind === 'pipe' && (
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 rounded-lg px-3 py-2">
            <Sparkles size={12} className="animate-pulse shrink-0" />
            <span>Generating mapping code…</span>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
            Description
          </label>
          <textarea
            className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed"
            rows={4}
            value={data.description}
            onChange={(e) => updateNodeData(node.id, { description: e.target.value })}
          />
        </div>

        {/* Ports (hide for pipe — they're always value→value) */}
        {data.kind !== 'pipe' && (
          <>
            <PortList ports={data.inputs} label="Inputs" />
            <PortList ports={data.outputs} label="Outputs" />
          </>
        )}

        {/* LLM-specific fields */}
        {data.kind === 'llm' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                Prompt Template
              </label>
              <textarea
                className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed font-mono"
                rows={4}
                value={data.llmPromptTemplate ?? ''}
                onChange={(e) => updateNodeData(node.id, { llmPromptTemplate: e.target.value })}
              />
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[11px] text-slate-500">Model</label>
                <input
                  className="flex-1 bg-[#0f0f1a] text-slate-300 text-xs rounded px-2 py-1 border border-[#2a2a3f] focus:border-indigo-500 outline-none font-mono"
                  value={data.llmModel ?? ''}
                  onChange={(e) => updateNodeData(node.id, { llmModel: e.target.value })}
                />
              </div>
            </div>

            {/* Skills file */}
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                Skills File (System Prompt)
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const res = await window.electronAPI?.pickSkillsFile()
                    if (res?.success && res.filename && res.content !== undefined) {
                      updateNodeData(node.id, { llmSkillsFile: res.filename, llmSkillsContent: res.content })
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2a2a3f] hover:border-indigo-500 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                >
                  <FolderOpen size={12} />
                  {data.llmSkillsFile ? 'Change file' : 'Load .md file'}
                </button>
                {data.llmSkillsFile && (
                  <button
                    onClick={() => updateNodeData(node.id, { llmSkillsFile: undefined, llmSkillsContent: undefined })}
                    className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                    title="Remove skills file"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {data.llmSkillsFile && (
                <div className="mt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BookMarked size={11} className="text-indigo-400" />
                    <span className="text-[11px] text-indigo-300 font-medium">{data.llmSkillsFile}</span>
                  </div>
                  <textarea
                    className="w-full bg-[#0a0a14] text-slate-400 text-[11px] rounded-lg p-2 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed font-mono"
                    rows={5}
                    value={data.llmSkillsContent ?? ''}
                    onChange={(e) => updateNodeData(node.id, { llmSkillsContent: e.target.value })}
                    placeholder="Skills / system prompt content…"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    Injected as the system prompt. Use <code className="text-indigo-400">llmSystemPrompt</code> in your node code.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* UI-node-specific fields */}
        {data.kind === 'ui' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                Input Type
              </label>
              <div className="flex gap-2">
                {(['text', 'file', 'choice'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => updateNodeData(node.id, { uiKind: k })}
                    className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors capitalize ${
                      data.uiKind === k
                        ? 'border-fuchsia-500 bg-fuchsia-900/40 text-fuchsia-300'
                        : 'border-[#2a2a3f] text-slate-500 hover:border-fuchsia-700'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                Question / Label
              </label>
              <input
                className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg px-2.5 py-2 border border-[#2a2a3f] focus:border-fuchsia-500 outline-none"
                value={data.uiLabel ?? ''}
                placeholder="Enter your text:"
                onChange={(e) => updateNodeData(node.id, { uiLabel: e.target.value })}
              />
            </div>
            {data.uiKind === 'text' && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                  Placeholder
                </label>
                <input
                  className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg px-2.5 py-2 border border-[#2a2a3f] focus:border-fuchsia-500 outline-none"
                  value={data.uiPlaceholder ?? ''}
                  placeholder="Type here…"
                  onChange={(e) => updateNodeData(node.id, { uiPlaceholder: e.target.value })}
                />
              </div>
            )}
            {data.uiKind === 'file' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                    Accepted File Types
                  </label>
                  <input
                    className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg px-2.5 py-2 border border-[#2a2a3f] focus:border-fuchsia-500 outline-none font-mono"
                    value={data.uiAccept ?? ''}
                    placeholder=".txt,.md,.pdf"
                    onChange={(e) => updateNodeData(node.id, { uiAccept: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div
                    onClick={() => updateNodeData(node.id, { uiMultiple: !data.uiMultiple })}
                    className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                      data.uiMultiple ? 'bg-fuchsia-600' : 'bg-[#2a2a3f]'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                      data.uiMultiple ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </div>
                  <span className="text-xs text-slate-400">Allow multiple files</span>
                </label>
              </div>
            )}
            {data.uiKind === 'choice' && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-slate-500 block mb-1.5">
                  Options (one per line)
                </label>
                <textarea
                  className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-fuchsia-500 outline-none resize-none leading-relaxed"
                  rows={4}
                  value={(data.uiOptions ?? []).join('\n')}
                  placeholder={"Option A\nOption B\nOption C"}
                  onChange={(e) =>
                    // Preserve raw lines (including blanks) while typing so Enter works
                    updateNodeData(node.id, { uiOptions: e.target.value.split('\n') })
                  }
                  onBlur={(e) =>
                    // Clean up on blur: trim whitespace and remove blank lines
                    updateNodeData(node.id, {
                      uiOptions: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* MCP Server Configuration */}
        {data.kind === 'mcp' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-teal-500 mb-1">
              <Plug size={11} />
              MCP Server Config
            </div>

            {/* Command */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Command</label>
              <input
                className="w-full bg-[#0f0f1a] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-[#2a2a3f] focus:border-teal-500 outline-none font-mono"
                placeholder="e.g. npx"
                value={data.mcpCommand ?? ''}
                onChange={(e) => updateNodeData(node.id, { mcpCommand: e.target.value })}
              />
            </div>

            {/* Args */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Arguments (one per line)</label>
              <textarea
                className="w-full bg-[#0f0f1a] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-[#2a2a3f] focus:border-teal-500 outline-none font-mono resize-none"
                rows={4}
                placeholder={`-y\n@modelcontextprotocol/server-filesystem\n/Users/john/Documents`}
                value={data.mcpArgs ?? ''}
                onChange={(e) => updateNodeData(node.id, { mcpArgs: e.target.value })}
              />
            </div>

            {/* Env */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Environment variables (KEY=value per line)</label>
              <textarea
                className="w-full bg-[#0f0f1a] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-[#2a2a3f] focus:border-teal-500 outline-none font-mono resize-none"
                rows={3}
                placeholder="BRAVE_API_KEY=sk-..."
                value={data.mcpEnv ?? ''}
                onChange={(e) => updateNodeData(node.id, { mcpEnv: e.target.value })}
              />
            </div>

            {/* Test Connection */}
            <button
              onClick={async () => {
                setMcpTesting(true)
                setMcpTestResult(null)
                try {
                  const args = (data.mcpArgs ?? '').split('\n').map(s => s.trim()).filter(Boolean)
                  const env: Record<string, string> = {}
                  for (const line of (data.mcpEnv ?? '').split('\n')) {
                    const idx = line.indexOf('=')
                    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
                  }
                  const result = await window.electronAPI.testMcpConnection({
                    command: data.mcpCommand ?? '',
                    args,
                    env,
                  })
                  updateNodeData(node.id, { mcpTools: result.tools })
                  setMcpTestResult({ ok: true, message: `Connected — ${result.tools.length} tool${result.tools.length !== 1 ? 's' : ''} discovered` })
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err)
                  setMcpTestResult({ ok: false, message: msg })
                } finally {
                  setMcpTesting(false)
                }
              }}
              disabled={mcpTesting || !data.mcpCommand?.trim()}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors w-full justify-center"
            >
              {mcpTesting ? (
                <><Loader2 size={12} className="animate-spin" /> Testing connection…</>
              ) : (
                <><Plug size={12} /> Test Connection</>
              )}
            </button>

            {mcpTestResult && (
              <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${mcpTestResult.ok ? 'bg-teal-900/40 text-teal-300' : 'bg-red-900/40 text-red-300'}`}>
                {mcpTestResult.ok ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
                {mcpTestResult.message}
              </div>
            )}

            {/* Tool list */}
            {(data.mcpTools ?? []).length > 0 && (
              <div>
                <div className="text-[11px] text-slate-500 uppercase tracking-widest mb-1.5">Available Tools</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(data.mcpTools ?? []).map((tool) => (
                    <div key={tool.name} className="bg-teal-900/20 border border-teal-800/40 rounded-lg px-2.5 py-2">
                      <div className="text-xs font-semibold text-teal-300 font-mono">{tool.name}</div>
                      {tool.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{tool.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Code (hide for UI and MCP nodes) */}
        {data.kind !== 'ui' && data.kind !== 'mcp' && (
        <div>
          <button
            className="flex items-center justify-between w-full text-[11px] uppercase tracking-widest text-slate-500 mb-1.5"
            onClick={() => setCodeExpanded((v) => !v)}
          >
            <span>Generated Code</span>
            {codeExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {codeExpanded && (
            <div className="rounded-lg overflow-hidden border border-[#2a2a3f]">
              <Editor
                height="200px"
                defaultLanguage="javascript"
                value={data.code}
                onChange={(v) => updateNodeData(node.id, { code: v ?? '' })}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 11,
                  lineNumbers: 'off',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  folding: false,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
          )}
        </div>
        )}

        {/* Prompt / Regenerate (hide for UI and MCP nodes) */}
        {data.kind !== 'ui' && data.kind !== 'mcp' && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-slate-500 mb-1.5">
              <Zap size={11} />
              {data.kind === 'pipe' ? 'Mapping Prompt' : 'Prompt'}
            </div>
            <textarea
              className="w-full bg-[#0f0f1a] text-slate-300 text-xs rounded-lg p-2.5 border border-[#2a2a3f] focus:border-indigo-500 outline-none resize-none leading-relaxed font-mono"
              rows={3}
              placeholder={
                data.kind === 'pipe'
                  ? 'Describe how to map the data…'
                  : 'Describe what this node should do…'
              }
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRegenerate()
              }}
            />
            <button
              onClick={() => handleRegenerate()}
              disabled={refining || !refinePrompt.trim()}
              className="mt-1.5 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors w-full justify-center"
            >
              {refining ? (
                <><Loader2 size={12} className="animate-spin" /> Regenerating…</>
              ) : (
                <><RotateCcw size={12} /> Regenerate node</>
              )}
            </button>
            {refineError && (
              <p className="mt-1.5 text-[11px] text-red-400">{refineError}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#2a2a3f]">
        <button
          onClick={() => deleteNode(node.id)}
          className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 size={13} />
          Delete node
        </button>
      </div>
    </aside>
  )
}
