import type { FlowProject } from '../types'

/**
 * Demo: IQ Comparison Bar Chart
 * User uploads a document. An LLM estimates the author's IQ from the writing
 * style (returns strict JSON). A function node renders an HTML bar chart
 * comparing the estimated IQ against those of recent US presidents.
 *
 * Flow:
 *   [File Upload] ──► [LLM: Estimate IQ (JSON mode)] ──► [Fn: Build Chart] ──► [Output: HTML Chart]
 */
export const iqChartProject: FlowProject = {
  id: 'demo-iq-chart-v1',
  name: 'IQ Comparison Chart',
  description:
    'Upload a document. An LLM estimates the author\'s IQ from their writing and renders a bar chart comparing it to fictional leaders.',
  version: '1',
  created: '2026-05-02T00:00:00.000Z',
  updated: '2026-05-02T00:00:00.000Z',
  nodes: [
    {
      id: 'note-intro',
      type: 'note',
      position: { x: 60, y: -160 },
      data: {
        label: 'IQ Comparison Chart',
        kind: 'note',
        description: '',
        inputs: [],
        outputs: [],
        code: '',
        prompt: '',
        noteText:
          'Upload a text document. The LLM analyses the writing style and estimates the author\'s IQ as a JSON number. ' +
          'A function node compares that estimate against fictional leaders (J. Bartlet, T. Shepard, D. Selina, F. Underwood, M. Douglas) ' +
          'and renders a colour-coded HTML bar chart. ' +
          'The LLM node uses JSON mode to guarantee a parseable numeric response.',
      },
    },
    {
      id: 'ui-upload',
      type: 'ui',
      position: { x: 60, y: 120 },
      data: {
        label: 'Upload Document',
        kind: 'ui',
        uiKind: 'file',
        uiLabel: 'Upload a text document to analyse:',
        uiAccept: '.txt,.md,.pdf',
        description: 'Upload a text file. The content will be analysed to estimate the author\'s IQ.',
        inputs: [],
        outputs: [{ name: 'content', type: 'string', description: 'Full file content' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'llm-estimate',
      type: 'llm',
      position: { x: 360, y: 120 },
      data: {
        label: 'Estimate IQ',
        kind: 'llm',
        llmModel: 'gpt-4o-mini',
        llmJsonMode: true,
        llmPromptTemplate:
          'Analyse the vocabulary, sentence structure, reasoning complexity, and writing style of the following text to estimate the IQ of its author.\n\n' +
          'Consider: average word length, use of subordinate clauses, technical vocabulary, logical flow, and abstraction level.\n\n' +
          'Return ONLY a JSON object in exactly this format — no explanation, no other text:\n' +
          '{"iq": <integer between 70 and 160>, "reasoning": "<one short sentence explaining the estimate>"}\n\n' +
          'Document:\n{{text}}',
        description: 'Uses JSON mode to return a numeric IQ estimate for the document\'s author.',
        inputs: [{ name: 'text', type: 'string', description: 'Document content' }],
        outputs: [{ name: 'value', type: 'string', description: 'JSON with iq and reasoning' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'fn-chart',
      type: 'function',
      position: { x: 680, y: 120 },
      data: {
        label: 'Build IQ Chart',
        kind: 'function',
        description: 'Parses the LLM JSON response and renders an HTML bar chart comparing the user\'s IQ to recent US presidents.',
        inputs: [{ name: 'value', type: 'string', description: 'JSON from LLM: {iq, reasoning}' }],
        outputs: [{ name: '__html', type: 'string', description: 'Rendered HTML chart' }],
        code: `// Parse the LLM JSON response
let raw = inputs.value || ''
if (typeof raw === 'object') raw = JSON.stringify(raw)
let parsed
try { parsed = JSON.parse(raw) } catch(e) {
  // Try to extract a number if JSON failed
  const m = raw.match(/\\b(\\d{2,3})\\b/)
  parsed = { iq: m ? Number(m[1]) : 100, reasoning: 'Could not parse LLM response.' }
}

const userIQ = Math.min(Math.max(Math.round(Number(parsed.iq) || 100), 70), 200)
const reasoning = String(parsed.reasoning || '')

// Comparison data
const items = [
  { label: 'You',        value: userIQ, color: '#a855f7' },
  { label: 'J. Bartlet', value: 163, color: '#6366f1' },
  { label: 'T. Shepard', value: 138, color: '#10b981' },
  { label: 'D. Selina',  value: 124, color: '#f59e0b' },
  { label: 'F. Underwood', value: 131, color: '#ef4444' },
  { label: 'M. Douglas', value: 118, color: '#64748b' },
]

const max = Math.max(...items.map(d => d.value))
const rows = items.map(d => {
  const pct = Math.round(d.value / max * 100)
  const isYou = d.label === 'You'
  return \`<div style='display:flex;align-items:center;gap:10px;margin-bottom:10px'>
    <span style='width:70px;text-align:right;font-size:13px;color:\${isYou ? "#e2e8f0" : "#94a3b8"};font-weight:\${isYou ? "700" : "400"}'>\${d.label}</span>
    <div style='flex:1;background:#1e1b4b;border-radius:6px;overflow:hidden'>
      <div style='width:\${pct}%;background:\${d.color};height:30px;border-radius:6px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;transition:width 0.4s'>
        <span style='color:#fff;font-size:13px;font-weight:600'>\${d.value}</span>
      </div>
    </div>
  </div>\`
}).join('')

return { __html: \`
  <div style='font-family:system-ui,sans-serif;padding:24px;background:#0f0f1a;border-radius:12px;min-width:360px;max-width:560px'>
    <h2 style='color:#e2e8f0;font-size:16px;font-weight:600;margin:0 0 4px 0'>IQ Comparison</h2>
    <p style='color:#64748b;font-size:12px;margin:0 0 20px 0'>Fictional leaders — based on writing analysis (estimates only)</p>
    \${rows}
    <p style='color:#6366f1;font-size:12px;margin:20px 0 0 0;font-style:italic'>\${reasoning}</p>
  </div>
\` }`,
        prompt: 'Parse IQ JSON from LLM and render a styled HTML bar chart comparing user to US presidents',
      },
    },
    {
      id: 'output-chart',
      type: 'output',
      position: { x: 1000, y: 120 },
      data: {
        label: 'IQ Chart',
        kind: 'output',
        description: 'Displays the IQ comparison bar chart.',
        inputs: [{ name: '__html', type: 'string', description: 'HTML chart markup' }],
        outputs: [],
        code: `return { __html: inputs.__html }`,
        prompt: 'Display the IQ comparison chart',
      },
    },
  ],
  edges: [
    {
      id: 'e-upload-llm',
      source: 'ui-upload',
      target: 'llm-estimate',
      sourceHandle: 'content',
      targetHandle: 'text',
      animated: true,
      type: 'gradient',
    },
    {
      id: 'e-llm-chart',
      source: 'llm-estimate',
      target: 'fn-chart',
      animated: true,
      type: 'gradient',
    },
    {
      id: 'e-chart-out',
      source: 'fn-chart',
      target: 'output-chart',
      sourceHandle: '__html',
      targetHandle: '__html',
      animated: true,
      type: 'gradient',
    },
  ],
}
