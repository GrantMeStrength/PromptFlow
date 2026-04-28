import React, { useState } from 'react'
import { Download, Cpu, Terminal, GitBranch, Upload, Layers, BookOpen } from 'lucide-react'
import type { NodeKind, NodeData } from '../../types'
import { useFlowStore } from '../../store/flowStore'

// ─── Palette: blank node types ───────────────────────────────────────────────

interface PaletteItem {
  kind: NodeKind
  icon: React.ReactNode
  label: string
  desc: string
  color: string
  bg: string
}

const paletteItems: PaletteItem[] = [
  {
    kind: 'input',
    icon: <Download size={18} />,
    label: 'Input',
    desc: 'Receive data into the pipeline',
    color: 'text-blue-400',
    bg: 'bg-blue-900/30 border-blue-700/50 hover:border-blue-500',
  },
  {
    kind: 'function',
    icon: <Cpu size={18} />,
    label: 'Function',
    desc: 'Pure transform / computation',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/30 border-emerald-700/50 hover:border-emerald-500',
  },
  {
    kind: 'llm',
    icon: <Terminal size={18} />,
    label: 'LLM Call',
    desc: 'Language model prompt',
    color: 'text-purple-400',
    bg: 'bg-purple-900/30 border-purple-700/50 hover:border-purple-500',
  },
  {
    kind: 'decision',
    icon: <GitBranch size={18} />,
    label: 'Decision',
    desc: 'Branch on a condition',
    color: 'text-amber-400',
    bg: 'bg-amber-900/30 border-amber-700/50 hover:border-amber-500',
  },
  {
    kind: 'output',
    icon: <Upload size={18} />,
    label: 'Output',
    desc: 'Collect final results',
    color: 'text-rose-400',
    bg: 'bg-rose-900/30 border-rose-700/50 hover:border-rose-500',
  },
]

// ─── Library: pre-built modules ──────────────────────────────────────────────

interface LibraryItem {
  kind: NodeKind
  label: string
  description: string
  category: string
  color: string
  data: Partial<NodeData>
}

const libraryItems: LibraryItem[] = [
  // ── Text processing ────────────────────────────────────────────────────────
  {
    kind: 'function',
    label: 'Word Count',
    description: 'Counts words, characters, and sentences in text.',
    category: 'Text',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'text', type: 'string', description: 'Input text' }],
      outputs: [{ name: 'result', type: 'object', description: 'Word/char/sentence counts' }],
      code: `const words = inputs.text.trim().split(/\\s+/).filter(Boolean)
const sentences = inputs.text.split(/[.!?]+/).filter(s => s.trim())
result = { words: words.length, characters: inputs.text.length, sentences: sentences.length }`,
    },
  },
  {
    kind: 'function',
    label: 'Extract Keywords',
    description: 'Extracts the top keywords from text by frequency.',
    category: 'Text',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'array', description: 'Top keywords' }],
      code: `const stopwords = new Set(['the','a','an','is','in','it','of','to','and','or','for','on','with','that','this','was','are','be'])
const freq = {}
inputs.text.toLowerCase().replace(/[^a-z\\s]/g,'').split(/\\s+/).forEach(w => {
  if (w.length > 3 && !stopwords.has(w)) freq[w] = (freq[w] || 0) + 1
})
result = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10).map(([word]) => word)`,
    },
  },
  {
    kind: 'function',
    label: 'Clean Text',
    description: 'Strips HTML tags, trims whitespace, normalises line breaks.',
    category: 'Text',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'string' }],
      code: `result = inputs.text
  .replace(/<[^>]+>/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim()`,
    },
  },
  {
    kind: 'function',
    label: 'Split Sentences',
    description: 'Splits a paragraph into an array of sentences.',
    category: 'Text',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'array' }],
      code: `result = inputs.text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) ?? [inputs.text]`,
    },
  },

  // ── LLM tasks ─────────────────────────────────────────────────────────────
  {
    kind: 'llm',
    label: 'Summarise',
    description: 'Condenses text into a concise summary.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'string' }],
      llmPromptTemplate: 'Summarise the following text in 2-3 sentences:\n\n{{text}}',
      code: `result = await callLLM('', \`Summarise the following text in 2-3 sentences:\\n\\n\${inputs.text}\`)`,
    },
  },
  {
    kind: 'llm',
    label: 'Sentiment',
    description: 'Classifies text as Positive, Negative, or Neutral.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'string' }],
      llmPromptTemplate: 'Classify the sentiment of this text as exactly one word: Positive, Negative, or Neutral.\n\nText: {{text}}\n\nSentiment:',
      code: `result = (await callLLM('', \`Classify the sentiment of this text as exactly one word: Positive, Negative, or Neutral.\\n\\nText: \${inputs.text}\\n\\nSentiment:\`)).trim()`,
    },
  },
  {
    kind: 'llm',
    label: 'Translate',
    description: 'Translates text to a target language.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }, { name: 'language', type: 'string' }],
      outputs: [{ name: 'result', type: 'string' }],
      llmPromptTemplate: 'Translate the following text to {{language}}. Return only the translation.\n\n{{text}}',
      code: `const lang = inputs.language || 'Spanish'
result = await callLLM('', \`Translate the following text to \${lang}. Return only the translation.\\n\\n\${inputs.text}\`)`,
    },
  },
  {
    kind: 'llm',
    label: 'Extract JSON',
    description: 'Extracts structured data from unstructured text as JSON.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }, { name: 'schema', type: 'string' }],
      outputs: [{ name: 'result', type: 'object' }],
      code: `const schema = inputs.schema || '{ "name": "", "date": "", "amount": "" }'
const raw = await callLLM('', \`Extract data from the text below as JSON matching this schema: \${schema}\\n\\nText: \${inputs.text}\\n\\nReturn only valid JSON.\`)
try { result = JSON.parse(raw.match(/\\{[\\s\\S]*\\}/)?.[0] ?? '{}') } catch { result = { error: 'Parse failed', raw } }`,
    },
  },

  // ── Data ──────────────────────────────────────────────────────────────────
  {
    kind: 'function',
    label: 'JSON Parse',
    description: 'Parses a JSON string into an object.',
    category: 'Data',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'result', type: 'object' }],
      code: `try { result = JSON.parse(inputs.text) } catch(e) { result = { error: e.message } }`,
    },
  },
  {
    kind: 'function',
    label: 'JSON Stringify',
    description: 'Converts an object to a pretty-printed JSON string.',
    category: 'Data',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'result', type: 'string' }],
      code: `result = JSON.stringify(inputs.value, null, 2)`,
    },
  },
  {
    kind: 'function',
    label: 'Filter Array',
    description: 'Filters an array, keeping items that match a substring.',
    category: 'Data',
    color: 'text-emerald-400',
    data: {
      inputs: [{ name: 'items', type: 'array' }, { name: 'query', type: 'string' }],
      outputs: [{ name: 'result', type: 'array' }],
      code: `const q = (inputs.query || '').toLowerCase()
result = (inputs.items || []).filter(item => String(item).toLowerCase().includes(q))`,
    },
  },

  // ── Decision ──────────────────────────────────────────────────────────────
  {
    kind: 'decision',
    label: 'Length Check',
    description: 'Routes to "long" if text exceeds a threshold, else "short".',
    category: 'Logic',
    color: 'text-amber-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }, { name: 'threshold', type: 'number' }],
      outputs: [{ name: 'long', type: 'string' }, { name: 'short', type: 'string' }],
      branches: ['long', 'short'],
      code: `const limit = inputs.threshold || 200
if (inputs.text.length > limit) result = { long: inputs.text }
else result = { short: inputs.text }`,
    },
  },
  {
    kind: 'decision',
    label: 'Sentiment Route',
    description: 'Routes text based on Positive / Negative / Neutral sentiment label.',
    category: 'Logic',
    color: 'text-amber-400',
    data: {
      inputs: [{ name: 'sentiment', type: 'string' }, { name: 'text', type: 'string' }],
      outputs: [{ name: 'positive', type: 'string' }, { name: 'negative', type: 'string' }, { name: 'neutral', type: 'string' }],
      branches: ['positive', 'negative', 'neutral'],
      code: `const s = (inputs.sentiment || '').toLowerCase()
if (s.includes('positive')) result = { positive: inputs.text }
else if (s.includes('negative')) result = { negative: inputs.text }
else result = { neutral: inputs.text }`,
    },
  },
]

const categories = [...new Set(libraryItems.map(i => i.category))]

// ─── Component ────────────────────────────────────────────────────────────────

export function NodePalette() {
  const [tab, setTab] = useState<'nodes' | 'library'>('nodes')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const { addNode, selectNode, updateNodeData } = useFlowStore()

  const handleAdd = (kind: NodeKind) => {
    const x = 350 + Math.random() * 100
    const y = 150 + Math.random() * 150
    const node = addNode(kind, { x, y })
    selectNode(node.id)
  }

  const handleAddLibrary = (item: LibraryItem) => {
    const x = 350 + Math.random() * 100
    const y = 150 + Math.random() * 150
    const node = addNode(item.kind, { x, y })
    updateNodeData(node.id, { label: item.label, description: item.description, ...item.data } as Partial<NodeData>)
    selectNode(node.id)
  }

  return (
    <aside className="w-56 bg-[#13131f] border-r border-[#2a2a3f] flex flex-col overflow-hidden">
      {/* Header + tabs */}
      <div className="border-b border-[#2a2a3f]">
        <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-widest text-slate-500">Palette</div>
        <div className="flex">
          <button
            onClick={() => setTab('nodes')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === 'nodes'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Layers size={13} /> Nodes
          </button>
          <button
            onClick={() => setTab('library')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === 'library'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <BookOpen size={13} /> Library
          </button>
        </div>
      </div>

      {/* Nodes tab */}
      {tab === 'nodes' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {paletteItems.map((item) => (
            <button
              key={item.kind}
              onClick={() => handleAdd(item.kind)}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${item.bg}`}
            >
              <span className={`${item.color} shrink-0 mt-0.5`}>{item.icon}</span>
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${item.color}`}>{item.label}</div>
                <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
              </div>
            </button>
          ))}
          <div className="px-1 pt-2 text-[10px] text-slate-600 leading-relaxed">
            Click to add a blank node, then connect ports by dragging.
          </div>
        </div>
      )}

      {/* Library tab */}
      {tab === 'library' && (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {categories.map((cat) => {
            const items = libraryItems.filter(i => i.category === cat)
            const isOpen = expandedCategory === cat
            return (
              <div key={cat} className="rounded-lg overflow-hidden border border-[#2a2a3f]">
                {/* Category header */}
                <button
                  onClick={() => setExpandedCategory(isOpen ? null : cat)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-[#1a1a2e] hover:bg-[#1f1f35] transition-colors text-left"
                >
                  <span className="text-xs font-semibold text-slate-300">{cat}</span>
                  <span className="text-[10px] text-slate-600">{isOpen ? '▲' : '▼'}</span>
                </button>
                {/* Items */}
                {isOpen && (
                  <div className="flex flex-col divide-y divide-[#2a2a3f]">
                    {items.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleAddLibrary(item)}
                        className="flex items-start gap-2 px-3 py-2 bg-[#13131f] hover:bg-[#1a1a2e] transition-colors text-left group"
                      >
                        <span className={`${item.color} shrink-0 mt-0.5 text-[10px]`}>▶</span>
                        <div className="min-w-0">
                          <div className={`text-xs font-medium ${item.color} group-hover:brightness-125`}>{item.label}</div>
                          <div className="text-[10px] text-slate-600 leading-tight mt-0.5">{item.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div className="px-1 pt-2 text-[10px] text-slate-600 leading-relaxed">
            Pre-built modules with working code. Click to add to canvas.
          </div>
        </div>
      )}
    </aside>
  )
}
