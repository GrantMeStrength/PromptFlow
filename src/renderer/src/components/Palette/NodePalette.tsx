import React, { useState } from 'react'
import { Download, Cpu, Terminal, GitBranch, Upload, Layers, BookOpen, MessageSquare, FileText, ListChecks, Plug, StickyNote } from 'lucide-react'
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
  {
    kind: 'mcp',
    icon: <Plug size={18} />,
    label: 'MCP Server',
    desc: 'Provides tools to an LLM via MCP',
    color: 'text-teal-400',
    bg: 'bg-teal-900/30 border-teal-700/50 hover:border-teal-500',
  },
  {
    kind: 'note',
    icon: <StickyNote size={18} />,
    label: 'Sticky Note',
    desc: 'Free-floating annotation, optionally connectable',
    color: 'text-yellow-400',
    bg: 'bg-yellow-900/30 border-yellow-700/50 hover:border-yellow-500',
  },
]

// ─── Interaction node variants ───────────────────────────────────────────────

interface InteractionItem {
  uiKind: 'text' | 'file' | 'choice'
  icon: React.ReactNode
  label: string
  desc: string
  defaultLabel: string
  defaultOptions?: string[]
}

const interactionItems: InteractionItem[] = [
  {
    uiKind: 'text',
    icon: <MessageSquare size={18} />,
    label: 'Text Input',
    desc: 'Prompt user to enter text',
    defaultLabel: 'Enter your text:',
  },
  {
    uiKind: 'file',
    icon: <FileText size={18} />,
    label: 'File Upload',
    desc: 'Let user pick a file to read',
    defaultLabel: 'Choose a file:',
  },
  {
    uiKind: 'choice',
    icon: <ListChecks size={18} />,
    label: 'Multiple Choice',
    desc: 'Ask user to pick an option',
    defaultLabel: 'Choose an option:',
    defaultOptions: ['Option A', 'Option B', 'Option C'],
  },
]



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

  // ── HTTP ──────────────────────────────────────────────────────────────────
  {
    kind: 'function',
    label: 'HTTP GET',
    description: 'Fetches a URL and returns the response body as text or parsed JSON.',
    category: 'HTTP',
    color: 'text-cyan-400',
    data: {
      inputs: [{ name: 'url', type: 'string', description: 'URL to fetch' }],
      outputs: [{ name: 'result', type: 'any', description: 'Response body' }],
      code: `const res = await fetch(inputs.url)
if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)
const text = await res.text()
try { result = JSON.parse(text) } catch { result = text }`,
    },
  },
  {
    kind: 'function',
    label: 'HTTP POST',
    description: 'Posts JSON data to a URL and returns the response.',
    category: 'HTTP',
    color: 'text-cyan-400',
    data: {
      inputs: [{ name: 'url', type: 'string' }, { name: 'body', type: 'object', description: 'JSON body to send' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `const res = await fetch(inputs.url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(inputs.body)
})
if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)
const text = await res.text()
try { result = JSON.parse(text) } catch { result = text }`,
    },
  },

  // ── Utility ───────────────────────────────────────────────────────────────
  {
    kind: 'function',
    label: 'Template Fill',
    description: 'Fills {{variable}} placeholders in a template string from an inputs object.',
    category: 'Utility',
    color: 'text-slate-400',
    data: {
      inputs: [{ name: 'template', type: 'string', description: 'String with {{placeholder}} markers' }, { name: 'vars', type: 'object', description: 'Values to substitute' }],
      outputs: [{ name: 'result', type: 'string' }],
      code: `result = inputs.template.replace(/\\{\\{(\\w+)\\}\\}/g, (_, key) => inputs.vars?.[key] ?? '')`,
    },
  },
  {
    kind: 'function',
    label: 'Log',
    description: 'Passes value through unchanged and logs it — useful for debugging pipelines.',
    category: 'Utility',
    color: 'text-slate-400',
    data: {
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `console.log('[Log node]', JSON.stringify(inputs.value, null, 2))
result = inputs.value`,
    },
  },
  {
    kind: 'function',
    label: 'Merge Objects',
    description: 'Deep-merges two objects into one, with the second taking priority.',
    category: 'Utility',
    color: 'text-slate-400',
    data: {
      inputs: [{ name: 'base', type: 'object' }, { name: 'override', type: 'object' }],
      outputs: [{ name: 'result', type: 'object' }],
      code: `function deepMerge(a, b) {
  const out = { ...a }
  for (const k of Object.keys(b)) {
    out[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k])
      ? deepMerge(a[k], b[k]) : b[k]
  }
  return out
}
result = deepMerge(inputs.base || {}, inputs.override || {})`,
    },
  },

  // ── LLM (continued) ───────────────────────────────────────────────────────
  {
    kind: 'llm',
    label: 'Rewrite Tone',
    description: 'Rewrites text in a specified tone: formal, casual, friendly, or technical.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }, { name: 'tone', type: 'string', description: 'e.g. formal, casual, friendly, technical' }],
      outputs: [{ name: 'result', type: 'string' }],
      code: `const tone = inputs.tone || 'formal'
result = await callLLM('', \`Rewrite the following text in a \${tone} tone. Return only the rewritten text.\\n\\n\${inputs.text}\`)`,
    },
  },
  {
    kind: 'llm',
    label: 'Classify',
    description: 'Assigns text to one of a set of user-defined categories.',
    category: 'LLM',
    color: 'text-purple-400',
    data: {
      inputs: [{ name: 'text', type: 'string' }, { name: 'categories', type: 'string', description: 'Comma-separated list, e.g. "sports, politics, tech"' }],
      outputs: [{ name: 'result', type: 'string' }],
      code: `const cats = inputs.categories || 'positive, negative, neutral'
result = (await callLLM('', \`Classify the following text into exactly one of these categories: \${cats}.\\nReturn only the category name.\\n\\nText: \${inputs.text}\`)).trim()`,
    },
  },

  // ── Output (rich render) ──────────────────────────────────────────────────
  {
    kind: 'output',
    label: 'Bar Chart',
    description: 'Renders a bar chart from { labels: string[], values: number[] } or an array of { label, value } objects.',
    category: 'Output',
    color: 'text-rose-400',
    data: {
      inputs: [{ name: 'value', type: 'any', description: '{ labels, values } or [{ label, value }]' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `const raw = inputs.value
let labels, values
if (!raw) {
  labels = ['Alpha','Beta','Gamma','Delta']
  values = [42, 78, 35, 61]
} else if (Array.isArray(raw)) {
  labels = raw.map(function(d) { return String(d.label != null ? d.label : d.name != null ? d.name : d.key != null ? d.key : '') })
  values = raw.map(function(d) { return Number(d.value != null ? d.value : d.count != null ? d.count : d.n != null ? d.n : 0) })
} else {
  labels = Array.isArray(raw.labels) ? raw.labels : []
  values = Array.isArray(raw.values) ? raw.values.map(Number) : []
}
if (labels.length === 0) { labels = ['No data']; values = [0] }
const allVals = values.concat([1])
let max = allVals[0]
for (let i = 1; i < allVals.length; i++) { if (allVals[i] > max) max = allVals[i] }
const W = 460, H = 180
const barW = Math.max(16, Math.floor((W - 40) / labels.length) - 8)
const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6']
let bars = ''
for (let i = 0; i < labels.length; i++) {
  const bh = Math.max(2, Math.round((values[i] / max) * H))
  const x = 20 + i * (barW + 8)
  const y = H - bh + 30
  const c = colors[i % colors.length]
  bars += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + bh + '" rx="3" fill="' + c + '" opacity="0.9"/>'
  bars += '<text x="' + (x + barW/2) + '" y="' + (y - 5) + '" text-anchor="middle" fill="#e2e8f0" font-size="11">' + values[i] + '</text>'
  bars += '<text x="' + (x + barW/2) + '" y="' + (H + 48) + '" text-anchor="middle" fill="#94a3b8" font-size="11">' + labels[i] + '</text>'
}
result = { __html: '<div style="background:#0f0f1a;padding:16px;border-radius:8px"><svg width="' + W + '" height="' + (H+60) + '" xmlns="http://www.w3.org/2000/svg"><line x1="20" y1="30" x2="20" y2="' + (H+30) + '" stroke="#2a2a3f" stroke-width="1"/><line x1="20" y1="' + (H+30) + '" x2="' + (W-20) + '" y2="' + (H+30) + '" stroke="#2a2a3f" stroke-width="1"/>' + bars + '</svg></div>' }`,
    },
  },
  {
    kind: 'output',
    label: 'Table Output',
    description: 'Renders an array of objects as an HTML table, or parses a CSV string.',
    category: 'Output',
    color: 'text-rose-400',
    data: {
      inputs: [{ name: 'value', type: 'any', description: 'Array of objects or CSV string' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `let rows = inputs.value
if (typeof rows === 'string') {
  const lines = rows.trim().split('\\n')
  const headers = lines[0].split(',').map(h => h.trim())
  rows = lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()]))
  })
}
if (!Array.isArray(rows) || rows.length === 0) { result = { __html: '<p style="color:#94a3b8">No data</p>' }; return }
const cols = Object.keys(rows[0])
const th = cols.map(c => \`<th style="padding:6px 12px;text-align:left;border-bottom:1px solid #2a2a3f;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.05em">\${c}</th>\`).join('')
const trs = rows.map((r, i) => {
  const bg = i % 2 === 0 ? '#0f0f1a' : '#13131f'
  const tds = cols.map(c => \`<td style="padding:6px 12px;border-bottom:1px solid #1e1e2e;color:#e2e8f0;font-size:12px">\${r[c] ?? ''}</td>\`).join('')
  return \`<tr style="background:\${bg}">\${tds}</tr>\`
}).join('')
result = { __html: \`<div style="overflow:auto;border-radius:8px;border:1px solid #2a2a3f">
  <table style="border-collapse:collapse;width:100%;font-family:monospace">
    <thead><tr>\${th}</tr></thead>
    <tbody>\${trs}</tbody>
  </table>
</div>\` }`,
    },
  },
  {
    kind: 'output',
    label: 'JSON Viewer',
    description: 'Renders any JSON value with syntax highlighting.',
    category: 'Output',
    color: 'text-rose-400',
    data: {
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `function highlight(json) {
  return json
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, m => {
      let c = '#6366f1'
      if (/^"/.test(m)) c = /:$/.test(m) ? '#8b5cf6' : '#10b981'
      else if (/true|false/.test(m)) c = '#f59e0b'
      else if (/null/.test(m)) c = '#94a3b8'
      return \`<span style="color:\${c}">\${m}</span>\`
    })
}
const formatted = JSON.stringify(inputs.value, null, 2)
result = { __html: \`<div style="background:#0a0a14;border-radius:8px;padding:16px;overflow:auto">
  <pre style="margin:0;font-size:12px;line-height:1.6;color:#e2e8f0;font-family:monospace">\${highlight(formatted)}</pre>
</div>\` }`,
    },
  },
  {
    kind: 'output',
    label: 'Card Output',
    description: 'Displays a styled card with a title and body text — great for summaries.',
    category: 'Output',
    color: 'text-rose-400',
    data: {
      inputs: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string' }],
      outputs: [{ name: 'result', type: 'any' }],
      code: `const title = inputs.title || 'Result'
const body = inputs.body || String(inputs.value ?? '')
const paragraphs = body.split('\\n\\n').filter(Boolean)
  .map(p => \`<p style="margin:0 0 12px;color:#cbd5e1;font-size:13px;line-height:1.7">\${p}</p>\`).join('')
result = { __html: \`<div style="background:linear-gradient(135deg,#13131f,#1a1a2e);border:1px solid #2a2a3f;border-radius:12px;padding:20px 24px;max-width:600px">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6366f1;margin-bottom:8px;font-weight:600">Result</div>
  <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">\${title}</h2>
  <div>\${paragraphs}</div>
</div>\` }`,
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

  const handleAddInteraction = (item: InteractionItem) => {
    const x = 350 + Math.random() * 100
    const y = 150 + Math.random() * 150
    const node = addNode('ui', { x, y }, {
      label: item.label,
      uiKind: item.uiKind,
      uiLabel: item.defaultLabel,
      uiOptions: item.defaultOptions,
    })
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

          {/* Interaction nodes */}
          <div className="px-1 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-600">
            Interaction
          </div>
          {interactionItems.map((item) => (
            <button
              key={item.uiKind}
              onClick={() => handleAddInteraction(item)}
              className="flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer bg-fuchsia-900/30 border-fuchsia-700/50 hover:border-fuchsia-500"
            >
              <span className="text-fuchsia-400 shrink-0 mt-0.5">{item.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fuchsia-400">{item.label}</div>
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
