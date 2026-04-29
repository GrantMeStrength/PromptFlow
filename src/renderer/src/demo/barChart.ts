import type { FlowProject } from '../types'

/**
 * Demo: Survey Bar Chart
 * User provides survey topic and a comma-separated list of options.
 * An LLM generates plausible response percentages. A function node
 * builds an HTML bar chart from the data and returns { __html } so
 * the output panel renders it visually.
 *
 * Flow:
 *   [Text: Topic] ──┐
 *                   ├──► [LLM: Generate Data] ──► [Fn: Build Chart] ──► [Output: HTML Chart]
 *   [Text: Options] ┘
 */
export const barChartProject: FlowProject = {
  id: 'demo-bar-chart-v1',
  name: 'Survey Bar Chart',
  description:
    'Enter a survey topic and comma-separated options. The LLM generates realistic response percentages and a function node renders them as an HTML bar chart.',
  version: '1',
  created: '2026-04-29T00:00:00.000Z',
  updated: '2026-04-29T00:00:00.000Z',
  nodes: [
    {
      id: 'ui-topic',
      type: 'ui',
      position: { x: 60, y: 120 },
      data: {
        label: 'Survey Topic',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'Survey question or topic:',
        uiPlaceholder: 'What is your favourite programming language?',
        description: 'The survey question or topic that the bar chart will visualise.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Survey topic text' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'ui-options',
      type: 'ui',
      position: { x: 60, y: 340 },
      data: {
        label: 'Survey Options',
        kind: 'ui',
        uiKind: 'text',
        uiLabel: 'Options (comma-separated):',
        uiPlaceholder: 'TypeScript, Python, Rust, Go, Java, Other',
        description: 'Comma-separated list of response options to include in the chart.',
        inputs: [],
        outputs: [{ name: 'value', type: 'string', description: 'Comma-separated options' }],
        code: '',
        prompt: '',
      },
    },
    {
      id: 'llm-data',
      type: 'llm',
      position: { x: 340, y: 230 },
      data: {
        label: 'Generate Survey Data',
        kind: 'llm',
        description:
          'Given the topic and options, generates realistic survey response percentages that sum to 100. Returns a JSON array of { label, value } objects.',
        inputs: [
          { name: 'topic', type: 'string', description: 'Survey question' },
          { name: 'options', type: 'string', description: 'Comma-separated options' },
        ],
        outputs: [{ name: 'data', type: 'string', description: 'JSON array of {label, value} objects' }],
        llmModel: 'gpt-4o-mini',
        llmPromptTemplate: `You are generating realistic survey data for visualisation.

Survey question: {{topic}}
Options: {{options}}

Assign a realistic percentage to each option. The percentages must sum to exactly 100.
Return ONLY a JSON array, no markdown, no explanation:
[{"label":"Option","value":42},...]`,
        code: `const topic = String(inputs.topic ?? '')
const options = String(inputs.options ?? '')
const prompt = llmPromptTemplate
  .replace('{{topic}}', topic)
  .replace('{{options}}', options)
const data = await callLLM(llmModel || 'gpt-4o-mini', prompt)
return { data }`,
        prompt: 'Generate realistic percentage data for a survey, returning JSON array of {label, value}',
      },
    },
    {
      id: 'fn-chart',
      type: 'function',
      position: { x: 640, y: 230 },
      data: {
        label: 'Build Bar Chart',
        kind: 'function',
        description:
          'Parses the LLM JSON data and renders an HTML bar chart with labelled horizontal bars and percentage values. Returns { __html } so the output panel renders it directly.',
        inputs: [
          { name: 'data', type: 'string', description: 'JSON array of {label, value} objects' },
          { name: 'topic', type: 'string', description: 'Chart title' },
        ],
        outputs: [{ name: '__html', type: 'string', description: 'Rendered HTML bar chart' }],
        code: `const raw = String(inputs.data ?? '')
const title = String(inputs.topic ?? 'Survey Results')
let rows = []
try {
  const cleaned = raw.replace(/^\`\`\`json?\\n?/i,'').replace(/\`\`\`$/,'').trim()
  rows = JSON.parse(cleaned)
} catch {
  return { __html: \`<p style="color:#f87171">Failed to parse chart data:<br><pre>\${raw}</pre></p>\` }
}
// Sort descending
rows.sort((a,b) => b.value - a.value)
const max = Math.max(...rows.map(r => r.value), 1)
const palette = ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#7c3aed','#4f46e5','#818cf8','#e879f9']
const bars = rows.map((r,i) => {
  const pct = Math.round((r.value / max) * 100)
  const color = palette[i % palette.length]
  return \`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="width:140px;text-align:right;font-size:13px;color:#cbd5e1;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\${r.label}">\${r.label}</div>
      <div style="flex:1;background:#1e1b4b;border-radius:4px;overflow:hidden">
        <div style="width:\${pct}%;background:\${color};height:28px;border-radius:4px;transition:width 0.4s ease;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">
          <span style="color:#fff;font-size:12px;font-weight:600;white-space:nowrap">\${r.value}%</span>
        </div>
      </div>
    </div>\`
}).join('')
const html = \`
  <div style="font-family:system-ui,sans-serif;padding:24px;background:#0f0f1a;border-radius:12px;min-width:360px">
    <h2 style="color:#e2e8f0;font-size:16px;font-weight:600;margin:0 0 20px 0;padding-bottom:12px;border-bottom:1px solid #2a2a3f">\${title}</h2>
    \${bars}
    <p style="color:#475569;font-size:11px;margin:16px 0 0 0;text-align:right">Generated by PromptFlow · \${rows.length} responses</p>
  </div>\`
return { __html: html }`,
        prompt: 'Parse survey data JSON and render a styled HTML horizontal bar chart',
      },
    },
    {
      id: 'output-chart',
      type: 'output',
      position: { x: 940, y: 230 },
      data: {
        label: 'Chart Output',
        kind: 'output',
        description:
          'Renders the HTML bar chart directly in the output panel. The { __html } return value triggers the HTML rendering mode.',
        inputs: [{ name: '__html', type: 'string', description: 'HTML bar chart markup' }],
        outputs: [],
        code: `return { __html: inputs.__html }`,
        prompt: 'Output the rendered HTML bar chart',
      },
    },
  ],
  edges: [
    { id: 'e-topic-llm', source: 'ui-topic', target: 'llm-data', sourceHandle: 'value', targetHandle: 'topic', animated: true, type: 'gradient' },
    { id: 'e-opts-llm', source: 'ui-options', target: 'llm-data', sourceHandle: 'value', targetHandle: 'options', animated: true, type: 'gradient' },
    { id: 'e-llm-chart', source: 'llm-data', target: 'fn-chart', sourceHandle: 'data', targetHandle: 'data', animated: true, type: 'gradient' },
    { id: 'e-topic-chart', source: 'ui-topic', target: 'fn-chart', sourceHandle: 'value', targetHandle: 'topic', animated: true, type: 'gradient' },
    { id: 'e-chart-out', source: 'fn-chart', target: 'output-chart', sourceHandle: '__html', targetHandle: '__html', animated: true, type: 'gradient' },
  ],
}
